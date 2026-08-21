// ============================================================
// VerificationEngine — SHARED verification untuk seluruh NetLab.
//
// Prinsip: AI verification TIDAK membuat implementasi ping sendiri.
// Semua verifikasi memakai API simulation yang SAMA dengan
// Ping Tools / Terminal / Grading:
//
//   simulatePing / simulatePing6 / simulateTraceroute /
//   simulateTcpConnect → NetworkSimulator → VerificationResult
//
// Satu result model dipakai oleh: AI Mentor, Grading Engine,
// Packet Inspector, Diagnostic Engine.
// ============================================================

import type { NetworkSimulator } from '../../../engine/net/core/NetworkSimulator';
import type { PingSimResult } from '../../../engine/net/compat';
import { parseCidr, isValidIp } from '../../../engine/net/core/ip';
import { isIpv6Address } from '../../../engine/net/core/ipv6';
import {
  pingResultToVerification,
  tracerouteToVerification,
  tcpToVerification,
  VerificationResult,
  VerificationHistoryEntry,
} from './types';

export interface VerifyParams {
  source: string;
  destination?: string;
  /** port untuk verify_tcp. */
  port?: number;
  /** dst CIDR untuk verify_route / verify_vlan. */
  cidr?: string;
  /** interface untuk verify_vlan / verify_arp. */
  iface?: string;
  /** actionId pemilik verifikasi. */
  actionId?: string;
  /** label tampilan untuk riwayat. */
  label?: string;
}

export class VerificationEngine {
  private history: VerificationHistoryEntry[] = [];
  private seq = 0;

  constructor(readonly sim: NetworkSimulator) {}

  // ── Ping / L4 (melalui engine — jalur SAMA dengan Ping Tools) ──

  verifyPing(params: VerifyParams): VerificationResult {
    const r = this.sim.simulatePing(params.source, params.destination || '');
    const vr = pingResultToVerification(r, params.source, params.destination || '', 'ping');
    return this.record(vr, params);
  }

  verifyPing6(params: VerifyParams): VerificationResult {
    const r = this.sim.simulatePing6(params.source, params.destination || '');
    const vr = pingResultToVerification(r, params.source, params.destination || '', 'ping6');
    return this.record(vr, params);
  }

  verifyTraceroute(params: VerifyParams): VerificationResult {
    const r = this.sim.simulateTraceroute(params.source, params.destination || '');
    const vr = tracerouteToVerification(r, params.source, params.destination || '');
    return this.record(vr, params);
  }

  verifyTcp(params: VerifyParams): VerificationResult {
    const r = this.sim.simulateTcpConnect(params.source, params.destination || '', params.port ?? 80);
    const vr = tcpToVerification(r, params.source, params.destination || '', params.port ?? 80);
    return this.record(vr, params);
  }

  /** Verifikasi situs web: TCP handshake sukses DAN server menyajikan konten HTML. */
  verifyHttp(params: VerifyParams): VerificationResult {
    const dst = params.destination || '';
    const port = params.port ?? 80;
    const r = this.sim.simulateTcpConnect(params.source, dst, port);
    const body = r.body ?? '';
    const success = r.ok === true && body.trim().length > 0;
    const vr: VerificationResult = {
      success,
      testType: 'tcp',
      source: params.source,
      destination: dst,
      reason: !r.ok ? (r.reason ?? 'tcp-fail') : body.trim().length === 0 ? 'empty-body' : undefined,
      evidence: r.ok
        ? [`HTTP 200 — ${body.trim().length} byte konten`, `judul: ${(body.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '').trim() || '(tanpa <title>)'}`]
        : [`TCP gagal: ${r.reason ?? 'unknown'}`],
      timestamp: Date.now(),
      actionId: params.actionId,
    };
    return this.record(vr, params);
  }

  /** ping otomatis: IPv6 bila dst alamat v6, selain itu IPv4. */
  verifyAutoPing(params: VerifyParams): VerificationResult {
    const dst = params.destination || '';
    if (isIpv6Address(dst)) return this.verifyPing6(params);
    return this.verifyPing(params);
  }

  // ── State inspection (state AKTUAL engine) ─────────────────────

  verifyRoute(params: VerifyParams & { dst: string }): VerificationResult {
    const stats = this.sim.getDeviceStats(params.source);
    const dst = params.dst;
    const routes = stats?.routes || [];
    const hit = routes.find((r) => r.dst === dst);
    const evidence = routes.map((r) => `${r.dst} via ${r.gateway ?? '-'} (${r.kind})${r.active === false ? ' inactive' : ''}`);
    return this.record(
      {
        success: !!hit,
        testType: 'route',
        source: stats?.name || params.source,
        destination: dst,
        reason: hit ? undefined : 'route-not-found',
        evidence,
        timestamp: Date.now(),
      },
      params
    );
  }

