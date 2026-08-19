import React, { useEffect, useRef, useState } from 'react';
import { Bot, Send, Sparkles, X, Eraser, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { AiPermissionMode } from '../modules/ai/agent/types';

interface ChatMsg {
  id: string;
  role: 'user' | 'ai';
  text: string;
}

interface AiChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onAsk: (question: string) => string | Promise<string>;
  llmOnline?: boolean;
  /** Mode izin AI Network Agent (canvas). */
  mode?: AiPermissionMode;
  onModeChange?: (mode: AiPermissionMode) => void;
  /** Pesan yang disuntikkan dari luar (hasil eksekusi agent). */
  injectedMessage?: { id: number; text: string } | null;
  onInjectedConsumed?: () => void;
}

const WELCOME =
  'Halo! Saya Aikari, AI Mentor NetLab.\n' +
  'Saya bisa menganalisis jaringan, membuat lab, dan mengubah topologi:\n' +
  '- "kenapa PC1 tidak bisa ping 10.0.0.1" → diagnosa root cause\n' +
  '- "buat lab OSPF 3 router" → action plan (tinjau dulu, lalu eksekusi)\n' +
  '- "konfigurasi IP ether1 10.0.0.1/24 di R1" → rencana konfigurasi\n' +
  '- "jelaskan DHCP", "bagaimana cara routing bekerja" → materi\n\n' +
  'Mode izin menentukan apa yang boleh saya lakukan:\n' +
  'Read Only = hanya analisis · Propose = rencana (tinjau dulu) · Execute = terapkan.';

const QUICK_QUESTIONS = [
  'kenapa PC1 tidak bisa ping 10.0.0.1',
  'buat lab OSPF 3 router',
  'buat lab VLAN untuk pemula',
  'konfigurasi IP ether1 10.0.0.1/24 di R1',
  'jelaskan DHCP',
  'diagnosa jaringan',
];

const MODE_META: Record<AiPermissionMode, { icon: React.ReactNode; label: string; cls: string }> = {
  read_only: { icon: <Shield className="w-3 h-3" />, label: 'Read Only', cls: 'text-slate-300 border-slate-500/40' },
  propose: { icon: <ShieldAlert className="w-3 h-3" />, label: 'Propose', cls: 'text-amber-300 border-amber-500/40' },
  execute: { icon: <ShieldCheck className="w-3 h-3" />, label: 'Execute', cls: 'text-emerald-300 border-emerald-500/40' },
};

export const AiChatPanel: React.FC<AiChatPanelProps> = ({
  isOpen,
  onClose,
  onAsk,
  llmOnline,
  mode = 'propose',
  onModeChange,
  injectedMessage,
  onInjectedConsumed,
}) => {
  const [messages, setMessages] = useState<ChatMsg[]>([
    { id: 'welcome', role: 'ai', text: WELCOME },
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [isOpen, messages]);

  // Pesan suntikan dari luar (hasil eksekusi agent) → tampil di chat.
  useEffect(() => {
    if (!injectedMessage) return;
    setMessages((prev) => [...prev, { id: `ai_${injectedMessage.id}`, role: 'ai', text: injectedMessage.text }]);
    onInjectedConsumed?.();
  }, [injectedMessage, onInjectedConsumed]);

  if (!isOpen) return null;

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || thinking) return;
    setMessages((prev) => [...prev, { id: `u_${Date.now()}`, role: 'user', text }]);
    setInput('');
    setThinking(true);
    try {
      const answer = await onAsk(text);
      setMessages((prev) => [...prev, { id: `a_${Date.now()}`, role: 'ai', text: answer }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: `a_${Date.now()}`, role: 'ai', text: `Maaf, terjadi kesalahan: ${err instanceof Error ? err.message : String(err)}` },
      ]);
    } finally {
      setThinking(false);
    }
  };

  const clear = () => {
    setMessages([{ id: 'welcome', role: 'ai', text: WELCOME }]);
    inputRef.current?.focus();
  };

  const modeMeta = MODE_META[mode];

  return (
    <div className="fixed bottom-5 right-5 z-[80] flex flex-col w-[min(92vw,400px)] h-[min(76vh,560px)] bg-[#12141A] border border-[#2B2D31] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2B2D31] bg-[#1A1D24]">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-500/40 flex items-center justify-center">
            <Bot className="w-4.5 h-4.5 text-violet-300" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
              AI Mentor
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
              <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${llmOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              {llmOnline ? 'Gemini aktif · analisis jaringan real-time' : 'Mode offline · AI lokal'}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-1">
          {onModeChange && (
            <div className="flex items-center gap-0.5 mr-1 p-0.5 rounded-lg bg-[#0F1015] border border-[#2B2D31]">
              {(Object.keys(MODE_META) as AiPermissionMode[]).map((m) => {
                const meta = MODE_META[m];
                const active = m === mode;
                return (
                  <button
                    key={m}
                    onClick={() => onModeChange(m)}
                    title={`Mode ${meta.label}: ${m === 'read_only' ? 'hanya analisis' : m === 'propose' ? 'rencana tanpa eksekusi' : 'eksekusi aksi yang disetujui'}`}
                    className={`flex items-center gap-1 text-[9px] font-semibold px-1.5 py-1 rounded-md border transition ${
                      active
                        ? `bg-slate-800 ${meta.cls}`
                        : 'border-transparent text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {meta.icon}
                    <span className="hidden sm:inline">{meta.label}</span>
                  </button>
                );
              })}
            </div>
          )}
          <button
            onClick={clear}
            title="Hapus percakapan"
            className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
          >
            <Eraser className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            title="Tutup"
            className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[90%] whitespace-pre-wrap leading-relaxed rounded-xl px-3 py-2 font-mono ${
                m.role === 'user'
                  ? 'bg-violet-600/90 text-white rounded-br-sm'
                  : 'bg-[#1A1D24] border border-[#2B2D31] text-slate-200 rounded-bl-sm'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start">
            <div className="bg-[#1A1D24] border border-[#2B2D31] text-slate-400 rounded-xl rounded-bl-sm px-3 py-2 font-mono animate-pulse">
              Menganalisis jaringan…
            </div>
          </div>
        )}
      </div>

      {/* Quick questions */}
      <div className="px-3 pb-1 flex flex-wrap gap-1.5">
        {QUICK_QUESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => send(q)}
            className="text-[10px] px-2 py-1 rounded-full border border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Input */}
      <form
        className="p-3 border-t border-[#2B2D31] flex items-center space-x-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='Tanya AI… contoh: "buat lab OSPF 3 router"'
          className="flex-1 bg-[#0F1015] border border-[#2B2D31] rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-violet-500/60 transition font-mono"
        />
        <button
          type="submit"
          disabled={!input.trim() || thinking}
          title="Kirim"
          className="flex-shrink-0 w-9 h-9 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};