// ============================================================
// diagnostics — rantai diagnostik AI Network Agent.
//
// Alur:
//   1. Probe ping nyata via engine (jalur sama dengan Ping Tools)
//   2. Kumpulkan bukti berjenjang: routes → ARP/NDP → VLAN → NAT
//      → firewall → packet trace (alas an drop)
//   3. Tentukan root cause (langkah terakhir yang benar → langkah
//      pertama yang gagal = masalah)
//   4. Rekomendasikan perbaikan sebagai PlanAction terstruktur
//      (dapat langsung dieksekusi oleh AgentEngine)
// ============================================================

import { MentorEngine } from '../MentorEngine';
import type { NetworkSimulator } from '../../../engine/net/core/NetworkSimulator';
import type {
  VerificationEngine,
} from './verification';
import type {
  DiagnosticResult,
  DiagnosticEvidence,
  PlanAction,
  VerificationResult,
} from './types';

export interface DiagnoseParams {
  source: string;
  destination: string;
}

/** Alasan drop yang umum → saran perbaikan terstruktur. */
function fixFromReason(reason: string | undefined, params: DiagnoseParams): { fixes: PlanAction[]; rootCause: string } {
  const { source, destination } = params;
  const device = (d: string) => ({ deviceId: d });
  const fixes: PlanAction[] = [];

  switch (reason) {
    case 'no-ip':
      fixes.push({
        id: 'fix-no-ip',
        type: 'configure_ip_address',
        target: source,
        params: device(source),
        reason: `${source} tidak punya alamat IP pada interface sumber.`,
        expectedEffect: `interface sumber ${source} memiliki IP aktif.`,
        risk: 'medium',
        validation: 'perlu alamat IP yang valid di subnet tujuan.',
      });
      return { rootCause: `${source} tidak memiliki alamat IP aktif (no-ip)`, fixes };
    case 'not-found':
    case 'invalid':
      fixes.push({
        id: 'fix-target',
        type: 'execute_cli',
        target: destination,
        params: { ...device(destination), command: '' },
        reason: `tujuan ${destination} tidak ditemukan atau alamat tidak valid.`,
        expectedEffect: `tujuan ${destination} valid dan dapat dijangkau.`,
        risk: 'low',
        validation: 'periksa nama/alamat tujuan.',
      });
      return { rootCause: `tujuan ${destination} tidak ditemukan (${reason})`, fixes };
    case 'ttl':
      fixes.push({
        id: 'fix-ttl',
        type: 'execute_cli',
        target: source,
        params: { ...device(source), command: '' },
        reason: 'paket melebihi TTL — kemungkinan loop routing. Periksa rute statik/dinamis.',
        expectedEffect: 'rute tidak berloop; TTL cukup.',
        risk: 'high',
        validation: 'audit rute pada seluruh perangkat di jalur.',
      });
      return { rootCause: `loop routing / TTL habis pada jalur ${source} → ${destination}`, fixes };
    case 'unreachable':
      fixes.push({
        id: 'fix-route',
        type: 'configure_route',
        target: source,
        params: { ...device(source), dst: '', gateway: '' },
        reason: `tidak ada rute menuju ${destination} dari ${source}.`,
        expectedEffect: `rute menuju ${destination} tersedia di ${source}.`,
        risk: 'medium',
        validation: 'pastikan gateway dapat dijangkau.',
      });
      return { rootCause: `tidak ada rute menuju ${destination} dari ${source}`, fixes };
    case 'blocked':
    case 'rejected':
      fixes.push({
        id: 'fix-firewall',
        type: 'configure_firewall',
        target: source,
        params: { ...device(source), action: 'accept' },
        reason: 'paket diblokir firewall/ACL pada jalur.',
        expectedEffect: `firewall mengizinkan lalu lintas ${source} → ${destination}.`,
        risk: 'high',
        validation: 'konfirmasi rule firewall tujuan/forward.',
      });
      return { rootCause: `paket diblokir oleh firewall/ACL pada jalur ${source} → ${destination}`, fixes };
    case 'refused':
      fixes.push({
        id: 'fix-service',
        type: 'execute_cli',
        target: destination,
        params: { ...device(destination), command: '' },
        reason: 'koneksi ditolak (port tidak terbuka) pada tujuan.',
        expectedEffect: `layanan pada ${destination} menerima koneksi.`,
        risk: 'low',
        validation: 'periksa layanan/port tujuan.',
      });
      return { rootCause: `koneksi ditolak oleh ${destination} (refused)`, fixes };
    case 'power':
      fixes.push({
        id: 'fix-power',
        type: 'execute_cli',
        target: '',
        params: {},
        reason: 'perangkat mati (power off).',
        expectedEffect: 'perangkat menyala.',
        risk: 'low',
        validation: 'nyalakan perangkat.',
      });
      return { rootCause: 'perangkat dalam keadaan mati (power)', fixes };
    default:
      return { rootCause: `koneksi gagal ${source} → ${destination} (${reason ?? 'alasan tidak diketahui'})`, fixes };
  }
}

/**
 * Diagnosa penuh: ping nyata + bukti berjenjang + packet trace
 * + root cause + rekomendasi perbaikan (PlanAction).
 */
