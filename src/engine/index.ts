/**
 * Facade engine NetLab — entry titik masuk pipeline CLI.
 *
 * runCliCommand: parse (lexer → parser → vendor adapter) → cermin state
 * (executor) → output dari engine nyata (bridge). Output SELALU identik
 * dengan engine nyata; facade menambah lapisan klasifikasi + state mirror.
 */

import type { CommandObject } from './cli/types';
import { parseCommand } from './cli/parser';
import type { NetLabBridge, BridgePingResult, BridgeDeviceStats } from './state/bridge';
import type { DeviceState } from './state/DeviceState';
import type { TopologyState } from './state/TopologyState';
import { executeCommand } from './state/executor';
import { resolveAbbreviation, abbreviationError } from './cli/commandTree';
import type { CliMode } from './cli/commandTree';

/** Peta vendor UI → vendor tree (facade). */
export function treeVendor(vendor: string): string | null {
  if (vendor === 'cisco_ios' || vendor === 'cisco_nxos' || vendor === 'cisco') return 'cisco';
  if (vendor === 'mikrotik') return 'mikrotik';
  if (vendor === 'juniper') return 'juniper';
  if (vendor === 'huawei') return 'huawei';
  if (vendor === 'aruba') return 'aruba';
  if (vendor === 'vyos' || vendor === 'ubiquiti') return vendor;
  if (vendor === 'fortinet') return 'fortinet';
  return null;
}

/** Implementasi bridge untuk engine nyata (VendorDispatcher + NetworkSimulator). */
export function createNetLabBridge(
  dispatcher: {
    dispatch(vendorId: string, rawInput: string, context: unknown): string;
  },
  simulator: {
    simulatePing(nodeId: string, dstIp: string): BridgePingResult;
    getDeviceStats(nodeId: string): BridgeDeviceStats | null;
  }
): NetLabBridge {
  return {
    dispatch: (vendor, rawInput, context) => dispatcher.dispatch(vendor, rawInput, context),
    simulatePing: (nodeId, dstIp) => simulator.simulatePing(nodeId, dstIp),
    getDeviceStats: (nodeId) => simulator.getDeviceStats(nodeId),
  };
}

export interface RunCliCommandOptions {
  bridge: NetLabBridge;
  vendor: string;
  nodeId: string;
  cmd: string;
  /** Mode CLI saat ini (context) — untuk resolusi abbreviation yang mode-aware. */
  mode?: CliMode;
  /** Konteks dispatch engine nyata (ports, provider, dst.) — diteruskan apa adanya. */
  context: unknown;
  /** DeviceState cermin saat ini (opsional) — bila ada, cermin dihitung. */
  currentDevice?: DeviceState | null;
  /** Dipanggil bila perintah memutasi cermin (hasil state baru). */
  onStateChange?: (device: DeviceState) => void;
}

export interface RunCliCommandResult {
  /** Output vendor-autentik dari engine nyata. */
  output: string;
  /** Hasil klasifikasi (parsed) perintah (dari input yang DIEXPAND, bila ada). */
  command: CommandObject;
  /** Apakah perintah memutasi cermin DeviceState. */
  changed: boolean;
  /** Perintah yang benar-benar dikirim ke engine (hasil ekspansi abbreviation). */
  dispatched: string;
}

/**
 * Menjalankan satu perintah CLI lewat pipeline facade.
 *
 * Sebelum dispatch ke engine, resolusi abbreviation dijalankan:
 * - input ambigu (prefix match >1 perintah) → error vendor-autentik, TIDAK ada
 *   dispatch → state tidak berubah;
 * - input unik & disingkat → perintah kanonis yang dikirim ke engine;
 * - selainnya → input apa adanya (perilaku lama dipertahankan).
 *
 * Cermin DeviceState dan hasil parse SELALU dihitung dari perintah yang sama
 * dengan yang dikirim ke engine (`dispatched`), sehingga klasifikasi tidak
 * pernah berbeda dengan eksekusi nyata.
 */
export function runCliCommand(opts: RunCliCommandOptions): RunCliCommandResult {
  const tv = treeVendor(opts.vendor);
  let dispatched = opts.cmd;
  if (tv) {
    const resolution = resolveAbbreviation(tv, opts.mode || 'exec', opts.cmd);
    if (resolution.kind === 'ambiguous') {
      return {
        output: abbreviationError(tv, resolution.input, resolution.candidates),
        command: parseCommand(opts.cmd, opts.vendor),
        changed: false,
        dispatched: opts.cmd,
      };
    }
    if (resolution.kind === 'expanded' && resolution.command !== opts.cmd.trim()) {
      dispatched = resolution.command;
    }
  }

  const command = parseCommand(dispatched, opts.vendor);

  let changed = false;
  if (opts.currentDevice) {
    const state: TopologyState = {
      devices: new Map([[opts.nodeId, opts.currentDevice]]),
      cables: [],
    };
    const outcome = executeCommand(state, opts.nodeId, command);
    const next = outcome.state.devices.get(opts.nodeId);
    changed = outcome.mutated.length > 0;
    if (next && changed && opts.onStateChange) opts.onStateChange(next);
  }

  const output = opts.bridge.dispatch(opts.vendor, dispatched, opts.context);
  return { output, command, changed, dispatched };
}

/**
 * Deteksi kegagalan perintah dari output vendor-autentik (murni).
 *
 * Semua jalur error engine mengikuti konvensi penanda ini:
 * - Cisco/Aruba/NX-OS/Huawei/MikroTik/VyOS/Ubiquiti/Fortinet: '% …' / '% Error'
 * - RouterOS: 'bad command name …'
 * - Juniper: 'error: …' / 'syntax error'
 * - Linux/OpenWrt: 'bash: …: command not found'
 * - Capability guard: 'not supported' / 'not currently simulated'
 * - Guard IP/interface: 'no such interface', 'Cannot find device', 'Unknown "set" path'
 * Output sukses (show/print/config) tidak pernah memuat penanda ini.
 */
export function isCliFailure(output: string): boolean {
  const t = output.trim();
  if (!t) return false;
  const lo = t.toLowerCase();
  return (
    t.startsWith('%') ||
    t.startsWith('bad command name') ||
    t.startsWith('syntax error') ||
    t.startsWith('failure:') ||
    lo.startsWith('error:') ||
    lo.startsWith('bash:') ||
    lo.includes('command not found') ||
    lo.includes('not supported') ||
    lo.includes('not currently simulated') ||
    lo.includes('no such interface') ||
    lo.includes('cannot find device') ||
    lo.includes('unknown "set" path') ||
    lo.includes('unknown command') ||
    lo.includes('no such option') ||
    lo.includes('does not exist') ||
    lo.includes('must be') ||
    lo.includes('only berlaku') ||
    lo.includes('enter interface')
  );
}