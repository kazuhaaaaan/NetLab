import React, { useMemo, useState } from 'react';
import { X, Search, ArrowUpRight, Unplug, ArrowDownRight, Cable } from 'lucide-react';
import { LabNode, LabEdge } from '../types';
import {
  portConnection,
  portHealth,
  PORT_HEALTH_LABEL,
  connectionLabel,
  PortHealth,
  CABLE_TYPE_LABEL,
} from '../connection';

type HealthFilter = 'all' | PortHealth;

const HEALTH_FILTERS: { id: HealthFilter; label: string }[] = [
  { id: 'all', label: 'Semua' },
  { id: 'up', label: 'UP' },
  { id: 'down', label: 'DOWN' },
  { id: 'admin-down', label: 'ADMIN DOWN' },
  { id: 'not-connected', label: 'Not Connected' },
];

/** Format kecepatan port jujur dari state (speedMbps), mis. "1G", "100M". */
function speedLabel(speedMbps: number): string {
  if (speedMbps <= 0) return '—';
  if (speedMbps % 1000 === 0) return `${speedMbps / 1000}G`;
  return `${speedMbps}M`;
}

const HEALTH_STYLE: Record<PortHealth, { icon: React.ReactNode; cls: string; badge: string }> = {
  up: {
    icon: <ArrowUpRight className="w-3.5 h-3.5" aria-hidden />,
    cls: 'text-emerald-400',
    badge: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
  },
  down: {
    icon: <ArrowDownRight className="w-3.5 h-3.5" aria-hidden />,
    cls: 'text-rose-400',
    badge: 'bg-rose-500/15 border-rose-500/40 text-rose-300',
  },
  'admin-down': {
    icon: <X className="w-3.5 h-3.5" aria-hidden />,
    cls: 'text-amber-400',
    badge: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
  },
  'not-connected': {
    icon: <Unplug className="w-3.5 h-3.5" aria-hidden />,
    cls: 'text-slate-500',
    badge: 'bg-slate-600/20 border-slate-600/40 text-slate-400',
  },
  unknown: {
    icon: <Cable className="w-3.5 h-3.5" aria-hidden />,
    cls: 'text-slate-400',
    badge: 'bg-slate-600/20 border-slate-600/40 text-slate-400',
  },
};

interface PortInspectorProps {
  node: LabNode;
  nodes: LabNode[];
  edges: LabEdge[];
  /** port NAMES trunk per device (dari state engine) — untuk label VLAN. */
  trunkPortsByNode?: Record<string, string[]>;
  /** port NAMES/IDs yang di-shutdown via CLI (state engine) — status ADMIN DOWN. */
  shutdownPortsByNode?: Record<string, string[]>;
  /** Klik baris terhubung → highlight kedua ujung + pusatkan remote. */
  onInspect?: (edgeId: string, remoteNodeId: string) => void;
  onClose: () => void;
}

/**
 * Port Inspector — jawab "port ini terhubung ke perangkat mana, port berapa,
 * statusnya apa?". Semua baris diturunkan langsung dari topologi (edges) &
 * state interface — tidak ada duplikasi state. Desktop: drawer kanan.
 * Mobile: layar penuh (tanpa hover, tombol besar).
 */
