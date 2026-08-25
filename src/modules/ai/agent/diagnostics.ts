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

/** /24-prefix dari IP (untuk inferensi subnet sederhana). */
function prefixOf(ip: string): string | null {
  const m = ip.match(/^(\d+\.\d+\.\d+)\.\d+$/);
  return m ? m[1] : null;
}

/**
 * Cari kandidat gateway untuk `source`: device LAIN yang punya interface
 * aktif di subnet /24 yang sama dengan interface aktif source.
 * Berdasarkan state engine nyata (getDeviceStats), bukan tebakan.
 */
function findGatewayCandidate(
  sim: NetworkSimulator,
  sourceId: string
): { gateway: string; iface: string } | null {
  const srcStats = sim.getDeviceStats(sourceId);
  if (!srcStats) return null;
  const srcIfaces = srcStats.interfaces.filter((i) => i.ip && i.up);
  if (srcIfaces.length === 0) return null;

  for (const dev of sim.getDevices()) {
    if (dev.id === sourceId) continue;
    const st = sim.getDeviceStats(dev.id);
    if (!st) continue;
    for (const iface of st.interfaces) {
      if (!iface.ip || !iface.up) continue;
      const ip = iface.ip.split('/')[0];
      for (const si of srcIfaces) {
        const sip = (si.ip as string).split('/')[0];
        if (prefixOf(sip) && prefixOf(ip) === prefixOf(sip) && ip !== sip) {
          return { gateway: ip, iface: si.name };
        }
      }
    }
  }
  return null;
}

/**
 * Susun perbaikan yang BENAR-BENAR BISA dieksekusi tool AI (params lengkap,
 * lolos validasi registry). Penyebab yang butuh tindakan manusia (power,
 * nama tujuan salah, layanan mati) TIDAK menghasilkan action karangan —
 * root cause + evidence sudah cukup untuk operator.
 */
function fixFromReason(
  reason: string | undefined,
  params: DiagnoseParams,
  sim: NetworkSimulator
): { fixes: PlanAction[]; rootCause: string } {
  const { source, destination } = params;
  const fixes: PlanAction[] = [];
  const dstIsIp = /^\d+\.\d+\.\d+\.\d+$/.test(destination);

  switch (reason) {
    case 'no-ip': {
      // Inferensi konkret: subnet dari device lain yang reachable di topologi.
      let address = '';
      let iface = '';
      const srcStats = sim.getDeviceStats(source);
      const bare = srcStats?.interfaces.find((i) => !i.ip) ?? srcStats?.interfaces[0];
      if (bare) iface = bare.name;
      if (dstIsIp) {
        const pfx = prefixOf(destination);
        // Pastikan prefix ini memang terpasang di device lain (subnet nyata).
        for (const dev of sim.getDevices()) {
          if (dev.id === source) continue;
          const st = sim.getDeviceStats(dev.id);
          if (st?.interfaces.some((i) => i.ip?.startsWith(pfx + '.'))) {
            address = `${pfx}.2/24`;
            break;
          }
        }
      }
      if (iface && address) {
        fixes.push({
          id: 'fix-no-ip',
          type: 'configure_ip_address',
          target: source,
          params: { deviceId: source, interface: iface, address },
          reason: `${source} tidak punya alamat IP pada interface ${iface}; subnet ${pfxOf(address)} terdeteksi dari tetangga.`,
          expectedEffect: `interface ${iface} pada ${source} memiliki IP ${address}`,
          risk: 'medium',
          validation: 'IP di subnet tetangga; sesuaikan bila skema addressing berbeda.',
        });
      }
      return { rootCause: `${source} tidak memiliki alamat IP aktif (no-ip)`, fixes };
    }
    case 'not-found':
    case 'invalid':
      // Tujuan tidak valid → bukan hal yang bisa "diperbaiki" lewat config.
      return { rootCause: `tujuan ${destination} tidak ditemukan atau alamat tidak valid (${reason}) — periksa nama/alamat tujuan`, fixes: [] };
    case 'ttl':
      // Loop routing → perbaikan otomatis berisiko; butuh audit rute manual.
      return { rootCause: `loop routing / TTL habis pada jalur ${source} → ${destination} — audit rute statik/dinamis diperlukan`, fixes: [] };
    case 'unreachable': {
      const gw = findGatewayCandidate(sim, source);
      const dst = dstIsIp ? `${destination}/32` : '0.0.0.0/0';
      if (gw) {
        fixes.push({
          id: 'fix-route',
          type: 'configure_route',
          target: source,
          params: { deviceId: source, dst, gateway: gw.gateway },
          reason: `tidak ada rute menuju ${destination} dari ${source}; tetangga ${gw.gateway} ada di subnet interface ${gw.iface}.`,
          expectedEffect: `rute ${dst} via ${gw.gateway} terpasang di ${source}`,
          risk: 'medium',
          validation: 'gateway harus dapat dijangkau di Layer 2.',
        });
      }
      return { rootCause: `tidak ada rute menuju ${destination} dari ${source}`, fixes };
    }
    case 'blocked':
    case 'rejected': {
      const fwParams: Record<string, unknown> = { deviceId: source, action: 'accept' };
      if (dstIsIp) fwParams['dst'] = `${destination}/32`;
      fixes.push({
        id: 'fix-firewall',
        type: 'configure_firewall',
        target: source,
        params: fwParams,
        reason: 'paket diblokir firewall/ACL pada jalur.',
        expectedEffect: `firewall ${source} mengizinkan lalu lintas menuju ${destination}`,
        risk: 'high',
        validation: 'konfirmasi rule firewall pada perangkat di jalur sebelum melonggarkan kebijakan.',
      });
      return { rootCause: `paket diblokir oleh firewall/ACL pada jalur ${source} → ${destination}`, fixes };
    }
    case 'refused':
      return { rootCause: `koneksi ditolak oleh ${destination} (refused) — layanan/port tujuan tidak terbuka`, fixes: [] };
    case 'power':
      return { rootCause: 'perangkat dalam keadaan mati (power) — nyalakan perangkat', fixes: [] };
    default:
      return { rootCause: `koneksi gagal ${source} → ${destination} (${reason ?? 'alasan tidak diketahui'})`, fixes };
  }

  function pfxOf(cidr: string): string {
    return cidr.split('/')[0].split('.').slice(0, 3).join('.');
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

  // 3. Bukti rute dari sumber — state engine nyata (bukan dead code):
  //    apakah ada rute spesifik/default aktif menuju tujuan?
  const srcStats = sim.getDeviceStats(source);
  const routes = srcStats?.routes ?? [];
  const dstIsIp = /^\d+\.\d+\.\d+\.\d+$/.test(dstIp);
  const dstPrefix = dstIsIp ? prefixOf(dstIp) : null;
  const matchingRoute = routes.find(
    (r) =>
      r.active &&
      (r.dst === '0.0.0.0/0' ||
        r.dst === dstIp ||
        r.gateway !== '' ||
        (dstPrefix && r.dst.startsWith(dstPrefix + '.')))
  );
  evidence.push({
    step: 'routes',
    data:
      routes.length === 0
        ? ['tidak ada rute di tabel routing sumber']
        : [
            ...routes.slice(0, 5).map((r) => `${r.dst}${r.gateway ? ` via ${r.gateway}` : ''}${r.active ? '' : ' [inactive]'}`),
            `default/spesifik aktif: ${matchingRoute ? 'ya' : 'tidak'}`,
          ],
  });

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

  // 8. Root cause: dari reason ping + data per hop; fix hanya yang executable.
  const { rootCause, fixes } = fixFromReason(ping.reason, params, sim);
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