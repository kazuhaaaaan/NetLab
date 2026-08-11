import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Terminal, X, Minimize2, Maximize2, Send, BookOpen, ClipboardPaste, Copy, Check } from 'lucide-react';
import { LabNode, TerminalLog } from '../types';
import { VENDOR_MAP } from '../data/vendors';
import { getHints, getTabCompletion, CliHint } from '../data/cliHints';
import { getBeginnerGuide, VendorGuide } from '../data/beginnerGuide';

interface TerminalPanelProps {
  openNodes: LabNode[];
  activeNodeId: string | null;
  onSelectTab: (nodeId: string) => void;
  onCloseTab: (nodeId: string) => void;
  logs: Record<string, TerminalLog[]>;
  onSendCommand: (nodeId: string, cmd: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const TerminalPanel: React.FC<TerminalPanelProps> = ({
  openNodes,
  activeNodeId,
  onSelectTab,
  onCloseTab,
  logs,
  onSendCommand,
  isOpen,
  onClose
}) => {
  const [inputVal, setInputVal] = useState('');
  const [isMaximized, setIsMaximized] = useState(false);
  const [hints, setHints] = useState<CliHint[]>([]);
  const [showHints, setShowHints] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [showGuide, setShowGuide] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [copiedLogs, setCopiedLogs] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeNode = openNodes.find((n) => n.id === activeNodeId) || openNodes[0];
  const activeLogs = activeNode ? logs[activeNode.id] || [] : [];
  const vendorInfo = activeNode ? VENDOR_MAP[activeNode.vendor] : null;
  const vendor = activeNode?.vendor || 'cisco_ios';

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeLogs]);

  // Close hints when switching tabs
  useEffect(() => {
    setShowHints(false);
    setInputVal('');
    setHistoryIdx(-1);
  }, [activeNodeId]);

  const activeGuide: VendorGuide = activeNode ? getBeginnerGuide(activeNode.vendor) : getBeginnerGuide('mikrotik');

  if (!isOpen || openNodes.length === 0) return null;

  const dismissHints = () => {
    setShowHints(false);
    setHints([]);
  };

  const applyHint = (cmd: string) => {
    setInputVal(cmd);
    dismissHints();
    inputRef.current?.focus();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputVal(val);
    setHistoryIdx(-1);

    // Trigger ? help popup when input ends with ?
    if (val.endsWith('?')) {
      const prefix = val.slice(0, -1).trim();
      const results = getHints(vendor, prefix || '');
      setHints(results);
      setHintIndex(0);
      setShowHints(results.length > 0);
    } else {
      dismissHints();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Ctrl+V / Cmd+V → smart paste: multi-line opens paste modal, single-line inserts directly
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      navigator.clipboard
        .readText()
        .then((text) => {
          if (text.includes('\n')) {
            setPasteText(text);
            setShowPasteModal(true);
          } else {
            setInputVal((v) => v + text);
            setHistoryIdx(-1);
          }
        })
        .catch(() => {});
      return;
    }

    // Tab → autocomplete
    if (e.key === 'Tab') {
      e.preventDefault();
      const completion = getTabCompletion(vendor, inputVal.replace(/\?$/, '').trim());
      if (completion) {
        setInputVal(completion + ' ');
        dismissHints();
      } else if (hints.length > 0) {
        setInputVal(hints[0].command + ' ');
        dismissHints();
      }
      return;
    }

    // ArrowUp / ArrowDown navigate hint list
    if (showHints) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHintIndex((i) => Math.min(i + 1, hints.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHintIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' && hints.length > 0) {
        e.preventDefault();
        applyHint(hints[hintIndex].command);
        return;
      }
      if (e.key === 'Escape') {
        dismissHints();
        return;
      }
    }

    // Command history navigation with ArrowUp / ArrowDown
    if (!showHints) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const newIdx = Math.min(historyIdx + 1, history.length - 1);
        setHistoryIdx(newIdx);
        setInputVal(history[history.length - 1 - newIdx] || '');
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const newIdx = Math.max(historyIdx - 1, -1);
        setHistoryIdx(newIdx);
        setInputVal(newIdx === -1 ? '' : history[history.length - 1 - newIdx] || '');
        return;
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = inputVal.replace(/\?$/, '').trim();
    if (!cmd || !activeNode) return;
    dismissHints();
    setHistory((prev) => [...prev, cmd]);
    setHistoryIdx(-1);
    onSendCommand(activeNode.id, cmd);
    setInputVal('');
  };