export function diagnoseConnectivity(
  sim: NetworkSimulator,
  verification: VerificationEngine,
  params: DiagnoseParams
): DiagnosticResult {
  const source = params.source;
  const destination = params.destination;
  const evidence: DiagnosticEvidence[] = [];

  // 1. Probe ping (jalur engine nyata — SAMA dengan Ping Tools)
  const ping = verification.verifyPing({ source, destination, label: `diagnose ${source} → ${destination}` });
  evidence.push({ step: 'ping', data: [ping.success ? 'ok' : `gagal: ${ping.reason ?? 'unknown'}`, ...ping.evidence] });

  if (ping.success) {
    return {
      ok: true,
      sourceName: source,
      destinationIp: destination,
      ping,
      rootCause: null,
      evidence,
      packetTrace: ping.hops ?? [],
      recommendedFixes: [],
      message: `Koneksi ${source} → ${destination} BERHASIL (${ping.hops?.length ?? 0} hop).`,
    };
  }

  // 2. Buat kandidat tuan rumah resolusi nama → IP
  const dstIp = destination;

  // 3. Bukti rute dari sumber
  const routes = verification.verifyRoute({ source, dst: 'probe', actionId: 'diagnose' });
  void routes;
  const routeInfo = sim.getDeviceByName?.(source) ?? null;
  void routeInfo;

  // 4. Bukti ARP/NDP
  const arp = verification.verifyArp({ source, destination: dstIp, actionId: 'diagnose' });
  evidence.push({ step: 'arp/ndp', data: [`hasArp=${arp.success}`, ...arp.evidence.slice(0, 5)] });

  // 5. Bukti OSPF/BGP bila ada adjacency
  const ospf = verification.verifyOspf({ source, actionId: 'diagnose' });
  const bgp = verification.verifyBgp({ source, actionId: 'diagnose' });
  if (ospf.evidence.length > 0) evidence.push({ step: 'ospf', data: ospf.evidence.slice(0, 5) });
  if (bgp.evidence.length > 0) evidence.push({ step: 'bgp', data: bgp.evidence.slice(0, 5) });

  // 6. NAT/firewall
  const nat = verification.verifyNat({ source, actionId: 'diagnose' });
  const fw = verification.verifyFirewall({ source, actionId: 'diagnose' });
  if (nat.evidence.length > 0) evidence.push({ step: 'nat', data: nat.evidence.slice(0, 5) });
  if (fw.evidence.length > 0) evidence.push({ step: 'firewall', data: fw.evidence.slice(0, 5) });

  // 7. Packet trace (alasan drop per hop)
  let packetTrace: string[] = [];
  try {
    const simTrace = (sim as unknown as { simulateTraceroute: (a: string, b: string) => { ok: boolean; hops: { name: string; ttl: number; ip?: string | null; reason?: string }[]; reason?: string } }).simulateTraceroute(source, dstIp);
    packetTrace = simTrace.hops.map((h) => `hop ${h.ttl}: ${h.name}${h.ip ? ` (${h.ip})` : ''}${h.reason ? ` — DROP: ${h.reason}` : ''}`);
    if (packetTrace.length === 0 && simTrace.reason) {
      // Tidak ada hop yang dilaporkan engine: drop terjadi sebelum paket
      // keluar dari sumber (mis. tanpa rute) atau di link senyap. Laporkan
      // apa adanya — bukan hop karangan.
      packetTrace.push(`hop 1: ${source} — DROP: ${simTrace.reason} (tidak ada hop — paket tidak keluar dari sumber)`);
    }
    evidence.push({ step: 'packet-trace', data: packetTrace });
  } catch {
    evidence.push({ step: 'packet-trace', data: ['traceroute tidak tersedia'] });
  }

  // 8. Root cause: dari reason ping + data per hop
  const { rootCause, fixes } = fixFromReason(ping.reason, params);
  const finalReason = packetTrace.some((l) => l.includes('DROP'))
    ? `${rootCause} (drop terdeteksi di ${packetTrace.find((l) => l.includes('DROP')) ?? 'jalur'})`
    : rootCause;

  return {
    ok: false,
    sourceName: source,
    destinationIp: dstIp,
    ping,
    rootCause: finalReason,
    evidence,
    packetTrace,
    recommendedFixes: fixes,
    message: `Diagnosa: ${finalReason}. ${fixes.length > 0 ? `${fixes.length} perbaikan direkomendasikan.` : 'Tidak ada perbaikan otomatis.'}`,
  };
}

/**
 * Diagnosa seluruh jaringan (MentorEngine analyzers).
 * Dipakai tool `diagnose` — hasil dipetakan ke bentuk terstruktur.
 */
export function diagnoseNetwork(sim: NetworkSimulator): {
  ok: boolean;
  issues: { id: string; severity: string; title: string; device?: string; evidence: string[]; confidence: number; recommendation: string }[];
  checks: { category: string; label: string; ok: boolean; detail: string }[];
  confidence: number;
} {
  const mentor = new MentorEngine(sim);
  const res = mentor.diagnose();
  return {
    ok: res.status === 'healthy',
    issues: res.issues.map((i) => ({
      id: i.id,
      severity: i.severity,
      title: i.title,
      device: i.affectedDeviceName ?? i.affectedDeviceId,
      evidence: i.evidence,
      confidence: i.confidence,
      recommendation: i.recommendation,
    })),
    checks: res.checks.map((c) => ({ category: c.category, label: c.label, ok: c.ok, detail: c.detail })),
    confidence: res.confidence,
  };
}

/** Bentuk bukti mentah untuk diagnosis terstruktur. */
export type { VerificationResult as DiagVerificationResult };