  /** Route terbaik (LPM) untuk sebuah IP tujuan. */
  verifyRouteTo(params: VerifyParams): VerificationResult {
    const stats = this.sim.getDeviceStats(params.source);
    const dstIp = params.destination || '';
    const routes = stats?.routes || [];
    let best: { dst: string; gateway: string | null; kind: string } | null = null;
    for (const r of routes) {
      const p = parseCidr(r.dst);
      if (!p || p.prefix === 0) {
        if (!best || r.dst === '0.0.0.0/0') best = r as typeof best;
        continue;
      }
      if (inCidr(dstIp, r.dst)) {
        if (!best) best = r as typeof best;
        else {
          const bp = parseCidr(best.dst);
          if (!bp || p.prefix > bp.prefix) best = r as typeof best;
        }
      }
    }
    return this.record(
      {
        success: !!best,
        testType: 'route',
        source: stats?.name || params.source,
        destination: dstIp,
        reason: best ? undefined : 'no-route-to-host',
        evidence: best ? [`${best.dst} via ${best.gateway ?? '-'} (${best.kind})`] : routes.map((r) => `${r.dst} via ${r.gateway ?? '-'}`),
        timestamp: Date.now(),
      },
      params
    );
  }

  verifyArp(params: VerifyParams): VerificationResult {
    const stats = this.sim.getDeviceStats(params.source);
    const arp = stats?.arp || [];
    const hit = params.destination ? arp.find((a) => a.ip === params.destination) : arp[0];
    return this.record(
      {
        success: !!hit,
        testType: 'arp',
        source: stats?.name || params.source,
        destination: params.destination || '(any)',
        reason: hit ? undefined : 'arp-not-found',
        evidence: arp.map((a) => `${a.ip} → ${a.mac}`),
        timestamp: Date.now(),
      },
      params
    );
  }

  verifyNdp(params: VerifyParams): VerificationResult {
    const info = this.sim.getIpv6Info(params.source);
    const neighbors = info?.neighbors || [];
    const hit = params.destination ? neighbors.find((n) => n.ip === params.destination) : neighbors[0];
    return this.record(
      {
        success: !!hit,
        testType: 'ndp',
        source: this.deviceName(params.source),
        destination: params.destination || '(any)',
        reason: hit ? undefined : 'ndp-not-found',
        evidence: neighbors.map((n) => `${n.ip} → ${n.mac} (${n.iface})`),
        timestamp: Date.now(),
      },
      params
    );
  }

  verifyOspf(params: VerifyParams): VerificationResult {
    const neighbors = this.sim.getOspfNeighbors(params.source);
    const full = neighbors.filter((n) => n.state === 'Full');
    return this.record(
      {
        success: full.length > 0,
        testType: 'ospf',
        source: this.deviceName(params.source),
        reason: full.length > 0 ? undefined : 'no-full-adjacency',
        evidence: neighbors.map((n) => `${n.routerId} ${n.state} (${n.iface})`),
        timestamp: Date.now(),
      },
      params
    );
  }

  verifyBgp(params: VerifyParams): VerificationResult {
    const peers = this.sim.getBgpNeighborStates(params.source);
    const established = peers.filter((p) => p.state === 'Established');
    const target = params.destination
      ? peers.find((p) => p.remoteAddr === params.destination)
      : established[0];
    return this.record(
      {
        success: !!target && target.state === 'Established',
        testType: 'bgp',
        source: this.deviceName(params.source),
        destination: params.destination || '(all peers)',
        reason: target ? (target.state === 'Established' ? undefined : `state=${target.state}`) : 'no-peer',
        evidence: peers.map((p) => `${p.remoteAddr} AS${p.remoteAs} ${p.state} (${p.prefixes} prefixes)`),
        timestamp: Date.now(),
      },
      params
    );
  }

  verifyEigrp(params: VerifyParams): VerificationResult {
    const info = this.sim.getEigrpInfo(params.source);
    const neighbors = info?.neighbors || [];
    const success = neighbors.length > 0 && info.topology.some((t) => t.state === 'passive');
    return this.record(
      {
        success,
        testType: 'eigrp',
        source: this.deviceName(params.source),
        reason: success ? undefined : 'no-eigrp-neighbor',
        evidence: [
          ...neighbors.map((n) => `neighbor ${n.neighborId} ${n.ip}@${n.iface}`),
          ...info.topology.map((t) => `${t.dst} via ${t.successor ?? '—'} fd=${t.fd} rd=${t.rd} state=${t.state}`),
        ],
        timestamp: Date.now(),
      },
      params
    );
  }

