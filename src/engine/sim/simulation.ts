import { LabProject } from '../../types';
import { SimDevice, SimRoute, SimIface } from './simdevice';
import {
  isValidIp,
  inSameSubnet,
  ipToInt,
  intToIp,
  networkOf,
  parseCidr,
  maskToPrefix,
  prefixToMask,
} from './ip';

export interface SimLink {
  id: string;
  nodeIdA: string;
  portIdA: string;
  portNameA: string;
  nodeIdB: string;
  portIdB: string;
  portNameB: string;
}

export interface PingSimResult {
  success: boolean;
  /** device names in path order (source first) */
  path: string[];
  /** edge ids in traversal order (source → destination) */
  edgeIds: string[];
  /** TTL as observed by the destination device */
  ttlAtDestination: number;
  /** true when the source obtained an IP automatically via DHCP */
  dhcpGranted?: boolean;
  /** round-trip time (ms) dari latensi kabel di lintasan */
  rttMs?: number;
  reason?: 'no-ip' | 'invalid' | 'not-found' | 'unreachable' | 'ttl' | 'self' | 'blocked' | 'power' | 'refused';
}

interface PathResult {
  ok: boolean;
  path?: SimDevice[];
  edges?: string[];
  ttl?: number;
  /** jalur parsial (edge ids) yang sudah dilewati sebelum paket gagal — untuk animasi merah */
  passedEdges?: string[];
  reason?: 'ttl' | 'unreachable' | 'blocked' | 'power';
}

export interface DhcpPoolInfo {
  name: string;
  range?: string;
  network?: string;
  iface?: string;
  gateway?: string;
}

export interface DeviceStatsSnapshot {
  name: string;
  deviceType: string;
  interfaces: { name: string; mac: string; ip: string | null; ipv6: string | null; up: boolean }[];
  arp: { ip: string; mac: string }[];
  macTable: { mac: string; port: string }[];
  routes: { dst: string; gateway: string; iface: string; kind: string }[];
  /** status spanning-tree per port (switch saja) */
  stp?: {
    rootId: string;
    rootName: string;
    rootPort: string | null;
    ports: { port: string; role: string; state: string; cost: number }[];
  };
  /** kelompok VRRP yang diikuti (router saja) */
  fhrp?: {
    virtualAddress: string;
    vip: string;
    isMaster: boolean;
    masterName: string;
    priority: number;
    interface?: string;
    vrid?: number;
  }[];
}

export interface DhcpLeaseInfo {
  nodeId: string;
  ip: string;
  gateway: string;
  prefix: number;
  poolNodeId: string;
}

export interface DhcpLeaseGrant {
  ip: string;
  gateway: string;
  prefix: number;
  poolNodeId: string;
}

/** Routing protocol state as configured via CLI (per device). */
export interface RoutingMemoryShape {
  ospf?: { enabled?: boolean; networks?: string[]; interfaceCosts?: Record<string, number>; passiveInterfaces?: string[] };
  rip?: { enabled?: boolean; networks?: string[] };
  eigrp?: { enabled?: boolean; asn?: number; networks?: string[] };
}

export interface BgpPeerConfig {
  remoteAs: number;
  remoteAddr: string;
}

export interface BgpConfig {
  asn: number;
  peers: BgpPeerConfig[];
  networks: string[];
}

/** Access-list / firewall filter rule (global on the device). */
export interface AclRule {
  action: 'permit' | 'deny';
  proto?: string;
  src?: string;
  dst?: string;
}

export interface NatRule {
  chain: string;
  outInterface?: string;
  action: string;
  srcAddress?: string;
  /** dstnat: protocol filter (tcp/udp/icmp/any) */
  protocol?: string;
  /** dstnat: destination address / subnet that must contain the packet's dest IP */
  dstAddress?: string;
  /** dstnat: destination port or range, e.g. "8080" or "8000-8090" */
  dstPort?: string;
  /** dstnat: inside target address(es) */
  toAddresses?: string;
  /** dstnat: inside target port(s) */
  toPorts?: string;
}

/** True when `port` is inside "p" or "lo-hi" (MikroTik dst-port syntax). */
export function portInRange(port: number, spec: string | undefined): boolean {
  if (!spec) return true;
  const m = spec.trim().match(/^(\d+)(?:-(\d+))?$/);
  if (!m) return false;
  const lo = parseInt(m[1], 10);
  const hi = m[2] ? parseInt(m[2], 10) : lo;
  return port >= lo && port <= hi;
}

/** True when `ip` is inside the CIDR-ish spec ("10.0.0.0/24", "10.0.0.5" or "10.0.0.5/32"). */
export function ipInCidrSpec(ip: string, spec: string | undefined): boolean {
  if (!spec) return true;
  const c = parseCidr(spec);
  if (!c) return false;
  return networkOf(ip, c.prefix) === networkOf(c.address, c.prefix);
}

/** Static DNS A-record configured on a device (e.g. MikroTik "/ip dns static"). */
export interface DnsRecord {
  name: string;
  address: string;
}

/** Web server service state of a device (nginx / www / httpd). */
export interface WebServerInfo {
  enabled: boolean;
  port: number;
  content: string;
}

export interface DnsResolution {
  resolved: string | null;
  /** IP of the DNS server that answered (or 'self' for local records). */
  server?: string;
  /** no DNS server configured / unreachable */
  timedOut?: boolean;
  /** server answered but the name does not exist */
  nxdomain?: boolean;
}

interface TableEntry {
  dst: string;
  gateway: string;
  metric: number;
}

export interface TracerouteHop {
  name: string;
  ttl: number;
  ip: string | null;
}

export interface TracerouteResult {
  ok: boolean;
  hops: TracerouteHop[];
  reason?: PingSimResult['reason'];
}

export interface LldpNeighborInfo {
  peerNodeId: string;
  peerName: string;
  peerDeviceType: string;
  localPort: string;
  peerPort: string;
}

export interface OspfNeighborInfo {
  routerId: string;
  ip: string;
  iface: string;
  state: string;
}

export interface BgpNeighborStateInfo {
  remoteAddr: string;
  remoteAs: number;
  state: 'Established' | 'Idle' | 'Connect';
  uptime: string;
  prefixes: number;
}

export interface TcpConnectionInfo {
  localIp: string;
  localPort: number;
  remoteIp: string;
  remotePort: number;
  state: 'LISTEN' | 'ESTABLISHED' | 'TIME_WAIT';
  proto: string;
}

export interface TcpHandshakeSegment {
  seq: number;
  ack: number;
  flags: string;
}

export interface TcpConnectResult {
  ok: boolean;
  reason?: PingSimResult['reason'];
  handshake: TcpHandshakeSegment[];
  /** HTTP status when the connection reached a web server (200). */
  status?: number;
  /** Web server body when the connection reached a web server. */
  body?: string;
}

/**
 * NetLab real network simulation engine.
 *
 * Maintains per-device state (interfaces, IPs, routes, ARP caches),
 * derives links from the topology edges and routes packets hop-by-hop
 * with longest-prefix-match, TTL decrement and ICMP error generation.
 */
export class SimulationEngine {
  private devices = new Map<string, SimDevice>();
  private links: SimLink[] = [];

  /** CLI-configured state (survives topology re-sync, undo/redo) */
  private configs = new Map<string, { ips: Record<string, string>; routes: SimRoute[] }>();

  /** DHCP pools configured via CLI, keyed by the serving node id. */
  private dhcpPools = new Map<string, DhcpPoolInfo[]>();
  /** client nodeId → granted lease */
  private leases = new Map<string, DhcpLeaseGrant>();

