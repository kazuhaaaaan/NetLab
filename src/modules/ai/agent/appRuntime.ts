// ============================================================
// appRuntime — AgentRuntime terikat React (App.tsx).
//
// Tujuan: AI Agent memakai jalur YANG SAMA dengan manusia:
//   - applyProject  → setProjectWithHistory (undo stack + engine sync
//     via useEffect [project] → syncTopology) — canvas sinkron live.
//   - executeCli    → runCliCommand + createNetLabBridge — pipeline
//     facade yang sama persis dengan terminal manusia.
//   - buildContext  → buildCliContext — VendorContext identik.
//
// Tidak ada jalur AI langsung ke React state / engine internal.
// ============================================================

import type { NetworkSimulator } from '../../../engine/net/core/NetworkSimulator';
import type { VendorDispatcher } from '../../../../packages/vendors/src/dispatcher/VendorDispatcher';
import type { LabProject, LabNode } from '../../../types';
import { buildCliContext } from '../../../utils/cliContext';
import { runCliCommand, createNetLabBridge } from '../../../engine';
import { syncNodeToEngine, syncDhcpPools } from '../../../utils/cliSync';
import type { CliExecResult, AgentRuntime } from './runtime';
import type { VendorContext } from '../../../../packages/vendors/src/common/types';

export interface AppRuntimeDeps {
  sim: NetworkSimulator;
  dispatcher: VendorDispatcher;
  /** proyek React saat ini (state source-of-truth canvas). */
  getProject: () => LabProject | null;
  /** terapkan proyek via jalur React (setProjectWithHistory). */
  applyProject: (project: LabProject) => void;
  /** persist memori CLI (IndexedDB/localStorage). */
  persistMemory: () => void;
}

/** Resolusi nama → id node (AI boleh memanggil dengan nama). */
function resolveNodeId(project: LabProject | null, nodeId: string): string {
  if (!project) return nodeId;
  const hit = project.nodes.find(
    (n) => n.id === nodeId || n.name.toLowerCase() === nodeId.toLowerCase()
  );
  return hit ? hit.id : nodeId;
}

/** Runtime untuk lingkungan React — jembatan AI → canvas/engine. */
export function createAppRuntime(deps: AppRuntimeDeps): AgentRuntime {
  const bridge = createNetLabBridge(
    { dispatch: (v, c, x) => deps.dispatcher.dispatch(v, c, x as VendorContext) },
    deps.sim
  );

  const buildContext = (nodeId: string): VendorContext => {
    const project = deps.getProject();
    const realId = resolveNodeId(project, nodeId);
    const node: LabNode | undefined = project?.nodes.find((n) => n.id === realId);
    if (!node || !project) {
      return {
        nodeId: realId,
        name: realId,
        ports: [],
        portLinks: {},
      };
    }
    return buildCliContext({ node, project, sim: deps.sim });
  };

  return {
    sim: deps.sim,
    dispatcher: deps.dispatcher,
    getProject: () => deps.getProject(),
    applyProject: (p: LabProject) => {
      deps.applyProject(p);
      return true;
    },
    executeCli: (nodeId: string, vendor: string, cmd: string): CliExecResult => {
      const project = deps.getProject();
      const realId = resolveNodeId(project, nodeId);
      const res = runCliCommand({
        bridge,
        vendor,
        nodeId: realId,
        cmd,
        mode: 'exec',
        context: buildContext(realId),
      });
      syncNodeToEngine(deps.sim, deps.dispatcher, realId);
      syncDhcpPools(deps.sim, deps.dispatcher);
      return { output: res.output, ok: true, changed: res.changed };
    },
    syncNodeToEngine: (nodeId) => syncNodeToEngine(deps.sim, deps.dispatcher, resolveNodeId(deps.getProject(), nodeId)),
    syncDhcpPools: () => syncDhcpPools(deps.sim, deps.dispatcher),
    persistMemory: () => deps.persistMemory(),
    buildContext,
  };
}