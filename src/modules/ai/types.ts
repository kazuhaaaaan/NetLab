// ============================================================
// AI Mentor — tipe bersama (contract seluruh modul AI).
// Semua analisis berbasis data nyata dari Simulation Engine.
// ============================================================

import type {
  AclRule,
  BgpConfig,
  DhcpLeaseInfo,
  DhcpPoolInfo,
  DnsRecord,
  NatRule,
  PingSimResult,
  RoutingMemoryShape,
  SimRoute,
} from '../../engine/net';
import type { SimEvent } from '../../engine/net/core/types';

export type { SimRoute } from '../../engine/net';

export type VendorId =
  | 'mikrotik'
  | 'cisco'
  | 'huawei'
  | 'juniper'
  | 'linux'
  | 'fortinet';

export type IssueCategory =
  | 'dhcp'
  | 'routing'
  | 'firewall'
  | 'nat'
  | 'dns'
  | 'switch'
  | 'vlan'
  | 'wireless'
  | 'bridge'
  | 'interface'
  | 'packet'
  | 'network';

export interface IfaceState {
  portId: string;
  name: string;
  mac: string;
  /** "a.b.c.d/prefix" atau null */
  ip: string | null;
  up: boolean;
  shutdown: boolean;
  /** true bila ada kabel yang terpasang pada port ini */
  cable: boolean;
  type: string;
  vlanId?: number;
  parentPort?: string;
  speedMbps: number;
}

export interface DeviceState {
  nodeId: string;
  name: string;
  deviceType: string;
  vendor: string;
  kind: string;
  powered: boolean;
  isSwitch: boolean;
  isL3: boolean;
  ip: string | null;
  interfaces: IfaceState[];
  arp: { ip: string; mac: string }[];
  macTable: { mac: string; port: string }[];
  routes: SimRoute[];
  staticRoutes: SimRoute[];
  acls: AclRule[];
  natRules: NatRule[];
  dhcpPools: DhcpPoolInfo[];
  leases: { iface: string; ip: string; gateway: string; prefix: number; poolNodeId: string; expiresAt: number }[];
  dnsRecords: DnsRecord[];
  dnsServers: string[];
  webServer: { enabled: boolean; port: number; content: string } | null;
  routingCfg: RoutingMemoryShape;
  bgpCfg: BgpConfig | null;
  portVlans: Record<string, number>;
  trunkPorts: string[];
  shutdownIfaces: string[];
  subinterfaces: Record<string, { parentPort: string; vlanId: number }>;
  dhcpClientState: 'idle' | 'init' | 'discover' | 'offer' | 'request' | 'bound' | 'renew' | 'released' | null;
  neighbors: { peerNodeId: string; peerName: string; peerDeviceType: string; localPort: string; peerPort: string }[];
}

export interface LinkState {
  id: string;
  cableType: string;
  a: { nodeId: string; portId: string; nodeName: string; ifaceName: string };
  b: { nodeId: string; portId: string; nodeName: string; ifaceName: string };
}

/** Snapshot lengkap kondisi jaringan yang dibaca langsung dari engine. */
export interface NetworkState {
  now: number;
  devices: DeviceState[];
  links: LinkState[];
  events: SimEvent[];
  leases: DhcpLeaseInfo[];
  byId: Map<string, DeviceState>;
  byIp: Map<string, DeviceState>;
}

export interface CommandSuggestion {
  vendor: VendorId;
  commands: string[];
}

/** Satu temuan hasil analisis (selalu didukung bukti dari engine). */
export interface AnalyzerIssue {
  id: string;
  category: IssueCategory;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  rootCause: string;
  evidence: string[];
  affectedDeviceId?: string;
  affectedDeviceName?: string;
  ifaceName?: string;
  recommendation: string;
  commands: CommandSuggestion[];
  /** 0..1 — seberapa yakin temuan ini berdasarkan data */
  confidence: number;
  /** kunci untuk CommandGenerator */
  fixKey?: string;
  params?: Record<string, string>;
}

export interface CategoryCheck {
  category: IssueCategory;
  label: string;
  ok: boolean;
  detail: string;
}

export interface AnalysisResult {
  status: 'healthy' | 'problem';
  issues: AnalyzerIssue[];
  checks: CategoryCheck[];
  confidence: number;
  /** path visual bila ada probe */
  probePaths: { from: string; to: string; path: string[]; ok: boolean; reason?: string }[];
  note?: string;
}

export type MentorMode = 'learn' | 'hint' | 'diagnose' | 'fix' | 'explain' | 'smart-cli';

export interface MentorSection {
  heading: string;
  lines: string[];
}

export interface MentorResponse {
  mode: MentorMode;
  status: 'healthy' | 'problem' | 'info';
  title: string;
  sections: MentorSection[];
  commands: CommandSuggestion[];
  confidence: number;
  /** daftar nama device yang dilalui paket (visual debug) */
  packetPath?: string[];
  note?: string;
}

/** Hasil probe ping (dijalankan lewat engine) + jejak event-nya. */
export interface ProbeResult {
  from: string;
  to: string;
  result: PingSimResult;
  /** device tempat paket berhenti (dari event PACKET_DROPPED/TTL/etc.) */
  stopAt?: string;
  stopName?: string;
  events: SimEvent[];
}

export interface AnalyzerCtx {
  engine: import('../../engine/net/core/NetworkSimulator').NetworkSimulator;
  probes: ProbeResult[];
}

export type Analyzer = (state: NetworkState, ctx: AnalyzerCtx) => AnalyzerIssue[];
