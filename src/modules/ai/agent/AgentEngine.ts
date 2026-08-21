// ============================================================
// AgentEngine — orkestrator AI Network Agent.
//
// Alur utama (untuk semua intent yang memutasi):
//   intent(natural language) → plan (ActionPlan)
//   → permission gate → transaction.begin()
//   → eksekusi tiap action via tool registry (validasi typed)
//   → verifikasi expectedEffect via VerificationEngine
//   → gagal → rollback seluruh transaksi
//   → sukses → commit
//
// LLM tidak pernah menyentuh engine/canvas langsung; tool registry
// adalah satu-satunya pintu. Semua output LLM = input UNTRUSTED.
// ============================================================

import type { NetworkSimulator } from '../../../engine/net/core/NetworkSimulator';
import type { VendorDispatcher } from '../../../../packages/vendors/src/dispatcher/VendorDispatcher';
import type {
  ActionPlan,
  AiIntent,
  ExecuteOutcome,
  PlanAction,
  PlanActionResult,
  PlanOutcome,
  VerificationResult,
} from './types';
import type { AgentRuntime } from './runtime';
import { VerificationEngine } from './verification';
import { Transaction } from './transaction';
import { buildRegistry, registryMap, permissionOk } from './registry';
import { buildLabFromTemplate, topologyPlan, LAB_TEMPLATE_IDS, getLabTemplate, type LabTemplate, type LabTemplateId } from './labGenerator';
import { diagnoseConnectivity } from './diagnostics';
import { uid } from './runtime';

export interface AgentEngineOptions {
  runtime: AgentRuntime;
  /** mode izin default (App bisa mengubah via UI). */
  mode?: import('./types').AiPermissionMode;
}

/** Konteks yang dibutuhkan AI untuk memanggil tool. */
export interface AgentCallCtx {
  /** narasi tujuan (untuk jejak). */
  goal: string;
  /** alasan pemanggilan (narasi). */
  reason?: string;
  /** actionId saat ini (jejak verifikasi). */
  actionId?: string;
}

export class AgentEngine {
  readonly verification: VerificationEngine;
  readonly runtime: AgentRuntime;
  private mode: import('./types').AiPermissionMode;
  private tools = buildRegistry();
  private toolMap = registryMap(this.tools);
  private tx: Transaction;

  constructor(opts: AgentEngineOptions) {
    this.runtime = opts.runtime;
    this.verification = new VerificationEngine(this.runtime.sim);
    this.mode = opts.mode ?? 'read_only';
    this.tx = new Transaction(this.runtime, this.verification);
  }

  get permissionMode(): import('./types').AiPermissionMode {
    return this.mode;
  }

  setPermissionMode(mode: import('./types').AiPermissionMode): void {
    this.mode = mode;
  }

  listTools(): Array<{ name: string; description: string; kind: string; permission: string; mutating: boolean; params: Record<string, string> }> {
    return this.tools.map((t) => ({ name: t.name, description: t.description, kind: t.kind, permission: t.permission, mutating: t.mutating, params: t.params }));
  }

  /** Ambil tool dari registry (read tools boleh kapan saja). */
  private requireTool(name: string) {
    const t = this.toolMap.get(name);
    return t ?? null;
  }

  /** Eksekusi satu tool dengan permission gate. */
  callTool(name: string, params: Record<string, unknown>, ctx: AgentCallCtx) {
    const tool = this.requireTool(name);
    if (!tool) {
      return { ok: false, message: `Tool tidak dikenal: ${name}`, error: 'unknown-tool' };
    }
    if (tool.mutating && !permissionOk(tool, this.mode)) {
      return {
        ok: false,
        message: `Tool "${name}" adalah mutasi (${tool.permission}); mode saat ini "${this.mode}". Ganti mode ke propose/execute, atau minta persetujuan.`,
        error: 'permission-denied',
      };
    }
    return tool.execute(params, {
      runtime: this.runtime,
      verification: this.verification,
      actionId: ctx.actionId,
      reason: ctx.reason,
    });
  }

