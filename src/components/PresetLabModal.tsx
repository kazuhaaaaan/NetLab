import React, { useMemo, useState } from 'react';
import { X, FlaskConical, Search, Play, Layers, GitBranch, Radio, Wifi } from 'lucide-react';
import { LabProject } from '../types';
import { PRESET_LABS, type PresetLab } from '../data/presetLabs';

interface PresetLabModalProps {
  open: boolean;
  onClose: () => void;
  onLoadLab: (project: LabProject) => void;
}

const CATEGORY_META: Record<PresetLab['category'], { label: string; icon: React.ReactNode; color: string }> = {
  gateway: { label: 'Gateway & DHCP', icon: <Wifi className="w-3.5 h-3.5" />, color: 'text-emerald-300 border-emerald-600/40 bg-emerald-500/10' },
  switching: { label: 'Switching / VLAN', icon: <Layers className="w-3.5 h-3.5" />, color: 'text-amber-300 border-amber-600/40 bg-amber-500/10' },
  wan: { label: 'WAN / ISP', icon: <Radio className="w-3.5 h-3.5" />, color: 'text-cyan-300 border-cyan-600/40 bg-cyan-500/10' },
  routing: { label: 'Routing Dinamis', icon: <GitBranch className="w-3.5 h-3.5" />, color: 'text-violet-300 border-violet-600/40 bg-violet-500/10' },
};

export const PresetLabModal: React.FC<PresetLabModalProps> = ({ open, onClose, onLoadLab }) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<PresetLab['category'] | 'all'>('all');

  const labs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return PRESET_LABS.filter((l) => {
      if (filter !== 'all' && l.category !== filter) return false;
      if (!q) return true;
      return (
        l.title.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q) ||
        l.features.some((f) => f.toLowerCase().includes(q))
      );
    });
  }, [search, filter]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-3 sm:p-6">
      <div className="bg-[#0F1015] border border-[#2B2D31] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-4 py-3 border-b border-[#2B2D31] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center">
              <FlaskConical className="w-4 h-4 text-emerald-400" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-100">Load Lab Preset</h2>
              <p className="text-[10px] text-slate-500 font-mono">
                Topologi lengkap siap pakai — 1 klik langsung digambar di canvas
              </p>
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

        {/* Search & filter */}
        <div className="px-4 py-2.5 border-b border-[#2B2D31] space-y-2 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari lab: vlan, ospf, dhcp, isp..."
              className="w-full bg-[#0B0C0E] border border-[#2B2D31] rounded-md pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 outline-none focus:border-emerald-500/60"
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            <button
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded-md border text-[10px] font-semibold whitespace-nowrap transition ${
                filter === 'all'
                  ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                  : 'bg-[#1A1D24] border-[#2B2D31] text-slate-400 hover:text-slate-200'
              }`}
            >
              Semua ({PRESET_LABS.length})
            </button>
            {(Object.keys(CATEGORY_META) as PresetLab['category'][]).map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md border text-[10px] font-semibold whitespace-nowrap transition ${
                  filter === c
                    ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                    : 'bg-[#1A1D24] border-[#2B2D31] text-slate-400 hover:text-slate-200'
                }`}
              >
                {CATEGORY_META[c].icon} {CATEGORY_META[c].label}
              </button>
            ))}
          </div>
        </div>

        {/* Lab cards */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {labs.length === 0 && (
            <div className="py-10 text-center text-slate-500 text-xs">
              Tidak ada lab yang cocok dengan pencarian.
            </div>
          )}
          {labs.map((lab) => {
            const meta = CATEGORY_META[lab.category];
            return (
              <div
                key={lab.id}
                className="bg-[#1A1D24] border border-[#2B2D31] rounded-xl p-3.5 hover:border-emerald-500/40 transition group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-[13px] font-bold text-slate-100">{lab.title}</h3>
                      <span className={`px-1.5 py-0.5 rounded border text-[9px] font-semibold ${meta.color}`}>
                        {meta.label}
                      </span>
                      <span className="px-1.5 py-0.5 rounded border border-slate-700 text-slate-400 text-[9px] font-semibold">
                        {lab.difficulty}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">{lab.description}</p>
                    <p className="text-[10px] font-mono text-slate-600 mt-1.5">{lab.topologySummary}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {lab.features.map((f) => (
                        <span
                          key={f}
                          className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[9px] font-mono text-slate-400"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      onLoadLab(lab.build());
                      onClose();
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold shadow-lg shadow-emerald-900/30 transition shrink-0 active:scale-95"
                    title={`Muat ${lab.title}`}
                  >
                    <Play className="w-3.5 h-3.5" /> Muat
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};