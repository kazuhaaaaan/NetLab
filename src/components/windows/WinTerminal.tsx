import React, { useEffect, useRef, useState } from 'react';
import { TerminalSquare } from 'lucide-react';
import type { WinHostProps } from './types';

interface WinTerminalProps extends WinHostProps {
  /** Jalur eksekusi CLI yang SAMA dengan terminal utama (runCliCommand engine). */
  runCommand: (cmd: string) => string;
}

interface TermLine {
  kind: 'in' | 'out';
  text: string;
}

const PROMPT = 'C:\\Users\\admin>';

/** Terminal — jendela CLI nyata Windows Client, memakai engine simulation yang sama. */
export const WinTerminal: React.FC<WinTerminalProps> = ({ nodeName, runCommand }) => {
  const [lines, setLines] = useState<TermLine[]>([
    { kind: 'out', text: `Microsoft Windows [Version 11.0.22631.3737]` },
    { kind: 'out', text: `(c) Microsoft Corporation. Semua hak dilindungi.` },
    { kind: 'out', text: `` },
    { kind: 'out', text: `Ketik "help" untuk daftar perintah. Jalur paket nyata lewat mesin simulasi.` },
  ]);
  const [input, setInput] = useState('');
  const [hist, setHist] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  const submit = (raw: string) => {
    const cmd = raw.trim();
    if (!cmd) return;
    setHist((h) => [...h, cmd]);
    setHistIdx(-1);
    setLines((prev) => [...prev, { kind: 'in', text: `${PROMPT} ${cmd}` }]);
    if (/^(cls|clear)$/i.test(cmd)) {
      setLines([]);
      return;
    }
    const out = runCommand(cmd);
    const parts = out.split(/\r?\n/);
    setLines((prev) => [...prev, ...parts.map((t) => ({ kind: 'out' as const, text: t }))]);
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-black text-slate-100 font-mono text-[11px]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 leading-snug whitespace-pre-wrap break-words" onClick={() => inputRef.current?.focus()}>
        {lines.map((l, i) =>
          l.kind === 'in' ? (
            <div key={i} className="text-emerald-300">
              {l.text}
            </div>
          ) : (
            <div key={i}>{l.text}</div>
          )
        )}
      </div>
      <div className="flex items-center gap-1.5 px-2 pb-2">
        <span className="text-emerald-300 shrink-0 select-none">{PROMPT}</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              submit(input);
              setInput('');
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              const idx = histIdx === -1 ? hist.length - 1 : Math.max(0, histIdx - 1);
              if (hist[idx]) {
                setHistIdx(idx);
                setInput(hist[idx]);
              }
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              if (histIdx === -1) return;
              const idx = histIdx + 1;
              if (idx >= hist.length) {
                setHistIdx(-1);
                setInput('');
              } else {
                setHistIdx(idx);
                setInput(hist[idx]);
              }
            }
          }}
          className="flex-1 min-w-0 bg-transparent outline-none caret-emerald-300 text-slate-100"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Perintah terminal"
        />
      </div>
    </div>
  );
};

export const TerminalIcon = TerminalSquare;