  // ── Intent parsing ──────────────────────────────────────────

  private detectIntent(input: string): AiIntent {
    const s = input.toLowerCase();
    if (/lab|praktikum|template|generate|buat lab|scenario/.test(s)) return 'lab_generation';
    if (/apa itu|jelaskan|explain|bagaimana cara|materi|belajar|tutorial/.test(s)) return 'learn';
    if (/buat (topologi|device|router|switch)|tambahkan (device|router|switch|pc)|tambah (router|switch)|buatkan (jaringan|topologi)|hapus|hubung|sambung|kabel/.test(s)) return 'topology_creation';
    if (/config|konfigur|set ip|ip address|route|vlan|ospf|bgp|dhcp|nat|firewall|wireless|trunk/.test(s)) return 'configuration';
    if (/kenapa|mengapa|tidak bisa|gagal|troubleshoot|masalah|diagnos|error/.test(s)) return 'diagnosis';
    if (/perbaiki|fix|repair|solve/.test(s)) return 'fix';
    if (/verifikasi|verify|cek koneksi|ping|test/.test(s)) return 'verification';
    return 'unknown';
  }

  /** Ubah input natural language → plan (tanpa eksekusi). */
  plan(input: string, modeOverride?: import('./types').AiPermissionMode): PlanOutcome {
    const mode = modeOverride ?? this.mode;
    const intent = this.detectIntent(input);
    const goal = input.trim();

    // intent yang tidak membutuhkan mutasi → jawaban langsung
    if (intent === 'learn' || intent === 'explain') {
      return { ok: true, intent, plan: null, message: 'Mode belajar: gunakan AI Mentor untuk materi/penjelasan.' };
    }
    if (intent === 'verification') {
      return { ok: true, intent, plan: null, message: 'Mode verifikasi: jalankan tool verify_ping / verify_route / dst. untuk memeriksa state nyata.' };
    }
    if (intent === 'diagnosis') {
      return { ok: true, intent, plan: null, message: 'Mode diagnosis: gunakan tool diagnose / diagnose_connectivity.' };
    }
    if (intent === 'unknown') {
      return { ok: false, intent, plan: null, message: 'Tidak memahami maksud. Contoh: "buat lab OSPF 3 router", "konfigurasi IP di R1", "kenapa ping ke 10.0.0.2 gagal?"' };
    }

    if (intent === 'lab_generation') {
      return this.planLab(input, mode);
    }

    // topology_creation / configuration / fix → plan dari LLM (jika tersedia)
    // Fallback deterministik: intent parsing sederhana
    return this.planFallback(input, mode);
  }

  private planLab(input: string, mode: import('./types').AiPermissionMode): PlanOutcome {
    const s = input.toLowerCase();
    let templateId: LabTemplateId | null = null;
    if (/ospf/.test(s)) templateId = 'ospf-3-router';
    else if (/vlan/.test(s)) templateId = 'vlan-basic';
    else if (/nat|internet/.test(s)) templateId = 'nat-internet';
    else if (/dhcp/.test(s)) templateId = 'dhcp-server';
    else if (/bgp/.test(s)) templateId = 'bgp-2-as';
    else if (/eigrp/.test(s)) templateId = 'eigrp-3-router';
    else if (/vrrp|redundan/.test(s)) templateId = 'vrrp-2-router';
    else if (/ipv6|slaac|v6/.test(s)) templateId = 'ipv6-slaac';
    else if (/wireless|wifi/.test(s)) templateId = 'wireless-2-ap';
    if (!templateId) {
      return { ok: false, intent: 'lab_generation', plan: null, message: `Template lab tidak dikenal. Tersedia: ${LAB_TEMPLATE_IDS.join(', ')}` };
    }

    const template = getLabTemplate(templateId) as LabTemplate;
    const seed = templateId;
    const lab = buildLabFromTemplate(templateId, seed);
    const actions: PlanAction[] = [
      ...topologyPlan(template, seed),
      ...Object.entries(template.setupCommands).flatMap(([dev, cmds]): PlanAction[] =>
        cmds.map((cmd, i) => ({
          id: uid('act-cli', `${seed}-${dev}-${i}`),
          type: 'execute_cli',
          target: dev,
          params: { deviceId: dev, command: cmd },
          reason: `Lab ${template.name}: setup ${dev}`,
          expectedEffect: `konfigurasi ${dev} terpasang: ${cmd.slice(0, 60)}`,
          risk: 'low',
          validation: 'command vendor valid',
        }))
      ),
    ];
    return {
      ok: true,
      intent: 'lab_generation',
      plan: {
        id: uid('plan', seed),
        goal: `Buat lab ${template.name} (${lab.tasks.length} tugas)`,
        mode,
        actions,
      },
      message: `Rencana lab "${template.name}": ${actions.length} aksi (topologi + konfigurasi). Eksekusi untuk membangun.`,
    };
  }

