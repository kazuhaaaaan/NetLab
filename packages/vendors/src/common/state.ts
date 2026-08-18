// GENERATED — helper state perangkat (diekstraksi dari index.ts lama).

import type { DhcpClient, NodeMemory, VendorContext } from './types';

export interface PortOperational {
  up: boolean;
  label: string;
}

/**
 * Status operasional sebuah port untuk output CLI — gabungan kabel fisik
 * (linkConnected/linkDown dari host App via context.portLinks) dan
 * admin-down (shutdown via CLI).
 *
 * Prinsip: DELETE CABLE ≠ DELETE INTERFACE CONFIG. Port tanpa kabel punya
 * label "not connected" dan tidak up, tetapi konfigurasi interface (IP,
 * VLAN, NAT, dll.) tetap utuh dan tetap muncul di running-config/export.
 */
export function portOperational(p: Record<string, unknown>, shutdownIfaces: string[]): PortOperational {
  const names = new Set((shutdownIfaces || []).map((s: string) => String(s).toLowerCase()));
  if (names.has(String(p.name || '').toLowerCase())) return { up: false, label: 'administratively down' };
  if (p.linkDown) return { up: false, label: 'down' };
  if (p.linkConnected === false) return { up: false, label: 'not connected' };
  if (p.status !== 'up') return { up: false, label: 'down' };
  return { up: true, label: 'up' };
}

export function portLinksOf(context: VendorContext): Record<string, boolean | 'down'> | null {
  const links = context?.portLinks;
  if (!links || typeof links !== 'object') return null;
  if (Array.isArray(links)) {
    // Bentuk array (dari App baru): [{ portId|name, connected, ... }] → peta.
    const map: Record<string, boolean | 'down'> = {};
    for (const l of links) {
      if (!l || typeof l !== 'object') continue;
      const rec = l as Record<string, unknown>;
      const key = String(rec.portId ?? rec.name ?? rec.id ?? '');
      if (!key) continue;
      const connected = rec.connected ?? rec.linkConnected ?? rec.up;
      map[key] = connected === false ? false : connected === 'down' ? 'down' : true;
    }
    return map;
  }
  return links as Record<string, boolean | 'down'>;
}

export function rootIdStr(id: string | undefined): string {
  const hex = String(id || '').replace(/[^0-9a-fA-F]/g, '').toLowerCase().padEnd(12, '0');
  return hex.slice(0, 12);
}

export function fmtMac(hex: string): string {
  return `${String(hex.slice(0, 4))}.${String(hex.slice(4, 8))}.${String(hex.slice(8, 12))}`;
}

export function grantDhcpClient(context: VendorContext, mem: NodeMemory, iface: string, addDefaultRoute: boolean): string {
  if (!mem.dhcpClients) mem.dhcpClients = [];
  let entry = mem.dhcpClients.find((c: DhcpClient) => c.iface === iface);
  if (!entry) {
    entry = { iface, addDefaultRoute, status: 'searching' };
    mem.dhcpClients.push(entry);
  }
  entry.addDefaultRoute = addDefaultRoute;

  const granted = typeof context.dhcpClientGrant === 'function'
    ? context.dhcpClientGrant(iface, addDefaultRoute)
    : null;

  if (granted && granted.ip) {
    entry.status = 'bound';
    entry.ip = granted.ip;
    entry.gateway = granted.gateway || '';
    const cidr = `${String(granted.ip)}/${String(granted.prefix ?? 24)}`;
    mem.configuredIps[iface] = cidr;
    if (
      addDefaultRoute &&
      granted.gateway &&
      !mem.routes.some(
        (r) => r.gateway === granted.gateway && (r.dst === '0.0.0.0/0' || r.dst === '0.0.0.0 0.0.0.0')
      )
    ) {
      mem.routes.push({ dst: '0.0.0.0/0', gateway: granted.gateway, distance: 1 });
    }
    return `% Interface ${String(iface)}: DHCP client bound — lease ${String(cidr)}${granted.gateway ? ` (gateway ${String(granted.gateway)})` : ''}`;
  }

  entry.status = 'unbound';
  delete entry.ip;
  delete entry.gateway;
  return `% Interface ${String(iface)}: DHCP client aktif — menunggu lease (pastikan DHCP server sudah dikonfigurasi di segmen yang sama)`;
}

export function upsertSubinterface(mem: NodeMemory, name: string, parentPort: string, vlanId: number): void {
  if (!mem.subinterfaces) mem.subinterfaces = [];
  const existing = mem.subinterfaces.find((s) => s.name === name);
  if (existing) {
    existing.parentPort = parentPort;
    existing.vlanId = vlanId;
  } else {
    mem.subinterfaces.push({ name, parentPort, vlanId });
  }
}

export function setShutdownState(mem: NodeMemory, ifaceName: string, down: boolean): void {
  if (!ifaceName) return;
  if (!mem.shutdownIfaces) mem.shutdownIfaces = [];
  if (down) {
    if (!mem.shutdownIfaces.includes(ifaceName)) mem.shutdownIfaces.push(ifaceName);
  } else {
    mem.shutdownIfaces = mem.shutdownIfaces.filter((n: string) => n !== ifaceName);
  }
}

export function pushTrunk(mem: NodeMemory, ifaceName: string): void {
  if (!ifaceName) return;
  if (!mem.trunkPorts) mem.trunkPorts = [];
  if (!mem.trunkPorts.includes(ifaceName)) mem.trunkPorts.push(ifaceName);
}

/** Port hasil merge: nama & IP selalu string (bukan unknown). */
export interface MergedPort {
  name: string;
  id?: string;
  ipAddress?: string;
  [key: string]: unknown;
}

export function mergeIps(ports: Array<Record<string, unknown>> | undefined, configuredIps: Record<string, string>): MergedPort[] {
  return (ports || []).map((p: Record<string, unknown>) => {
    const name = String(p.name || '');
    const ipRaw = typeof p.ipAddress === 'string' ? p.ipAddress : '';
    return {
      ...p,
      name,
      ipAddress: configuredIps[name] || ipRaw,
    };
  });
}
