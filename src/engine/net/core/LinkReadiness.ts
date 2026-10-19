// ============================================================
// LinkReadiness — evaluator "config kedua ujung cocok ⇒ link terhubung"
//
// Murni-query: membaca state PASCA applyAllConfigs (topology +
// ConfigStore/device) tanpa mengubah apa pun. Dipakai UI (badge edge,
// panel alasan gagal), AI diagnostics, dan auto-fix.
//
// Model mental (ala Packet Tracer):
//   - link fisik  = kabel ada + device nyala + interface tidak shutdown
//   - "terhubung" = L3: IP kedua ujung satu subnet; ATAU L2 murni tanpa
//                   mismatch VLAN (host/switch tanpa IP dianggap connected)
//   - protokol    = OSPF area cocok / BGP AS cocok dilaporkan terpisah
//     sebagai adjacency, bukan syarat kabel "up".
// ============================================================

import type { NetworkSimulator } from './NetworkSimulator';
import type { NetworkDevice } from '../devices/NetworkDevice';
import { inSameSubnet, parseCidr, networkOf, intToIp } from './ip';
import { processorKind } from '../devices/DeviceProcessor';

export type LinkCheckStatus = 'ok' | 'fail' | 'warn' | 'na';

export interface LinkCheck {
  id: 'cable' | 'power' | 'admin' | 'l2-vlan' | 'l3-subnet' | 'ospf' | 'bgp';
  status: LinkCheckStatus;
  /** Ringkasan satu baris untuk UI. */
  summary: string;
  /** Detail bukti per ujung. */
  details: string[];
}

export interface LinkEndpointInfo {
  nodeId: string;
  name: string;
  portId: string;
  ifaceName: string | null;
  powered: boolean;
  adminUp: boolean;
  up: boolean;
  /** 'a.b.c.d/prefix' atau null bila interface tanpa IP. */
  ip: string | null;
}

export interface LinkReadiness {
  edgeId: string;
  local: LinkEndpointInfo;
  peer: LinkEndpointInfo;
  /** L3 langsung: IP kedua ujung pada subnet yang sama (kunci "terhubung"). */
  ipConnected: boolean;
  /** L2 konsisten (VLAN access/trunk match) — tanpa ini trafik L2 bisa drop. */
  l2Ok: boolean;
  checks: LinkCheck[];
  /** Alasan blockers dalam bahasa manusia (kosong = siap). */
  blockers: string[];
  /**
   * no-cable  : edge tidak ada di tabel link
   * down      : kabel dimatikan / device mati / interface shutdown
   * degraded  : fisik up tapi config kedua ujung belum cocok
   * connected : siap lewati trafik (L3 same-subnet ATAU L2 konsisten)
   */
  status: 'no-cable' | 'down' | 'degraded' | 'connected';
  /** Label siap tampil di badge canvas. */
  label: string;
}

interface EndpointRuntime {
  dev: NetworkDevice;
  name: string;
  iface: { name: string; up: boolean; ip?: { address: string; prefix: number } } | null;
  portId: string;
}

/** Cari interface fisik pada sebuah ujung edge (portId → nama → fallback). */
function endpointOf(sim: NetworkSimulator, nodeId: string, portId: string): EndpointRuntime | null {
  const dev = sim.getDevice(nodeId);
  if (!dev) return null;
  const iface = dev.getIfaceByPortId(portId) || dev.getIfaceByName(portId);
  return { dev, name: dev.name, iface, portId };
}

function endpointInfo(rt: EndpointRuntime | null): LinkEndpointInfo {
  if (!rt) {
    return { nodeId: '(missing)', name: '(missing)', portId: '-', ifaceName: null, powered: false, adminUp: false, up: false, ip: null };
  }
  const { dev, iface, portId } = rt;
  const ifaceName = iface?.name || null;
  const adminUp = ifaceName ? !dev.shutdownIfaces.has(ifaceName) : true;
  return {
    nodeId: dev.id,
    name: dev.name,
    portId,
    ifaceName,
    powered: dev.powered,
    adminUp,
    up: !!iface?.up,
    ip: iface?.ip ? `${iface.ip.address}/${iface.ip.prefix}` : null,
  };
}

