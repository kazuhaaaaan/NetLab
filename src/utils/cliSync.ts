// ============================================================
// cliSync — jalur otorisatif sinkronisasi CLI → simulation engine.
//
// Satu-satunya tempat state konfigurasi vendor (NodeMemory) diterjemahkan
// menjadi config engine (NetworkSimulator). App.tsx dan seluruh replica
// test memakai helper ini — tidak boleh ada salinan duplikat di tempat lain.
//
// Setiap translasi DIVALIDASI di sini (fase audit "CLI → engine validation"):
//   - rute: hanya entri dengan dst+gateway string
//   - BGP: hanya jika asn sudah berupa angka valid (blank '' = belum dikonfigurasi)
//   - ACL: hanya aksi permit/deny yang dikenal engine
//   - NAT: hanya chain srcnat/dstnat dengan action string
//   - STP: mode divalidasi terhadap StpMode; default rstp bila tidak dikenal
//   - FHRP: virtualAddress diambil dari virtualAddress|virtualIp; di-skip bila kosong
//   - queue: hanya entri lengkap name/target/maxLimit
//   - dhcpRelays / portSecurity: nilai di-filter ke tipe yang diterima engine
// ============================================================
import type { SimulationEngine, BgpConfig, BgpPeerConfig } from '../engine/net';
import type { AclRule, NatRule, DhcpPoolInfo } from '../engine/net';
import type { StpConfig, StpMode } from '../engine/net/services/StpService';
import type { SimpleQueue, MangleRule } from '../engine/net/services/QosService';
import type { FhrpGroup } from '../engine/net/services/FhrpService';
import type { VendorDispatcher, NodeMemory } from '../../packages/vendors/src/index';

const STP_MODES: readonly StpMode[] = ['stp', 'rstp', 'mst', 'pvst', 'rapid-pvst'];

function isRouteEntry(r: NodeMemory['routes'][number]): r is { dst: string; gateway: string; distance?: number } {
  return typeof r.dst === 'string' && typeof r.gateway === 'string';
}

function bgpConfigOf(bgp: NodeMemory['bgp'] | undefined): BgpConfig | undefined {
  if (!bgp || typeof bgp.asn !== 'number' || !(bgp.asn >= 1)) return undefined;
  const peers: BgpPeerConfig[] = [];
  for (const p of bgp.peers) {
    if (typeof p.remoteAs !== 'number' || typeof p.remoteAddr !== 'string' || !p.remoteAddr) continue;
    peers.push({
      remoteAs: p.remoteAs,
      remoteAddr: p.remoteAddr,
    });
  }
  return { asn: bgp.asn, peers, networks: bgp.networks || [], routerId: bgp.routerId || undefined };
}

function aclsOf(rules: NodeMemory['acls'] | undefined): AclRule[] | undefined {
  if (!rules || rules.length === 0) return undefined;
  const out: AclRule[] = [];
  for (const r of rules) {
    if (r.action !== 'permit' && r.action !== 'deny') continue;
    out.push({
      action: r.action,
      aclId: typeof r.aclId === 'number' || typeof r.aclId === 'string' ? r.aclId : undefined,
      proto: typeof r.proto === 'string' ? r.proto : undefined,
      src: r.src,
      dst: r.dst,
      srcPort: r.srcPort,
      dstPort: r.dstPort,
      inInterface: typeof r.inInterface === 'string' ? r.inInterface : undefined,
      outInterface: typeof r.outInterface === 'string' ? r.outInterface : undefined,
    });
  }
  return out.length > 0 ? out : undefined;
}

