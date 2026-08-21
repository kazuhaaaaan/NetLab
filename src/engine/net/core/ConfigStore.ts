// ============================================================
// ConfigStore — ConfigRuntime/AddressRuntime/SwitchingRuntime/ServiceRuntime:
// state konfigurasi CLI yang bertahan antar sync topologi + penerapannya
// ke NetworkDevice + recompute protokol (STP/FHRP/wireless/routing dinamis).
//
// Subsystem ini PEMILIK tunggal map konfigurasi berikut (tidak ada yang
// lain yang memutasi-nya):
//   configs, configs6, dhcpPools, routings, bgps, snmps, acls, nats,
//   portVlans, shutIfaces, subinterfaces, trunkPorts, vlans, trunkAllowed,
//   trunkNative, poweredOff, dnsRecords, dnsServers, webServers, stps,
//   fhrpGroups, fhrpState, fhrpMasters, dhcpRelays, portSecurities,
//   slaacIfaces, wirelessCfgs, qoses.
// ============================================================

import { NetworkDevice } from '../devices/NetworkDevice';
import { NetworkInterfaceModel } from '../interfaces/NetworkInterface';
import { SimulationContext } from './SimulationContext';
import { AclRule, DnsRecord, NatRule, Vlan } from './types';
import { isValidIp, isValidHostIp, parseCidr } from './ip';
import { isIpv6Address, ipv6NetworkString, macToIpv6 } from './ipv6';
import { VlanInput, VlanTable, isValidVlanId } from '../layer2/VlanTable';
import { computeStp, StpConfig } from '../services/StpService';
import { computeFhrp, FhrpGroup, FhrpState } from '../services/FhrpService';
import { computeWireless, WirelessIfaceCfg, WirelessProfileCfg } from '../services/WirelessService';
import { freshQosState, MangleRule, SimpleQueue } from '../services/QosService';
import {
  BgpConfig,
  DhcpPoolInfo,
  RoutingMemoryShape,
  SnmpAgentConfig,
  WebServerInfo,
} from '../compat';

export class ConfigStore {
  private configs = new Map<string, { ips: Record<string, string>; routes: { dst: string; gateway: string | null; distance?: number }[] }>();
  private configs6 = new Map<string, { ips6: Record<string, string>; routes6: { dst: string; gateway: string | null }[] }>();
  private hostnames = new Map<string, string>();
  private dhcpPools = new Map<string, DhcpPoolInfo[]>();
  private routings = new Map<string, RoutingMemoryShape>();
  private bgps = new Map<string, BgpConfig>();
  private snmps = new Map<string, SnmpAgentConfig>();
  private acls = new Map<string, AclRule[]>();
  private nats = new Map<string, NatRule[]>();
  private portVlans = new Map<string, Map<string, number>>();
  private shutIfaces = new Map<string, Set<string>>();
  private subinterfaces = new Map<string, Map<string, { parentPort: string; vlanId: number }>>();
  private trunkPorts = new Map<string, Set<string>>();
  /** VLAN database otoritatif per node: nodeId → daftar intent (id boleh string,
   *  mis. '10' dari memori vendor). Dinormalisasi ke VlanTable device saat
   *  diterapkan (replace) — id invalid dibuang, duplikat disatukan. */
  private vlans = new Map<string, VlanInput[]>();
  /** allowed-list trunk per node: nodeId → iface → VLAN diizinkan. */
  private trunkAllowed = new Map<string, Map<string, number[]>>();
  /** native VLAN trunk per node: nodeId → iface → native id. */
  private trunkNative = new Map<string, Map<string, number>>();
  private poweredOff = new Set<string>();
  private dnsRecords = new Map<string, DnsRecord[]>();
  private dnsServers = new Map<string, string[]>();
  private webServers = new Map<string, WebServerInfo>();
  private stps = new Map<string, StpConfig>();
  private fhrpGroups = new Map<string, FhrpGroup[]>();
  private fhrpState = new Map<string, FhrpState[]>();
  private fhrpMasters = new Map<string, string>();
  private dhcpRelays = new Map<string, Record<string, string>>();
  private portSecurities = new Map<string, Record<string, { limit?: number; sticky?: boolean; violation?: string; learned?: string[] }>>();
  private slaacIfaces = new Map<string, string[]>();
  private wirelessCfgs = new Map<string, { interfaces: Record<string, WirelessIfaceCfg>; profiles: Record<string, WirelessProfileCfg> }>();
  private qoses = new Map<string, { queues: SimpleQueue[]; mangleRules: MangleRule[] }>();

  constructor(private readonly ctx: SimulationContext) {}

