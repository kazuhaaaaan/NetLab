import React from 'react';
import { X } from 'lucide-react';

interface MobileSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** tinggi sheet; default 72dvh */
  height?: string;
}

export const MobileSheet: React.FC<MobileSheetProps> = ({
  open,
  onClose,
  title,
  children,
  height = 'h-[72dvh]',
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`absolute inset-x-0 bottom-0 ${height} rounded-t-2xl bg-[#0F1015] border-t border-[#26282E] shadow-2xl flex flex-col animate-in slide-in-from-bottom-4 fade-in duration-200 pb-[env(safe-area-inset-bottom)]`}
      >
        <div className="relative flex items-center justify-between px-4 pt-2 pb-3 border-b border-[#26282E] shrink-0">
          <div className="absolute left-1/2 -translate-x-1/2 top-1.5 w-10 h-1 rounded-full bg-slate-700" />
          <div className="flex-1" />
          <h2 className="flex-1 text-center text-sm font-bold text-slate-100 truncate">{title}</h2>
          <div className="flex-1 flex justify-end">
            <button
              onClick={onClose}
              title="Tutup"
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  );
};