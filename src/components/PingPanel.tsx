import React, { useState, useEffect } from 'react';
import { Activity, X, Trash2, ChartPie, Network } from 'lucide-react';
import { LabNode, LabEdge } from '../types';
import { DeviceStatsSnapshot, DhcpLeaseInfo } from '../engine/net';

export interface PingResult {
  id: string;
  srcNodeId: string;
  srcNodeName: string;
  dstNodeId: string;
  dstNodeName: string;
  dstIp: string;
  status: 'success' | 'failed' | 'pending' | 'running';
  message: string;
  timestamp: string;
}

interface PingPanelProps {
  nodes: LabNode[];
  edges: LabEdge[];
  pingResults: PingResult[];
  onClear: () => void;
  isOpen: boolean;
  onToggle: () => void;
  onRunPing: (id: string) => void;
  getStats?: (nodeId: string) => DeviceStatsSnapshot | null;
  statsVersion?: number;
  leases?: DhcpLeaseInfo[];
}

const StatCell = ({ children, muted }: { children: React.ReactNode; muted?: boolean }) => (
  <td className={`px-2 py-1 font-mono text-[10.5px] ${muted ? 'text-slate-600' : 'text-slate-300'}`}>{children}</td>
);

const StatsView: React.FC<{
  nodes: LabNode[];
  getStats: (nodeId: string) => DeviceStatsSnapshot | null;
  leases: DhcpLeaseInfo[];
}> = ({ nodes, getStats, leases }) => {
  const [selectedId, setSelectedId] = useState<string>(nodes[0]?.id || '');
  useEffect(() => {
    if (!nodes.some((n) => n.id === selectedId)) setSelectedId(nodes[0]?.id || '');
  }, [nodes, selectedId]);

  const stats = selectedId ? getStats(selectedId) : null;
  const node = nodes.find((n) => n.id === selectedId);
  const nodeLease = leases.find((l) => l.nodeId === selectedId);

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-slate-800 flex items-center gap-2">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="flex-1 bg-[#1A1D24] border border-slate-700 rounded-md text-[11px] px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-500/60"
        >
          {nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name} — {n.model}
            </option>
          ))}
        </select>
        {nodeLease && (
          <span className="px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[9.5px] font-mono whitespace-nowrap">
            DHCP {nodeLease.ip}
          </span>
        )}
      </div>

      <div className="overflow-y-auto max-h-72">
        {!stats && (
          <div className="p-4 text-center text-slate-500 text-[11px] font-mono">
            — tidak ada data untuk perangkat ini —
          </div>
        )}
        {stats && (
          <div className="space-y-3 p-2">
            {/* Interfaces */}
            <div>
              <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Network className="w-3 h-3" /> Interfaces
              </div>
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[9px] text-slate-500 uppercase">
                    <th className="px-2 py-0.5">Interface</th>
                    <th className="px-2 py-0.5">IP</th>
                    <th className="px-2 py-0.5">MAC</th>
                    <th className="px-2 py-0.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.interfaces.map((i) => (
                    <tr key={i.name} className="border-t border-slate-800/60">
                      <StatCell>{i.name}</StatCell>
                      <StatCell>{i.ip || <span className="text-slate-600">unassigned</span>}</StatCell>
                      <StatCell muted>{i.mac}</StatCell>
                      <StatCell>
                        <span className={i.up ? 'text-emerald-400' : 'text-rose-400'}>{i.up ? 'UP' : 'DOWN'}</span>
                      </StatCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ARP cache */}
            <div>
              <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1">
                ARP Cache ({stats.arp.length})
              </div>
              {stats.arp.length === 0 ? (
                <div className="text-[10px] text-slate-600 font-mono px-2">
                  — kosong (isi dengan aktivitas ping) —
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[9px] text-slate-500 uppercase">
                      <th className="px-2 py-0.5">IP</th>
                      <th className="px-2 py-0.5">MAC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.arp.map((a) => (
                      <tr key={a.ip} className="border-t border-slate-800/60">
                        <StatCell>{a.ip}</StatCell>
                        <StatCell muted>{a.mac}</StatCell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* MAC table (L2) */}
            <div>
              <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1">
                MAC Table ({stats.macTable.length})
              </div>
              {stats.macTable.length === 0 ? (
                <div className="text-[10px] text-slate-600 font-mono px-2">
                  — kosong (isi dengan aktivitas ping) —
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[9px] text-slate-500 uppercase">
                      <th className="px-2 py-0.5">MAC</th>
                      <th className="px-2 py-0.5">Port</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.macTable.map((m) => (
                      <tr key={m.mac} className="border-t border-slate-800/60">
                        <StatCell muted>{m.mac}</StatCell>
                        <StatCell>{m.port}</StatCell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Routing table */}
            <div>
              <div className="text-[10px] font-bold text-rose-400 uppercase tracking-wider mb-1">
                Routing Table ({stats.routes.length})
              </div>
              {stats.routes.length === 0 ? (
                <div className="text-[10px] text-slate-600 font-mono px-2">— kosong —</div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[9px] text-slate-500 uppercase">
                      <th className="px-2 py-0.5">Network</th>
                      <th className="px-2 py-0.5">Gateway</th>
                      <th className="px-2 py-0.5">Interface</th>
                      <th className="px-2 py-0.5">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.routes.map((r, i) => (
                      <tr key={i} className="border-t border-slate-800/60">
                        <StatCell>{r.dst}</StatCell>
                        <StatCell>{r.gateway || '-'}</StatCell>
                        <StatCell>{r.iface || '-'}</StatCell>
                        <StatCell muted>{r.kind}</StatCell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Spanning tree (switch) */}
            {stats.stp && (
              <div>
                <div className="text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-1">
                  Spanning Tree
                </div>
                <div className="text-[10px] text-slate-400 font-mono px-2 pb-1">
                  root: {stats.stp.rootName} ({stats.stp.rootId})
                  {stats.stp.rootPort ? ` • root port: ${stats.stp.rootPort}` : ' • root bridge'}
                </div>
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[9px] text-slate-500 uppercase">
                      <th className="px-2 py-0.5">Port</th>
                      <th className="px-2 py-0.5">Role</th>
                      <th className="px-2 py-0.5">State</th>
                      <th className="px-2 py-0.5">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.stp.ports.map((p) => (
                      <tr key={p.port} className="border-t border-slate-800/60">
                        <StatCell>{p.port}</StatCell>
                        <StatCell>{p.role}</StatCell>
                        <StatCell>
                          <span className={p.state === 'forwarding' ? 'text-emerald-400' : 'text-rose-400'}>{p.state}</span>
                        </StatCell>
                        <StatCell muted>{p.cost}</StatCell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* FHRP (VRRP) */}
            {stats.fhrp && stats.fhrp.length > 0 && (
              <div>
                <div className="text-[10px] font-bold text-fuchsia-400 uppercase tracking-wider mb-1">
                  VRRP ({stats.fhrp.length})
                </div>
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[9px] text-slate-500 uppercase">
                      <th className="px-2 py-0.5">Virtual IP</th>
                      <th className="px-2 py-0.5">State</th>
                      <th className="px-2 py-0.5">Master</th>
                      <th className="px-2 py-0.5">Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.fhrp.map((f, i) => (
                      <tr key={i} className="border-t border-slate-800/60">
                        <StatCell>{f.virtualAddress}</StatCell>
                        <StatCell>
                          <span className={f.isMaster ? 'text-emerald-400' : 'text-slate-400'}>
                            {f.isMaster ? 'MASTER' : 'BACKUP'}
                          </span>
                        </StatCell>
                        <StatCell muted>{f.masterName}</StatCell>
                        <StatCell muted>{f.priority}</StatCell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const PingPanel: React.FC<PingPanelProps> = ({
  nodes,
  edges,
  pingResults,
  onClear,
  isOpen,
  onToggle,
  onRunPing,
  getStats,
  statsVersion,
  leases = [],
}) => {
  const [tab, setTab] = useState<'ping' | 'stats'>('ping');

  useEffect(() => {
    // Tidak ada node sama sekali → tab statistik tidak berguna
    if (nodes.length === 0 && tab === 'stats') setTab('ping');
  }, [nodes, tab]);

  if (!isOpen) {
    return (
      <div className="fixed bottom-4 right-4 z-40">
        <button
          onClick={onToggle}
          className="relative flex items-center justify-center p-3 bg-slate-900 border border-emerald-500/50 hover:bg-slate-800 rounded-full shadow-lg shadow-emerald-900/20 text-emerald-400 transition"
          title="Open PDU / Ping Simulation"
        >
          <Activity className="w-5 h-5" />
          {pingResults.length > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
              {pingResults.length}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-full max-w-[480px] font-mono select-none rounded-xl overflow-hidden shadow-2xl border border-slate-700 flex flex-col">
      {/* Header bar */}
      <div className="w-full flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 text-xs">
        <div className="flex items-center space-x-2 text-emerald-400 font-bold">
          <Activity className="w-4 h-4" />
          <span>PDU / Ping Simulation</span>
          {pingResults.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-900/60 text-emerald-300 text-[10px]">
              {pingResults.length}
            </span>
          )}
        </div>
        <div className="flex items-center space-x-3 text-slate-400">
          {tab === 'ping' && pingResults.length > 0 && (
            <button
              onClick={onClear}
              className="hover:text-rose-400 transition flex items-center space-x-1"
              title="Clear results"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={onToggle} className="hover:text-slate-200 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-900/80">
        <button
          onClick={() => setTab('ping')}
          className={`flex-1 px-3 py-2 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition ${
            tab === 'ping'
              ? 'text-emerald-300 border-b-2 border-emerald-400 bg-emerald-500/5'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <Activity className="w-3 h-3" /> Ping Test
        </button>
        <button
          onClick={() => setTab('stats')}
          className={`flex-1 px-3 py-2 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition ${
            tab === 'stats'
              ? 'text-cyan-300 border-b-2 border-cyan-400 bg-cyan-500/5'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <ChartPie className="w-3 h-3" /> Statistik
        </button>
      </div>

      {/* Content */}
      {tab === 'stats' ? (
        <div className="bg-slate-950">
          {getStats ? (
            <StatsView key={statsVersion} nodes={nodes} getStats={getStats} leases={leases} />
          ) : (
            <div className="p-4 text-center text-slate-500 text-xs">Statistik tidak tersedia</div>
          )}
        </div>
      ) : (
        <div className="bg-slate-950 max-h-64 overflow-y-auto">
          {pingResults.length === 0 ? (
            <div className="p-4 text-center text-slate-500 text-xs">
              <Activity className="w-6 h-6 mx-auto mb-2 text-slate-600" />
              <p>Pilih tool <span className="text-emerald-400 font-bold">Ping (PDU)</span> di toolbar</p>
              <p className="mt-1">Klik node <span className="text-cyan-400">Sumber</span> → klik node <span className="text-amber-400">Tujuan</span></p>
            </div>
          ) : (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/70 text-slate-400 text-[10px] uppercase">
                  <th className="px-3 py-1.5 text-left font-bold">Src</th>
                  <th className="px-3 py-1.5 text-left font-bold">Target IP</th>
                  <th className="px-3 py-1.5 text-left font-bold">Status</th>
                  <th className="px-3 py-1.5 text-left font-bold">Info</th>
                </tr>
              </thead>
              <tbody>
                {pingResults.map((r) => (
                  <tr key={r.id} className="border-b border-slate-900 hover:bg-slate-900/40 transition">
                    <td className="px-3 py-1.5 text-slate-200 font-semibold">{r.srcNodeName}</td>
                    <td className="px-3 py-1.5 text-cyan-300">{r.dstIp || r.dstNodeName}</td>
                    <td className="px-3 py-1.5">
                      {r.status === 'success' ? (
                        <span className="text-emerald-400 font-bold">✓ Success</span>
                      ) : r.status === 'failed' ? (
                        <span className="text-rose-400 font-bold">✗ Failed</span>
                      ) : r.status === 'pending' ? (
                        <button
                          onClick={() => onRunPing(r.id)}
                          className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10px] font-bold shadow-sm transition"
                        >
                          ▶ Run Test
                        </button>
                      ) : (
                        <span className="text-yellow-400 animate-pulse font-medium">⟳ Sending…</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-slate-400 truncate max-w-[140px]">{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};