  // ── Daya perangkat ─────────────────────────────────────────────
  setNodePowered(nodeId: string, on: boolean): void {
    if (on) this.poweredOff.delete(nodeId);
    else this.poweredOff.add(nodeId);
    const dev = this.ctx.nodes.get(nodeId);
    if (dev) dev.powered = on;
    this.recomputeProtocols();
    // Rute yang dipelajari lewat perangkat ini harus ditarik — device mati
    // tidak bisa dijadikan next hop (OSPF/RIP/EIGRP/BGP distance-vector).
    this.computeDynamicRoutes();
  }

  isNodePowered(nodeId: string): boolean {
    return !this.poweredOff.has(nodeId) && (this.ctx.nodes.get(nodeId)?.powered ?? true);
  }

  // ── Penerapan konfigurasi ──────────────────────────────────────
  /** Terapkan semua konfigurasi tersimpan ke device + recompute protokol/rute. */
  applyAllConfigs(): void {
    for (const dev of this.ctx.nodes.values()) {
      const cfg = this.configs.get(dev.id);
      if (cfg) this.applyConfigToDevice(dev, cfg);
      const cfg6 = this.configs6.get(dev.id);
      if (cfg6) this.applyConfig6ToDevice(dev, cfg6);
      if (this.poweredOff.has(dev.id)) dev.powered = false;
      const shut = this.shutIfaces.get(dev.id);
      if (shut) {
        dev.shutdownIfaces = new Set(shut);
        for (const n of shut) dev.setIfaceUp(n, false);
      } else {
        dev.shutdownIfaces = new Set();
      }
      const pv = this.portVlans.get(dev.id);
      if (pv) dev.portVlans = new Map(pv);
      const hn = this.hostnames.get(dev.id);
      if (hn) dev.setHostname(hn);
      const tr = this.trunkPorts.get(dev.id);
      if (tr) dev.trunkPorts = new Set(tr);
      const vl = this.vlans.get(dev.id);
      if (vl) dev.vlanTable.replace(vl);
      const ta = this.trunkAllowed.get(dev.id);
      if (ta) dev.trunkAllowedVlans = new Map([...ta.entries()].map(([k, v]) => [k, [...v]]));
      const tn = this.trunkNative.get(dev.id);
      if (tn) dev.trunkNativeVlans = new Map(tn);
      const subs = this.subinterfaces.get(dev.id);
      if (subs) for (const [name, s] of subs) dev.addVirtualIface(name, s.parentPort, s.vlanId, '');
      const pools = this.dhcpPools.get(dev.id);
      if (pools) dev.dhcpPools = pools;
      const dns = this.dnsRecords.get(dev.id);
      if (dns) dev.dnsRecords = dns;
      const servers = this.dnsServers.get(dev.id);
      if (servers) dev.dnsServers = servers;
      const acls = this.acls.get(dev.id);
      if (acls) dev.aclRules = acls;
      const nats = this.nats.get(dev.id);
      if (nats) dev.natRules = nats;
      const web = this.webServers.get(dev.id);
      if (web) dev.webServer = { ...web };
      const routing = this.routings.get(dev.id);
      if (routing) dev.routingCfg = { ...routing };
      const bgp = this.bgps.get(dev.id);
      if (bgp) dev.bgpCfg = { asn: bgp.asn, peers: bgp.peers, networks: bgp.networks };
      const snmp = this.snmps.get(dev.id);
      if (snmp && snmp.enabled) {
        dev.snmpAgent = { ...snmp };
        dev.snmpUptimeBase = this.ctx.time.now();
      } else {
        dev.snmpAgent = null;
      }
      const stp = this.stps.get(dev.id);
      if (stp) dev.stpConfig = { ...dev.stpConfig, ...stp };
      const fhrp = this.fhrpGroups.get(dev.id);
      if (fhrp) dev.fhrpGroups = [...fhrp];
      const relays = this.dhcpRelays.get(dev.id);
      if (relays) dev.dhcpRelays = { ...relays };
      const ps = this.portSecurities.get(dev.id);
      if (ps) dev.portSecurityCfg = JSON.parse(JSON.stringify(ps));
      const slaac = this.slaacIfaces.get(dev.id);
      if (slaac) dev.slaacIfaces = [...slaac];
      const wl = this.wirelessCfgs.get(dev.id);
      if (wl) {
        dev.wirelessCfg = { ...wl.interfaces };
        dev.wirelessSecurityProfiles = { ...wl.profiles };
      }
      const qos = this.qoses.get(dev.id);
      if (qos) {
        dev.queues = [...qos.queues];
        dev.mangleRules = [...qos.mangleRules];
        dev.qosState = freshQosState();
      }
    }
    // Operasional port mengikuti KEBERADAAN kabel fisik (cable delete →
    // interface tetap terkonfigurasi tetapi link turun), lalu protokol
    // (STP/FHRP/wireless) dan rute dinamis (OSPF/BGP) dihitung ulang.
    this.applyLinkPresence();
    this.recomputeProtocols();
    this.computeDynamicRoutes();
  }

