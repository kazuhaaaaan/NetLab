import React, { useEffect, useMemo, useState } from 'react';
import { X, Copy, Check, Download, Archive, AlertTriangle, AlertCircle, Info, FileCode2, RefreshCw } from 'lucide-react';
import type { LabProject } from '../types';
import { buildNodeExports, validateConfigExport, downloadText, downloadZip, type ExportWarning, type NodeExportEntry, type ConfigSource } from '../utils/configExport';

interface ConfigExportModalProps {
  open: boolean;
  nodeId?: string | null;
  project: LabProject;
  source: ConfigSource;
  onClose: () => void;
}

const severityIcon = (s: ExportWarning['severity']) =>
  s === 'error' ? (
    <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
  ) : s === 'warn' ? (
    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
  ) : (
    <Info className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
  );

const severityClass = (s: ExportWarning['severity']) =>
  s === 'error'
    ? 'border-rose-500/40 bg-rose-950/30 text-rose-200'
    : s === 'warn'
      ? 'border-amber-500/40 bg-amber-950/20 text-amber-200'
      : 'border-sky-500/40 bg-sky-950/20 text-sky-200';

/** Highlight CLI sederhana (komentar vs perintah). */
const CodePreview: React.FC<{ code: string }> = ({ code }) => {
  const parts = useMemo(
    () =>
      code.split('\n').map((line, i) => {
        let node: React.ReactNode = <span className="text-slate-300">{line}</span>;
        if (line.startsWith('#') || line.startsWith('!')) {
          node = <span className="text-slate-500 italic">{line}</span>;
        } else if (line.startsWith('set ') || line.startsWith('/')) {
          node = (
            <>
              <span className="text-sky-400 font-semibold">{line.split(/\s/)[0]}</span>
              <span className="text-slate-300">{line.slice(line.split(/\s/)[0].length)}</span>
            </>
          );
        } else {
          const m = line.match(/^(\S+)/);
          if (m) {
            node = (
              <>
                <span className="text-emerald-400 font-semibold">{m[1]}</span>
                <span className="text-slate-300">{line.slice(m[1].length)}</span>
              </>
            );
          }
        }
        return (
          <div key={i} className="whitespace-pre-wrap break-all">
            {node}
          </div>
        );
      }),
    [code]
  );
  return <pre className="text-[11px] leading-relaxed font-mono">{parts}</pre>;
};

