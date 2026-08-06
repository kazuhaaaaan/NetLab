// ============================================================
// RoutingProtocolEngine — OSPF/RIP/EIGRP & BGP (distance-vector)
// Diport dari engine lama agar CLI routing tetap berfungsi.
// ============================================================

import { NetworkDevice } from '../devices/NetworkDevice';
import { LinkTable } from '../core/Topology';
import { inSameSubnet, intToIp, networkOf, parseCidr } from '../core/ip';
import { DhcpPool } from '../core/types';

interface TableEntry {
  dst: string;
  gateway: string;
  metric: number;
}

export class RoutingProtocolEngine {
  compute(devices: NetworkDevice[], links: LinkTable): void {
    for (const dev of devices) dev.clearDynamicRoutes();

    const segments = this.buildSegments(devices, links);
    this.computeProtocolRoutes(devices, links, segments);
    this.computeBgpRoutes(devices, links);
  }

  private isSwitch(dev: NetworkDevice): boolean {
    return dev.isSwitch;
  }

  private buildSegments(devices: NetworkDevice[], links: LinkTable): Map<string, string> {
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

    const isSwitchNode = (id: string) => devices.find((d) => d.id === id)?.isSwitch ?? false;
    for (const link of links.all) {
      if (isSwitchNode(link.a.nodeId) && isSwitchNode(link.b.nodeId)) {
        union(link.a.nodeId, link.b.nodeId);
      }
    }

    const keyOfPort = (devId: string, portName: string): string => {
      const link = links.linkOn(devId, portName);
      if (!link) return `unplugged:${devId}:${portName}`;
      const aSw = isSwitchNode(link.a.nodeId);
      const bSw = isSwitchNode(link.b.nodeId);
      if (aSw || bSw) return `cloud:${find(aSw ? link.a.nodeId : link.b.nodeId)}`;
      return `ptp:${link.id}`;
    };

    const segments = new Map<string, string>();
    for (const dev of devices) {
      for (const iface of dev.getInterfaces()) {
        segments.set(`${dev.id}:${iface.name}`, keyOfPort(dev.id, iface.name));
      }
    }
    return segments;
  }

  private ipOnSegment(dev: NetworkDevice, key: string, segments: Map<string, string>, links: LinkTable): string | null {
    for (const link of links.linksOf(dev.id)) {
      const myPort = link.a.nodeId === dev.id ? link.a.port : link.b.port;
      const segKey = segments.get(`${dev.id}:${myPort}`);
      if (segKey !== key) continue;
      const iface = dev.getIfaceByName(myPort) || dev.getVirtualByParentPort(myPort);
      if (iface?.ip) return iface.ip.address;
    }
    return null;
  }

  private normalizeNetworkEntry(dev: NetworkDevice, entry: string): string | null {
    const trimmed = entry.trim();
    const parsed = parseCidr(trimmed);
    if (parsed && (trimmed.includes('/') || trimmed.includes(' '))) {
      return `${parsed.address}/${parsed.prefix}`;
    }
    const wm = trimmed.match(/^(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)$/);
    if (wm) {
      const mask = wm[2];
      let prefix = 0;
      for (const part of mask.split('.')) {
        for (let bit = 7; bit >= 0; bit--) {
          if (((parseInt(part, 10) >> bit) & 1) === 1) prefix++;
        }
      }
      return `${wm[1]}/${prefix}`;
    }
    const iface = dev.getIfaceByName(trimmed);
    if (iface?.ip) {
      return `${intToIp(networkOf(iface.ip.address, iface.ip.prefix))}/${iface.ip.prefix}`;
    }
    return null;
  }