function ipLabel(rt: EndpointRuntime | null): string {
  if (!rt?.iface?.ip) return '(tanpa IP)';
  return `${rt.iface.ip.address}/${rt.iface.ip.prefix}`;
}

function parseIp(rt: EndpointRuntime | null): { address: string; prefix: number } | null {
  return rt?.iface?.ip ?? null;
}

// ── OSPF ───────────────────────────────────────────────────────────

/** Normalisasi network statement OSPF → CIDR (mirip RoutingProtocolEngine). */
function normalizeNetworkEntry(dev: NetworkDevice, entry: string): string | null {
  const trimmed = entry.trim();
  const two = trimmed.match(/^(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)$/);
  if (two) return `${two[1]}/${dottedToPrefix(two[2])}`;
  const parsed = parseCidr(trimmed);
  if (parsed) return `${parsed.address}/${parsed.prefix}`;
  const iface = dev.getIfaceByName(trimmed);
  if (iface?.ip) return `${intToIp(networkOf(iface.ip.address, iface.ip.prefix))}/${iface.ip.prefix}`;
  return null;
}

function dottedToPrefix(mask: string): number {
  const m = mask.split('.').reduce((acc, o) => (acc << 8) | (parseInt(o, 10) || 0), 0) >>> 0;
  let bits = 0;
  let v = m;
  while (v & 0x80000000) { bits++; v = (v << 1) >>> 0; }
  return bits;
}

/** Interface ikut OSPF? (network statement mencakup subnet interface). */
function ospfParticipates(dev: NetworkDevice, ip: { address: string; prefix: number } | null): boolean {
  if (!ip) return false;
  const nets = (dev.routingCfg?.ospf?.networks || []).map((n) => normalizeNetworkEntry(dev, n)).filter((n): n is string => !!n);
  return nets.some((net) => {
    const parsed = parseCidr(net);
    if (!parsed) return false;
    const pa = Math.min(ip.prefix, parsed.prefix);
    return inSameSubnet(ip.address, pa, parsed.address);
  });
}

/** Area OSPF sebuah interface (default 0). */
function ospfAreaOf(dev: NetworkDevice, ip: { address: string; prefix: number } | null): number | null {
  if (!ip) return null;
  const areas = dev.routingCfg?.ospf?.areas || {};
  const nets = dev.routingCfg?.ospf?.networks || [];
  for (const raw of nets) {
    const norm = normalizeNetworkEntry(dev, raw);
    if (!norm) continue;
    const parsed = parseCidr(norm);
    if (!parsed) continue;
    const pa = Math.min(ip.prefix, parsed.prefix);
    if (inSameSubnet(ip.address, pa, parsed.address)) {
      const area = areas[raw];
      if (typeof area === 'number') return area;
      const areaNorm = areas[norm];
      if (typeof areaNorm === 'number') return areaNorm;
      return 0;
    }
  }
  return null;
}

function ospfEnabled(dev: NetworkDevice): boolean {
  const ospf = dev.routingCfg?.ospf;
  return !!(ospf && ospf.enabled !== false && (ospf.networks || []).length > 0);
}

// ── VLAN / trunk ───────────────────────────────────────────────────

function vlanOf(sim: NetworkSimulator, nodeId: string, portId: string, ifaceName: string | null): number | null {
  const pv = sim.getNodePortVlans(nodeId);
  if (ifaceName && pv.has(ifaceName)) return pv.get(ifaceName)!;
  if (pv.has(portId)) return pv.get(portId)!;
  return null;
}

