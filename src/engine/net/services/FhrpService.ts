// ============================================================
// FhrpService — komputasi First Hop Redundancy (VRRP-style).
// Sekelompok perangkat dengan virtual IP sama memilih satu master
// (perangkat menyala + prioritas tertinggi; tie-break id terkecil).
// Hanya master yang "memiliki" virtual IP; jika master mati,
// recompute memindahkan virtual IP ke backup — host yang mem-ping
// virtual IP tetap terlayani tanpa perubahan konfigurasi.
// ============================================================

import { NetworkDevice } from '../devices/NetworkDevice';

export interface FhrpGroup {
  /** alamat virtual, mis. '192.168.1.254/24' */
  virtualAddress: string;
  /** interface tempat VRRP aktif (opsional; fallback interface pertama) */
  interface?: string;
  /** Virtual Router ID (opsional, untuk display) */
  vrid?: number;
  /** prioritas 1–255, default 100 — lebih tinggi menang */
  priority: number;
  /** interval advertisement ms (opsional, untuk display) */
  interval?: number;
}

export interface FhrpState {
  /** alamat virtual lengkap ('192.168.1.254/24') */
  virtualAddress: string;
  /** bagian IP saja ('192.168.1.254') */
  vip: string;
  isMaster: boolean;
  masterNodeId: string;
  masterName: string;
  priority: number;
  interface?: string;
  vrid?: number;
}

export interface FhrpResult {
  /** per nodeId → daftar state group yang diikuti perangkat */
  states: Map<string, FhrpState[]>;
  /** virtual IP → nodeId master saat ini */
  masters: Map<string, string>;
}

export const DEFAULT_FHRP_PRIORITY = 100;

/** Komputasi pemilihan master untuk semua grup FHRP yang terkonfigurasi. */
export function computeFhrp(
  devices: NetworkDevice[],
  groupsByNode: Map<string, FhrpGroup[]>,
  powered: (nodeId: string) => boolean
): FhrpResult {
  const membersByVip = new Map<string, { nodeId: string; dev: NetworkDevice; group: FhrpGroup }[]>();

  for (const [nodeId, groups] of groupsByNode) {
    if (!powered(nodeId)) continue;
    const dev = devices.find((d) => d.id === nodeId);
    if (!dev) continue;
    for (const g of groups) {
      const vip = (g.virtualAddress || '').trim().split('/')[0];
      if (!vip) continue;
      const arr = membersByVip.get(vip) || [];
      arr.push({ nodeId, dev, group: g });
      membersByVip.set(vip, arr);
    }
  }

  const states = new Map<string, FhrpState[]>();
  const masters = new Map<string, string>();

  for (const dev of devices) dev.virtualIps = [];

  for (const [vip, members] of membersByVip) {
    members.sort(
      (a, b) =>
        (b.group.priority ?? DEFAULT_FHRP_PRIORITY) -
          (a.group.priority ?? DEFAULT_FHRP_PRIORITY) ||
        a.nodeId.localeCompare(b.nodeId)
    );
    const master = members[0];
    masters.set(vip, master.nodeId);
    master.dev.virtualIps.push(vip);

    for (const m of members) {
      const isMaster = m.nodeId === master.nodeId;
      const arr = states.get(m.nodeId) || [];
      arr.push({
        virtualAddress: m.group.virtualAddress,
        vip,
        isMaster,
        masterNodeId: master.nodeId,
        masterName: master.dev.name,
        priority: m.group.priority ?? DEFAULT_FHRP_PRIORITY,
        interface: m.group.interface,
        vrid: m.group.vrid,
      });
      states.set(m.nodeId, arr);
    }
  }

  return { states, masters };
}