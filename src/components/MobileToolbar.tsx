import React from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Terminal,
  Plus,
  Cable,
  Hand,
  Activity
} from 'lucide-react';
import { ActiveTool } from '../types';

interface MobileToolbarProps {
  activeTool: ActiveTool;
  onSelectTool: (tool: ActiveTool) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onToggleTerminal: () => void;
  onQuickAddRouter: () => void;
}

export const MobileToolbar: React.FC<MobileToolbarProps> = ({
  activeTool,
  onSelectTool,
  onZoomIn,
  onZoomOut,
  onResetView,
  onToggleTerminal,
  onQuickAddRouter
}) => {
  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-30 max-w-[95vw] overflow-x-auto scrollbar-hide bg-slate-900/90 border border-slate-800 rounded-2xl px-3 py-2 shadow-2xl backdrop-blur-md flex items-center space-x-2 text-slate-200">
      <button
        onClick={() => onSelectTool('select')}
        className={`flex-shrink-0 p-2 rounded-xl transition ${
          activeTool === 'select' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-400'
        }`}
        title="Select Tool"
      >
        <Hand className="w-5 h-5" />
      </button>

      <button
        onClick={() => onSelectTool('cable')}
        className={`flex-shrink-0 p-2 rounded-xl transition ${
          activeTool === 'cable' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-400'
        }`}
        title="Cable Cable Connect"
      >
        <Cable className="w-5 h-5" />
      </button>

      <button
        onClick={() => onSelectTool('ping')}
        className={`flex-shrink-0 p-2 rounded-xl transition ${
          activeTool === 'ping' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/50' : 'hover:bg-slate-800 text-slate-400'
        }`}
        title="Ping / PDU Tool — click src then dst"
      >
        <Activity className="w-5 h-5" />
      </button>

      <div className="h-5 w-px bg-slate-800 flex-shrink-0" />

      <button onClick={onQuickAddRouter} className="flex-shrink-0 p-2 hover:bg-slate-800 text-blue-400 rounded-xl transition" title="Quick Add Router">
        <Plus className="w-5 h-5" />
      </button>

      <button onClick={onZoomIn} className="flex-shrink-0 p-2 hover:bg-slate-800 text-slate-300 rounded-xl transition" title="Zoom In">
        <ZoomIn className="w-5 h-5" />
      </button>

      <button onClick={onZoomOut} className="flex-shrink-0 p-2 hover:bg-slate-800 text-slate-300 rounded-xl transition" title="Zoom Out">
        <ZoomOut className="w-5 h-5" />
      </button>

      <button onClick={onResetView} className="flex-shrink-0 p-2 hover:bg-slate-800 text-slate-300 rounded-xl transition" title="Reset View">
        <Maximize2 className="w-5 h-5" />
      </button>

      <div className="h-5 w-px bg-slate-800 flex-shrink-0" />

      <button
        onClick={onToggleTerminal}
        className="flex-shrink-0 p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-md transition"
        title="Toggle CLI Terminal"
      >
        <Terminal className="w-5 h-5" />
      </button>
    </div>
  );
};
