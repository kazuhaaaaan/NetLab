/**
 * Resolver facade — ping, show interfaces, show routes.
 *
 * Bila bridge tersedia, hasilnya dari engine nyata (NetworkSimulator) agar
 * konsisten dengan terminal. Tanpa bridge, ada fallback murni dari
 * DeviceState (self-ping, route match, format tabel vendor).
 */

import type { NetLabBridge } from './bridge';
import type { DeviceState } from './DeviceState';
import type { RouteEntry } from './DeviceState';
import type { TopologyState } from './TopologyState';

/** Hasil resolusi ping. */
export interface PingResolution {
  success: boolean;
  hops: string[];
  latency: number;
  reason?: string;
}

/** Apakah CIDR (dst) mengandung IP tujuan. */
export function cidrContains(cidr: string, ip: string): boolean {
  const [net, prefixStr] = cidr.split('/');
  if (!net || !prefixStr) return net === ip;
  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return net === ip;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const ipInt = ipv4ToInt(ip);
  const netInt = ipv4ToInt(net);
  if (ipInt === null || netInt === null) return false;
  return (ipInt & mask) === (netInt & mask);
}

/** IPv4 string → integer (null bila bukan IPv4 valid). */
export function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let out = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!/^\d+$/.test(part) || n < 0 || n > 255) return null;
    out = (out << 8) | n;
  }
  return out >>> 0;
}

/**
 * Resolusi ping dari perangkat asal ke IP tujuan.
 *
 * Dengan bridge → hop-by-hop nyata dari NetworkSimulator. Fallback murni:
 * ping diri sendiri, atau lewat gateway route pertama yang cocok.
 */
export function resolvePing(
  bridge: NetLabBridge | null,
  state: TopologyState,
  fromDeviceId: string,
  targetIp: string
): PingResolution {
  if (bridge) {
    const result = bridge.simulatePing(fromDeviceId, targetIp);
    const hops = result.path || [];
    const latency = result.rttMs ?? hops.length * 1 + (hops.length > 1 ? 5 : 0);
    return { success: result.success, hops, latency, reason: result.reason };
  }

  const device = state.devices.get(fromDeviceId);
  if (!device) {
    return { success: false, hops: [], latency: 0, reason: 'device-not-found' };
  }
  if (device.interfaces.some((i) => i.ip === targetIp)) {
    return { success: true, hops: [device.hostname], latency: 1, reason: 'self' };
  }
  const route = device.routes.find((r) => cidrContains(r.dst, targetIp));
  if (route && route.gateway) {
    return { success: true, hops: [device.hostname, route.gateway], latency: 6, reason: 'via-gateway' };
  }
  return { success: false, hops: [device.hostname], latency: 1, reason: 'unreachable' };
}

/** Konteks dispatch minimal dari DeviceState (untuk engine nyata). */
export function bridgeContext(device: DeviceState): Record<string, unknown> {
  return {
    nodeId: device.id,
    name: device.hostname,
    ports: device.interfaces.map((i) => ({ id: i.name, name: i.name })),
    portLinks: {},
  };
}

/** Format MikroTik: tabel kolom interface (fallback murni). */
function formatMikroTikInterfaces(device: DeviceState): string {
  const rows = device.interfaces.map((i, idx) => {
    const flags = i.disabled ? 'X' : '';
    const link = i.disabled ? 'down' : 'up';
    return `  ${idx.toString().padStart(2)}  ${i.name.padEnd(28)} ether     ${link.padEnd(4)} ${i.mac}${i.ip ? '  (' + i.ip + (i.prefix ? '/' + i.prefix : '') + ')' : ''}`;
  });
  return `Flags: X - disabled, R - running\n  #   NAME                            TYPE     LINK  MAC-ADDRESS\n${rows.join('\n')}`;
}

/** Format Cisco: 'is up, line protocol is up' (fallback murni). */
function formatCiscoInterfaces(device: DeviceState): string {
  return device.interfaces
    .map((i) => {
      const op = i.disabled ? 'administratively down' : 'up';
      const proto = i.disabled ? 'down' : 'up';
      const ipLine = i.ip ? `   Internet address is ${i.ip}${i.prefix ? '/' + i.prefix : ''}` : '   Internet protocol processing: disabled';
      return `${i.name} is ${op}, line protocol is ${proto}\n  Hardware is netlab, address is ${i.mac}\n${ipLine}`;
    })
    .join('\n\n');
}

/**
 * Output 'show interfaces' — dari engine nyata bila bridge ada, fallback murni selainnya.
 */
export function resolveShowInterfaces(
  bridge: NetLabBridge | null,
  state: TopologyState,
  deviceId: string,
  vendor: 'mikrotik' | 'cisco'
): string {
  const device = state.devices.get(deviceId);
  if (!device) return '';
  if (bridge) {
    const raw = vendor === 'mikrotik' ? '/interface print' : 'show interfaces';
    return bridge.dispatch(vendor, raw, bridgeContext(device));
  }
  return vendor === 'mikrotik' ? formatMikroTikInterfaces(device) : formatCiscoInterfaces(device);
}

/** Kode tipe route per vendor (Cisco style). */
function routeCode(type: RouteEntry['type']): string {
  switch (type) {
    case 'connected':
      return 'C';
    case 'ospf':
      return 'O';
    case 'bgp':
      return 'B';
    default:
      return 'S';
  }
}

/** Format MikroTik: tabel route (fallback murni). */
function formatMikroTikRoutes(device: DeviceState): string {
  const rows = device.routes.map(
    (r, idx) =>
      `  ${idx.toString().padStart(2)}  ${r.dst.padEnd(18)} ${r.gateway.padEnd(16)} 0       ${r.interface}`
  );
  return `Flags: X - disabled, A - active, D - dynamic, S - static\n  #   DST-ADDRESS        GATEWAY            DISTANCE  INTERFACE\n${rows.join('\n')}`;
}

/** Format Cisco: tabel route (fallback murni). */
function formatCiscoRoutes(device: DeviceState): string {
  const rows = device.routes.map(
    (r) => `${routeCode(r.type)}    ${r.dst} [1/0] via ${r.gateway}, ${r.interface}`
  );
  return `Codes: C - connected, S - static, O - OSPF, B - BGP\n${rows.join('\n')}`;
}

/**
 * Output 'show ip route' — dari engine nyata bila bridge ada, fallback selainnya.
 */
export function resolveShowRoutes(
  bridge: NetLabBridge | null,
  state: TopologyState,
  deviceId: string,
  vendor: 'mikrotik' | 'cisco'
): string {
  const device = state.devices.get(deviceId);
  if (!device) return '';
  if (bridge) {
    const raw = vendor === 'mikrotik' ? '/ip route print' : 'show ip route';
    return bridge.dispatch(vendor, raw, bridgeContext(device));
  }
  return vendor === 'mikrotik' ? formatMikroTikRoutes(device) : formatCiscoRoutes(device);
}