  const quickCommands: Record<string, string[]> = {
    mikrotik: ['/ip address print', '/interface print', 'ping 192.168.88.1', '/system identity print', '/system identity set name=Router1', '/ip dns set servers=8.8.8.8', '/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade', '/ip pool add name=pool1 ranges=192.168.88.100-192.168.88.200', '/ip dhcp-server add name=dhcp1 interface=ether1 address-pool=pool1', 'export'],
    cisco_ios: ['show ip interface brief', 'show running-config', 'configure terminal', 'show ip route', 'hostname R1', 'ip name-server 8.8.8.8', 'ip dhcp pool LAN', 'ping 10.0.0.1'],
    cisco_nxos: ['show interface status', 'show ip interface brief', 'show vlan', 'hostname DC-SW1', 'vlan 10', 'copy run start'],
    juniper: ['show interfaces terse', 'show route', 'configure', 'set system host-name R1', 'set system name-server 8.8.8.8', 'commit check', 'rollback 0'],
    huawei: ['display ip interface brief', 'display current-configuration', 'system-view', 'sysname R1', 'dns server 8.8.8.8', 'ping 192.168.1.1'],
    fortinet: ['get system status', 'config system interface', 'set hostname FW1', 'show firewall policy', 'diagnose sys top', 'execute ping 8.8.8.8'],
    ubiquiti: ['show interfaces', 'show configuration', 'configure', 'set system host-name ER1', 'set system name-server 8.8.8.8', 'commit', 'show ip route'],
    vyos: ['show interfaces', 'show configuration', 'configure', 'set system host-name R1', 'set system name-server 8.8.8.8', 'commit', 'show ip route'],
    aruba: ['show interface brief', 'show running-config', 'configure terminal', 'hostname SW1', 'vlan 10', 'show vlan'],
    openwrt: ['uci show network', 'ifconfig', 'logread', 'uci set system.@system[0].hostname=router1', 'uci commit', 'cat /etc/config/network'],
    linux: ['ip addr', 'ip route', 'hostname server1', 'ss -tulnp', 'systemctl status nginx', 'free -h', 'df -h', 'cat /etc/resolv.conf', 'ping 8.8.8.8']
  };

  const activeVendorCmds = activeNode ? quickCommands[activeNode.vendor] || quickCommands.mikrotik : [];

