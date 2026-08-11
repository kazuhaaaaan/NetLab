import React, { useMemo, useState } from 'react';
import { X, Play, Activity, GitBranch, Zap, Frown, Redo2 } from 'lucide-react';
import { LabNode, LabEdge } from '../types';
import { findPath, tracePath, type PathResult } from '../utils/pathfinding';

interface NetworkSimulationModalProps {
  open: boolean;
  onClose: () => void;
  nodes: LabNode[];
  edges: LabEdge[];
  /** Mulai animasi paket di canvas: edgeIds berurutan, reverse untuk reply. */
  onRunPacketAnimation: (edgeIds: string[], reverse?: boolean, red?: boolean) => void;
  /** Tandai perangkat yang sedang diuji / titik kegagalan (badge kuning/merah). */
  onSimulationNodes: (pinging: string[], failed: string[]) => void;
}

export interface SimRun {
  id: number;
  srcId: string;
  dstId: string;
  path: PathResult;
  latencyMs: number;
  lossPct: number;
  rttMs: number;
  status: 'success' | 'failed';
  startedAt: string;
}

const NodeSelect: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  nodes: LabNode[];
  placeholder: string;
}> = ({ label, value, onChange, nodes, placeholder }) => (
  <div className="flex-1 min-w-0">
    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-[#0B0C0E] border border-[#2B2D31] rounded-lg px-2.5 py-2 text-xs text-slate-100 outline-none focus:border-cyan-500/60 truncate"
    >
      <option value="">— {placeholder} —</option>
      {nodes.map((n) => (
        <option key={n.id} value={n.id}>
          {n.name} ({n.deviceType})
        </option>
      ))}
    </select>
  </div>
);

export const NetworkSimulationModal: React.FC<NetworkSimulationModalProps> = ({
  open,
  onClose,
  nodes,
  edges,
  onRunPacketAnimation,
  onSimulationNodes,
}) => {
  const [srcId, setSrcId] = useState('');
  const [dstId, setDstId] = useState('');
  const [runs, setRuns] = useState<SimRun[]>([]);
  const [running, setRunning] = useState(false);
  const [hopTrace, setHopTrace] = useState<{ nodeId: string; status: 'ok' | 'blocked'; reason?: string }[]>([]);
  const runCounter = useMemo(() => ({ current: 0 }), []);

  // Cek koneksi di awal (BFS) agar tombol bisa menolak node yang sama
  const quickCheck = useMemo<PathResult | null>(() => {
    if (!srcId || !dstId || srcId === dstId) return null;
    return findPath(srcId, dstId, nodes, edges);
  }, [srcId, dstId, nodes, edges]);

  const startSimulation = () => {
    if (!srcId || !dstId) return;
    if (srcId === dstId) return;
    setRunning(true);
    onSimulationNodes([srcId], []);

    // Diagnostik hop demi hop (BFS; simpan status tiap hop)
    const steps = tracePath(srcId, dstId, nodes, edges);
    setHopTrace(steps);

    const path = findPath(srcId, dstId, nodes, edges);
    const id = ++runCounter.current;

    if (path.ok && path.reachedAt === dstId) {
      // Success: animasi request → reply, lalu bersihkan badge kuning
      const hops = Math.max(1, path.nodeIds.length - 1);
      const base = 2 + Math.abs(srcId.length % 5); // latensi per hop (ms) — deterministik
      const latencyMs = hops * base;
      const rttMs = latencyMs * 2 + 1;
      onRunPacketAnimation(path.edgeIds, false, false);
      setTimeout(() => {
        onRunPacketAnimation(path.edgeIds, true, false);
      }, 700);
      setTimeout(() => {
        setRuns((prev) => [
          {
            id,
            srcId,
            dstId,
            path,
            latencyMs,
            lossPct: 0,
            rttMs,
            status: 'success',
            startedAt: new Date().toLocaleTimeString(),
          },
          ...prev,
        ].slice(0, 12));
        setRunning(false);
        onSimulationNodes([], []);
      }, 1900);
    } else {
      // Failed: tandai node terakhir terjangkau dengan badge merah
      const lastReached = stepBlockedNode(steps, dstId);
      const failedNodes = lastReached ? [lastReached] : [];
      if (!lastReached) {
        // kasus ekstrem: hub putus di kabel — jalankan animasi merah sampai node terakhir
        const partial = findPartialEdges(path.nodeIds, edges);
        if (partial.length > 0) onRunPacketAnimation(partial, false, true);
      }
      const reached = path.reachedAt;
      const latencyMs = reached ? Math.max(5, (path.nodeIds.length) * 4) : 0;
      setRuns((prev) =>
        [
          {
            id,
            srcId,
            dstId,
            path,
            latencyMs,
            lossPct: 100,
            rttMs: 0,
            status: 'failed',
            startedAt: new Date().toLocaleTimeString(),
          },
          ...prev,
        ].slice(0, 12)
      );
      setRunning(false);
      onSimulationNodes([], failedNodes);
    }
  };

  const clearRuns = () => {
    setRuns([]);
    setHopTrace([]);
    onSimulationNodes([], []);
  };

  if (!open) return null;

  const unreachableSelfClose = srcId && dstId && srcId === dstId;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-3 sm:p-6">
      <div className="bg-[#0F1015] border border-[#2B2D31] rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-4 py-3 border-b border-[#2B2D31] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-cyan-600/20 border border-cyan-500/40 flex items-center justify-center">
              <Activity className="w-4 h-4 text-cyan-400" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-100">Simulasi Jaringan</h2>
              <p className="text-[10px] text-slate-500 font-mono">Packet flow + pathfinding BFS di atas topologi</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
            title="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          {/* Pilih sumber & tujuan */}
          <div className="flex gap-2">
            <NodeSelect label="Source Node" value={srcId} onChange={setSrcId} nodes={nodes} placeholder="pilih sumber" />
            <div className="flex items-end pb-1">
              <GitBranch className="w-4 h-4 text-cyan-500 rotate-90 mb-2.5" />
            </div>
            <NodeSelect label="Destination Node" value={dstId} onChange={setDstId} nodes={nodes} placeholder="pilih tujuan" />
          </div>

          {unreachableSelfClose && (
            <p className="text-[11px] text-amber-400">⚠ Sumber dan tujuan tidak boleh perangkat yang sama.</p>
          )}

          {/* Tombol start */}
          <button
            onClick={startSimulation}
            disabled={!srcId || !dstId || srcId === dstId || running}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition ${
              !srcId || !dstId || srcId === dstId
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : running
                  ? 'bg-cyan-900 text-cyan-200 cursor-wait'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-900/30 active:scale-[0.99]'
            }`}
          >
            {running ? (
              <>
                <Zap className="w-4 h-4 animate-pulse" /> Mengirim paket...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" /> Start Simulation
              </>
            )}
          </button>

          {/* Status koneksi langsung (BFS) */}
          {!running && srcId && dstId && srcId !== dstId && (
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[11px] font-mono ${
                quickCheck?.ok
                  ? 'bg-emerald-900/20 border-emerald-600/40 text-emerald-300'
                  : 'bg-rose-900/20 border-rose-600/40 text-rose-300'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${quickCheck?.ok ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              {quickCheck?.ok
                ? `Lintasan tersedia: ${quickCheck.nodeIds.map((id) => nodes.find((n) => n.id === id)?.name ?? id).join(' → ')} (${quickCheck.edgeIds.length} kabel)`
                : 'Tidak ada lintasan aktif — cek kabel (down) atau perangkat (power OFF).'}
            </div>
          )}

          {/* Hop trace */}
          {hopTrace.length > 0 && (
            <div className="bg-[#1A1D24] border border-[#2B2D31] rounded-xl p-3">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <GitBranch className="w-3 h-3 text-cyan-400" /> Lintasan Paket
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {hopTrace.map((h, i) => {
                  const name = nodes.find((n) => n.id === h.nodeId)?.name ?? h.nodeId;
                  const isLast = i === hopTrace.length - 1;
                  return (
                    <React.Fragment key={h.nodeId + i}>
                      {i > 0 && <span className="text-[10px] text-slate-600">→</span>}
                      <span
                        className={`px-2 py-1 rounded-md border text-[10px] font-mono ${
                          h.status === 'blocked'
                            ? 'bg-rose-900/30 border-rose-600/50 text-rose-300'
                            : isLast
                              ? 'bg-cyan-900/30 border-cyan-600/50 text-cyan-300'
                              : 'bg-slate-900 border-slate-700 text-slate-300'
                        }`}
                        title={h.reason}
                      >
                        {h.status === 'blocked' ? '✕ ' : ''}{name}
                      </span>
                    </React.Fragment>
                  );
                })}
              </div>
              {hopTrace.some((h) => h.status === 'blocked') && (
                <p className="mt-2 text-[10.5px] text-rose-400 font-mono">
                  ⚠ Destination Host Unreachable — {hopTrace.find((h) => h.status === 'blocked')?.reason}
                </p>
              )}
            </div>
          )}

          {/* Riwayat hasil */}
          {runs.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Hasil ({runs.length})
                </span>
                <button
                  onClick={clearRuns}
                  className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-200 transition"
                >
                  <Redo2 className="w-3 h-3" /> Bersihkan
                </button>
              </div>
              <div className="space-y-1.5">
                {runs.map((r) => (
                  <div
                    key={r.id}
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-[11px] font-mono ${
                      r.status === 'success'
                        ? 'bg-emerald-900/10 border-emerald-700/40'
                        : 'bg-rose-900/10 border-rose-700/40'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${r.status === 'success' ? 'bg-emerald-400' : 'bg-rose-400'}`}
                        />
                        <span className="text-slate-200 font-semibold truncate">
                          {nodes.find((n) => n.id === r.srcId)?.name} → {nodes.find((n) => n.id === r.dstId)?.name}
                        </span>
                      </div>
                      <span className="text-[9.5px] text-slate-500">
                        {r.path.edgeIds.length} kabel · {r.startedAt}
                      </span>
                    </div>
                    <div className="shrink-0 text-right text-[10px]">
                      {r.status === 'success' ? (
                        <>
                          <div className="text-emerald-400 font-bold">✓ OK</div>
                          <div className="text-slate-400">{r.latencyMs} ms · 0% loss · RTT {r.rttMs} ms</div>
                        </>
                      ) : (
                        <>
                          <div className="text-rose-400 font-bold">✕ Gagal</div>
                          <div className="text-slate-400">loss 100% · unreachable</div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {runs.length === 0 && !running && (
            <div className="flex flex-col items-center text-center py-6 text-slate-600 gap-1.5">
              <Frown className="w-7 h-7" />
              <p className="text-xs text-slate-500">Belum ada simulasi.</p>
              <p className="text-[10px] font-mono text-slate-600">
                Pilih sumber & tujuan lalu tekan Start Simulation
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/** Hop yang memblokir: node terakhir di trace dengan status blocked. */
function stepBlockedNode(
  steps: { nodeId: string; status: 'ok' | 'blocked'; reason?: string }[],
  dstId: string
): string | null {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].status === 'blocked') return steps[i].nodeId;
    if (steps[i].nodeId === dstId) return null;
  }
  return null;
}

/** Kumpulan edge berurutan sampai node terakhir (untuk animasi merah). */
function findPartialEdges(nodeIds: string[], edges: LabEdge[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < nodeIds.length - 1; i++) {
    const e = edges.find(
      (x) =>
        (x.sourceNodeId === nodeIds[i] && x.targetNodeId === nodeIds[i + 1]) ||
        (x.targetNodeId === nodeIds[i] && x.sourceNodeId === nodeIds[i + 1])
    );
    if (!e) break;
    out.push(e.id);
  }
  return out;
}