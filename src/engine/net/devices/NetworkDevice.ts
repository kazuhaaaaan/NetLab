// ============================================================
// NetworkDevice — data perangkat (interfaces, ARP, MAC, rute, services)
// Perilaku hidup di *Processor* (Strategy pattern).
// ============================================================

import { NetworkInterfaceModel } from '../interfaces/NetworkInterface';
import { ArpCache } from '../layer2/ArpCache';
import { MacTable } from '../layer2/MacTable';
import { RoutingTable } from '../layer3/RoutingTable';
import { NatTranslator } from '../layer4/Nat';
import { AclRule, DeviceKind, DhcpPool, DnsRecord, IpConfig, NatRule, NetLease, NetRoute } from '../core/types';
import { parseCidr } from '../core/ip';

export interface WebServerState {
  enabled: boolean;
  port: number;
  content: string;
}

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
  readonly macTable = new MacTable();
  readonly routing = new RoutingTable();
  readonly nat = new NatTranslator();

  /** CLI-derived state */
  configuredIps = new Map<string, string>();
  routes: NetRoute[] = [];
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
  routingCfg: Record<string, { enabled?: boolean; networks?: string[]; asn?: number; peers?: unknown[] }> = {};
  bgpCfg: { asn: number; peers: { remoteAs: number; remoteAddr: string }[]; networks: string[] } | null = null;

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
    for (const p of ports) {
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
          mac: p.macAddress || `02:00:00:00:00:${p.id.length % 16}`,
          ip: parsed,
          up: p.status === 'up',
          speedMbps: p.speedMbps,
        }));
      }
      this.nameIndex.set(p.name.toLowerCase(), p.id);
    }
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
  }

  private rebuildConnectedRoutes(): void {
    this.routing.removeByKind('connected');
    for (const iface of this.interfaces.values()) {
      if (!iface.ip || !iface.up) continue;
      this.routing.addRoute({
        dst: cidrString(iface.ip),
        gateway: null,
        iface: iface.name,
        kind: 'connected',
      });
    }
    this.applyStaticRoutes();
  }

  private applyStaticRoutes(): void {
    for (const r of this.routes) {
      if (r.kind === 'static') this.routing.addRoute(r);
    }
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

  addStaticRoute(dst: string, gateway: string): void {
    this.routes.push({ dst, gateway, iface: null, kind: 'static' });
    this.routing.addRoute({ dst, gateway, iface: null, kind: 'static' });
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
      if (Math.trunc(ipNum(g.address)) >> (32 - iface.ip.prefix) === Math.trunc(ipNum(iface.ip.address)) >> (32 - iface.ip.prefix)) {
        return iface;
      }
    }
    return null;
  }
}

function cidrString(ip: IpConfig): string {
  return `${ip.address}/${ip.prefix}`;
}

function ipNum(ip: string): number {
  return ip.split('.').reduce((acc, o) => (acc << 8) | parseInt(o, 10), 0) >>> 0;
}
