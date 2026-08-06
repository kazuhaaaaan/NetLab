// ============================================================
// StpService — komputasi Spanning Tree (STP/RSTP) konvergen.
// Menghitung root bridge (prioritas + MAC terendah), root port,
// designated & alternate port pada graf switch-to-switch.
// Hasil ditulis ke device.stpPorts / device.stpState agar
// SwitchProcessor dapat mem-blokir port alternate.
// ============================================================

import { NetworkDevice } from '../devices/NetworkDevice';
import { LinkTable } from '../core/Topology';

export type StpMode = 'stp' | 'rstp' | 'mst' | 'pvst' | 'rapid-pvst';

export interface StpConfig {
  enabled: boolean;
  priority: number;
  mode: StpMode;
}

export interface StpPortState {
  role: 'root' | 'designated' | 'alternate' | 'disabled';
  state: 'forwarding' | 'blocking' | 'disabled';
  cost: number;
}

export interface StpBridgeState {
  rootId: string;
  rootName: string;
  bridgeId: string;
  priority: number;
  mode: StpMode;
  rootPort: string | null;
  ports: Map<string, StpPortState>;
}

export const DEFAULT_STP_PRIORITY = 32768;
export const DEFAULT_STP_MODE: StpMode = 'rstp';

export function stpConfigOf(dev: NetworkDevice): StpConfig {
  return dev.stpConfig;
}

/** Bridge ID: 4 hex digit prioritas + 12 hex digit MAC. */
export function bridgeIdOf(dev: NetworkDevice): string {
  const prio = (dev.stpConfig.priority & 0xffff).toString(16).padStart(4, '0');
  const mac = dev.getInterfaces().find((i) => i.mac)?.mac || '';
  const macHex = mac.replace(/[^0-9a-fA-F]/g, '').toLowerCase().padEnd(12, '0');
  return `${prio}${macHex}`;
}

/** Biaya port STP (802.1D) berdasarkan kecepatan link. */
export function stpPortCost(speedMbps: number): number {
  if (speedMbps >= 10000) return 2;
  if (speedMbps >= 1000) return 4;
  if (speedMbps >= 100) return 19;
  return 100;
}

interface SwitchEdge {
  aId: string;
  bId: string;
  aPort: string;
  bPort: string;
  aCost: number;
  bCost: number;
}