  /**
   * Kehadiran kabel fisik menentukan state OPERASIONAL interface, bukan
   * konfigurasinya. Prinsip: "DELETE CABLE ≠ DELETE INTERFACE CONFIG".
   *
   * - Port ethernet tanpa kabel → operasional DOWN (NOT_CONNECTED): tidak
   *   menerima/mengirim paket, rute connected menjadi inactive, adjacency
   *   OSPF/BGP ikut turun. Konfigurasi (IP/VLAN/NAT/...) tetap utuh.
   * - Port yang ternyata punya kabel → dibiarkan mengikuti status admin
   *   (shutdown/no-shutdown dari konfigurasi CLI).
   * - Subinterface VLAN mengikuti port fisik induknya.
   * - Interface wireless/bridge/loopback tidak bergantung kabel fisik.
   *
   * Pass ini TIDAK pernah menaikkan port: admin-down (shutdown) tidak akan
   * pernah dibuat hidup oleh keberadaan kabel, dan port yang kabelnya
   * dipasang kembali akan hidup lewat sync berikutnya (syncPorts/config).
   */
  private applyLinkPresence(): void {
    for (const dev of this.ctx.nodes.values()) {
      for (const iface of dev.getInterfaces()) {
        if (iface.type === 'wireless' || iface.type === 'bridge' || iface.type === 'loopback') continue;
        if (!this.portHasPhysicalLink(dev, iface)) dev.setIfaceUp(iface.name, false);
      }
    }
  }

  /** Port fisik sebuah interface (subinterface VLAN → port induk). */
  physicalPortId(dev: NetworkDevice, iface: NetworkInterfaceModel): string | null {
    if (iface.type === 'vlan' && iface.parentPort) {
      const parent = dev.getIfaceByName(iface.parentPort);
      return parent ? parent.portId : null;
    }
    return iface.portId;
  }

  /** Benarkah ada kabel (edge) yang menempel ke port fisik interface ini? */
  portHasPhysicalLink(dev: NetworkDevice, iface: NetworkInterfaceModel): boolean {
    const portId = this.physicalPortId(dev, iface);
    if (!portId) return false;
    const link = this.ctx.topology.links.linkOn(dev.id, portId);
    return link !== null;
  }

  /** Hitung ulang STP / FHRP / wireless setelah topologi & konfigurasi berubah. */
  private recomputeProtocols(): void {
    const devices = [...this.ctx.nodes.values()];
    const powered = (id: string) => this.isNodePowered(id);
    const stp = computeStp(devices, this.ctx.topology.links, powered);
    for (const dev of devices) {
      const prev = dev.stpPorts;
      dev.stpState = stp.get(dev.id) || null;
      dev.stpPorts = dev.stpState ? new Map(dev.stpState.ports) : new Map();
      // RSTP: topology change → flush MAC table agar tidak ada entry stale
      // yang menunjuk ke jalur lama (port yang berubah role/state).
      if (dev.isSwitch && !samePortStates(prev, dev.stpPorts)) {
        dev.macTable.clear();
      }
    }
    this.computeFhrp();
    this.computeWireless();
  }

  /**
   * Pemilihan master VRRP per virtual IP: yang menyala + prioritas
   * tertinggi menang (tie-break: id node terkecil). Hanya master yang
   * "memiliki" virtual IP (device.hasIp), sehingga ping ke virtual IP
   * selalu menuju master — failover otomatis bila master dimatikan.
   */
  private computeFhrp(): void {
    const devices = [...this.ctx.nodes.values()];
    const prevMasters = this.fhrpMasters;
    const res = computeFhrp(devices, this.fhrpGroups, (id) => this.isNodePowered(id), this.ctx.topology.links);
    this.fhrpState = res.states;
    this.fhrpMasters = res.masters;
    for (const [vip, newMaster] of res.masters) {
      const oldMaster = prevMasters ? prevMasters.get(vip) : undefined;
      if (oldMaster && oldMaster !== newMaster) {
        // Failover FHRP: master berubah → ARP cache yang berisi VIP ini
        // sudah lama (MAC master lama) → bersihkan supaya host melakukan
        // ARP ulang dan menemukan master baru.
        for (const dev of devices) dev.arpCache.clear();
        // Transisi master terlihat di event log (observability failover).
        const now = this.ctx.time.now();
        this.ctx.bus.emit({
          id: `evt-vrrp-${now}-${oldMaster}-${newMaster}`,
          traceId: `vrrp-${vip}`,
          type: 'VRRP_TRANSITION',
          time: now,
          nodeId: newMaster,
          data: { vip, from: oldMaster, to: newMaster },
        });
      }
    }
  }