  /** dynamic routing protocols (OSPF/RIP/EIGRP) per device, as configured via CLI */
  private routings = new Map<string, RoutingMemoryShape>();
  /** BGP per device */
  private bgps = new Map<string, BgpConfig>();
  /** ACL / firewall filter rules per device */
  private acls = new Map<string, AclRule[]>();
  /** NAT rules per device */
  private nats = new Map<string, NatRule[]>();
  /** access-VLAN per port: nodeId → ifaceName → vlanId */
  private portVlans = new Map<string, Map<string, number>>();
  /** interfaces administratively shut down via CLI: nodeId → iface names */
  private shutIfaces = new Map<string, Set<string>>();
  /** VLAN subinterfaces: nodeId → subname → { parentPort, vlanId } */
  private subinterfaces = new Map<string, Map<string, { parentPort: string; vlanId: number }>>();
  /** trunk ports on switches: nodeId → iface names (carry all VLANs) */
  private trunkPorts = new Map<string, Set<string>>();
  /** devices powered off (absent = powered on) */
  private poweredOff = new Set<string>();
  /** TCP connections established during this session: nodeId → connections */
  private tcpConnections = new Map<string, TcpConnectionInfo[]>();
  /** static DNS A-records per device: nodeId → records */
  private dnsRecords = new Map<string, DnsRecord[]>();
  /** DNS servers configured on each device: nodeId → server IPs */
  private dnsServers = new Map<string, string[]>();
  /** web server service per device: nodeId → info (absent = nginx default :80) */
  private webServers = new Map<string, WebServerInfo>();

  syncTopology(project: LabProject): void {
    const seen = new Set<string>();

    for (const node of project.nodes) {
      seen.add(node.id);
      let dev = this.devices.get(node.id);
      if (!dev) {
        dev = new SimDevice(node.id, node.name, node.deviceType, node.ports);
        this.devices.set(node.id, dev);
      } else {
        dev.setName(node.name);
        dev.syncPorts(node.ports);
      }
      const cfg = this.configs.get(node.id);
      if (cfg) this.applyConfigToDevice(dev, cfg);
    }

    for (const id of [...this.devices.keys()]) {
      if (!seen.has(id)) {
        this.devices.delete(id);
        this.leases.delete(id);
        this.routings.delete(id);
        this.bgps.delete(id);
        this.acls.delete(id);
        this.nats.delete(id);
        this.portVlans.delete(id);
        this.shutIfaces.delete(id);
        this.subinterfaces.delete(id);
        this.trunkPorts.delete(id);
        this.poweredOff.delete(id);
        this.tcpConnections.delete(id);
        this.dnsRecords.delete(id);
        this.dnsServers.delete(id);
        this.webServers.delete(id);
      }
    }

    this.links = project.edges.flatMap((edge) => {
      const src = project.nodes.find((n) => n.id === edge.sourceNodeId);
      const tgt = project.nodes.find((n) => n.id === edge.targetNodeId);
      if (!src || !tgt) return [];
      const sp = src.ports.find((p) => p.id === edge.sourcePortId);
      const tp = tgt.ports.find((p) => p.id === edge.targetPortId);
      if (!sp || !tp) return [];
      return [
        {
          id: edge.id,
          nodeIdA: src.id,
          portIdA: sp.id,
          portNameA: sp.name,
          nodeIdB: tgt.id,
          portIdB: tp.id,
          portNameB: tp.name,
        },
      ];
    });

    // Topology changed → protocol-learned routes are stale
    this.applyIfaceStates();
    this.computeDynamicRoutes();
  }

  getDevice(nodeId: string): SimDevice | undefined {
    return this.devices.get(nodeId);
  }

  /** Turn a device on/off. Powered-off devices cannot be traversed by packets. */
  setNodePowered(nodeId: string, on: boolean): void {
    if (on) this.poweredOff.delete(nodeId);
    else this.poweredOff.add(nodeId);
  }

  isNodePowered(nodeId: string): boolean {
    return !this.poweredOff.has(nodeId);
  }

  /** Apply CLI-configured IPs/routes (from VendorDispatcher memory). */
  applyNodeConfig(
    nodeId: string,
    ips: Record<string, string>,
    routes: Array<{ dst: string; gateway: string }>
  ): void {
    const existing = this.configs.get(nodeId);
    const cfg = {
      ips: { ...(existing?.ips || {}), ...ips },
      routes: routes.map((r) => ({
        dst: r.dst,
        gateway: r.gateway || null,
        iface: null,
        kind: 'static' as const,
      })),
    };
    this.configs.set(nodeId, cfg);
    const dev = this.devices.get(nodeId);
    if (dev) {
      this.applyConfigToDevice(dev, cfg);
      this.applyIfaceStates();
    }
  }

  private applyConfigToDevice(dev: SimDevice, cfg: { ips: Record<string, string>; routes: SimRoute[] }): void {
    for (const [ifaceName, cidr] of Object.entries(cfg.ips)) {
      // Tolak alamat network/broadcast sebagai host — bukan IP yang bisa dipakai.
      const parsed = parseCidr(cidr);
      if (parsed && (parsed.prefix > 30 || (ipToInt(parsed.address) === networkOf(parsed.address, parsed.prefix)) || ((ipToInt(parsed.address) | (~prefixToMask(parsed.prefix) >>> 0)) >>> 0) === ipToInt(parsed.address))) continue;
      dev.setIpByName(ifaceName, cidr);
    }
    dev.clearStaticRoutes();
    for (const r of cfg.routes) {
      if (r.gateway) dev.addStaticRoute(r.dst, r.gateway);
    }
  }

  /** Register DHCP pools configured via CLI (per serving node). */
  setDhcpPools(poolsByNode: Record<string, DhcpPoolInfo[]>): void {
    this.dhcpPools.clear();
    for (const [nodeId, pools] of Object.entries(poolsByNode)) {
      if (Array.isArray(pools) && pools.length > 0) {
        this.dhcpPools.set(nodeId, pools);
      }
    }
  }

  // ============================================================
  // Dynamic routing, ACL, NAT & VLAN configuration (from CLI)
  // ============================================================

  setRouting(nodeId: string, cfg: RoutingMemoryShape | undefined): void {
    const enabled = cfg && (cfg.ospf?.enabled || cfg.rip?.enabled || cfg.eigrp?.enabled);
    if (enabled) this.routings.set(nodeId, cfg);
    else this.routings.delete(nodeId);
  }

  setBgp(nodeId: string, cfg: BgpConfig | undefined): void {
    if (cfg && cfg.asn) this.bgps.set(nodeId, cfg);
    else this.bgps.delete(nodeId);
  }

  setAcls(nodeId: string, rules: AclRule[] | undefined): void {
    if (rules && rules.length > 0) this.acls.set(nodeId, rules);
    else this.acls.delete(nodeId);
  }

  setNatRules(nodeId: string, rules: NatRule[] | undefined): void {
    if (rules && rules.length > 0) this.nats.set(nodeId, rules);
    else this.nats.delete(nodeId);
  }

  setDnsRecords(nodeId: string, records: DnsRecord[] | undefined): void {
    if (records && records.length > 0) this.dnsRecords.set(nodeId, records);
    else this.dnsRecords.delete(nodeId);
  }

  setDnsServers(nodeId: string, servers: string[] | undefined): void {
    if (servers && servers.length > 0) this.dnsServers.set(nodeId, servers);
    else this.dnsServers.delete(nodeId);
  }

  setWebServer(nodeId: string, info: WebServerInfo | undefined): void {
    if (info) this.webServers.set(nodeId, info);
    else this.webServers.delete(nodeId);
  }

  /** Device that owns `ip` on one of its interfaces (CLI-configured or port IP). */
  private deviceByIp(ip: string): SimDevice | null {
    for (const dev of this.devices.values()) {
      if (dev.hasIp(ip)) return dev;
    }
    return null;
  }

