// ============================================================
// NetworkDevice — data perangkat (interfaces, ARP, MAC, rute, services)
// Perilaku hidup di *Processor* (Strategy pattern).
// ============================================================

import { NetworkInterfaceModel } from '../interfaces/NetworkInterface';
import { ArpCache } from '../layer2/ArpCache';
import { MacTable } from '../layer2/MacTable';
import { RoutingTable } from '../layer3/RoutingTable';
import { Ipv6RoutingTable } from '../layer3/Ipv6RoutingTable';
import { NatTranslator } from '../layer4/Nat';
import { AclRule, DeviceKind, DhcpPool, DnsRecord, NatRule, NetLease, NetRoute } from '../core/types';
import { parseCidr, networkOf, intToIp, isValidIp } from '../core/ip';
import { parseIpv6Cidr, ipv6NetworkString, inSameIpv6Subnet, isIpv6Address } from '../core/ipv6';
import { DEFAULT_STP_MODE, DEFAULT_STP_PRIORITY, StpBridgeState, StpConfig, StpPortState } from '../services/StpService';
import { FhrpGroup } from '../services/FhrpService';
import { WirelessIfaceCfg, WirelessProfileCfg, WirelessState } from '../services/WirelessService';
import { freshQosState, MangleRule, QosState, SimpleQueue } from '../services/QosService';
import type { SnmpAgentConfig } from '../compat';

export interface WebServerState {
  enabled: boolean;
  port: number;
  content: string;
}

/**
 * MAC default deterministik & unik per (deviceId, portId, index):
 * hash FNV-1a 32-bit dari id device+port, plus byte port index agar
 * dua port ber-id sama panjang tidak saling bentrok (bug lama:
 * `${p.id.length % 16}` menghasilkan MAC identik/malformed).
 */
function defaultPortMac(deviceId: string, portId: string, portIndex: number): string {
  let h1 = 2166136261;
  const s = `${deviceId}|${portId}`;
  for (let i = 0; i < s.length; i++) {
    h1 ^= s.charCodeAt(i);
    h1 = Math.imul(h1, 16777619) >>> 0;
  }
  const bytes = [
    0x02,
    (h1 >>> 24) & 0xff,
    (h1 >>> 16) & 0xff,
    (h1 >>> 8) & 0xff,
    h1 & 0xff,
    (h1 >>> 24) ^ (portIndex & 0xff) ^ ((h1 >>> 8) & 0xff),
  ];
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join(':');
}

/** Gateway khusus: blackhole (paket dibuang diam-diam). */
export const DISCARD_GATEWAY = 'discard';

export class NetworkDevice {
  readonly id: string;
  name: string;
  readonly deviceType: string;
  readonly kind: DeviceKind;
  /** vendor (mikrotik/cisco/linux/...) — additive, tidak mengubah perilaku */
  readonly vendor: string;
  powered = true;

  private interfaces = new Map<string, NetworkInterfaceModel>();
  private nameIndex = new Map<string, string>();

  readonly arpCache = new ArpCache();
  /** Neighbor cache IPv6 (NDP) — ipv6 → mac. */
  readonly ipv6Neighbors = new ArpCache();
  readonly macTable = new MacTable();
  readonly routing = new RoutingTable();
  readonly ipv6Routing = new Ipv6RoutingTable();
  readonly nat = new NatTranslator();

  /** CLI-derived state */
  configuredIps = new Map<string, string>();
  /** ifaceName → cidr IPv6 dari CLI (/ipv6 address add / ipv6 address). */
  configuredIpv6s = new Map<string, string>();
  routes: NetRoute[] = [];
  /** Rute statis IPv6 (dst, gateway) dari CLI. */
  ipv6StaticRoutes: NetRoute[] = [];
  shutdownIfaces = new Set<string>();
  portVlans = new Map<string, number>();
  trunkPorts = new Set<string>();
  subinterfaces = new Map<string, { parentPort: string; vlanId: number }>();

