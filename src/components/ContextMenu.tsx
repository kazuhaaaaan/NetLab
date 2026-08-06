import React from 'react';
import { Terminal, Trash2, Power, Layers } from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  targetId?: string;
  targetType?: string;
  onOpenTerminal: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge?: (edgeId: string) => void;
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  targetId,
  targetType,
  onOpenTerminal,
  onDeleteNode,
  onDeleteEdge,
  onClose
}) => {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ left: `${x}px`, top: `${y}px` }}
      className="fixed z-50 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1.5 text-xs text-slate-200 font-sans"
    >
      {targetType === 'node' && targetId && (
        <>
          <button
            onClick={() => {
              onOpenTerminal(targetId);
              onClose();
            }}
            className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800 flex items-center space-x-2 text-blue-400 font-medium"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Open Vendor CLI</span>
          </button>
          <div className="h-px bg-slate-800 my-1" />
          <button
            onClick={() => {
              onDeleteNode(targetId);
              onClose();
            }}
            className="w-full text-left px-2.5 py-1.5 rounded hover:bg-rose-950/60 text-rose-400 font-medium flex items-center space-x-2"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Device</span>
          </button>
        </>
      )}

      {targetType === 'edge' && targetId && (
        <button
          onClick={() => {
            if (onDeleteEdge) onDeleteEdge(targetId);
            onClose();
          }}
          className="w-full text-left px-2.5 py-1.5 rounded hover:bg-rose-950/60 text-rose-400 font-medium flex items-center space-x-2"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete Cable</span>
        </button>
      )}

      {(!targetType || targetType === 'canvas') && (
        <div className="px-2.5 py-1.5 text-slate-500 italic text-[11px]">
          Tap node or edge for options
        </div>
      )}
    </div>
  );
};
