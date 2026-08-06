// ============================================================
// PacketAnalyzer — TTL expired, dropped, forwarded, fragmented,
// ARP timeout, ICMP error — semuanya dari event engine.
// ============================================================

import { AnalyzerCtx, AnalyzerIssue, NetworkState } from './types';

const REASON_LABEL: Record<string, string> = {
  'no-route': 'No Route',
  'ttl-expired': 'TTL Expired',
  firewall: 'Firewall Block',
  'l2-filter': 'L2 Filter (ACL)',
  'iface-down': 'Interface Down',
  power: 'Power Off',
  refused: 'Connection Refused',
  'dhcp-no-pool': 'DHCP No Pool',
  'dhcp-pool-full': 'DHCP Pool Full',
  vlan: 'VLAN Drop',
  'arp-malformed': 'ARP Malformed',
  'arp-not-for-me': 'ARP Not For Me',
  'arp-unknown': 'ARP Unknown',
  'same-port': 'Same Port',
  'flood-empty': 'Flood Empty',
};

/** Reason drop yang NORMAL dalam lalu lintas L2/L3 — tidak dilaporkan AI. */
const BENIGN_DROPS = new Set([
  'arp-consumed',
  'arp-not-for-me',
  'arp-malformed',
  'arp-unknown',
  'dhcp-consumed',
  'dhcp-ignored',
  'dhcp-unknown',
  'icmp-error',
  'consumed',
  'not-for-me',
  'dns-consumed',
  'udp-unknown',
  'tcp-unknown',
  'unsupported',
  'flood-empty',
]);

export function analyzePackets(state: NetworkState, ctx: AnalyzerCtx): AnalyzerIssue[] {
  const issues: AnalyzerIssue[] = [];
  const ev = state.events;

  const nameOf = (nodeId?: string): string | undefined =>
    nodeId ? state.byId.get(nodeId)?.name ?? nodeId : undefined;

  // ── TTL Expired ──────────────────────────────────────────────
  const ttlEvents = ev.filter((e) => e.type === 'TTL_EXCEEDED');
  if (ttlEvents.length > 0) {
    const e = ttlEvents[0];
    issues.push({
      id: 'packet-ttl',
      category: 'packet',
      severity: 'critical',
      title: 'TTL Expired',
      rootCause: 'Paket di-drop karena TTL habis (0). Ini indikasi routing loop atau jumlah hop berlebihan.',
      evidence: ttlEvents.slice(0, 5).map((x) => `TTL Expired @ ${nameOf(x.nodeId) ?? '?'}`),
      affectedDeviceId: e.nodeId,
      affectedDeviceName: nameOf(e.nodeId),
      recommendation: 'Cari routing loop (lihat RoutingAnalyzer) atau pastikan tidak ada route yang berputar.',
      commands: [],
      confidence: 0.98,
      fixKey: 'loop',
    });
  }

  // ── Packet Dropped ───────────────────────────────────────────
  const drops = ev.filter((e) => e.type === 'PACKET_DROPPED');
  const dropReasons = new Map<string, number>();
  for (const d of drops) {
    const r = (d.data as { reason?: string }).reason ?? 'unknown';
    dropReasons.set(r, (dropReasons.get(r) ?? 0) + 1);
  }
  for (const [reason, count] of dropReasons) {
    if (count === 0 || BENIGN_DROPS.has(reason)) continue;
    const label = REASON_LABEL[reason] ?? reason;
    const sample = drops.find((d) => (d.data as { reason?: string }).reason === reason);
    issues.push({
      id: `packet-drop-${reason}`,
      category: 'packet',
      severity: reason === 'power' || reason === 'no-route' || reason === 'ttl-expired' || reason === 'firewall' ? 'critical' : 'warning',
      title: `Packet Dropped: ${label}`,
      rootCause: `${count} paket di-drop oleh engine dengan alasan "${label}".`,
      evidence: [`Packet Dropped: ${label} (${count}x)`, sample?.nodeId ? `@ ${nameOf(sample.nodeId)}` : ''].filter(Boolean),
      affectedDeviceId: sample?.nodeId,
      affectedDeviceName: sample?.nodeId ? nameOf(sample.nodeId) : undefined,
      recommendation: 'Lihat analisis kategori terkait (routing/firewall/dhcp/interface) untuk perbaikan.',
      commands: [],
      confidence: 0.95,
    });
  }

  // ── ICMP Error (no route, dst unreachable) ───────────────────
  const icmpErrors = ev.filter((e) => e.type === 'ICMP_ERROR');
  if (icmpErrors.length > 0) {
    const e = icmpErrors[0];
    const reason = (e.data as { reason?: string }).reason ?? 'unknown';
    issues.push({
      id: 'packet-icmp-error',
      category: 'packet',
      severity: 'critical',
      title: 'Destination Unreachable (ICMP)',
      rootCause: `Router mengembalikan ICMP error (${reason}) — tujuan tidak dapat dijangkau.`,
      evidence: [`ICMP Error: ${reason} @ ${nameOf(e.nodeId) ?? '?'}`],
      affectedDeviceId: e.nodeId,
      affectedDeviceName: nameOf(e.nodeId),
      recommendation: 'Periksa routing (no route) di device tersebut.',
      commands: [],
      confidence: 0.96,
      fixKey: 'default-route',
    });
  }

  // ── ARP Timeout ──────────────────────────────────────────────
  const arpReq = ev.filter((e) => e.type === 'ARP_REQUEST');
  const arpRep = ev.filter((e) => e.type === 'ARP_REPLY');
  if (arpReq.length > 0 && arpRep.length === 0) {
    const e = arpReq[0];
    const target = (e.data as { targetIp?: string }).targetIp ?? '?';
    issues.push({
      id: 'packet-arp-timeout',
      category: 'packet',
      severity: 'critical',
      title: 'ARP Timeout',
      rootCause: `ARP Request untuk ${target} tidak mendapat jawaban — tetangga tidak ada / interface down.`,
      evidence: [`ARP Request ${arpReq.length}x tanpa ARP Reply`, `target ${target}`],
      affectedDeviceId: e.nodeId,
      affectedDeviceName: nameOf(e.nodeId),
      recommendation: 'Periksa interface & kabel pada segmen tersebut.',
      commands: [],
      confidence: 0.93,
    });
  }

  // ── Fragmented (informasi) ───────────────────────────────────
  const frag = ev.filter((e) => e.data && typeof e.data === 'object' && 'fragmented' in e.data && e.data.fragmented);
  if (frag.length > 0) {
    issues.push({
      id: 'packet-fragmented',
      category: 'packet',
      severity: 'info',
      title: 'Packet Fragmented',
      rootCause: `${frag.length} paket dipecah (fragmentasi) oleh engine.`,
      evidence: [`Fragmented ${frag.length}x`],
      recommendation: 'Normal bila ukuran melebihi MTU; optimasi jika berlebihan.',
      commands: [],
      confidence: 0.6,
    });
  }

  return issues;
}
