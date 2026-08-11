// ============================================================
// NetworkSimulator — orkestrator event-driven.
// Memegang scheduler (waktu virtual), event bus (observer),
// topologi + device + processor, ARP buffering, manajemen run.
// API publik kompatibel dengan SimulationEngine lama sehingga
// App/GradingModal hanya perlu mengganti import.
// ============================================================

import { EventScheduler } from './EventScheduler';
import { TimeManager } from './TimeManager';
import { EventBus } from './EventBus';
import { Topology, LabProjectLike, transmissionDelay, linkLatencyMs } from './Topology';
import { NetworkDevice } from '../devices/NetworkDevice';
import { DeviceProcessor, SimulatorCore, processorKind } from '../devices/DeviceProcessor';
import { SwitchProcessor } from '../devices/SwitchProcessor';
import { WirelessProcessor } from '../devices/WirelessProcessor';
import { RouterProcessor } from '../devices/RouterProcessor';
import { HostProcessor } from '../devices/HostProcessor';
import { arpResolveAndSend } from '../devices/sendUtils';
import { ndpResolveAndSend } from '../devices/ndpUtils';
import { RoutingProtocolEngine } from '../services/RoutingProtocolEngine';
import { computeStp, StpConfig, StpPortState } from '../services/StpService';
import { computeFhrp, FhrpGroup, FhrpState } from '../services/FhrpService';
import { computeWireless, WirelessIfaceCfg, WirelessProfileCfg } from '../services/WirelessService';
import { applyMangle, applyQos, freshQosState, MangleRule, qosStatsOf, SimpleQueue } from '../services/QosService';
import { NetworkInterfaceModel } from '../interfaces/NetworkInterface';
import { NetworkInterface, Packet, RunResult, SimEvent, SimEventType } from './types';
import { isValidIp, inSameSubnet, isValidHostIp, parseCidr } from './ip';
import { isIpv6Address, inSameIpv6Subnet, ipv6NetworkString, macToIpv6 } from './ipv6';
import { buildTcpSegment, TCP_SYN } from '../layer4/Tcp';
import { AclRule, DnsRecord, NatRule } from './types';
import {
  BgpConfig,
  BgpNeighborStateInfo,
  DhcpLeaseGrant,
  DhcpLeaseInfo,
  DhcpPoolInfo,
  DeviceStatsSnapshot,
  DnsResolution,
  LldpNeighborInfo,
  OspfNeighborInfo,
  PingSimResult,
  RoutingMemoryShape,
  SnmpAgentConfig,
  SnmpQueryOptions,
  SnmpQueryResult,
  TcpConnectResult,
  TcpConnectionInfo,
  TracerouteResult,
  WebServerInfo,
} from '../compat';

interface BufferedFrame {
  pkt: Packet;
  outPort: string;
  traceId: string;
}

interface Run extends RunResult {
  traceId: string;
  start: number;
  rootPktId?: string;
  fwdPath: string[];
  fwdEdges: string[];
  handshake?: { seq: number; ack: number; flags: string }[];
  snmp?: Record<string, unknown>;
}

export interface SimRunOptions {
  maxEvents?: number;
  maxTimeMs?: number;
}

const DEFAULT_TTL = 64;

export class NetworkSimulator implements SimulatorCore {
  readonly scheduler = new EventScheduler();
  readonly bus = new EventBus();
  readonly time = new TimeManager();
  readonly topology = new Topology();

  private nodes = new Map<string, NetworkDevice>();
  private processors = new Map<string, DeviceProcessor>();
  private runs = new Map<string, Run>();
  private arpBuffers = new Map<string, BufferedFrame[]>();
  private eventLog: SimEvent[] = [];
  private seq = 0;
  private runSeq = 0;
  private pktSeq = 0;

  // ── State konfigurasi CLI (bertahan antar sync topology) ──────
  private configs = new Map<string, { ips: Record<string, string>; routes: { dst: string; gateway: string | null; distance?: number }[] }>();
  private configs6 = new Map<string, { ips6: Record<string, string>; routes6: { dst: string; gateway: string | null }[] }>();
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

  // ── SimulatorCore ──────────────────────────────────────────────
  get now(): number {
    return this.time.now();
  }

  emit(type: SimEventType, traceId: string, data: Record<string, unknown>, nodeId?: string, port?: string): void {
    const evt: SimEvent = {
      id: `evt-${this.seq++}`,
      traceId,
      type,
      time: this.time.now(),
      nodeId,
      port,
      data,
    };
    this.eventLog.push(evt);
    // Batasi log agar sesi panjang tidak menumpuk memori tanpa batas.
    if (this.eventLog.length > 5000) this.eventLog.splice(0, this.eventLog.length - 5000);
    this.bus.emit(evt);
  }

  createPacket(opts: Partial<Packet> & { protocol: Packet['protocol']; traceId: string }): Packet {
    const id = `pkt-${++this.pktSeq}`;
    const pkt: Packet = {
      id,
      correlationId: opts.correlationId || opts.traceId,
      parentId: opts.parentId,
      protocol: opts.protocol,
      srcMac: opts.srcMac || '',
      dstMac: opts.dstMac || '',
      srcIp: opts.srcIp || '',
      dstIp: opts.dstIp || '',
      srcPort: opts.srcPort || 0,
      dstPort: opts.dstPort || 0,
      vlan: opts.vlan ?? null,
      ttl: opts.ttl ?? DEFAULT_TTL,
      flags: { ...opts.flags },
      payload: opts.payload ? { ...opts.payload } : null,
      size: opts.size || 64,
      created: this.time.now(),
      hops: [],
      edgeIds: [],
      trace: [`t=${this.time.now()} pkt=${id} created`],
      destroyed: false,
    };
    this.emit('PACKET_CREATED', opts.traceId, { packetId: id, protocol: opts.protocol, size: pkt.size });
    return pkt;
  }

  transmit(device: NetworkDevice, pkt: Packet, outPort: string, traceId: string): boolean {
    const iface = device.getIfaceByName(outPort) || device.getIfaceByPortId(outPort) || null;
    // Resolusi port fisik untuk topologi: subinterface (VLAN) menunjuk parentPort berupa NAMA
    // interface, padahal topologi memakai port ID (mis. 'port3') → telusuri hingga interface fisik.
    let portId = outPort;
    if (iface) {
      let phys: ReturnType<NetworkDevice['getIfaceByName']> | null = iface;
      while (phys && phys.parentPort) phys = device.getIfaceByName(phys.parentPort);
      portId = phys?.portId || iface.parentPort || iface.portId || outPort;
    }
    // Interface keluar mati (shutdown) → frame tidak pernah dikirim.
    // Berlaku untuk SEMUA perangkat (switch/wireless/router), termasuk port
    // fisik induk subinterface VLAN.
    const physIface = device.getIfaceByPortId(portId) || device.getIfaceByName(portId) || iface;
    if (!physIface || !physIface.up) {
      this.drop(device, pkt, 'iface-down', traceId);
      return false;
    }
    // Keluar lewat subinterface (VLAN) → tandai tag agar switch meneruskannya ke VLAN yang benar.
    if (iface && iface.type === 'vlan' && iface.vlanId) pkt.vlan = iface.vlanId;
    const neighbor = this.topology.links.neighborOf(device.id, portId);
    if (!neighbor) return false;
    // Link dimatikan (failure injection) → frame hilang di kabel.
    const link = this.topology.links.linkById(neighbor.linkId);
    if (link?.down) return false;
    // Perangkat tujuan mati = link down: frame hilang di kabel tanpa
    // menggagalkan run (fisiknya memang tidak sampai ke perangkat).
    if (!this.isNodePowered(neighbor.nodeId)) return false;

    // QoS: mangle (mark-packet/change-mss) lalu simple queue (token bucket).
    if (pkt.protocol !== 'arp') {
      applyMangle(device, pkt);
      if (!applyQos(device, pkt, this.time.now())) {
        this.drop(device, pkt, 'qos', traceId);
        return false;
      }
    }
    const delay = transmissionDelay(link, pkt);

    // track lintasan request (dir=req) pada run
    if (pkt.flags['dir'] === 'req' && pkt.correlationId === traceId) {
      const run = this.runs.get(traceId);
      if (run && run.rootPktId === pkt.id) {
        if (run.fwdEdges[run.fwdEdges.length - 1] !== neighbor.linkId) run.fwdEdges.push(neighbor.linkId);
      }
    }
    if (!pkt.edgeIds.includes(neighbor.linkId)) pkt.edgeIds.push(neighbor.linkId);

    const frame = clonePacket(pkt);
    this.scheduler.schedule(
      { type: 'PACKET_SEND', traceId, nodeId: neighbor.nodeId, port: neighbor.port, data: { pkt: frame, traceId } },
      this.time.now() + delay
    );
    this.emit('PACKET_SEND', traceId, { packetId: pkt.id, to: neighbor.nodeId, port: neighbor.port, delay }, device.id, outPort);
    return true;
  }

