// ============================================================
// Observation — observasi/read-only helpers (statistik perangkat,
// lease, IPv6, LLDP, TCP, STP/wireless/QoS/port-security snapshot,
// status routing protokol, event history).
//
// Tidak memutasi state; membaca state yang dimiliki subsystem lain
// lewat context (nodes) dan ConfigStore.
// ============================================================

import { NetworkDevice } from '../devices/NetworkDevice';
import { SimulationContext } from './SimulationContext';
import { SimulationCore } from './SimulationCore';
import { ConfigStore } from './ConfigStore';
import { SimEvent } from './types';
import {
  BgpNeighborStateInfo,
  DeviceStatsSnapshot,
  DhcpLeaseGrant,
  DhcpLeaseInfo,
  LldpNeighborInfo,
  OspfNeighborInfo,
  TcpConnectionInfo,
} from '../compat';
import { BgpRibEntry, OspfLsa } from '../services/RoutingProtocolEngine';
import { qosStatsOf } from '../services/QosService';

export class Observation {
  constructor(
    private readonly ctx: SimulationContext,
    private readonly core: SimulationCore,
    private readonly configStore: ConfigStore
  ) {}

  get eventHistory(): SimEvent[] {
    return this.core.eventLog;
  }

  get packetQueue() {
    return this.core.queueSnapshot();
  }

  getDeviceStats(nodeId: string): DeviceStatsSnapshot | null {
    const dev = this.ctx.nodes.get(nodeId);
    if (!dev) return null;
    const stp = dev.stpState;
    const fhrp = this.configStore.getFhrpInfo(nodeId);
    return {
      name: dev.name,
      deviceType: dev.deviceType,
      interfaces: dev.getInterfaces().map((i) => {
        const hasCable = this.configStore.portHasPhysicalLink(dev, i);
        const adminUp = !dev.shutdownIfaces.has(i.name);
        const portId = this.configStore.physicalPortId(dev, i);
        const linkDown = !!(hasCable && portId && this.ctx.topology.links.linkOn(dev.id, portId)?.down);
        let operational: 'up' | 'down' | 'not-connected' | 'admin-down' | 'link-down';
        if (!hasCable) operational = 'not-connected';
        else if (!adminUp) operational = 'admin-down';
        else if (linkDown) operational = 'link-down';
        else if (i.up) operational = 'up';
        else operational = 'down';
        return {
          name: i.name,
          mac: i.mac,
          ip: i.ip ? `${i.ip.address}/${i.ip.prefix}` : null,
          ipv6: i.ipv6 ? `${i.ipv6.address}/${i.ipv6.prefix}` : null,
          up: i.up,
          linked: hasCable,
          operational,
        };
      }),
      arp: dev.arpCache.entriesList().map((e) => ({ ip: e.ip, mac: e.mac })),
      macTable: dev.macTable.entriesList().map((e) => ({ mac: e.mac, port: e.port, vlan: e.vlan ?? undefined })),
      routes: dev.getRoutes().map((r) => ({ dst: r.dst, gateway: r.gateway || '', iface: r.iface || '', kind: r.kind, active: r.active })),
      stp: stp
        ? {
            rootId: stp.rootId,
            rootName: stp.rootName,
            rootPort: stp.rootPort,
            ports: [...stp.ports.entries()].map(([port, s]) => ({
              port,
              role: s.role,
              state: s.state,
              cost: s.cost,
            })),
          }
        : undefined,
      fhrp: fhrp && fhrp.length > 0 ? fhrp.map((f) => ({
        virtualAddress: f.virtualAddress,
        vip: f.vip,
        isMaster: f.isMaster,
        masterName: f.masterName,
        priority: f.priority,
        interface: f.interface,
        vrid: f.vrid,
      })) : undefined,
      portSecurity: Object.keys(dev.portSecurityCfg).length > 0
        ? Object.fromEntries(
            Object.entries(dev.portSecurityCfg).map(([port, c]) => [
              port,
              { limit: c.limit || 1, sticky: !!c.sticky, learned: [...c.learned] },
            ])
          )
        : undefined,
    };
  }

