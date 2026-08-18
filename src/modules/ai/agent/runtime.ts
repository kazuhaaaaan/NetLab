// ============================================================
// runtime — AgentRuntime: satu-satunya jembatan AI → canvas/engine.
//
// Dua implementasi:
//   1. Headless (createHeadlessRuntime) — untuk test & terminal;
//      proyek disimpan internal, engine disinkronkan langsung.
//   2. App (App.tsx) — applyProject → setProjectWithHistory (React),
//      sehingga canvas & engine sinkron via jalur yang sama dengan
//      interaksi manusia (useEffect [project] → syncTopology).
//
// Kunci: TIDAK ada jalur AI langsung ke React state / engine.
// Semua lewat method runtime ini.
// ============================================================

import type { NetworkSimulator } from '../../../engine/net/core/NetworkSimulator';
import type { VendorDispatcher } from '../../../../packages/vendors/src/dispatcher/VendorDispatcher';
import type { LabProject, LabNode } from '../../../types';
import { buildCliContext } from '../../../utils/cliContext';
import { runCliCommand, createNetLabBridge } from '../../../engine';
import { syncNodeToEngine, syncDhcpPools } from '../../../utils/cliSync';
import type { VendorContext } from '../../../../packages/vendors/src/common/types';

export interface CliExecResult {
  output: string;
  ok: boolean;
  changed: boolean;
}

/** Kontrak runtime — diimplementasikan App (React) dan headless (test). */
export interface AgentRuntime {
  sim: NetworkSimulator;
  dispatcher: VendorDispatcher;
  /** proyek saat ini (canvas source of truth read-back). */
  getProject(): LabProject | null;
  /** terapkan proyek (canvas + engine sinkron). */
  applyProject(project: LabProject): boolean;
  /** eksekusi CLI via jalur yang SAMA dengan terminal manusia. */
  executeCli(nodeId: string, vendor: string, cmd: string): CliExecResult;
  /** dorong konfigurasi CLI sebuah node ke engine. */
  syncNodeToEngine(nodeId: string): void;
  syncDhcpPools(): void;
  /** persist memori CLI (App: IndexedDB; headless: noop). */
  persistMemory(): void;
  /** bangun VendorContext untuk node (provider engine lengkap). */
  buildContext(nodeId: string): VendorContext;
}

/** Runtime headless murni (tanpa React) — dipakai test & terminal. */
export function createHeadlessRuntime(
  sim: NetworkSimulator,
  dispatcher: VendorDispatcher
): AgentRuntime {
  let project: LabProject | null = null;

  const syncProject = (p: LabProject) => {
    sim.syncTopology(p);
    for (const n of p.nodes) sim.setNodePowered(n.id, n.powered !== false);
  };

  return {
    sim,
    dispatcher,
    getProject: () => project,
    applyProject: (p: LabProject) => {
      project = p;
      syncProject(p);
      return true;
    },
    executeCli: (nodeId: string, vendor: string, cmd: string): CliExecResult => {
      const realId = resolveNodeId(project, nodeId);
      const bridge = createNetLabBridge(
        { dispatch: (v, c, x) => dispatcher.dispatch(v, c, x as VendorContext) },
        sim
      );
      const res = runCliCommand({
        bridge,
        vendor,
        nodeId: realId,
        cmd,
        context: buildContextSafe(sim, project, realId),
      });
      syncNodeToEngine(sim, dispatcher, realId);
      syncDhcpPools(sim, dispatcher);
      return { output: res.output, ok: true, changed: res.changed };
    },
    syncNodeToEngine: (nodeId) => syncNodeToEngine(sim, dispatcher, resolveNodeId(project, nodeId)),
    syncDhcpPools: () => syncDhcpPools(sim, dispatcher),
    persistMemory: () => {
      /* headless: tidak ada storage — noop */
    },
    buildContext: (nodeId) => buildContextSafe(sim, project, resolveNodeId(project, nodeId)),
  };
}

/** Resolusi nama → id node (AI boleh memanggil dengan nama atau id). */
function resolveNodeId(project: LabProject | null, nodeId: string): string {
  if (!project) return nodeId;
  const hit = project.nodes.find(
    (n) => n.id === nodeId || n.name.toLowerCase() === nodeId.toLowerCase()
  );
  return hit ? hit.id : nodeId;
}

function buildContextSafe(sim: NetworkSimulator, project: LabProject | null, nodeId: string): VendorContext {
  const node: LabNode | undefined = project?.nodes.find((n) => n.id === nodeId);
  if (!node) {
    return {
      nodeId,
      name: nodeId,
      ports: [],
      portLinks: {},
    };
  }
  const p = project as LabProject;
  return buildCliContext({ node, project: p, sim });
}

/** id unik deterministic-aware: gunakan seed bila disediakan (lab reproducibility). */
export function uid(prefix: string, seed?: string): string {
  if (seed) return `${prefix}-${seed}`;
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** clone proyek (structured clone aman untuk snapshot). */
export function cloneProject(p: LabProject): LabProject {
  return JSON.parse(JSON.stringify(p)) as LabProject;
}