function isTrunk(sim: NetworkSimulator, nodeId: string, portId: string, ifaceName: string | null): boolean {
  const tr = sim.getNodeTrunkPorts(nodeId);
  return (ifaceName != null && tr.has(ifaceName)) || tr.has(portId);
}

function trunkAllowedOf(sim: NetworkSimulator, nodeId: string, portId: string, ifaceName: string | null): number[] | null {
  if (!isTrunk(sim, nodeId, portId, ifaceName)) return null;
  const ta = sim.getNodeTrunkAllowed(nodeId);
  const key = ifaceName != null && ta.has(ifaceName) ? ifaceName : portId;
  return ta.get(key) ?? null; // null = semua VLAN diizinkan
}

// ── Evaluasi utama ─────────────────────────────────────────────────

/** Evaluasi kesiapan sebuah edge: config kedua ujung cocok ⇒ terhubung. */
export function evaluateLinkReadiness(sim: NetworkSimulator, edgeId: string): LinkReadiness {
  const link = sim.topology.links.linkById(edgeId);
  const localRt = link ? endpointOf(sim, link.a.nodeId, link.a.port) : null;
  const peerRt = link ? endpointOf(sim, link.b.nodeId, link.b.port) : null;
  const local = endpointInfo(localRt);
  const peer = endpointInfo(peerRt);

  if (!link || !localRt || !peerRt) {
    const why = !link ? 'edge tidak ada di topologi' : !localRt ? 'ujung A tidak ditemukan' : 'ujung B tidak ditemukan';
    return {
      edgeId, local, peer, ipConnected: false, l2Ok: false,
      checks: [{ id: 'cable', status: 'fail', summary: why, details: [] }],
      blockers: [why], status: 'no-cable', label: 'no cable',
    };
  }

  const checks: LinkCheck[] = [];
  const blockers: string[] = [];

  // 1) Kabel + failure injection
  const cableOk = !link.down;
  checks.push({
    id: 'cable',
    status: cableOk ? 'ok' : 'fail',
    summary: cableOk ? `kabel ${link.cableType} aktif` : 'kabel dimatikan (failure injection)',
    details: cableOk ? [] : ['edge.down = true — aktifkan kembali di panel edge'],
  });
  if (!cableOk) blockers.push('kabel dimatikan');

  // 2) Power
  const powerOk = localRt.dev.powered && peerRt.dev.powered;
  checks.push({
    id: 'power',
    status: powerOk ? 'ok' : 'fail',
    summary: powerOk ? 'kedua perangkat menyala' : 'ada perangkat mati',
    details: [
      ...(localRt.dev.powered ? [] : [`${local.name} mati`]),
      ...(peerRt.dev.powered ? [] : [`${peer.name} mati`]),
    ],
  });
  if (!powerOk) blockers.push('perangkat mati');

  // 3) Admin state interface
  const adminProblems: string[] = [];
  for (const [label, rt, info] of [['A', localRt, local] as const, ['B', peerRt, peer] as const]) {
    if (!info.ifaceName) { adminProblems.push(`ujung ${label}: port ${info.portId} tidak punya interface`); continue; }
    if (!info.adminUp) adminProblems.push(`${info.name}: interface ${info.ifaceName} shutdown`);
    else if (!info.up) adminProblems.push(`${info.name}: interface ${info.ifaceName} down`);
  }
  const adminOk = adminProblems.length === 0;
  checks.push({
    id: 'admin',
    status: adminOk ? 'ok' : 'fail',
    summary: adminOk ? 'interface kedua ujung up' : adminProblems[0],
    details: adminProblems,
  });
  if (!adminOk) blockers.push(adminProblems[0]);

  // 4) L2 VLAN — berlaku bila minimal satu sisi switch/wireless
  const l2 = evaluateL2(sim, localRt, peerRt);
  checks.push(l2.check);
  if (l2.check.status === 'fail') blockers.push(l2.check.summary);
  const l2Ok = l2.check.status !== 'fail';

  // 5) L3 subnet
  const localIp = parseIp(localRt);
  const peerIp = parseIp(peerRt);
  // Ujung "L3-capable" = bukan switch murni (butuh IP agar benar-benar terhubung).
  const l3Capable = processorKind(localRt.dev) !== 'switch' || processorKind(peerRt.dev) !== 'switch';
  let ipConnected = false;
  let l3: LinkCheck;
  if (localIp && peerIp) {
    const pa = Math.min(localIp.prefix, peerIp.prefix);
    ipConnected = inSameSubnet(localIp.address, pa, peerIp.address);
    l3 = {
      id: 'l3-subnet',
      status: ipConnected ? 'ok' : 'fail',
      summary: ipConnected
        ? `satu subnet (${intToIp(networkOf(localIp.address, pa))}/${pa})`
        : 'IP kedua ujung beda subnet',
      details: [`${local.name}: ${ipLabel(localRt)}`, `${peer.name}: ${ipLabel(peerRt)}`],
    };
    if (!ipConnected) blockers.push(`IP kedua ujung beda subnet (${local.name} ${ipLabel(localRt)}, ${peer.name} ${ipLabel(peerRt)})`);
  } else if (!localIp && !peerIp) {
    if (l3Capable) {
      l3 = {
        id: 'l3-subnet',
        status: 'warn',
        summary: 'belum ada IP di kedua ujung',
        details: [`${local.name}: ${ipLabel(localRt)}`, `${peer.name}: ${ipLabel(peerRt)}`],
      };
      blockers.push('belum ada IP di kedua ujung');
    } else {
      l3 = { id: 'l3-subnet', status: 'na', summary: 'tanpa IP (L2 murni, switch)', details: [] };
    }
  } else {
    const missing = localIp ? peer : local;
    l3 = {
      id: 'l3-subnet',
      status: 'warn',
      summary: `${missing.name} belum punya IP`,
      details: [`${local.name}: ${ipLabel(localRt)}`, `${peer.name}: ${ipLabel(peerRt)}`],
    };
    blockers.push(`${missing.name} belum punya IP`);
  }
  checks.push(l3);

  // 6) OSPF
  const ospf = evaluateOspf(localRt, peerRt);
  checks.push(ospf.check);
  if (ospf.check.status === 'fail') blockers.push(ospf.check.summary);

  // 7) BGP
  const bgp = evaluateBgp(localRt, peerRt);
  checks.push(bgp.check);
  if (bgp.check.status === 'fail') blockers.push(bgp.check.summary);

  // Status akhir
  let status: LinkReadiness['status'];
  if (!cableOk || !powerOk || !adminOk) status = 'down';
  else if (blockers.length > 0) status = 'degraded';
  else status = 'connected';

  const label =
    status === 'down' ? 'down'
    : status === 'connected' ? (ipConnected ? `up · ${ipLabel(localRt)} ↔ ${ipLabel(peerRt)}` : 'up · L2')
    : blockers[0] || 'degraded';

  return { edgeId, local, peer, ipConnected, l2Ok, checks, blockers, status, label };
}

