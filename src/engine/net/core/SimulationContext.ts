// ============================================================
// SimulationContext — state bersama subsystem NetworkSimulator.
// INTERNAL: tidak diekspor dari engine/net/index.ts.
//
// Kepemilikan state:
//   - scheduler/bus/time/topology/nodes/processors/routingProtocols: context
//   - eventLog/seq/pktSeq/arpBuffers: SimulationCore
//   - runs/runSeq: RunManager
//   - config maps (IP/rute/VLAN/NAT/ACL/...): ConfigStore
//
// Subsystem lain MUTASI state lewat context ini; tidak ada dua
// subsystem yang diam-diam memiliki map yang sama sebagai "miliknya".
// ============================================================

import { EventScheduler } from './EventScheduler';
import { TimeManager } from './TimeManager';
import { EventBus } from './EventBus';
import { Topology } from './Topology';
import { NetworkDevice } from '../devices/NetworkDevice';
import { DeviceProcessor } from '../devices/DeviceProcessor';
import { RoutingProtocolEngine } from '../services/RoutingProtocolEngine';
import { Packet, RunResult } from './types';

/** Frame yang menunggu resolusi ARP/NDP (di-buffer sampai reply tiba). */
export interface BufferedFrame {
  pkt: Packet;
  outPort: string;
  traceId: string;
}

/** Status satu flow yang sedang berjalan di dalam satu run. */
export interface Run extends RunResult {
  traceId: string;
  start: number;
  rootPktId?: string;
  fwdPath: string[];
  fwdEdges: string[];
  handshake?: { seq: number; ack: number; flags: string }[];
  snmp?: Record<string, unknown>;
}

export interface SimulationContext {
  scheduler: EventScheduler;
  bus: EventBus;
  time: TimeManager;
  topology: Topology;
  nodes: Map<string, NetworkDevice>;
  processors: Map<string, DeviceProcessor>;
  /** Engine routing protokol PERSISTEN (lintas recompute) — state FSM OSPF/BGP. */
  routingProtocols: RoutingProtocolEngine;
  runs: Map<string, Run>;
}

export interface SimRunOptions {
  maxEvents?: number;
  maxTimeMs?: number;
}

export const DEFAULT_TTL = 64;

/** Masa tunggu resolusi ARP/NDP sebelum paket yang menunggu di-buffer
 *  dinyatakan ARP_UNRESOLVED dan dibuang (waktu virtual, ms). */
export const ARP_RESOLVE_TIMEOUT_MS = 3000;

/** Buat run baru (entry di map runs) — dipakai RunManager & SimulationCore.getRun
 *  agar fallback "getRun menciptakan run bila belum ada" identik di kedua tempat. */
export function createRunEntry(ctx: SimulationContext, traceId: string): Run {
  const run: Run = { traceId, status: 'running', start: ctx.time.now(), fwdPath: [], fwdEdges: [] };
  ctx.runs.set(traceId, run);
  return run;
}