function natRulesOf(rules: NodeMemory['natRules'] | undefined): NatRule[] | undefined {
  if (!rules || rules.length === 0) return undefined;
  const out: NatRule[] = [];
  for (const r of rules) {
    if (r.chain !== 'srcnat' && r.chain !== 'dstnat') continue;
    if (typeof r.action !== 'string') continue;
    out.push({
      chain: r.chain,
      action: r.action,
      outInterface: r.outInterface,
      srcAddress: r.srcAddress,
      protocol: r.protocol,
      dstAddress: r.dstAddress,
      dstPort: r.dstPort,
      toAddresses: r.toAddresses,
      toPorts: r.toPorts,
    });
  }
  return out.length > 0 ? out : undefined;
}

function stpOf(stp: NodeMemory['stp'] | undefined): StpConfig | undefined {
  if (!stp) return undefined;
  const mode: StpMode = STP_MODES.includes(stp.mode as StpMode) ? (stp.mode as StpMode) : 'rstp';
  return {
    enabled: stp.enabled ?? true,
    priority: typeof stp.priority === 'number' ? stp.priority : 32768,
    mode,
  };
}

function fhrpOf(groups: NodeMemory['fhrpGroups'] | undefined): FhrpGroup[] | undefined {
  if (!groups || groups.length === 0) return undefined;
  const out: FhrpGroup[] = [];
  for (const g of groups) {
    const virtualAddress = typeof g.virtualAddress === 'string'
      ? g.virtualAddress
      : typeof g.virtualIp === 'string' ? g.virtualIp : '';
    if (!virtualAddress) continue;
    out.push({
      virtualAddress,
      interface: typeof g.interface === 'string' ? g.interface : g.iface,
      vrid: typeof g.vrid === 'number' ? g.vrid : undefined,
      priority: typeof g.priority === 'number' ? g.priority : 100,
      interval: typeof g.interval === 'number' ? g.interval : undefined,
    });
  }
  return out.length > 0 ? out : undefined;
}

function queuesOf(queues: NodeMemory['queues'] | undefined): SimpleQueue[] | undefined {
  if (!queues || queues.length === 0) return undefined;
  const out: SimpleQueue[] = [];
  for (const q of queues) {
    if (typeof q.name !== 'string' || typeof q.target !== 'string' || typeof q.maxLimit !== 'string') continue;
    out.push({ name: q.name, target: q.target, maxLimit: q.maxLimit });
  }
  return out.length > 0 ? out : undefined;
}