  verifyVlan(params: VerifyParams & { vlanId?: number; trunk?: string }): VerificationResult {
    const vlanMap = this.sim.getNodePortVlans(params.source);
    const trunks = this.sim.getNodeTrunkPorts(params.source);
    const evidence: string[] = [];
    for (const [iface, vlan] of vlanMap) evidence.push(`${iface} access VLAN ${vlan}`);
    for (const t of trunks) evidence.push(`${t} trunk`);

    let ok = evidence.length > 0;
    if (params.vlanId != null) ok = [...vlanMap.values()].includes(params.vlanId);
    if (params.trunk) ok = trunks.has(params.trunk);

    return this.record(
      {
        success: ok,
        testType: 'vlan',
        source: this.deviceName(params.source),
        destination: params.vlanId != null ? `VLAN ${params.vlanId}` : undefined,
        reason: ok ? undefined : 'vlan-config-missing',
        evidence,
        timestamp: Date.now(),
      },
      params
    );
  }

  verifyDhcp(params: VerifyParams & { iface?: string }): VerificationResult {
    const lease = this.sim.getLeaseFor(params.source);
    const leases = this.sim.getLeases();
    const hit = params.iface
      ? leases.find((l) => l.nodeId === params.source && l.poolNodeId === params.iface)
      : lease;
    return this.record(
      {
        success: !!hit,
        testType: 'dhcp',
        source: this.deviceName(params.source),
        reason: hit ? undefined : 'no-lease',
        evidence: leases.filter((l) => l.nodeId === params.source).map((l) => `${l.ip}/${l.prefix} gw=${l.gateway} pool=${l.poolNodeId}`),
        timestamp: Date.now(),
      },
      params
    );
  }

  verifyNat(params: VerifyParams): VerificationResult {
    const rules = this.sim.getNodeNats(params.source);
    const evidence = rules.map((r) => `chain=${r.chain} action=${r.action}${r.outInterface ? ` out=${r.outInterface}` : ''}${r.dstAddress ? ` dst=${r.dstAddress}` : ''}`);
    return this.record(
      {
        success: rules.length > 0,
        testType: 'nat',
        source: this.deviceName(params.source),
        reason: rules.length > 0 ? undefined : 'no-nat-rule',
        evidence,
        timestamp: Date.now(),
      },
      params
    );
  }

  verifyFirewall(params: VerifyParams): VerificationResult {
    const rules = this.sim.getNodeAcls(params.source);
    const evidence = rules.map((r) => `${r.action} ${r.proto ?? '*'} ${r.src ?? '*'} → ${r.dst ?? '*'}${r.dstPort ? `:${r.dstPort}` : ''}`);
    return this.record(
      {
        success: rules.length > 0,
        testType: 'firewall',
        source: this.deviceName(params.source),
        reason: rules.length > 0 ? undefined : 'no-firewall-rule',
        evidence,
        timestamp: Date.now(),
      },
      params
    );
  }

  verifyWireless(params: VerifyParams & { ssid?: string }): VerificationResult {
    const info = this.sim.getWirelessInfo(params.source);
    const associations = info?.associations || [];
    const hit = params.ssid ? associations.some((a) => a.ssid === params.ssid) : associations.length > 0;
    return this.record(
      {
        success: !!info && hit,
        testType: 'wireless',
        source: this.deviceName(params.source),
        reason: !info ? 'no-wireless' : hit ? undefined : 'no-association',
        evidence: info
          ? [
              `mode=${info.mode} ssid=${info.ssid || '-'} security=${info.security || '-'}`,
              ...associations.map((a) => `${a.name} (${a.mac}) signal=${a.signal}`),
            ]
          : [],
        timestamp: Date.now(),
      },
      params
    );
  }

  verifyInterface(params: VerifyParams & { iface: string; ip?: string }): VerificationResult {
    const stats = this.sim.getDeviceStats(params.source);
    const iface = stats?.interfaces.find((i) => i.name === params.iface);
    let ipMatch = true;
    if (params.ip) {
      ipMatch = (iface?.ip || '').split(',').map((s) => s.trim()).includes(params.ip) ||
        (iface?.ip || '') === params.ip;
    }
    const success = !!iface && iface.up && ipMatch;
    return this.record(
      {
        success,
        testType: 'interface',
        source: stats?.name || params.source,
        destination: params.iface,
        reason: !iface ? 'interface-not-found' : iface.up && ipMatch ? undefined : ipMatch ? `state=${iface.operational}` : `ip-mismatch (expected ${params.ip})`,
        evidence: iface ? [`${iface.name} ${iface.ip || 'no-ip'} up=${iface.up} operational=${iface.operational}`] : [],
        timestamp: Date.now(),
      },
      params
    );
  }

