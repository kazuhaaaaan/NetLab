import React, { useEffect, useMemo, useState } from 'react';
import { X, BookOpen, Search, Copy, Check, FileCode2, Radio } from 'lucide-react';
import {
  CONFIG_LIBRARY,
  CONFIG_LIBRARY_CATEGORIES,
  searchSnippets,
  type ConfigSnippet,
} from '../data/configLibrary';

interface ConfigLibraryModalProps {
  open: boolean;
  onClose: () => void;
}

export const ConfigLibraryModal: React.FC<ConfigLibraryModalProps> = ({ open, onClose }) => {
  const [query, setQuery] = useState('');
  const [vendor, setVendor] = useState<'all' | 'mikrotik' | 'cisco'>('all');
  const [category, setCategory] = useState<string>('all');
  const [selected, setSelected] = useState<ConfigSnippet | null>(null);
  const [copied, setCopied] = useState(false);

  const results = useMemo(() => {
    return searchSnippets(query).filter(
      (s) => (vendor === 'all' || s.vendor === vendor) && (category === 'all' || s.category === category)
    );
  }, [query, vendor, category]);

  // Auto-select snippet pertama saat daftar berubah
  useEffect(() => {
    if (selected && !results.some((s) => s.id === selected.id)) {
      setSelected(results[0] ?? null);
    }
  }, [results, selected]);

  const copy = async (s: ConfigSnippet) => {
    try {
      await navigator.clipboard.writeText(s.content);
      setSelected(s);
      setCopied(true);
      setTimeout(() => setCopied(false), 1700);
    } catch {
      window.prompt('Salin script ini:', s.content);
    }
  };

  if (!open) return null;

  const cats = CONFIG_LIBRARY_CATEGORIES.filter(
    (c) => CONFIG_LIBRARY.some((s) => s.category === c.id && (vendor === 'all' || s.vendor === vendor))
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-3 sm:p-6">
      <div className="bg-[#0F1015] border border-[#2B2D31] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-4 py-3 border-b border-[#2B2D31] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-amber-600/20 border border-amber-500/40 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-amber-400" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-100">Config Library</h2>
              <p className="text-[10px] text-slate-500 font-mono">
                {CONFIG_LIBRARY.length} template script MikroTik & Cisco — baca, pilih, salin
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

        {/* Toolbar: search + filter */}
        <div className="px-4 py-2.5 border-b border-[#2B2D31] space-y-2 shrink-0">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari: masquerade, ospf, vlan, acl..."
                className="w-full bg-[#0B0C0E] border border-[#2B2D31] rounded-md pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 outline-none focus:border-amber-500/60"
              />
            </div>
            <div className="flex gap-1 shrink-0">
              <button
                onClick={() => setVendor('all')}
                className={`px-2.5 py-1.5 rounded-md border text-[10px] font-bold transition ${
                  vendor === 'all'
                    ? 'bg-amber-600/20 border-amber-500/50 text-amber-300'
                    : 'bg-[#1A1D24] border-[#2B2D31] text-slate-400 hover:text-slate-200'
                }`}
              >
                Semua
              </button>
              <button
                onClick={() => setVendor('mikrotik')}
                title="Hanya MikroTik RouterOS"
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-[10px] font-bold transition ${
                  vendor === 'mikrotik'
                    ? 'bg-amber-600/20 border-amber-500/50 text-amber-300'
                    : 'bg-[#1A1D24] border-[#2B2D31] text-slate-400 hover:text-slate-200'
                }`}
              >
                <Radio className="w-3 h-3" /> MikroTik
              </button>
              <button
                onClick={() => setVendor('cisco')}
                title="Hanya Cisco IOS"
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-[10px] font-bold transition ${
                  vendor === 'cisco'
                    ? 'bg-amber-600/20 border-amber-500/50 text-amber-300'
                    : 'bg-[#1A1D24] border-[#2B2D31] text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileCode2 className="w-3 h-3" /> Cisco
              </button>
            </div>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            <button
              onClick={() => setCategory('all')}
              className={`px-2.5 py-1 rounded-md border text-[10px] font-semibold whitespace-nowrap transition ${
                category === 'all'
                  ? 'bg-amber-600/20 border-amber-500/50 text-amber-300'
                  : 'bg-[#1A1D24] border-[#2B2D31] text-slate-400 hover:text-slate-200'
              }`}
            >
              Semua Kategori
            </button>
            {cats.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`px-2.5 py-1 rounded-md border text-[10px] font-semibold whitespace-nowrap transition ${
                  category === c.id
                    ? 'bg-amber-600/20 border-amber-500/50 text-amber-300'
                    : 'bg-[#1A1D24] border-[#2B2D31] text-slate-400 hover:text-slate-200'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0 flex">
          {/* Daftar snippet */}
          <div className="w-64 shrink-0 border-r border-[#2B2D31] overflow-y-auto p-2 space-y-1">
            {results.length === 0 && (
              <div className="py-8 text-center text-slate-500 text-[11px]">Tidak ada hasil.</div>
            )}
            {results.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelected(s)}
                className={`w-full text-left px-2.5 py-2 rounded-lg border transition ${
                  selected?.id === s.id
                    ? 'bg-amber-500/10 border-amber-500/40'
                    : 'bg-[#1A1D24] border-transparent hover:border-[#2B2D31]'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {s.vendor === 'mikrotik' ? (
                    <Radio className="w-3 h-3 text-amber-400 shrink-0" />
                  ) : (
                    <FileCode2 className="w-3 h-3 text-sky-400 shrink-0" />
                  )}
                  <span className="text-[11px] font-semibold text-slate-200 truncate">{s.title}</span>
                </div>
                <p className="text-[9.5px] text-slate-500 mt-0.5 line-clamp-2">{s.description}</p>
              </button>
            ))}
          </div>

          {/* Detail snippet */}
          <div className="flex-1 min-w-0 flex flex-col">
            {selected ? (
              <>
                <div className="px-3.5 py-2.5 border-b border-[#2B2D31] flex items-center justify-between shrink-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-bold text-slate-100 truncate">{selected.title}</span>
                      <span className="px-1.5 py-0.5 rounded border border-slate-700 text-[9px] font-mono text-slate-400 shrink-0">
                        {selected.vendor === 'mikrotik' ? '.rsc' : '.txt'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">{selected.description}</p>
                  </div>
                  <button
                    onClick={() => copy(selected)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold transition shrink-0"
                    title="Salin ke clipboard"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Tersalin!' : 'Salin'}
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto bg-[#07080A] p-3">
                  <pre className="text-[11px] leading-relaxed font-mono text-slate-200 whitespace-pre-wrap break-all select-text">
                    {selected.content}
                  </pre>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-600 py-10 gap-1.5">
                <BookOpen className="w-7 h-7" />
                <p className="text-xs text-slate-500">Pilih snippet di panel kiri</p>
                <p className="text-[10px] font-mono">atau cari dengan kata kunci</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};