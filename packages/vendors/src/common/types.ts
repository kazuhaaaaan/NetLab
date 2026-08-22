import type { NormalizedCommand, ASTNode } from '../../../cli/src/index';
import type { CapabilityKey } from '../capabilities';
export type { ASTNode } from '../../../cli/src/index';

// ============================================================
// Shared vendor types — contract antara adapter, chain, dispatcher.
// ============================================================

export type VendorId =
  | 'mikrotik'
  | 'cisco_ios'
  | 'cisco_nxos'
  | 'juniper'
  | 'huawei'
  | 'ubiquiti'
  | 'vyos'
  | 'fortinet'
  | 'aruba'
  | 'openwrt'
  | 'linux';

/** Mode CLI sebuah vendor (bagian dari kontrak fidelity syntax). */
export type CliMode = 'exec' | 'privileged' | 'config' | 'config-if' | 'config-vlan' | 'config-router' | 'config-ospf';

/** Adapter sebuah vendor: parse input → action, format hasil → output CLI. */
export interface VendorAdapter {
  vendorId: string;
  vendorName: string;
  promptTemplate: string;
  parseSyntax(rawInput: string): NormalizedCommand;
  formatResponse(cmdResult: CommandResult | undefined): string;
}

/** Kapabilitas yang diverifikasi dari implementasi nyata (bukan janji). */
export type CapabilityStatus = 'supported' | 'partial' | 'parser-only' | 'not-supported';

export interface VendorCapability {
  key: string;
  status: CapabilityStatus;
  note?: string;
}

/** Hasil eksekusi sebuah perintah — bag mentah yang diformat oleh adapter. */
export interface CommandResult {
  raw?: string;
  type?: string;
  host?: string;
  target?: string;
  size?: number;
  port?: number;
  ports?: unknown[];
  ifaces?: unknown[];
  shutdownIfaces?: string[];
  routes?: unknown[];
  rules?: unknown[];
  pools?: unknown[];
  records?: unknown[];
  servers?: unknown[];
  peers?: unknown[];
  asn?: string | number;
  routerId?: string;
  clients?: unknown[];
  entries?: unknown[];
  neighbors?: unknown[];
  groups?: unknown[];
  vlans?: unknown[];
  queues?: unknown[];
  info?: unknown;
  web?: unknown;
  stp?: unknown;
  bgp?: unknown;
  live?: unknown[];
  signal?: string | number;
  ssid?: string;
  stationCount?: number;
  rootId?: string;
  rootPort?: string;
  bridgeId?: string;
  hostname?: string;
  mode?: string;
  model?: string;
  name?: string;
  path?: string | string[];
  oid?: string;
  mem?: unknown;
  proto?: string;
  priority?: number;
  natRules?: unknown[];
  connections?: unknown[];
  hadStartup?: boolean;
  resolved?: string | boolean | null;
  timedOut?: boolean;
  nxdomain?: boolean;
  server?: string;
  message?: string;
  snmp?: unknown;
  [key: string]: unknown;
}

export interface CommandError {
  message: string;
}

/** Environment eksekusi chain — dibangun oleh dispatcher dari context mentah. */
export interface ChainEnv {
  rawInput: string;
  vendorId: string;
  context: VendorContext;
  mem: NodeMemory;
  normalized: NormalizedCommand;
  nodeId: string;
  payload: Record<string, unknown>;
  registry: MemoryRegistry;
}

/** Satu unit branch hasil ekstraksi dari dispatch() lama — urutan global dipertahankan. */
export interface ChainEntry {
  name: string;
  order: number;
  vendors: 'all' | VendorId[];
  /** Kapabilitas yang diproteksi entry ini — diblokir bila vendor berstatus
   *  'not-supported' / 'parser-only' di capabilities.ts (sebelum run()). */
  cap?: CapabilityKey;
  match(env: ChainEnv): boolean;
  run(env: ChainEnv): CommandResult | undefined;
}

/** Context provider yang diinjeksi engine/simulator ke dispatcher. */
export interface VendorContext {
  nodeId: string;
  name?: string;
  ports?: Array<Record<string, unknown>>;
  portLinks?: Record<string, boolean | string> | Array<Record<string, unknown>>;
  pingSimulator?: (host: string, vendorId: string, size?: number) => string;
  tracerouteSimulator?: (host: string, vendorId: string) => string;
  connectivitySimulator?: (host: string, vendorId: string, port?: number) => string;
  dnsResolver?: (host: string) => { server?: string; resolved?: string | boolean | null; timedOut?: boolean; nxdomain?: boolean; [k: string]: unknown };
  routeProvider?: () => unknown[];
  arpProvider?: () => unknown[];
  macTableProvider?: () => unknown[];
  neighborProvider?: (proto?: string) => unknown[];
  bgpNeighborProvider?: () => unknown[];
  ospfNeighborProvider?: () => unknown[];
  tcpProvider?: () => unknown[];
  stpProvider?: () => unknown;
  wirelessProvider?: () => unknown;
  fhrpProvider?: () => unknown;
  ipv6Provider?: () => unknown;
  snmpQueryProvider?: (host: string, community: string, oid: string, opts?: { walk?: boolean; setValue?: string }) => unknown;
  qosProvider?: () => unknown;
  dhcpClientGrant?: (iface: string, addDefaultRoute: boolean) => { ip?: string; gateway?: string; prefix?: number; [k: string]: unknown } | null | undefined;
  [key: string]: unknown;
}