  private computeProtocolRoutes(devices: NetworkDevice[], links: LinkTable, segments: Map<string, string>): void {
    const tables = new Map<string, TableEntry[]>();
    const l3 = devices.filter((d) => !d.isSwitch);

    for (const dev of l3) {
      const cfg = dev.routingCfg;
      const proto = cfg.ospf?.enabled ? 'ospf' : cfg.rip?.enabled ? 'rip' : cfg.eigrp?.enabled ? 'eigrp' : null;
      if (!proto) continue;
      const nets = (cfg[proto]?.networks || []).map((n) => this.normalizeNetworkEntry(dev, n)).filter((n): n is string => !!n);
      if (nets.length === 0) continue;
      const entries: TableEntry[] = [];
      for (const iface of dev.getInterfaces()) {
        if (!iface.ip || !iface.up) continue;
        const subnet = `${intToIp(networkOf(iface.ip.address, iface.ip.prefix))}/${iface.ip.prefix}`;
        const participates = nets.some((net) => {
          const parsed = parseCidr(net);
          if (!parsed) return false;
          const pa = Math.min(iface.ip.prefix, parsed.prefix);
          return inSameSubnet(iface.ip.address, pa, parsed.address);
        });
        if (participates) entries.push({ dst: subnet, gateway: '', metric: 0 });
      }
      if (entries.length > 0) tables.set(dev.id, entries);
    }

    for (let round = 0; round < l3.length; round++) {
      const candidates: { peerId: string; dst: string; gateway: string; metric: number }[] = [];
      for (const dev of l3) {
        const myEntries = tables.get(dev.id);
        if (!myEntries) continue;
        const myKeys = new Set<string>();
        for (const link of links.linksOf(dev.id)) {
          const myPort = link.a.nodeId === dev.id ? link.a.port : link.b.port;
          myKeys.add(segments.get(`${dev.id}:${myPort}`) || `ptp:${link.id}`);
        }
        for (const key of myKeys) {
          const myIp = this.ipOnSegment(dev, key, segments, links);
          if (!myIp) continue;
          for (const other of l3) {
            if (other.id === dev.id) continue;
            if (!other.routingCfg.ospf?.enabled && !other.routingCfg.rip?.enabled && !other.routingCfg.eigrp?.enabled) continue;
            const otherIp = this.ipOnSegment(other, key, segments, links);
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
        const peer = devices.find((d) => d.id === c.peerId);
        if (!peer) continue;
        if (peer.hasIp(c.gateway)) continue;
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
      const dev = devices.find((d) => d.id === devId);
      if (!dev) continue;
      for (const e of entries) {
        if (e.gateway) dev.addDynamicRoute(e.dst, e.gateway);
      }
    }
  }

  private computeBgpRoutes(devices: NetworkDevice[], links: LinkTable): void {
    const bgpRouters = devices.filter((d) => d.bgpCfg && d.bgpCfg.asn && d.bgpCfg.peers.length > 0);
    if (bgpRouters.length === 0) return;

    const tables = new Map<string, TableEntry[]>();
    for (const dev of bgpRouters) {
      const cfg = dev.bgpCfg!;
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
      tables.set(dev.id, entries);
    }

    const deviceById = (ip: string) => devices.find((d) => d.hasIp(ip)) || null;

    for (let round = 0; round < bgpRouters.length; round++) {
      const candidates: { peerId: string; dst: string; gateway: string; metric: number }[] = [];
      for (const dev of bgpRouters) {
        const myEntries = tables.get(dev.id);
        if (!myEntries) continue;
        const myIp = dev.getIpAddress();
        if (!myIp) continue;
        for (const p of dev.bgpCfg!.peers) {
          const peerId = deviceById(p.remoteAddr)?.id;
          if (!peerId || !bgpRouters.some((b) => b.id === peerId)) continue;
          for (const e of myEntries) {
            candidates.push({ peerId, dst: e.dst, gateway: myIp, metric: e.metric + 1 });
          }
        }
      }
      if (candidates.length === 0) break;
      let changed = false;
      for (const c of candidates) {
        const peer = devices.find((d) => d.id === c.peerId);
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
      const dev = devices.find((d) => d.id === devId);
      if (!dev) continue;
      for (const e of entries) {
        if (e.gateway) dev.addDynamicRoute(e.dst, e.gateway);
      }
    }
  }
}
