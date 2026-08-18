// ============================================================
// NetworkSimulator — facade (public entrypoint) engine event-driven.
//
// Sebelum refactor: satu kelas God Object (1864 baris) yang menangani
// packet pipeline, run lifecycle, config CLI, topology sync, flow
// simulasi, dan observasi sekaligus.
//
// Sesudah refactor: kelas ini hanya merakit & men-delegate ke subsystem
// yang memisahkan responsibility (semua behavior IDENTIK — diverifikasi
// oleh run_all_tests.mts 1498 assertions):
//
//   NetworkSimulator (facade)
//   ├── SimulationCore      — packet pipeline (emit/createPacket/transmit/
//   │                         drop/ARP buffering/usedIps) + eventLog
//   ├── RunManager          — run lifecycle, dispatch event, AGING
//   ├── ConfigStore         — state config CLI (IP/VLAN/NAT/ACL/routing/
//   │                         QoS/STP/FHRP/wireless/...) + recompute protokol
//   ├── TopologyRuntime     — syncTopology + warning validasi
//   ├── SimulationFlows     — ping/ping6/traceroute/TCP/SNMP/DHCP/DNS + inject
//   └── Observation         — getter statistik/observasi (read-only)
//
// State bersama hidup di SimulationContext; setiap map hanya dimiliki
// SATU subsystem (lihat komentar header SimulationContext.ts).
//
// API publik kompatibel dengan SimulationEngine lama sehingga
// App/GradingModal hanya perlu mengganti import.
// ============================================================

import { EventScheduler } from './EventScheduler';
import { TimeManager } from './TimeManager';
import { EventBus } from './EventBus';
import { Topology, LabProjectLike } from './Topology';
import { NetworkDevice } from '../devices/NetworkDevice';
import { DeviceProcessor, SimulatorCore } from '../devices/DeviceProcessor';
import { Packet, RunResult, SimEvent, SimEventType } from './types';
import { RoutingProtocolEngine } from '../services/RoutingProtocolEngine';
import { FhrpGroup } from '../services/FhrpService';
import { StpConfig } from '../services/StpService';
import { WirelessIfaceCfg, WirelessProfileCfg } from '../services/WirelessService';
import { MangleRule, SimpleQueue } from '../services/QosService';
import { AclRule, DnsRecord, NatRule, Vlan } from './types';
import { VlanInput } from '../layer2/VlanTable';
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
import { OspfLsa, BgpRibEntry, EigrpNeighborView, EigrpTopologyEntry } from '../services/RoutingProtocolEngine';
import { FhrpState } from '../services/FhrpService';
import { SimulationContext, SimRunOptions } from './SimulationContext';
import { SimulationCore } from './SimulationCore';
import { RunManager } from './RunManager';
import { ConfigStore } from './ConfigStore';
import { TopologyRuntime } from './TopologyRuntime';
import { Observation } from './Observation';
import { SimulationFlows } from './SimulationFlows';

export type { SimRunOptions } from './SimulationContext';

export class NetworkSimulator implements SimulatorCore {
  readonly scheduler = new EventScheduler();
  readonly bus = new EventBus();
  readonly time = new TimeManager();
  readonly topology = new Topology();

  private readonly ctx: SimulationContext;
  private readonly core: SimulationCore;
  private readonly runManager: RunManager;
  private readonly configStore: ConfigStore;
  private readonly topologyRuntime: TopologyRuntime;
  private readonly observation: Observation;
  private readonly flows: SimulationFlows;

  constructor() {
    this.ctx = {
      scheduler: this.scheduler,
      bus: this.bus,
      time: this.time,
      topology: this.topology,
      nodes: new Map<string, NetworkDevice>(),
      processors: new Map<string, DeviceProcessor>(),
      routingProtocols: new RoutingProtocolEngine(),
      runs: new Map(),
    };
    // Urutan penting: ConfigStore dipasang SEBELUM SimulationCore karena
    // transmit membutuhkan isNodePowered (state daya milik ConfigStore).
    this.configStore = new ConfigStore(this.ctx);
    this.core = new SimulationCore(this.ctx, this.configStore);
    this.runManager = new RunManager(this.ctx, this.core);
    this.topologyRuntime = new TopologyRuntime(this.ctx, this.core, this.runManager, this.configStore);
    this.observation = new Observation(this.ctx, this.core, this.configStore);
    this.flows = new SimulationFlows(this.ctx, this.core, this.runManager, this.configStore, this.observation);
  }

  // ── SimulatorCore (dipakai DeviceProcessor via core) ──────────
  get now(): number {
    return this.core.now;
  }

  emit(type: SimEventType, traceId: string, data: Record<string, unknown>, nodeId?: string, port?: string): void {
    this.core.emit(type, traceId, data, nodeId, port);
  }

