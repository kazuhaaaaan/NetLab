import React from 'react';
import { Minus, X } from 'lucide-react';

export interface WinWindowFrameProps {
  title: string;
  icon: React.ElementType;
  minimized: boolean;
  active: boolean;
  onFocus: () => void;
  onMinimize: () => void;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
  height?: number;
}

export const WinWindowFrame: React.FC<WinWindowFrameProps> = ({
  title,
  icon: Icon,
  minimized,
  active,
  onFocus,
  onMinimize,
  onClose,
  children,
  width,
  height,
}) => {
  if (minimized) return null;
  return (
    <div
      className={`absolute flex flex-col rounded-t-lg shadow-2xl border overflow-hidden ${
        active ? 'border-sky-400/60 z-20' : 'border-slate-600/60 z-10 opacity-90'
      }`}
      style={{ width: width ?? 640, height: height ?? 420 }}
      onMouseDown={onFocus}
    >
      <div
        className={`flex items-center gap-2 px-2 py-1.5 select-none cursor-default ${
          active
            ? 'bg-gradient-to-r from-sky-700 via-sky-600 to-sky-700 text-white'
            : 'bg-gradient-to-r from-slate-700 to-slate-600 text-slate-200'
        }`}
      >
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[11px] font-semibold tracking-wide flex-1 truncate">{title}</span>
        <button
          className="p-0.5 rounded hover:bg-white/20 text-white/80"
          onClick={(e) => {
            e.stopPropagation();
            onMinimize();
          }}
          title="Minimize"
        >
          <Minus className="w-3 h-3" />
        </button>
        <button
          className="p-0.5 rounded hover:bg-rose-600 text-white/80"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          title="Close"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
      <div className="flex-1 bg-[#1c1e24] text-slate-200 overflow-hidden flex flex-col min-h-0">{children}</div>
    </div>
  );
};