import React, { useEffect, useRef, useState } from 'react';
import { Bot, Send, Sparkles, X, Eraser } from 'lucide-react';

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
}

const WELCOME =
  'Halo! Saya AI Mentor MikroAi.\n' +
  'Tanyakan apa saja tentang jaringan & konfigurasi — contoh:\n' +
  '"kenapa ping PC1 ke PC2 gagal?", "jelaskan DHCP",\n' +
  '"bagaimana cara routing bekerja?", "cara setting NAT di MikroTik?",\n' +
  'atau "perbaiki routing". Jawaban bebas, bisa lanjut dialog lanjutan.';

const QUICK_QUESTIONS = [
  'kenapa ping PC1 ke PC2 gagal',
  'jelaskan DHCP',
  'bagaimana cara kerja routing',
  'perbaiki route',
  'diagnosa jaringan',
  'ringkasan jaringan',
];

export const AiChatPanel: React.FC<AiChatPanelProps> = ({ isOpen, onClose, onAsk, llmOnline }) => {
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
          placeholder='Tanya AI… contoh: "cara setting NAT di MikroTik?"'
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
