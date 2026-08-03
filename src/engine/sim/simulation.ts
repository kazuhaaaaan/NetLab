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
  reason?: 'no-ip' | 'invalid' | 'not-found' | 'unreachable' | 'ttl' | 'self' | 'blocked';
}

interface PathResult {
  ok: boolean;
  path?: SimDevice[];
  edges?: string[];
  ttl?: number;
  reason?: 'ttl' | 'unreachable' | 'blocked';
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
  interfaces: { name: string; mac: string; ip: string | null; up: boolean }[];
  arp: { ip: string; mac: string }[];
  macTable: { mac: string; port: string }[];
  routes: { dst: string; gateway: string; iface: string; kind: string }[];
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
  ospf?: { enabled?: boolean; networks?: string[] };
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

/**
 * MikroLab real network simulation engine.
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
    // IP of device `devId` on the port that lies on segment `key`
    const ipOnSegment = (devId: string, key: string): string | null => {
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
    };

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
          const p = net.split('/');
          return inSameSubnet(iface.ip.address, iface.ip.prefix, p[0]);
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
          const myIp = ipOnSegment(dev.id, key);
          if (!myIp) continue;
          for (const other of devices) {
            if (other.id === dev.id) continue;
            if (!this.routings.has(other.id)) continue;
            const otherIp = ipOnSegment(other.id, key);
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
      for (const n of cfg.networks) {
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
    if (visited.has(visitKey)) return { ok: false, reason: 'unreachable' };

    const localIface = src.hasIp(dstIp);
    if (localIface) {
      // the destination device itself may filter ICMP via ACL / firewall
      if (this.aclBlocks(src, srcIp, dstIp)) return { ok: false, reason: 'blocked' };
      return { ok: true, path: [src], edges: [...edges], ttl };
    }

    if (ttl <= 0) return { ok: false, reason: 'ttl' };

    const next = new Set(visited);
    next.add(visitKey);

    if (src.isSwitch) {
      let best: PathResult = { ok: false, reason: 'unreachable' };
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
        if (r.reason === 'ttl') best = r;
        if (r.reason === 'blocked') best = r;
      }
      return best;
    }

    // L3 device — ACL / firewall filter applies before forwarding
    if (this.aclBlocks(src, srcIp, dstIp)) return { ok: false, reason: 'blocked' };

    const nh = src.nextHop(dstIp);
    if (!nh || !nh.iface) return { ok: false, reason: 'unreachable' };

    const peer = this.peerViaIface(src.id, nh.iface);
    if (!peer) return { ok: false, reason: 'unreachable' };

    const portName = this.physicalPortName(src.id, nh.iface);
    const link = this.linksOfDevice(src.id).find(
      (l) => (l.nodeIdA === src.id && l.portNameA === portName) || (l.nodeIdB === src.id && l.portNameB === portName)
    );
    if (!link) return { ok: false, reason: 'unreachable' };

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

      // A real ICMP exchange also requires the return path to work:
      // the destination must be able to route the reply back to the source.
      const dstDev = this.devices.get(result.path[result.path.length - 1].id);
      const srcIp = src.getIpAddress() || '';
      if (dstDev && srcIp) {
        const backTarget = natIp || srcIp;
        const back = this.findPath(dstDev, backTarget, dstDev.getIpAddress() || '', 64, new Set(), []);
        if (back.ok && natIp && natDev) {
          // de-NAT: the NAT router must still reach the original source on its LAN
          if (!this.findPath(natDev, srcIp, natIp, 64, new Set(), []).ok) {
            return {
              success: false,
              path: [],
              edgeIds: [],
              ttlAtDestination: 0,
              reason: 'unreachable',
            };
          }
        } else if (!back.ok) {
          return {
            success: false,
            path: [],
            edgeIds: [],
            ttlAtDestination: 0,
            reason: back.reason || 'unreachable',
          };
        }
      }
      return {
        success: true,
        path: result.path.map((d) => d.name),
        edgeIds: result.edges || [],
        ttlAtDestination: result.ttl || 0,
        dhcpGranted: dhcpGranted || undefined,
      };
    }
    return {
      success: false,
      path: [],
      edgeIds: [],
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