  getLeases(): DhcpLeaseInfo[] {
    const out: DhcpLeaseInfo[] = [];
    for (const dev of this.ctx.nodes.values()) {
      for (const lease of dev.leases.values()) {
        out.push({ nodeId: dev.id, ip: lease.ip, gateway: lease.gateway, prefix: lease.prefix, poolNodeId: lease.poolNodeId });
      }
    }
    return out;
  }

  getLeaseFor(nodeId: string): DhcpLeaseGrant | null {
    const dev = this.ctx.nodes.get(nodeId);
    if (!dev) return null;
    for (const lease of dev.leases.values()) return lease;
    return null;
  }

  /** Info IPv6 perangkat untuk CLI (alamat, rute, neighbor NDP). */
  getIpv6Info(nodeId: string): {
    addresses: { iface: string; address: string; prefix: number }[];
    routes: { dst: string; gateway: string | null }[];
    neighbors: { ip: string; mac: string; iface: string }[];
  } | null {
    const dev = this.ctx.nodes.get(nodeId);
    if (!dev) return null;
    // SLAAC/DHCPv6 client: alamat otomatis dari prefix router terhubung
    // dipicu saat info diminta (print /ipv6 dhcp-client).
    if (dev.slaacIfaces.length > 0 && !dev.getInterfaces().some((i) => i.ipv6 && i.up)) {
      this.configStore.slaacAutoConfig(dev);
    }
    return {
      addresses: dev
        .getInterfaces()
        .filter((i) => i.ipv6)
        .map((i) => ({ iface: i.name, address: i.ipv6!.address, prefix: i.ipv6!.prefix })),
      routes: dev.getIpv6Routes().map((r) => ({ dst: r.dst, gateway: r.gateway })),
      neighbors: dev.ipv6Neighbors.entriesList().map((e) => ({ ip: e.ip, mac: e.mac, iface: e.iface })),
    };
  }

  getLldpNeighbors(nodeId: string): LldpNeighborInfo[] {
    const out: LldpNeighborInfo[] = [];
    if (!this.configStore.isNodePowered(nodeId)) return out;
    const dev = this.ctx.nodes.get(nodeId);
    if (!dev) return out;
    for (const link of this.ctx.topology.links.linksOf(nodeId)) {
      const peerId = link.a.nodeId === nodeId ? link.b.nodeId : link.a.nodeId;
      const peer = this.ctx.nodes.get(peerId);
      if (!peer || !this.configStore.isNodePowered(peerId)) continue;
      const localPort = link.a.nodeId === nodeId ? link.a.port : link.b.port;
      const peerPort = link.a.nodeId === peerId ? link.a.port : link.b.port;
      out.push({
        peerNodeId: peer.id,
        peerName: peer.name,
        peerDeviceType: peer.deviceType,
        localPort: dev.getIfaceByPortId(localPort)?.name || localPort,
        peerPort: peer.getIfaceByPortId(peerPort)?.name || peerPort,
      });
    }
    return out;
  }

  getOspfNeighbors(nodeId: string): OspfNeighborInfo[] {
    return this.ctx.routingProtocols.getOspfNeighbors(nodeId).map((n) => ({
      routerId: n.routerId,
      ip: n.ip,
      iface: n.iface,
      state: n.state,
    }));
  }

  getBgpNeighborStates(nodeId: string): BgpNeighborStateInfo[] {
    return this.ctx.routingProtocols.getBgpPeerViews(nodeId).map((p) => ({
      remoteAddr: p.remoteAddr,
      remoteAs: p.remoteAs,
      state: p.state,
      uptime: p.state === 'Established' ? '00:00:12' : 'never',
      prefixes: p.prefixes,
    }));
  }

