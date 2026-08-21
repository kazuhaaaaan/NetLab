// ============================================================
// TopologyRuntime — sinkronisasi topologi (syncTopology) +
// peringatan validasi hasil sync.
//
// Memiliki alur: Topology.sync → rebuild DeviceProcessor →
// reset scheduler/bus/time/run/event → jadwal AGING pertama →
// applyAllConfigs (state CLI yang persisten tetap diterapkan ulang).
// ============================================================

import { LabProjectLike } from './Topology';
import { SimulationContext } from './SimulationContext';
import { SimulationCore } from './SimulationCore';
import { RunManager } from './RunManager';
import { ConfigStore } from './ConfigStore';
import { processorKind } from '../devices/DeviceProcessor';
import { WirelessProcessor } from '../devices/WirelessProcessor';
import { SwitchProcessor } from '../devices/SwitchProcessor';
import { HostProcessor } from '../devices/HostProcessor';
import { RouterProcessor } from '../devices/RouterProcessor';

export class TopologyRuntime {
  constructor(
    private readonly ctx: SimulationContext,
    private readonly core: SimulationCore,
    private readonly runManager: RunManager,
    private readonly configStore: ConfigStore
  ) {}

  syncTopology(project: LabProjectLike): void {
    const { nodes } = this.ctx.topology.sync(project);
    this.ctx.nodes = nodes;
    this.ctx.processors.clear();
    for (const [id, dev] of nodes) {
      // Counters & buffer fragment di-reset: satu sesi lab = kondisi bersih.
      dev.ifaceCounters.clear();
      dev.fragBuffer.clear();
      const kind = processorKind(dev);
      let proc = null;
      if (kind === 'wireless') proc = new WirelessProcessor(dev);
      else if (kind === 'switch') proc = new SwitchProcessor(dev);
      else if (kind === 'host') proc = new HostProcessor(dev);
      else proc = new RouterProcessor(dev);
      this.ctx.processors.set(id, proc);
    }
    this.ctx.scheduler.clear();
    this.ctx.bus.clear();
    this.ctx.time.reset();
    this.runManager.clearRuns();
    this.core.clearArpBuffers();
    this.core.clearEventLog();
    this.ctx.scheduler.schedule({ type: 'AGING', traceId: 'aging', data: {} }, 5000);
    this.configStore.applyAllConfigs();
  }

  /** Peringatan validasi topologi dari sync terakhir (edge ditolak dll.) — tidak pernah throw. */
  getTopologyWarnings(): { id: string; reason: string }[] {
    return [...(this.ctx.topology.lastSkippedEdges || [])];
  }
}