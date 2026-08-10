// ============================================================
// DhcpService — DORA (Discover/Offer/Request/Ack), lease, renew, release
// ============================================================

import { NetworkDevice } from '../devices/NetworkDevice';
import { DhcpPool, NetLease } from '../core/types';
import { intToIp, ipToInt, networkOf, parseCidr } from '../core/ip';

export interface LeaseGrant {
  ip: string;
  gateway: string;
  prefix: number;
  poolNodeId: string;
}

const LEASE_DURATION_MS = 24 * 60 * 60 * 1000;

/** Pool pada server yang dapat melayani segmen (inPort) ini. */
export function findServingPool(server: NetworkDevice, inPort: string): DhcpPool | null {
  const inIface = server.getIfaceByPortId(inPort) || server.getIfaceByName(inPort);
  const portName = inIface?.name || inPort;
  for (const pool of server.dhcpPools) {
    if (pool.iface && pool.iface !== portName) continue;
    if (pool.iface) return pool;
    if (pool.network) {
      const parsed = parseCidr(pool.network);
      if (!parsed) continue;
      // router harus punya interface di subnet pool tsb
      const facing = server.getInterfaces().find(
        (i) => i.ip && i.up && networkOf(i.ip.address, i.ip.prefix) === networkOf(parsed.address, i.ip.prefix)
      );
      if (!facing) continue;
      return pool;
    }
    if (pool.range) return pool;
  }
  return null;
}

/** Pilih IP pertama yang bebas dari pool (range / network). */
export function allocateIp(
  server: NetworkDevice,
  pool: DhcpPool,
  usedIps: Set<string>
): { ip: string; prefix: number; gateway: string } | null {
  const serverIface = pool.iface ? server.getIfaceByName(pool.iface) : null;
  // Prefix dari pool.network, fallback prefix interface server, terakhir /24.
  const poolPrefix = pool.network ? parseCidr(pool.network)?.prefix : undefined;
  const prefix = poolPrefix ?? serverIface?.ip?.prefix ?? 24;
  const gateway = pool.gateway || serverIface?.ip?.address || '';

  if (pool.range) {
    const m = pool.range.match(/(\d+\.\d+\.\d+\.\d+)\s*-\s*(\d+\.\d+\.\d+\.\d+)/);
    if (m) {
      const start = ipToInt(m[1]);
      const end = ipToInt(m[2]);
      for (let n = start; n <= end; n++) {
        const ip = intToIp(n);
        if (ip === gateway || usedIps.has(ip)) continue;
        return { ip, prefix, gateway };
      }
      return null;
    }
    const single = pool.range.trim();
    if (single !== gateway && !usedIps.has(single)) {
      return { ip: single, prefix, gateway };
    }
    return null;
  }

  if (pool.network) {
    const parsed = parseCidr(pool.network);
    if (!parsed) return null;
    const base = networkOf(parsed.address, parsed.prefix);
    const facing =
      serverIface ||
      server.getInterfaces().find(
        (i) => i.ip && i.up && networkOf(i.ip.address, i.ip.prefix) === networkOf(parsed.address, i.ip.prefix)
      );
    const gw = gateway || facing?.ip?.address || '';
    // Jumlah host valid per prefix: /31 → 2 (point-to-point), /32 → 0,
    // lainnya network & broadcast tidak boleh dilease.
    const hostBits = 32 - parsed.prefix;
    if (hostBits < 1) return null;
    const first = hostBits === 1 ? 0 : 1;
    const last = hostBits === 1 ? 1 : 2 ** hostBits - 2;
    for (let n = base + first; n <= base + last; n++) {
      const ip = intToIp(n);
      if (ip === gw || usedIps.has(ip)) continue;
      return { ip, prefix: parsed.prefix, gateway: gw };
    }
    return null;
  }

  return null;
}

export function buildLease(
  clientIface: string,
  grant: LeaseGrant,
  now: number
): NetLease {
  return {
    ip: grant.ip,
    gateway: grant.gateway,
    prefix: grant.prefix,
    poolNodeId: grant.poolNodeId,
    iface: clientIface,
    expiresAt: now + LEASE_DURATION_MS,
  };
}

export function isLeaseActive(lease: NetLease, now: number): boolean {
  return now < lease.expiresAt;
}
