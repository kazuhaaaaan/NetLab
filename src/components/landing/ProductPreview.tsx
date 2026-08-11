import { Zap } from 'lucide-react';

/**
 * Static, presentational product preview for the landing page.
 * Purely decorative markup — it does NOT render, import or instantiate
 * the real simulator engine. The small "packet" dash animations are CSS-only.
 */

type Kind = 'cloud' | 'router' | 'switch' | 'firewall' | 'pc' | 'server';

interface PrevNode {
  id: string;
  x: number;
  y: number;
  label: string;
  color: string;
  kind: Kind;
}

const NODES: PrevNode[] = [
  { id: 'inet', x: 70, y: 80, label: 'INET', color: '#94a3b8', kind: 'cloud' },
  { id: 'r1', x: 205, y: 80, label: 'R1', color: '#38bdf8', kind: 'router' },
  { id: 'sw1', x: 355, y: 80, label: 'SW1', color: '#818cf8', kind: 'switch' },
  { id: 'fw', x: 460, y: 205, label: 'FW1', color: '#f87171', kind: 'firewall' },
  { id: 'srv', x: 120, y: 230, label: 'SRV', color: '#fb923c', kind: 'server' },
  { id: 'pc-a', x: 355, y: 205, label: 'PC-A', color: '#34d399', kind: 'pc' },
  { id: 'pc-b', x: 355, y: 255, label: 'PC-B', color: '#34d399', kind: 'pc' },
];

interface PrevEdge {
  from: string;
  to: string;
  up: boolean;
}

const EDGES: PrevEdge[] = [
  { from: 'inet', to: 'r1', up: true },
  { from: 'r1', to: 'sw1', up: true },
  { from: 'r1', to: 'srv', up: true },
  { from: 'sw1', to: 'pc-a', up: true },
  { from: 'sw1', to: 'pc-b', up: true },
  { from: 'sw1', to: 'fw', up: true },
];

const TERMINAL_LINES = [
  { text: '[admin@MikroTik] > /ip address add address=10.0.0.1/30 interface=ether1', color: '#34d399' },
  { text: '  address added', color: '#94a3b8' },
  { text: '[admin@MikroTik] > ping 10.0.0.2', color: '#34d399' },
  { text: '  sent=4 received=4 packet-loss=0%', color: '#a3e635' },
];

function KindLabel({ kind }: { kind: Kind }) {
  if (kind === 'cloud') return 'WAN';
  if (kind === 'router') return 'router';
  if (kind === 'switch') return 'switch';
  if (kind === 'firewall') return 'firewall';
  if (kind === 'server') return 'server';
  return 'endpoint';
}

export function ProductPreview() {
  const nodeById = (id: string) => NODES.find((n) => n.id === id)!;

  return (
    <div className="relative overflow-hidden rounded-xl border border-[#1F2128] bg-[#0F1015]">
      {/* window chrome */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#1F2128]">
        <span className="w-2.5 h-2.5 rounded-full bg-[#3d3f45]" aria-hidden="true" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#3d3f45]" aria-hidden="true" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#3d3f45]" aria-hidden="true" />
        <span className="ml-2 text-[11px] font-mono text-slate-500 truncate">
          R1-config — NetLab topology preview
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-[10px] font-mono text-emerald-400">
          <span className="w-1 h-1 rounded-full bg-emerald-400" style={{ animation: 'netlab-blink 1.4s ease-in-out infinite' }} />
          SIMULATING
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px]">
        {/* topology (static SVG) */}
        <div className="relative min-h-[300px] overflow-hidden">
          <div
            className="absolute inset-0"
            aria-hidden="true"
            style={{
              backgroundImage:
                'linear-gradient(rgba(148,163,184,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.04) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }}
          />
          <svg viewBox="0 0 520 310" className="relative w-full h-full" preserveAspectRatio="xMidYMid meet" aria-label="Decorative network topology preview" role="img">
            {EDGES.map((e, i) => {
              const a = nodeById(e.from);
              const b = nodeById(e.to);
              return (
                <g key={i}>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#24262c" strokeWidth="1.5" />
                  {e.up && (
                    <line
                      x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                      stroke={a.color}
                      strokeWidth="1.5"
                      strokeOpacity="0.5"
                      strokeDasharray="5 5"
                      style={{ animation: `netlab-packet 1.6s linear infinite`, animationDelay: `${i * 0.25}s` }}
                    />
                  )}
                </g>
              );
            })}
            {NODES.map((n) => (
              <g key={n.id}>
                {n.kind === 'cloud' && (
                  <circle cx={n.x} cy={n.y} r="24" fill="none" stroke={n.color} strokeWidth="1" strokeDasharray="4 6" strokeOpacity="0.5" />
                )}
                {n.kind === 'firewall' && (
                  <rect x={n.x - 16} y={n.y - 18} width="32" height="36" rx="4" fill="#0f172a" stroke={n.color} strokeWidth="1.5" />
                )}
                <circle cx={n.x} cy={n.y} r="18" fill="#0f172a" stroke={n.color} strokeWidth="1.5" />
                <text x={n.x} y={n.y + 4} textAnchor="middle" fill={n.color} fontSize="10.5" fontFamily="monospace" fontWeight="700">
                  {n.label}
                </text>
                <text x={n.x} y={n.y + 34} textAnchor="middle" fill="#64748b" fontSize="7.5" fontFamily="monospace">
                  {KindLabel({ kind: n.kind })}
                </text>
              </g>
            ))}
          </svg>

          {/* status chips */}
          <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-md border border-[#1F2128] bg-[#0B0C0E]/85 px-2.5 py-1 text-[10px] font-mono text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            4/4 links up
          </div>
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-md border border-[#1F2128] bg-[#0B0C0E]/85 px-2.5 py-1 text-[10px] font-mono text-slate-400">
            <Zap className="w-3 h-3 text-amber-400" />
            TTL 63 · 2 hops · 0% loss
          </div>
          <div className="absolute bottom-3 right-3 hidden xl:flex items-center gap-1.5 rounded-md border border-[#1F2128] bg-[#0B0C0E]/85 px-2.5 py-1 text-[10px] font-mono text-emerald-400/90">
            DHCP lease granted
          </div>
        </div>

        {/* terminal rail (static) */}
        <div className="hidden sm:flex flex-col border-l border-[#1F2128] bg-[#0B0C0E]/70">
          <div className="px-3 py-2 border-b border-[#1F2128] text-[10px] font-mono text-slate-500 uppercase tracking-wider">
            MikroTik · R1
          </div>
          <div className="flex-1 p-3 font-mono text-[10.5px] leading-relaxed space-y-1.5 overflow-hidden">
            {TERMINAL_LINES.map((l, i) => (
              <div key={i} className="whitespace-pre-wrap break-all" style={{ color: l.color }}>
                {l.text}
              </div>
            ))}
            <div className="text-emerald-400">
              [admin@MikroTik] &gt;{' '}
              <span className="inline-block w-1.5 h-3 bg-slate-300 align-middle" style={{ animation: 'netlab-blink 1s steps(2) infinite' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}