  /** Verifikasi efek topology: link ada antara dua device (nama ATAU id). */
  verifyLink(nodeA: string, nodeB: string, actionId?: string, label = 'link exists'): VerificationResult {
    const links = this.sim.topology.links.all;
    const aId = this.sim.getDevice(nodeA)?.id ?? this.sim.getDeviceByName(nodeA)?.id ?? nodeA;
    const bId = this.sim.getDevice(nodeB)?.id ?? this.sim.getDeviceByName(nodeB)?.id ?? nodeB;
    const aName = this.sim.getDevice(aId)?.name ?? nodeA;
    const bName = this.sim.getDevice(bId)?.name ?? nodeB;
    const hit = links.some(
      (l) =>
        (l.a.nodeId === aId && l.b.nodeId === bId) ||
        (l.a.nodeId === bId && l.b.nodeId === aId)
    );
    return this.record(
      {
        success: hit,
        testType: 'topology',
        source: aName,
        destination: bName,
        reason: hit ? undefined : 'link-not-found',
        evidence: links.map((l) => `${l.a.nodeId}:${l.a.port} ↔ ${l.b.nodeId}:${l.b.port}`),
        timestamp: Date.now(),
        actionId,
      },
      { source: aName, destination: bName, actionId, label }
    );
  }

  /** Verifikasi device ada di engine (id atau nama). */
  verifyDeviceExists(nodeId: string, actionId?: string): VerificationResult {
    const dev = this.sim.getDevice(nodeId) ?? this.sim.getDeviceByName(nodeId);
    return this.record(
      {
        success: !!dev,
        testType: 'topology',
        source: nodeId,
        reason: dev ? undefined : 'device-not-found',
        evidence: dev ? [`device ${dev.name} (${dev.deviceType}) present`] : [],
        timestamp: Date.now(),
        actionId,
      },
      { source: nodeId, actionId, label: `device ${nodeId} exists` }
    );
  }

  // ── Riwayat ───────────────────────────────────────────────────

  /** Catat hasil verifikasi buatan (dipakai verifyAction & tool lain). */
  recordFrom(vr: Omit<VerificationResult, 'timestamp' | 'evidence'> & { evidence?: string[]; actionId?: string; label?: string }): VerificationResult {
    const full: VerificationResult = {
      ...vr,
      evidence: vr.evidence ?? [],
      timestamp: Date.now(),
    };
    return this.record(full, {
      source: full.source ?? '',
      destination: full.destination,
      actionId: vr.actionId,
      label: vr.label,
    });
  }

  private record(vr: VerificationResult, params: VerifyParams): VerificationResult {
    const entry: VerificationHistoryEntry = {
      ...vr,
      id: `v-${++this.seq}`,
      actionId: params.actionId,
      label: params.label || `${vr.testType}${vr.source ? ` ${vr.source}` : ''}${vr.destination ? ` → ${vr.destination}` : ''}`,
    };
    this.history.push(entry);
    if (this.history.length > 200) this.history = this.history.slice(-200);
    return entry;
  }

  /** Semua riwayat verifikasi sesi (dalam urutan kejadian). */
  all(): VerificationHistoryEntry[] {
    return [...this.history];
  }

  last(n = 10): VerificationHistoryEntry[] {
    return this.history.slice(-n);
  }

  clear(): void {
    this.history = [];
  }

  /** Hapus entri milik actionId tertentu (rollback). */
  clearForAction(actionId: string): void {
    this.history = this.history.filter((h) => h.actionId !== actionId);
  }

  private deviceName(nodeId: string): string {
    return this.sim.getDevice(nodeId)?.name || nodeId;
  }
}

/** apakah IP berada dalam cidr (ipv4). */
export function inCidr(ip: string, cidr: string): boolean {
  if (!isValidIp(ip)) return false;
  const p = parseCidr(cidr);
  if (!p) return false;
  const mask = (0xffffffff << (32 - p.prefix)) >>> 0;
  const a = ipInt(ip) & mask;
  const b = ipInt(p.address) & mask;
  return a === b;
}

function ipInt(ip: string): number {
  return ip.split('.').reduce((acc, o) => (acc << 8) | parseInt(o, 10), 0) >>> 0;
}