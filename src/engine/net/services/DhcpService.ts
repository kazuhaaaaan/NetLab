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
  /** DNS server pool (option 6) yang dikirim ke klien. */
  dnsServers?: string[];
  /** lama lease (ms) sesuai config pool. */
  leaseTimeMs?: number;
}

const LEASE_DURATION_MS = 24 * 60 * 60 * 1000;

/** Pool pada server yang dapat melayani segmen (inPort) ini. */
export function findServingPool(server: NetworkDevice, ifaceOrPort: string): DhcpPool | null {
  // Prioritas nama interface persis (subinterface seperti 'ether1.10' harus
  // menang), lalu resolusi port fisik → nama interface.
  const inIface = server.getIfaceByName(ifaceOrPort) || server.getIfaceByPortId(ifaceOrPort);
  const portName = inIface?.name || ifaceOrPort;
  for (const pool of server.dhcpPools) {
    // Server/pool dinonaktifkan (disabled=yes) tidak melayani lease.
    if (pool.disabled) continue;
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
        if (ip === gateway || usedIps.has(ip) || isExcluded(pool, ip)) continue;
        return { ip, prefix, gateway };
      }
      return null;
    }
    const single = pool.range.trim();
    if (single !== gateway && !usedIps.has(single) && !isExcluded(pool, single)) {
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
      if (ip === gw || usedIps.has(ip) || isExcluded(pool, ip)) continue;
      return { ip, prefix: parsed.prefix, gateway: gw };
    }
    return null;
  }

  return null;
}

/** true bila alamat masuk daftar excluded pool (Cisco excluded-address). */
function isExcluded(pool: DhcpPool, ip: string): boolean {
  const excluded = pool.excluded || [];
  return excluded.includes(ip);
}

export function buildLease(
  clientIface: string,
  grant: LeaseGrant,
  now: number,
  leaseTimeMs?: number
): NetLease {
  return {
    ip: grant.ip,
    gateway: grant.gateway,
    prefix: grant.prefix,
    poolNodeId: grant.poolNodeId,
    iface: clientIface,
    expiresAt: now + (leaseTimeMs || LEASE_DURATION_MS),
  };
}

export function isLeaseActive(lease: NetLease, now: number): boolean {
  return now < lease.expiresAt;
}