  /** Hitung ulang asosiasi wireless AP↔station. */
  private computeWireless(): void {
    const devices = [...this.ctx.nodes.values()];
    const st = computeWireless(devices, this.ctx.topology.links, (id) => this.isNodePowered(id));
    for (const dev of devices) {
      dev.wirelessState = st.get(dev.id) || null;
    }
  }

  private applyConfigToDevice(dev: NetworkDevice, cfg: { ips: Record<string, string>; routes: { dst: string; gateway: string | null; distance?: number }[] }): void {
    for (const [ifaceName, cidr] of Object.entries(cfg.ips)) {
      // Tolak alamat network/broadcast sebagai host — bukan IP yang bisa dipakai.
      const parsed = parseCidr(cidr);
      if (parsed && !isValidHostIp(parsed.address, parsed.prefix)) continue;
      // IP duplikat pada perangkat lain → alamat tidak dipasang (validasi
      // mencegah dua host memakai IP sama; konfigurasi tetap tampil di print
      // CLI, tapi engine menolak efeknya).
      if (parsed && this.ipUsedElsewhere(dev.id, parsed.address)) continue;
      dev.setIpByName(ifaceName, cidr);
    }
    dev.clearStaticRoutes();
    for (const r of cfg.routes) {
      if (!r.gateway) continue;
      // Gateway bukan alamat IP → rute ditolak (bukan fake success).
      if (!isValidIp(r.gateway)) continue;
      dev.addStaticRoute(r.dst, r.gateway, r.distance);
    }
  }

  /** true bila alamat `ip` sudah dipakai interface/lease perangkat lain. */
  private ipUsedElsewhere(selfNodeId: string, ip: string): boolean {
    const now = this.ctx.time.now();
    for (const dev of this.ctx.nodes.values()) {
      if (dev.id === selfNodeId) continue;
      for (const i of dev.getInterfaces()) if (i.ip && i.ip.address === ip) return true;
      for (const lease of dev.leases.values()) if (lease.expiresAt > now && lease.ip === ip) return true;
    }
    return false;
  }

  private applyConfig6ToDevice(dev: NetworkDevice, cfg: { ips6: Record<string, string>; routes6: { dst: string; gateway: string | null }[] }): void {
    for (const [iface, cidr] of Object.entries(cfg.ips6)) {
      dev.configuredIpv6s.set(iface, cidr);
      dev.setIpv6ByName(iface, cidr);
    }
    dev.ipv6StaticRoutes = cfg.routes6
      .filter((r) => r.gateway && (r.gateway === 'discard' || isIpv6Address(r.gateway)))
      .map((r) => ({ dst: r.dst, gateway: r.gateway, iface: null, kind: 'static' }));
    dev.applyStaticRoutes6();
  }

  /** SLAAC: host tanpa alamat v6 otomatis mendapat alamat dari prefix router
   *  terhubung (EUI-64) + default route — dipanggil sebelum ping6/print. */
  slaacAutoConfig(src: NetworkDevice): boolean {
    for (const link of this.ctx.topology.links.linksOf(src.id)) {
      const peerId = link.a.nodeId === src.id ? link.b.nodeId : link.a.nodeId;
      const peer = this.ctx.nodes.get(peerId);
      if (!peer || !this.isNodePowered(peerId)) continue;
      const myPort = link.a.nodeId === src.id ? link.a.port : link.b.port;
      const peerPort = link.a.nodeId === peerId ? link.a.port : link.b.port;
      const myIface = src.getIfaceByPortId(myPort) || src.getIfaceByName(myPort);
      const peerIface = peer.getIfaceByPortId(peerPort) || peer.getIfaceByName(peerPort);
      if (!myIface || !peerIface?.ipv6) continue;
      const network = ipv6NetworkString(peerIface.ipv6.address, peerIface.ipv6.prefix);
      const addr = macToIpv6(myIface.mac, network, Math.min(peerIface.ipv6.prefix, 64));
      if (!addr) continue;
      src.setIpv6ByName(myIface.name, `${addr}/${peerIface.ipv6.prefix}`);
      const gw = peerIface.ipv6.address;
      if (!src.ipv6StaticRoutes.some((r) => r.dst === '::/0')) {
        src.ipv6StaticRoutes.push({ dst: '::/0', gateway: gw, iface: null, kind: 'static' });
        src.ipv6Routing.addRoute({ dst: '::/0', gateway: gw, iface: null, kind: 'static' });
      }
      src.slaacAddresses[myIface.name] = `${addr}/${peerIface.ipv6.prefix}`;
      return true;
    }
    return false;
  }