  dhcpPools: DhcpPool[] = [];
  dnsRecords: DnsRecord[] = [];
  dnsServers: string[] = [];
  aclRules: AclRule[] = [];
  natRules: NatRule[] = [];
  webServer: WebServerState | null = null;
  routingCfg: Record<string, { enabled?: boolean; networks?: string[]; asn?: number; peers?: unknown[]; interfaceCosts?: Record<string, number>; passiveInterfaces?: string[]; routerId?: string }> = {};
  bgpCfg: { asn: number; peers: { remoteAs: number; remoteAddr: string }[]; networks: string[] } | null = null;
  /** Agent SNMP (community, hidup/mati) — diisi via CLI + engine. */
  snmpAgent: SnmpAgentConfig | null = null;
  /** Basis uptime (ticks) untuk sysUpTime.0. */
  snmpUptimeBase = 0;

  // ── STP/RSTP ──────────────────────────────────────────────────
  stpConfig: StpConfig = { enabled: true, priority: DEFAULT_STP_PRIORITY, mode: DEFAULT_STP_MODE };
  /** portId → role/state STP (diisi computeStp). */
  stpPorts: Map<string, StpPortState> = new Map();
  stpState: StpBridgeState | null = null;

  // ── FHRP (VRRP-style) ────────────────────────────────────────
  /** Grup virtual IP yang diikuti perangkat ini (diisi via CLI). */
  fhrpGroups: FhrpGroup[] = [];
  /** Virtual IP yang "dimiliki" perangkat ini (hanya master, diisi computeFhrp). */
  virtualIps: string[] = [];

  // ── DHCP relay & port-security & SLAAC ──────────────────────
  /** port (nama interface) → alamat server DHCP (ip helper-address). */
  dhcpRelays: Record<string, string> = {};
  /** port (nama interface) → konfigurasi port-security (limit/sticky/macs belajar). */
  portSecurityCfg: Record<string, { limit?: number; sticky?: boolean; learned: string[] }> = {};
  /** interface yang memakai SLAAC/DHCPv6 client (autoconfig). */
  slaacIfaces: string[] = [];
  /** hasil alamat SLAAC (iface → cidr) agar info/print konsisten. */
  slaacAddresses: Record<string, string> = {};

  // ── Wireless (AP/station) ────────────────────────────────────
  /** nama interface → konfigurasi wireless (ssid/mode/band/security). */
  wirelessCfg: Record<string, WirelessIfaceCfg> = {};
  /** nama profil keamanan → { authenticationTypes, key }. */
  wirelessSecurityProfiles: Record<string, WirelessProfileCfg> = {};
  /** Hasil komputasi asosiasi (diisi computeWireless). */
  wirelessState: WirelessState | null = null;

  // ── QoS (queue simple + mangle) ──────────────────────────────
  queues: SimpleQueue[] = [];
  mangleRules: MangleRule[] = [];
  qosState: QosState = freshQosState();

  /** Lease DHCP yang aktif: iface → lease */
  leases = new Map<string, NetLease>();
  /** Koneksi TCP yang tercatat (netstat) */
  tcpConnections: Record<string, unknown>[] = [];
  /** State DHCP client (host): xid, fase, IP yang ditawarkan */
  dhcpClient: {
    xid: number;
    state: 'idle' | 'discover' | 'offer' | 'request' | 'bound';
    ifaceName?: string;
    offered?: { ip: string; gateway: string; prefix: number; poolNodeId: string };
  } | null = null;

  constructor(id: string, name: string, deviceType: string, kind: DeviceKind, vendor = deviceType) {
    this.id = id;
    this.name = name;
    this.deviceType = deviceType;
    this.kind = kind;
    this.vendor = vendor;
  }

  get isSwitch(): boolean {
    return this.kind === 'switch' || this.kind === 'wireless' || this.kind === 'generic';
  }