  /**
   * Resolve a hostname the way the device would: its own static records
   * first, then its configured DNS servers. Unreachable/missing servers
   * yield a timeout; a server answering "unknown name" yields NXDOMAIN.
   */
  resolveHostname(nodeId: string, name: string): DnsResolution {
    const n = name.toLowerCase().replace(/\.$/, '');
    const own = (this.dnsRecords.get(nodeId) || []).find(
      (r) => r.name.toLowerCase() === n || r.name.toLowerCase() === n + '.'
    );
    if (own) return { resolved: own.address, server: 'self' };

    const servers = this.dnsServers.get(nodeId) || [];
    if (servers.length === 0) return { resolved: null, timedOut: true };

    for (const srvIp of servers) {
      const srv = this.deviceByIp(srvIp);
      if (!srv || !this.isNodePowered(srv.id)) continue;
      const rec = (this.dnsRecords.get(srv.id) || []).find((r) => r.name.toLowerCase() === n);
      if (rec) return { resolved: rec.address, server: srvIp };
    }
    return { resolved: null, nxdomain: true };
  }

  setPortVlans(nodeId: string, vlanByIface: Record<string, number> | undefined): void {
    const has = vlanByIface && Object.keys(vlanByIface).length > 0;
    if (has) {
      this.portVlans.set(nodeId, new Map(Object.entries(vlanByIface as Record<string, number>)));
    } else {
      this.portVlans.delete(nodeId);
    }
  }

  /** Register interfaces administratively shut down via CLI (shutdown / disable). */
  setShutdownIfaces(nodeId: string, names: string[] | undefined): void {
    if (names && names.length > 0) this.shutIfaces.set(nodeId, new Set(names));
    else this.shutIfaces.delete(nodeId);
  }

  /** Register VLAN subinterfaces (router-on-a-stick): name → physical port + tag. */
  setSubinterfaces(nodeId: string, subs: { name: string; parentPort: string; vlanId: number }[] | undefined): void {
    const map = new Map<string, { parentPort: string; vlanId: number }>();
    for (const s of subs || []) map.set(s.name, { parentPort: s.parentPort, vlanId: s.vlanId });
    this.subinterfaces.set(nodeId, map);
    const dev = this.devices.get(nodeId);
    if (dev) {
      for (const [name, s] of map) dev.addVirtualIface(name, s.parentPort, s.vlanId, '');
    }
  }

  /** Mark switch ports as trunks (forward every VLAN). */
  setTrunkPorts(nodeId: string, names: string[] | undefined): void {
    if (names && names.length > 0) this.trunkPorts.set(nodeId, new Set(names));
    else this.trunkPorts.delete(nodeId);
  }

  /** Re-apply shutdown states after any topology/config (re)sync. */
  private applyIfaceStates(): void {
    for (const [nodeId, names] of this.shutIfaces) {
      const dev = this.devices.get(nodeId);
      if (!dev) continue;
      for (const name of names) dev.setIfaceUp(name, false);
    }
  }

  /**
   * Recompute all routes learned from dynamic routing protocols.
   * Simple distance-vector over the L2 adjacency graph:
   * - OSPF/RIP/EIGRP: routers announce the subnets of their participating
   *   interfaces (matched against "network" statements); neighbors are
   *   routers sharing an L2 segment (direct link or via switches).
   * - BGP: neighbors are configured peers that are IP-reachable; each
   *   router announces its connected subnets + its BGP networks.
   */
  computeDynamicRoutes(): void {
    for (const dev of this.devices.values()) dev.clearDynamicRoutes();

    const segments = this.buildSegments();
    this.computeProtocolRoutes(segments);
    this.computeBgpRoutes();
  }

  /** L2 segments as a map: link-port → segment key. */
  private computeProtocolRoutes(segments: Map<string, string>): void {
    const tables = new Map<string, TableEntry[]>();
    const devices = [...this.devices.values()].filter((d) => !d.isSwitch);

    // seed: connected subnets of participating interfaces
    for (const dev of devices) {
      const cfg = this.routings.get(dev.id);
      if (!cfg) continue;
      const proto = cfg.ospf?.enabled ? 'ospf' : cfg.rip?.enabled ? 'rip' : cfg.eigrp?.enabled ? 'eigrp' : null;
      if (!proto) continue;
      const nets = cfg[proto]?.networks || [];
      const normalized = nets
        .map((n) => this.normalizeNetworkEntry(dev, n))
        .filter((n): n is string => !!n);
      if (normalized.length === 0) continue;
      const entries: TableEntry[] = [];
      for (const iface of dev.getInterfaces()) {
        if (!iface.ip || !iface.up) continue;
        const subnet = `${intToIp(networkOf(iface.ip.address, iface.ip.prefix))}/${iface.ip.prefix}`;
        const participates = normalized.some((net) => {
          const parsed = parseCidr(net);
          if (!parsed) return false;
          // interface subnet must be contained in the "network" statement:
          // compare both at the finer of the two prefixes
          const pa = Math.min(iface.ip.prefix, parsed.prefix);
          return inSameSubnet(iface.ip.address, pa, parsed.address);
        });
        if (participates) entries.push({ dst: subnet, gateway: '', metric: 0 });
      }
      if (entries.length > 0) tables.set(dev.id, entries);
    }

    // distance-vector rounds (Bellman-Ford style)
    for (let round = 0; round < devices.length; round++) {
      const candidates: { peerId: string; dst: string; gateway: string; metric: number }[] = [];
      for (const dev of devices) {
        const myEntries = tables.get(dev.id);
        if (!myEntries) continue;
        const myKeys = new Set<string>();
        for (const link of this.linksOfDevice(dev.id)) {
          myKeys.add(this.segmentKeyOfLink(link, dev.id, segments));
        }
        for (const key of myKeys) {
          const myIp = this.ipOnSegment(dev.id, key, segments);
          if (!myIp) continue;
          for (const other of devices) {
            if (other.id === dev.id) continue;
            if (!this.routings.has(other.id)) continue;
            const otherIp = this.ipOnSegment(other.id, key, segments);
            if (!otherIp) continue;
            for (const e of myEntries) {
              candidates.push({ peerId: other.id, dst: e.dst, gateway: myIp, metric: e.metric + 1 });
            }
          }
        }
      }
      if (candidates.length === 0) break;
      let changed = false;
      for (const c of candidates) {
        const peer = this.devices.get(c.peerId);
        if (!peer) continue;
        if (peer.hasIp(c.gateway)) continue; // don't route back to itself
        const list = tables.get(c.peerId) || [];
        const existing = list.find((t) => t.dst === c.dst);
        if (!existing || c.metric < existing.metric) {
          if (!existing) list.push({ dst: c.dst, gateway: c.gateway, metric: c.metric });
          else {
            existing.gateway = c.gateway;
            existing.metric = c.metric;
          }
          tables.set(c.peerId, list);
          changed = true;
        }
      }
      if (!changed) break;
    }

    // install routes
    for (const [devId, entries] of tables) {
      const dev = this.devices.get(devId);
      if (!dev) continue;
      for (const e of entries) {
        if (!e.gateway) continue;
        dev.addDynamicRoute(e.dst, e.gateway, 'dynamic');
      }
    }
  }

  /**
   * L2 segments as a map: link-port → segment key.
   * - switch↔switch ports share a "switch cloud" key (union-find)
   * - a non-switch device plugged into a switch joins that cloud
   * - point-to-point links (router↔router, router↔host, host↔host)
   *   are their own segment, so a router never bridges two clouds.
   */
  private buildSegments(): Map<string, string> {
    const parent = new Map<string, string>();
    const find = (a: string): string => {
      let r = parent.get(a) || a;
      if (parent.has(r)) {
        r = find(r);
        parent.set(a, r);
      }
      return r;
    };
    const union = (a: string, b: string) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    };

    const isSwitchNode = (id: string) => this.devices.get(id)?.isSwitch ?? false;
    for (const link of this.links) {
      if (isSwitchNode(link.nodeIdA) && isSwitchNode(link.nodeIdB)) {
        union(link.nodeIdA, link.nodeIdB);
      }
    }