export function computeStp(
  devices: NetworkDevice[],
  links: LinkTable,
  isPowered: (id: string) => boolean
): Map<string, StpBridgeState> {
  const byId = new Map(devices.map((d) => [d.id, d]));
  const out = new Map<string, StpBridgeState>();

  // Switch yang STP-nya aktif & menyala.
  const active = devices.filter((d) => d.isSwitch && d.stpConfig.enabled && isPowered(d.id));

  // Edge hanya antar switch aktif (STP berjalan di segmen switch).
  const edges: SwitchEdge[] = [];
  const edgeByPort = new Map<string, SwitchEdge>();
  for (const link of links.all) {
    const a = byId.get(link.a.nodeId);
    const b = byId.get(link.b.nodeId);
    if (!a || !b || !a.isSwitch || !b.isSwitch) continue;
    if (!active.includes(a) || !active.includes(b)) continue;
    const aIface = a.getIfaceByPortId(link.a.port);
    const bIface = b.getIfaceByPortId(link.b.port);
    if (!aIface || !aIface.up || !bIface || !bIface.up) continue;
    const edge: SwitchEdge = {
      aId: a.id,
      bId: b.id,
      aPort: link.a.port,
      bPort: link.b.port,
      aCost: stpPortCost(aIface.speedMbps || 1000),
      bCost: stpPortCost(bIface.speedMbps || 1000),
    };
    edges.push(edge);
    edgeByPort.set(`${a.id}|${link.a.port}`, edge);
    edgeByPort.set(`${b.id}|${link.b.port}`, edge);
  }

  const bidOf = (id: string): string => bridgeIdOf(byId.get(id)!);
  const rootId = active.length > 0 ? [...active].sort((x, y) => bidOf(x.id).localeCompare(bidOf(y.id)))[0].id : null;

  // Dijkstra: biaya terakumulasi = jumlah biaya root port di jalur.
  const dist = new Map<string, number>();
  const parent = new Map<string, SwitchEdge>();
  const rootPortOf = new Map<string, string>();
  if (rootId) {
    dist.set(rootId, 0);
    const pending = new Set(active.map((d) => d.id));
    while (pending.size > 0) {
      let cur: string | null = null;
      let curDist = Infinity;
      for (const id of pending) {
        const d = dist.get(id) ?? Infinity;
        if (d < curDist) {
          curDist = d;
          cur = id;
        }
      }
      if (cur === null || curDist === Infinity) break;
      pending.delete(cur);
      for (const e of edges) {
        if (e.aId !== cur && e.bId !== cur) continue;
        const otherId = e.aId === cur ? e.bId : e.aId;
        if (!pending.has(otherId)) continue;
        const costOnOther = e.aId === cur ? e.bCost : e.aCost;
        const alt = curDist + costOnOther;
        if (alt < (dist.get(otherId) ?? Infinity)) {
          dist.set(otherId, alt);
          parent.set(otherId, e);
          rootPortOf.set(otherId, e.aId === otherId ? e.aPort : e.bPort);
        }
      }
    }
  }

  // Per-interface final: nama interface → state (pakai portId sebagai kunci).
  for (const dev of active) {
    const state: StpBridgeState = {
      rootId: rootId ? bidOf(rootId) : '-',
      rootName: rootId ? byId.get(rootId)!.name : '-',
      bridgeId: bidOf(dev.id),
      priority: dev.stpConfig.priority,
      mode: dev.stpConfig.mode,
      rootPort: rootId === dev.id ? null : (rootPortOf.get(dev.id) || null),
      ports: new Map(),
    };
    for (const iface of dev.getInterfaces()) {
      if (iface.type === 'vlan') continue;
      if (!iface.up) {
        state.ports.set(iface.portId, { role: 'disabled', state: 'disabled', cost: 0 });
        continue;
      }
      const edge = edgeByPort.get(`${dev.id}|${iface.portId}`);
      if (!edge) {
        // Port ke host/router → designated & forwarding.
        state.ports.set(iface.portId, { role: 'designated', state: 'forwarding', cost: stpPortCost(iface.speedMbps || 1000) });
        continue;
      }
      const otherId = edge.aId === dev.id ? edge.bId : edge.aId;
      const mySide = edge.aId === dev.id ? 'a' : 'b';
      const myPortId = mySide === 'a' ? edge.aPort : edge.bPort;
      const myCost = mySide === 'a' ? edge.aCost : edge.bCost;
      const isRootPort = rootPortOf.get(dev.id) === iface.portId;

      if (parent.get(dev.id) === edge && isRootPort) {
        // Sisi anak: root port → forwarding.
        state.ports.set(iface.portId, { role: 'root', state: 'forwarding', cost: myCost });
        continue;
      }
      if (parent.get(otherId) === edge) {
        // Sisi orang tua dari edge di pohon → designated.
        state.ports.set(iface.portId, { role: 'designated', state: 'forwarding', cost: myCost });
        continue;
      }
      // Edge non-pohon (loop) → bandingkan (dist, bridgeId, portId).
      const myDist = dist.get(dev.id) ?? Infinity;
      const otherDist = dist.get(otherId) ?? Infinity;
      const myTuple = `${String(myDist).padStart(8, '0')}|${bidOf(dev.id)}|${myPortId}`;
      const otherTuple = `${String(otherDist).padStart(8, '0')}|${bidOf(otherId)}|${edge.aId === otherId ? edge.aPort : edge.bPort}`;
      if (myTuple < otherTuple) {
        state.ports.set(iface.portId, { role: 'designated', state: 'forwarding', cost: myCost });
      } else {
        state.ports.set(iface.portId, { role: 'alternate', state: 'blocking', cost: myCost });
      }
    }
    out.set(dev.id, state);
  }

  // Switch non-aktif (STP dimatikan) → semua port forwarding.
  for (const dev of devices) {
    if (out.has(dev.id)) continue;
    if (!dev.isSwitch) continue;
    const state: StpBridgeState = {
      rootId: '-',
      rootName: '-',
      bridgeId: bridgeIdOf(dev),
      priority: dev.stpConfig.priority,
      mode: dev.stpConfig.mode,
      rootPort: null,
      ports: new Map(),
    };
    for (const iface of dev.getInterfaces()) {
      if (iface.type === 'vlan') continue;
      if (!iface.up) state.ports.set(iface.portId, { role: 'disabled', state: 'disabled', cost: 0 });
      else state.ports.set(iface.portId, { role: 'designated', state: 'forwarding', cost: stpPortCost(iface.speedMbps || 1000) });
    }
    out.set(dev.id, state);
  }

  return out;
}

/** True bila port perangkat boleh mem-forward frame (STP). */
export function isPortForwarding(dev: NetworkDevice, portId: string): boolean {
  const s = dev.stpPorts.get(portId);
  if (!s) return true;
  return s.state === 'forwarding';
}
