import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Code2, FileText, Folder, Globe, Power, Settings, X } from 'lucide-react';
import type { NetworkSimulator } from '../../engine/net/core/NetworkSimulator';
import type { NodeMemory } from '../../../packages/vendors/src/common/types';
import { WinWindowFrame } from './WinWindow';
import { WinNetBrowser } from './WinNetBrowser';
import { WinNetworkSettings } from './WinNetworkSettings';
import { WinWebsiteEditor } from './WinWebsiteEditor';
import { WinFileExplorer } from './WinFileExplorer';
import { WinNotepad } from './WinNotepad';
import type { WinWindowDef } from './types';

interface WinDesktopModalProps {
  nodeId: string;
  nodeName: string;
  powered: boolean;
  sim: NetworkSimulator;
  getMem: () => NodeMemory;
  onChanged: () => void;
  onTogglePower: () => void;
  onClose: () => void;
}

interface OpenWin {
  def: WinWindowDef;
  minimized: boolean;
  z: number;
}

const ICON_DEFS = [
  { id: 'browser', label: 'NetBrowser', icon: Globe, color: 'text-sky-300', window: (p: WinHostPropsLike): WinWindowDef => ({ id: 'browser', title: 'NetBrowser', icon: Globe, width: 700, height: 440, content: <WinNetBrowser {...p} /> }) },
  { id: 'editor', label: 'Website Editor', icon: Code2, color: 'text-emerald-300', window: (p: WinHostPropsLike): WinWindowDef => ({ id: 'editor', title: 'Website Editor', icon: Code2, width: 640, height: 460, content: <WinWebsiteEditor {...p} /> }) },
  { id: 'network', label: 'Network Settings', icon: Settings, color: 'text-amber-300', window: (p: WinHostPropsLike): WinWindowDef => ({ id: 'network', title: 'Network Settings', icon: Settings, width: 620, height: 400, content: <WinNetworkSettings {...p} /> }) },
  { id: 'docs', label: 'My Documents', icon: Folder, color: 'text-cyan-300', window: (p: WinHostPropsLike): WinWindowDef => ({ id: 'docs', title: 'My Documents', icon: Folder, width: 620, height: 400, content: <WinFileExplorer {...p} /> }) },
  { id: 'notepad', label: 'Notepad', icon: FileText, color: 'text-slate-200', window: (p: WinHostPropsLike): WinWindowDef => ({ id: 'notepad', title: 'Notepad', icon: FileText, width: 480, height: 360, content: <WinNotepad {...p} /> }) },
];

type WinHostPropsLike = {
  nodeId: string;
  nodeName: string;
  sim: NetworkSimulator;
  getMem: () => NodeMemory;
  onChanged: () => void;
};

