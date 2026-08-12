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
  /** Hasil klasifikasi (parsed) perintah. */
  command: CommandObject;
  /** Apakah perintah memutasi cermin DeviceState. */
  changed: boolean;
}

/**
 * Menjalankan satu perintah CLI lewat pipeline facade.
 */
export function runCliCommand(opts: RunCliCommandOptions): RunCliCommandResult {
  const command = parseCommand(opts.cmd, opts.vendor);

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

  const output = opts.bridge.dispatch(opts.vendor, opts.cmd, opts.context);
  return { output, command, changed };
}