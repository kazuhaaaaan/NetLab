import React, { useState } from 'react';
import { FileText, Save, X } from 'lucide-react';
import type { WinHostProps } from './types';

interface WinNotepadProps extends WinHostProps {
  fileName?: string;
  initialContent?: string;
  onSave?: (name: string, content: string) => void;
  onCancel?: () => void;
}

/** Notepad — editor teks sederhana untuk file My Documents.
 *  Panel INLINE (mengisi jendela window manager), bukan modal overlay sendiri:
 *  tombol X = onCancel (disediakan window manager / File Explorer). */
export const WinNotepad: React.FC<WinNotepadProps> = ({
  getMem,
  onChanged,
  fileName = 'Untitled.txt',
  initialContent = '',
  onSave,
  onCancel,
}) => {
  const [name, setName] = useState(fileName);
  const [content, setContent] = useState(initialContent);
  const [savedFlash, setSavedFlash] = useState(false);

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
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1800);
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#1c1e24]">
      <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-800 border-b border-slate-600 text-white select-none">
        <FileText className="w-3.5 h-3.5 shrink-0" />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 min-w-0 bg-transparent text-[11px] font-mono outline-none border-b border-transparent focus:border-slate-400"
          aria-label="Nama file"
        />
        <button
          onClick={onCancel}
          className="p-1 rounded hover:bg-rose-600 text-white/80"
          title="Tutup"
          aria-label="Tutup Notepad"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="flex-1 min-h-0 bg-[#1a1c22] text-slate-100 text-[12px] font-mono p-3 outline-none resize-none"
        placeholder="Ketik di sini…"
        spellCheck={false}
      />
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-t border-slate-700">
        <span className="text-[9px] text-slate-500 font-mono">{content.length} char</span>
        <div className="flex items-center gap-2">
          {savedFlash && <span className="text-[9px] text-emerald-400 font-mono">Tersimpan ✓</span>}
          <button
            onClick={save}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[11px]"
          >
            <Save className="w-3 h-3" /> Simpan
          </button>
        </div>
      </div>
    </div>
  );
};