  /**
   * Hitung ulang rute protokol dinamis (OSPF/RIP/EIGRP/BGP) dengan state
   * FSM persisten dari engine.
   * @param opts.rounds 0 (default) = konvergen (round sampai stabil);
   *   n>0 = tepat n protocol round untuk observasi transisi FSM.
   */
  computeDynamicRoutes(opts?: { rounds?: number }): void {
    this.ctx.routingProtocols.compute([...this.ctx.nodes.values()], this.ctx.topology.links, opts?.rounds ?? 0);
  }

  // ── Setter konfigurasi CLI (semua mempertahankan map + cermin device) ──
  setFhrp(nodeId: string, groups: FhrpGroup[] | undefined): void {
    if (groups && groups.length > 0) this.fhrpGroups.set(nodeId, groups);
    else this.fhrpGroups.delete(nodeId);
    const dev = this.ctx.nodes.get(nodeId);
    if (dev) dev.fhrpGroups = groups && groups.length > 0 ? groups : [];
    this.recomputeProtocols();
  }

  /** Snapshot FHRP perangkat (provider CLI `routing vrrp instance print`). */
  getFhrpInfo(nodeId: string): FhrpState[] | null {
    const states = this.fhrpState.get(nodeId);
    if (!states || states.length === 0) return null;
    return states;
  }

  setStp(nodeId: string, cfg: StpConfig | undefined): void {
    if (cfg) this.stps.set(nodeId, cfg);
    else this.stps.delete(nodeId);
    const dev = this.ctx.nodes.get(nodeId);
    if (dev) {
      dev.stpConfig = cfg ? { ...dev.stpConfig, ...cfg } : { enabled: true, priority: 32768, mode: 'rstp' };
    }
    this.recomputeProtocols();
  }

  getStpConfig(nodeId: string): StpConfig | undefined {
    return this.stps.get(nodeId);
  }

  setWireless(nodeId: string, cfg: { interfaces: Record<string, WirelessIfaceCfg>; profiles: Record<string, WirelessProfileCfg> } | undefined): void {
    if (cfg) {
      this.wirelessCfgs.set(nodeId, cfg);
    } else {
      this.wirelessCfgs.delete(nodeId);
    }
    const dev = this.ctx.nodes.get(nodeId);
    if (dev) {
      if (cfg) {
        dev.wirelessCfg = { ...cfg.interfaces };
        dev.wirelessSecurityProfiles = { ...cfg.profiles };
      } else {
        dev.wirelessCfg = {};
        dev.wirelessSecurityProfiles = {};
      }
    }
    this.recomputeProtocols();
  }

  setQos(nodeId: string, queues: SimpleQueue[] | undefined, mangleRules: MangleRule[] | undefined): void {
    if ((queues && queues.length > 0) || (mangleRules && mangleRules.length > 0)) {
      this.qoses.set(nodeId, { queues: queues || [], mangleRules: mangleRules || [] });
    } else {
      this.qoses.delete(nodeId);
    }
    const dev = this.ctx.nodes.get(nodeId);
    if (dev) {
      dev.queues = queues || [];
      dev.mangleRules = mangleRules || [];
      dev.qosState = freshQosState();
    }
  }

  applyNodeConfig(nodeId: string, ips: Record<string, string>, routes: Array<{ dst: string; gateway: string; distance?: number }>): void {
    const existing = this.configs.get(nodeId);
    const cfg = {
      ips: { ...(existing?.ips || {}), ...ips },
      routes: routes.map((r) => ({ dst: r.dst, gateway: r.gateway || null, distance: r.distance })),
    };
    this.configs.set(nodeId, cfg);
    const dev = this.ctx.nodes.get(nodeId);
    if (dev) this.applyConfigToDevice(dev, cfg);
  }

  /** Konfigurasi IPv6 per node (alamat interface + rute statis v6). */
  applyNodeConfig6(nodeId: string, ips6: Record<string, string>, routes6: Array<{ dst: string; gateway: string }>): void {
    const existing = this.configs6.get(nodeId);
    const cfg = {
      ips6: { ...(existing?.ips6 || {}), ...ips6 },
      routes6: routes6.map((r) => ({ dst: r.dst, gateway: r.gateway || null })),
    };
    this.configs6.set(nodeId, cfg);
    const dev = this.ctx.nodes.get(nodeId);
    if (dev) this.applyConfig6ToDevice(dev, cfg);
  }

  setDhcpPools(poolsByNode: Record<string, DhcpPoolInfo[]>): void {
    this.dhcpPools.clear();
    for (const [nodeId, pools] of Object.entries(poolsByNode)) {
      if (Array.isArray(pools) && pools.length > 0) {
        this.dhcpPools.set(nodeId, pools);
        const dev = this.ctx.nodes.get(nodeId);
        if (dev) dev.dhcpPools = pools;
      }
    }
  }

