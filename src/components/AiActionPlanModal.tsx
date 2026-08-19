import React, { useEffect, useState } from 'react';
import { X, Play, ShieldCheck, ShieldAlert, Shield, CheckCircle2, XCircle, RotateCcw, Lock } from 'lucide-react';
import type { ActionPlan, AiPermissionMode, ExecuteOutcome } from '../modules/ai/agent/types';

interface AiActionPlanModalProps {
  plan: ActionPlan | null;
  /** mode izin saat ini — eksekusi hanya diizinkan pada execute. */
  mode?: AiPermissionMode;
  onClose: () => void;
  onExecute: (plan: ActionPlan) => Promise<ExecuteOutcome>;
  /** pindahkan mode ke execute (persetujuan eksplisit user). */
  onRequestExecuteMode?: () => void;
}

const RISK_STYLE: Record<string, string> = {
  low: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40',
  medium: 'bg-amber-500/10 text-amber-300 border-amber-500/40',
  high: 'bg-rose-500/10 text-rose-300 border-rose-500/40',
};

const MODE_BADGE: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
  read_only: { icon: <Shield className="w-3.5 h-3.5" />, label: 'Read Only', cls: 'bg-slate-500/10 text-slate-300 border-slate-500/40' },
  propose: { icon: <ShieldAlert className="w-3.5 h-3.5" />, label: 'Propose', cls: 'bg-amber-500/10 text-amber-300 border-amber-500/40' },
  execute: { icon: <ShieldCheck className="w-3.5 h-3.5" />, label: 'Execute', cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40' },
};

export const AiActionPlanModal: React.FC<AiActionPlanModalProps> = ({ plan, mode = 'propose', onClose, onExecute, onRequestExecuteMode }) => {
  const [result, setResult] = useState<ExecuteOutcome | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setResult(null);
    setRunning(false);
  }, [plan?.id]);

  if (!plan) return null;

  const badge = MODE_BADGE[plan.mode] ?? MODE_BADGE.propose;

  const execute = async () => {
    setRunning(true);
    try {
      setResult(await onExecute(plan));
    } finally {
      setRunning(false);
    }
  };

  const requestExecute = async () => {
    onRequestExecuteMode?.();
    await execute();
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-[#12141A] border border-[#2B2D31] rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[86vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#2B2D31] bg-[#1A1D24] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-500/20 border border-violet-500/40 flex items-center justify-center">
              <Play className="w-4.5 h-4.5 text-violet-300" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-100">AI Action Plan</div>
              <div className="text-[11px] text-slate-400 font-mono">{plan.goal}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`flex items-center gap-1.5 text-[10px] font-semibold px-2 py-1 rounded-full border ${badge.cls}`}>
              {badge.icon} {badge.label}
            </span>
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!result ? (
          <>
            {/* Daftar aksi */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">
                {plan.actions.length} aksi akan dijalankan — tinjau sebelum eksekusi
              </div>
              <div className="space-y-2">
                {plan.actions.map((a, i) => (
                  <div key={a.id} className="bg-[#1A1D24] border border-[#2B2D31] rounded-lg px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] text-slate-500 font-mono w-5 flex-shrink-0">{i + 1}.</span>
                        <span className="text-xs font-mono text-violet-300 truncate">{a.type}</span>
                        {a.target && <span className="text-[10px] text-slate-400 font-mono truncate">→ {a.target}</span>}
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold flex-shrink-0 ${RISK_STYLE[a.risk] ?? RISK_STYLE.low}`}>
                        {a.risk}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1 pl-7">{a.reason}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 pl-7 font-mono">{a.expectedEffect}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-[#2B2D31] bg-[#1A1D24] flex items-center justify-between">
              <div className="text-[10px] text-slate-500">
                Setiap aksi diverifikasi terhadap state engine; kegagalan → rollback otomatis.
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-3 py-2 rounded-lg border border-[#2B2D31] text-slate-300 text-xs font-semibold hover:bg-slate-800 transition"
                >
                  Batal
                </button>
                {mode === 'read_only' ? (
                  <button
                    disabled
                    title="Mode Read Only — ubah ke Propose/Execute di panel chat"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-700/50 text-slate-400 text-xs font-bold cursor-not-allowed"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Read Only — tidak bisa eksekusi
                  </button>
                ) : mode === 'propose' ? (
                  <button
                    onClick={requestExecute}
                    disabled={running}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold transition"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {running ? 'Menjalankan…' : 'Aktifkan Execute & Jalankan'}
                  </button>
                ) : (
                  <button
                    onClick={execute}
                    disabled={running}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition"
                  >
                    <Play className="w-3.5 h-3.5" />
                    {running ? 'Menjalankan…' : 'Eksekusi'}
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Hasil eksekusi */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className={`flex items-center gap-2 rounded-lg px-3 py-2.5 border mb-3 ${
                result.ok
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
                  : result.rolledBack
                    ? 'bg-rose-500/10 border-rose-500/40 text-rose-200'
                    : 'bg-amber-500/10 border-amber-500/40 text-amber-200'
              }`}>
                {result.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <XCircle className="w-4 h-4 flex-shrink-0" />}
                <div>
                  <div className="text-xs font-bold">{result.message}</div>
                  {result.rolledBack && (
                    <div className="flex items-center gap-1 text-[10px] mt-0.5">
                      <RotateCcw className="w-3 h-3" /> Perubahan di-rollback — proyek kembali ke state semula.
                    </div>
                  )}
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {result.verifiedCount}/{result.verifications.length} verifikasi sukses · {result.failedCount} gagal
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {result.results.map((r) => (
                  <div key={r.actionId} className="flex items-start gap-2 bg-[#1A1D24] border border-[#2B2D31] rounded-lg px-3 py-2">
                    {r.ok ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-rose-400 mt-0.5 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="text-[11px] font-mono text-slate-200">{r.type} <span className="text-slate-500">→</span> <span className="text-slate-400">{r.message}</span></div>
                      {r.verification && (
                        <div className={`text-[10px] font-mono mt-0.5 ${r.verification.success ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {r.verification.label}: {r.verification.detail}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer hasil */}
            <div className="px-5 py-3 border-t border-[#2B2D31] bg-[#1A1D24] flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition"
              >
                Tutup
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};