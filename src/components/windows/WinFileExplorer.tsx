import React, { useMemo, useState } from 'react';
import { FileText, Folder, FolderOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import type { WinHostProps } from './types';
import { winSetFiles, winFilesOf } from '../../modules/windows/winMemory';
import { WinNotepad } from './WinNotepad';

const DEFAULT_NOTE = '';

/** File Explorer — My Documents (persisten lewat memory vendor). */
export const WinFileExplorer: React.FC<WinHostProps> = ({ nodeId, nodeName, getMem, onChanged, ...rest }) => {
  const mem = useMemo(() => getMem(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const files = winFilesOf(mem);
  const [editing, setEditing] = useState<{ name: string; content: string } | null>(null);
  const [newName, setNewName] = useState('');

  const open = (name: string) => {
    const f = files.find((x) => x.name === name);
    if (f) setEditing({ name: f.name, content: f.content });
  };

  const create = () => {
    const name = newName.trim();
    if (!name) return;
    if (files.some((f) => f.name === name)) return;
    winSetFiles(mem, [...files, { name, content: DEFAULT_NOTE }]);
    setNewName('');
    onChanged();
  };

  const save = (name: string, content: string) => {
    const rest = files.filter((f) => f.name !== name);
    winSetFiles(mem, [...rest, { name, content }]);
    setEditing(null);
    onChanged();
  };

  const remove = (name: string) => {
    winSetFiles(mem, files.filter((f) => f.name !== name));
    onChanged();
  };

  return (
    <div className="flex flex-col h-full text-[12px]">
      <div className="px-3 py-2 border-b border-slate-700 flex items-center gap-2">
        <FolderOpen className="w-4 h-4 text-amber-400" />
        <span className="text-[11px] font-mono text-slate-300">C:\Users\admin\Documents</span>
        <span className="flex-1" />
        <div className="flex items-center gap-1">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
            placeholder="nama file.txt"
            className="w-40 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] font-mono text-slate-200 focus:border-sky-600 outline-none"
          />
          <button onClick={create} className="p-1.5 rounded bg-sky-700 hover:bg-sky-600 text-white" title="Buat file baru">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-4 gap-2">
          {files.map((f) => (
            <div key={f.name} className="group bg-slate-900 border border-slate-700 rounded p-2 flex flex-col items-center gap-1 cursor-pointer hover:border-sky-600" onDoubleClick={() => open(f.name)}>
              <FileText className="w-8 h-8 text-slate-300" />
              <div className="text-[9px] text-slate-300 font-mono text-center break-all leading-tight">{f.name}</div>
              <div className="text-[8px] text-slate-500">{f.content.length} byte</div>
              <div className="hidden group-hover:flex gap-1">
                <button onClick={() => open(f.name)} className="p-1 rounded hover:bg-slate-700 text-sky-400" title="Buka di Notepad">
                  <Pencil className="w-3 h-3" />
                </button>
                <button onClick={() => remove(f.name)} className="p-1 rounded hover:bg-rose-900/40 text-rose-400" title="Hapus">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
          {files.length === 0 && (
            <div className="col-span-4 border border-dashed border-slate-700 rounded p-6 text-center text-slate-500 text-[11px]">
              <Folder className="w-6 h-6 mx-auto mb-1 opacity-50" />
              Folder kosong. Ketik nama file di kanan atas lalu klik +.
            </div>
          )}
        </div>
      </div>

      {editing && (
        <WinNotepad
          nodeId={nodeId}
          nodeName={nodeName}
          getMem={getMem}
          onChanged={onChanged}
          fileName={editing.name}
          initialContent={editing.content}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
};