  const handleCopyLogs = async () => {
    const text = activeLogs.map((l) => `${l.type === 'input' ? '> ' : ''}${l.text}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLogs(true);
      setTimeout(() => setCopiedLogs(false), 1500);
    } catch {
      setCopiedLogs(false);
    }
  };

  const runPastedCommands = () => {
    if (!activeNode) return;
    const lines = pasteText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && !l.startsWith('!'));
    if (lines.length === 0) return;
    dismissHints();
    setHistory((prev) => [...prev, ...lines]);
    setShowPasteModal(false);
    lines.forEach((cmd, i) => {
      setTimeout(() => onSendCommand(activeNode.id, cmd), i * 350);
    });
    setPasteText('');
  };

  const fillInputFromPaste = () => {
    const first = pasteText.trim().split('\n')[0];
    if (first) setInputVal(first);
    setShowPasteModal(false);
    inputRef.current?.focus();
  };

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-30 bg-slate-950 border-t border-slate-800 flex flex-col font-mono shadow-2xl transition-all duration-300 ${
        isMaximized ? 'h-full' : 'h-80 md:h-96'
      }`}
    >
      {/* Header / Tabs */}
      <div className="h-10 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-3 select-none">
        <div className="flex items-center space-x-1 overflow-x-auto">
          <Terminal className="w-4 h-4 text-emerald-400 mr-2 shrink-0" />
          {openNodes.map((node) => {
            const isActive = node.id === activeNodeId;
            return (
              <button
                key={node.id}
                onClick={() => onSelectTab(node.id)}
                className={`flex items-center space-x-2 px-3 py-1 rounded-t-md text-xs font-semibold border-t border-x transition shrink-0 ${
                  isActive
                    ? 'bg-slate-950 border-slate-700 text-slate-100'
                    : 'bg-slate-900/50 border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{node.name}</span>
                <span className="text-[9px] text-slate-500">({node.vendor})</span>
                <X
                  className="w-3 h-3 text-slate-500 hover:text-rose-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(node.id);
                  }}
                />
              </button>
            );
          })}
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={handleCopyLogs}
            title="Salin output terminal ke clipboard"
            className={`p-1 rounded transition ${
              copiedLogs
                ? 'bg-cyan-600/30 text-cyan-300'
                : 'hover:bg-slate-800 text-slate-400 hover:text-cyan-300'
            }`}
          >
            {copiedLogs ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setShowGuide(!showGuide)}
            title="Panduan Konfigurasi (untuk pemula)"
            className={`p-1 rounded transition ${
              showGuide
                ? 'bg-emerald-600/30 text-emerald-300'
                : 'hover:bg-slate-800 text-slate-400 hover:text-emerald-300'
            }`}
          >
            <BookOpen className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded"
          >
            {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 text-slate-400 hover:text-rose-400 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Beginner Configuration Guide (collapsible) */}
      {showGuide && (
        <div className="bg-slate-900/80 border-b border-slate-800 px-3 py-2 text-[11px] overflow-y-auto max-h-44 animate-in slide-in-from-top-2 fade-in duration-150">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-emerald-400 font-bold text-[10px] uppercase tracking-wide">
              📖 Panduan Konfigurasi — {activeGuide.label}
            </span>
            <span className="text-slate-500 text-[9px]">klik perintah untuk menjalankannya</span>
          </div>
          <p className="text-slate-500 mb-2">{activeGuide.intro}</p>
          <div className="space-y-1">
            {activeGuide.steps.map((step) => (
              <button
                key={step.command}
                onClick={() => {
                  if (activeNode) onSendCommand(activeNode.id, step.command);
                }}
                className="w-full text-left flex items-start gap-2 px-2 py-1 rounded hover:bg-emerald-950/40 transition group"
              >
                <span className="text-slate-500 shrink-0 pt-0.5">{step.title.split(' ')[0]}</span>
                <span className="min-w-0">
                  <span className="font-mono text-emerald-300 group-hover:text-emerald-200 break-all">{step.command}</span>
                  <span className="block text-slate-500 mt-0.5">{step.title.replace(/^\d+\.\s*/, '')}{step.note ? ` — ${step.note}` : ''}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quick Command Suggestions Bar */}
      <div className="bg-slate-900/60 border-b border-slate-800 px-3 py-1.5 flex items-center space-x-2 overflow-x-auto text-[11px] text-slate-400">
        <span className="text-[10px] text-slate-500 font-bold uppercase shrink-0">Quick CLI:</span>
        {activeVendorCmds.map((cmd) => (
          <button
            key={cmd}
            onClick={() => {
              if (activeNode) onSendCommand(activeNode.id, cmd);
            }}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-blue-900/50 hover:border-blue-500 border border-slate-700 text-slate-300 transition shrink-0"
          >
            {cmd}
          </button>
        ))}
      </div>

      {/* Terminal Scroll Viewport */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 text-xs leading-relaxed text-slate-200 font-mono">
        <div className="text-slate-500 text-[11px]">
          [NetLab Multi-Vendor Terminal Engine connected to {activeNode?.name} ({vendorInfo?.name})]
        </div>
        <div className="text-slate-600 text-[11px]">
          Type <span className="text-yellow-400 font-bold">?</span> or append <span className="text-yellow-400 font-bold">?</span> after a word for help. Press <span className="text-cyan-400 font-bold">Tab</span> to autocomplete.
        </div>
        <div className="text-slate-600 text-[11px]">
          AI Mentor: <span className="text-violet-400 font-bold">/ai kenapa ping gagal</span>, <span className="text-violet-400 font-bold">/ai hint routing</span>, <span className="text-violet-400 font-bold">/ai learn DHCP</span>, <span className="text-violet-400 font-bold">/ai diagnose</span>, <span className="text-violet-400 font-bold">/ai fix missing-route</span>, <span className="text-violet-400 font-bold">/ai</span> untuk bantuan.
        </div>

        {activeLogs.map((log) => (
          <div key={log.id} className="whitespace-pre-wrap">
            {log.type === 'input' && (
              <div className="text-emerald-400 font-bold">
                {vendorInfo?.defaultPrompt}
                <span className="text-slate-100">{log.text}</span>
              </div>
            )}
            {log.type === 'output' && <div className="text-slate-300 pl-2">{log.text}</div>}
            {log.type === 'error' && <div className="text-rose-400 pl-2">{log.text}</div>}
            {log.type === 'system' && <div className="text-cyan-400 italic text-[11px]">{log.text}</div>}
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>

      {/* ? Help Popup (floats above input) */}
      {showHints && hints.length > 0 && (
        <div className="mx-2 mb-0 border border-slate-700 rounded-t-md bg-slate-900 overflow-hidden shadow-xl max-h-56 overflow-y-auto">
          <div className="px-3 py-1 bg-slate-800 border-b border-slate-700 text-[10px] text-slate-400 font-bold uppercase flex items-center justify-between">
            <span>⌨  Context Help — <span className="text-yellow-400">↑↓</span> navigate · <span className="text-cyan-400">Enter</span> apply · <span className="text-slate-400">Esc</span> close</span>
            <span className="text-slate-500">{hints.length} matches</span>
          </div>
          {hints.map((hint, i) => (
            <button
              key={hint.command}
              onMouseDown={(e) => {
                e.preventDefault(); // prevent input blur
                applyHint(hint.command);
              }}
              className={`w-full text-left px-3 py-1.5 flex items-baseline gap-3 text-xs transition border-b border-slate-800/60 last:border-none ${
                i === hintIndex
                  ? 'bg-blue-900/50 text-white'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span className="font-mono text-emerald-400 shrink-0 text-[11px]">{hint.command}</span>
              <span className="text-slate-500 text-[10px] truncate">{hint.description}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input Field */}
      <form onSubmit={handleSubmit} className="p-2.5 bg-slate-900 border-t border-slate-800 flex items-center space-x-2">
        <span className="text-xs font-bold text-emerald-400 shrink-0">{vendorInfo?.defaultPrompt}</span>
        <input
          ref={inputRef}
          type="text"
          value={inputVal}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(dismissHints, 150)}
          autoComplete="off"
          spellCheck={false}
          placeholder={`Type command or append ? for help (Tab to complete)...`}
          className="flex-1 bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
        />
        <button
          type="button"
          onClick={() => setShowPasteModal(true)}
          title="Tempel perintah / prompt yang sudah disiapkan (multi-baris)"
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold flex items-center space-x-1"
        >
          <ClipboardPaste className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Paste</span>
        </button>
        <button
          type="submit"
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold flex items-center space-x-1"
        >
          <Send className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Exec</span>
        </button>
      </form>

      {/* Paste Modal — tempel teks yang sudah disiapkan */}
      {showPasteModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowPasteModal(false)}
        >
          <div
            className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-lg shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-2.5 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide">
                <ClipboardPaste className="w-3.5 h-3.5 inline mr-1.5" />
                Tempel Teks yang Sudah Disiapkan
              </span>
              <button
                onClick={() => setShowPasteModal(false)}
                className="p-1 hover:bg-slate-700 text-slate-400 hover:text-rose-400 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              autoFocus
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  runPastedCommands();
                }
              }}
              placeholder={'Tempel (Ctrl+V) kata-kata yang sudah kamu siapkan di sini...\nSetiap baris dijalankan sebagai satu perintah.\nBaris kosong & komentar (# / !) otomatis dilewati.'}
              spellCheck={false}
              className="w-full h-52 bg-slate-950 border-0 border-b border-slate-800 px-4 py-3 text-xs font-mono text-slate-100 focus:outline-none resize-none placeholder:text-slate-600"
            />
            <div className="px-4 py-2.5 flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-500">
                <kbd className="px-1 py-0.5 bg-slate-800 rounded text-slate-300">Ctrl</kbd>+
                <kbd className="px-1 py-0.5 bg-slate-800 rounded text-slate-300">Enter</kbd> untuk run semua
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={fillInputFromPaste}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold"
                >
                  Isi Input
                </button>
                <button
                  onClick={runPastedCommands}
                  disabled={!pasteText.trim() || !activeNode}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded text-xs font-semibold flex items-center space-x-1"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Run Semua</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