  createPacket(opts: Partial<Packet> & { protocol: Packet['protocol']; traceId: string }): Packet {
    return this.core.createPacket(opts);
  }

  transmit(device: NetworkDevice, pkt: Packet, outPort: string, traceId: string): boolean {
    return this.core.transmit(device, pkt, outPort, traceId);
  }

  drop(device: NetworkDevice, pkt: Packet, reason: string, traceId: string): void {
    this.core.drop(device, pkt, reason, traceId);
  }

  bufferForArp(device: NetworkDevice, targetIp: string, pkt: Packet, outPort: string, traceId: string): void {
    this.core.bufferForArp(device, targetIp, pkt, outPort, traceId);
  }

  flushArp(device: NetworkDevice, ip: string, mac: string, traceId: string): void {
    this.core.flushArp(device, ip, mac, traceId);
  }

  usedIps(): Set<string> {
    return this.core.usedIps();
  }

  isIpLeasedTo(ip: string, mac: string): boolean {
    return this.core.isIpLeasedTo(ip, mac);
  }

  getRun(traceId: string): RunResult {
    return this.core.getRun(traceId);
  }

  // ── Topology & device lifecycle ───────────────────────────────
  syncTopology(project: LabProjectLike): void {
    this.topologyRuntime.syncTopology(project);
  }

  getTopologyWarnings(): { id: string; reason: string }[] {
    return this.topologyRuntime.getTopologyWarnings();
  }

  getDevice(nodeId: string): NetworkDevice | undefined {
    return this.ctx.nodes.get(nodeId);
  }

  /** Semua perangkat aktif (additive accessor untuk observability/AI). */
  getDevices(): NetworkDevice[] {
    return [...this.ctx.nodes.values()];
  }

  /** Cari perangkat berdasarkan nama (additive accessor). */
  getDeviceByName(name: string): NetworkDevice | undefined {
    for (const dev of this.ctx.nodes.values()) {
      if (dev.name === name) return dev;
    }
    return undefined;
  }

  setNodePowered(nodeId: string, on: boolean): void {
    this.configStore.setNodePowered(nodeId, on);
  }

  isNodePowered(nodeId: string): boolean {
    return this.configStore.isNodePowered(nodeId);
  }

  // ── Konfigurasi CLI (state persisten) ─────────────────────────
  setFhrp(nodeId: string, groups: FhrpGroup[] | undefined): void {
    this.configStore.setFhrp(nodeId, groups);
  }

  getFhrpInfo(nodeId: string): FhrpState[] | null {
    return this.configStore.getFhrpInfo(nodeId);
  }

  setStp(nodeId: string, cfg: StpConfig | undefined): void {
    this.configStore.setStp(nodeId, cfg);
  }

  getStpConfig(nodeId: string): StpConfig | undefined {
    return this.configStore.getStpConfig(nodeId);
  }

  setWireless(nodeId: string, cfg: { interfaces: Record<string, WirelessIfaceCfg>; profiles: Record<string, WirelessProfileCfg> } | undefined): void {
    this.configStore.setWireless(nodeId, cfg);
  }

  setQos(nodeId: string, queues: SimpleQueue[] | undefined, mangleRules: MangleRule[] | undefined): void {
    this.configStore.setQos(nodeId, queues, mangleRules);
  }

  applyNodeConfig(nodeId: string, ips: Record<string, string>, routes: Array<{ dst: string; gateway: string; distance?: number }>): void {
    this.configStore.applyNodeConfig(nodeId, ips, routes);
  }

  applyNodeConfig6(nodeId: string, ips6: Record<string, string>, routes6: Array<{ dst: string; gateway: string }>): void {
    this.configStore.applyNodeConfig6(nodeId, ips6, routes6);
  }

  setDhcpPools(poolsByNode: Record<string, DhcpPoolInfo[]>): void {
    this.configStore.setDhcpPools(poolsByNode);
  }

  setDhcpRelays(nodeId: string, relays: Record<string, string> | undefined): void {
    this.configStore.setDhcpRelays(nodeId, relays);
  }

  setPortSecurity(nodeId: string, cfg: Record<string, { limit?: number; sticky?: boolean; violation?: string; learned?: string[] }> | undefined): void {
    this.configStore.setPortSecurity(nodeId, cfg);
  }

  setIpv6DhcpClients(nodeId: string, ifaces: string[] | undefined): void {
    this.configStore.setIpv6DhcpClients(nodeId, ifaces);
  }

  setRouting(nodeId: string, cfg: RoutingMemoryShape | undefined): void {
    this.configStore.setRouting(nodeId, cfg);
  }

  setBgp(nodeId: string, cfg: BgpConfig | undefined): void {
    this.configStore.setBgp(nodeId, cfg);
  }