/** Registry memori per-node — dimiliki dispatcher, dipakai chain lewat env.registry. */
export interface MemoryRegistry {
  getNodeMemory(nodeId: string): NodeMemory;
  forgetNodeMemory(nodeId: string): void;
  serializeMemory(): Record<string, NodeMemory>;
  restoreMemory(data: Record<string, unknown> | null | undefined): void;
  setNodeModelLabel(nodeId: string, label: string): void;
  saveStartupConfig(nodeId: string): void;
  reloadFromStartupConfig(nodeId: string): boolean;
}

// ============================================================
// NodeMemory — state perangkat persisten (sumber: blankNodeMemory() lama).
// ============================================================

export interface DhcpPool {
  name: string;
  network: string;
  prefix?: number;
  range?: string;
  iface?: string;
  gateway?: string;
  start?: string;
  end?: string;
  defaultGateway?: string;
  dnsServers?: string[];
  lease?: string;
  startIp?: string;
  endIp?: string;
  netmask?: string;
  idx?: number;
  [key: string]: unknown;
}

export interface DhcpClient {
  iface: string;
  status?: string;
  address?: string;
  expires?: string;
  hostname?: string;
  mac?: string;
  ip?: string;
  gateway?: string;
  addDefaultRoute?: boolean;
}

export interface RouteEntry {
  dst?: string;
  gateway?: string;
  distance?: number;
  iface?: string;
  src?: string;
  type?: string;
  section?: string;
  rawMask?: string;
}

export interface BgpPeer {
  remoteAddr?: string;
  remoteAs?: string | number;
  asn?: string | number;
  name?: string;
  localAsn?: string | number;
  status?: string;
  updates?: string;
  state?: string;
}

export interface NatRule {
  chain?: string;
  outInterface?: string;
  action?: string;
  srcAddress?: string;
  protocol?: string;
  dstAddress?: string;
  dstPort?: string;
  toAddresses?: string;
  toPorts?: string;
  srcPort?: string;
  [key: string]: unknown;
}

export interface AclRule {
  action?: string;
  protocol?: string;
  src?: string;
  dst?: string;
  srcPort?: string;
  dstPort?: string;
  [key: string]: unknown;
}

export interface WirelessAp {
  ssid?: string;
  mode?: string;
  channel?: number;
  band?: string;
  txPower?: number;
  security?: string;
  password?: string;
  clients?: number;
  [key: string]: unknown;
}

export interface VrrpGroup {
  iface?: string;
  vrid?: number;
  priority?: number;
  virtualIp?: string;
  state?: string;
  [key: string]: unknown;
}

export interface FhrpEntry extends VrrpGroup {}

export interface Subinterface {
  name: string;
  parentPort: string;
  vlanId: number;
  [key: string]: unknown;
}

export interface QueueEntry {
  name?: string;
  target?: string;
  maxLimit?: string;
  burstLimit?: string;
  burstThreshold?: string;
  burstTime?: string;
  [key: string]: unknown;
}

export interface MangleRule {
  chain?: string;
  action?: string;
  srcAddress?: string;
  dstAddress?: string;
  protocol?: string;
  dstPort?: string;
  [key: string]: unknown;
}

export interface SnmpConfig {
  enabled: boolean;
  community: string;
  communityRW: string;
  sysContact: string;
  sysLocation: string;
  [key: string]: unknown;
}

/** Draft object mode config Fortinet (policy / vip) — dibuat di code, bukan sumber eksternal. */
export interface FortiPolicyDraft {
  id?: string;
  name?: string;
  nat?: boolean;
  srcAddr?: string;
  dstAddr?: string;
  service?: string;
  action?: string;
  srcIntf?: string;
  dstIntf?: string;
  extip?: string;
  mappedip?: string;
  extIntf?: string;
  portforward?: boolean;
  protocol?: string;
  extPort?: string;
  mappedPort?: string;
  [key: string]: unknown;
}

export interface RoutingState {
  ospf: {
    enabled?: boolean;
    networks?: string[];
    interfaceCosts?: Record<string, number>;
    passiveInterfaces?: string[];
    areas?: Record<string, number>;
    routerId?: string;
    helloInterval?: number;
    deadInterval?: number;
    [key: string]: unknown;
  };
  rip: { enabled?: boolean; networks?: string[]; [key: string]: unknown };
  eigrp: { enabled?: boolean; asn?: number; networks?: string[]; [key: string]: unknown };
}

