import { LabProject } from '../../types';
import { SimDevice, SimRoute, SimIface } from './simdevice';
import {
  isValidIp,
  inSameSubnet,
  ipToInt,
  intToIp,
  networkOf,
  parseCidr,
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
  reason?: 'no-ip' | 'invalid' | 'not-found' | 'unreachable' | 'ttl' | 'self';
}

interface PathResult {
  ok: boolean;
  path?: SimDevice[];
  edges?: string[];
  ttl?: number;
  reason?: 'ttl' | 'unreachable';
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
    if (dev) this.applyConfigToDevice(dev, cfg);
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
    for (const link of this.linksOfDevice(nodeId)) {
      if (link.nodeIdA === nodeId && link.portNameA === ifaceName) {
        return this.devices.get(link.nodeIdB) || null;
      }
      if (link.nodeIdB === nodeId && link.portNameB === ifaceName) {
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
    const srcIf = src.getIfaceByName(srcPort);
    const peerIf = peer.getIfaceByName(peerPort);
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
    ttl: number,
    visited: Set<string>,
    edges: string[]
  ): PathResult {
    if (visited.has(src.id)) return { ok: false, reason: 'unreachable' };

    const localIface = src.hasIp(dstIp);
    if (localIface) {
      return { ok: true, path: [src], edges: [...edges], ttl };
    }

    if (ttl <= 0) return { ok: false, reason: 'ttl' };

    const next = new Set(visited);
    next.add(src.id);

    if (src.isSwitch) {
      let best: PathResult = { ok: false, reason: 'unreachable' };
      for (const link of this.linksOfDevice(src.id)) {
        const peer = this.devices.get(link.nodeIdA === src.id ? link.nodeIdB : link.nodeIdA);
        if (!peer) continue;
        const r = this.findPath(peer, dstIp, ttl - 1, next, [...edges, link.id]);
        if (r.ok) {
          this.learnHop(src, peer, link);
          return { ok: true, path: [src, ...(r.path || [])], edges: r.edges, ttl: r.ttl };
        }
        if (r.reason === 'ttl') best = r;
      }
      return best;
    }

    // L3 device
    const nh = src.nextHop(dstIp);
    if (!nh || !nh.iface) return { ok: false, reason: 'unreachable' };

    const peer = this.peerViaIface(src.id, nh.iface);
    if (!peer) return { ok: false, reason: 'unreachable' };

    const link = this.linksOfDevice(src.id).find(
      (l) => (l.nodeIdA === src.id && l.portNameA === nh.iface) || (l.nodeIdB === src.id && l.portNameB === nh.iface)
    );
    if (!link) return { ok: false, reason: 'unreachable' };

    const r = this.findPath(peer, dstIp, ttl - 1, next, [...edges, link.id]);
    if (r.ok) {
      this.learnHop(src, peer, link);
      return { ok: true, path: [src, ...(r.path || [])], edges: r.edges, ttl: r.ttl };
    }
    return r;
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

    const result = this.findPath(src, dstIp, 64, new Set(), []);
    if (result.ok && result.path) {
      // A real ICMP exchange also requires the return path to work:
      // the destination must be able to route the reply back to the source.
      const dstDev = this.devices.get(result.path[result.path.length - 1].id);
      const srcIp = src.getIpAddress() || '';
      if (dstDev && srcIp) {
        const back = this.findPath(dstDev, srcIp, 64, new Set(), []);
        if (!back.ok) {
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
          if (!this.sameSegment(nodeId, serverNodeId, facing.name)) continue;
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