  /** Fallback deterministik untuk request konfigurasi/topologi sederhana.
   *  Regex memakai input asli (bukan lowercase) + flag `i` agar nama
   *  perangkat mempertahankan huruf besar (mis. "R1" ≠ "r1"). */
  private planFallback(input: string, mode: import('./types').AiPermissionMode): PlanOutcome {
    const s = input.trim();
    const actions: PlanAction[] = [];

    // pola: konfigurasi IP <interface> <CIDR> di <device>
    let m = s.match(/konfigurasi\s+ip\s+(\S+)\s+(\S+)\s+di\s+(\S+)/i) ?? s.match(/set\s+ip\s+(\S+)\s+(\S+)\s+di\s+(\S+)/i);
    if (m) {
      actions.push({
        id: uid('act-ip'),
        type: 'configure_ip_address',
        target: m[3],
        params: { deviceId: m[3], interface: m[1], address: m[2] },
        reason: `pasang IP ${m[2]} di ${m[1]} ${m[3]}`,
        expectedEffect: `interface ${m[1]} ${m[3]} memiliki IP ${m[2]}`,
        risk: 'medium',
        validation: 'CIDR valid; interface ada',
      });
    }

    m = s.match(/route\s+(\S+)\s+(?:via|gateway)\s+(\S+)\s+di\s+(\S+)/i) ?? s.match(/tambah\s+route\s+(\S+)\s+(?:via|gateway)\s+(\S+)\s+di\s+(\S+)/i);
    if (m) {
      actions.push({
        id: uid('act-route'),
        type: 'configure_route',
        target: m[3],
        params: { deviceId: m[3], dst: m[1], gateway: m[2] },
        reason: `rute statis ${m[1]} via ${m[2]} di ${m[3]}`,
        expectedEffect: `rute ${m[1]} via ${m[2]} terpasang di ${m[3]}`,
        risk: 'medium',
        validation: 'dst CIDR valid',
      });
    }

    m = s.match(/buat\s+(router|switch|firewall|pc|server|wireless)\s+(\S+)/i) ?? s.match(/tambah\s+(router|switch|firewall|pc|server|wireless)\s+(\S+)/i);
    if (m) {
      actions.push({
        id: uid('act-dev'),
        type: 'create_device',
        target: m[2],
        params: { type: m[1] as never, vendor: 'mikrotik', name: m[2] },
        reason: `buat perangkat ${m[2]} (${m[1]})`,
        expectedEffect: `${m[2]} tersedia di canvas`,
        risk: 'low',
        validation: 'type valid',
      });
    }

    // pola: hubungkan/kabel X dan Y (atau X dengan Y)
    m = s.match(/hubungkan?\s+(\S+)\s+(?:dan|dengan|ke|↔|--)\s+(\S+)/i) ?? s.match(/sambung(?:kan)?\s+(\S+)\s+(?:dan|dengan|ke|↔|--)\s+(\S+)/i) ?? s.match(/kabel(?:kan)?\s+(\S+)\s+(?:dan|dengan|ke|↔|--)\s+(\S+)/i);
    if (m) {
      actions.push({
        id: uid('act-link'),
        type: 'connect_devices',
        target: m[1],
        params: { sourceDeviceId: m[1], targetDeviceId: m[2] },
        reason: `hubungkan ${m[1]} dan ${m[2]}`,
        expectedEffect: `kabel ${m[1]} ↔ ${m[2]} terpasang`,
        risk: 'low',
        validation: 'kedua device ada; port tersedia',
      });
    }

    // pola: hapus device X
    m = s.match(/hapus\s+(?:device\s+)?(?:router|switch|firewall|pc|server|wireless|host)\s+(\S+)/i) ?? s.match(/hapus\s+(?:device\s+)?(\S+)/i);
    if (m && !/ip|route|vlan|kabel/.test(s.toLowerCase())) {
      actions.push({
        id: uid('act-del'),
        type: 'delete_device',
        target: m[1],
        params: { deviceId: m[1] },
        reason: `hapus perangkat ${m[1]}`,
        expectedEffect: `${m[1]} tidak ada lagi di canvas`,
        risk: 'medium',
        validation: 'device ada',
      });
    }

    if (actions.length === 0) {
      return { ok: false, intent: 'configuration', plan: null, message: 'Pola tidak dikenali. Coba: "konfigurasi IP ether1 10.0.0.1/24 di R1", "route 0.0.0.0/0 via 10.0.0.254 di R1", "hubungkan R1 dan R2", "buat lab OSPF 3 router".' };
    }

    return {
      ok: true,
      intent: 'configuration',
      plan: { id: uid('plan'), goal: input, mode, actions },
      message: `Rencana: ${actions.length} aksi. Eksekusi untuk menerapkan.`,
    };
  }

