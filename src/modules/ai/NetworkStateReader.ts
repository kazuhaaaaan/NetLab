// ============================================================
// NetworkStateReader — satu-satunya pintu masuk AI ke Simulation Engine.
// Semua state dibaca langsung dari engine; AI TIDAK membaca UI/screenshot.
// ============================================================

import { NetworkSimulator } from '../../engine/net/core/NetworkSimulator';
import { NetworkDevice } from '../../engine/net/devices/NetworkDevice';
import { SimEvent } from '../../engine/net/core/types';
import { parseCidr, isValidIp } from '../../engine/net/core/ip';
import {
  DeviceState,
  IfaceState,
  LinkState,
  NetworkState,
  ProbeResult,
  SimRoute,
} from './types';

export class NetworkStateReader {
  constructor(readonly engine: NetworkSimulator) {}

  /** Snapshot state engine saat ini. */
  read(): NetworkState {
    const now = this.engine.now;
    const devices = this.engine.getDevices().map((d) => this.deviceOf(d));
    const byId = new Map(devices.map((d) => [d.nodeId, d]));
    const byIp = new Map<string, DeviceState>();
    for (const d of devices) {
      if (d.ip) byIp.set(d.ip, d);
      for (const i of d.interfaces) {
        const addr = i.ip?.split('/')[0];
        if (addr) byIp.set(addr, d);
      }
    }
    return {
      now,
      devices,
      links: this.linksOf(),
      events: this.engine.eventHistory,
      leases: this.engine.getLeases(),
      byId,
      byIp,
    };
  }

  /** Perangkat (nama) → deviceId untuk probe. */
  deviceIdByName(name: string): string | undefined {
    return this.engine.getDeviceByName(name)?.id;
  }

  /**
   * Probe konektivitas via engine (simulasi ping nyata).
   * Paket yang benar-benar di-drop/di-expire oleh engine direkam sebagai bukti.
   */
  probe(fromNodeId: string, dstIp: string): ProbeResult {
    const before = this.engine.eventHistory.length;
    const result = this.engine.simulatePing(fromNodeId, dstIp);
    const events = this.engine.eventHistory.slice(before);
    const stop = this.stopAt(events);
    return { from: fromNodeId, to: dstIp, result, events, ...stop };
  }

  /** Cari device terakhir yang menghentikan paket (dari event engine). */
  private stopAt(events: SimEvent[]): { stopAt?: string; stopName?: string } {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      const isStop =
        e.type === 'PACKET_DROPPED' ||
        e.type === 'TTL_EXCEEDED' ||
        e.type === 'FIREWALL_BLOCK' ||
        e.type === 'ICMP_ERROR';
      if (isStop && e.nodeId) {
        const name = this.engine.getDevice(e.nodeId)?.name || e.nodeId;
        return { stopAt: e.nodeId, stopName: name };
      }
    }
    return {};
  }

  private deviceOf(dev: NetworkDevice): DeviceState {
    const kind = dev.kind;
    const isSwitch = dev.isSwitch;
    const ip = dev.getIpAddress();
    const interfaces = dev.getInterfaces().map((i): IfaceState => {
      const cable = !!this.engine.topology.links.linkOn(dev.id, i.portId);
      return {
        portId: i.portId,
        name: i.name,
        mac: i.mac,
        ip: i.ip ? `${i.ip.address}/${i.ip.prefix}` : null,
        up: i.up,
        shutdown: dev.shutdownIfaces.has(i.name),
        cable,
        type: i.type,
        vlanId: i.vlanId,
        parentPort: i.parentPort,
        speedMbps: i.speedMbps,
      };
    });

    const routes = dev.getRoutes().map((r) => ({
      dst: r.dst,
      gateway: r.gateway ?? null,
      iface: r.iface ?? null,
      kind: r.kind,
    }));

    return {
      nodeId: dev.id,
      name: dev.name,
      deviceType: dev.deviceType,
      vendor: dev.vendor ?? dev.deviceType,
      kind,
      powered: dev.powered,
      isSwitch,
      isL3: dev.isL3,
      ip,
      interfaces,
      arp: dev.arpCache.entriesList().map((e) => ({ ip: e.ip, mac: e.mac })),
      macTable: dev.macTable.entriesList().map((e) => ({ mac: e.mac, port: e.port })),
      routes,
      staticRoutes: dev.routes.filter((r) => r.kind === 'static'),
      acls: dev.aclRules,
      natRules: dev.natRules,
      dhcpPools: dev.dhcpPools,
      leases: [...dev.leases.entries()].map(([iface, l]) => ({
        iface,
        ip: l.ip,
        gateway: l.gateway,
        prefix: l.prefix,
        poolNodeId: l.poolNodeId,
        expiresAt: l.expiresAt,
      })),
      dnsRecords: dev.dnsRecords,
      dnsServers: dev.dnsServers,
      webServer: dev.webServer,
      routingCfg: dev.routingCfg,
      bgpCfg: dev.bgpCfg,
      portVlans: Object.fromEntries(dev.portVlans),
      trunkPorts: [...dev.trunkPorts],
      shutdownIfaces: [...dev.shutdownIfaces],
      subinterfaces: Object.fromEntries(dev.subinterfaces),
      dhcpClientState: dev.dhcpClient?.state ?? null,
      neighbors: this.engine.getLldpNeighbors(dev.id),
    };
  }

  private linksOf(): LinkState[] {
    return this.engine.topology.links.all.map((l) => {
      const aDev = this.engine.getDevice(l.a.nodeId);
      const bDev = this.engine.getDevice(l.b.nodeId);
      return {
        id: l.id,
        cableType: l.cableType,
        a: {
          nodeId: l.a.nodeId,
          portId: l.a.port,
          nodeName: aDev?.name || l.a.nodeId,
          ifaceName: aDev?.getIfaceByPortId(l.a.port)?.name || l.a.port,
        },
        b: {
          nodeId: l.b.nodeId,
          portId: l.b.port,
          nodeName: bDev?.name || l.b.nodeId,
          ifaceName: bDev?.getIfaceByPortId(l.b.port)?.name || l.b.port,
        },
      };
    });
  }
}

// helpers kecil agar analis mudah bekerja dengan state.
export function ipOf(ifaceIp: string | null): string | null {
  if (!ifaceIp) return null;
  const p = parseCidr(ifaceIp);
  return p ? p.address : null;
}

export function cidrNet(cidr: string): string {
  return cidr;
}

export function isPrivateIp(ip: string | null): boolean {
  if (!ip || !isValidIp(ip)) return false;
  const [a, b] = ip.split('.').map(Number);
  return (
    (a === 10) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

export function defaultRouteOf(d: DeviceState): SimRoute | undefined {
  return d.routes.find((r) => r.dst === '0.0.0.0/0' || r.dst === '0.0.0.0');
}

/** apakah sebuah rute menutupi network `cidr` (LPM) */
export function covers(d: DeviceState, cidr: string): boolean {
  const p = parseCidr(cidr);
  if (!p) return false;
  for (const r of d.routes) {
    const rp = parseCidr(r.dst);
    if (!rp) continue;
    if (rp.prefix === 0) return true; // default route
    const mask = (0xffffffff << (32 - rp.prefix)) >>> 0;
    const a = ipInt(p.address) & mask;
    const b = ipInt(rp.address) & mask;
    if (a === b) return true;
  }
  return false;
}

export function ipInt(ip: string): number {
  return ip.split('.').reduce((acc, o) => (acc << 8) | parseInt(o, 10), 0) >>> 0;
}
