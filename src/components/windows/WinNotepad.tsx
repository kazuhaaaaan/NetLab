import React, { useState } from 'react';
import { FileText, Save, X } from 'lucide-react';
import type { WinHostProps } from './types';

interface WinNotepadProps extends WinHostProps {
  fileName?: string;
  initialContent?: string;
  onSave?: (name: string, content: string) => void;
  onCancel?: () => void;
}

/** Notepad — editor teks sederhana untuk file My Documents. */
export const WinNotepad: React.FC<WinNotepadProps> = ({
  nodeId,
  nodeName,
  getMem,
  onChanged,
  fileName = 'Untitled.txt',
  initialContent = '',
  onSave,
  onCancel,
}) => {
  const [name, setName] = useState(fileName);
  const [content, setContent] = useState(initialContent);

  const save = () => {
    if (onSave) {
      onSave(name, content);
    } else {
      // mode berdiri sendiri (dibuka dari ikon desktop): tulis ke My Documents
      const mem = getMem();
      const files = Array.isArray(mem.files) ? (mem.files as Array<{ name: string; content: string }>) : [];
      const rest = files.filter((f) => f.name !== name);
      mem.files = [...rest, { name, content }];
      onChanged();
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="w-[480px] max-h-[70vh] bg-[#1c1e24] border border-slate-600 rounded-lg shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-2 py-1.5 bg-gradient-to-r from-slate-700 to-slate-600 text-white select-none">
          <FileText className="w-3.5 h-3.5" />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 bg-transparent text-[11px] font-mono outline-none border-b border-transparent focus:border-slate-400"
          />
          <button onClick={onCancel} className="p-0.5 rounded hover:bg-rose-600">
            <X className="w-3 h-3" />
          </button>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="flex-1 min-h-[260px] bg-[#1a1c22] text-slate-100 text-[12px] font-mono p-3 outline-none resize-none"
          placeholder="Ketik di sini…"
        />
        <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-t border-slate-700">
          <span className="text-[9px] text-slate-500 font-mono">{content.length} char</span>
          <button onClick={save} className="flex items-center gap-1 px-3 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[11px]">
            <Save className="w-3 h-3" /> Simpan
          </button>
        </div>
      </div>
    </div>
  );
};