// ============================================================
// RoutingTable — Longest Prefix Match + connected/static/dynamic
// ============================================================

import { NetRoute } from '../core/types';
import { networkOf, parseCidr, prefixToMask } from '../core/ip';

export class RoutingTable {
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
    const norm = normalize(r);
    if (!norm) return;
    const existing = this.routes.findIndex(
      (x) => x.dst === norm.dst && x.gateway === norm.gateway && x.iface === norm.iface
    );
    if (existing >= 0) this.routes[existing] = norm;
    else this.routes.push(norm);
  }

  removeRoute(dst: string, gateway: string | null): void {
    this.routes = this.routes.filter((r) => !(r.dst === dst && r.gateway === gateway));
  }

  /**
   * Longest Prefix Match. Hasil memuat next-hop IP dan interface keluar:
   * - connected  → gateway = dstIp, iface = interface lokal
   * - static/dyn → gateway = next hop, iface diisi dari subnet gateway
   *
   * Rute non-aktif (gateway unreachable / disabled) tidak pernah dipilih.
   * Untuk prefix sama panjang, rute dengan administrative distance (metric)
   * lebih kecil menang; sisanya urutan pemasangan (connected > static > dynamic).
   */
  lookup(dstIp: string): { gateway: string | null; iface: string | null } | null {
    let best: NetRoute | null = null;
    let bestPrefix = -1;
    let bestMetric = Infinity;
    for (const r of this.routes) {
      if (r.active === false) continue;
      const parsed = parseCidr(r.dst);
      if (!parsed) continue;
      const p = parsed.prefix;
      const metric = r.distance ?? (r.kind === 'connected' ? 0 : r.kind === 'static' ? 1 : 110);
      if (p > bestPrefix && networkOf(dstIp, p) === networkOf(parsed.address, p)) {
        best = r;
        bestPrefix = p;
        bestMetric = metric;
      } else if (p === bestPrefix && metric < bestMetric && networkOf(dstIp, p) === networkOf(parsed.address, p)) {
        best = r;
        bestMetric = metric;
      }
    }
    if (!best) return null;
    if (best.kind === 'connected' && best.iface) {
      return { gateway: dstIp, iface: best.iface };
    }
    return { gateway: best.gateway, iface: best.iface };
  }

  /** Interface lokal yang subnet-nya memuat `ip` (untuk me-resolve gateway). */
  ifaceContaining(ip: string, interfaces: { name: string; ip?: { address: string; prefix: number }; up: boolean }[]): string | null {
    for (const iface of interfaces) {
      if (!iface.ip || !iface.up) continue;
      if (networkOf(ip, iface.ip.prefix) === networkOf(iface.ip.address, iface.ip.prefix)) {
        return iface.name;
      }
    }
    return null;
  }
}

export function normalize(r: NetRoute): NetRoute | null {
  const parsed = parseCidr(r.dst);
  if (!parsed) return null;
  return {
    dst: `${parsed.address}/${parsed.prefix}`,
    gateway: r.gateway,
    iface: r.iface,
    kind: r.kind,
    distance: r.distance,
    active: r.active,
  };
}

export function maskOfPrefix(prefix: number): number {
  return prefixToMask(prefix);
}