  // ── Eksekusi plan ───────────────────────────────────────────

  private buildExecCtx(action: PlanAction): AgentCallCtx {
    return { goal: action.reason, reason: action.reason, actionId: action.id };
  }

  /** Jalankan satu action (tool lookup + validation + execute). */
  private runAction(action: PlanAction): PlanActionResult {
    const toolName = action.type;
    const tool = this.toolMap.get(toolName);
    if (!tool) {
      return { actionId: action.id, type: action.type, ok: false, message: `Tidak ada tool untuk "${toolName}"`, error: 'unknown-tool' };
    }
    if (tool.mutating && !permissionOk(tool, this.mode)) {
      return { actionId: action.id, type: action.type, ok: false, message: `Diblokir mode "${this.mode}" (butuh ${tool.permission})`, error: 'permission-denied' };
    }
    const res = tool.execute(action.params, this.runtimeSafeCtx(action));
    if (res.unsupported) {
      return { actionId: action.id, type: action.type, ok: false, message: `Tidak didukung vendor/engine: ${res.message}`, error: 'unsupported' };
    }
    return { actionId: action.id, type: action.type, ok: res.ok, message: res.message, error: res.error };
  }

  private runtimeSafeCtx(action: PlanAction): import('./types').ToolExecCtx {
    return {
      runtime: this.runtime,
      verification: this.verification,
      actionId: action.id,
      reason: action.reason,
    };
  }

