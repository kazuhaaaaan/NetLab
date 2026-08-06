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
import { Topology, LabProjectLike, transmissionDelay } from './Topology';
import { NetworkDevice } from '../devices/NetworkDevice';
import { DeviceProcessor, SimulatorCore, processorKind } from '../devices/DeviceProcessor';
import { SwitchProcessor } from '../devices/SwitchProcessor';
import { RouterProcessor } from '../devices/RouterProcessor';
import { HostProcessor } from '../devices/HostProcessor';
import { arpResolveAndSend } from '../devices/sendUtils';
import { RoutingProtocolEngine } from '../services/RoutingProtocolEngine';
import { Packet, RunResult, SimEvent, SimEventType } from './types';
import { isValidIp, inSameSubnet } from './ip';
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
  private configs = new Map<string, { ips: Record<string, string>; routes: { dst: string; gateway: string | null }[] }>();
  private dhcpPools = new Map<string, DhcpPoolInfo[]>();
  private routings = new Map<string, RoutingMemoryShape>();
  private bgps = new Map<string, BgpConfig>();
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
    // Keluar lewat subinterface (VLAN) → tandai tag agar switch meneruskannya ke VLAN yang benar.
    if (iface && iface.type === 'vlan' && iface.vlanId) pkt.vlan = iface.vlanId;
    const neighbor = this.topology.links.neighborOf(device.id, portId);
    if (!neighbor) return false;
    const link = this.topology.links.linkById(neighbor.linkId);
    const cableType = link?.cableType || 'copper_straight';
    const delay = transmissionDelay(cableType, pkt);

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
    for (const dev of this.nodes.values()) {
      for (const i of dev.getInterfaces()) if (i.ip) set.add(i.ip.address);
      for (const lease of dev.leases.values()) set.add(lease.ip);
      if (dev.dhcpClient?.offered) set.add(dev.dhcpClient.offered.ip);
    }
    return set;
  }

  getRun(traceId: string): RunResult {
    const run = this.runs.get(traceId);
    if (run) return run;
    const created = this.createRun(traceId);
    return created;
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
      if (kind === 'switch' || kind === 'wireless') proc = new SwitchProcessor(dev);
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

  private applyAllConfigs(): void {
    for (const dev of this.nodes.values()) {
      const cfg = this.configs.get(dev.id);
      if (cfg) this.applyConfigToDevice(dev, cfg);
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
    }
  }

  private applyConfigToDevice(dev: NetworkDevice, cfg: { ips: Record<string, string>; routes: { dst: string; gateway: string | null }[] }): void {
    for (const [ifaceName, cidr] of Object.entries(cfg.ips)) dev.setIpByName(ifaceName, cidr);
    dev.clearStaticRoutes();
    for (const r of cfg.routes) if (r.gateway) dev.addStaticRoute(r.dst, r.gateway);
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
  }

  isNodePowered(nodeId: string): boolean {
    return !this.poweredOff.has(nodeId) && (this.nodes.get(nodeId)?.powered ?? true);
  }

  applyNodeConfig(nodeId: string, ips: Record<string, string>, routes: Array<{ dst: string; gateway: string }>): void {
    const existing = this.configs.get(nodeId);
    const cfg = {
      ips: { ...(existing?.ips || {}), ...ips },
      routes: routes.map((r) => ({ dst: r.dst, gateway: r.gateway || null })),
    };
    this.configs.set(nodeId, cfg);
    const dev = this.nodes.get(nodeId);
    if (dev) this.applyConfigToDevice(dev, cfg);
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
    if (names && names.length > 0) this.shutIfaces.set(nodeId, new Set(names));
    else this.shutIfaces.delete(nodeId);
    const dev = this.nodes.get(nodeId);
    if (dev) for (const n of names || []) dev.setIfaceUp(n, false);
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
    return {
      name: dev.name,
      deviceType: dev.deviceType,
      interfaces: dev.getInterfaces().map((i) => ({
        name: i.name,
        mac: i.mac,
        ip: i.ip ? `${i.ip.address}/${i.ip.prefix}` : null,
        up: i.up,
      })),
      arp: dev.arpCache.entriesList().map((e) => ({ ip: e.ip, mac: e.mac })),
      macTable: dev.macTable.entriesList().map((e) => ({ mac: e.mac, port: e.port })),
      routes: dev.getRoutes().map((r) => ({ dst: r.dst, gateway: r.gateway || '', iface: r.iface || '', kind: r.kind })),
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
    return { resolved: null, nxdomain: true };
  }

  private deviceByIp(ip: string): NetworkDevice | null {
    for (const dev of this.nodes.values()) {
      if (dev.hasIp(ip)) return dev;
    }
    return null;
  }

  // ── Simulasi flow ──────────────────────────────────────────────
  simulatePing(srcNodeId: string, dstIp: string): PingSimResult {
    const src = this.nodes.get(srcNodeId);
    if (!src) return this.pingFail('not-found');
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
      };
    }
    return this.pingFail(mapReason(run.reason));
  }

  simulateTraceroute(srcNodeId: string, dstIp: string): TracerouteResult {
    const src = this.nodes.get(srcNodeId);
    if (!src) return { ok: false, hops: [], reason: 'not-found' };
    if (!isValidIp(dstIp)) return { ok: false, hops: [], reason: 'invalid' };
    const ping = this.simulatePing(srcNodeId, dstIp);
    if (!ping.success) return { ok: false, hops: [], reason: ping.reason };
    return {
      ok: true,
      hops: ping.path.map((name, i) => ({ name, ttl: i + 1, ip: this.nodes.get(srcNodeId)?.name === name ? null : this.ipOf(name) })),
    };
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

  /** Suntik paket dari perangkat sumber ke jaringan (rute + ARP). */
  private inject(src: NetworkDevice, pkt: Packet, traceId: string): boolean {
    const candidates = src.getInterfaces().filter((i) => i.ip && i.up);
    const sameSub = candidates.find((i) => inSameSubnet(i.ip!.address, i.ip!.prefix, pkt.dstIp));
    const iface = sameSub || candidates[0];
    if (!iface || !iface.ip) return false;

    const nh = src.routing.lookup(pkt.dstIp);
    let nextHop: string | null = null;
    if (nh && nh.gateway) nextHop = nh.gateway;
    else if (nh && nh.iface && iface.name === nh.iface) nextHop = pkt.dstIp;
    else if (sameSub) nextHop = pkt.dstIp;
    else {
      const def = src.getRoutes().find((r) => r.kind === 'static' && (r.dst === '0.0.0.0/0' || r.dst === '0.0.0.0'));
      nextHop = def?.gateway || null;
    }
    if (!nextHop) {
      // host yang dapat IP via DHCP memakai gateway lease sebagai default route
      const lease = src.leases.get(iface.name);
      if (lease?.gateway) nextHop = lease.gateway;
    }
    if (!nextHop) return false;

    pkt.srcIp = iface.ip.address;
    pkt.srcMac = iface.mac;
    return arpResolveAndSend(src, pkt, iface.name, nextHop, this, traceId);
  }

  private pingFail(reason: PingSimResult['reason']): PingSimResult {
    return { success: false, path: [], edgeIds: [], ttlAtDestination: 0, reason };
  }

  private ipOf(name: string): string | null {
    for (const dev of this.nodes.values()) {
      if (dev.name === name) return dev.getIpAddress();
    }
    return null;
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
      if (!peer.routingCfg.ospf?.enabled) continue;
      const peerIp = peer.getIpAddress();
      if (!peerIp || seen.has(peerIp)) continue;
      seen.add(peerIp);
      const myPort = link.a.nodeId === nodeId ? link.a.port : link.b.port;
      out.push({ routerId: peerIp, ip: peerIp, iface: dev.getIfaceByPortId(myPort)?.name || myPort, state: 'Full/ -' });
    }
    return out;
  }

  getBgpNeighborStates(nodeId: string): BgpNeighborStateInfo[] {
    const cfg = this.bgps.get(nodeId);
    if (!cfg) return [];
    return cfg.peers.map((p) => {
      const peer = this.deviceByIp(p.remoteAddr);
      const reachable = !!peer && this.bgps.has(peer.id) && this.isNodePowered(nodeId) && this.canReach(nodeId, p.remoteAddr);
      const prefixes = reachable && peer ? peer.getRoutes().filter((r) => r.kind === 'dynamic').length : 0;
      return {
        remoteAddr: p.remoteAddr,
        remoteAs: p.remoteAs,
        state: reachable ? 'Established' : 'Idle',
        uptime: reachable ? '00:00:12' : 'never',
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

function clonePacket(pkt: Packet): Packet {
  return {
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
