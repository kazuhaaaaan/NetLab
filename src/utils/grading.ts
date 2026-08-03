import { SimulationEngine } from '../engine/sim';
import { inSameSubnet, parseCidr } from '../engine/sim/ip';

/**
 * Auto-grading: check a topology against a checklist of requirements.
 * Every check reads REAL simulation-engine state (CLI configs, routes,
 * VLANs, protocols) or runs a live simulation (ping / TCP connect).
 */

export type GradingCheckType =
  | 'ip'
  | 'route'
  | 'vlan'
  | 'trunk'
  | 'shutdown'
  | 'subinterface'
  | 'ospf'
  | 'rip'
  | 'eigrp'
  | 'bgp'
  | 'nat'
  | 'acl'
  | 'ping'
  | 'tcp'
  | 'power'
  | 'dhcp';

export interface GradingCheck {
  id: string;
  type: GradingCheckType;
  nodeId: string;
  /** human-readable requirement (dipakai sebagai label tampilan) */
  label: string;
  params: Record<string, string>;
}

export interface GradingResult {
  checkId: string;
  pass: boolean;
  detail: string;
}

export interface GradingSummary {
  total: number;
  passed: number;
  score: number;
}

const CHECK_LABELS: Record<GradingCheckType, string> = {
  ip: 'IP pada interface',
  route: 'Rute statis',
  vlan: 'VLAN access pada port',
  trunk: 'Port trunk',
  shutdown: 'Interface shutdown',
  subinterface: 'Subinterface VLAN (router-on-a-stick)',
  ospf: 'OSPF aktif',
  rip: 'RIP aktif',
  eigrp: 'EIGRP aktif',
  bgp: 'BGP aktif',
  nat: 'NAT masquerade',
  acl: 'ACL/firewall deny',
  ping: 'Ping berhasil',
  tcp: 'Koneksi TCP berhasil',
  power: 'Device menyala',
  dhcp: 'Lease DHCP',
};

export function gradingCheckLabel(type: GradingCheckType, params: Record<string, string>): string {
  const base = CHECK_LABELS[type];
  const extra: string[] = [];
  if (params.iface) extra.push(`iface=${params.iface}`);
  if (params.cidr) extra.push(params.cidr);
  if (params.dst) extra.push(`dst=${params.dst}`);
  if (params.gateway) extra.push(`gw=${params.gateway}`);
  if (params.vlanId) extra.push(`vlan=${params.vlanId}`);
  if (params.protocol) extra.push(params.protocol);
  if (params.ip) extra.push(params.ip);
  if (params.asn) extra.push(`as=${params.asn}`);
  return extra.length > 0 ? `${base} (${extra.join(', ')})` : base;
}

/** Predefined check templates (per tipe) — pengguna tinggal pilih node target. */
export const GRADING_TEMPLATES: { type: GradingCheckType; label: string; params: Record<string, string> }[] = [
  { type: 'ip', label: 'IP pada interface', params: { iface: '', cidr: '' } },
  { type: 'route', label: 'Rute statis ke jaringan', params: { dst: '', gateway: '' } },
  { type: 'ping', label: 'Ping antar perangkat', params: { ip: '' } },
  { type: 'tcp', label: 'Koneksi TCP (HTTP) ke server', params: { ip: '' } },
  { type: 'vlan', label: 'VLAN access pada port', params: { iface: '', vlanId: '' } },
  { type: 'trunk', label: 'Port trunk', params: { iface: '' } },
  { type: 'shutdown', label: 'Interface shutdown', params: { iface: '' } },
  { type: 'subinterface', label: 'Subinterface VLAN', params: { iface: '' } },
  { type: 'ospf', label: 'OSPF aktif', params: { protocol: 'ospf' } },
  { type: 'rip', label: 'RIP aktif', params: { protocol: 'rip' } },
  { type: 'eigrp', label: 'EIGRP aktif', params: { protocol: 'eigrp' } },
  { type: 'bgp', label: 'BGP aktif', params: { asn: '' } },
  { type: 'nat', label: 'NAT masquerade', params: {} },
  { type: 'acl', label: 'ACL deny', params: {} },
  { type: 'power', label: 'Device menyala', params: {} },
  { type: 'dhcp', label: 'Perangkat dapat lease DHCP', params: {} },
];

export function gradeProject(engine: SimulationEngine, checks: GradingCheck[]): GradingResult[] {
  return checks.map((c) => evaluateCheck(engine, c));
}

