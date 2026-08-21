import React, { useState, useRef, useEffect } from 'react';
import { Terminal, X, Minimize2, Maximize2, Send, BookOpen, ClipboardPaste, Copy, Check } from 'lucide-react';
import { LabNode, TerminalLog } from '../types';
import { VENDOR_MAP } from '../data/vendors';
import { getHints, getTabCompletion, CliHint } from '../data/cliHints';
import { getBeginnerGuide, VendorGuide } from '../data/beginnerGuide';
import { completionFor, nextCliMode, sequenceModes, resolveAbbreviation } from '../engine/cli/commandTree';
import type { CliMode } from '../engine/cli/commandTree';
import { treeVendor } from '../engine';
import { hasFinePointer } from '../utils/inputCapability';

interface TerminalPanelProps {
  openNodes: LabNode[];
  activeNodeId: string | null;
  onSelectTab: (nodeId: string) => void;
  onCloseTab: (nodeId: string) => void;
  logs: Record<string, TerminalLog[]>;
  onSendCommand: (nodeId: string, cmd: string, mode?: CliMode) => void;
  isOpen: boolean;
  onClose: () => void;
  /** Hostname hasil konfigurasi CLI per perangkat (state device). */
  hostnameOf: (nodeId: string) => string | undefined;
}

/** Vendor yang memakai command tree facade (abbreviation/completion context-aware). */
function usesCommandTree(vendor: string): boolean {
  return treeVendor(vendor) !== null;
}

/**
 * Prompt mode-aware per vendor — lihat src/utils/prompt.ts (murni, teruji).
 * Hostname hasil konfigurasi CLI + deviceType/model + mode menentukan prompt.
 */
import { promptFor } from '../utils/prompt';

