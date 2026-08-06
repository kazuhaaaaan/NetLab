// ============================================================
// MentorEngine — facade publik AI Mentor.
// Satu titik masuk: diagnose, ask (belajar/hint/solusi), explain,
// saran command, dan rendering hasil. Hanya baca state engine.
// ============================================================

import { NetworkSimulator } from '../../engine/net/core/NetworkSimulator';
import { NetworkStateReader } from './NetworkStateReader';
import { DiagnoseEngine, DiagnoseOptions } from './DiagnoseEngine';
import { HintEngine } from './HintEngine';
import { LearnEngine } from './LearnEngine';
import { LearningEngine } from './LearningEngine';
import { ExplainEngine } from './ExplainEngine';
import { SmartCli } from './SmartCli';
import { CommandGenerator } from './CommandGenerator';
import { PromptBuilder } from './PromptBuilder';
import { AnalysisResult, MentorMode, MentorResponse, VendorId } from './types';
import { renderDiagnosis, renderResponse } from './format';

export class MentorEngine {
  readonly reader: NetworkStateReader;
  private diagnoseEngine: DiagnoseEngine;
  private hintEngine: HintEngine;
  private learnEngine: LearnEngine;
  private learning: LearningEngine;
  private explain: ExplainEngine;
  private cli = new SmartCli();
  private cmds = new CommandGenerator();
  private prompt: PromptBuilder;

  constructor(readonly sim: NetworkSimulator) {
    this.reader = new NetworkStateReader(sim);
    this.diagnoseEngine = new DiagnoseEngine(this.reader);
    this.hintEngine = new HintEngine(this.reader);
    this.learnEngine = new LearnEngine(this.reader);
    this.explain = new ExplainEngine(this.reader);
    this.prompt = new PromptBuilder(this.reader);
    this.learning = new LearningEngine(this.reader, this.diagnoseEngine);
  }

  /** Diagnosis penuh seluruh jaringan (semua kategori analyzer). */
  diagnose(opts: DiagnoseOptions = {}): AnalysisResult {
    return this.diagnoseEngine.diagnose(opts);
  }

  /**
   * Pintu masuk percakapan bebas. Menebak maksud user dari kata kunci:
   *   - "kenapa ping gagal / tidak bisa akses"  → probe + diagnose
   *   - "jelaskan ..."                          → explain
   *   - "petunjuk/bantuan/hint ..."             → hint
   *   - "belajar/ajari ..."                     → learn
   *   - "perintah/fix untuk ..."                → command suggestions
   *   - lainnya                                 → diagnosis kategori terkait
   */
  ask(input: string): MentorResponse {
    const t = input.toLowerCase();

    if (t.includes('jelaskan') || t.startsWith('explain')) {
      const routeMatch =
        input.match(/route\s+(\S+)\s+(?:dari|ke|menuju|from|to)\s+(\S+)/i) ??
        input.match(/(?:jelaskan\s+)?route\s+(\S+)\s+(\S+)/i);
      if (routeMatch) return this.explainRoute(routeMatch[1], routeMatch[2]);
      const dhcpMatch = input.match(/dhcp\s+(\S+)/i);
      if (dhcpMatch) return this.explain.explainDhcp(dhcpMatch[1]);
      // "jelaskan <topik>" tanpa device → materi belajar topik tsb
      const topic = this.topicFrom(input);
      if (topic) return this.learnEngine.guide(topic);
      return this.hintEngine.next('routing');
    }

    if (t.startsWith('route ')) {
      const routeMatch = input.match(/route\s+(\S+)\s+(?:dari|ke|menuju|from|to)\s+(\S+)/i);
      if (routeMatch) return this.explainRoute(routeMatch[1], routeMatch[2]);
    }

    if (t.includes('petunjuk') || t.includes('hint') || t.includes('bantuan') || t.includes('step') || t.includes('langkah')) {
      return this.hintEngine.next(this.topicFrom(input));
    }

    if (t.includes('belajar') || t.includes('ajari') || t.includes('learn') || t.includes('cara kerja')) {
      return this.learnEngine.guide(this.topicFrom(input));
    }

    if (t.includes('perintah') || t.includes('fix') || t.includes('command') || t.includes('perbaiki')) {
      return this.commandHelp(input);
    }

    // default: masalah konektivitas / topik tertentu
    if (t.includes('ping') || t.includes('akses') || t.includes('tidak bisa') || t.includes('gagal') || t.includes('unreachable') || t.includes('tidak terhubung')) {
      return this.connectivity(input);
    }

    return this.learning.next(this.topicFrom(input));
  }

  /** Probe dua node lalu diagnose; hasil disertai packet path visual. */
  connectivity(input: string): MentorResponse {
    const state = this.reader.read();
    const [from, to] = this.guessPair(input);
    const fromId = from ? (state.byId.has(from) ? from : this.reader.deviceIdByName(from)) : undefined;
    const toName = to ?? state.devices[1]?.name;

    const res = this.diagnoseEngine.diagnose({ probes: fromId && toName ? [{ from: fromId, to: toName }] : [] });
    const probe = res.probePaths[0];

    return {
      mode: 'diagnose',
      status: res.status,
      title: `Konektivitas: ${probe ? `${probe.from} → ${probe.to}` : 'semua pasangan'}`,
      sections: [
        ...(probe
          ? [
              {
                heading: 'Packet Path',
                lines: probe.ok
                  ? probe.path
                  : [...probe.path, `✗ ${probe.reason ?? 'unreachable'}`],
              },
            ]
          : []),
        ...res.issues.slice(0, 6).map((i) => ({
          heading: `${i.severity.toUpperCase()} · ${i.affectedDeviceName ?? ''}`,
          lines: [i.title, ...i.evidence],
        })),
      ],
      commands: res.issues.slice(0, 3).flatMap((i) => i.commands),
      confidence: res.confidence,
      packetPath: probe?.path,
      note: probe?.reason ? `Paket berhenti: ${probe.reason}` : undefined,
    };
  }