    const keyOfPort = (devId: string, portName: string): string => {
      for (const link of this.linksOfDevice(devId)) {
        const myPort = link.nodeIdA === devId ? link.portNameA : link.portNameB;
        if (myPort !== portName) continue;
        const peerId = link.nodeIdA === devId ? link.nodeIdB : link.nodeIdA;
        const aSw = isSwitchNode(devId);
        const bSw = isSwitchNode(peerId);
        if (aSw && bSw) return `cloud:${find(devId)}`;
        if (aSw) return `cloud:${find(devId)}`;
        if (bSw) return `cloud:${find(peerId)}`;
        return `ptp:${link.id}`;
      }
      return `unplugged:${devId}:${portName}`;
    };

    const segments = new Map<string, string>();
    for (const dev of this.devices.values()) {
      for (const iface of dev.getInterfaces()) {
        segments.set(`${dev.id}:${iface.name}`, keyOfPort(dev.id, iface.name));
      }
    }
    return segments;
  }

  private segmentKeyOfLink(link: SimLink, fromId: string, segments: Map<string, string>): string {
    const myPort = link.nodeIdA === fromId ? link.portNameA : link.portNameB;
    return segments.get(`${fromId}:${myPort}`) || `ptp:${link.id}`;
  }

  /** IP of device `devId` on the port that lies on L2 segment `key`. */
  private ipOnSegment(devId: string, key: string, segments: Map<string, string>): string | null {
    const dev = this.devices.get(devId);
    if (!dev) return null;
    for (const link of this.linksOfDevice(devId)) {
      const keyOf = this.segmentKeyOfLink(link, devId, segments);
      if (keyOf !== key) continue;
      const myPort = link.nodeIdA === devId ? link.portNameA : link.portNameB;
      const iface = dev.getIfaceByName(myPort) || dev.getVirtualByParentPort(myPort);
      if (iface?.ip) return iface.ip.address;
    }
    return null;
  }

  private computeBgpRoutes(): void {
    const bgpRouters = [...this.bgps.entries()].filter(([, cfg]) => cfg.asn && cfg.peers.length > 0);
    if (bgpRouters.length === 0) return;

    const tables = new Map<string, TableEntry[]>();
    for (const [devId, cfg] of bgpRouters) {
      const dev = this.devices.get(devId);
      if (!dev) continue;
      const entries: TableEntry[] = [];
      for (const iface of dev.getInterfaces()) {
        if (iface.ip && iface.up) {
          entries.push({ dst: `${intToIp(networkOf(iface.ip.address, iface.ip.prefix))}/${iface.ip.prefix}`, gateway: '', metric: 0 });
        }
      }
      for (const n of cfg.networks || []) {
        const norm = this.normalizeNetworkEntry(dev, n);
        if (norm && !entries.some((e) => e.dst === norm)) entries.push({ dst: norm, gateway: '', metric: 0 });
      }
      tables.set(devId, entries);
    }

    // adjacency: A ↔ B when A has peer B.remoteAddr and B can be reached
    const peersOf = (devId: string): string[] => {
      const out: string[] = [];
      const cfg = this.bgps.get(devId);
      if (!cfg) return out;
      for (const p of cfg.peers) {
        const peerId = this.deviceIdByIp(p.remoteAddr);
        if (peerId && this.canReach(devId, p.remoteAddr) && this.bgps.has(peerId)) out.push(peerId);
      }
      return out;
    };

    for (let round = 0; round < bgpRouters.length; round++) {
      const candidates: { peerId: string; dst: string; gateway: string; metric: number }[] = [];
      for (const [devId] of bgpRouters) {
        const myEntries = tables.get(devId);
        if (!myEntries) continue;
        const myIp = this.devices.get(devId)?.getIpAddress();
        if (!myIp) continue;
        for (const peerId of peersOf(devId)) {
          for (const e of myEntries) {
            candidates.push({ peerId, dst: e.dst, gateway: myIp, metric: e.metric + 1 });
          }
        }
      }
      if (candidates.length === 0) break;
      let changed = false;
      for (const c of candidates) {
        const peer = this.devices.get(c.peerId);
        if (!peer || peer.hasIp(c.gateway)) continue;
        const list = tables.get(c.peerId) || [];
        const existing = list.find((t) => t.dst === c.dst);
        if (!existing || c.metric < existing.metric) {
          if (!existing) list.push({ dst: c.dst, gateway: c.gateway, metric: c.metric });
          else {
            existing.gateway = c.gateway;
            existing.metric = c.metric;
          }
          tables.set(c.peerId, list);
          changed = true;
        }
      }
      if (!changed) break;
    }

    for (const [devId, entries] of tables) {
      const dev = this.devices.get(devId);
      if (!dev) continue;
      for (const e of entries) {
        if (!e.gateway) continue;
        dev.addDynamicRoute(e.dst, e.gateway, 'dynamic');
      }
    }
  }

  private deviceIdByIp(ip: string): string | null {
    for (const dev of this.devices.values()) {
      if (dev.hasIp(ip)) return dev.id;
    }
    return null;
  }

  /** Normalize a network statement: CIDR, 'ip mask', or interface name. */
  private normalizeNetworkEntry(dev: SimDevice, entry: string): string | null {
    const trimmed = entry.trim();
    const parsed = parseCidr(trimmed);
    if (parsed && (trimmed.includes('/') || trimmed.includes(' '))) {
      return `${parsed.address}/${parsed.prefix}`;
    }
    // Huawei-style wildcard: "network 10.0.0.0 0.0.0.255"
    const wm = trimmed.match(/^(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)$/);
    if (wm && isValidIp(wm[2]) && wm[2].startsWith('0')) {
      const inverted = ipToInt(wm[2]) ^ 0xffffffff;
      return `${wm[1]}/${maskToPrefix(inverted >>> 0)}`;
    }
    // interface name → its subnet
    const iface = dev.getIfaceByName(trimmed);
    if (iface?.ip) {
      return `${intToIp(networkOf(iface.ip.address, iface.ip.prefix))}/${iface.ip.prefix}`;
    }
    return null;
  }

  getLeases(): DhcpLeaseInfo[] {
    return [...this.leases.entries()].map(([nodeId, l]) => ({
      nodeId,
      ip: l.ip,
      gateway: l.gateway,
      prefix: l.prefix,
      poolNodeId: l.poolNodeId,
    }));
  }

  private linksOfDevice(nodeId: string): SimLink[] {
    return this.links.filter(
      (l) => l.nodeIdA === nodeId || l.nodeIdB === nodeId
    );
  }

  private peerViaIface(nodeId: string, ifaceName: string): SimDevice | null {
    const dev = this.devices.get(nodeId);
    // VLAN subinterfaces ride on a physical port
    const portName = dev?.getIfaceByName(ifaceName)?.parentPort || ifaceName;
    for (const link of this.linksOfDevice(nodeId)) {
      if (link.nodeIdA === nodeId && link.portNameA === portName) {
        return this.devices.get(link.nodeIdB) || null;
      }
      if (link.nodeIdB === nodeId && link.portNameB === portName) {
        return this.devices.get(link.nodeIdA) || null;
      }
    }
    return null;
  }

  private neighbors(nodeId: string): SimDevice[] {
    const out: SimDevice[] = [];
    for (const link of this.linksOfDevice(nodeId)) {
      const peerId = link.nodeIdA === nodeId ? link.nodeIdB : link.nodeIdA;
      const peer = this.devices.get(peerId);
      if (peer) out.push(peer);
    }
    return out;
  }

  /** Learn ARP + MAC-table entries when a frame hops between two devices. */
  private learnHop(src: SimDevice, peer: SimDevice, link: SimLink): void {
    const srcPort = link.nodeIdA === src.id ? link.portNameA : link.portNameB;
    const peerPort = link.nodeIdA === peer.id ? link.portNameA : link.portNameB;
    const srcIf = src.getIfaceByName(srcPort) || src.getVirtualByParentPort(srcPort);
    const peerIf = peer.getIfaceByName(peerPort) || peer.getVirtualByParentPort(peerPort);
    if (!srcIf || !peerIf) return;
    if (peerIf.ip) src.learnArp(peerIf.ip.address, peerIf.mac);
    if (srcIf.ip) peer.learnArp(srcIf.ip.address, srcIf.mac);
    src.macTable.set(peerIf.mac, srcPort);
    peer.macTable.set(srcIf.mac, peerPort);
  }

  /**
   * Recursive hop-by-hop packet walk.
   * - Switches (L2): flood to every neighbor, backtrack if needed.
   * - Routers/hosts (L3): longest-prefix-match routing, exit interface,
   *   TTL decrement, ICMP errors on no-route / TTL expired.
   */
  private findPath(
    src: SimDevice,
    dstIp: string,
    srcIp: string,
    ttl: number,
    visited: Set<string>,
    edges: string[],
    ingressPort?: string
  ): PathResult {
    // L3 devices: re-entry from anywhere = loop. Switches: re-entry via the
    // same port = loop, but re-entry via a different port is legitimate
    // (e.g. host → switch → router → switch → host).
    const visitKey = src.isSwitch ? `${src.id}:${ingressPort || ''}` : src.id;
    if (visited.has(visitKey)) {
      return { ok: false, reason: 'unreachable', passedEdges: [...edges] };
    }
    if (!this.isNodePowered(src.id)) {
      return { ok: false, reason: 'power', passedEdges: [...edges] };
    }

    const localIface = src.hasIp(dstIp);
    if (localIface) {
      // the destination device itself may filter ICMP via ACL / firewall
      if (this.aclBlocks(src, srcIp, dstIp)) {
        return { ok: false, reason: 'blocked', passedEdges: [...edges] };
      }
      return { ok: true, path: [src], edges: [...edges], ttl };
    }

    if (ttl <= 0) {
      return { ok: false, reason: 'ttl', passedEdges: [...edges], ttl };
    }

    const next = new Set(visited);
    next.add(visitKey);

    if (src.isSwitch) {
      let best: PathResult = {
        ok: false,
        reason: 'unreachable',
        passedEdges: [...edges],
      };
      const ingressEdgeId = edges.length > 0 ? edges[edges.length - 1] : undefined;
      for (const link of this.linksOfDevice(src.id)) {
        const peer = this.devices.get(link.nodeIdA === src.id ? link.nodeIdB : link.nodeIdA);
        if (!peer) continue;
        if (this.vlanBlocks(src.id, link, ingressEdgeId)) continue;
        const peerIngress = link.nodeIdA === peer.id ? link.portNameA : link.portNameB;
        const r = this.findPath(peer, dstIp, srcIp, ttl - 1, next, [...edges, link.id], peerIngress);
        if (r.ok) {
          this.learnHop(src, peer, link);
          return { ok: true, path: [src, ...(r.path || [])], edges: r.edges, ttl: r.ttl };
        }
        if (r.reason === 'ttl' || r.reason === 'blocked' || r.reason === 'power') {
          if (!best.passedEdges || (r.passedEdges?.length ?? 0) > best.passedEdges.length) best = r;
        }
      }
      return best;
    }

    // L3 device — ACL / firewall filter applies before forwarding
    if (this.aclBlocks(src, srcIp, dstIp)) {
      return { ok: false, reason: 'blocked', passedEdges: [...edges] };
    }

    const nh = src.nextHop(dstIp);
    if (!nh || !nh.iface) {
      return { ok: false, reason: 'unreachable', passedEdges: [...edges] };
    }

    const peer = this.peerViaIface(src.id, nh.iface);
    if (!peer) {
      return { ok: false, reason: 'unreachable', passedEdges: [...edges] };
    }

    const portName = this.physicalPortName(src.id, nh.iface);
    const link = this.linksOfDevice(src.id).find(
      (l) => (l.nodeIdA === src.id && l.portNameA === portName) || (l.nodeIdB === src.id && l.portNameB === portName)
    );
    if (!link) {
      return { ok: false, reason: 'unreachable', passedEdges: [...edges] };
    }

    const peerIngress = link.nodeIdA === peer.id ? link.portNameA : link.portNameB;
    const r = this.findPath(peer, dstIp, srcIp, ttl - 1, next, [...edges, link.id], peerIngress);
    if (r.ok) {
      this.learnHop(src, peer, link);
      return { ok: true, path: [src, ...(r.path || [])], edges: r.edges, ttl: r.ttl };
    }
    return r;
  }

  /** First-match ACL evaluation: deny → the packet is dropped. */
  private aclBlocks(dev: SimDevice, srcIp: string, dstIp: string): boolean {
    const rules = this.acls.get(dev.id);
    if (!rules || rules.length === 0) return false;
    for (const rule of rules) {
      const protoOk = !rule.proto || rule.proto === 'any' || rule.proto === 'ip' || rule.proto === 'icmp';
      if (!protoOk) continue;
      const srcOk = this.aclAddrMatches(rule.src, srcIp);
      const dstOk = this.aclAddrMatches(rule.dst, dstIp);
      if (srcOk && dstOk) return rule.action === 'deny';
    }
    return false;
  }

  private aclAddrMatches(pattern: string | undefined, ip: string): boolean {
    if (!pattern || pattern === 'any') return true;
    if (pattern.includes('/')) {
      const parsed = parseCidr(pattern);
      if (!parsed) return false;
      return inSameSubnet(ip, parsed.prefix, parsed.address);
    }
    return pattern === ip;
  }

  /**
   * VLAN isolation on switches: the packet is forwarded only when the
   * ingress and egress ports of THIS switch share the same access VLAN.
   * Trunk ports carry every VLAN (ingress trunk → any egress; egress
   * trunk → always allowed). Ports without a VLAN default to VLAN 1.
   */
  private vlanBlocks(switchId: string, egressLink: SimLink, ingressEdgeId: string | undefined): boolean {
    const vlans = this.portVlans.get(switchId);
    if (!vlans || vlans.size === 0) return false;
    const trunks = this.trunkPorts.get(switchId);
    const egressPort = egressLink.nodeIdA === switchId ? egressLink.portNameA : egressLink.portNameB;
    let ingressPort: string | undefined;
    if (ingressEdgeId) {
      const il = this.links.find((l) => l.id === ingressEdgeId);
      if (il) ingressPort = il.nodeIdA === switchId ? il.portNameA : il.portNameB;
    }
    if (ingressPort && trunks?.has(ingressPort)) return false; // tagged ingress: any VLAN
    if (trunks?.has(egressPort)) return false; // trunk egress: carries all VLANs
    const inVlan = ingressPort === undefined ? 1 : (vlans.get(ingressPort) ?? 1);
    const outVlan = vlans.get(egressPort) ?? 1;
    return inVlan !== outVlan;
  }

  /**
   * Simulate an ICMP echo request from `srcNodeId` to `dstIp`.
   * Returns the full hop path, TTL at destination, or the failure reason.
   */
  simulatePing(srcNodeId: string, dstIp: string): PingSimResult {
    const src = this.devices.get(srcNodeId);
    if (!src) return { success: false, path: [], edgeIds: [], ttlAtDestination: 0, reason: 'not-found' };

    if (!isValidIp(dstIp)) {
      return { success: false, path: [], edgeIds: [], ttlAtDestination: 0, reason: 'invalid' };
    }

    if (src.hasIp(dstIp)) {
      return { success: true, path: [src.name], edgeIds: [], ttlAtDestination: 64, reason: 'self' };
    }

    let dhcpGranted = false;
    if (!src.getIpAddress()) {
      const lease = this.dhcpLeaseFor(srcNodeId);
      if (!lease) {
        return { success: false, path: [], edgeIds: [], ttlAtDestination: 0, reason: 'no-ip' };
      }
      dhcpGranted = true;
    }

    // Real L2: before ICMP flows, ARP resolves the destination MAC. The ARP
    // request is broadcast (flooded through switches within the VLAN) and
    // populates the ARP cache + MAC tables along the way — like a real switch.
    this.resolveArpPath(src, dstIp);

    const result = this.findPath(src, dstIp, src.getIpAddress() || '', 64, new Set(), []);
    if (result.ok && result.path) {
      // NAT masquerade: the first router on the path with a srcnat
      // masquerade rule on its exit interface rewrites the source IP.
      let natIp: string | null = null;
      let natDev: SimDevice | null = null;
      for (let i = 1; i < result.path.length - 1; i++) {
        const dev = result.path[i];
        const nh = dev.nextHop(dstIp);
        if (!nh || !nh.iface) continue;
        const rules = this.nats.get(dev.id) || [];
        const rule = rules.find(
          (r) => r.action === 'masquerade' && r.chain === 'srcnat' && (!r.outInterface || r.outInterface === nh.iface)
        );
        if (rule) {
          const outIface = dev.getIfaceByName(nh.iface);
          if (outIface?.ip) {
            natIp = outIface.ip.address;
            natDev = dev;
            break;
          }
        }
      }

      // dstnat: the device the packet terminates at (the NAT router) may own
      // a dst-nat rule. ICMP carries no ports, so only port-less rules match
      // (protocol icmp or unset). The path then continues to to-addresses.
      let path = result.path;
      let edges = result.edges || [];
      let dstDev = this.devices.get(result.path[result.path.length - 1].id) || null;
      const dstnatDev = dstDev;
      if (dstDev) {
        const rules = this.nats.get(dstDev.id) || [];
        const rule = rules.find(
          (r) =>
            (r.action === 'dst-nat' || r.action === 'dstnat') &&
            r.chain === 'dstnat' &&
            !!r.toAddresses &&
            !r.dstPort &&
            (!r.protocol || r.protocol === 'icmp') &&
            ipInCidrSpec(dstIp, r.dstAddress)
        );
        if (rule) {
          const toAddress = rule.toAddresses!.split(',')[0].trim();
          const tail = this.findPath(dstnatDev!, toAddress, dstnatDev!.getIpAddress() || '', 64, new Set(), []);
          if (!tail.ok || !tail.path) {
            return {
              success: false,
              path: [],
              edgeIds: tail.passedEdges && tail.passedEdges.length > 0 ? [...edges, ...tail.passedEdges] : edges,
              ttlAtDestination: 0,
              reason: 'unreachable',
            };
          }
          path = path.concat(tail.path.slice(1));
          edges = edges.concat(tail.edges || []);
          dstDev = tail.path[tail.path.length - 1];
        }
      }

      // A real ICMP exchange also requires the return path to work:
      // the destination must be able to route the reply back to the source.
      const srcIp = src.getIpAddress() || '';
      if (dstDev && srcIp) {
        const backTarget = natIp || srcIp;
        const back = this.findPath(dstDev, backTarget, dstDev.getIpAddress() || '', 64, new Set(), []);
        if (back.ok && natIp && natDev) {
          // de-NAT: the NAT router must still reach the original source on its LAN
          const deNat = this.findPath(natDev, srcIp, natIp, 64, new Set(), []);
          if (!deNat.ok) {
            return {
              success: false,
              path: [],
              edgeIds: deNat.passedEdges && deNat.passedEdges.length > 0 ? [...edges, ...deNat.passedEdges] : edges,
              ttlAtDestination: 0,
              reason: deNat.reason || 'unreachable',
            };
          }
        } else if (!back.ok) {
          return {
            success: false,
            path: [],
            edgeIds: back.passedEdges && back.passedEdges.length > 0 ? [...edges, ...back.passedEdges] : edges,
            ttlAtDestination: 0,
            reason: back.reason || 'unreachable',
          };
        }
      }
      return {
        success: true,
        path: path.map((d) => d.name),
        edgeIds: edges,
        ttlAtDestination: result.ttl || 0,
        dhcpGranted: dhcpGranted || undefined,
      };
    }
    return {
      success: false,
      path: [],
      edgeIds: result.passedEdges || [],
      ttlAtDestination: 0,
      reason: result.reason || 'unreachable',
    };
  }

  /**
   * Hop-by-hop traceroute: reuses the path finder and reports every L3 hop.
   * Returns one hop per device; unreachable destinations produce empty hops.
   */
  simulateTraceroute(srcNodeId: string, dstIp: string): TracerouteResult {
    const src = this.devices.get(srcNodeId);
    if (!src) return { ok: false, hops: [], reason: 'not-found' };
    if (!isValidIp(dstIp)) return { ok: false, hops: [], reason: 'invalid' };

    const result = this.findPath(src, dstIp, src.getIpAddress() || '', 64, new Set(), []);
    if (!result.ok || !result.path) {
      return { ok: false, hops: [], reason: result.reason || 'unreachable' };
    }
    return {
      ok: true,
      hops: result.path.map((dev, i) => ({
        name: dev.name,
        ttl: i + 1,
        ip: dev.getIpAddress(),
      })),
    };
  }

  /** True when both devices share a routed/connected path (used by CLI helpers). */
  canReach(srcNodeId: string, dstIp: string): boolean {
    return this.simulatePing(srcNodeId, dstIp).success;
  }

  /** Diagnostic: is `gw` reachable from a device's interface subnet? */
  isGatewayReachable(dev: SimDevice, gw: string): boolean {
    if (!isValidIp(gw)) return false;
    for (const iface of dev.getInterfaces()) {
      if (iface.ip && iface.up && inSameSubnet(iface.ip.address, iface.ip.prefix, gw)) {
        return true;
      }
    }
    return false;
  }

  // ============================================================
  // DHCP server simulation
  // ============================================================

  /**
   * Public entry point used by the CLI layer: a device configured as a
   * DHCP client requests a lease immediately (not only on first ping).
   * Returns the granted lease, or null when no pool can serve this device.
   */
  grantDhcpLease(nodeId: string, ifaceName?: string): DhcpLeaseGrant | null {
    return this.dhcpLeaseFor(nodeId, ifaceName);
  }

  /** Current lease of a device, or null when it has none. */
  getLeaseFor(nodeId: string): DhcpLeaseGrant | null {
    return this.leases.get(nodeId) || null;
  }

  /**
   * Try to obtain a DHCP lease for a device that has no IP yet.
   * The serving router must have a pool configured (via CLI) whose
   * interface shares the client's L2 segment (through switches).
   */
  dhcpLeaseFor(nodeId: string, ifaceName?: string): DhcpLeaseGrant | null {
    const dev = this.devices.get(nodeId);
    if (!dev || dev.getIpAddress()) return null;
    if (this.leases.has(nodeId)) return this.leases.get(nodeId) || null;

    const used = this.allUsedIps();

    for (const [serverNodeId, pools] of this.dhcpPools) {
      const server = this.devices.get(serverNodeId);
      if (!server) continue;
      for (const pool of pools) {
        const serverIface = pool.iface ? server.getIfaceByName(pool.iface) : null;
        if (pool.iface && !serverIface) continue;
        if (pool.iface && !this.sameSegment(nodeId, serverNodeId, pool.iface)) continue;

        let candidate: string | null = null;
        let prefix = 24;
        let gateway = pool.gateway || '';

        if (pool.range) {
          candidate = this.firstFreeFromRange(pool.range, used);
          prefix = 24;
          gateway = gateway || (serverIface?.ip?.address || '');
        } else if (pool.network) {
          const parsed = parseCidr(pool.network);
          if (!parsed) continue;
          const base = networkOf(parsed.address, parsed.prefix);
          prefix = parsed.prefix;
          // serve only when the router has an interface inside this subnet
          let facing: SimIface | null = null;
          for (const iface of server.getInterfaces()) {
            if (iface.ip && iface.up && inSameSubnet(iface.ip.address, iface.ip.prefix, parsed.address)) {
              facing = iface;
              break;
            }
          }
          if (!facing) continue;
          if (!this.sameSegment(nodeId, serverNodeId, this.physicalPortName(serverNodeId, facing.name))) continue;
          gateway = gateway || (serverIface?.ip?.address || facing.ip?.address || '');
          for (let n = base + 2; n < base + 250; n++) {
            const ip = intToIp(n);
            if (ip === gateway || used.has(ip)) continue;
            candidate = ip;
            break;
          }
        }

        if (!candidate) continue;

        const firstPort = ifaceName ? dev.getIfaceByName(ifaceName) : null;
        const targetIface = firstPort || dev.getInterfaces()[0];
        if (!targetIface) continue;
        dev.setIpByName(targetIface.name, `${candidate}/${prefix}`);
        if (gateway && gateway !== candidate) dev.addStaticRoute('0.0.0.0/0', gateway);

        const lease: DhcpLeaseGrant = { ip: candidate, gateway, prefix, poolNodeId: serverNodeId };
        this.leases.set(nodeId, lease);

        // Learn MAC/ARP between the client and the serving router interface
        const serverPortName = pool.iface || server.getInterfaces()[0]?.name;
        if (serverPortName) {
          const link = this.linksOfDevice(nodeId).find(
            (l) => l.nodeIdA === serverNodeId || l.nodeIdB === serverNodeId
          ) || this.linksOfDevice(serverNodeId)[0];
          if (link) this.learnHop(dev, server, link);
        }
        return lease;
      }
    }
    return null;
  }

  /** Resolve a (possibly virtual) interface to its physical link port name. */
  private physicalPortName(nodeId: string, ifaceName: string): string {
    return this.devices.get(nodeId)?.getIfaceByName(ifaceName)?.parentPort || ifaceName;
  }

  private allUsedIps(): Set<string> {
    const used = new Set<string>();
    for (const d of this.devices.values()) {
      for (const i of d.getInterfaces()) {
        if (i.ip) used.add(i.ip.address);
      }
    }
    for (const l of this.leases.values()) used.add(l.ip);
    return used;
  }

  private firstFreeFromRange(range: string, used: Set<string>): string | null {
    const m = range.match(/(\d+\.\d+\.\d+\.\d+)\s*-\s*(\d+\.\d+\.\d+\.\d+)/);
    if (!m) return isValidIp(range.trim()) ? range.trim() : null;
    const start = ipToInt(m[1]);
    const end = ipToInt(m[2]);
    for (let n = start; n <= end; n++) {
      const ip = intToIp(n);
      if (!used.has(ip)) return ip;
    }
    return null;
  }

  /**
   * BFS through switch-only links: is `nodeId` on the same L2 segment as
   * the exit port `exitPortName` of device `exitNodeId`?
   */
  private sameSegment(nodeId: string, exitNodeId: string, exitPortName: string): boolean {
    const visited = new Set<string>([nodeId]);
    const queue: string[] = [nodeId];
    while (queue.length > 0) {
      const cur = queue.shift() as string;
      for (const link of this.linksOfDevice(cur)) {
        const peerId = link.nodeIdA === cur ? link.nodeIdB : link.nodeIdA;
        const peer = this.devices.get(peerId);
        if (!peer || visited.has(peerId)) continue;
        if (peerId === exitNodeId) {
          const exitPort = link.nodeIdA === peerId ? link.portNameA : link.portNameB;
          if (exitPort === exitPortName) return true;
          continue;
        }
        if (peer.isSwitch) {
          visited.add(peerId);
          queue.push(peerId);
        }
      }
    }
    return false;
  }

  // ============================================================
  // Neighbor discovery (CDP / LLDP / OSPF / BGP tables)
  // ============================================================

  /**
   * ARP resolution phase: walk the path once and learn MAC/ARP entries on
   * every hop pair (flooding through switches inside the VLAN). L3 devices
   * also ARP for their effective next hop: when the adjacent device is an
   * L2-only switch, walk forward to the first IP-capable device on that
   * segment and resolve its MAC (as if the switch flooded the ARP request).
   */
  private resolveArpPath(src: SimDevice, dstIp: string): void {
    if (src.hasIp(dstIp)) return;
    const result = this.findPath(src, dstIp, src.getIpAddress() || '', 64, new Set(), []);
    if (!result.ok || !result.path || result.path.length < 2) return;
    const path = result.path;
    const ids = path.map((d) => d.id);
    for (const link of this.links) {
      const ai = ids.indexOf(link.nodeIdA);
      const bi = ids.indexOf(link.nodeIdB);
      if (ai >= 0 && bi >= 0 && Math.abs(ai - bi) === 1) {
        this.learnHop(path[ai], path[bi], link);
      }
    }
    const ifaceOf = (dev: SimDevice, link: SimLink) =>
      dev.getIfaceByName(link.nodeIdA === dev.id ? link.portNameA : link.portNameB) ||
      dev.getVirtualByParentPort(link.nodeIdA === dev.id ? link.portNameA : link.portNameB);
    const directLink = (a: SimDevice, b: SimDevice) =>
      this.links.find(
        (l) =>
          (l.nodeIdA === a.id && l.nodeIdB === b.id) ||
          (l.nodeIdA === b.id && l.nodeIdB === a.id)
      );
    for (let i = 0; i < path.length; i++) {
      const dev = path[i];
      if (dev.isSwitch) continue;
      for (const dir of [-1, 1] as const) {
        let j = i + dir;
        while (j >= 0 && j < path.length && path[j].isSwitch) j += dir;
        if (j < 0 || j >= path.length) continue;
        // direct neighbor, or (when switches sit between) the segment link
        // of the peer on the side facing `dev` — as if the switch flooded ARP
        const link =
          j === i + dir
            ? directLink(dev, path[j])
            : directLink(path[j], path[j - dir]);
        const peerIf = link && ifaceOf(path[j], link);
        if (link && peerIf && peerIf.ip) dev.learnArp(peerIf.ip.address, peerIf.mac);
      }
    }
  }

  /**
   * Directly connected neighbors (CDP/LLDP discovery). Powered-off
   * devices are not advertised by their neighbor.
   */
  getLldpNeighbors(nodeId: string): LldpNeighborInfo[] {
    const out: LldpNeighborInfo[] = [];
    if (!this.isNodePowered(nodeId)) return out;
    for (const link of this.linksOfDevice(nodeId)) {
      const peerId = link.nodeIdA === nodeId ? link.nodeIdB : link.nodeIdA;
      const peer = this.devices.get(peerId);
      if (!peer || !this.isNodePowered(peerId)) continue;
      out.push({
        peerNodeId: peer.id,
        peerName: peer.name,
        peerDeviceType: peer.deviceType,
        localPort: link.nodeIdA === nodeId ? link.portNameA : link.portNameB,
        peerPort: link.nodeIdA === peerId ? link.portNameA : link.portNameB,
      });
    }
    return out;
  }

  /** OSPF adjacencies: other OSPF routers sharing an L2 segment. */
  getOspfNeighbors(nodeId: string): OspfNeighborInfo[] {
    const dev = this.devices.get(nodeId);
    if (!dev) return [];
    const cfg = this.routings.get(nodeId);
    if (!cfg?.ospf?.enabled) return [];
    const segments = this.buildSegments();
    const myKeys = new Set<string>();
    for (const link of this.linksOfDevice(nodeId)) {
      myKeys.add(this.segmentKeyOfLink(link, nodeId, segments));
    }
    const out: OspfNeighborInfo[] = [];
    for (const other of this.devices.values()) {
      if (other.id === nodeId || other.isSwitch) continue;
      const oc = this.routings.get(other.id);
      if (!oc?.ospf?.enabled) continue;
      for (const link of this.linksOfDevice(other.id)) {
        const key = this.segmentKeyOfLink(link, other.id, segments);
        if (!myKeys.has(key)) continue;
        const otherIp = this.ipOnSegment(other.id, key, segments);
        if (!otherIp) continue;
        const myPort = link.nodeIdA === nodeId ? link.portNameA : link.portNameB;
        out.push({ routerId: otherIp, ip: otherIp, iface: myPort, state: 'Full/ -' });
        break;
      }
    }
    const seen = new Set<string>();
    return out.filter((n) => (seen.has(n.routerId) ? false : (seen.add(n.routerId), true)));
  }

  /** BGP session state per configured peer (Established when reachable & both sides configured). */
  getBgpNeighborStates(nodeId: string): BgpNeighborStateInfo[] {
    const cfg = this.bgps.get(nodeId);
    if (!cfg) return [];
    return cfg.peers.map((p) => {
      const peerId = this.deviceIdByIp(p.remoteAddr);
      const reachable =
        !!peerId && this.bgps.has(peerId) && this.isNodePowered(nodeId) && this.canReach(nodeId, p.remoteAddr);
      const prefixes = reachable ? this.devices.get(peerId as string)?.getDynamicRoutes().length || 0 : 0;
      return {
        remoteAddr: p.remoteAddr,
        remoteAs: p.remoteAs,
        state: reachable ? 'Established' : 'Idle',
        uptime: reachable ? '00:00:12' : 'never',
        prefixes,
      };
    });
  }

  // ============================================================
  // TCP connection simulation (HTTP/curl/netstat)
  // ============================================================

  /**
   * Real 3-way TCP handshake: SYN → SYN-ACK → ACK. Both the forward path
   * and the return path must work, then the connection is recorded on
   * both endpoints (visible via netstat / show tcp brief).
   */
  simulateTcpConnect(srcNodeId: string, dstIp: string, dstPort = 80): TcpConnectResult {
    const src = this.devices.get(srcNodeId);
    if (!src) return { ok: false, reason: 'not-found', handshake: [] };
    if (!isValidIp(dstIp)) return { ok: false, reason: 'invalid', handshake: [] };
    if (!this.isNodePowered(src.id)) return { ok: false, reason: 'power', handshake: [] };
    const srcIp = src.getIpAddress();
    if (!srcIp) return { ok: false, reason: 'no-ip', handshake: [] };

    const fwd = this.findPath(src, dstIp, srcIp, 64, new Set(), []);
    if (!fwd.ok || !fwd.path) return { ok: false, reason: fwd.reason || 'unreachable', handshake: [] };
    let dstDev = fwd.path[fwd.path.length - 1];
    let localPort = dstPort;

    // dstnat / port-forward: the router the packet terminates at may own a
    // dst-nat rule (protocol tcp, dst-port matches). The connection then
    // continues to to-addresses:to-ports (the inside server).
    const natRouter = dstDev;
    if (dstDev) {
      const rules = this.nats.get(dstDev.id) || [];
      const rule = rules.find(
        (r) =>
          (r.action === 'dst-nat' || r.action === 'dstnat') &&
          r.chain === 'dstnat' &&
          !!r.toAddresses &&
          (!r.protocol || r.protocol === 'tcp') &&
          portInRange(dstPort, r.dstPort) &&
          ipInCidrSpec(dstIp, r.dstAddress)
      );
      if (rule) {
        const toAddress = rule.toAddresses!.split(',')[0].trim();
        if (rule.toPorts) {
          const lo = parseInt(rule.toPorts.split('-')[0].trim(), 10);
          if (!isNaN(lo)) localPort = lo;
        }
        const tail = this.findPath(natRouter, toAddress, natRouter.getIpAddress() || '', 64, new Set(), []);
        if (!tail.ok || !tail.path) return { ok: false, reason: tail.reason || 'unreachable', handshake: [] };
        dstDev = tail.path[tail.path.length - 1];
      }
    }

    if (!this.isNodePowered(dstDev.id)) return { ok: false, reason: 'power', handshake: [] };
    const dstIpLocal = dstDev.getIpAddress() || dstIp;

    // The destination must actually listen: a web server on `localPort` with
    // the service running. Otherwise the connection is refused.
    const web = this.webServers.get(dstDev.id) || { enabled: false, port: 80, content: '' };
    if (!web.enabled || localPort !== web.port) {
      return { ok: false, reason: 'refused', handshake: [] };
    }

    const back = this.findPath(dstDev, srcIp, dstIpLocal, 64, new Set(), []);
    if (!back.ok) return { ok: false, reason: back.reason || 'unreachable', handshake: [] };

    const iseq = Math.floor(Math.random() * 50000) + 1000;
    const handshake: TcpHandshakeSegment[] = [
      { seq: iseq, ack: 0, flags: 'SYN' },
      { seq: iseq + 1, ack: iseq + 1, flags: 'SYN-ACK' },
      { seq: iseq + 1, ack: iseq + 2, flags: 'ACK' },
    ];
    const clientPort = 40000 + Math.floor(Math.random() * 10000);
    const clientSide: TcpConnectionInfo = {
      localIp: srcIp,
      localPort: clientPort,
      remoteIp: dstIp,
      remotePort: dstPort,
      state: 'ESTABLISHED',
      proto: 'tcp',
    };
    const serverSide: TcpConnectionInfo = {
      localIp: dstIpLocal,
      localPort,
      remoteIp: srcIp,
      remotePort: clientPort,
      state: 'ESTABLISHED',
      proto: 'tcp',
    };
    const srcList = this.tcpConnections.get(src.id) || [];
    srcList.push(clientSide);
    this.tcpConnections.set(src.id, srcList);
    const dstList = this.tcpConnections.get(dstDev.id) || [];
    dstList.push(serverSide);
    this.tcpConnections.set(dstDev.id, dstList);
    return { ok: true, handshake, status: 200, body: web.content };
  }

  /** Established TCP connections of a device (netstat / show tcp brief). */
  getTcpConnections(nodeId: string): TcpConnectionInfo[] {
    return this.tcpConnections.get(nodeId) || [];
  }

  // ============================================================
  // Grading helpers (read-only view of CLI-configured state)
  // ============================================================

  getNodeRouting(nodeId: string): RoutingMemoryShape | undefined {
    return this.routings.get(nodeId);
  }

  getNodeBgp(nodeId: string): BgpConfig | undefined {
    return this.bgps.get(nodeId);
  }

  getNodeAcls(nodeId: string): AclRule[] {
    return this.acls.get(nodeId) || [];
  }

  getNodeNats(nodeId: string): NatRule[] {
    return this.nats.get(nodeId) || [];
  }

  getNodePortVlans(nodeId: string): Map<string, number> {
    return this.portVlans.get(nodeId) || new Map();
  }

  getNodeTrunkPorts(nodeId: string): Set<string> {
    return this.trunkPorts.get(nodeId) || new Set();
  }

  getNodeShutdownIfaces(nodeId: string): Set<string> {
    return this.shutIfaces.get(nodeId) || new Set();
  }

  getNodeSubinterfaces(nodeId: string): Map<string, { parentPort: string; vlanId: number }> {
    return this.subinterfaces.get(nodeId) || new Map();
  }

  // ============================================================
  // Real-time statistics
  // ============================================================

  getDeviceStats(nodeId: string): DeviceStatsSnapshot | null {
    const dev = this.devices.get(nodeId);
    if (!dev) return null;
    return {
      name: dev.name,
      deviceType: dev.deviceType,
      interfaces: dev.getInterfaces().map((i) => ({
        name: i.name,
        mac: i.mac,
        ip: i.ip ? `${i.ip.address}/${i.ip.prefix}` : null,
        ipv6: null,
        up: i.up,
      })),
      arp: [...dev.arpCache.entries()].map(([ip, mac]) => ({ ip, mac })),
      macTable: [...dev.macTable.entries()].map(([mac, port]) => ({ mac, port })),
      routes: dev.getRoutes().map((r) => ({
        dst: r.dst,
        gateway: r.gateway || '',
        iface: r.iface || '',
        kind: r.kind,
      })),
    };
  }
}