  get isL3(): boolean {
    return !this.isSwitch;
  }

  syncPorts(ports: { id: string; name: string; macAddress?: string; status?: string; ipAddress?: string; speedMbps?: number }[]): void {
    const seen = new Set<string>();
    ports.forEach((p, portIndex) => {
      seen.add(p.id);
      const existing = this.interfaces.get(p.id);
      const parsed = p.ipAddress ? parseCidr(p.ipAddress) : undefined;
      if (existing) {
        existing.name = p.name;
        existing.mac = p.macAddress || existing.mac;
        existing.up = p.status === 'up';
        if (parsed && !existing.ip) existing.ip = parsed;
      } else {
        this.interfaces.set(p.id, new NetworkInterfaceModel({
          portId: p.id,
          name: p.name,
          mac: p.macAddress || defaultPortMac(this.id, p.id, portIndex),
          ip: parsed,
          up: p.status === 'up',
          speedMbps: p.speedMbps,
        }));
      }
      this.nameIndex.set(p.name.toLowerCase(), p.id);
    });
    for (const id of [...this.interfaces.keys()]) {
      if (!seen.has(id)) {
        const oldName = this.interfaces.get(id)!.name;
        this.interfaces.delete(id);
        for (const [vname, v] of [...this.subinterfaces]) {
          if (v.parentPort === oldName) this.subinterfaces.delete(vname);
        }
      }
    }
    this.rebuildConnectedRoutes();
    this.rebuildConnectedRoutes6();
  }

  private rebuildConnectedRoutes(): void {
    this.routing.removeByKind('connected');
    for (const iface of this.interfaces.values()) {
      if (!iface.ip || !iface.up) continue;
      this.routing.addRoute({
        dst: `${intToIp(networkOf(iface.ip.address, iface.ip.prefix))}/${iface.ip.prefix}`,
        gateway: null,
        iface: iface.name,
        kind: 'connected',
      });
    }
    this.applyStaticRoutes();
  }

  private applyStaticRoutes(): void {
    for (const r of this.routes) {
      if (r.kind === 'static') {
        this.routing.addRoute({ ...r, active: this.staticRouteReachable(r.gateway) });
      }
    }
  }

  /**
   * Gateway statis dianggap dapat dijangkau bila berada di subnet titik-titik
   * interface yang hidup (memenuhi kondisi ARP). Gateway di subnet yang tidak
   * ada interface-nya → rute ditandai inactive (tetap tampil di print,
   * tapi tidak dipakai lookup / tidak bisa meneruskan paket).
   */
  private staticRouteReachable(gateway: string | null): boolean {
    if (!gateway) return true;
    const parsed = parseCidr(gateway);
    if (!parsed) return false;
    for (const iface of this.interfaces.values()) {
      if (!iface.ip || !iface.up) continue;
      if (networkOf(gateway, iface.ip.prefix) === networkOf(iface.ip.address, iface.ip.prefix)) return true;
    }
    return false;
  }

  /** Route connected + statis untuk IPv6 (dipanggil setelah syncPorts/setIpv6ByName). */
  private rebuildConnectedRoutes6(): void {
    this.ipv6Routing.removeByKind('connected');
    for (const iface of this.interfaces.values()) {
      if (!iface.ipv6 || !iface.up) continue;
      this.ipv6Routing.addRoute({
        dst: `${ipv6NetworkString(iface.ipv6.address, iface.ipv6.prefix)}/${iface.ipv6.prefix}`,
        gateway: null,
        iface: iface.name,
        kind: 'connected',
      });
    }
    this.applyStaticRoutes6();
  }

  /** Terapkan semua rute statis IPv6 dengan flag aktif (mirip IPv4). */
  applyStaticRoutes6(): void {
    for (const r of this.ipv6StaticRoutes) {
      if (r.kind === 'static') {
        this.ipv6Routing.addRoute({ ...r, active: this.staticRouteReachable6(r.gateway) });
      }
    }
  }