export const ConfigExportModal: React.FC<ConfigExportModalProps> = ({ open, nodeId, project, source, onClose }) => {
  const [selectedId, setSelectedId] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (open) {
      setSelectedId(nodeId || project.nodes[0]?.id || '');
      setCopied(false);
    }
  }, [open, nodeId, project.nodes]);

  const entries = useMemo(
    () => (open ? buildNodeExports(project, source) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, project, source, refreshKey]
  );
  const warnings = useMemo(
    () => (open ? validateConfigExport(project, source) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, project, source, refreshKey]
  );
  const entry = entries.find((e) => e.nodeId === selectedId) || entries[0];
  const errorCount = warnings.filter((w) => w.severity === 'error').length;
  const warnCount = warnings.filter((w) => w.severity === 'warn').length;

  if (!open) return null;

  const copyCode = async () => {
    if (!entry) return;
    try {
      await navigator.clipboard.writeText(entry.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Salin config ini:', entry.content);
    }
  };

  const handleZip = async () => {
    setZipping(true);
    try {
      await downloadZip(entries);
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-3 sm:p-6">
      <div className="bg-[#0F1015] border border-[#2B2D31] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#2B2D31] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center">
              <FileCode2 className="w-4 h-4 text-emerald-400" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-100">Export Running Config</h2>
              <p className="text-[10px] text-slate-500 font-mono">
                {entries.length} perangkat · {errorCount} error · {warnCount} warning
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setRefreshKey((k) => k + 1)}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
              title="Refresh dari state CLI saat ini"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
              title="Tutup"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto grid md:grid-cols-[280px_1fr]">
          {/* ── Validasi ── */}
          <div className="p-3 border-r border-[#2B2D31] space-y-2">
            <div className="px-1 pb-1.5 text-[10px] font-mono text-slate-500 uppercase tracking-wider">
              Validasi topologi
            </div>
            {warnings.length === 0 && (
              <div className="px-3 py-4 text-center text-[11px] text-emerald-400/80 border border-emerald-500/30 bg-emerald-950/20 rounded-lg">
                Tidak ada masalah terdeteksi.
              </div>
            )}
            {warnings.map((w, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 px-2.5 py-2 rounded-lg border text-[11px] leading-snug ${severityClass(w.severity)}`}
              >
                {severityIcon(w.severity)}
                <span className="min-w-0">
                  {w.nodeName && (
                    <span className="font-mono text-[9.5px] text-slate-500 block mb-0.5">{w.nodeName}</span>
                  )}
                  {w.message}
                </span>
              </div>
            ))}
            <div className="pt-1.5 px-1 text-[9.5px] font-mono text-slate-600 leading-relaxed select-text">
              Catatan: config yang dibuat lewat Open Vendor CLI ikut di-ekspor. Klik tombol refresh untuk
              menarik state terbaru.
            </div>
          </div>

          {/* ── Preview config ── */}
          <div className="flex flex-col min-h-0">
            {entries.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-12">
                <FileCode2 className="w-10 h-10 text-slate-700 mb-3" />
                <p className="text-xs text-slate-400 font-medium">Tidak ada perangkat untuk di-ekspor.</p>
              </div>
            ) : (
              <>
                <div className="px-3 py-2 border-b border-[#2B2D31] flex flex-wrap items-center gap-1.5 shrink-0">
                  {entries.map((e) => (
                    <button
                      key={e.nodeId}
                      onClick={() => setSelectedId(e.nodeId)}
                      className={`px-2.5 py-1 rounded-md text-[10.5px] font-semibold font-mono transition border ${
                        e.nodeId === entry?.nodeId
                          ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                          : 'bg-[#1A1D24] border-[#2B2D31] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {e.nodeName}
                    </button>
                  ))}
                </div>

                {entry && (
                  <>
                    <div className="px-4 py-2.5 border-b border-[#2B2D31] flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider truncate">
                          {entry.filename} · {entry.lineCount} baris · {entry.ipCount}/{entry.portCount} port ber-IP
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={copyCode}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold transition"
                          title="Salin config ke clipboard"
                        >
                          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          {copied ? 'Tersalin!' : 'Copy'}
                        </button>
                        <button
                          onClick={() => downloadText(entry.filename, entry.content)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] font-bold transition"
                          title={`Unduh ${entry.filename}`}
                        >
                          <Download className="w-3.5 h-3.5" />
                          File
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto bg-[#07080A] p-3 min-h-[220px]">
                      {entry.content.trim() ? (
                        <CodePreview code={entry.content} />
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center py-10">
                          <RefreshCw className="w-8 h-8 text-slate-700 mb-2" />
                          <p className="text-xs text-slate-500 font-medium">
                            Node ini belum dikonfigurasi.
                          </p>
                          <p className="text-[10px] text-slate-600 mt-1">
                            Buka Open Vendor CLI dan konfigurasi dulu (IP address, interface, routing, dst).
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="px-4 py-2 border-t border-[#2B2D31] flex items-center justify-between shrink-0">
                      <span className="text-[9.5px] font-mono text-slate-600 select-text">
                        Format mengikuti vendor: RouterOS .rsc · Cisco IOS/NX-OS · Junos · VRP · EdgeOS · ArubaOS-CX · OpenWrt · Linux
                      </span>
                      <button
                        onClick={handleZip}
                        disabled={zipping}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[11px] font-bold transition"
                        title="Unduh semua config sebagai ZIP"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        {zipping ? 'Membuat ZIP…' : `Download Semua (.zip, ${entries.length})`}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};