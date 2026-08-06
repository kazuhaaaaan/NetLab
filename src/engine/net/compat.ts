// ============================================================
// compat — tipe hasil yang kompatibel dengan API engine lama
// (agar App.tsx / GradingModal / PingPanel tidak perlu berubah selain import).
// ============================================================

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
  /** edge ids in traversal order (source → destination) */
  edgeIds: string[];
  /** TTL as observed by the destination device */
  ttlAtDestination: number;
  /** true when the source obtained an IP automatically via DHCP */
  dhcpGranted?: boolean;
  reason?: 'no-ip' | 'invalid' | 'not-found' | 'unreachable' | 'ttl' | 'self' | 'blocked' | 'power' | 'refused';
}

export interface DhcpPoolInfo {
  name: string;
  range?: string;
  network?: string;
  iface?: string;
  gateway?: string;
}

export interface DeviceStatsSnapshot {
  name: string;
  deviceType: string;
  interfaces: { name: string; mac: string; ip: string | null; up: boolean }[];
  arp: { ip: string; mac: string }[];
  macTable: { mac: string; port: string }[];
  routes: { dst: string; gateway: string; iface: string; kind: string }[];
}

export interface DhcpLeaseInfo {
  nodeId: string;
  ip: string;
  gateway: string;
  prefix: number;
  poolNodeId: string;
}

export interface DhcpLeaseGrant {
  ip: string;
  gateway: string;
  prefix: number;
  poolNodeId: string;
}

export interface RoutingMemoryShape {
  ospf?: { enabled?: boolean; networks?: string[] };
  rip?: { enabled?: boolean; networks?: string[] };
  eigrp?: { enabled?: boolean; asn?: number; networks?: string[] };
}

export interface BgpPeerConfig {
  remoteAs: number;
  remoteAddr: string;
}

export interface BgpConfig {
  asn: number;
  peers: BgpPeerConfig[];
  networks: string[];
}

export interface WebServerInfo {
  enabled: boolean;
  port: number;
  content: string;
}

export interface DnsResolution {
  resolved: string | null;
  server?: string;
  timedOut?: boolean;
  nxdomain?: boolean;
}

export interface TracerouteHop {
  name: string;
  ttl: number;
  ip: string | null;
}

export interface TracerouteResult {
  ok: boolean;
  hops: TracerouteHop[];
  reason?: PingSimResult['reason'];
}

export interface LldpNeighborInfo {
  peerNodeId: string;
  peerName: string;
  peerDeviceType: string;
  localPort: string;
  peerPort: string;
}

export interface OspfNeighborInfo {
  routerId: string;
  ip: string;
  iface: string;
  state: string;
}

export interface BgpNeighborStateInfo {
  remoteAddr: string;
  remoteAs: number;
  state: 'Established' | 'Idle' | 'Connect';
  uptime: string;
  prefixes: number;
}

export interface TcpConnectionInfo {
  localIp: string;
  localPort: number;
  remoteIp: string;
  remotePort: number;
  state: 'LISTEN' | 'ESTABLISHED' | 'TIME_WAIT';
  proto: string;
}

export interface TcpHandshakeSegment {
  seq: number;
  ack: number;
  flags: string;
}

export interface TcpConnectResult {
  ok: boolean;
  reason?: PingSimResult['reason'];
  handshake: TcpHandshakeSegment[];
  status?: number;
  body?: string;
}

export interface SimRoute {
  dst: string;
  gateway: string | null;
  iface: string | null;
  kind: 'connected' | 'static' | 'dynamic';
}

/** Konfigurasi agent SNMP sebuah perangkat (di-set lewat CLI). */
export interface SnmpAgentConfig {
  enabled: boolean;
  community: string;
  communityRW?: string;
  sysContact?: string;
  sysLocation?: string;
}

/** Satu entri MIB: nilai + tipe ASN.1 SNMP (STRING/INTEGER/Timeticks/...). */
export interface SnmpOidValue {
  oid: string;
  value: string;
  type: string;
}

export interface SnmpQueryResult {
  ok: boolean;
  reason?:
    | 'no-ip'
    | 'unreachable'
    | 'invalid'
    | 'not-found'
    | 'timeout'
    | 'auth'
    | 'no-agent'
    | 'readonly'
    | 'not-found-oid'
    | 'power'
    | 'ttl';
  device?: string;
  error?: string;
  oids?: SnmpOidValue[];
}

export interface SnmpQueryOptions {
  walk?: boolean;
  setValue?: string;
}
