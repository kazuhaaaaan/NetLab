// ============================================================
// DnsService — resolver + static records per device
// ============================================================

import { NetworkDevice } from '../devices/NetworkDevice';

export interface DnsOutcome {
  resolved: string | null;
  server?: string;
  timedOut?: boolean;
  nxdomain?: boolean;
}

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

/** Resolusi sesuai perilaku perangkat: record lokal dulu, lalu server DNS. */
export function resolve(
  device: NetworkDevice,
  name: string,
  deviceById: (ip: string) => NetworkDevice | null,
  isPowered: (id: string) => boolean
): DnsOutcome {
  const local = staticRecord(device, name);
  if (local) return { resolved: local, server: 'self' };

  if (device.dnsServers.length === 0) return { resolved: null, timedOut: true };

  for (const srvIp of device.dnsServers) {
    const srv = deviceById(srvIp);
    if (!srv || !isPowered(srv.id)) continue;
    const rec = staticRecord(srv, name);
    if (rec) return { resolved: rec, server: srvIp };
  }
  return { resolved: null, nxdomain: true };
}