export const TerminalPanel: React.FC<TerminalPanelProps> = ({
  openNodes,
  activeNodeId,
  onSelectTab,
  onCloseTab,
  logs,
  onSendCommand,
  isOpen,
  onClose,
  hostnameOf
}) => {
  const [inputVal, setInputVal] = useState('');
  const [isMaximized, setIsMaximized] = useState(false);
  const [hints, setHints] = useState<CliHint[]>([]);
  const [showHints, setShowHints] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);
  /** Riwayat per-perangkat (tidak bocor antar device). */
  const [historyByNode, setHistoryByNode] = useState<Record<string, string[]>>({});
  const [historyIdx, setHistoryIdx] = useState(-1);
  /** Mode CLI (context) per-perangkat: exec / config / config-if (Cisco). */
  const [modes, setModes] = useState<Record<string, CliMode>>({});
  /** Nama interface aktif di config-if (Cisco/Huawei) — untuk prompt. */
  const [ifaceByNode, setIfaceByNode] = useState<Record<string, string>>({});
  const [showGuide, setShowGuide] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [copiedLogs, setCopiedLogs] = useState(false);
  /** Kandidat TAB completion (context-aware, desktop). */
  const [completionCandidates, setCompletionCandidates] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const desktopCapable = useRef(hasFinePointer());
  /** Timer paste aktif — dibersihkan saat unmount agar tidak menembak setelah panel ditutup. */
  const pasteTimersRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      pasteTimersRef.current.forEach((t) => window.clearTimeout(t));
      pasteTimersRef.current = [];
    };
  }, []);

  const activeNode = openNodes.find((n) => n.id === activeNodeId) || openNodes[0];
  const activeLogs = activeNode ? logs[activeNode.id] || [] : [];
  const vendorInfo = activeNode ? VENDOR_MAP[activeNode.vendor] : null;
  const vendor = activeNode?.vendor || 'cisco_ios';
  const mode: CliMode = (activeNode && modes[activeNode.id]) || 'exec';
  const history = (activeNode && historyByNode[activeNode.id]) || [];

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeLogs]);

  // Close hints when switching tabs
  useEffect(() => {
    setShowHints(false);
    setInputVal('');
    setHistoryIdx(-1);
    setCompletionCandidates([]);
  }, [activeNodeId]);

  const activeGuide: VendorGuide = activeNode ? getBeginnerGuide(activeNode.vendor) : getBeginnerGuide('mikrotik');

  if (!isOpen || openNodes.length === 0) return null;

  const dismissHints = () => {
    setShowHints(false);
    setHints([]);
    setCompletionCandidates([]);
  };

  /** '?' help — context-aware per (vendor, mode) untuk vendor tree, fallback hints lama. */
  const showHelpFor = (prefix: string) => {
    if (usesCommandTree(vendor)) {
      const res = completionFor(vendor, mode, prefix);
      setHints(
        res.candidates.map((c) => ({
          id: c,
          command: c,
          description: '',
        }))
      );
      setHintIndex(0);
      setShowHints(res.candidates.length > 0);
    } else {
      const results = getHints(vendor, prefix || '');
      setHints(results);
      setHintIndex(0);
      setShowHints(results.length > 0);
    }
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
      showHelpFor(val.slice(0, -1).trim());
    } else {
      dismissHints();
    }
  };

  /** Jalankan perintah dari jalur mana pun (submit/TAB/quiz/guide), dengan
   *  update mode CLI & riwayat per-perangkat agar abbreviation & completion
   *  selalu context-aware. */
  const execute = (nodeId: string, raw: string) => {
    const cmd = raw.replace(/\?$/, '').trim().slice(0, 4000);
    if (!cmd || !activeNode) return;
    const curMode: CliMode = modes[nodeId] || 'exec';
    pushHistory(nodeId, cmd);
    setHistoryIdx(-1);
    // Mode dihitung dari perintah yang DIEXPAND engine (bukan input mentah),
    // sehingga `co t`/`sys`/`conf` juga memindahkan mode dengan benar.
    const tv = treeVendor(vendor);
    let effective = cmd;
    if (tv) {
      const resolution = resolveAbbreviation(tv, curMode, cmd);
      if (resolution.kind === 'expanded') effective = resolution.command;
    }
    const nx = nextCliMode(vendor, curMode, effective);
    if (nx !== curMode) setModes((prev) => ({ ...prev, [nodeId]: nx }));
    // Pelacakan interface aktif (Cisco/Huawei interface view) untuk prompt.
    const c = effective.toLowerCase();
    const ifaceMatch = c.startsWith('interface ') || c.startsWith('int ')
      ? effective.slice(c.indexOf(' ') + 1).trim().split(/\s+/)[0]
      : null;
    if (ifaceMatch) {
      setIfaceByNode((prev) => ({ ...prev, [nodeId]: ifaceMatch }));
    } else if (curMode === 'config-if' && nx !== 'config-if') {
      setIfaceByNode((prev) => ({ ...prev, [nodeId]: '' }));
    }
    onSendCommand(nodeId, cmd, curMode);
    setInputVal('');
    dismissHints();
  };

  /** Riwayat per-perangkat: dedup beruntun + cap 100 entri (mencegah tumbuh tanpa batas). */
  const pushHistory = (nodeId: string, cmd: string) => {
    setHistoryByNode((prev) => {
      const list = prev[nodeId] || [];
      if (list[list.length - 1] === cmd) return prev;
      return { ...prev, [nodeId]: [...list.slice(-99), cmd] };
    });
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

    // Tab → autocomplete (DESKTOP only — jangan mencuri TAB perangkat sentuh)
    if (e.key === 'Tab') {
      if (!desktopCapable.current) return;
      e.preventDefault();
      const val = inputVal.replace(/\?$/, '').trim();
      const res = completionFor(vendor, mode, val);
      if (res.candidates.length === 1 && res.commonPrefix && res.commonPrefix !== val) {
        setInputVal(res.commonPrefix + ' ');
        dismissHints();
      } else if (res.candidates.length > 1) {
        // common prefix bila ada kemajuan, selainnya tampilkan kandidat
        if (res.commonPrefix && res.commonPrefix.length > val.length) {
          setInputVal(res.commonPrefix + ' ');
          setCompletionCandidates(res.candidates);
        } else {
          setCompletionCandidates(res.candidates);
          setHints(
            res.candidates.map((c) => ({
              id: c,
              command: c,
              description: '',
            }))
          );
          setHintIndex(0);
          setShowHints(true);
        }
      } else {
        // fallback ke engine hints lama (vendor non-tree)
        const completion = getTabCompletion(vendor, val);
        if (completion) {
          setInputVal(completion + ' ');
          dismissHints();
        } else if (hints.length > 0) {
          setInputVal(hints[0].command + ' ');
          dismissHints();
        }
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

    // Command history navigation with ArrowUp / ArrowDown (per perangkat)
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
    if (!activeNode) return;
    execute(activeNode.id, inputVal);
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
    const nodeId = activeNode.id;
    const lines = pasteText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && !l.startsWith('!'))
      .slice(0, 200);
    if (lines.length === 0) return;
    dismissHints();
    lines.forEach((cmd) => pushHistory(nodeId, cmd));
    setShowPasteModal(false);
    // Mode tiap perintah dihitung SEKALIGUS dan memakai mode SEBELUM eksekusi
    // (konsisten dengan execute() per satu perintah) — bukan mode hasil transisi.
    // Menghindari bug lama: 'conf t' ikut dikirim sebagai mode 'config'.
    const modeSeq = sequenceModes(vendor, modes[nodeId] || 'exec', lines);
    const timers: number[] = [];
    lines.forEach((cmd, i) => {
      timers.push(
        window.setTimeout(() => {
          onSendCommand(nodeId, cmd, modeSeq[i]);
          // Mode setelah baris terakhir = transisi baris terakhir (bukan
          // mode sebelum-eksekusi) — perbaikan mode akhir paste yang salah.
          const next = i === lines.length - 1
            ? sequenceModes(vendor, modeSeq[i], [cmd])[1]
            : modeSeq[i + 1];
          setModes((prev) => ({ ...prev, [nodeId]: next }));
          const cc = cmd.toLowerCase();
          const im = cc.startsWith('interface ') || cc.startsWith('int ')
            ? cmd.slice(cc.indexOf(' ') + 1).trim().split(/\s+/)[0]
            : null;
          if (im) {
            setIfaceByNode((prev) => ({ ...prev, [nodeId]: im }));
          } else if (next === 'exec' && modeSeq[i] !== 'exec') {
            setIfaceByNode((prev) => ({ ...prev, [nodeId]: '' }));
          }
        }, i * 350)
      );
    });
    pasteTimersRef.current.push(...timers);
    setPasteText('');
  };

  const fillInputFromPaste = () => {
    const first = pasteText.trim().split('\n')[0];
    if (first) setInputVal(first);
    setShowPasteModal(false);
    inputRef.current?.focus();
  };

  const prompt = activeNode
    ? promptFor(
        activeNode.vendor,
        activeNode.name,
        hostnameOf(activeNode.id),
        activeNode.deviceType,
        activeNode.model,
        mode,
        ifaceByNode[activeNode.id]
      )
    : vendorInfo?.defaultPrompt || '> ';

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
                  if (activeNode) execute(activeNode.id, step.command);
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
              if (activeNode) execute(activeNode.id, cmd);
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
          Type <span className="text-yellow-400 font-bold">?</span> for help · {desktopCapable.current ? <span><span className="text-cyan-400 font-bold">Tab</span> to complete</span> : 'touch device: ketuk tombol quick CLI di atas'}
        </div>
        <div className="text-slate-600 text-[11px]">
          Abbreviation: <span className="text-slate-300">sh run</span>, <span className="text-slate-300">conf t</span>, <span className="text-slate-300">/ip a p</span> (unik saja; ambigu ditolak)
        </div>
        <div className="text-slate-600 text-[11px]">
          AI Mentor: <span className="text-violet-400 font-bold">/ai kenapa ping gagal</span>, <span className="text-violet-400 font-bold">/ai hint routing</span>, <span className="text-violet-400 font-bold">/ai learn DHCP</span>, <span className="text-violet-400 font-bold">/ai diagnose</span>, <span className="text-violet-400 font-bold">/ai fix missing-route</span>, <span className="text-violet-400 font-bold">/ai</span> untuk bantuan.
        </div>

        {activeLogs.map((log) => (
          <div key={log.id} className="whitespace-pre-wrap">
            {log.type === 'input' && (
              <div className="text-emerald-400 font-bold">
                {prompt}
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
            <span>⌨  Context Help ({mode}) — <span className="text-yellow-400">↑↓</span> navigate · <span className="text-cyan-400">Enter</span> apply · <span className="text-slate-400">Esc</span> close</span>
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
              {hint.description && <span className="text-slate-500 text-[10px] truncate">{hint.description}</span>}
            </button>
          ))}
        </div>
      )}

      {/* TAB completion candidates popup */}
      {!showHints && completionCandidates.length > 0 && (
        <div className="mx-2 mb-0 border border-cyan-700/50 rounded-t-md bg-slate-900 overflow-hidden shadow-xl max-h-40 overflow-y-auto">
          <div className="px-3 py-1 bg-slate-800/80 border-b border-slate-800 text-[10px] text-slate-400 font-bold uppercase">
            <span className="text-cyan-400">TAB</span> — {completionCandidates.length} candidates
          </div>
          <div className="flex flex-wrap gap-1 p-2">
            {completionCandidates.map((c) => (
              <button
                key={c}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyHint(c);
                }}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-cyan-900/50 text-[10px] font-mono text-cyan-200 border border-slate-700 hover:border-cyan-500/50"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Field */}
      <form onSubmit={handleSubmit} className="p-2.5 bg-slate-900 border-t border-slate-800 flex items-center space-x-2">
        <span className="text-xs font-bold text-emerald-400 shrink-0">{prompt}</span>
        <input
          ref={inputRef}
          type="text"
          value={inputVal}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(dismissHints, 150)}
          autoComplete="off"
          spellCheck={false}
          placeholder={`${prompt.replace(/\s*$/, '')} — ketik perintah, ?, atau Tab (desktop)...`}
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
            <div className="px-4 py-2.5 bg-slate-800 border-b border-slate-800 flex items-center justify-between">
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