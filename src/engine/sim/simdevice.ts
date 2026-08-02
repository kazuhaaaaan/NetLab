import { PortSpec } from '../../types';
import { parseCidr, networkOf, inSameSubnet } from './ip';

export interface SimIface {
  portId: string;
  name: string;
  mac: string;
  ip?: { address: string; prefix: number };
  up: boolean;
}

export interface SimRoute {
  /** network in CIDR form, e.g. '0.0.0.0/0' or '10.0.0.0/30' */
  dst: string;
  /** next hop IP for static routes; null for connected routes */
  gateway: string | null;
  /** exit interface name (null for static routes resolved later) */
  iface: string | null;
  /** connection type: 'connected' | 'static' */
  kind: 'connected' | 'static';
}

/**
 * A simulated network device: interfaces, IP addressing, routing table,
 * ARP cache and MAC table (for L2 forwarding devices).
 */
export class SimDevice {
  readonly id: string;
  name: string;
  deviceType: string;
  /** L2 forwarding device (switch / wireless AP): floods & learns MACs */
  readonly isSwitch: boolean;

  private interfaces = new Map<string, SimIface>(); // keyed by portId
  private nameIndex = new Map<string, string>(); // iface name (case-insensitive) -> portId

  /** ip -> mac */
  readonly arpCache = new Map<string, string>();
  /** mac -> portName (L2 learning table) */
  readonly macTable = new Map<string, string>();

  private routes: SimRoute[] = [];
  private staticRoutes: SimRoute[] = [];

  constructor(
    id: string,
    name: string,
    deviceType: string,
    ports: PortSpec[]
  ) {
    this.id = id;
    this.name = name;
    this.deviceType = deviceType;
    this.isSwitch = deviceType === 'switch' || deviceType === 'wireless';
    this.syncPorts(ports);
  }

  syncPorts(ports: PortSpec[]): void {
    const seen = new Set<string>();
    for (const p of ports) {
      seen.add(p.id);
      const existing = this.interfaces.get(p.id);
      if (existing) {
        existing.name = p.name;
        existing.mac = p.macAddress || existing.mac;
        existing.up = p.status === 'up';
        if (p.ipAddress && !existing.ip) {
          const parsed = parseCidr(p.ipAddress);
          if (parsed) existing.ip = parsed;
        }
      } else {
        const parsed = p.ipAddress ? parseCidr(p.ipAddress) : null;
        this.interfaces.set(p.id, {
          portId: p.id,
          name: p.name,
          mac: p.macAddress || `02:00:00:00:00:${p.id.length}`,
          ip: parsed || undefined,
          up: p.status === 'up',
        });
      }
      this.nameIndex.set(p.name.toLowerCase(), p.id);
    }
    for (const id of [...this.interfaces.keys()]) {
      if (!seen.has(id)) this.interfaces.delete(id);
    }
    this.rebuildConnectedRoutes();
  }

  private rebuildConnectedRoutes(): void {
    const connected: SimRoute[] = [];
    for (const iface of this.interfaces.values()) {
      if (iface.ip && iface.up) {
        connected.push({
          dst: `${intToIp(networkOf(iface.ip.address, iface.ip.prefix))}/${iface.ip.prefix}`,
          gateway: null,
          iface: iface.name,
          kind: 'connected',
        });
      }
    }
    this.routes = [...connected, ...this.staticRoutes];
  }

  setName(name: string): void {
    this.name = name;
  }

  /** Set an IP on an interface by its name (from CLI: /ip address add).
   *  Assigning an IP implicitly brings the interface up. */
  setIpByName(ifaceName: string, cidr: string): boolean {
    const portId = this.nameIndex.get(ifaceName.toLowerCase());
    if (!portId) return false;
    const iface = this.interfaces.get(portId);
    const parsed = parseCidr(cidr);
    if (!iface || !parsed) return false;
    iface.ip = parsed;
    iface.up = true;
    this.rebuildConnectedRoutes();
    return true;
  }

  getIfaceByName(ifaceName: string): SimIface | null {
    const portId = this.nameIndex.get(ifaceName.toLowerCase());
    if (!portId) return null;
    return this.interfaces.get(portId) || null;
  }

  getIfaceByPortId(portId: string): SimIface | null {
    return this.interfaces.get(portId) || null;
  }

  getInterfaces(): SimIface[] {
    return [...this.interfaces.values()];
  }

  /** First configured IP address (host view), or null. */
  getIpAddress(): string | null {
    for (const iface of this.interfaces.values()) {
      if (iface.ip) return iface.ip.address;
    }
    return null;
  }

  /** Is `ip` assigned to one of this device's interfaces? */
  hasIp(ip: string): SimIface | null {
    for (const iface of this.interfaces.values()) {
      if (iface.ip && iface.ip.address === ip) return iface;
    }
    return null;
  }

  /** Add a static route: dst='10.0.0.0/30', gateway='10.0.0.1'. */
  addStaticRoute(dst: string, gateway: string): void {
    const parsed = parseCidr(dst);
    const dstNorm = parsed ? `${parsed.address}/${parsed.prefix}` : dst;
    if (!this.staticRoutes.some((r) => r.dst === dstNorm && r.gateway === gateway)) {
      this.staticRoutes.push({
        dst: dstNorm,
        gateway,
        iface: null,
        kind: 'static',
      });
    }
    this.rebuildConnectedRoutes();
  }

  clearStaticRoutes(): void {
    this.staticRoutes = [];
    this.rebuildConnectedRoutes();
  }

  getRoutes(): SimRoute[] {
    return [...this.routes];
  }

  /**
   * Longest-prefix-match routing decision for a destination IP.
   * Returns { gateway, iface } where:
   *  - connected: gateway === dstIp, iface = local interface
   *  - static: gateway = next hop, iface = interface facing the gateway
   */
  nextHop(dstIp: string): { gateway: string; iface: string } | null {
    let best: SimRoute | null = null;
    let bestLen = -1;
    for (const r of this.routes) {
      const [net, p] = r.dst.split('/');
      const prefix = parseInt(p, 10);
      if (isNaN(prefix)) continue;
      if (prefix >= bestLen && networkOf(net, prefix) === networkOf(dstIp, prefix)) {
        best = r;
        bestLen = prefix;
      }
    }
    if (!best) return null;

    if (best.kind === 'connected' && best.iface) {
      return { gateway: dstIp, iface: best.iface };
    }

    // static route — find the interface whose subnet contains the gateway
    const gw = best.gateway;
    if (!gw) return null;
    for (const iface of this.interfaces.values()) {
      if (iface.ip && iface.up && inSameSubnet(iface.ip.address, iface.ip.prefix, gw)) {
        return { gateway: gw, iface: iface.name };
      }
    }
    // fallback: first up interface
    const firstUp = [...this.interfaces.values()].find((i) => i.up);
    return firstUp ? { gateway: gw, iface: firstUp.name } : null;
  }

  /** ARP lookup (learning only — used when a peer device's MAC is required). */
  resolveArp(ip: string): string | null {
    return this.arpCache.get(ip) || null;
  }

  learnArp(ip: string, mac: string): void {
    this.arpCache.set(ip, mac);
  }

  /** L2 forwarding: learn + return exit port name, or null to flood. */
  l2Lookup(dstMac: string): string | null {
    const portName = this.macTable.get(dstMac);
    return portName || null;
  }
}

function intToIp(n: number): string {
  return [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
}