  /** DHCP relay per perangkat: port (nama interface) → server diteruskan. */
  setDhcpRelays(nodeId: string, relays: Record<string, string> | undefined): void {
    if (relays && Object.keys(relays).length > 0) this.dhcpRelays.set(nodeId, { ...relays });
    else this.dhcpRelays.delete(nodeId);
    const dev = this.ctx.nodes.get(nodeId);
    if (dev) dev.dhcpRelays = relays && Object.keys(relays).length > 0 ? { ...relays } : {};
  }

  /** Port-security per port switch: { limit, sticky, violation }. */
  setPortSecurity(nodeId: string, cfg: Record<string, { limit?: number; sticky?: boolean; violation?: string; learned?: string[] }> | undefined): void {
    if (cfg && Object.keys(cfg).length > 0) this.portSecurities.set(nodeId, cfg);
    else this.portSecurities.delete(nodeId);
    const dev = this.ctx.nodes.get(nodeId);
    if (dev) {
      dev.portSecurityCfg = {};
      if (cfg) {
        for (const [port, c] of Object.entries(cfg)) {
          dev.portSecurityCfg[port] = { limit: c.limit, sticky: c.sticky, learned: [] };
        }
      }
    }
  }

  /** Interface dengan SLAAC/DHCPv6 client (autoconfig IPv6). */
  setIpv6DhcpClients(nodeId: string, ifaces: string[] | undefined): void {
    if (ifaces && ifaces.length > 0) this.slaacIfaces.set(nodeId, [...ifaces]);
    else this.slaacIfaces.delete(nodeId);
    const dev = this.ctx.nodes.get(nodeId);
    if (dev) dev.slaacIfaces = ifaces && ifaces.length > 0 ? [...ifaces] : [];
  }

  setRouting(nodeId: string, cfg: RoutingMemoryShape | undefined): void {
    const enabled = cfg && (cfg.ospf?.enabled || cfg.rip?.enabled || cfg.eigrp?.enabled);
    if (enabled) this.routings.set(nodeId, cfg);
    else this.routings.delete(nodeId);
    const dev = this.ctx.nodes.get(nodeId);
    if (dev) dev.routingCfg = enabled ? { ...cfg } : {};
  }

  setBgp(nodeId: string, cfg: BgpConfig | undefined): void {
    if (cfg && cfg.asn) this.bgps.set(nodeId, cfg);
    else this.bgps.delete(nodeId);
    const dev = this.ctx.nodes.get(nodeId);
    if (dev) {
      dev.bgpCfg = cfg && cfg.asn
        ? {
            asn: cfg.asn,
            peers: cfg.peers.map((p) => ({ remoteAs: p.remoteAs, remoteAddr: p.remoteAddr, localPref: p.localPref })),
            networks: cfg.networks,
            routerId: cfg.routerId,
          }
        : null;
    }
  }

  setSnmp(nodeId: string, cfg: SnmpAgentConfig | undefined): void {
    if (cfg && cfg.enabled) {
      this.snmps.set(nodeId, {
        enabled: true,
        community: cfg.community || 'public',
        communityRW: cfg.communityRW || 'private',
        sysContact: cfg.sysContact || '',
        sysLocation: cfg.sysLocation || '',
      });
    } else {
      this.snmps.delete(nodeId);
    }
    const dev = this.ctx.nodes.get(nodeId);
    if (dev) {
      dev.snmpAgent = cfg && cfg.enabled ? { enabled: true, community: cfg.community || 'public', communityRW: cfg.communityRW || 'private', sysContact: cfg.sysContact || '', sysLocation: cfg.sysLocation || '' } : null;
      // Agent (aktif) memulai penghitung sysUpTime dari momen ini.
      dev.snmpUptimeBase = dev.snmpAgent ? this.ctx.time.now() : null;
    }
  }

  setAcls(nodeId: string, rules: AclRule[] | undefined): void {
    if (rules && rules.length > 0) this.acls.set(nodeId, rules);
    else this.acls.delete(nodeId);
    const dev = this.ctx.nodes.get(nodeId);
    if (dev) dev.aclRules = rules && rules.length > 0 ? rules : [];
  }

  setNatRules(nodeId: string, rules: NatRule[] | undefined): void {
    if (rules && rules.length > 0) this.nats.set(nodeId, rules);
    else this.nats.delete(nodeId);
    const dev = this.ctx.nodes.get(nodeId);
    if (dev) dev.natRules = rules && rules.length > 0 ? rules : [];
  }

  setDnsRecords(nodeId: string, records: DnsRecord[] | undefined): void {
    if (records && records.length > 0) this.dnsRecords.set(nodeId, records);
    else this.dnsRecords.delete(nodeId);
    const dev = this.ctx.nodes.get(nodeId);
    if (dev) dev.dnsRecords = records && records.length > 0 ? records : [];
  }

