// ============================================================
// RoutingAnalyzer — missing default route, wrong gateway, LPM, loop
// ============================================================

import { AnalyzerCtx, AnalyzerIssue, DeviceState, NetworkState } from './types';
import { parseCidr } from '../../engine/net/core/ip';
import { defaultRouteOf, ipInt } from './NetworkStateReader';

function connectedSubnets(state: NetworkState): string[] {
  const set = new Set<string>();
  for (const d of state.devices) {
    for (const r of d.routes) {
      if (r.kind !== 'connected') continue;
      const p = parseCidr(r.dst);
      if (!p) continue;
      const mask = (0xffffffff << (32 - p.prefix)) >>> 0;
      set.add(`${intToIp(ipInt(p.address) & mask)}/${p.prefix}`);
    }
  }
  return [...set];
}

function intToIp(n: number): string {
  return [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
}

/** Apakah gateway L2-reachable (berada di salah satu subnet terhubung device). */
function gatewayReachable(dev: DeviceState, gw: string): boolean {
  for (const i of dev.interfaces) {
    if (!i.up || !i.ip) continue;
    const p = parseCidr(i.ip);
    if (!p) continue;
    const mask = (0xffffffff << (32 - p.prefix)) >>> 0;
    if ((ipInt(gw) & mask) === (ipInt(p.address) & mask)) return true;
  }
  return false;
}

export function analyzeRouting(state: NetworkState, ctx: AnalyzerCtx): AnalyzerIssue[] {
  const issues: AnalyzerIssue[] = [];
  const subnets = connectedSubnets(state);
  const routedDevices = state.devices.filter((d) => d.isL3 && d.interfaces.some((i) => i.cable));

  for (const dev of routedDevices) {
    const hasDefault = !!defaultRouteOf(dev);

    // ── Missing route / default route ───────────────────────────
    const localNets = new Set<string>();
    for (const r of dev.routes) {
      const p = parseCidr(r.dst);
      if (!p) continue;
      const mask = (0xffffffff << (32 - p.prefix)) >>> 0;
      localNets.add(`${intToIp(ipInt(p.address) & mask)}/${p.prefix}`);
    }
    const uncovered = subnets.find((s) => !localNets.has(s));
    if (!hasDefault && uncovered) {
      issues.push({
        id: `routing-missing-${dev.nodeId}`,
        category: 'routing',
        severity: 'warning',
        title: 'Default Route Missing',
        rootCause: `${dev.name} tidak memiliki rute menuju jaringan ${uncovered} dan tidak punya default route (0.0.0.0/0).`,
        evidence: [`Tabel route ${dev.name} tidak mencakup ${uncovered}`, 'Default Route Missing'],
        affectedDeviceId: dev.nodeId,
        affectedDeviceName: dev.name,
        recommendation: `Tambahkan rute statis ke ${uncovered} atau default route via gateway segmen.`,
        commands: [],
        confidence: 0.93,
        fixKey: 'default-route',
        params: { dst: uncovered },
      });
    }

    // ── Wrong gateway ───────────────────────────────────────────
    for (const r of dev.routes) {
      if (r.kind === 'connected' || !r.gateway) continue;
      if (gatewayReachable(dev, r.gateway)) continue;
      const gwDev = state.byIp.get(r.gateway);
      if (gwDev && !gwDev.powered) {
        issues.push({
          id: `routing-gw-down-${dev.nodeId}-${r.dst}`,
          category: 'routing',
          severity: 'critical',
          title: 'Gateway Mati (Power Off)',
          rootCause: `Route ${r.dst} via ${r.gateway} menunjuk ke ${gwDev.name} yang sedang mati.`,
          evidence: [`Route ${r.dst} → ${r.gateway}`, `${gwDev.name} powered=false`],
          affectedDeviceId: dev.nodeId,
          affectedDeviceName: dev.name,
          recommendation: 'Nyalakan gateway, atau arahkan route ke gateway lain.',
          commands: [],
          confidence: 0.97,
          fixKey: 'wrong-gateway',
          params: { dst: r.dst, gateway: r.gateway },
        });
      } else {
        issues.push({
          id: `routing-gw-wrong-${dev.nodeId}-${r.dst}`,
          category: 'routing',
          severity: 'critical',
          title: 'Wrong Gateway',
          rootCause: `Route ${r.dst} via ${r.gateway} tetapi gateway tersebut tidak berada di subnet yang terhubung langsung dengan ${dev.name}.`,
          evidence: [`Route ${r.dst} via ${r.gateway}`, 'Gateway tidak L2-reachable dari device ini'],
          affectedDeviceId: dev.nodeId,
          affectedDeviceName: dev.name,
          recommendation: 'Perbaiki gateway route ke alamat yang satu segmen dengan interface device.',
          commands: [],
          confidence: 0.95,
          fixKey: 'wrong-gateway',
          params: { dst: r.dst, gateway: r.gateway },
        });
      }
    }

    // ── Routing loop (DFS pada graf gateway) ────────────────────
    const loop = findLoop(dev, state);
    if (loop) {
      issues.push({
        id: `routing-loop-${dev.nodeId}`,
        category: 'routing',
        severity: 'critical',
        title: 'Routing Loop',
        rootCause: `Terjadi loop rute: ${loop.join(' → ')}. Paket akan berputar hingga TTL habis.`,
        evidence: [`Routing Loop: ${loop.join(' → ')}`, 'TTL Expired'],
        affectedDeviceId: dev.nodeId,
        affectedDeviceName: dev.name,
        recommendation: 'Hapus rute yang saling menunjuk; pastikan gateway menunjuk ke next-hop yang benar.',
        commands: [],
        confidence: 0.96,
        fixKey: 'loop',
        params: { path: loop.join(' -> ') },
      });
    }
  }

  return issues;
}

/** Deteksi siklus pada graf next-hop mulai dari device tertentu. */
function findLoop(start: DeviceState, state: NetworkState): string[] | null {
  const visited = new Set<string>();
  const stack: DeviceState[] = [];

  const dfs = (dev: DeviceState, path: string[]): string[] | null => {
    if (path.includes(dev.name)) {
      const i = path.indexOf(dev.name);
      return path.slice(i).concat(dev.name);
    }
    if (visited.has(dev.nodeId)) return null;
    visited.add(dev.nodeId);
    const next = nextHopDevice(dev, state);
    if (!next) return null;
    const res = dfs(next, path.concat(dev.name));
    if (res) return res;
    visited.delete(dev.nodeId);
    return null;
  };

  return dfs(start, []);
}

function nextHopDevice(dev: DeviceState, state: NetworkState): DeviceState | null {
  for (const r of dev.routes) {
    if (r.kind === 'connected' || !r.gateway) continue;
    const d = state.byIp.get(r.gateway);
    if (d && d !== dev) return d;
  }
  return null;
}
