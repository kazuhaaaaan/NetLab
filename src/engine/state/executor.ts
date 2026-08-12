/**
 * Executor facade — memetakan CommandObject → mutasi DeviceState (cermin murni).
 *
 * Output terminal TIDAK dihasilkan di sini; itu tetap dari engine nyata lewat
 * bridge (lihat runCliCommand di src/engine/index.ts). Executor hanya
 * mengklasifikasikan aksi dan menghitung state cermin berikutnya secara
 * immutabel — murni, tanpa efek samping.
 */

import type { CommandObject } from '../cli/types';
import type { DeviceState } from './DeviceState';
import {
  setInterfaceIp,
  setInterfaceDisabled,
  setHostname,
  addRoute,
  setMode,
} from './DeviceState';
import type { TopologyState } from './TopologyState';

/** Aksi yang memutasi state cermin (show/ping/enable tidak memutasi). */
const MUTATING_ACTIONS = new Set([
  'ADD_IP_ADDRESS',
  'SET_INTERFACE_STATE',
  'ADD_ROUTE',
  'SET_HOSTNAME',
  'ENABLE_MODE',
  'CONFIG_MODE',
  'ENTER_INTERFACE',
]);

/** Aksi yang hanya mengubah mode/context (bukan konfigurasi port). */
const MODE_ACTIONS = new Set(['ENABLE_MODE', 'CONFIG_MODE', 'ENTER_INTERFACE']);

/** Konversi netmask desimal (255.255.255.0) → prefix (24). */
export function maskToPrefix(mask: string): number {
  const bits = mask.split('.').map((o) => {
    const n = Number(o);
    if (!Number.isInteger(n) || n < 0 || n > 255) return -1;
    let count = 0;
    for (let bit = 7; bit >= 0; bit--) if ((n >> bit) & 1) count++;
    return count;
  });
  if (bits.some((b) => b < 0)) return 0;
  return bits.reduce((a, b) => a + b, 0);
}

/** Interface target dari params (mikrotik) atau context mode (cisco). */
function targetInterface(device: DeviceState, cmd: CommandObject): string | undefined {
  const fromParams = cmd.params['interface'];
  if (fromParams) return fromParams;
  return device.activeInterface || device.interfaces[0]?.name;
}

/** Mutator per aksi — menerima state saat ini, mengembalikan state baru. */
type Mutator = (device: DeviceState, cmd: CommandObject) => DeviceState;

const MUTATORS: Partial<Record<string, Mutator>> = {
  ADD_IP_ADDRESS: (device, cmd) => {
    const iface = targetInterface(device, cmd);
    if (!iface) return device;
    if (cmd.vendor === 'mikrotik') {
      return setInterfaceIp(device, iface, cmd.params['address'] || '');
    }
    // Cisco: address + mask (netmask → prefix).
    const address = cmd.params['address'] || '';
    const mask = cmd.params['mask'] || '';
    if (!address) return device;
    const prefix = maskToPrefix(mask);
    const cidr = prefix > 0 ? `${address}/${prefix}` : address;
    return setInterfaceIp(device, iface, cidr);
  },
  SET_INTERFACE_STATE: (device, cmd) => {
    const iface = targetInterface(device, cmd);
    if (!iface) return device;
    // Cisco: hanya "no shutdown" dikenali adapter → disabled=false.
    if (cmd.vendor === 'cisco') {
      if (cmd.params['disabled'] !== 'no') return device;
      return setInterfaceDisabled(device, iface, false);
    }
    // RouterOS: disabled=yes → true; disabled=no → false.
    return setInterfaceDisabled(device, iface, cmd.params['disabled'] !== 'no');
  },
  ADD_ROUTE: (device, cmd) => {
    const dst = cmd.params['dst'] || '';
    const gateway = cmd.params['gateway'] || '';
    if (!dst || !gateway) return device;
    const iface = targetInterface(device, cmd) || '';
    return addRoute(device, { dst, gateway, interface: iface, type: 'static' });
  },
  SET_HOSTNAME: (device, cmd) => setHostname(device, cmd.params['hostname'] || ''),
  ENABLE_MODE: (device) => setMode(device, 'enable'),
  CONFIG_MODE: (device) => setMode(device, 'config'),
  ENTER_INTERFACE: (device, cmd) =>
    setMode(device, 'interface', cmd.params['interface'] || device.activeInterface),
};

/**
 * Mengeksekusi CommandObject terhadap satu perangkat di TopologyState.
 * Mengembalikan state baru + daftar aksi yang memutasi cermin.
 */
export function executeCommand(
  state: TopologyState,
  deviceId: string,
  cmd: CommandObject
): { state: TopologyState; mutated: string[] } {
  const device = state.devices.get(deviceId);
  if (!device || cmd.action === 'UNKNOWN') {
    return { state, mutated: [] };
  }

  const mutator = MUTATORS[cmd.action] as Mutator | undefined;
  if (!mutator || !MUTATING_ACTIONS.has(cmd.action)) {
    return { state, mutated: [] };
  }

  const next = mutator(device, cmd);
  if (next === device) return { state, mutated: [] };

  const isModeOnly = MODE_ACTIONS.has(cmd.action);
  const devices = new Map(state.devices);
  devices.set(deviceId, next);
  return { state: { ...state, devices }, mutated: isModeOnly ? [] : [cmd.action] };
}