  setDnsServers(nodeId: string, servers: string[] | undefined): void {
    if (servers && servers.length > 0) this.dnsServers.set(nodeId, servers);
    else this.dnsServers.delete(nodeId);
    const dev = this.ctx.nodes.get(nodeId);
    if (dev) dev.dnsServers = servers && servers.length > 0 ? servers : [];
  }

  setWebServer(nodeId: string, info: WebServerInfo | undefined): void {
    if (info) this.webServers.set(nodeId, info);
    else this.webServers.delete(nodeId);
    const dev = this.ctx.nodes.get(nodeId);
    if (dev) dev.webServer = info ? { enabled: info.enabled, port: info.port, content: info.content } : null;
  }

  setPortVlans(nodeId: string, vlanByIface: Record<string, number> | undefined): void {
    if (vlanByIface && Object.keys(vlanByIface).length > 0) this.portVlans.set(nodeId, new Map(Object.entries(vlanByIface)));
    else this.portVlans.delete(nodeId);
    const dev = this.ctx.nodes.get(nodeId);
    if (dev) dev.portVlans = vlanByIface ? new Map(Object.entries(vlanByIface)) : new Map();
  }

  /** Hostname terkonfigurasi per perangkat (state device, bertahan antar sync). */
  setHostname(nodeId: string, hostname?: string): void {
    if (hostname && hostname.trim().length > 0) this.hostnames.set(nodeId, hostname.trim());
    else this.hostnames.delete(nodeId);
    const dev = this.ctx.nodes.get(nodeId);
    if (dev) dev.setHostname(hostname);
  }

  setShutdownIfaces(nodeId: string, names: string[] | undefined): void {
    const prev = this.shutIfaces.get(nodeId);
    const next = names && names.length > 0 ? new Set(names) : new Set<string>();
    if (next.size > 0) this.shutIfaces.set(nodeId, next);
    else this.shutIfaces.delete(nodeId);
    const dev = this.ctx.nodes.get(nodeId);
    if (!dev) return;
    // Cermin di device: getDeviceStats membaca dev.shutdownIfaces (bukan
    // map simulator) — tanpa ini state divergen (operational selalu 'down',
    // bukan 'admin-down').
    dev.shutdownIfaces = next;
    // Interface yang baru masuk daftar shutdown → turunkan.
    for (const n of next) dev.setIfaceUp(n, false);
    // Interface yang keluar dari daftar (no shutdown) → hidupkan kembali.
    if (prev) {
      for (const n of prev) {
        if (!next.has(n)) dev.setIfaceUp(n, true);
      }
    }
    // Interface naik/turun mengubah adjacency OSPF/RIP/BGP → rute dinamis
    // harus dihitung ulang, kalau tidak tabel routing menyimpan gateway mati.
    this.computeDynamicRoutes();
  }

  setSubinterfaces(nodeId: string, subs: { name: string; parentPort: string; vlanId: number }[] | undefined): void {
    if (subs && subs.length > 0) {
      const m = new Map<string, { parentPort: string; vlanId: number }>();
      for (const s of subs) m.set(s.name, { parentPort: s.parentPort, vlanId: s.vlanId });
      this.subinterfaces.set(nodeId, m);
    } else this.subinterfaces.delete(nodeId);
    const dev = this.ctx.nodes.get(nodeId);
    if (dev) for (const s of subs || []) dev.addVirtualIface(s.name, s.parentPort, s.vlanId, '');
  }

  setTrunkPorts(nodeId: string, names: string[] | undefined): void {
    if (names && names.length > 0) this.trunkPorts.set(nodeId, new Set(names));
    else this.trunkPorts.delete(nodeId);
    const dev = this.ctx.nodes.get(nodeId);
    if (dev) dev.trunkPorts = names ? new Set(names) : new Set();
  }

  /**
   * VLAN database otoritatif perangkat (dari CLI: `vlan 10` + `name X`,
   * `/interface vlan add`, `set vlans …`). Masuk ke VlanTable perangkat —
   * sumber kebenaran pengklasifikasian VLAN. Id berupa string (representasi
   * memori vendor, mis. '10') dinormalisasi; id invalid dibuang; duplikat
   * disatukan (VlanTable.replace, entri terakhir menang).
   */
  setVlans(nodeId: string, vlans: VlanInput[] | undefined): void {
    if (vlans && vlans.length > 0) this.vlans.set(nodeId, vlans);
    else this.vlans.delete(nodeId);
    const dev = this.ctx.nodes.get(nodeId);
    if (dev) dev.vlanTable.replace(vlans || []);
  }