export interface StpState {
  enabled: boolean;
  priority: number;
  mode: string;
  [key: string]: unknown;
}

export interface PortSecurityEntry {
  secureMacs?: string[];
  limit?: number;
  sticky?: boolean;
  violation?: string;
  [key: string]: unknown;
}

export interface NodeMemory {
  configuredIps: Record<string, string>;
  routes: RouteEntry[];
  bgp: { asn: string | number; routerId: string; peers: BgpPeer[]; networks?: string[]; [key: string]: unknown };
  snmp: SnmpConfig;
  hostname: string;
  modelLabel: string;
  vlans: Array<{ id: number | string; name: string; iface?: string }>;
  dnsServers: string[];
  dnsRecords: Array<{ name: string; address: string }>;
  webServer: { enabled: boolean; port: number; content: string };
  /** Windows Client: file My Documents (dikelola GUI desktop). */
  files?: Array<{ name: string; content: string }>;
  /** Windows Client: situs web yang di-host perangkat ini (GUI Website Editor). */
  websites?: Array<{ hostname: string; port: number; content: string; enabled: boolean }>;
  dhcpPools: DhcpPool[];
  dhcpClients: DhcpClient[];
  dhcpExcluded?: string[];
  /** Layanan DHCP aktif global (mis. Huawei `dhcp enable` di system view). */
  dhcpEnabled?: boolean;
  /** Reservasi statis MAC → IP (fixed-address), mis. /ip dhcp-server lease add. */
  dhcpReservations?: { mac: string; ip: string }[];
  natRules: NatRule[];
  acls: AclRule[];
  portVlans: Record<string, number>;
  routing: RoutingState;
  shutdownIfaces: string[];
  subinterfaces: Subinterface[];
  trunkPorts: string[];
  trunkAllowed: Record<string, number[]>;
  trunkNative: Record<string, number>;
  queues: QueueEntry[];
  mangleRules: MangleRule[];
  wireless: Record<string, WirelessAp>;
  wirelessSecurityProfiles: Record<string, Record<string, unknown>>;
  stp: StpState;
  currentSsid: string;
  currentStaticDst: string;
  currentDhcpPool: string;
  currentProto: string;
  currentIface: string;
  currentVlan: string;
  natInsideIfaces: string[];
  natOutsideIfaces: string[];
  natAcls: Record<string, unknown>;
  currentDhcpSection: string;
  currentDhcpRange: boolean;
  bgpGroups: Record<string, unknown>;
  currentOspfArea: number;
  currentOspfAreaView: boolean;
  configuredIps6: Record<string, string>;
  routes6: RouteEntry[];
  fhrpGroups: FhrpEntry[];
  dhcpRelays: Record<string, unknown>;
  portSecurity: Record<string, PortSecurityEntry>;
  ipv6DhcpClients: string[];
  fortiPath: string[];
  fortiInRange: boolean;
  fortiDhcpIdx: number;
  fortiRangeIdx: number;
  fortiPendingVlan: number;
  fortiAddresses: Record<string, string>;
  fortiDraft: FortiPolicyDraft;
  fortiAddrGroup?: string[];
  fortiBgpPeer: string;
  fortiDhcpClient: string;
  currentAclId: string;
  natSrcDraft: Record<string, Record<string, string>>;
  natDstDraft: Record<string, Record<string, string>>;
  juniperSrcNat: Record<string, unknown>;
  juniperDstPool: Record<string, unknown>;
  uciPending: Record<string, string>;
  uciRedirects: Record<string, Record<string, string>>;
  /** OpenWrt: blok host dnsmasq (uci set dhcp.hostN=host + .mac/.ip). */
  uciHosts?: Record<string, Record<string, string>>;
  ifaceSettings: Record<string, unknown>;
  juniperFilters: Record<string, unknown>;
  fortiAddrName: string;
  juniperCommitted: NodeMemory | null;
}

/** Akses payload dengan validasi tipe — pengganti `as any`. */
export function payloadStr(p: Record<string, unknown>, key: string): string | undefined {
  const v = p[key];
  return typeof v === 'string' ? v : undefined;
}

/** Type guard: array elemen objek non-null dari sumber dinamis (provider/engine). */
export function recordArray(v: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null);
}

/** Type guard: objek non-null dari sumber dinamis, atau null. */
export function recordObject(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

/** AST aman dari payload (hasil CLIParser) — pengganti `as any` pada payload.ast. */
export function payloadAst(p: Record<string, unknown>): ASTNode | undefined {
  const v = p.ast;
  return typeof v === 'object' && v !== null ? (v as ASTNode) : undefined;
}