function evaluateCheck(engine: SimulationEngine, check: GradingCheck): GradingResult {
  const { type, nodeId, params } = check;
  const name = engine.getDeviceStats(nodeId)?.name || nodeId;

  const fail = (detail: string): GradingResult => ({ checkId: check.id, pass: false, detail });
  const pass = (detail: string): GradingResult => ({ checkId: check.id, pass: true, detail });

  try {
    switch (type) {
      case 'ip': {
        const stats = engine.getDeviceStats(nodeId);
        if (!stats) return fail(`Device "${name}" tidak ada`);
        const iface = params.iface?.toLowerCase();
        const wantCidr = params.cidr?.trim();
        for (const i of stats.interfaces) {
          if (iface && i.name.toLowerCase() !== iface) continue;
          if (!i.ip) continue;
          if (wantCidr) {
            const w = parseCidr(wantCidr);
            if (w && inSameSubnet(i.ip.split('/')[0], w.prefix, w.address)) {
              return pass(`${i.name}: ${i.ip} dalam subnet ${wantCidr}`);
            }
          } else {
            return pass(`${i.name}: ${i.ip}`);
          }
        }
        return fail(iface ? `${iface} tidak punya IP ${wantCidr || ''}`.trim() : 'Tidak ada IP terkonfigurasi');
      }
      case 'route': {
        const stats = engine.getDeviceStats(nodeId);
        if (!stats) return fail(`Device "${name}" tidak ada`);
        const dst = params.dst?.trim();
        const gw = params.gateway?.trim();
        const hit = stats.routes.find((r) => {
          if (dst && r.dst !== dst) return false;
          if (gw && r.gateway !== gw) return false;
          return r.kind === 'static';
        });
        return hit ? pass(`Rute ${hit.dst}${hit.gateway ? ` via ${hit.gateway}` : ''}`) : fail('Rute statis tidak ditemukan');
      }
      case 'vlan': {
        const vlanMap = engine.getNodePortVlans(nodeId);
        const want = params.vlanId?.trim();
        for (const [iface, vlan] of vlanMap) {
          if (params.iface && iface.toLowerCase() !== params.iface.toLowerCase()) continue;
          if (want && String(vlan) !== want) continue;
          return pass(`${iface} → VLAN ${vlan}`);
        }
        return fail(`Port ${params.iface || '?'} bukan access VLAN ${want || '?'}`);
      }
      case 'trunk': {
        const trunks = engine.getNodeTrunkPorts(nodeId);
        for (const t of trunks) {
          if (params.iface && t.toLowerCase() !== params.iface.toLowerCase()) continue;
          return pass(`${t} adalah trunk`);
        }
        return fail(`Port ${params.iface || '?'} bukan trunk`);
      }
      case 'shutdown': {
        const shut = engine.getNodeShutdownIfaces(nodeId);
        for (const s of shut) {
          if (params.iface && s.toLowerCase() !== params.iface.toLowerCase()) continue;
          return pass(`${s} dalam keadaan shutdown`);
        }
        return fail(`Port ${params.iface || '?'} tidak dalam keadaan shutdown`);
      }
      case 'subinterface': {
        const subs = engine.getNodeSubinterfaces(nodeId);
        for (const [s] of subs) {
          if (params.iface && s.toLowerCase() !== params.iface.toLowerCase()) continue;
          return pass(`${s} terdaftar`);
        }
        return fail(`Subinterface ${params.iface || '?'} tidak ditemukan`);
      }
      case 'ospf':
      case 'rip':
      case 'eigrp': {
        const routing = engine.getNodeRouting(nodeId);
        const proto = type;
        const cfg = routing?.[proto];
        return cfg?.enabled ? pass(`${proto.toUpperCase()} aktif`) : fail(`${proto.toUpperCase()} tidak aktif`);
      }
      case 'bgp': {
        const bgp = engine.getNodeBgp(nodeId);
        if (!bgp?.asn) return fail('BGP tidak dikonfigurasi');
        if (params.asn && String(bgp.asn) !== params.asn) return fail(`ASN ${bgp.asn} ≠ ${params.asn}`);
        return pass(`BGP AS ${bgp.asn} aktif (${bgp.peers.length} peer)`);
      }
      case 'nat': {
        const nats = engine.getNodeNats(nodeId);
        const hit = nats.some((n) => n.action === 'masquerade' && n.chain === 'srcnat');
        return hit ? pass('NAT masquerade aktif') : fail('Tidak ada rule NAT masquerade');
      }
      case 'acl': {
        const acls = engine.getNodeAcls(nodeId);
        const hit = acls.some((a) => a.action === 'deny');
        return hit ? pass('Ada rule deny') : fail('Tidak ada rule deny');
      }
      case 'ping': {
        const ip = params.ip?.trim();
        if (!ip) return fail('Tentukan IP tujuan');
        const r = engine.simulatePing(nodeId, ip);
        return r.success
          ? pass(`Ping ke ${ip} sukses (${r.path.join(' → ')})`)
          : fail(`Ping ke ${ip} gagal: ${r.reason || 'unreachable'}`);
      }
      case 'tcp': {
        const ip = params.ip?.trim();
        if (!ip) return fail('Tentukan IP tujuan');
        const r = engine.simulateTcpConnect(nodeId, ip, 80);
        return r.ok ? pass(`TCP 3-way handshake ke ${ip}:80 berhasil`) : fail(`Koneksi ke ${ip}:80 gagal: ${r.reason || 'refused'}`);
      }
      case 'power': {
        const on = engine.isNodePowered(nodeId);
        return on ? pass('Device menyala') : fail('Device dalam keadaan mati (power off)');
      }
      case 'dhcp': {
        const lease = engine.getLeaseFor(nodeId);
        return lease
          ? pass(`Lease ${lease.ip} (gw ${lease.gateway}, /${lease.prefix})`)
          : fail('Belum dapat lease — pastikan DHCP client dikonfigurasi & server pool tersedia');
      }
      default:
        return fail('Tipe check tidak dikenal');
    }
  } catch {
    return fail('Error saat evaluasi');
  }
}
