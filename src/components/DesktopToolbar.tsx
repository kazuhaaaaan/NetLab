import React, { useState } from 'react';
import { Hand, Cable, Plus, Terminal, Expand, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { ActiveTool } from '../types';

interface DesktopToolbarProps {
  activeTool: ActiveTool;
  onSelectTool: (tool: ActiveTool) => void;
  onOpenAddDevice: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onToggleTerminal: () => void;
}

interface ToolButtonProps {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  accent?: 'blue' | 'emerald';
  onClick: () => void;
}

const ToolButton: React.FC<ToolButtonProps> = ({ label, icon, active, accent, onClick }) => {
  const base =
    accent === 'blue'
      ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
      : accent === 'emerald'
        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40'
        : active
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
          : 'bg-slate-800/80 text-slate-300 border border-slate-700';
  return (
    <button
      onClick={onClick}
      className={`min-w-0 flex items-center justify-center gap-1.5 h-10 px-3 rounded-xl ${base} transition active:scale-95`}
    >
      {icon && <span className="flex items-center justify-center shrink-0">{icon}</span>}
      <span className="text-[11px] font-semibold leading-none whitespace-nowrap">{label}</span>
    </button>
  );
};

/** Tool controller desktop — tool set SAMA dengan MobileToolbar (Select/Kabel/Tambah/
 *  View/Terminal) supaya desktop & mobile berbagi satu state machine yang sama. */
export const DesktopToolbar: React.FC<DesktopToolbarProps> = ({
  activeTool,
  onSelectTool,
  onOpenAddDevice,
  onZoomIn,
  onZoomOut,
  onResetView,
  onToggleTerminal,
}) => {
  const [viewOpen, setViewOpen] = useState(false);

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-1 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl px-2 py-1.5">
        <ToolButton
          label="Select"
          icon={<Hand className="w-4 h-4" />}
          active={activeTool === 'select' || activeTool === 'pan'}
          onClick={() => onSelectTool('select')}
        />
        <ToolButton
          label="Kabel"
          icon={<Cable className="w-4 h-4" />}
          active={activeTool === 'cable'}
          onClick={() => onSelectTool('cable')}
        />
        <ToolButton
          label="Tambah"
          icon={<Plus className="w-5 h-5" />}
          accent="blue"
          onClick={onOpenAddDevice}
        />
        <div className="relative flex items-center">
          <ToolButton
            label="View"
            icon={<Expand className="w-4 h-4" />}
            onClick={() => setViewOpen((v) => !v)}
          />
          {viewOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setViewOpen(false)} />
              <div
                className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full z-20 w-max min-w-44 max-w-[88vw] rounded-2xl bg-[#141519] border border-[#2B2D31] shadow-2xl p-1.5 animate-in fade-in slide-in-from-bottom-2 duration-150"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => { onZoomIn(); setViewOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium text-slate-200 hover:bg-slate-800 transition"
                >
                  <ZoomIn className="w-4 h-4 shrink-0" /> Perbesar
                </button>
                <button
                  onClick={() => { onZoomOut(); setViewOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium text-slate-200 hover:bg-slate-800 transition"
                >
                  <ZoomOut className="w-4 h-4 shrink-0" /> Perkecil
                </button>
                <button
                  onClick={() => { onResetView(); setViewOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium text-slate-200 hover:bg-slate-800 transition"
                >
                  <Maximize2 className="w-4 h-4 shrink-0" /> Reset View
                </button>
              </div>
            </>
          )}
        </div>
        <ToolButton
          label="Terminal"
          icon={<Terminal className="w-4 h-4" />}
          accent="emerald"
          onClick={() => {
            setViewOpen(false);
            onToggleTerminal();
          }}
        />
      </div>
    </div>
  );
};