  drop(device: NetworkDevice, pkt: Packet, reason: string, traceId: string): void {
    pkt.destroyed = true;
    pkt.trace.push(`t=${this.time.now()} drop:${reason}@${device.id}`);
    this.emit('PACKET_DROPPED', traceId, { packetId: pkt.id, reason, srcIp: pkt.srcIp, dstIp: pkt.dstIp }, device.id);
  }

  bufferForArp(device: NetworkDevice, targetIp: string, pkt: Packet, outPort: string, traceId: string): void {
    const key = `${device.id}|${targetIp}`;
    const list = this.arpBuffers.get(key) || [];
    list.push({ pkt, outPort, traceId });
    this.arpBuffers.set(key, list);
  }

  flushArp(device: NetworkDevice, ip: string, mac: string, traceId: string): void {
    const key = `${device.id}|${ip}`;
    const list = this.arpBuffers.get(key);
    if (!list || list.length === 0) return;
    this.arpBuffers.delete(key);
    for (const b of list) {
      const egress = device.getIfaceByName(b.outPort) || device.getIfaceByPortId(b.outPort);
      if (!egress) continue;
      b.pkt.srcMac = egress.mac;
      b.pkt.dstMac = mac;
      this.transmit(device, b.pkt, egress.name, b.traceId);
    }
  }

  usedIps(): Set<string> {
    const set = new Set<string>();
    const now = this.time.now();
    for (const dev of this.nodes.values()) {
      for (const i of dev.getInterfaces()) if (i.ip) set.add(i.ip.address);
      // Lease kedaluwarsa tidak dihitung (IP dikembalikan ke pool).
      for (const lease of dev.leases.values()) if (lease.expiresAt > now) set.add(lease.ip);
    }
    return set;
  }

  getRun(traceId: string): RunResult {
    const run = this.runs.get(traceId);
    if (run) return run;
    const created = this.createRun(traceId);
    return created;
  }

  isIpLeasedTo(ip: string, mac: string): boolean {
    const m = (mac || '').toLowerCase();
    for (const dev of this.nodes.values()) {
      for (const lease of dev.leases.values()) {
        if (lease.ip !== ip) continue;
        if ([...dev.getInterfaces()].some((i) => i.mac.toLowerCase() === m)) return true;
      }
    }
    return false;
  }

  // ── Manajemen run ──────────────────────────────────────────────
  private createRun(traceId: string): Run {
    const run: Run = { traceId, status: 'running', start: this.time.now(), fwdPath: [], fwdEdges: [] };
    this.runs.set(traceId, run);
    return run;
  }

  private processUntil(traceId: string, opts?: SimRunOptions): void {
    const run = this.runs.get(traceId);
    if (!run) return;
    const maxEvents = opts?.maxEvents ?? 500_000;
    const maxTimeMs = opts?.maxTimeMs ?? 20_000;
    const t0 = run.start;
    let guard = 0;
    while (run.status === 'running') {
      const evt = this.scheduler.pop();
      if (!evt) break;
      if (evt.time - t0 > maxTimeMs) {
        run.status = 'fail';
        run.reason = 'timeout';
        break;
      }
      this.time.advanceTo(evt.time);
      this.dispatchEvent(evt);
      if (++guard > maxEvents) {
        run.status = 'fail';
        run.reason = 'timeout';
        break;
      }
    }
  }

  private dispatchEvent(evt: SimEvent): void {
    if (evt.type === 'AGING') {
      this.ageAll(evt.time);
      return;
    }
    if (evt.type !== 'PACKET_SEND') return;
    const d = evt.data as { pkt: Packet; traceId: string };
    const device = evt.nodeId ? this.nodes.get(evt.nodeId) : null;
    if (!device) return;

    const pkt = d.pkt;
    if (!device.powered) {
      this.drop(device, pkt, 'power', d.traceId);
      this.failRunIfRoot(d.traceId, 'power');
      return;
    }

    const run = this.runs.get(d.traceId);
    const dir = pkt.flags['dir'] === 'reply' ? 'rev' : 'fwd';
    pkt.hops.push({ nodeId: device.id, port: evt.port || '', time: this.time.now(), direction: dir });

    if (run && dir === 'fwd' && pkt.correlationId === d.traceId && pkt.flags['dir'] === 'req') {
      if (run.fwdPath[run.fwdPath.length - 1] !== device.name) run.fwdPath.push(device.name);
    }

    const proc = this.processors.get(device.id);
    if (proc) proc.handlePacket(pkt, evt.port || '', this, d.traceId);
  }

  private failRunIfRoot(traceId: string, reason: Run['reason']): void {
    const run = this.runs.get(traceId);
    if (run && run.status === 'running') {
      run.status = 'fail';
      run.reason = reason;
    }
  }

  private ageAll(now: number): void {
    for (const dev of this.nodes.values()) {
      const agedMac = dev.macTable.age(now);
      if (agedMac.length > 0) this.emit('MAC_AGED', `aging-${dev.id}`, { macs: agedMac }, dev.id);
      const agedArp = dev.arpCache.age(now);
      if (agedArp.length > 0) this.emit('DEBUG_TRACE', `aging-${dev.id}`, { arpAged: agedArp }, dev.id);
      // Lease DHCP yang kedaluwarsa dikembalikan ke pool.
      for (const [iface, lease] of [...dev.leases.entries()]) {
        if (lease.expiresAt <= now) dev.leases.delete(iface);
      }
      // Sesi NAT yang menganggur dibersihkan.
      dev.nat.prune(now);
    }
    // jadwal ulang
    const next = now + 5000;
    this.scheduler.schedule({ type: 'AGING', traceId: 'aging', data: {} }, next);
  }

  private beginRun(traceId: string): Run {
    return this.createRun(traceId);
  }