  /**
   * Gateway statis IPv6 dianggap dapat dijangkau bila berada di subnet
   * interface hidup. Gateway 'discard' = blackhole (selalu aktif, paket
   * dibuang diam-diam). Gateway tidak valid / di subnet tanpa interface →
   * rute inactive (tetap tampil di print, tidak dipakai lookup).
   */
  private staticRouteReachable6(gateway: string | null): boolean {
    if (!gateway || gateway === DISCARD_GATEWAY) return true;
    if (!isIpv6Address(gateway)) return false;
    for (const iface of this.interfaces.values()) {
      if (!iface.ipv6 || !iface.up) continue;
      if (inSameIpv6Subnet(gateway, iface.ipv6.prefix, iface.ipv6.address)) return true;
    }
    return false;
  }

  /** Pasang alamat IPv6 pada interface (cidr: '2001:db8::1/64'). */
  setIpv6ByName(ifaceName: string, cidr: string): boolean {
    const key = this.nameIndex.get(ifaceName.toLowerCase());
    const iface = key ? this.interfaces.get(key) : null;
    const parsed = parseIpv6Cidr(cidr);
    if (!iface || !parsed) return false;
    iface.ipv6 = parsed;
    iface.up = true;
    this.rebuildConnectedRoutes6();
    return true;
  }

  getIpv6Address(): string | null {
    for (const iface of this.interfaces.values()) {
      if (iface.ipv6) return iface.ipv6.address;
    }
    return null;
  }

  hasIpv6(ip: string): NetworkInterfaceModel | null {
    for (const iface of this.interfaces.values()) {
      if (iface.ipv6 && iface.ipv6.address === ip) return iface;
    }
    return null;
  }

  getIpv6Routes(): NetRoute[] {
    return this.ipv6Routing.getRoutes();
  }

  /** Interface keluar untuk next-hop IPv6 (mirip resolveEgressIface). */
  resolveEgressIface6(gateway: string): NetworkInterfaceModel | null {
    for (const iface of this.interfaces.values()) {
      if (!iface.ipv6 || !iface.up) continue;
      if (inSameIpv6Subnet(gateway, iface.ipv6.prefix, iface.ipv6.address)) return iface;
    }
    return null;
  }

  setIpByName(ifaceName: string, cidr: string): boolean {
    const key = this.nameIndex.get(ifaceName.toLowerCase());
    const iface = key ? this.interfaces.get(key) : null;
    const parsed = parseCidr(cidr);
    if (!iface || !parsed) return false;
    iface.ip = parsed;
    iface.up = true;
    this.rebuildConnectedRoutes();
    return true;
  }

  setIfaceUp(ifaceName: string, up: boolean): boolean {
    const key = this.nameIndex.get(ifaceName.toLowerCase());
    const iface = key ? this.interfaces.get(key) : null;
    if (!iface) return false;
    iface.up = up;
    this.rebuildConnectedRoutes();
    return true;
  }

  addStaticRoute(dst: string, gateway: string, distance?: number): void {
    const norm = normalizeStaticRoute(dst, gateway, distance);
    this.routes.push(norm);
    this.routing.addRoute({ ...norm, active: this.staticRouteReachable(gateway) });
  }

  clearStaticRoutes(): void {
    this.routes = this.routes.filter((r) => r.kind !== 'static');
    this.routing.removeByKind('static');
  }

  addDynamicRoute(dst: string, gateway: string): void {
    this.routing.addRoute({ dst, gateway, iface: null, kind: 'dynamic' });
  }

  clearDynamicRoutes(): void {
    this.routing.removeByKind('dynamic');
  }