  /** Level berikutnya dari mode belajar (learn → hint → diagnose). */
  nextLesson(topic: string): MentorResponse {
    return this.learning.next(topic);
  }

  /** Catat hasil percobaan user; sukses → kembali ke mode belajar. */
  recordAttempt(topic: string, success: boolean): void {
    this.learning.recordAttempt(topic, success);
  }

  /** Level bantuan saat ini untuk topik. */
  modeOf(topic: string): string {
    return this.learning.mode(topic);
  }

  hint(topic: string): MentorResponse {
    return this.hintEngine.next(topic);
  }

  learn(topic: string): MentorResponse {
    return this.learnEngine.guide(topic);
  }

  explainRoute(device: string, dstIp: string): MentorResponse {
    return this.explain.explainRoute(device, dstIp);
  }

  explainDhcp(device: string): MentorResponse {
    return this.explain.explainDhcp(device);
  }

  explainPacket(packet: Parameters<ExplainEngine['explainPacket']>[0]): MentorResponse {
    return this.explain.explainPacket(packet);
  }

  /** Saran command untuk sebuah fixKey (lihat CommandGenerator). */
  fix(fixKey: string, vendor: VendorId = 'mikrotik'): MentorResponse {
    const commands = this.cmds.byKey(fixKey, vendor);
    return {
      mode: 'fix',
      status: 'info',
      title: `Perintah Perbaikan: ${fixKey}`,
      sections: [{ heading: 'Command', lines: commands }],
      commands: [{ vendor, commands }],
      confidence: commands.length ? 0.9 : 0.4,
    };
  }

  commandHelp(input: string): MentorResponse {
    const m = input.match(/(?:perintah|perbaiki|fix|command)\s+(?:untuk\s+)?([a-z\-\s]+)/i);
    const topic = m?.[1]?.trim() || 'default-route';
    return this.fix(this.lookupFixKey(topic));
  }

  /** Deteksi salah ketik command (Did you mean). */
  smartCli(typed: string, vendor: VendorId = 'mikrotik'): MentorResponse {
    const s = this.cli.suggest(typed, vendor);
    return {
      mode: 'smart-cli',
      status: 'info',
      title: s.best ? `Did you mean: ${s.best.command}` : 'Command Tidak Dikenali',
      sections: [
        {
          heading: 'Kandidat',
          lines: s.candidates.length
            ? s.candidates.map((c) => `${c.command}  (jarak ${c.distance})`)
            : ['Tidak ada kandidat dekat. Ketik /? untuk daftar command.'],
        },
      ],
      commands: s.best ? [{ vendor, commands: [s.best.command] }] : [],
      confidence: s.best ? 0.9 : 0.4,
    };
  }

  /** Ringkasan cepat kondisi jaringan. */
  summary(): MentorResponse {
    const res = this.diagnose();
    return {
      mode: 'diagnose',
      status: res.status,
      title: 'Ringkasan Jaringan',
      sections: [
        { heading: 'Kondisi', lines: [`${res.status === 'healthy' ? 'Sehat' : `${res.issues.filter((i) => i.severity !== 'info').length} masalah`} · ${res.issues.length} temuan total`] },
        ...res.issues.slice(0, 5).map((i) => ({ heading: `${i.severity.toUpperCase()}`, lines: [i.title] })),
      ],
      commands: [],
      confidence: res.confidence,
      note: res.note,
    };
  }

  /** Teks snapshot untuk konteks (PromptBuilder). */
  context(): string {
    return this.prompt.buildContext(this.reader.read());
  }

  /** Render diagnosis penuh (re-export dari format). */
  render(res: AnalysisResult | MentorResponse): string {
    if ('issues' in res && Array.isArray((res as AnalysisResult).issues)) {
      return renderDiagnosis(res as AnalysisResult);
    }
    return renderResponse(res as MentorResponse);
  }

  /** Mengganti mode intro: ini adalah "transcript" yang aman untuk UI. */
  toUiResponse(res: MentorResponse): MentorResponse {
    return res;
  }

  private topicFrom(input: string): string {
    const known: [RegExp, string][] = [
      [/routing|route|default/, 'routing'],
      [/dhcp|lease/, 'dhcp'],
      [/nat|masquerade/, 'nat'],
      [/dns/, 'dns'],
      [/vlan|trunk|802/, 'vlan'],
      [/firewall|acl|filter/, 'firewall'],
      [/switch|bridge|mac/, 'switch'],
      [/interface|ip address|setting ip/, 'interface'],
    ];
    const hit = known.find(([re]) => re.test(input.toLowerCase()));
    return hit ? hit[1] : 'routing';
  }

  private guessPair(input: string): [string | null, string | null] {
    const names = this.reader.read().devices.map((d) => d.name);
    const found = names.filter((n) => input.includes(n));
    return [found[0] ?? null, found[1] ?? null];
  }

  private lookupFixKey(topic: string): string {
    const t = topic.toLowerCase();
    if (t.includes('dhcp')) return 'dhcp-pool';
    if (t.includes('nat')) return 'nat-masquerade';
    if (t.includes('dns')) return 'dns-record';
    if (t.includes('vlan')) return 'vlan-trunk';
    if (t.includes('firewall') || t.includes('acl')) return 'acl-allow';
    if (t.includes('interface') || t.includes('down')) return 'iface-up';
    return 'default-route';
  }
}

export type { MentorMode };
