// ============================================================
// Core types — event-driven simulation engine
// ============================================================

export type PacketProtocol = 'arp' | 'icmp' | 'tcp' | 'udp' | 'ethernet';

export type DeviceKind = 'router' | 'switch' | 'firewall' | 'pc' | 'server' | 'wireless' | 'generic';

export interface IpConfig {
  address: string;
  prefix: number;
}

export type IfaceType = 'ethernet' | 'wireless' | 'vlan' | 'bridge' | 'loopback';

export interface NetworkInterface {
  portId: string;
  name: string;
  mac: string;
  ip?: IpConfig;
  up: boolean;
  type: IfaceType;
  vlanId?: number;
  parentPort?: string;
  speedMbps: number;
  mtu: number;
}

/** Satu hop yang dikunjungi sebuah paket. */
export interface PacketHop {
  nodeId: string;
  port: string;
  time: number;
  direction: 'fwd' | 'rev';
}

/**
 * Paket yang benar-benar dibuat, dikirim, diteruskan, dan dihancurkan engine.
 * Header dimutasi per hop (MAC ditulis ulang, TTL diturunkan) persis seperti
 * proses nyata: satu frame Ethernet masuk, frame lain keluar.
 */
export interface Packet {
  id: string;
  /** id korelasi satu "flow" (mis. satu ping, satu TCP connect) */
  correlationId: string;
  parentId?: string;
  protocol: PacketProtocol;
  srcMac: string;
  dstMac: string;
  srcIp: string;
  dstIp: string;
  srcPort: number;
  dstPort: number;
  vlan: number | null;
  ttl: number;
  flags: Record<string, number | string | boolean>;
  payload: Record<string, unknown> | null;
  size: number;
  /** waktu virtual pembuatan (ms) */
  created: number;
  hops: PacketHop[];
  edgeIds: string[];
  trace: string[];
  destroyed: boolean;
}

export type SimEventType =
  | 'DEVICE_BOOT'
  | 'DEVICE_SHUTDOWN'
  | 'CABLE_CONNECTED'
  | 'CABLE_DISCONNECTED'
  | 'INTERFACE_UP'
  | 'INTERFACE_DOWN'
  | 'PACKET_CREATED'
  | 'PACKET_QUEUED'
  | 'PACKET_SEND'
  | 'PACKET_TRANSMITTED'
  | 'PACKET_RECEIVED'
  | 'PACKET_FORWARDED'
  | 'PACKET_DELIVERED'
  | 'PACKET_DROPPED'
  | 'PACKET_EXPIRED'
  | 'PACKET_DESTROYED'
  | 'ARP_REQUEST'
  | 'ARP_REPLY'
  | 'MAC_LEARNED'
  | 'MAC_AGED'
  | 'DHCP_DISCOVER'
  | 'DHCP_OFFER'
  | 'DHCP_REQUEST'
  | 'DHCP_ACK'
  | 'DHCP_RENEW'
  | 'DHCP_RELEASE'
  | 'DHCP_RELAY'
  | 'DHCP_RELAY_REPLY'
  | 'PING_REQUEST'
  | 'PING_REPLY'
  | 'ROUTING_UPDATE'
  | 'NAT_REWRITE'
  | 'FIREWALL_BLOCK'
  | 'TTL_EXCEEDED'
  | 'ICMP_ERROR'
  | 'TCP_SYN'
  | 'TCP_SYN_ACK'
  | 'TCP_ACK'
  | 'AGING'
  | 'DEBUG_TRACE';

export interface SimEvent {
  id: string;
  traceId: string;
  type: SimEventType;
  /** waktu virtual (ms sejak awal run) */
  time: number;
  nodeId?: string;
  port?: string;
  packetId?: string;
  data: Record<string, unknown>;
}

export interface LinkSpec {
  id: string;
  /** nodeId + port pada kedua ujung */
  a: { nodeId: string; port: string };
  b: { nodeId: string; port: string };
  cableType: string;
  /** latensi kabel (ms) — override nilai default sesuai tipe kabel */
  latencyMs?: number;
  /** bandwidth link (Mbps) */
  bandwidthMbps?: number;
  /** true = link sengaja dimatikan (failure injection) */
  down?: boolean;
}

export interface DhcpPool {
  name: string;
  range?: string;
  network?: string;
  iface?: string;
  gateway?: string;
  /** true = server/pool dinonaktifkan via CLI → tidak melayani lease. */
  disabled?: boolean;
  /** alamat yang dikecualikan dari alokasi (ip dhcp excluded-address). */
  excluded?: string[];
  /** lama lease (ms); default 24 jam bila tidak diatur. */
  leaseTimeMs?: number;
  /** DNS server yang diiklankan ke klien (option 6). */
  dnsServers?: string[];
}

export interface DnsRecord {
  name: string;
  address: string;
}

export interface AclRule {
  action: 'permit' | 'deny';
  proto?: string;
  src?: string;
  dst?: string;
  /** Port sumber (mis. '80', '8000-9000') — berlaku untuk tcp/udp. */
  srcPort?: string;
  /** Port tujuan (mis. '443', '1-1024'). */
  dstPort?: string;
  /** Interface tempat paket MASUK (nama interface, mis. 'ether1'/'eth0'). */
  inInterface?: string;
  /** Interface tempat paket KELUAR (opsional; tidak semua jalur punya info ini). */
  outInterface?: string;
}

export interface NatRule {
  chain: string;
  outInterface?: string;
  action: string;
  srcAddress?: string;
  protocol?: string;
  dstAddress?: string;
  dstPort?: string;
  toAddresses?: string;
  toPorts?: string;
}

export interface NetRoute {
  dst: string;
  gateway: string | null;
  iface: string | null;
  kind: 'connected' | 'static' | 'dynamic';
  /** Administrative distance / metric rute (semakin kecil semakin disukai). */
  distance?: number;
  /** false = rute ternyata tidak dapat dipakai (gateway unreachable, dst jinvalid) — di-skip oleh lookup. */
  active?: boolean;
}

export interface NetLease {
  ip: string;
  gateway: string;
  prefix: number;
  poolNodeId: string;
  iface: string;
  /** waktu virtual kedaluwarsa lease */
  expiresAt: number;
}

/** Status satu flow yang sedang berjalan di dalam satu run. */
export interface RunResult {
  status: 'running' | 'ok' | 'fail';
  reason?: string;
  ttlAtDst?: number;
  blocked?: boolean;
  ttlExpired?: boolean;
  unreachable?: boolean;
  refused?: boolean;
  handshake?: { seq: number; ack: number; flags: string }[];
  statusCode?: number;
  body?: string;
  snmp?: any;
}

export const MAC_BROADCAST = 'ff:ff:ff:ff:ff:ff';
export const MAC_ALL_NODES = '01:00:5e:00:00:00';
export const IP_BROADCAST = '255.255.255.255';