function dhcpRelaysOf(relays: NodeMemory['dhcpRelays'] | undefined): Record<string, string> | undefined {
  if (!relays) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(relays)) {
    if (typeof v === 'string') out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function mangleRulesOf(rules: NodeMemory['mangleRules'] | undefined): MangleRule[] | undefined {
  if (!rules || rules.length === 0) return undefined;
  const out: MangleRule[] = [];
  for (const r of rules) {
    if (typeof r.chain !== 'string') continue;
    out.push({
      chain: r.chain,
      protocol: r.protocol,
      srcAddress: r.srcAddress,
      dstAddress: r.dstAddress,
      action: r.action,
      newPacketMark: typeof r.newPacketMark === 'string' ? r.newPacketMark : undefined,
      packetMark: typeof r.packetMark === 'string' ? r.packetMark : undefined,
      newMss: typeof r.newMss === 'string' ? r.newMss : undefined,
    });
  }
  return out.length > 0 ? out : undefined;
}

/** Dorong SEMUA state konfigurasi CLI sebuah node ke simulation engine
 *  (IP, rute statis, routing dinamis, BGP, ACL, NAT, VLAN port,
 *  interface shutdown/up, subinterface, trunk, STP, FHRP, QoS, ...). */
export function syncNodeToEngine(sim: SimulationEngine, dis: VendorDispatcher, nodeId: string): void {
  const mem = dis.getNodeMemory(nodeId);

  // Hostname stateful: konfigurasi CLI (hostname R1 / /system identity set /
  // set hostname …) menjadi state perangkat — prompt & identitas mengikutinya.
  sim.setHostname(nodeId, mem.hostname || undefined);
  sim.setSubinterfaces(nodeId, mem.subinterfaces || undefined);
  sim.setShutdownIfaces(nodeId, mem.shutdownIfaces || undefined);
  sim.applyNodeConfig(nodeId, mem.configuredIps, mem.routes.filter(isRouteEntry));
  sim.applyNodeConfig6(nodeId, mem.configuredIps6 || {}, mem.routes6.filter(isRouteEntry));
  sim.setRouting(nodeId, mem.routing || undefined);
  sim.setBgp(nodeId, bgpConfigOf(mem.bgp));
  sim.setSnmp(nodeId, mem.snmp || undefined);
  sim.setAcls(nodeId, aclsOf(mem.acls));
  sim.setNatRules(nodeId, natRulesOf(mem.natRules));
  sim.setDnsRecords(nodeId, mem.dnsRecords || undefined);
  sim.setDnsServers(nodeId, mem.dnsServers || undefined);
  sim.setWebServer(nodeId, mem.webServer || undefined);
  sim.setPortVlans(nodeId, mem.portVlans || undefined);
  sim.setTrunkPorts(nodeId, mem.trunkPorts || undefined);
  // Allowed/native VLAN trunk (switchport trunk allowed/native vlan) — disinkronkan
  // ke engine supaya SwitchProcessor benar-benar menegakkannya.
  sim.setTrunkAllowed(nodeId, mem.trunkAllowed || undefined);
  sim.setTrunkNative(nodeId, mem.trunkNative || undefined);
  // Database VLAN otoritatif (vlan 10 / /interface vlan add / set vlans …)
  // disinkronkan ke VlanTable engine — memori vendor tidak boleh menjadi
  // satu-satunya tempat "VLAN dikonfigurasi" (state divergence).
  sim.setVlans(nodeId, mem.vlans || undefined);
  sim.setDhcpRelays(nodeId, dhcpRelaysOf(mem.dhcpRelays));
  sim.setPortSecurity(nodeId, mem.portSecurity || undefined);
  sim.setStp(nodeId, stpOf(mem.stp));
  sim.setFhrp(nodeId, fhrpOf(mem.fhrpGroups));
  sim.setWireless(
    nodeId,
    mem.wireless || mem.wirelessSecurityProfiles
      ? { interfaces: mem.wireless || {}, profiles: mem.wirelessSecurityProfiles || {} }
      : undefined
  );
  sim.setQos(nodeId, queuesOf(mem.queues), mangleRulesOf(mem.mangleRules));
  sim.setIpv6DhcpClients(nodeId, mem.ipv6DhcpClients || undefined);
  sim.computeDynamicRoutes();
}

/** Sinkronkan pool DHCP dari konfigurasi CLI (MikroTik/Cisco/etc.) ke simulation engine.
 *  excluded-address global (Cisco) berlaku untuk semua pool perangkat. */
export function syncDhcpPools(sim: SimulationEngine, dis: VendorDispatcher): void {
  const poolsByNode: Record<string, DhcpPoolInfo[]> = {};
  for (const [nodeId, m] of Object.entries(dis.serializeMemory())) {
    if (m && Array.isArray(m.dhcpPools) && m.dhcpPools.length > 0) {
      const excl = Array.isArray(m.dhcpExcluded) ? m.dhcpExcluded : [];
      const resv = Array.isArray(m.dhcpReservations) ? m.dhcpReservations : [];
      poolsByNode[nodeId] = excl.length > 0 || resv.length > 0
        ? m.dhcpPools.map((p) => {
            const rec = { ...p } as Record<string, unknown>;
            const prev = Array.isArray(rec.excluded) ? (rec.excluded as string[]) : [];
            const prevResv = Array.isArray(rec.reservations) ? (rec.reservations as { mac: string; ip: string }[]) : [];
            return {
              ...p,
              excluded: [...new Set([...prev, ...excl])],
              reservations: [...prevResv, ...resv],
            };
          })
        : m.dhcpPools;
    }
  }
  sim.setDhcpPools(poolsByNode);
}