  addVirtualIface(name: string, parentPortName: string, vlanId: number, mac: string): void {
    if (this.nameIndex.has(name.toLowerCase())) return;
    const parent = this.getIfaceByName(parentPortName);
    this.interfaces.set(`virt:${name}`, new NetworkInterfaceModel({
      portId: `virt:${name}`,
      name,
      mac: mac || parent?.mac || `02:00:00:00:${vlanId}:00`,
      type: 'vlan',
      vlanId,
      parentPort: parentPortName,
    }));
    this.nameIndex.set(name.toLowerCase(), `virt:${name}`);
    this.rebuildConnectedRoutes();
  }

  getVirtualByParentPort(parentPortName: string): NetworkInterfaceModel | null {
    const parent = this.getIfaceByName(parentPortName);
    if (!parent || parent.type !== 'ethernet') return null;
    for (const iface of this.interfaces.values()) {
      if (iface.type === 'vlan' && iface.parentPort === parentPortName) return iface;
    }
    return null;
  }

  getIfaceByName(ifaceName: string): NetworkInterfaceModel | null {
    const key = this.nameIndex.get(ifaceName.toLowerCase());
    if (!key) return null;
    return this.interfaces.get(key) || null;
  }

  getIfaceByPortId(portId: string): NetworkInterfaceModel | null {
    return this.interfaces.get(portId) || null;
  }

  getInterfaces(): NetworkInterfaceModel[] {
    return [...this.interfaces.values()];
  }

  /** IP pertama yang terkonfigurasi (host view). */
  getIpAddress(): string | null {
    for (const iface of this.interfaces.values()) {
      if (iface.ip) return iface.ip.address;
    }
    return null;
  }

  hasIp(ip: string): NetworkInterfaceModel | null {
    if (this.virtualIps.includes(ip)) {
      // FHRP: virtual IP dimiliki master — kaitkan ke interface grup (atau
      // interface up pertama) agar paket diterima & dibalas oleh master.
      const g = this.fhrpGroups.find((grp) => grp.virtualAddress.split('/')[0] === ip);
      const viaName = g?.interface ?? '';
      const named = viaName ? this.getIfaceByName(viaName) : null;
      return named || this.getInterfaces().find((i) => i.up) || this.getInterfaces()[0] || null;
    }
    for (const iface of this.interfaces.values()) {
      if (iface.ip && iface.ip.address === ip) return iface;
    }
    return null;
  }

  getRoutes(): NetRoute[] {
    return this.routing.getRoutes();
  }

  /** Interface keluar untuk next-hop `gateway` (mirip perilaku engine lama). */
  resolveEgressIface(gateway: string): NetworkInterfaceModel | null {
    for (const iface of this.interfaces.values()) {
      if (!iface.ip || !iface.up) continue;
      const g = parseCidr(`${gateway}/${iface.ip.prefix}`);
      if (!g) continue;
      // >>> 0: bandingkan bilangan unsigned (>> signed salah untuk bit-31-set
      // dan prefix 0 → >>32 di JS bernilai >>0, selalu cocok).
      const gw = ipNum(g.address) >>> (32 - iface.ip.prefix);
      const self = ipNum(iface.ip.address) >>> (32 - iface.ip.prefix);
      if (gw === self) return iface;
    }
    return null;
  }
}

function ipNum(ip: string): number {
  return ip.split('.').reduce((acc, o) => (acc << 8) | parseInt(o, 10), 0) >>> 0;
}

/**
 * Normalisasi rute statis: '0.0.0.0' tanpa prefix → default route /0 (bukan
 * /24), dst berbentuk network+mask ('10.0.0.0 255.255.255.0') dinormalisasi.
 */
export function normalizeStaticRoute(dst: string, gateway: string | null, distance?: number): NetRoute {
  const parsed = parseCidr(dst);
  let normDst = dst;
  if (dst.trim() === '0.0.0.0') normDst = '0.0.0.0/0';
  else if (parsed) normDst = `${parsed.address}/${parsed.prefix}`;
  return { dst: normDst, gateway, iface: null, kind: 'static', distance };
}