  /** Verifikasi efek yang diharapkan setelah action. */
  private verifyAction(action: PlanAction): VerificationResult | null {
    const expected = action.expectedEffect?.toLowerCase() ?? '';
    const target = action.target;
    if (!target) return null;

    // Resolusi nama → id engine: target aksi berupa NAMA device (mis. 'R1'),
    // sedangkan verification.getDeviceStats dkk. membaca by-ID.
    const dev = this.runtime.sim.getDevice(target) ?? this.runtime.sim.getDeviceByName(target);
    const source = dev?.id ?? target;

    // CLI setup → verifikasi LEMAH sesuai desain (device ada; command sudah
    // lewat jalur vendor). Verifikasi kuat ada di grading lab — expectedEffect
    // execute_cli mengutip isi command ("/ip address add … interface=ether2")
    // sehingga pencocokan keyword memicu verifyInterface dengan iface tebakan
    // ('ether1') yang tidak mencerminkan command → rollback palsu.
    if (action.type === 'execute_cli') {
      return this.verification.verifyDeviceExists(source, action.id);
    }

    // Word-boundary match, BUKAN substring includes(): 'route' adalah substring
    // dari 'router' — expectedEffect create_device "… dengan type router"
    // memicu verifikasi rute yang pasti gagal (route-not-found) → rollback
    // seluruh lab padahal aksi sukses (bug audit 19 test S4.x/S12.1).
    const has = (kw: string): boolean => new RegExp(`\\b${kw}\\b`).test(expected);

    if (has('ip') || has('address')) {
      // verifikasi rute/ARP pasang IP — cek interface + IP yang diharapkan
      const addr = String(action.params['address'] ?? action.params['ip'] ?? '');
      return this.verification.verifyInterface({
        source,
        iface: String(action.params['interface'] ?? 'ether1'),
        ip: addr || undefined,
        actionId: action.id,
      });
    }
    if (has('rute') || has('route')) {
      return this.verification.verifyRoute({ source, dst: String(action.params['dst'] ?? '0.0.0.0/0'), actionId: action.id });
    }
    if (has('adjacency') || has('ospf')) {
      return this.verification.verifyOspf({ source, actionId: action.id });
    }
    if (has('bgp')) {
      return this.verification.verifyBgp({ source, actionId: action.id });
    }
    if (has('eigrp')) {
      return this.verification.verifyEigrp({ source, actionId: action.id });
    }
    if (has('vrrp') || has('fhrp') || has('master')) {
      const info = this.runtime.sim.getFhrpInfo(source) ?? [];
      return this.verification.recordFrom({
        success: info.some((s) => s.isMaster),
        testType: 'fhrp',
        source: dev?.name ?? target,
        reason: info.some((s) => s.isMaster) ? undefined : 'not-master',
        evidence: info.map((s) => `group ${s.vip} priority=${s.priority} ${s.isMaster ? 'MASTER' : 'backup'}`),
        actionId: action.id,
      });
    }
    if (has('ipv6') || has('v6')) {
      const info = this.runtime.sim.getIpv6Info(source);
      return this.verification.recordFrom({
        success: !!info && info.addresses.length > 0,
        testType: 'ndp',
        source: dev?.name ?? target,
        reason: info && info.addresses.length > 0 ? undefined : 'no-ipv6-address',
        evidence: info ? info.addresses.map((a) => `${a.address}/${a.prefix}@${a.iface}`) : [],
        actionId: action.id,
      });
    }
    if (has('vlan')) {
      return this.verification.verifyVlan({ source, actionId: action.id });
    }
    if (has('dhcp') || has('lease')) {
      return this.verification.verifyDhcp({ source, actionId: action.id });
    }
    if (has('nat')) {
      return this.verification.verifyNat({ source, actionId: action.id });
    }
    if (has('kabel') || has('terhubung')) {
      const link = expected.match(/kabel\s+(\S+)\s*↔\s*(\S+)/);
      if (link) return this.verification.verifyLink(link[1], link[2], action.id, 'link exists');
      return null;
    }
    if (has('canvas') || has('tersedia')) {
      return this.verification.verifyDeviceExists(source, action.id);
    }
    if (has('firewall')) {
      return this.verification.verifyFirewall({ source, actionId: action.id });
    }
    if (has('wireless')) {
      return this.verification.verifyWireless({ source, actionId: action.id });
    }
    if (has('konfigurasi') || has('terpasang')) {
      // CLI setup: verifikasi lemah — device ada & command sudah lewat jalur vendor.
      // Verifikasi kuat ada di grading lab (state nyata engine).
      return this.verification.verifyDeviceExists(target, action.id);
    }
    return null;
  }