  setSnmp(nodeId: string, cfg: SnmpAgentConfig | undefined): void {
    this.configStore.setSnmp(nodeId, cfg);
  }

  setAcls(nodeId: string, rules: AclRule[] | undefined): void {
    this.configStore.setAcls(nodeId, rules);
  }

  setNatRules(nodeId: string, rules: NatRule[] | undefined): void {
    this.configStore.setNatRules(nodeId, rules);
  }

  setDnsRecords(nodeId: string, records: DnsRecord[] | undefined): void {
    this.configStore.setDnsRecords(nodeId, records);
  }

  setDnsServers(nodeId: string, servers: string[] | undefined): void {
    this.configStore.setDnsServers(nodeId, servers);
  }

  setWebServer(nodeId: string, info: WebServerInfo | undefined): void {
    this.configStore.setWebServer(nodeId, info);
  }

  setPortVlans(nodeId: string, vlanByIface: Record<string, number> | undefined): void {
    this.configStore.setPortVlans(nodeId, vlanByIface);
  }

  setShutdownIfaces(nodeId: string, names: string[] | undefined): void {
    this.configStore.setShutdownIfaces(nodeId, names);
  }

  setSubinterfaces(nodeId: string, subs: { name: string; parentPort: string; vlanId: number }[] | undefined): void {
    this.configStore.setSubinterfaces(nodeId, subs);
  }

  setTrunkPorts(nodeId: string, names: string[] | undefined): void {
    this.configStore.setTrunkPorts(nodeId, names);
  }

  setVlans(nodeId: string, vlans: VlanInput[] | undefined): void {
    this.configStore.setVlans(nodeId, vlans);
  }

  getNodeVlans(nodeId: string): Vlan[] {
    return this.configStore.getNodeVlans(nodeId);
  }

  setTrunkAllowed(nodeId: string, allowedByIface: Record<string, number[]> | undefined): void {
    this.configStore.setTrunkAllowed(nodeId, allowedByIface);
  }

  setTrunkNative(nodeId: string, nativeByIface: Record<string, number> | undefined): void {
    this.configStore.setTrunkNative(nodeId, nativeByIface);
  }

  getNodeTrunkAllowed(nodeId: string): Map<string, number[]> {
    return this.configStore.getNodeTrunkAllowed(nodeId);
  }

  getNodeTrunkNative(nodeId: string): Map<string, number> {
    return this.configStore.getNodeTrunkNative(nodeId);
  }

  computeDynamicRoutes(opts?: { rounds?: number }): void {
    this.configStore.computeDynamicRoutes(opts);
  }

  // ── Statistik / read helpers ──────────────────────────────────
  getDeviceStats(nodeId: string): DeviceStatsSnapshot | null {
    return this.observation.getDeviceStats(nodeId);
  }

  getLeases(): DhcpLeaseInfo[] {
    return this.observation.getLeases();
  }

  getLeaseFor(nodeId: string): DhcpLeaseGrant | null {
    return this.observation.getLeaseFor(nodeId);
  }

  grantDhcpLease(nodeId: string, ifaceName?: string): DhcpLeaseGrant | null {
    return this.flows.grantDhcpLease(nodeId, ifaceName);
  }

  /** Renew lease (T1): DHCPREQUEST dengan IP milik klien → ACK server. */
  simulateDhcpRenew(nodeId: string, ifaceName?: string): DhcpLeaseGrant | null {
    return this.flows.simulateDhcpRenew(nodeId, ifaceName);
  }

  /** Release lease: DHCPRELEASE → lease dihapus server, IP kembali ke pool. */
  simulateDhcpRelease(nodeId: string, ifaceName?: string): boolean {
    return this.flows.simulateDhcpRelease(nodeId, ifaceName);
  }

  dhcpLeaseFor(nodeId: string, ifaceName?: string): DhcpLeaseGrant | null {
    return this.flows.dhcpLeaseFor(nodeId, ifaceName);
  }

  resolveHostname(nodeId: string, name: string): DnsResolution {
    return this.flows.resolveHostname(nodeId, name);
  }

  // ── Simulasi flow ─────────────────────────────────────────────
  simulatePing(srcNodeId: string, dstIp: string): PingSimResult {
    return this.flows.simulatePing(srcNodeId, dstIp);
  }

  simulatePing6(srcNodeId: string, dstIp: string): PingSimResult {
    return this.flows.simulatePing6(srcNodeId, dstIp);
  }

  getIpv6Info(nodeId: string): {
    addresses: { iface: string; address: string; prefix: number }[];
    routes: { dst: string; gateway: string | null }[];
    neighbors: { ip: string; mac: string; iface: string }[];
  } | null {
    return this.observation.getIpv6Info(nodeId);
  }

