// ============================================================
// packages/vendors — public API (API surface lama dipertahankan).
//
// Struktur baru:
//   common/          — types, chain, memory, errors, ip, state, format,
//                      snmp, deletion, generic (branch tanpa guard vendor)
//   <vendor>/        — adapter.ts + commands.ts (branch ber-guard vendor)
//   dispatcher/      — VendorDispatcher (router murni)
// ============================================================

export { VendorDispatcher } from './dispatcher/VendorDispatcher';
export type { IVendorAdapter } from './dispatcher/VendorDispatcher';

export { MikroTikVendorAdapter } from './mikrotik/adapter';
export { CiscoVendorAdapter } from './cisco-ios/adapter';
export { CiscoNxosVendorAdapter } from './cisco-nxos/adapter';
export { JuniperVendorAdapter } from './juniper/adapter';
export { HuaweiVendorAdapter } from './huawei/adapter';
export { UbiquitiVendorAdapter } from './ubiquiti/adapter';
export { VyosVendorAdapter } from './vyos/adapter';
export { FortinetVendorAdapter } from './fortinet/adapter';
export { ArubaVendorAdapter } from './aruba/adapter';
export { OpenwrtVendorAdapter } from './openwrt/adapter';
export { LinuxDebianVendorAdapter } from './linux/adapter';

export { VENDOR_CAPABILITIES, getVendorCapabilities, CAPABILITY_LABELS } from './capabilities';
export type { VendorCapabilities, CapabilityKey, CapabilityStatus } from './capabilities';

// Tipe bersama untuk importer eksternal (engine, UI, test).
export type {
  VendorId,
  VendorAdapter,
  VendorContext,
  CommandResult,
  CommandError,
  CliMode,
  ChainEntry,
  ChainEnv,
  NodeMemory,
  MemoryRegistry,
  VendorCapability,
} from './common/types';
export { runChain, registerEntries } from './common/chain';

// Side-effect: daftarkan chain entries (generic + per-vendor) — tanpa ini
// runChain tidak menemukan handler apa pun (import index.ts harus cukup
// untuk membuat dispatcher berfungsi penuh, seperti index.ts lama).
import './common/generic';
import './mikrotik/commands';
import './cisco-ios/commands';
import './cisco-nxos/commands';
import './juniper/commands';
import './huawei/commands';
import './ubiquiti/commands';
import './vyos/commands';
import './fortinet/commands';
import './aruba/commands';
import './openwrt/commands';
import './linux/commands';
