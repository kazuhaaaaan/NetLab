// ============================================================
// FhrpService — komputasi First Hop Redundancy (VRRP-style).
// Sekelompok perangkat dengan virtual IP sama memilih satu master
// (perangkat menyala + prioritas tertinggi; tie-break id terkecil).
// Hanya master yang "memiliki" virtual IP; jika master mati,
// recompute memindahkan virtual IP ke backup — host yang mem-ping
// virtual IP tetap terlayani tanpa perubahan konfigurasi.
// ============================================================

import { NetworkDevice } from '../devices/NetworkDevice';
import { LinkTable } from '../core/Topology';

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
  /** MAC virtual VRRP (00:00:5e:00:01:xx) — milik master, dipakai balas ARP untuk VIP. */
  virtualMac?: string;
  /** interval advertisement (ms) — display; protokol disimulasikan via recompute. */
  intervalMs?: number;
}

export interface FhrpResult {
  /** per nodeId → daftar state group yang diikuti perangkat */
  states: Map<string, FhrpState[]>;
  /** virtual IP → nodeId master saat ini */
  masters: Map<string, string>;
}

export const DEFAULT_FHRP_PRIORITY = 100;

/** MAC virtual VRRP: 00:00:5e:00:01:xx (xx = vrid, default 1). */
export function vrrpVirtualMac(vrid: number | undefined): string {
  const v = Math.max(1, Math.min(255, Math.round(vrid ?? 1)));
  return `00:00:5e:00:01:${v.toString(16).padStart(2, '0')}`;
}

/** Clamp prioritas VRRP ke rentang sah 1–255 (0 reserved). */
function clampPriority(p: number | undefined): number {
  const v = Math.round(p ?? DEFAULT_FHRP_PRIORITY);
  return Math.max(1, Math.min(255, Number.isFinite(v) ? v : DEFAULT_FHRP_PRIORITY));
}

/**
 * Komputasi pemilihan master untuk semua grup FHRP yang terkonfigurasi.
 * Grup di-*key* per (VIP, segmen L2, vrid) — dua router dengan VIP sama
 * di segmen yang berbeda (switch berbeda / link P2P berbeda) TIDAK saling
 * berebut menjadi satu master global.
 */
export function computeFhrp(
  devices: NetworkDevice[],
  groupsByNode: Map<string, FhrpGroup[]>,
  powered: (nodeId: string) => boolean,
  links?: LinkTable
): FhrpResult {
  const membersByKey = new Map<string, { nodeId: string; dev: NetworkDevice; group: FhrpGroup }[]>();

  const isSwitch = (id: string) => devices.find((d) => d.id === id)?.isSwitch ?? false;
  /** Kunci segmen L2 tempat interface berada: cloud (lewat switch) / ptp / none. */
  const segOf = (nodeId: string, ifaceName: string | undefined): string => {
    if (!ifaceName || !links) return 'noiface';
    const link = links.linkOn(nodeId, ifaceName) || links.linkOn(nodeId, ifaceName.toLowerCase());
    if (!link) return `none:${nodeId}:${ifaceName}`;
    const aSw = isSwitch(link.a.nodeId);
    const bSw = isSwitch(link.b.nodeId);
    if (aSw || bSw) return `cloud:${aSw ? link.a.nodeId : link.b.nodeId}`;
    return `ptp:${link.id}`;
  };

  for (const [nodeId, groups] of groupsByNode) {
    if (!powered(nodeId)) continue;
    const dev = devices.find((d) => d.id === nodeId);
    if (!dev) continue;
    for (const g of groups) {
      const vip = (g.virtualAddress || '').trim().split('/')[0];
      if (!vip) continue;
      // Interface grup down → perangkat tidak layak jadi master.
      const ifaceName = g.interface || dev.getInterfaces().find((i) => i.up)?.name;
      const iface = ifaceName ? dev.getIfaceByName(ifaceName) : null;
      if (iface && !iface.up) continue;
      const key = `${vip}|${segOf(nodeId, g.interface)}|${g.vrid ?? ''}`;
      const arr = membersByKey.get(key) || [];
      arr.push({ nodeId, dev, group: g });
      membersByKey.set(key, arr);
    }
  }

  const states = new Map<string, FhrpState[]>();
  const masters = new Map<string, string>();

  for (const dev of devices) {
    dev.virtualIps = [];
    dev.virtualMacs.clear();
  }

  for (const [key, members] of membersByKey) {
    members.sort(
      (a, b) =>
        clampPriority(b.group.priority) - clampPriority(a.group.priority) ||
        a.nodeId.localeCompare(b.nodeId)
    );
    const master = members[0];
    const vip = key.split('|')[0];
    masters.set(vip, master.nodeId);
    master.dev.virtualIps.push(vip);
    // MAC virtual VRRP — master balas ARP untuk VIP dengan MAC ini
    // (bukan MAC fisik interface), persis perilaku VRRP nyata.
    const vmac = vrrpVirtualMac(master.group.vrid);
    master.dev.virtualMacs.set(vip, vmac);

    for (const m of members) {
      const isMaster = m.nodeId === master.nodeId;
      const arr = states.get(m.nodeId) || [];
      arr.push({
        virtualAddress: m.group.virtualAddress,
        vip,
        isMaster,
        masterNodeId: master.nodeId,
        masterName: master.dev.name,
        priority: clampPriority(m.group.priority),
        interface: m.group.interface,
        vrid: m.group.vrid,
        virtualMac: isMaster ? vmac : undefined,
        intervalMs: m.group.interval,
      });
      states.set(m.nodeId, arr);
    }
  }

  return { states, masters };
}