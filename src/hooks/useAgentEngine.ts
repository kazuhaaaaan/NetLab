// ============================================================
// useAgentEngine — hook React: jembatan AI Network Agent ↔ App.
//
//   project (React state)  → runtime.getProject
//   runtime.applyProject   → setProjectWithHistory (undo stack)
//                           → useEffect [project] → engine sync
//                           → canvas render (sinkron live)
//   runtime.executeCli     → runCliCommand (jalur terminal manusia)
//
// Mode izin default: 'propose' — plan bisa dibuat, eksekusi hanya
// setelah user mengaktifkan mode execute (persetujuan eksplisit).
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { LabProject } from '../types';
import type { NetworkSimulator } from '../engine/net/core/NetworkSimulator';
import type { VendorDispatcher } from '../../packages/vendors/src/dispatcher/VendorDispatcher';
import { AgentEngine } from '../modules/ai/agent/AgentEngine';
import { createAppRuntime } from '../modules/ai/agent/appRuntime';
import type { AgentRuntime } from '../modules/ai/agent/runtime';
import type { AiPermissionMode } from '../modules/ai/agent/types';

export interface UseAgentEngineOptions {
  project: LabProject;
  /** jalur apply proyek React (undo stack + re-render canvas). */
  setProjectWithHistory: (updater: ((prev: LabProject) => LabProject) | LabProject) => void;
  simRef: MutableRefObject<NetworkSimulator>;
  dispatcher: VendorDispatcher;
  syncNodeToEngine: (nodeId: string) => void;
  syncDhcpPools: () => void;
  /** persist memori CLI vendor (StorageEngine). */
  persistMemory: () => void;
}

export function useAgentEngine(opts: UseAgentEngineOptions) {
  const [mode, setMode] = useState<AiPermissionMode>('propose');
  const depsRef = useRef(opts);
  depsRef.current = opts;

  const runtimeRef = useRef<AgentRuntime | null>(null);
  if (!runtimeRef.current) {
    runtimeRef.current = createAppRuntime({
      sim: opts.simRef.current,
      dispatcher: opts.dispatcher,
      getProject: () => depsRef.current.project,
      applyProject: (p) => depsRef.current.setProjectWithHistory(p),
      persistMemory: () => depsRef.current.persistMemory(),
    });
  }

  const engineRef = useRef<AgentEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new AgentEngine({ runtime: runtimeRef.current, mode });
  }

  useEffect(() => {
    engineRef.current?.setPermissionMode(mode);
  }, [mode]);

  const setModeSafe = useCallback((m: AiPermissionMode) => {
    setMode(m);
    engineRef.current?.setPermissionMode(m);
  }, []);

  return {
    agent: engineRef.current as AgentEngine,
    runtime: runtimeRef.current as AgentRuntime,
    mode,
    setMode: setModeSafe,
  };
}