  /** Snapshot VLAN database node (provider CLI `show vlan` / `/interface vlan print`).
   *  Device ada → lihat VlanTable-nya (otoritatif, ternormalisasi). Device belum
   *  ada → normalisasi dari memori yang tersimpan agar id string ('10') menjadi
   *  angka dan id invalid tidak pernah tampil (bukan fake success). */
  getNodeVlans(nodeId: string): Vlan[] {
    const dev = this.ctx.nodes.get(nodeId);
    if (dev) return dev.vlanTable.list();
    const stored = this.vlans.get(nodeId);
    if (!stored || stored.length === 0) return [];
    const tmp = new VlanTable();
    tmp.replace(stored);
    return tmp.list();
  }

  /** Allowed-list trunk: iface → VLAN yang boleh lewat (undefined = semua;
   *  daftar KOSONG dipertahankan = `switchport trunk allowed vlan none`,
   *  trunk tidak membawa VLAN apa pun). Id di luar 1..4094 dibuang —
   *  konfigurasi invalid tidak diterima diam-diam. */
  setTrunkAllowed(nodeId: string, allowedByIface: Record<string, number[]> | undefined): void {
    if (allowedByIface && Object.keys(allowedByIface).length > 0) {
      const cleaned = new Map<string, number[]>();
      for (const [iface, ids] of Object.entries(allowedByIface)) {
        if (!Array.isArray(ids)) continue;
        const ok = ids.filter((id) => isValidVlanId(id));
        // Daftar kosong ("none") TETAP disimpan — membedakannya dari "tidak
        // dikonfigurasi" (semua VLAN) wajib untuk enforcement yang jujur.
        cleaned.set(iface, ok);
      }
      if (cleaned.size > 0) this.trunkAllowed.set(nodeId, cleaned);
      else this.trunkAllowed.delete(nodeId);
    } else {
      this.trunkAllowed.delete(nodeId);
    }
    const dev = this.ctx.nodes.get(nodeId);
    if (dev) {
      const m = new Map<string, number[]>();
      const src = allowedByIface || {};
      for (const [iface, ids] of Object.entries(src)) {
        if (!Array.isArray(ids)) continue;
        m.set(iface, ids.filter((id) => isValidVlanId(id)));
      }
      dev.trunkAllowedVlans = m;
    }
  }

  /** Native VLAN trunk: iface → native id. Id invalid (di luar 1..4094) dibuang. */
  setTrunkNative(nodeId: string, nativeByIface: Record<string, number> | undefined): void {
    if (nativeByIface && Object.keys(nativeByIface).length > 0) {
      const cleaned = new Map<string, number>();
      for (const [iface, id] of Object.entries(nativeByIface)) {
        if (isValidVlanId(id)) cleaned.set(iface, id);
      }
      if (cleaned.size > 0) this.trunkNative.set(nodeId, cleaned);
      else this.trunkNative.delete(nodeId);
    } else {
      this.trunkNative.delete(nodeId);
    }
    const dev = this.ctx.nodes.get(nodeId);
    if (dev) {
      const m = new Map<string, number>();
      const src = nativeByIface || {};
      for (const [iface, id] of Object.entries(src)) {
        if (isValidVlanId(id)) m.set(iface, id);
      }
      dev.trunkNativeVlans = m;
    }
  }

  getNodeTrunkAllowed(nodeId: string): Map<string, number[]> {
    const dev = this.ctx.nodes.get(nodeId);
    if (dev) return dev.trunkAllowedVlans;
    return this.trunkAllowed.get(nodeId) || new Map();
  }

  getNodeTrunkNative(nodeId: string): Map<string, number> {
    const dev = this.ctx.nodes.get(nodeId);
    if (dev) return dev.trunkNativeVlans;
    return this.trunkNative.get(nodeId) || new Map();
  }

  // ── Getter CLI state (grading) ─────────────────────────────────
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

  getNodeVlanConfig(nodeId: string): { vlans: Vlan[]; allowed: Map<string, number[]>; native: Map<string, number> } {
    return {
      vlans: this.getNodeVlans(nodeId),
      allowed: this.getNodeTrunkAllowed(nodeId),
      native: this.getNodeTrunkNative(nodeId),
    };
  }

  getNodeShutdownIfaces(nodeId: string): Set<string> {
    return this.shutIfaces.get(nodeId) || new Set();
  }

  getNodeSubinterfaces(nodeId: string): Map<string, { parentPort: string; vlanId: number }> {
    return this.subinterfaces.get(nodeId) || new Map();
  }
}

/** True bila dua peta state STP identik (tidak ada topology change). */
function samePortStates(a: Map<string, unknown>, b: Map<string, unknown>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) {
    const o = b.get(k);
    if (!o || JSON.stringify(o) !== JSON.stringify(v)) return false;
  }
  return true;
}