export const PortInspector: React.FC<PortInspectorProps> = ({
  node,
  nodes,
  edges,
  trunkPortsByNode = {},
  shutdownPortsByNode = {},
  onInspect,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const [healthFilter, setHealthFilter] = useState<HealthFilter>('all');

  const trunkPorts = useMemo(() => trunkPortsByNode[node.id] || [], [trunkPortsByNode, node.id]);
  const shutdownPorts = useMemo(() => shutdownPortsByNode[node.id] || [], [shutdownPortsByNode, node.id]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = node.ports.map((port) => {
      const conn = portConnection(nodes, edges, node.id, port.id);
      const health = portHealth(port, conn, shutdownPorts);
      const isTrunk = conn?.edge ? trunkPorts.includes(port.name) : false;
      return { port, conn, health, isTrunk };
    });
    return list.filter((r) => {
      if (healthFilter !== 'all' && r.health !== healthFilter) return false;
      if (!q) return true;
      return (
        r.port.name.toLowerCase().includes(q) ||
        (r.conn && (r.conn.remoteNodeName.toLowerCase().includes(q) || r.conn.remotePortName.toLowerCase().includes(q)))
      );
    });
  }, [node.ports, nodes, edges, query, healthFilter, trunkPorts, shutdownPorts]);

  const counts = useMemo(() => {
    const connected = node.ports.filter((p) => portConnection(nodes, edges, node.id, p.id)).length;
    const up = node.ports.filter((p) => portHealth(p, portConnection(nodes, edges, node.id, p.id), shutdownPorts) === 'up').length;
    return { total: node.ports.length, connected, up };
  }, [node.ports, nodes, edges, shutdownPorts]);

  return (
    <div
      className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-[2px] flex justify-end md:items-stretch items-end"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Port Connections — ${node.name}`}
    >
      <div
        className="w-full md:max-w-xl bg-[#0F1015] border-t md:border-t-0 md:border-l border-[#26282E] shadow-2xl flex flex-col max-h-[92dvh] md:max-h-full md:h-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#26282E] flex items-center justify-between bg-[#14161C]">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-white shrink-0 ${
                node.powered === false ? 'bg-rose-600/80' : 'bg-cyan-600/80'
              }`}
              aria-hidden
            >
              {node.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-100 truncate">Port Connections — {node.name}</h2>
              <p className="text-[10px] font-mono text-slate-500 truncate">
                {node.model} · {counts.connected}/{counts.total} terhubung · {counts.up} UP
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup port inspector"
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search + Filter */}
        <div className="px-3 py-2.5 border-b border-[#26282E] space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari port atau perangkat… (mis. ether1)"
              aria-label="Cari port atau perangkat"
              className="w-full bg-[#1A1D24] border border-[#2B2D31] rounded-lg pl-8 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/60"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {HEALTH_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setHealthFilter(f.id)}
                aria-pressed={healthFilter === f.id}
                className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition ${
                  healthFilter === f.id
                    ? 'bg-cyan-600/25 border-cyan-500/60 text-cyan-200'
                    : 'bg-[#1A1D24] border-[#2B2D31] text-slate-400 hover:text-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {rows.length === 0 && (
            <div className="px-4 py-10 text-center text-slate-500 text-xs">
              <Unplug className="w-6 h-6 mx-auto mb-2 text-slate-600" aria-hidden />
              {query || healthFilter !== 'all'
                ? 'Tidak ada port yang cocok dengan filter.'
                : 'Tidak ada port pada perangkat ini.'}
            </div>
          )}
          {rows.length > 0 && (
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#14161C] text-slate-500 text-[10px] uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2 font-semibold">Port</th>
                  <th className="px-2 py-2 font-semibold">Status</th>
                  <th className="px-2 py-2 font-semibold">Connected To</th>
                  <th className="px-2 py-2 font-semibold hidden sm:table-cell">Link</th>
                  <th className="px-2 py-2 font-semibold hidden sm:table-cell">Speed</th>
                  <th className="px-4 py-2 font-semibold hidden sm:table-cell">VLAN</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ port, conn, health, isTrunk }) => {
                  const style = HEALTH_STYLE[health];
                  const interactive = conn && onInspect;
                  return (
                    <tr
                      key={port.id}
                      onClick={() => interactive && conn && onInspect(conn.edge.id, conn.remoteNode.id)}
                      className={`border-t border-[#1D1F26] ${
                        interactive ? 'cursor-pointer hover:bg-cyan-950/30' : ''
                      } transition-colors`}
                    >
                      <td className="px-4 py-2.5">
                        <span className="text-slate-200 font-mono">{port.name}</span>
                        {port.ipAddress && (
                          <span className="block text-[10px] font-mono text-slate-500 truncate max-w-[140px]">
                            {port.ipAddress}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-bold ${style.badge}`}
                        >
                          {style.icon}
                          {PORT_HEALTH_LABEL[health]}
                        </span>
                      </td>
                      <td className="px-2 py-2.5">
                        {conn ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onInspect) onInspect(conn.edge.id, conn.remoteNode.id);
                            }}
                            className="text-cyan-300 hover:text-cyan-200 font-mono text-[11px] underline-offset-2 hover:underline inline-flex items-center gap-1"
                            aria-label={`Lihat koneksi ${conn.remoteNodeName} ${conn.remotePortName} di topologi`}
                          >
                            {connectionLabel(conn)}
                            <ArrowUpRight className="w-3 h-3" aria-hidden />
                          </button>
                        ) : (
                          <span className="text-slate-600 text-[11px]">Not Connected</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 hidden sm:table-cell">
                        {conn ? (
                          <span className="text-[10px] font-mono text-slate-500">
                            {CABLE_TYPE_LABEL[conn.edge.cableType]}
                            {conn.edge.down ? ' · DOWN' : ''}
                          </span>
                        ) : (
                          <span className="text-slate-700 text-[10px]">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 hidden sm:table-cell">
                        <span className="text-[10px] font-mono text-slate-500">{speedLabel(port.speedMbps)}</span>
                        <span className="block text-[9px] text-slate-700">{port.type ?? 'copper'}</span>
                      </td>
                      <td className="px-4 py-2.5 hidden sm:table-cell">
                        {conn ? (
                          isTrunk ? (
                            <span className="text-[10px] font-mono text-orange-300/90 bg-orange-500/10 border border-orange-500/30 rounded px-1.5 py-0.5">
                              TRUNK
                            </span>
                          ) : (
                            <span className="text-slate-600 text-[10px]">access</span>
                          )
                        ) : (
                          <span className="text-slate-700 text-[10px]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[#26282E] bg-[#14161C] text-[10px] text-slate-500 flex items-center justify-between gap-2">
          <span>
            {rows.length} port ditampilkan · klik baris terhubung untuk menyorot kabel di topologi
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold transition"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};