  /** Eksekusi plan penuh dengan transaksi + verifikasi per action. */
  executePlan(plan: ActionPlan): ExecuteOutcome {
    const tx = this.tx;
    const results: PlanActionResult[] = [];
    const verifications: VerificationResult[] = [];

    if (plan.actions.length === 0) {
      return { ok: false, planId: plan.id, goal: plan.goal, mode: plan.mode, results, verifications, rolledBack: false, message: 'Plan kosong.', verifiedCount: 0, failedCount: 0 };
    }

    // permission gate di tingkat plan — mode plan, bukan mode engine saat ini
    // (plan dibuat dengan mode tertentu dan dieksekusi sesuai mode itu).
    const mutating = plan.actions.some((a) => this.toolMap.get(a.type)?.mutating === true);
    if (mutating && plan.mode !== 'execute') {
      return {
        ok: false,
        planId: plan.id,
        goal: plan.goal,
        mode: plan.mode,
        results: plan.actions.map((a) => ({ actionId: a.id, type: a.type, ok: false, message: `Plan berisi mutasi; mode "${plan.mode}" menolak.`, error: 'permission-denied' })),
        verifications,
        rolledBack: false,
        message: `Plan ditolak: mode "${plan.mode}" tidak mengizinkan mutasi.`,
        verifiedCount: 0,
        failedCount: plan.actions.length,
      };
    }

    tx.begin();

    for (const action of plan.actions) {
      const res = this.runAction(action);
      results.push(res);

      // verifikasi efek yang diharapkan (tidak wajib — beberapa aksi tidak punya verifikasi)
      const vr = this.verifyAction(action);
      if (vr) {
        verifications.push(vr);
        results[results.length - 1].verification = vr;
        results[results.length - 1].verificationFailed = !vr.success;
      }

      const actionFailed = !res.ok || (vr !== null && !vr.success);
      if (actionFailed) {
        const rolledBack = tx.rollback();
        return {
          ok: false,
          planId: plan.id,
          goal: plan.goal,
          mode: plan.mode,
          results,
          verifications,
          rolledBack,
          message: `Gagal di aksi "${action.type}" (${res.message}${vr && !vr.success ? `; verifikasi: ${vr.reason ?? 'effect-mismatch'}` : ''}). ${rolledBack ? 'Seluruh perubahan di-rollback.' : 'Rollback tidak berhasil!'}`,
          verifiedCount: 0,
          failedCount: results.filter((r) => !r.ok || r.verificationFailed).length,
        };
      }
    }

    // transaksi sukses → commit
    tx.commit();

    const failed = results.filter((r) => !r.ok || r.verificationFailed).length;
    const verifiedCount = verifications.filter((v) => v.success).length;
    return {
      ok: failed === 0,
      planId: plan.id,
      goal: plan.goal,
      mode: plan.mode,
      results,
      verifications,
      rolledBack: false,
      message: failed === 0
        ? `Plan selesai: ${results.length} aksi sukses, ${verifications.length} verifikasi (${verifiedCount} sukses).`
        : `Plan selesai dengan ${failed} kegagalan.`,
      verifiedCount,
      failedCount: failed,
    };
  }

  // ── Satu pintu masuk dari chat ──────────────────────────────

  /**
   * API utama untuk chat: input → intent → plan → execute (jika mode
   * execute) → hasil terstruktur.
   */
  handle(input: string, modeOverride?: import('./types').AiPermissionMode): PlanOutcome & { execution?: ExecuteOutcome } {
    const mode = modeOverride ?? this.mode;
    const out = this.plan(input, mode);
    if (!out.ok || !out.plan) return out;

    if (mode === 'execute') {
      const execution = this.executePlan(out.plan);
      return { ...out, execution };
    }
    return { ...out, execution: undefined };
  }

  /** Diagnosa koneksi spesifik (tool diagnose_connectivity). */
  diagnoseConnectivity(source: string, destination: string) {
    return diagnoseConnectivity(this.runtime.sim, this.verification, { source, destination });
  }
}