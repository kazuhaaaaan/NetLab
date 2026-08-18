// ============================================================
// DnsService — resolver + static records per device
// ============================================================

import { NetworkDevice } from '../devices/NetworkDevice';
import { isValidIp } from '../core/ip';

export interface DnsOutcome {
  resolved: string | null;
  server?: string;
  timedOut?: boolean;
  nxdomain?: boolean;
  /** nama yang dipakai untuk cache (alias CNAME ter-resolve ke final). */
  cnameChain?: string[];
}

/** TTL cache klien (detik) — NetLab tidak memodelkan TTL per-record dari CLI. */
export const DNS_CACHE_TTL_MS = 300_000;

export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\.$/, '');
}

/** Catatan A-record pada device `self` untuk `name`. */
export function staticRecord(device: NetworkDevice, name: string): string | null {
  const n = normalizeName(name);
  const rec = device.dnsRecords.find(
    (r) => normalizeName(r.name) === n || normalizeName(r.name) === n + '.'
  );
  return rec?.address || null;
}

/** Resolusi chain CNAME lokal: address record yang bukan IP diperlakukan
 *  sebagai alias (CNAME) dan di-resolve berantai (maksimal 5 hop). */
export function resolveLocalChain(device: NetworkDevice, name: string, depth = 0): { ip: string; chain: string[] } | null {
  if (depth > 5) return null;
  const address = staticRecord(device, name);
  if (!address) return null;
  if (isValidIp(address)) return { ip: address, chain: [normalizeName(name)] };
  const next = resolveLocalChain(device, address, depth + 1);
  if (!next) return null;
  return { ip: next.ip, chain: [normalizeName(name), ...next.chain] };
}

/** Resolusi sesuai perilaku perangkat: record lokal dulu, lalu server DNS. */
export function resolve(
  device: NetworkDevice,
  name: string,
  deviceById: (ip: string) => NetworkDevice | null,
  isPowered: (id: string) => boolean
): DnsOutcome {
  const local = resolveLocalChain(device, name);
  if (local) return { resolved: local.ip, server: 'self', cnameChain: local.chain };

  if (device.dnsServers.length === 0) return { resolved: null, timedOut: true };

  for (const srvIp of device.dnsServers) {
    const srv = deviceById(srvIp);
    if (!srv || !isPowered(srv.id)) continue;
    const rec = resolveLocalChain(srv, name);
    if (rec) return { resolved: rec.ip, server: srvIp, cnameChain: rec.chain };
  }
  return { resolved: null, nxdomain: true };
}