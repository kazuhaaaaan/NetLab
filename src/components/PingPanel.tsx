import React, { useState } from 'react';
import { Activity, X, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { LabNode, LabEdge } from '../types';

export interface PingResult {
  id: string;
  srcNodeId: string;
  srcNodeName: string;
  dstNodeId: string;
  dstNodeName: string;
  dstIp: string;
  status: 'success' | 'failed' | 'pending' | 'running';
  message: string;
  timestamp: string;
}

interface PingPanelProps {
  nodes: LabNode[];
  edges: LabEdge[];
  pingResults: PingResult[];
  onClear: () => void;
  isOpen: boolean;
  onToggle: () => void;
  onRunPing: (id: string) => void;
}

export const PingPanel: React.FC<PingPanelProps> = ({
  nodes,
  edges,
  pingResults,
  onClear,
  isOpen,
  onToggle,
  onRunPing,
}) => {
  if (!isOpen) {
    return (
      <div className="fixed bottom-4 right-4 z-40">
        <button
          onClick={onToggle}
          className="relative flex items-center justify-center p-3 bg-slate-900 border border-emerald-500/50 hover:bg-slate-800 rounded-full shadow-lg shadow-emerald-900/20 text-emerald-400 transition"
          title="Open PDU / Ping Simulation"
        >
          <Activity className="w-5 h-5" />
          {pingResults.length > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
              {pingResults.length}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-full max-w-[480px] font-mono select-none rounded-xl overflow-hidden shadow-2xl border border-slate-700 flex flex-col">
      {/* Header bar */}
      <div className="w-full flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 text-xs">
        <div className="flex items-center space-x-2 text-emerald-400 font-bold">
          <Activity className="w-4 h-4" />
          <span>PDU / Ping Simulation</span>
          {pingResults.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-900/60 text-emerald-300 text-[10px]">
              {pingResults.length}
            </span>
          )}
        </div>
        <div className="flex items-center space-x-3 text-slate-400">
          {pingResults.length > 0 && (
            <button
              onClick={onClear}
              className="hover:text-rose-400 transition flex items-center space-x-1"
              title="Clear results"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={onToggle} className="hover:text-slate-200 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Result list */}
      <div className="bg-slate-950 max-h-64 overflow-y-auto">
          {pingResults.length === 0 ? (
            <div className="p-4 text-center text-slate-500 text-xs">
              <Activity className="w-6 h-6 mx-auto mb-2 text-slate-600" />
              <p>Pilih tool <span className="text-emerald-400 font-bold">Ping (PDU)</span> di toolbar</p>
              <p className="mt-1">Klik node <span className="text-cyan-400">Sumber</span> → klik node <span className="text-amber-400">Tujuan</span></p>
            </div>
          ) : (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/70 text-slate-400 text-[10px] uppercase">
                  <th className="px-3 py-1.5 text-left font-bold">Src</th>
                  <th className="px-3 py-1.5 text-left font-bold">Target IP</th>
                  <th className="px-3 py-1.5 text-left font-bold">Status</th>
                  <th className="px-3 py-1.5 text-left font-bold">Info</th>
                </tr>
              </thead>
              <tbody>
                {pingResults.map((r) => (
                  <tr key={r.id} className="border-b border-slate-900 hover:bg-slate-900/40 transition">
                    <td className="px-3 py-1.5 text-slate-200 font-semibold">{r.srcNodeName}</td>
                    <td className="px-3 py-1.5 text-cyan-300">{r.dstIp || r.dstNodeName}</td>
                    <td className="px-3 py-1.5">
                      {r.status === 'success' ? (
                        <span className="text-emerald-400 font-bold">✓ Success</span>
                      ) : r.status === 'failed' ? (
                        <span className="text-rose-400 font-bold">✗ Failed</span>
                      ) : r.status === 'pending' ? (
                        <button
                          onClick={() => onRunPing(r.id)}
                          className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10px] font-bold shadow-sm transition"
                        >
                          ▶ Run Test
                        </button>
                      ) : (
                        <span className="text-yellow-400 animate-pulse font-medium">⟳ Sending…</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-slate-400 truncate max-w-[140px]">{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
    </div>
  );
};