  /** LSDB OSPF (Router-LSA per advertiser) untuk observasi/verifikasi. */
  getOspfLsdb(nodeId: string): OspfLsa[] {
    return this.ctx.routingProtocols.getOspfLsdb(nodeId);
  }

  /** Loc-RIB BGP (hasil best-path selection) untuk observasi/verifikasi. */
  getBgpRib(nodeId: string): BgpRibEntry[] {
    return this.ctx.routingProtocols.getBgpRib(nodeId);
  }

  getTcpConnections(nodeId: string): TcpConnectionInfo[] {
    const dev = this.ctx.nodes.get(nodeId);
    if (!dev) return [];
    return dev.tcpConnections as unknown as TcpConnectionInfo[];
  }

  /** Snapshot STP per port (provider CLI `show spanning-tree`). */
  getStpInfo(nodeId: string): {
    enabled: boolean;
    mode: string;
    priority: number;
    rootId: string;
    rootName: string;
    bridgeId: string;
    rootPort: string | null;
    ports: { port: string; role: string; state: string; cost: number }[];
  } | null {
    const dev = this.ctx.nodes.get(nodeId);
    if (!dev || !dev.isSwitch) return null;
    const st = dev.stpState;
    if (!st) return null;
    return {
      enabled: dev.stpConfig.enabled,
      mode: dev.stpConfig.mode,
      priority: dev.stpConfig.priority,
      rootId: st.rootId,
      rootName: st.rootName,
      bridgeId: st.bridgeId,
      rootPort: st.rootPort,
      ports: [...st.ports.entries()].map(([portId, p]) => ({
        port: dev.getIfaceByPortId(portId)?.name || portId,
        role: p.role,
        state: p.state,
        cost: p.cost,
      })),
    };
  }

  /** Snapshot wireless perangkat (provider CLI registration-table/monitor). */
  getWirelessInfo(nodeId: string): {
    isStation: boolean;
    mode: string;
    ssid: string;
    security: string;
    associations: { mac: string; name: string; ssid: string; iface: string; signal: number }[];
    link: { apId: string; apName: string; iface: string; ssid: string } | null;
  } | null {
    const dev = this.ctx.nodes.get(nodeId);
    if (!dev || dev.kind !== 'wireless') return null;
    const st = dev.wirelessState || { ap: true, associations: [], link: null };
    const firstCfg = Object.values(dev.wirelessCfg)[0] || {};
    const security = firstCfg.securityProfile ? `wpa2-psk (${firstCfg.securityProfile})` : firstCfg.security || 'open';
    return {
      isStation: !!st.link,
      mode: firstCfg.mode || 'ap-bridge',
      ssid: firstCfg.ssid || '',
      security,
      associations: st.associations.map((a) => ({ mac: a.stationMac, name: a.stationName, ssid: a.ssid, iface: a.iface, signal: a.signal })),
      link: st.link,
    };
  }

  /** Statistik live queue (provider `/queue simple print`). */
  getQosStats(nodeId: string): { name: string; bytes: number; packets: number; dropped: number }[] {
    const dev = this.ctx.nodes.get(nodeId);
    if (!dev) return [];
    return qosStatsOf(dev);
  }

  /** Snapshot port-security (untuk DeviceStats/PingPanel + tes). */
  getPortSecurityInfo(nodeId: string): Record<string, { limit: number; sticky: boolean; learned: string[] }> | null {
    const dev = this.ctx.nodes.get(nodeId);
    if (!dev || Object.keys(dev.portSecurityCfg).length === 0) return null;
    const out: Record<string, { limit: number; sticky: boolean; learned: string[] }> = {};
    for (const [port, c] of Object.entries(dev.portSecurityCfg)) {
      out[port] = { limit: c.limit || 1, sticky: !!c.sticky, learned: [...(c.learned || [])] };
    }
    return out;
  }
}