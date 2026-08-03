import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Plus, Trash2, Play, CheckCircle2, XCircle, ClipboardCheck } from 'lucide-react';
import { LabNode } from '../types';
import { SimulationEngine } from '../engine/sim';
import {
  GradingCheck,
  GradingResult,
  gradingCheckLabel,
  gradeProject,
  GRADING_TEMPLATES,
} from '../utils/grading';

interface GradingModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: LabNode[];
  engine: SimulationEngine;
}

const CHECKS_KEY = 'netlab_grading_checks_v1';

function loadChecks(): GradingCheck[] {
  try {
    const raw = localStorage.getItem(CHECKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GradingCheck[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Input params yang relevan per tipe check. */
function paramsOf(type: string): string[] {
  switch (type) {
    case 'ip':
      return ['iface', 'cidr'];
    case 'route':
      return ['dst', 'gateway'];
    case 'ping':
    case 'tcp':
      return ['ip'];
    case 'vlan':
      return ['iface', 'vlanId'];
    case 'trunk':
    case 'shutdown':
    case 'subinterface':
      return ['iface'];
    case 'bgp':
      return ['asn'];
    default:
      return [];
  }
}

export const GradingModal: React.FC<GradingModalProps> = ({ isOpen, onClose, nodes, engine }) => {
  const [checks, setChecks] = useState<GradingCheck[]>([]);
  const [results, setResults] = useState<GradingResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const firstNodeId = useMemo(() => nodes[0]?.id || '', [nodes]);

  useEffect(() => {
    if (isOpen) setChecks(loadChecks());
  }, [isOpen]);

  if (!isOpen) return null;

  const persist = (next: GradingCheck[]) => {
    setChecks(next);
    try {
      localStorage.setItem(CHECKS_KEY, JSON.stringify(next.slice(0, 60)));
    } catch {
      // storage penuh — abaikan
    }
  };

  const addCheck = (type: GradingCheck['type'], params: Record<string, string>) => {
    const template = GRADING_TEMPLATES.find((t) => t.type === type);
    const check: GradingCheck = {
      id: `chk-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type,
      nodeId: firstNodeId,
      label: template?.label || type,
      params: { ...(template?.params || {}), ...params },
    };
    persist([...checks, check]);
    setResults(null);
  };

  const updateCheck = (id: string, patch: Partial<GradingCheck>) => {
    persist(checks.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    setResults(null);
  };

  const removeCheck = (id: string) => {
    persist(checks.filter((c) => c.id !== id));
    setResults(null);
  };

  const run = () => {
    if (checks.length === 0) return;
    setRunning(true);
    // Evaluasi sinkron tapi sedikit delay agar ada feedback tombol
    window.setTimeout(() => {
      const res = gradeProject(engine, checks);
      setResults(res);
      setRunning(false);
    }, 250);
  };

  const passed = results?.filter((r) => r.pass).length ?? 0;
  const score = results && results.length > 0 ? Math.round((passed / results.length) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex justify-between items-center flex-shrink-0">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-violet-400" />
            Auto-Grading Lab
            <span className="text-[11px] font-normal text-slate-400">
              — validasi konfigurasi topologi terhadap checklist
            </span>
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Template checklist */}
          <div>
            <div className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase mb-2">
              Tambah Requirement (+)
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1.5">
              {GRADING_TEMPLATES.map((t) => (
                <button
                  key={t.type}
                  onClick={() => addCheck(t.type, {})}
                  className="flex items-center justify-between px-2 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] text-slate-200 transition text-left"
                >
                  <span className="truncate">{t.label}</span>
                  <Plus className="w-3 h-3 text-violet-400 flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* Checklist list */}
          <div>
            <div className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase mb-2">
              Checklist ({checks.length})
            </div>
            {checks.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs border border-dashed border-slate-700 rounded-lg">
                Belum ada requirement — klik tombol di atas untuk menambahkan, contoh: "Router-R1 harus punya
                OSPF aktif" atau "PC-1 bisa ping ke 10.0.0.2".
              </div>
            ) : (
              <div className="space-y-2">
                {checks.map((c) => {
                  const r = results?.find((x) => x.checkId === c.id);
                  return (
                    <div
                      key={c.id}
                      className={`bg-[#1A1D24] border rounded-md p-2.5 space-y-2 ${
                        r ? (r.pass ? 'border-emerald-700/60' : 'border-rose-700/60') : 'border-[#2B2D31]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {r ? (
                            r.pass ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                            ) : (
                              <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                            )
                          ) : (
                            <span className="w-4 h-4 rounded-full border border-slate-600 flex-shrink-0" />
                          )}
                          <span className="text-xs font-semibold text-slate-100 truncate">
                            {gradingCheckLabel(c.type, c.params)}
                          </span>
                        </div>
                        <button
                          onClick={() => removeCheck(c.id)}
                          className="text-slate-500 hover:text-rose-400 transition flex-shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-0.5">Perangkat</label>
                          <select
                            value={c.nodeId}
                            onChange={(e) => updateCheck(c.id, { nodeId: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-violet-500"
                          >
                            {nodes.map((n) => (
                              <option key={n.id} value={n.id}>
                                {n.name} ({n.deviceType})
                              </option>
                            ))}
                          </select>
                        </div>
                        {paramsOf(c.type).map((p) => (
                          <div key={p}>
                            <label className="text-[10px] text-slate-500 block mb-0.5">{p}</label>
                            <input
                              type="text"
                              value={c.params[p] || ''}
                              placeholder={p === 'iface' ? 'cth: eth1 / Gi0/1' : p === 'cidr' ? 'cth: 192.168.1.0/24' : ''}
                              onChange={(e) =>
                                updateCheck(c.id, { params: { ...c.params, [p]: e.target.value } })
                              }
                              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-violet-500 font-mono"
                            />
                          </div>
                        ))}
                      </div>

                      {r && (
                        <div
                          className={`text-[11px] rounded px-2 py-1 border ${
                            r.pass
                              ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
                              : 'bg-rose-950/40 border-rose-800/50 text-rose-300'
                          }`}
                        >
                          {r.detail}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer: run + score */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between flex-shrink-0">
          <div className="text-xs text-slate-400">
            {results ? (
              <span className="font-mono">
                Skor: <span className={score >= 80 ? 'text-emerald-400 font-bold' : score >= 50 ? 'text-amber-400 font-bold' : 'text-rose-400 font-bold'}>{score}%</span>{' '}
                ({passed}/{results.length} lulus)
              </span>
            ) : (
              <span className="text-slate-500">Jalankan untuk melihat skor</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {results && (
              <button
                onClick={() => setResults(null)}
                className="px-3 py-1.5 rounded-md text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              >
                Bersihkan Hasil
              </button>
            )}
            <button
              onClick={run}
              disabled={running || checks.length === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 transition"
            >
              <Play className="w-3.5 h-3.5" />
              {running ? 'Menilai…' : 'Jalankan Grading'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
