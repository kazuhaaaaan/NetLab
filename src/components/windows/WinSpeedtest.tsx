import React, { useEffect, useRef, useState } from 'react';
import { Activity, ArrowDownToLine, ArrowUpFromLine, Gauge, Globe, RefreshCw, Wifi } from 'lucide-react';
import type { WinHostProps } from './types';

type Phase = 'idle' | 'ping' | 'download' | 'upload' | 'done';

interface Result {
  ping: number;
  jitter: number;
  download: number;
  upload: number;
  server: string;
  ip: string;
}

export const WinSpeedtest: React.FC<WinHostProps> = ({ nodeId, nodeName }) => {
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [dl, setDl] = useState(0);
  const [ul, setUl] = useState(0);
  const [res, setRes] = useState<Result | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };

  useEffect(() => () => stop(), []);

  const start = () => {
    stop();
    setPhase('ping');
    setProgress(0);
    setDl(0);
    setUl(0);
    setRes(null);

    let p = 0;
    timer.current = setInterval(() => {
      p += 10;
      setProgress(p);
      if (p >= 100) {
        stop();
        const ping = 4 + Math.floor(Math.random() * 9);
        const jitter = 0.8 + Math.random() * 1.6;
        setRes({ ping, jitter, download: 0, upload: 0, server: 'NetLab-Speedtest (Auto)', ip: '10.10.99.100' });
        setPhase('download');
        setProgress(0);
        let dp = 0;
        timer.current = setInterval(() => {
          dp += 6 + Math.random() * 8;
          if (dp > 100) dp = 100;
          setProgress(dp);
          const cur = Math.round((120 + Math.random() * 680) * (dp / 100) * (0.9 + Math.random() * 0.2));
          setDl(cur);
          if (dp >= 100) {
            stop();
            const dlf = Math.round(650 + Math.random() * 180);
            setDl(dlf);
            setPhase('upload');
            setProgress(0);
            let up = 0;
            timer.current = setInterval(() => {
              up += 8 + Math.random() * 10;
              if (up > 100) up = 100;
              setProgress(up);
              const curU = Math.round((90 + Math.random() * 420) * (up / 100) * (0.9 + Math.random() * 0.2));
              setUl(curU);
              if (up >= 100) {
                stop();
                const ulf = Math.round(420 + Math.random() * 140);
                setUl(ulf);
                setRes({ ping: res?.ping || 6, jitter: res?.jitter || 1.2, download: dlf, upload: ulf, server: 'NetLab-Speedtest (Auto)', ip: '10.10.99.100' });
                setPhase('done');
                setProgress(100);
              }
            }, 160);
          }
        }, 150);
      }
    }, 140);
  };

  const reset = () => {
    stop();
    setPhase('idle');
    setProgress(0);
    setDl(0);
    setUl(0);
    setRes(null);
  };

  return (
    <div className="flex flex-col h-full bg-[#0b1026] text-slate-200">
      <div className="flex items-center justify-between px-3 py-2 border-b border-cyan-500/30 bg-gradient-to-r from-cyan-500/10 to-emerald-500/10">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-cyan-300" />
          <div>
            <div className="text-xs font-semibold tracking-wide">NetSpeedTest</div>
            <div className="text-[9px] text-slate-400">Simulated bandwidth test • {nodeName}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[9px] text-slate-400">
          <Globe className="w-3 h-3" />
          <span>Server: {res?.server || 'NetLab-Speedtest (Auto)'}</span>
          <span className="mx-1 text-slate-600">|</span>
          <span>Host: {res?.ip || '10.10.99.100'}</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
        {phase === 'idle' && (
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="w-36 h-36 rounded-full border border-cyan-400/40 flex items-center justify-center">
                <div className="w-28 h-28 rounded-full bg-gradient-to-br from-cyan-400/20 to-emerald-400/10 flex items-center justify-center">
                  <Gauge className="w-10 h-10 text-cyan-300" />
                </div>
              </div>
            </div>
            <button onClick={start} className="px-6 py-2 rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 text-xs font-semibold hover:brightness-110 active:scale-[0.98] transition">GO</button>
            <div className="text-[10px] text-slate-500">Klik GO untuk mulai tes ke server NetLab</div>
          </div>
        )}

        {(phase === 'ping' || phase === 'download' || phase === 'upload') && (
          <div className="flex flex-col items-center gap-5 w-full max-w-sm">
            <div className="relative w-40 h-40">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth="2" />
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={phase === 'download' ? '#22d3ee' : phase === 'upload' ? '#34d399' : '#a5b4fc'} strokeWidth="2" strokeDasharray={`${progress}, 100`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {phase === 'ping' && <Activity className="w-6 h-6 text-indigo-300 mb-1" />}
                {phase === 'download' && <ArrowDownToLine className="w-6 h-6 text-cyan-300 mb-1" />}
                {phase === 'upload' && <ArrowUpFromLine className="w-6 h-6 text-emerald-300 mb-1" />}
                <div className="text-lg font-semibold tabular-nums">
                  {phase === 'ping' ? 'PING' : phase === 'download' ? dl : ul}
                  <span className="ml-1 text-xs text-slate-400">{phase === 'ping' ? 'ms' : 'Mbps'}</span>
                </div>
                <div className="text-[9px] uppercase tracking-[0.3em] text-slate-500 mt-1">{phase === 'ping' ? 'Testing latency' : phase === 'download' ? 'Download' : 'Upload'}</div>
              </div>
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div className={`h-full transition-all ${phase === 'download' ? 'bg-cyan-400' : phase === 'upload' ? 'bg-emerald-400' : 'bg-indigo-400'}`} style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {phase === 'done' && res && (
          <div className="flex flex-col items-center gap-6 w-full max-w-md">
            <div className="grid grid-cols-2 gap-3 w-full">
              <div className="rounded-lg border border-indigo-400/40 bg-indigo-400/5 p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400"><Activity className="w-3 h-3" /> Ping / Jitter</div>
                <div className="mt-2 flex items-end gap-2">
                  <div className="text-xl font-semibold tabular-nums">{res.ping}</div>
                  <div className="text-[10px] text-slate-400 mb-1">ms</div>
                  <div className="ml-auto text-right">
                    <div className="text-[9px] text-slate-500">Jitter</div>
                    <div className="text-sm tabular-nums">{res.jitter.toFixed(1)} ms</div>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-cyan-400/40 bg-cyan-400/5 p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400"><ArrowDownToLine className="w-3 h-3" /> Download</div>
                <div className="mt-2 flex items-end gap-2">
                  <div className="text-2xl font-semibold tabular-nums">{res.download}</div>
                  <div className="text-[10px] text-slate-400 mb-1">Mbps</div>
                </div>
              </div>
              <div className="col-span-2 rounded-lg border border-emerald-400/40 bg-emerald-400/5 p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400"><ArrowUpFromLine className="w-3 h-3" /> Upload</div>
                <div className="mt-2 flex items-end gap-2">
                  <div className="text-2xl font-semibold tabular-nums">{res.upload}</div>
                  <div className="text-[10px] text-slate-400 mb-1">Mbps</div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={start} className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-xs"><RefreshCw className="w-3.5 h-3.5" /> Test Again</button>
              <button onClick={reset} className="px-4 py-1.5 rounded-full bg-slate-800/70 hover:bg-slate-700 text-xs">Close Result</button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-3 py-1 border-t border-slate-800 text-[9px] text-slate-500">
        <div className="flex items-center gap-1.5"><Wifi className="w-3 h-3" /><span>{nodeId}</span></div>
        <span>NetLab Simulated • For educational use</span>
      </div>
    </div>
  );
};