function evaluateL2(sim: NetworkSimulator, a: EndpointRuntime, b: EndpointRuntime): { check: LinkCheck } {
  const aSwitch = processorKind(a.dev) === 'switch';
  const bSwitch = processorKind(b.dev) === 'switch';
  if (!aSwitch && !bSwitch) {
    return { check: { id: 'l2-vlan', status: 'na', summary: 'bukan pasangan switch', details: [] } };
  }
  const aTrunk = isTrunk(sim, a.dev.id, a.portId, a.iface?.name ?? null);
  const bTrunk = isTrunk(sim, b.dev.id, b.portId, b.iface?.name ?? null);
  const aVlan = vlanOf(sim, a.dev.id, a.portId, a.iface?.name ?? null);
  const bVlan = vlanOf(sim, b.dev.id, b.portId, b.iface?.name ?? null);

  if (aTrunk && bTrunk) {
    const aAllowed = trunkAllowedOf(sim, a.dev.id, a.portId, a.iface?.name ?? null);
    const bAllowed = trunkAllowedOf(sim, b.dev.id, b.portId, b.iface?.name ?? null);
    if (aAllowed && bAllowed) {
      const common = aAllowed.filter((v) => bAllowed!.includes(v));
      const ok = common.length > 0;
      return {
        check: {
          id: 'l2-vlan',
          status: ok ? 'ok' : 'fail',
          summary: ok ? `trunk cocok (VLAN ${common.join(',')})` : 'trunk: allowed VLAN tidak beririsan',
          details: [`${a.name}: allowed [${aAllowed.join(',')}]`, `${b.name}: allowed [${bAllowed.join(',')}]`],
        },
      };
    }
    return { check: { id: 'l2-vlan', status: 'ok', summary: 'trunk di kedua ujung (allowed default)', details: [] } };
  }

  if (aTrunk || bTrunk) {
    const trunkSide = aTrunk ? a : b;
    const accessSide = aTrunk ? b : a;
    const accessVlan = aTrunk ? bVlan : aVlan;
    const allowed = trunkAllowedOf(sim, trunkSide.dev.id, trunkSide.portId, trunkSide.iface?.name ?? null);
    if (accessVlan == null) {
      return {
        check: {
          id: 'l2-vlan',
          status: 'warn',
          summary: `trunk ↔ access: ${accessSide.name} belum set access VLAN`,
          details: [`${trunkSide.name} trunk${allowed ? ` allowed [${allowed.join(',')}]` : ' (semua VLAN)'}`],
        },
      };
    }
    if (allowed && !allowed.includes(accessVlan)) {
      return {
        check: {
          id: 'l2-vlan',
          status: 'fail',
          summary: `VLAN ${accessVlan} tidak diizinkan di trunk ${trunkSide.name}`,
          details: [
            `${accessSide.name}: access VLAN ${accessVlan}`,
            `${trunkSide.name}: allowed [${allowed.join(',')}]`,
          ],
        },
      };
    }
    return {
      check: {
        id: 'l2-vlan',
        status: 'ok',
        summary: `trunk ↔ access VLAN ${accessVlan}`,
        details: [],
      },
    };
  }

  // Dua access port
  if (aVlan != null && bVlan != null && aVlan !== bVlan) {
    return {
      check: {
        id: 'l2-vlan',
        status: 'fail',
        summary: `access VLAN beda (${a.name}: ${aVlan}, ${b.name}: ${bVlan})`,
        details: [`${a.name}: VLAN ${aVlan}`, `${b.name}: VLAN ${bVlan}`],
      },
    };
  }
  if (aVlan == null && bVlan == null) {
    return { check: { id: 'l2-vlan', status: 'na', summary: 'tanpa konfigurasi VLAN', details: [] } };
  }
  const vlan = aVlan ?? bVlan;
  return { check: { id: 'l2-vlan', status: 'ok', summary: `access VLAN ${vlan}`, details: [] } };
}

