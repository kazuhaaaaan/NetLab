// ============================================================
// Ipv6RoutingTable — Longest Prefix Match untuk IPv6
// ============================================================

import { NetRoute } from '../core/types';
import { parseIpv6Cidr, inSameIpv6Subnet } from '../core/ipv6';

export class Ipv6RoutingTable {
  private routes: NetRoute[] = [];

  getRoutes(): NetRoute[] {
    return [...this.routes];
  }

  clear(): void {
    this.routes = [];
  }

  removeByKind(kind: NetRoute['kind']): void {
    this.routes = this.routes.filter((r) => r.kind !== kind);
  }

  addRoute(r: NetRoute): void {
    const parsed = parseIpv6Cidr(r.dst);
    if (!parsed) return;
    const norm = { ...r, dst: `${parsed.address}/${parsed.prefix}` };
    const existing = this.routes.findIndex(
      (x) => x.dst === norm.dst && x.gateway === norm.gateway && x.iface === norm.iface
    );
    if (existing >= 0) this.routes[existing] = norm;
    else this.routes.push(norm);
  }

  removeRoute(dst: string, gateway: string | null): void {
    this.routes = this.routes.filter((r) => !(r.dst === dst && r.gateway === gateway));
  }

  /** Longest Prefix Match untuk alamat IPv6. */
  lookup(dstIp: string): { gateway: string | null; iface: string | null } | null {
    let best: NetRoute | null = null;
    let bestPrefix = -1;
    for (const r of this.routes) {
      // Rute non-aktif (gateway unreachable / disabled) tidak pernah dipilih.
      if (r.active === false) continue;
      const parsed = parseIpv6Cidr(r.dst);
      if (!parsed) continue;
      if (parsed.prefix > bestPrefix && inSameIpv6Subnet(dstIp, parsed.prefix, parsed.address)) {
        best = r;
        bestPrefix = parsed.prefix;
      }
    }
    if (!best) return null;
    if (best.gateway === 'discard') return { gateway: 'discard', iface: null };
    if (best.kind === 'connected' && best.iface) return { gateway: dstIp, iface: best.iface };
    return { gateway: best.gateway, iface: best.iface };
  }

  /** Interface lokal yang subnet v6-nya memuat `ip`. */
  ifaceContaining(ip: string, interfaces: { name: string; ipv6?: { address: string; prefix: number }; up: boolean }[]): string | null {
    for (const iface of interfaces) {
      if (!iface.ipv6 || !iface.up) continue;
      if (inSameIpv6Subnet(ip, iface.ipv6.prefix, iface.ipv6.address)) return iface.name;
    }
    return null;
  }
}
