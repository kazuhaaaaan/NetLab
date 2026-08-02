import { LabProject } from '../../types';
import { SimDevice, SimRoute } from './simdevice';
import { isValidIp, inSameSubnet } from './ip';

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
  /** TTL as observed by the destination device */
  ttlAtDestination: number;
  reason?: 'no-ip' | 'invalid' | 'not-found' | 'unreachable' | 'ttl' | 'self';
}

interface PathResult {
  ok: boolean;
  path?: SimDevice[];
  ttl?: number;
  reason?: 'ttl' | 'unreachable';
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
      if (!seen.has(id)) this.devices.delete(id);
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
    visited: Set<string>
  ): PathResult {
    if (visited.has(src.id)) return { ok: false, reason: 'unreachable' };

    const localIface = src.hasIp(dstIp);
    if (localIface) {
      return { ok: true, path: [src], ttl };
    }

    if (ttl <= 0) return { ok: false, reason: 'ttl' };

    const next = new Set(visited);
    next.add(src.id);

    if (src.isSwitch) {
      let best: PathResult = { ok: false, reason: 'unreachable' };
      for (const peer of this.neighbors(src.id)) {
        const r = this.findPath(peer, dstIp, ttl - 1, next);
        if (r.ok) return { ok: true, path: [src, ...(r.path || [])], ttl: r.ttl };
        if (r.reason === 'ttl') best = r;
      }
      return best;
    }

    // L3 device
    const nh = src.nextHop(dstIp);
    if (!nh || !nh.iface) return { ok: false, reason: 'unreachable' };

    const peer = this.peerViaIface(src.id, nh.iface);
    if (!peer) return { ok: false, reason: 'unreachable' };

    const r = this.findPath(peer, dstIp, ttl - 1, next);
    if (r.ok) {
      return { ok: true, path: [src, ...(r.path || [])], ttl: r.ttl };
    }
    return r;
  }

  /**
   * Simulate an ICMP echo request from `srcNodeId` to `dstIp`.
   * Returns the full hop path, TTL at destination, or the failure reason.
   */
  simulatePing(srcNodeId: string, dstIp: string): PingSimResult {
    const src = this.devices.get(srcNodeId);
    if (!src) return { success: false, path: [], ttlAtDestination: 0, reason: 'not-found' };

    if (!isValidIp(dstIp)) {
      return { success: false, path: [], ttlAtDestination: 0, reason: 'invalid' };
    }

    if (src.hasIp(dstIp)) {
      return { success: true, path: [src.name], ttlAtDestination: 64, reason: 'self' };
    }

    if (!src.getIpAddress()) {
      return { success: false, path: [], ttlAtDestination: 0, reason: 'no-ip' };
    }

    const result = this.findPath(src, dstIp, 64, new Set());
    if (result.ok && result.path) {
      // A real ICMP exchange also requires the return path to work:
      // the destination must be able to route the reply back to the source.
      const dstDev = this.devices.get(result.path[result.path.length - 1].id);
      const srcIp = src.getIpAddress() || '';
      if (dstDev && srcIp) {
        const back = this.findPath(dstDev, srcIp, 64, new Set());
        if (!back.ok) {
          return {
            success: false,
            path: [],
            ttlAtDestination: 0,
            reason: back.reason || 'unreachable',
          };
        }
      }
      return {
        success: true,
        path: result.path.map((d) => d.name),
        ttlAtDestination: result.ttl || 0,
      };
    }
    return {
      success: false,
      path: [],
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
}