function evaluateOspf(a: EndpointRuntime, b: EndpointRuntime): { check: LinkCheck } {
  const aOn = ospfEnabled(a.dev);
  const bOn = ospfEnabled(b.dev);
  if (!aOn && !bOn) {
    return { check: { id: 'ospf', status: 'na', summary: 'OSPF tidak dikonfigurasi', details: [] } };
  }
  if (aOn !== bOn) {
    const missing = aOn ? b : a;
    return {
      check: {
        id: 'ospf',
        status: 'fail',
        summary: `OSPF hanya dikonfigurasi di satu sisi (${missing.name})`,
        details: [`network statement wajib ada di kedua router agar adjacency terbentuk`],
      },
    };
  }
  const aIp = parseIp(a);
  const bIp = parseIp(b);
  const aPart = ospfParticipates(a.dev, aIp);
  const bPart = ospfParticipates(b.dev, bIp);
  if (!aPart || !bPart) {
    const missing = aPart ? b : a;
    return {
      check: {
        id: 'ospf',
        status: 'fail',
        summary: `network statement OSPF tidak mencakup interface link di ${missing.name}`,
        details: [`${a.name}: ${ipLabel(a)}`, `${b.name}: ${ipLabel(b)}`],
      },
    };
  }
  const aArea = ospfAreaOf(a.dev, aIp) ?? 0;
  const bArea = ospfAreaOf(b.dev, bIp) ?? 0;
  if (aArea !== bArea) {
    return {
      check: {
        id: 'ospf',
        status: 'fail',
        summary: `OSPF area beda (${a.name}: area ${aArea}, ${b.name}: area ${bArea})`,
        details: ['area harus sama agar adjacency Full'],
      },
    };
  }
  return { check: { id: 'ospf', status: 'ok', summary: `OSPF siap (area ${aArea})`, details: [] } };
}

