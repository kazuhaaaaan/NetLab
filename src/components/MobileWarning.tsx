import React, { useEffect, useState } from 'react';
import { MonitorSmartphone, X } from 'lucide-react';

const DISMISS_KEY = 'mklab_mobile_warning_dismissed';

function detectMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(max-width: 767px)').matches ||
    window.matchMedia('(pointer: coarse)').matches
  );
}

export const MobileWarning: React.FC = () => {
  const [isMobile, setIsMobile] = useState(detectMobile);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const update = () => setIsMobile(detectMobile());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  if (!isMobile || dismissed) return null;

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // storage tidak tersedia â€” abaikan
    }
    setDismissed(true);
  };

  return (
    <div className="fixed bottom-3 left-3 right-3 sm:left-4 sm:right-auto sm:max-w-md z-[85] animate-in slide-in-from-bottom-4 fade-in duration-200">
      <div className="bg-[#0F1015]/95 backdrop-blur-md border border-amber-500/40 rounded-xl shadow-2xl p-3.5 flex items-start space-x-3">
        <div className="p-2 bg-amber-500/15 text-amber-400 rounded-lg border border-amber-500/30 flex-shrink-0">
          <MonitorSmartphone className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-xs font-bold text-amber-300">MikroAi paling optimal di Desktop / Laptop</h3>
          <p className="mt-1 text-[11px] text-slate-300 leading-relaxed">
            Website ini lebih mudah dioperasikan lewat komputer (desktop, laptop, atau
            MacBook) â€” mouse, keyboard, dan layar lebar memberikan pengalaman terbaik.
            Di ponsel, beberapa fitur seperti seret perangkat, hover kabel, dan terminal
            CLI lebih sulit digunakan.
          </p>
        </div>
        <button
          onClick={handleDismiss}
          title="Tutup peringatan"
          className="p-1 text-slate-400 hover:text-white rounded-md flex-shrink-0 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