  simulateTraceroute(srcNodeId: string, dstIp: string): TracerouteResult {
    return this.flows.simulateTraceroute(srcNodeId, dstIp);
  }

  canReach(srcNodeId: string, dstIp: string): boolean {
    return this.flows.canReach(srcNodeId, dstIp);
  }

  simulateTcpConnect(srcNodeId: string, dstIp: string, dstPort = 80): TcpConnectResult {
    return this.flows.simulateTcpConnect(srcNodeId, dstIp, dstPort);
  }

  /** Teardown TCP (FIN): server balas FIN-ACK + hapus sesi ESTABLISHED. */
  simulateTcpClose(srcNodeId: string, dstIp: string, dstPort = 80): { ok: boolean; reason?: string } {
    return this.flows.simulateTcpClose(srcNodeId, dstIp, dstPort);
  }

  simulateSnmpQuery(
    srcNodeId: string,
    dstIp: string,
    community: string,
    oid: string,
    opts: SnmpQueryOptions = {}
  ): SnmpQueryResult {
    return this.flows.simulateSnmpQuery(srcNodeId, dstIp, community, oid, opts);
  }

  // ── Neighbor & protocol observation ───────────────────────────
  getLldpNeighbors(nodeId: string): LldpNeighborInfo[] {
    return this.observation.getLldpNeighbors(nodeId);
  }

  getOspfNeighbors(nodeId: string): OspfNeighborInfo[] {
    return this.observation.getOspfNeighbors(nodeId);
  }

  getBgpNeighborStates(nodeId: string): BgpNeighborStateInfo[] {
    return this.observation.getBgpNeighborStates(nodeId);
  }

  getOspfLsdb(nodeId: string): OspfLsa[] {
    return this.observation.getOspfLsdb(nodeId);
  }

  getBgpRib(nodeId: string): BgpRibEntry[] {
    return this.observation.getBgpRib(nodeId);
  }

  /** Tetangga EIGRP + tabel topologi DUAL (successor/feasible successor). */
  getEigrpInfo(nodeId: string): { neighbors: EigrpNeighborView[]; topology: EigrpTopologyEntry[] } {
    return this.observation.getEigrpInfo(nodeId);
  }

  getTcpConnections(nodeId: string): TcpConnectionInfo[] {
    return this.observation.getTcpConnections(nodeId);
  }

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
    return this.observation.getStpInfo(nodeId);
  }

  getWirelessInfo(nodeId: string): {
    isStation: boolean;
    mode: string;
    ssid: string;
    security: string;
    associations: { mac: string; name: string; ssid: string; iface: string; signal: number }[];
    link: { apId: string; apName: string; iface: string; ssid: string } | null;
  } | null {
    return this.observation.getWirelessInfo(nodeId);
  }

  getQosStats(nodeId: string): { name: string; bytes: number; packets: number; dropped: number }[] {
    return this.observation.getQosStats(nodeId);
  }

  getPortSecurityInfo(nodeId: string): Record<string, { limit: number; sticky: boolean; learned: string[] }> | null {
    return this.observation.getPortSecurityInfo(nodeId);
  }

  // ── Getter CLI state (grading) ─────────────────────────────────
  getNodeRouting(nodeId: string): RoutingMemoryShape | undefined {
    return this.configStore.getNodeRouting(nodeId);
  }

  getNodeBgp(nodeId: string): BgpConfig | undefined {
    return this.configStore.getNodeBgp(nodeId);
  }

  getNodeAcls(nodeId: string): AclRule[] {
    return this.configStore.getNodeAcls(nodeId);
  }

  getNodeNats(nodeId: string): NatRule[] {
    return this.configStore.getNodeNats(nodeId);
  }

  getNodePortVlans(nodeId: string): Map<string, number> {
    return this.configStore.getNodePortVlans(nodeId);
  }

  getNodeTrunkPorts(nodeId: string): Set<string> {
    return this.configStore.getNodeTrunkPorts(nodeId);
  }

  getNodeVlanConfig(nodeId: string): { vlans: Vlan[]; allowed: Map<string, number[]>; native: Map<string, number> } {
    return this.configStore.getNodeVlanConfig(nodeId);
  }

  getNodeShutdownIfaces(nodeId: string): Set<string> {
    return this.configStore.getNodeShutdownIfaces(nodeId);
  }

  getNodeSubinterfaces(nodeId: string): Map<string, { parentPort: string; vlanId: number }> {
    return this.configStore.getNodeSubinterfaces(nodeId);
  }

  // ── Debug / observability ─────────────────────────────────────
  get eventHistory(): SimEvent[] {
    return this.observation.eventHistory;
  }

  get packetQueue() {
    return this.observation.packetQueue;
  }
}