function evaluateBgp(a: EndpointRuntime, b: EndpointRuntime): { check: LinkCheck } {
  const aCfg = a.dev.bgpCfg;
  const bCfg = b.dev.bgpCfg;
  const aHas = !!(aCfg && aCfg.asn && aCfg.peers.length > 0);
  const bHas = !!(bCfg && bCfg.asn && bCfg.peers.length > 0);
  if (!aHas && !bHas) {
    return { check: { id: 'bgp', status: 'na', summary: 'BGP tidak dikonfigurasi', details: [] } };
  }
  if (aHas !== bHas) {
    const missing = aHas ? b : a;
    return {
      check: {
        id: 'bgp',
        status: 'fail',
        summary: `BGP hanya dikonfigurasi di satu sisi (${missing.name})`,
        details: ['neighbor + remote-as wajib ada di kedua router'],
      },
    };
  }
  const aIp = parseIp(a)?.address ?? null;
  const bIp = parseIp(b)?.address ?? null;
  const aPeer = aIp ? aCfg!.peers.find((p) => p.remoteAddr === bIp) : undefined;
  const bPeer = bIp ? bCfg!.peers.find((p) => p.remoteAddr === aIp) : undefined;
  if (!aPeer && !bPeer) {
    return {
      check: {
        id: 'bgp',
        status: 'fail',
        summary: 'tidak ada neighbor BGP yang menunjuk IP ujung link ini',
        details: [`${a.name}: AS ${aCfg!.asn}`, `${b.name}: AS ${bCfg!.asn}`],
      },
    };
  }
  const problems: string[] = [];
  if (aPeer && aPeer.remoteAs !== bCfg!.asn) {
    problems.push(`${a.name}: remote-as ${aPeer.remoteAs} ≠ AS ${b.name} (${bCfg!.asn})`);
  }
  if (bPeer && bPeer.remoteAs !== aCfg!.asn) {
    problems.push(`${b.name}: remote-as ${bPeer.remoteAs} ≠ AS ${a.name} (${aCfg!.asn})`);
  }
  if (problems.length > 0) {
    return { check: { id: 'bgp', status: 'fail', summary: 'BGP remote-as tidak cocok', details: problems } };
  }
  return {
    check: { id: 'bgp', status: 'ok', summary: `BGP siap (AS ${aCfg!.asn} ↔ AS ${bCfg!.asn})`, details: [] },
  };
}

/** Evaluasi semua edge — dipakai UI untuk badge status tiap kabel. */
export function evaluateAllLinkReadiness(sim: NetworkSimulator): Map<string, LinkReadiness> {
  const out = new Map<string, LinkReadiness>();
  for (const link of sim.topology.links.all) {
    out.set(link.id, evaluateLinkReadiness(sim, link.id));
  }
  return out;
}