export const WinDesktopModal: React.FC<WinDesktopModalProps> = ({
  nodeId,
  nodeName,
  powered,
  sim,
  getMem,
  onChanged,
  onTogglePower,
  onClose,
}) => {
  const hostProps: WinHostPropsLike = useMemo(() => ({ nodeId, nodeName, sim, getMem, onChanged }), [nodeId, nodeName, sim, getMem, onChanged]);
  const [windows, setWindows] = useState<OpenWin[]>([]);
  const [startOpen, setStartOpen] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const zCounter = useRef(10);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  const openWindow = (def: WinWindowDef) => {
    setStartOpen(false);
    setWindows((prev) => {
      const existing = prev.find((w) => w.def.id === def.id);
      const z = ++zCounter.current;
      if (existing) {
        return prev.map((w) => (w.def.id === def.id ? { ...w, minimized: false, z } : w));
      }
      return [...prev, { def, minimized: false, z }];
    });
  };

  const closeWindow = (id: string) => {
    setWindows((prev) => prev.filter((w) => w.def.id !== id));
  };

  const minimizeWindow = (id: string) => {
    setWindows((prev) => prev.map((w) => (w.def.id === id ? { ...w, minimized: true } : w)));
  };

  const focusWindow = (id: string) => {
    setWindows((prev) => {
      const z = ++zCounter.current;
      return prev.map((w) => (w.def.id === id ? { ...w, z } : w));
    });
  };

  const active = [...windows].sort((a, b) => b.z - a.z)[0];
  const sorted = [...windows].sort((a, b) => a.z - b.z);

  const icon = (def: (typeof ICON_DEFS)[number]) => (
    <button
      key={def.id}
      className="flex flex-col items-center gap-1 w-20 p-1 rounded hover:bg-white/10 active:bg-white/20"
      onDoubleClick={() => openWindow(def.window(hostProps))}
    >
      <def.icon className={`w-8 h-8 ${def.color}`} />
      <span className="text-[9px] text-white text-center leading-tight drop-shadow">{def.label}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3" onMouseDown={onClose}>
      <div
        className="relative w-full max-w-4xl h-[86vh] rounded-xl overflow-hidden border border-slate-700 shadow-2xl flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* ── Desktop ── */}
        <div className="relative flex-1 win-wallpaper overflow-hidden">
          {!powered ? (
            <div className="absolute inset-0 bg-black flex flex-col items-center justify-center gap-3 text-center">
              <div className="text-slate-600 text-3xl font-bold select-none">[Komputer dimatikan]</div>
              <button
                onClick={onTogglePower}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-xs"
              >
                <Power className="w-4 h-4 text-emerald-400" /> Nyalakan {nodeName}
              </button>
            </div>
          ) : (
            <>
              {/* Ikon desktop */}
              <div className="absolute top-2 left-2 flex flex-col gap-1">{ICON_DEFS.map(icon)}</div>

              {/* Jendela */}
              {sorted.map((w) => (
                <WinWindowFrame
                  key={w.def.id}
                  title={w.def.title}
                  icon={w.def.icon}
                  minimized={w.minimized}
                  active={active?.def.id === w.def.id}
                  onFocus={() => focusWindow(w.def.id)}
                  onMinimize={() => minimizeWindow(w.def.id)}
                  onClose={() => closeWindow(w.def.id)}
                  width={w.def.width}
                  height={w.def.height}
                >
                  {w.def.content}
                </WinWindowFrame>
              ))}
            </>
          )}
        </div>

        {/* ── Taskbar ── */}
        <div className="h-10 bg-slate-800/95 border-t border-slate-700 flex items-center px-2 gap-1 relative">
          <button
            onClick={() => setStartOpen((o) => !o)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded hover:bg-slate-700 text-slate-200 text-[11px] font-semibold"
          >
            <span className="win-logo inline-block w-4 h-4" />
            Mulai
          </button>

          {windows.map((w) => (
            <button
              key={w.def.id}
              onClick={() => (w.minimized ? focusWindow(w.def.id) : minimizeWindow(w.def.id))}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-[10px] border ${
                active?.def.id === w.def.id && !w.minimized
                  ? 'bg-slate-700 border-sky-600 text-white'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <w.def.icon className="w-3 h-3" />
              {w.def.title}
            </button>
          ))}

          <div className="flex-1" />
          <div className="text-[10px] text-slate-300 font-mono px-2">
            {clock.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-rose-700 text-slate-300" title="Tutup desktop">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Start menu */}
        {startOpen && powered && (
          <div className="absolute bottom-12 left-2 w-56 bg-slate-800/95 border border-slate-600 rounded-lg shadow-2xl p-1.5">
            {ICON_DEFS.map((def) => (
              <button
                key={def.id}
                onClick={() => openWindow(def.window(hostProps))}
                className="flex items-center gap-2.5 w-full px-2 py-1.5 rounded hover:bg-slate-700 text-left"
              >
                <def.icon className={`w-4 h-4 ${def.color}`} />
                <span className="text-[11px] text-slate-200">{def.label}</span>
              </button>
            ))}
            <div className="border-t border-slate-600 my-1" />
            <button onClick={onTogglePower} className="flex items-center gap-2.5 w-full px-2 py-1.5 rounded hover:bg-rose-900/40 text-left">
              <Power className="w-4 h-4 text-rose-400" />
              <span className="text-[11px] text-rose-300">Matikan / Hidupkan {nodeName}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};