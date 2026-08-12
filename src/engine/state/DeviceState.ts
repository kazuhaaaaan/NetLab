/**
 * DeviceState — model state per-perangkat untuk facade NetLab.
 *
 * Ini cermin (mirror) ringan dari state engine nyata: executor memperbaruinya
 * dari CommandObject, resolver membacanya untuk fallback murni. Semua update
 * immutabel (mengembalikan objek baru).
 */

/** Satu interface perangkat. */
export interface InterfaceState {
  name: string;
  ip?: string;
  prefix?: number;
  mac: string;
  disabled: boolean;
  connectedTo?: string;
}

/** Satu entri tabel routing. */
export interface RouteEntry {
  dst: string;
  gateway: string;
  interface: string;
  type: 'static' | 'connected' | 'ospf' | 'bgp';
}

/** State lengkap satu perangkat. */
export interface DeviceState {
  id: string;
  hostname: string;
  vendor: 'mikrotik' | 'cisco' | 'generic';
  interfaces: InterfaceState[];
  routes: RouteEntry[];
  mode?: 'user' | 'enable' | 'config' | 'interface';
  activeInterface?: string;
}

/** Menghasilkan MAC acak deterministik per device (00:16:3e:xx:yy:zz). */
export function generateMac(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const parts = [
    '00',
    '16',
    '3e',
    String(((hash >> 16) & 0xff) ^ 0x1a).padStart(2, '0'),
    String(((hash >> 8) & 0xff) ^ 0x5a).padStart(2, '0'),
    String((hash & 0xff) ^ 0xa5).padStart(2, '0'),
  ];
  return parts.join(':');
}

/**
 * Membuat DeviceState kosong baru (interface dari daftar nama port).
 */
export function createDeviceState(
  id: string,
  vendor: 'mikrotik' | 'cisco' | 'generic',
  hostname: string,
  portNames: string[]
): DeviceState {
  return {
    id,
    hostname,
    vendor,
    interfaces: portNames.map((name) => ({
      name,
      mac: generateMac(`${id}:${name}`),
      disabled: false,
    })),
    routes: [],
    mode: vendor === 'cisco' ? 'user' : undefined,
  };
}

/** Update immutabel: set IP/prefix sebuah interface (auto hapus bila kosong). */
export function setInterfaceIp(
  state: DeviceState,
  ifaceName: string,
  cidr: string
): DeviceState {
  const match = /^(\d{1,3}(?:\.\d{1,3}){3})(?:\/(\d{1,2}))?$/.exec(cidr.trim());
  const ip = match ? match[1] : '';
  const prefix = match && match[2] ? Number(match[2]) : undefined;
  return {
    ...state,
    interfaces: state.interfaces.map((i) =>
      i.name === ifaceName
        ? { ...i, ip: ip || undefined, prefix: ip ? prefix : undefined }
        : i
    ),
  };
}

/** Update immutabel: disabled pada/off sebuah interface. */
export function setInterfaceDisabled(
  state: DeviceState,
  ifaceName: string,
  disabled: boolean
): DeviceState {
  return {
    ...state,
    interfaces: state.interfaces.map((i) =>
      i.name === ifaceName ? { ...i, disabled } : i
    ),
  };
}

/** Update immutabel: hostname perangkat. */
export function setHostname(state: DeviceState, hostname: string): DeviceState {
  return { ...state, hostname: hostname || state.hostname };
}

/** Update immutabel: tambah route statis (hindari duplikat dst yang sama). */
export function addRoute(state: DeviceState, route: RouteEntry): DeviceState {
  const exists = state.routes.some((r) => r.dst === route.dst);
  if (exists) return state;
  return { ...state, routes: [...state.routes, route] };
}

/** Update immutabel: set mode (context) Cisco. */
export function setMode(
  state: DeviceState,
  mode: 'user' | 'enable' | 'config' | 'interface',
  activeInterface?: string
): DeviceState {
  return { ...state, mode, activeInterface };
}