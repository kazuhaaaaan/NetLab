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

  if (pool.range) {
    const m = pool.range.match(/(\d+\.\d+\.\d+\.\d+)\s*-\s*(\d+\.\d+\.\d+\.\d+)/);
    if (m) {
      const start = ipToInt(m[1]);
      const end = ipToInt(m[2]);
      for (let n = start; n <= end; n++) {
        const ip = intToIp(n);
        if (!usedIps.has(ip)) {
          return { ip, prefix: 24, gateway: pool.gateway || serverIface?.ip?.address || '' };
        }
      }
      return null;
    }
    const single = pool.range.trim();
    if (!usedIps.has(single)) {
      return { ip: single, prefix: 24, gateway: pool.gateway || serverIface?.ip?.address || '' };
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
    const gateway = pool.gateway || serverIface?.ip?.address || facing?.ip?.address || '';
    for (let n = base + 2; n < base + 250; n++) {
      const ip = intToIp(n);
      if (ip === gateway || usedIps.has(ip)) continue;
      return { ip, prefix: parsed.prefix, gateway };
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