  // ── Topology & config ──────────────────────────────────────────
  syncTopology(project: LabProjectLike): void {
    const { nodes } = this.topology.sync(project);
    this.nodes = nodes;
    this.processors.clear();
    for (const [id, dev] of nodes) {
      const kind = processorKind(dev);
      let proc: DeviceProcessor;
      if (kind === 'wireless') proc = new WirelessProcessor(dev);
      else if (kind === 'switch') proc = new SwitchProcessor(dev);
      else if (kind === 'host') proc = new HostProcessor(dev);
      else proc = new RouterProcessor(dev);
      this.processors.set(id, proc);
    }
    this.scheduler.clear();
    this.bus.clear();
    this.time.reset();
    this.runs.clear();
    this.arpBuffers.clear();
    this.eventLog = [];
    this.scheduler.schedule({ type: 'AGING', traceId: 'aging', data: {} }, 5000);
    this.applyAllConfigs();
  }

  /** Peringatan validasi topologi dari sync terakhir (edge ditolak dll.) — tidak pernah throw. */
  getTopologyWarnings(): { id: string; reason: string }[] {
    return [...(this.topology.lastSkippedEdges || [])];
  }

  private applyAllConfigs(): void {
    for (const dev of this.nodes.values()) {
      const cfg = this.configs.get(dev.id);
      if (cfg) this.applyConfigToDevice(dev, cfg);
      const cfg6 = this.configs6.get(dev.id);
      if (cfg6) this.applyConfig6ToDevice(dev, cfg6);
      if (this.poweredOff.has(dev.id)) dev.powered = false;
      const shut = this.shutIfaces.get(dev.id);
      if (shut) for (const n of shut) dev.setIfaceUp(n, false);
      const pv = this.portVlans.get(dev.id);
      if (pv) dev.portVlans = new Map(pv);
      const tr = this.trunkPorts.get(dev.id);
      if (tr) dev.trunkPorts = new Set(tr);
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
        dev.snmpUptimeBase = this.time.now();
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
    for (const dev of this.nodes.values()) {
      for (const iface of dev.getInterfaces()) {
        if (iface.type === 'wireless' || iface.type === 'bridge' || iface.type === 'loopback') continue;
        if (!this.portHasPhysicalLink(dev, iface)) dev.setIfaceUp(iface.name, false);
      }
    }
  }

  /** Port fisik sebuah interface (subinterface VLAN → port induk). */
  private physicalPortId(dev: NetworkDevice, iface: NetworkInterfaceModel): string | null {
    if (iface.type === 'vlan' && iface.parentPort) {
      const parent = dev.getIfaceByName(iface.parentPort);
      return parent ? parent.portId : null;
    }
    return iface.portId;
  }

  /** Benarkah ada kabel (edge) yang menempel ke port fisik interface ini? */
  private portHasPhysicalLink(dev: NetworkDevice, iface: NetworkInterfaceModel): boolean {
    const portId = this.physicalPortId(dev, iface);
    if (!portId) return false;
    const link = this.topology.links.linkOn(dev.id, portId);
    return link !== null;
  }

  /** Hitung ulang STP / FHRP / wireless setelah topologi & konfigurasi berubah. */
  private recomputeProtocols(): void {
    const devices = [...this.nodes.values()];
    const powered = (id: string) => this.isNodePowered(id);
    const stp = computeStp(devices, this.topology.links, powered);
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

  /** Konfigurasi FHRP (via CLI): kelompok VRRP yang diikuti perangkat. */
  setFhrp(nodeId: string, groups: FhrpGroup[] | undefined): void {
    if (groups && groups.length > 0) this.fhrpGroups.set(nodeId, groups);
    else this.fhrpGroups.delete(nodeId);
    const dev = this.nodes.get(nodeId);
    if (dev) dev.fhrpGroups = groups && groups.length > 0 ? groups : [];
    this.recomputeProtocols();
  }

  /** Snapshot FHRP perangkat (provider CLI `routing vrrp instance print`). */
  getFhrpInfo(nodeId: string): FhrpState[] | null {
    const states = this.fhrpState.get(nodeId);
    if (!states || states.length === 0) return null;
    return states;
  }

  /**
   * Pemilihan master VRRP per virtual IP: yang menyala + prioritas
   * tertinggi menang (tie-break: id node terkecil). Hanya master yang
   * "memiliki" virtual IP (device.hasIp), sehingga ping ke virtual IP
   * selalu menuju master — failover otomatis bila master dimatikan.
   */
  private computeFhrp(): void {
    const devices = [...this.nodes.values()];
    const prevMasters = this.fhrpMasters;
    const res = computeFhrp(devices, this.fhrpGroups, (id) => this.isNodePowered(id), this.topology.links);
    this.fhrpState = res.states;
    this.fhrpMasters = res.masters;
    for (const [vip, newMaster] of res.masters) {
      const oldMaster = prevMasters ? prevMasters.get(vip) : undefined;
      if (oldMaster && oldMaster !== newMaster) {
        // Failover FHRP: master berubah → ARP cache yang berisi VIP ini
        // sudah lama (MAC master lama) → bersihkan supaya host melakukan
        // ARP ulang dan menemukan master baru.
        for (const dev of devices) dev.arpCache.clear();
      }
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
    const now = this.time.now();
    for (const dev of this.nodes.values()) {
      if (dev.id === selfNodeId) continue;
      for (const i of dev.getInterfaces()) if (i.ip && i.ip.address === ip) return true;
      for (const lease of dev.leases.values()) if (lease.expiresAt > now && lease.ip === ip) return true;
    }
    return false;
  }

  getDevice(nodeId: string): NetworkDevice | undefined {
    return this.nodes.get(nodeId);
  }

  /** Semua perangkat aktif (additive accessor untuk observability/AI). */
  getDevices(): NetworkDevice[] {
    return [...this.nodes.values()];
  }

  /** Cari perangkat berdasarkan nama (additive accessor). */
  getDeviceByName(name: string): NetworkDevice | undefined {
    for (const dev of this.nodes.values()) {
      if (dev.name === name) return dev;
    }
    return undefined;
  }

  setNodePowered(nodeId: string, on: boolean): void {
    if (on) this.poweredOff.delete(nodeId);
    else this.poweredOff.add(nodeId);
    const dev = this.nodes.get(nodeId);
    if (dev) dev.powered = on;
    this.recomputeProtocols();
    // Rute yang dipelajari lewat perangkat ini harus ditarik — device mati
    // tidak bisa dijadikan next hop (OSPF/RIP/EIGRP/BGP distance-vector).
    this.computeDynamicRoutes();
  }

  isNodePowered(nodeId: string): boolean {
    return !this.poweredOff.has(nodeId) && (this.nodes.get(nodeId)?.powered ?? true);
  }

  /** Konfigurasi STP (via CLI): { enabled, priority, mode }. */
  setStp(nodeId: string, cfg: StpConfig | undefined): void {
    if (cfg) this.stps.set(nodeId, cfg);
    else this.stps.delete(nodeId);
    const dev = this.nodes.get(nodeId);
    if (dev) {
      dev.stpConfig = cfg ? { ...dev.stpConfig, ...cfg } : { enabled: true, priority: 32768, mode: 'rstp' };
    }
    this.recomputeProtocols();
  }

  /** Konfigurasi wireless (via CLI): { interfaces, profiles }. */
  setWireless(nodeId: string, cfg: { interfaces: Record<string, WirelessIfaceCfg>; profiles: Record<string, WirelessProfileCfg> } | undefined): void {
    if (cfg) {
      this.wirelessCfgs.set(nodeId, cfg);
    } else {
      this.wirelessCfgs.delete(nodeId);
    }
    const dev = this.nodes.get(nodeId);
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

  /** Hitung ulang asosiasi wireless AP↔station. */
  private computeWireless(): void {
    const devices = [...this.nodes.values()];
    const st = computeWireless(devices, this.topology.links, (id) => this.isNodePowered(id));
    for (const dev of devices) {
      dev.wirelessState = st.get(dev.id) || null;
    }
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
    const dev = this.nodes.get(nodeId);
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

  /** Konfigurasi QoS (via CLI): queues + mangle rules. */
  setQos(nodeId: string, queues: SimpleQueue[] | undefined, mangleRules: MangleRule[] | undefined): void {
    if ((queues && queues.length > 0) || (mangleRules && mangleRules.length > 0)) {
      this.qoses.set(nodeId, { queues: queues || [], mangleRules: mangleRules || [] });
    } else {
      this.qoses.delete(nodeId);
    }
    const dev = this.nodes.get(nodeId);
    if (dev) {
      dev.queues = queues || [];
      dev.mangleRules = mangleRules || [];
      dev.qosState = freshQosState();
    }
  }

  /** Statistik live queue (provider `/queue simple print`). */
  getQosStats(nodeId: string): { name: string; bytes: number; packets: number; dropped: number }[] {
    const dev = this.nodes.get(nodeId);
    if (!dev) return [];
    return qosStatsOf(dev);
  }

  getStpConfig(nodeId: string): StpConfig | undefined {
    return this.stps.get(nodeId);
  }  /** Snapshot STP per port (provider CLI `show spanning-tree`). */
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
    const dev = this.nodes.get(nodeId);
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

  applyNodeConfig(nodeId: string, ips: Record<string, string>, routes: Array<{ dst: string; gateway: string; distance?: number }>): void {
    const existing = this.configs.get(nodeId);
    const cfg = {
      ips: { ...(existing?.ips || {}), ...ips },
      routes: routes.map((r) => ({ dst: r.dst, gateway: r.gateway || null, distance: r.distance })),
    };
    this.configs.set(nodeId, cfg);
    const dev = this.nodes.get(nodeId);
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
    const dev = this.nodes.get(nodeId);
    if (dev) this.applyConfig6ToDevice(dev, cfg);
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

  setDhcpPools(poolsByNode: Record<string, DhcpPoolInfo[]>): void {
    this.dhcpPools.clear();
    for (const [nodeId, pools] of Object.entries(poolsByNode)) {
      if (Array.isArray(pools) && pools.length > 0) {
        this.dhcpPools.set(nodeId, pools);
        const dev = this.nodes.get(nodeId);
        if (dev) dev.dhcpPools = pools;
      }
    }
  }

  /** DHCP relay per perangkat: port (nama interface) → server diteruskan. */
  setDhcpRelays(nodeId: string, relays: Record<string, string> | undefined): void {
    if (relays && Object.keys(relays).length > 0) this.dhcpRelays.set(nodeId, { ...relays });
    else this.dhcpRelays.delete(nodeId);
    const dev = this.nodes.get(nodeId);
    if (dev) dev.dhcpRelays = relays && Object.keys(relays).length > 0 ? { ...relays } : {};
  }

  /** Port-security per port switch: { limit, sticky, violation }. */
  setPortSecurity(nodeId: string, cfg: Record<string, { limit?: number; sticky?: boolean; violation?: string; learned?: string[] }> | undefined): void {
    if (cfg && Object.keys(cfg).length > 0) this.portSecurities.set(nodeId, cfg);
    else this.portSecurities.delete(nodeId);
    const dev = this.nodes.get(nodeId);
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
    const dev = this.nodes.get(nodeId);
    if (dev) dev.slaacIfaces = ifaces && ifaces.length > 0 ? [...ifaces] : [];
  }

  /** Snapshot port-security (untuk DeviceStats/PingPanel + tes). */
  getPortSecurityInfo(nodeId: string): Record<string, { limit: number; sticky: boolean; learned: string[] }> | null {
    const dev = this.nodes.get(nodeId);
    if (!dev || Object.keys(dev.portSecurityCfg).length === 0) return null;
    const out: Record<string, { limit: number; sticky: boolean; learned: string[] }> = {};
    for (const [port, c] of Object.entries(dev.portSecurityCfg)) {
      out[port] = { limit: c.limit || 1, sticky: !!c.sticky, learned: [...(c.learned || [])] };
    }
    return out;
  }

  /** SLAAC: host tanpa alamat v6 otomatis mendapat alamat dari prefix router
   *  terhubung (EUI-64) + default route — dipanggil sebelum ping6/print. */
  private slaacAutoConfig(src: NetworkDevice): boolean {
    for (const link of this.topology.links.linksOf(src.id)) {
      const peerId = link.a.nodeId === src.id ? link.b.nodeId : link.a.nodeId;
      const peer = this.nodes.get(peerId);
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

  setRouting(nodeId: string, cfg: RoutingMemoryShape | undefined): void {
    const enabled = cfg && (cfg.ospf?.enabled || cfg.rip?.enabled || cfg.eigrp?.enabled);
    if (enabled) this.routings.set(nodeId, cfg);
    else this.routings.delete(nodeId);
    const dev = this.nodes.get(nodeId);
    if (dev) dev.routingCfg = enabled ? { ...cfg } : {};
  }

  setBgp(nodeId: string, cfg: BgpConfig | undefined): void {
    if (cfg && cfg.asn) this.bgps.set(nodeId, cfg);
    else this.bgps.delete(nodeId);
    const dev = this.nodes.get(nodeId);
    if (dev) dev.bgpCfg = cfg && cfg.asn ? { asn: cfg.asn, peers: cfg.peers, networks: cfg.networks } : null;
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
    const dev = this.nodes.get(nodeId);
    if (dev) {
      dev.snmpAgent = cfg && cfg.enabled ? { enabled: true, community: cfg.community || 'public', communityRW: cfg.communityRW || 'private', sysContact: cfg.sysContact || '', sysLocation: cfg.sysLocation || '' } : null;
    }
  }

  setAcls(nodeId: string, rules: AclRule[] | undefined): void {
    if (rules && rules.length > 0) this.acls.set(nodeId, rules);
    else this.acls.delete(nodeId);
    const dev = this.nodes.get(nodeId);
    if (dev) dev.aclRules = rules && rules.length > 0 ? rules : [];
  }

  setNatRules(nodeId: string, rules: NatRule[] | undefined): void {
    if (rules && rules.length > 0) this.nats.set(nodeId, rules);
    else this.nats.delete(nodeId);
    const dev = this.nodes.get(nodeId);
    if (dev) dev.natRules = rules && rules.length > 0 ? rules : [];
  }

  setDnsRecords(nodeId: string, records: DnsRecord[] | undefined): void {
    if (records && records.length > 0) this.dnsRecords.set(nodeId, records);
    else this.dnsRecords.delete(nodeId);
    const dev = this.nodes.get(nodeId);
    if (dev) dev.dnsRecords = records && records.length > 0 ? records : [];
  }

  setDnsServers(nodeId: string, servers: string[] | undefined): void {
    if (servers && servers.length > 0) this.dnsServers.set(nodeId, servers);
    else this.dnsServers.delete(nodeId);
    const dev = this.nodes.get(nodeId);
    if (dev) dev.dnsServers = servers && servers.length > 0 ? servers : [];
  }

  setWebServer(nodeId: string, info: WebServerInfo | undefined): void {
    if (info) this.webServers.set(nodeId, info);
    else this.webServers.delete(nodeId);
    const dev = this.nodes.get(nodeId);
    if (dev) dev.webServer = info ? { enabled: info.enabled, port: info.port, content: info.content } : null;
  }

  setPortVlans(nodeId: string, vlanByIface: Record<string, number> | undefined): void {
    if (vlanByIface && Object.keys(vlanByIface).length > 0) this.portVlans.set(nodeId, new Map(Object.entries(vlanByIface)));
    else this.portVlans.delete(nodeId);
    const dev = this.nodes.get(nodeId);
    if (dev) dev.portVlans = vlanByIface ? new Map(Object.entries(vlanByIface)) : new Map();
  }

  setShutdownIfaces(nodeId: string, names: string[] | undefined): void {
    const prev = this.shutIfaces.get(nodeId);
    const next = names && names.length > 0 ? new Set(names) : new Set<string>();
    if (next.size > 0) this.shutIfaces.set(nodeId, next);
    else this.shutIfaces.delete(nodeId);
    const dev = this.nodes.get(nodeId);
    if (!dev) return;
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
    const dev = this.nodes.get(nodeId);
    if (dev) for (const s of subs || []) dev.addVirtualIface(s.name, s.parentPort, s.vlanId, '');
  }

  setTrunkPorts(nodeId: string, names: string[] | undefined): void {
    if (names && names.length > 0) this.trunkPorts.set(nodeId, new Set(names));
    else this.trunkPorts.delete(nodeId);
    const dev = this.nodes.get(nodeId);
    if (dev) dev.trunkPorts = names ? new Set(names) : new Set();
  }

  computeDynamicRoutes(): void {
    new RoutingProtocolEngine().compute([...this.nodes.values()], this.topology.links);
  }

  // ── Statistik / read helpers ───────────────────────────────────
  getDeviceStats(nodeId: string): DeviceStatsSnapshot | null {
    const dev = this.nodes.get(nodeId);
    if (!dev) return null;
    const stp = dev.stpState;
    const fhrp = this.getFhrpInfo(nodeId);
    return {
      name: dev.name,
      deviceType: dev.deviceType,
      interfaces: dev.getInterfaces().map((i) => {
        const hasCable = this.portHasPhysicalLink(dev, i);
        const adminUp = !dev.shutdownIfaces.has(i.name);
        const portId = this.physicalPortId(dev, i);
        const linkDown = !!(hasCable && portId && this.topology.links.linkOn(dev.id, portId)?.down);
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
      routes: dev.getRoutes().map((r) => ({ dst: r.dst, gateway: r.gateway || '', iface: r.iface || '', kind: r.kind })),
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
    for (const dev of this.nodes.values()) {
      for (const lease of dev.leases.values()) {
        out.push({ nodeId: dev.id, ip: lease.ip, gateway: lease.gateway, prefix: lease.prefix, poolNodeId: lease.poolNodeId });
      }
    }
    return out;
  }

  getLeaseFor(nodeId: string): DhcpLeaseGrant | null {
    const dev = this.nodes.get(nodeId);
    if (!dev) return null;
    for (const lease of dev.leases.values()) return lease;
    return null;
  }

  grantDhcpLease(nodeId: string, ifaceName?: string): DhcpLeaseGrant | null {
    return this.ensureLease(nodeId, ifaceName);
  }

  dhcpLeaseFor(nodeId: string, ifaceName?: string): DhcpLeaseGrant | null {
    return this.ensureLease(nodeId, ifaceName);
  }

  /** Coba penuhi lease (DORA event-driven) bila device belum punya IP. */
  private ensureLease(nodeId: string, ifaceName?: string): DhcpLeaseGrant | null {
    const dev = this.nodes.get(nodeId);
    if (!dev || dev.getIpAddress()) return null;
    const existing = this.getLeaseFor(nodeId);
    if (existing) return existing;

    const proc = this.processors.get(nodeId);
    if (!proc?.startDhcp) return null;
    const traceId = `dhcp-${nodeId}-${++this.runSeq}`;
    const run = this.beginRun(traceId);
    if (!proc.startDhcp(traceId, this)) return null;
    this.processUntil(traceId);
    void run;
    return this.getLeaseFor(nodeId);
  }

  resolveHostname(nodeId: string, name: string): DnsResolution {
    const dev = this.nodes.get(nodeId);
    const n = name.toLowerCase().replace(/\.$/, '');
    if (dev) {
      const own = dev.dnsRecords.find((r) => r.name.toLowerCase() === n || r.name.toLowerCase() === n + '.');
      if (own) return { resolved: own.address, server: 'self' };
    }
    const servers = dev?.dnsServers || [];
    if (servers.length === 0) return { resolved: null, timedOut: true };
    for (const srvIp of servers) {
      const srv = this.deviceByIp(srvIp);
      if (!srv || !this.isNodePowered(srv.id)) continue;
      const rec = srv.dnsRecords.find((r) => r.name.toLowerCase() === n);
      if (rec) return { resolved: rec.address, server: srvIp };
    }
    // Fallback: nama perangkat di topologi (mis. "PC2" → IP pertamanya).
    const byName = this.deviceByName(n);
    if (byName) {
      const ip = byName.getIpAddress();
      if (ip) return { resolved: ip, server: 'topology' };
    }
    return { resolved: null, nxdomain: true };
  }

  private deviceByIp(ip: string): NetworkDevice | null {
    for (const dev of this.nodes.values()) {
      if (dev.hasIp(ip)) return dev;
    }
    return null;
  }

  /** Perkiraan RTT (ms) sebuah lintasan: 2 × latensi propagasi tiap hop. */
  private rttOf(edgeIds: string[]): number {
    let oneWay = 0;
    const seen = new Set<string>();
    for (const id of edgeIds) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      oneWay += linkLatencyMs(this.topology.links.linkById(id));
    }
    return oneWay * 2;
  }

  /**
   * Resolusi alamat tujuan: IP langsung, nama host via DNS (record statis /
   * server DNS), terakhir nama perangkat di topologi (ping PC2 tanpa config).
   * Nilai null = tidak bisa di-resolve (ping('invalid') → reason invalid).
   */
  private resolvePingTarget(srcNodeId: string, dstIp: string): string | null {
    if (isValidIp(dstIp) || isIpv6Address(dstIp)) return dstIp;
    const viaDns = this.resolveHostname(srcNodeId, dstIp);
    if (viaDns.resolved) return viaDns.resolved;
    const byName = this.deviceByName(dstIp);
    if (byName?.getIpAddress()) return byName.getIpAddress();
    return null;
  }

  private deviceByName(name: string): NetworkDevice | null {
    const n = name.toLowerCase();
    for (const dev of this.nodes.values()) {
      if (dev.name.toLowerCase() === n) return dev;
    }
    return null;
  }

  // ── Simulasi flow ──────────────────────────────────────────────
  simulatePing(srcNodeId: string, dstIp: string): PingSimResult {
    const src = this.nodes.get(srcNodeId);
    if (!src) return this.pingFail('not-found');
    if (isIpv6Address(dstIp)) return this.simulatePing6(srcNodeId, dstIp);
    const target = this.resolvePingTarget(srcNodeId, dstIp);
    if (!target) return this.pingFail('invalid');
    dstIp = target;
    if (!isValidIp(dstIp)) return this.pingFail('invalid');
    if (!this.isNodePowered(src.id)) return this.pingFail('power');
    if (src.hasIp(dstIp)) {
      return { success: true, path: [src.name], edgeIds: [], ttlAtDestination: DEFAULT_TTL, reason: 'self' };
    }

    let dhcpGranted = false;
    if (!src.getIpAddress()) {
      const lease = this.ensureLease(srcNodeId);
      if (!lease) return this.pingFail('no-ip');
      dhcpGranted = true;
    }

    const iface = src.getInterfaces().find((i) => i.ip && i.up);
    if (!iface || !iface.ip) return this.pingFail('no-ip');

    const traceId = `ping-${++this.runSeq}`;
    const run = this.beginRun(traceId);
    run.fwdPath = [src.name];
    const req = this.createPacket({
      protocol: 'icmp',
      srcIp: iface.ip.address,
      dstIp,
      srcMac: iface.mac,
      dstMac: '',
      srcPort: 0,
      dstPort: 0,
      ttl: DEFAULT_TTL,
      traceId,
      flags: { dir: 'req', icmpType: 8 },
      payload: { type: 8, code: 0, seq: 1, id: (Math.random() * 0xffff) & 0xffff },
    });
    run.rootPktId = req.id;

    if (!this.inject(src, req, traceId)) return this.pingFail('unreachable');
    this.processUntil(traceId);

    if (run.status === 'ok') {
      const path = run.fwdPath.length > 0 ? run.fwdPath : [src.name];
      return {
        success: true,
        path,
        edgeIds: run.fwdEdges,
        ttlAtDestination: run.ttlAtDst ?? DEFAULT_TTL,
        dhcpGranted: dhcpGranted || undefined,
        rttMs: this.rttOf(run.fwdEdges),
      };
    }
    return this.pingFail(mapReason(run.reason));
  }

  /** Ping IPv6 (ICMPv6 echo). Tanpa DHCP — host harus punya alamat v6. */
  simulatePing6(srcNodeId: string, dstIp: string): PingSimResult {
    const src = this.nodes.get(srcNodeId);
    if (!src) return this.pingFail('not-found');
    if (!isIpv6Address(dstIp)) return this.pingFail('invalid');
    if (!this.isNodePowered(src.id)) return this.pingFail('power');
    if (src.hasIpv6(dstIp)) {
      return { success: true, path: [src.name], edgeIds: [], ttlAtDestination: DEFAULT_TTL, reason: 'self' };
    }
    const iface = src.getInterfaces().find((i) => i.ipv6 && i.up);
    if (!iface || !iface.ipv6) {
      // SLAAC/DHCPv6 client: host dengan interface autoconfig mendapatkan
      // alamat dari prefix router terhubung sebelum ping.
      if (src.slaacIfaces.length > 0 && this.slaacAutoConfig(src)) {
        const newIface = src.getInterfaces().find((i) => i.ipv6 && i.up);
        if (newIface?.ipv6) return this.continueSimulatePing6(src, newIface, dstIp);
      }
      return this.pingFail('no-ip');
    }
    return this.continueSimulatePing6(src, iface, dstIp);
  }

  private continueSimulatePing6(src: NetworkDevice, iface: NetworkInterfaceModel, dstIp: string): PingSimResult {

    const traceId = `ping6-${++this.runSeq}`;
    const run = this.beginRun(traceId);
    run.fwdPath = [src.name];
    const req = this.createPacket({
      protocol: 'icmp',
      srcIp: iface.ipv6.address,
      dstIp,
      srcMac: iface.mac,
      dstMac: '',
      srcPort: 0,
      dstPort: 0,
      ttl: DEFAULT_TTL,
      traceId,
      flags: { dir: 'req', icmpType: 128, v6: true },
      payload: { type: 128, code: 0, seq: 1, id: (Math.random() * 0xffff) & 0xffff, v6: true },
    });
    run.rootPktId = req.id;

    if (!this.inject6(src, req, traceId)) return this.pingFail('unreachable');
    this.processUntil(traceId);

    if (run.status === 'ok') {
      const path = run.fwdPath.length > 0 ? run.fwdPath : [src.name];
      return {
        success: true,
        path,
        edgeIds: run.fwdEdges,
        ttlAtDestination: run.ttlAtDst ?? DEFAULT_TTL,
        rttMs: this.rttOf(run.fwdEdges),
      };
    }
    return this.pingFail(mapReason(run.reason));
  }

  /** Info IPv6 perangkat untuk CLI (alamat, rute, neighbor NDP). */
  getIpv6Info(nodeId: string): {
    addresses: { iface: string; address: string; prefix: number }[];
    routes: { dst: string; gateway: string | null }[];
    neighbors: { ip: string; mac: string; iface: string }[];
  } | null {
    const dev = this.nodes.get(nodeId);
    if (!dev) return null;
    // SLAAC/DHCPv6 client: alamat otomatis dari prefix router terhubung
    // dipicu saat info diminta (print /ipv6 dhcp-client).
    if (dev.slaacIfaces.length > 0 && !dev.getInterfaces().some((i) => i.ipv6 && i.up)) {
      this.slaacAutoConfig(dev);
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

  simulateTraceroute(srcNodeId: string, dstIp: string): TracerouteResult {
    const src = this.nodes.get(srcNodeId);
    if (!src) return { ok: false, hops: [], reason: 'not-found' };
    if (isIpv6Address(dstIp)) return { ok: false, hops: [], reason: 'invalid' };
    const target = this.resolvePingTarget(srcNodeId, dstIp);
    if (!target) return { ok: false, hops: [], reason: 'invalid' };
    dstIp = target;
    if (!isValidIp(dstIp)) return { ok: false, hops: [], reason: 'invalid' };
    if (!this.isNodePowered(src.id)) return { ok: false, hops: [], reason: 'power' };

    if (!src.getIpAddress()) {
      const lease = this.ensureLease(srcNodeId);
      if (!lease) return { ok: false, hops: [], reason: 'no-ip' };
    }
    const iface = src.getInterfaces().find((i) => i.ip && i.up);
    if (!iface || !iface.ip) return { ok: false, hops: [], reason: 'no-ip' };

    // Traceroute nyata: probe ICMP hop demi hop dengan TTL naik.
    // Router yang TTL-nya habis membalas ICMP time-exceeded (hop ke-ttl),
    // router tanpa rute membalas dest-unreachable (jalur putus), dst balas
    // echo-reply (selesai). Hop diidentifikasi dari event log per probe.
    const MAX_HOPS = 16;
    const hops: TracerouteResult['hops'] = [];
    for (let ttl = 1; ttl <= MAX_HOPS; ttl++) {
      const traceId = `trace-${++this.runSeq}`;
      const run = this.beginRun(traceId);
      run.fwdPath = [src.name];
      const logStart = this.eventLog.length;
      const req = this.createPacket({
        protocol: 'icmp',
        srcIp: iface.ip.address,
        dstIp,
        srcMac: iface.mac,
        dstMac: '',
        srcPort: 0,
        dstPort: 0,
        ttl,
        traceId,
        flags: { dir: 'req', icmpType: 8 },
        payload: { type: 8, code: 0, seq: ttl, id: (Math.random() * 0xffff) & 0xffff, traceroute: true },
      });
      run.rootPktId = req.id;
      if (!this.inject(src, req, traceId)) break;
      this.processUntil(traceId);

      if (run.status === 'ok') {
        const dst = this.deviceByIp(dstIp) || src;
        hops.push({ name: dst.name, ttl, ip: dstIp });
        return { ok: true, hops };
      }

      const probeEvents = this.eventLog.slice(logStart).filter((e) => e.traceId === traceId);
      const ttlExpired = probeEvents.find((e) => e.type === 'TTL_EXCEEDED');
      if (ttlExpired && ttlExpired.nodeId) {
        const hopDev = this.nodes.get(ttlExpired.nodeId);
        hops.push({
          name: hopDev?.name || ttlExpired.nodeId,
          ttl,
          ip: hopDev?.getIpAddress() || null,
        });
        continue;
      }
      const icmpErr = probeEvents.find((e) => e.type === 'ICMP_ERROR');
      if (icmpErr && icmpErr.nodeId) {
        const hopDev = this.nodes.get(icmpErr.nodeId);
        hops.push({
          name: hopDev?.name || icmpErr.nodeId,
          ttl,
          ip: hopDev?.getIpAddress() || null,
        });
        return { ok: false, hops, reason: mapReason(run.reason) };
      }
      // Paket hilang diam-diam (firewall block / link down) → jalur putus tanpa hop.
      return { ok: false, hops, reason: mapReason(run.reason) };
    }
    return { ok: false, hops, reason: 'unreachable' };
  }

  canReach(srcNodeId: string, dstIp: string): boolean {
    return this.simulatePing(srcNodeId, dstIp).success;
  }

  simulateTcpConnect(srcNodeId: string, dstIp: string, dstPort = 80): TcpConnectResult {
    const src = this.nodes.get(srcNodeId);
    if (!src) return { ok: false, reason: 'not-found', handshake: [] };
    if (!isValidIp(dstIp)) return { ok: false, reason: 'invalid', handshake: [] };
    if (!this.isNodePowered(src.id)) return { ok: false, reason: 'power', handshake: [] };

    let dhcpGranted = false;
    if (!src.getIpAddress()) {
      const lease = this.ensureLease(srcNodeId);
      if (!lease) return { ok: false, reason: 'no-ip', handshake: [] };
      dhcpGranted = true;
    }

    const iface = src.getInterfaces().find((i) => i.ip && i.up);
    if (!iface || !iface.ip) return { ok: false, reason: 'no-ip', handshake: [] };

    const traceId = `tcp-${++this.runSeq}`;
    const run = this.beginRun(traceId);
    const iseq = Math.floor(Math.random() * 50000) + 1000;
    const clientPort = 40000 + Math.floor(Math.random() * 10000);
    const syn = this.createPacket({
      protocol: 'tcp',
      srcIp: iface.ip.address,
      dstIp,
      srcMac: iface.mac,
      dstMac: '',
      srcPort: clientPort,
      dstPort,
      ttl: DEFAULT_TTL,
      traceId,
      flags: { dir: 'req', tcp: 'syn', clientPort },
      payload: { ...buildTcpSegment(clientPort, dstPort, iseq, 0, TCP_SYN) },
    });
    run.rootPktId = syn.id;

    if (!this.inject(src, syn, traceId)) return { ok: false, reason: 'unreachable', handshake: [] };
    this.processUntil(traceId);

    if (run.status === 'ok') {
      return {
        ok: true,
        handshake: run.handshake || [],
        status: run.statusCode,
        body: run.body,
      };
    }
    return { ok: false, reason: mapReason(run.reason), handshake: [] };
  }

  /**
   * Query SNMP antar-perangkat (udp/161): kirim paket nyata melewati
   * ARP/routing, agent target merespons sesuai MIB yang di-bangun dari
   * state-nya (community, get/walk/set). Mirip simulatePing/TcpConnect.
   */
  simulateSnmpQuery(
    srcNodeId: string,
    dstIp: string,
    community: string,
    oid: string,
    opts: SnmpQueryOptions = {}
  ): SnmpQueryResult {
    const src = this.nodes.get(srcNodeId);
    if (!src) return { ok: false, reason: 'not-found' };
    if (!isValidIp(dstIp)) return { ok: false, reason: 'invalid' };
    if (!this.isNodePowered(src.id)) return { ok: false, reason: 'power' };

    let dhcpGranted = false;
    if (!src.getIpAddress()) {
      const lease = this.ensureLease(srcNodeId);
      if (!lease) return { ok: false, reason: 'no-ip' };
      dhcpGranted = true;
    }

    const iface = src.getInterfaces().find((i) => i.ip && i.up);
    if (!iface || !iface.ip) return { ok: false, reason: 'no-ip' };

    const traceId = `snmp-${++this.runSeq}`;
    const run = this.beginRun(traceId);
    const clientPort = 50000 + Math.floor(Math.random() * 5000);
    const req = this.createPacket({
      protocol: 'udp',
      srcIp: iface.ip.address,
      dstIp,
      srcMac: iface.mac,
      dstMac: '',
      srcPort: clientPort,
      dstPort: 161,
      ttl: 64,
      traceId,
      payload: {
        snmpOp: opts.walk ? 'walk' : opts.setValue !== undefined ? 'set' : 'get',
        oid: String(oid || '.1.3.6.1.2.1.1.1.0'),
        community: String(community || ''),
        setValue: opts.setValue,
      },
    });
    run.rootPktId = req.id;

    if (!this.inject(src, req, traceId)) return { ok: false, reason: 'unreachable' };
    this.processUntil(traceId);

    if (run.status === 'ok') {
      const res = (run.snmp || {}) as Record<string, unknown> & {
        ok?: boolean;
        error?: string;
        oids?: SnmpQueryResult['oids'];
      };
      if (res.ok === false) {
        return { ok: false, reason: (res.reason as SnmpQueryResult['reason']) || (res.error ? 'auth' : 'timeout'), error: res.error, device: String(res.device || '') };
      }
      return { ok: true, device: String(res.device || ''), oids: res.oids || [] };
    }
    const raw = run.reason === 'no-agent' ? 'no-agent' : run.reason === 'auth' ? 'auth' : mapReason(run.reason);
    const reason: SnmpQueryResult['reason'] = (raw === 'ttl' || raw === 'self' || raw === 'blocked' || raw === 'refused') ? 'timeout' : raw;
    return { ok: false, reason, error: run.reason === 'auth' ? 'Bad community name' : undefined };
  }

  /** Suntik paket dari perangkat sumber ke jaringan (rute + ARP). */
  private inject(src: NetworkDevice, pkt: Packet, traceId: string): boolean {
    const candidates = src.getInterfaces().filter((i) => i.ip && i.up);
    const sameSub = candidates.find((i) => inSameSubnet(i.ip!.address, i.ip!.prefix, pkt.dstIp));

    const nh = src.routing.lookup(pkt.dstIp);
    let nextHop: string | null = null;
    if (nh && nh.gateway) nextHop = nh.gateway;
    else if (nh && nh.iface && sameSub) nextHop = pkt.dstIp;
    else {
      const def = src.getRoutes().find((r) => r.kind === 'static' && r.active !== false && (r.dst === '0.0.0.0/0' || r.dst === '0.0.0.0'));
      nextHop = def?.gateway || null;
    }
    if (!nextHop) {
      // host yang dapat IP via DHCP memakai gateway lease sebagai default route
      const lease = src.leases.get(sameSub?.name || candidates[0]?.name || '');
      if (lease?.gateway) nextHop = lease.gateway;
    }
    if (!nextHop) return false;

    // Interface keluar = subnet yang memuat next-hop (bukan sekadar iface pertama),
    // agar paket tidak tersasar ke link lain.
    const nhIface = src.resolveEgressIface(nextHop);
    const iface = nhIface || sameSub || candidates[0];
    if (!iface || !iface.ip) return false;

    pkt.srcIp = iface.ip.address;
    pkt.srcMac = iface.mac;
    return arpResolveAndSend(src, pkt, iface.name, nextHop, this, traceId);
  }

  private inject6(src: NetworkDevice, pkt: Packet, traceId: string): boolean {
    const candidates = src.getInterfaces().filter((i) => i.ipv6 && i.up);
    const sameSub = candidates.find((i) => inSameIpv6Subnet(i.ipv6!.address, i.ipv6!.prefix, pkt.dstIp));

    const nh = src.ipv6Routing.lookup(pkt.dstIp);
    let nextHop: string | null = null;
    if (nh && nh.gateway === 'discard') return false; // blackhole: dibuang diam-diam
    if (nh && nh.gateway) nextHop = nh.gateway;
    else if (sameSub) nextHop = pkt.dstIp;
    if (!nextHop) return false;

    const nhIface = src.resolveEgressIface6(nextHop);
    const iface = nhIface || sameSub || candidates[0];
    if (!iface || !iface.ipv6) return false;

    pkt.srcIp = iface.ipv6.address;
    pkt.srcMac = iface.mac;
    return ndpResolveAndSend(src, pkt, iface.name, nextHop, this, traceId);
  }

  private pingFail(reason: PingSimResult['reason']): PingSimResult {
    return { success: false, path: [], edgeIds: [], ttlAtDestination: 0, reason };
  }

  // ── Neighbor helpers ───────────────────────────────────────────
  getLldpNeighbors(nodeId: string): LldpNeighborInfo[] {
    const out: LldpNeighborInfo[] = [];
    if (!this.isNodePowered(nodeId)) return out;
    const dev = this.nodes.get(nodeId);
    if (!dev) return out;
    for (const link of this.topology.links.linksOf(nodeId)) {
      const peerId = link.a.nodeId === nodeId ? link.b.nodeId : link.a.nodeId;
      const peer = this.nodes.get(peerId);
      if (!peer || !this.isNodePowered(peerId)) continue;
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
    const dev = this.nodes.get(nodeId);
    if (!dev || !dev.routingCfg.ospf?.enabled) return [];
    const out: OspfNeighborInfo[] = [];
    const seen = new Set<string>();
    for (const link of this.topology.links.linksOf(nodeId)) {
      const peerId = link.a.nodeId === nodeId ? link.b.nodeId : link.a.nodeId;
      const peer = this.nodes.get(peerId);
      if (!peer || peer.isSwitch) continue;
      // Adjacency hanya mungkin bila kedua perangkat hidup & OSPF aktif.
      if (!this.isNodePowered(peerId) || !peer.routingCfg.ospf?.enabled) continue;
      const peerIp = peer.getIpAddress();
      if (!peerIp || seen.has(peerIp)) continue;
      const myPort = link.a.nodeId === nodeId ? link.a.port : link.b.port;
      const peerPort = link.a.nodeId === peerId ? link.a.port : link.b.port;
      // passive-interface: salah satu sisi tidak membentuk adjacency
      const myIface = dev.getIfaceByPortId(myPort) || dev.getIfaceByName(myPort);
      const peerIface = peer.getIfaceByPortId(peerPort) || peer.getIfaceByName(peerPort);
      const myPassive = dev.routingCfg.ospf?.passiveInterfaces?.includes(myIface?.name || myPort) ?? false;
      const peerPassive = peer.routingCfg.ospf?.passiveInterfaces?.includes(peerIface?.name || peerPort) ?? false;
      if (myPassive || peerPassive) continue;
      // Link/interface rusak → adjacency tidak terbentuk (state Down).
      const myLinkUp = !!myIface && myIface.up;
      const peerLinkUp = !!peerIface && peerIface.up;
      const linkDown = !!link.down;
      const full = myLinkUp && peerLinkUp && !linkDown;
      seen.add(peerIp);
      // Router-ID OSPF: nilai router-id CLI bila diatur (bukan IP interface sembarang).
      const rid = peer.routingCfg.ospf?.routerId || peerIp;
      out.push({ routerId: rid, ip: peerIp, iface: myIface?.name || myPort, state: full ? 'Full' : 'Down' });
    }
    return out;
  }

  getBgpNeighborStates(nodeId: string): BgpNeighborStateInfo[] {
    const cfg = this.bgps.get(nodeId);
    if (!cfg) return [];
    return cfg.peers.map((p) => {
      const peer = this.deviceByIp(p.remoteAddr);
      const peerCfg = peer ? this.bgps.get(peer.id) : undefined;
      // Deterministic subset BGP: state diturunkan dari kondisi nyata topologi
      // (power, konfigurasi AS, reachability). Bukan hardcoded success.
      let state: BgpNeighborStateInfo['state'] = 'Idle';
      let uptime = 'never';
      let prefixes = 0;
      if (!peer) {
        state = 'Idle';
      } else if (!this.bgps.has(peer.id)) {
        state = 'Idle';
      } else if (!this.isNodePowered(peer.id) || !this.isNodePowered(nodeId)) {
        state = 'Idle';
      } else if (peerCfg && peerCfg.asn !== p.remoteAs) {
        // AS remote tidak cocok → session tidak pernah Established.
        state = 'Active';
      } else if (!this.canReach(nodeId, p.remoteAddr)) {
        // TCP/179 tidak bisa dibangun ke peer → tetap di Connect.
        state = 'Connect';
      } else {
        state = 'Established';
        uptime = '00:00:12';
        prefixes = peer.getRoutes().filter((r) => r.kind === 'dynamic').length;
      }
      return {
        remoteAddr: p.remoteAddr,
        remoteAs: p.remoteAs,
        state,
        uptime,
        prefixes,
      };
    });
  }

  getTcpConnections(nodeId: string): TcpConnectionInfo[] {
    const dev = this.nodes.get(nodeId);
    if (!dev) return [];
    return dev.tcpConnections as unknown as TcpConnectionInfo[];
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

  getNodeShutdownIfaces(nodeId: string): Set<string> {
    return this.shutIfaces.get(nodeId) || new Set();
  }

  getNodeSubinterfaces(nodeId: string): Map<string, { parentPort: string; vlanId: number }> {
    return this.subinterfaces.get(nodeId) || new Map();
  }

  // ── Debug / observability ──────────────────────────────────────
  get eventHistory(): SimEvent[] {
    return this.eventLog;
  }

  get packetQueue() {
    return this.queueSnapshot();
  }

  private queueSnapshot(): { pending: number; nextArrival?: number } {
    return { pending: this.scheduler.size, nextArrival: this.scheduler.peek()?.time };
  }
}

function clonePacket(pkt: Packet): Packet {  return {
    ...pkt,
    flags: { ...pkt.flags },
    payload: pkt.payload ? { ...pkt.payload } : null,
    hops: pkt.hops.slice(),
    edgeIds: pkt.edgeIds.slice(),
    trace: pkt.trace.slice(),
  };
}

/** Normalisasi alasan kegagalan run → alasan kompatibel API lama. */
function mapReason(reason: string | undefined): PingSimResult['reason'] {
  switch (reason) {
    case 'no-ip':
    case 'invalid':
    case 'not-found':
    case 'self':
    case 'blocked':
    case 'power':
    case 'refused':
    case 'ttl':
    case 'unreachable':
      return reason;
    default:
      return 'unreachable';
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
