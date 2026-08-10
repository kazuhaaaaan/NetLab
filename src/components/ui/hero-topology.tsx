import React, { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, Globe, Pause, Play, Zap } from 'lucide-react';

interface TopologyNode {
  id: string;
  x: number;
  y: number;
  label: string;
  color: string;
  kind: 'cloud' | 'router' | 'switch' | 'firewall' | 'pc' | 'server';
  joining?: boolean;
}

const TOPOLOGY_NODES: TopologyNode[] = [
  { id: 'inet', x: 105, y: 96, label: 'INET', color: '#94a3b8', kind: 'cloud' },
  { id: 'r1', x: 232, y: 96, label: 'R1', color: '#38bdf8', kind: 'router' },
  { id: 'sw1', x: 405, y: 96, label: 'SW1', color: '#818cf8', kind: 'switch' },
  { id: 'fw1', x: 578, y: 96, label: 'FW1', color: '#f87171', kind: 'firewall' },
  { id: 'r2', x: 695, y: 214, label: 'R2', color: '#22d3ee', kind: 'router' },
  { id: 'pc-a', x: 232, y: 318, label: 'PC-A', color: '#34d399', kind: 'pc' },
  { id: 'pc-b', x: 405, y: 318, label: 'PC-B', color: '#f472b6', kind: 'pc' },
  { id: 'srv', x: 578, y: 310, label: 'SRV', color: '#fb923c', kind: 'server' },
  { id: 'r3', x: 695, y: 330, label: 'R3', color: '#a3e635', kind: 'router', joining: true },
];

interface TopologyEdge {
  from: string;
  to: string;
  up: boolean;
  joining?: boolean;
}

const TOPOLOGY_EDGES: TopologyEdge[] = [
  { from: 'inet', to: 'r1', up: true },
  { from: 'r1', to: 'sw1', up: true },
  { from: 'sw1', to: 'fw1', up: true },
  { from: 'fw1', to: 'r2', up: true },
  { from: 'r1', to: 'pc-a', up: true },
  { from: 'sw1', to: 'pc-b', up: true },
  { from: 'r2', to: 'srv', up: true },
  { from: 'fw1', to: 'r3', up: false, joining: true },
];

const NODE_CAPTIONS: Record<string, string> = {
  cloud: 'WAN',
  router: 'router',
  switch: 'switch',
  firewall: 'firewall',
  server: 'server',
  pc: 'endpoint',
};

const NODE_HEIGHTS: Record<string, number> = {
  cloud: 36,
  router: 48,
  switch: 40,
  firewall: 48,
  server: 60,
  pc: 64,
};

const TOPO_TERMINAL = [
  { text: '[admin@MikroTik] > /ip address add', color: '#34d399' },
  { text: '  address=10.0.0.1/30 interface=ether1', color: '#94a3b8' },
  { text: '[admin@MikroTik] > /ip route add', color: '#34d399' },
  { text: '  dst-address=0.0.0.0/0 gateway=10.0.0.2', color: '#94a3b8' },
  { text: '[admin@MikroTik] > ping 10.0.0.2', color: '#34d399' },
  { text: '  sent=4 received=4 packet-loss=0%', color: '#a3e635' },
];

type JoinPhase = 'boot' | 'config' | 'up';

interface DeviceGlyphProps {
  color: string;
  active?: boolean;
  dim?: boolean;
}

function BlinkLed({ cx, cy, r = 1.2, color, delay = 0 }: { cx: number; cy: number; r?: number; color: string; delay?: number }) {
  return (
    <circle cx={cx} cy={cy} r={r} fill={color} style={{ animation: `netlab-blink 1.4s ease-in-out ${delay}s infinite` }} />
  );
}

/** Router: chasis + 2 antena + baris port dengan LED activity */
function RouterGlyph({ color, active = true, dim }: DeviceGlyphProps) {
  const led = active ? '#34d399' : '#facc15';
  return (
    <g opacity={dim ? 0.85 : 1}>
      <line x1={-32} y1={-26} x2={-40} y2={-42} stroke={color} strokeWidth="2" />
      <line x1={32} y1={-26} x2={40} y2={-42} stroke={color} strokeWidth="2" />
      <circle cx={-40} cy={-42} r="2.2" fill={color} />
      <circle cx={40} cy={-42} r="2.2" fill={color} />
      <rect x={-55} y={-25} width={110} height={50} rx="7" fill="#0d1117" stroke={color} strokeWidth="1.5"
        style={{ filter: `drop-shadow(0 0 10px ${color}33)` }} />
      <rect x={-49} y={-19} width={98} height={20} rx="4" fill="#161b22" stroke={color} strokeOpacity="0.35" />
      <BlinkLed cx={-42} cy={-9} color={led} />
      <BlinkLed cx={-36} cy={-9} color={led} delay={0.3} />
      <BlinkLed cx={-30} cy={-9} color={color} delay={0.6} />
      <rect x={-49} y={8} width={98} height={13} rx="3" fill="#0b0f14" stroke={color} strokeOpacity="0.4" />
      {Array.from({ length: 4 }).map((_, i) => (
        <g key={i}>
          <rect x={-42 + i * 22} y={10.5} width={15} height={8} rx="2" fill="#1c2330" stroke={color} strokeOpacity="0.5" />
          <BlinkLed cx={-34.5 + i * 22} cy={14.5} color={led} delay={i * 0.45} />
        </g>
      ))}
    </g>
  );
}

/** Switch: rack 1U dengan 8 port + LED link */
function SwitchGlyph({ color, active = true, dim }: DeviceGlyphProps) {
  const led = active ? '#34d399' : '#facc15';
  return (
    <g opacity={dim ? 0.85 : 1}>
      <rect x={-60} y={-20} width={120} height={40} rx="6" fill="#0d1117" stroke={color} strokeWidth="1.5"
        style={{ filter: `drop-shadow(0 0 10px ${color}33)` }} />
      <rect x={-54} y={-14} width={108} height={14} rx="3" fill="#161b22" stroke={color} strokeOpacity="0.35" />
      {Array.from({ length: 8 }).map((_, i) => (
        <g key={i}>
          <rect x={-48 + i * 13} y={-11.5} width={9} height={9} rx="1.5" fill="#0b0f14" stroke={color} strokeOpacity="0.45" />
          <BlinkLed cx={-43.5 + i * 13} cy={-7} color={led} delay={i * 0.22} />
        </g>
      ))}
      <BlinkLed cx={-52} cy={8} color={color} delay={0.2} />
      <BlinkLed cx={-46} cy={8} color={led} delay={0.5} />
      <rect x={42} y={5} width={12} height={10} rx="2" fill="#1c2330" stroke={color} strokeOpacity="0.5" />
    </g>
  );
}

/** Firewall: chasis dengan vent + indikator shield */
function FirewallGlyph({ color, active = true, dim }: DeviceGlyphProps) {
  const led = active ? '#34d399' : '#facc15';
  return (
    <g opacity={dim ? 0.85 : 1}>
      <rect x={-55} y={-25} width={110} height={50} rx="7" fill="#0d1117" stroke={color} strokeWidth="1.5"
        style={{ filter: `drop-shadow(0 0 10px ${color}33)` }} />
      <rect x={-49} y={-19} width={66} height={20} rx="4" fill="#161b22" stroke={color} strokeOpacity="0.35" />
      {Array.from({ length: 3 }).map((_, i) => (
        <line key={i} x1={-42} y1={-12 + i * 7} x2={-15} y2={-12 + i * 7} stroke={color} strokeOpacity="0.45" strokeWidth="1" />
      ))}
      <BlinkLed cx={-46} cy={-19} r={1.4} color={led} />
      <path d="M 69 -3 l 7 -5 v 8 z" fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M 62 -3 l 7 -5 v 8 z" fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <rect x={-49} y={8} width={98} height={13} rx="3" fill="#0b0f14" stroke={color} strokeOpacity="0.4" />
      {Array.from({ length: 2 }).map((_, i) => (
        <g key={i}>
          <rect x={-42 + i * 30} y={10.5} width={22} height={8} rx="2" fill="#1c2330" stroke={color} strokeOpacity="0.5" />
          <BlinkLed cx={-31 + i * 30} cy={14.5} color={led} delay={i * 0.5} />
        </g>
      ))}
    </g>
  );
}

/** Server: rack unit dengan drive bay + LED status */
function ServerGlyph({ color, active = true, dim }: DeviceGlyphProps) {
  const led = active ? '#34d399' : '#facc15';
  return (
    <g opacity={dim ? 0.85 : 1}>
      <rect x={-52} y={-30} width={104} height={60} rx="6" fill="#0d1117" stroke={color} strokeWidth="1.5"
        style={{ filter: `drop-shadow(0 0 10px ${color}33)` }} />
      {Array.from({ length: 2 }).map((_, row) => (
        <g key={row}>
          <rect x={-44} y={-24 + row * 26} width={40} height={20} rx="3" fill="#161b22" stroke={color} strokeOpacity="0.4" />
          <line x1={-36} y1={-22 + row * 26} x2={-36} y2={-6 + row * 26} stroke={color} strokeOpacity="0.4" />
          <line x1={-30} y1={-22 + row * 26} x2={-30} y2={-6 + row * 26} stroke={color} strokeOpacity="0.4" />
          <BlinkLed cx={-33} cy={-21 + row * 26} r={1.2} color={led} delay={row * 0.6} />
        </g>
      ))}
      <rect x={6} y={-24} width={38} height={46} rx="4" fill="#161b22" stroke={color} strokeOpacity="0.4" />
      <circle cx={25} cy={-8} r={8} fill="#0b0f14" stroke={color} strokeOpacity="0.5" />
      <circle cx={25} cy={-8} r={3.5} fill="none" stroke={color} strokeOpacity="0.5" style={{ animation: 'netlab-blink 2s ease-in-out infinite' }} />
      <BlinkLed cx={14} cy={14} r={1.4} color={color} />
      <BlinkLed cx={20} cy={14} r={1.4} color={led} delay={0.4} />
    </g>
  );
}

/** PC: monitor dengan layar + stand */
function PcGlyph({ color, active = true, dim }: DeviceGlyphProps) {
  return (
    <g opacity={dim ? 0.85 : 1}>
      <rect x={-46} y={-34} width={92} height={54} rx="6" fill="#0d1117" stroke={color} strokeWidth="1.5"
        style={{ filter: `drop-shadow(0 0 10px ${color}33)` }} />
      <rect x={-40} y={-28} width={80} height={42} rx="3" fill="#020617" stroke={color} strokeOpacity="0.5"
        style={{ filter: `drop-shadow(0 0 8px ${color}55 inset)` }} />
      <rect x={-40} y={-28} width={80} height={42} rx="3" fill={`url(#screenGrad-${color.replace('#', '')})`} opacity="0.35" />
      <line x1={-32} y1={-18} x2={-10} y2={-18} stroke="#1e293b" strokeWidth="2" />
      <line x1={-32} y1={-11} x2={-16} y2={-11} stroke="#1e293b" strokeWidth="2" />
      <line x1={-32} y1={-4} x2={-20} y2={-4} stroke="#1e293b" strokeWidth="2" />
      <line x1={10} y1={-18} x2={28} y2={-18} stroke={color} strokeOpacity="0.8" strokeWidth="2"
        style={{ animation: 'netlab-blink 2.2s ease-in-out infinite' }} />
      <rect x={25} y={14} width={5} height={14} rx="1" fill={color} stroke={color} strokeOpacity="0.5" />
      <rect x={-30} y={26} width={60} height={4} rx="2" fill={color} stroke={color} strokeOpacity="0.5" />
      <circle cx={0} cy={-28} r="1.2" fill="#64748b" />
    </g>
  );
}

/** Cloud WAN: bentuk awan dashed */
function CloudGlyph({ color, dim }: DeviceGlyphProps) {
  const g: React.SVGProps<SVGGElement> = { opacity: dim ? 0.85 : 1 };
  return (
    <g {...g}>
      <circle cx={-22} cy={4} r={15} fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="4 4" />
      <circle cx={0} cy={-6} r={18} fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="4 4" />
      <circle cx={22} cy={4} r={15} fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="4 4" />
      <path d="M -37 4 a 15 10 0 0 1 0 4 a 12 9 0 0 0 40 0 a 15 10 0 0 1 0 -4 z" fill="none" stroke={color} strokeWidth="1.5"
        strokeDasharray="6 4" style={{ animation: 'netlab-packet 3s linear infinite' }} />
      <circle cx={0} cy={0} r={28} fill="none" stroke={color} strokeOpacity="0.35" strokeWidth="1">
        <animate attributeName="r" values="26;34;26" dur="3s" repeatCount="indefinite" />
        <animate attributeName="stroke-opacity" values="0.35;0;0.35" dur="3s" repeatCount="indefinite" />
      </circle>
    </g>
  );
}

interface TopologySceneProps {
  running: boolean;
  dim?: boolean;
}

function DeviceGlyph({ node, phase }: { node: TopologyNode; phase: JoinPhase }) {
  const active = !node.joining || phase === 'up';
  switch (node.kind) {
    case 'cloud':
      return <CloudGlyph color={node.color} dim={false} />;
    case 'router':
      return <RouterGlyph color={node.color} active={active} />;
    case 'switch':
      return <SwitchGlyph color={node.color} active={active} />;
    case 'firewall':
      return <FirewallGlyph color={node.color} active={active} />;
    case 'server':
      return <ServerGlyph color={node.color} active={active} />;
    case 'pc':
      return <PcGlyph color={node.color} active={active} />;
  }
}

function TopologyScene({ running, dim = false }: TopologySceneProps) {
  const [phase, setPhase] = useState<JoinPhase>('boot');

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setPhase((p) => (p === 'boot' ? 'config' : p === 'config' ? 'up' : 'boot'));
    }, 3900);
    return () => window.clearInterval(id);
  }, [running]);

  const delayFor = (id: string) => (id.charCodeAt(1) % 5) * 0.5;
  const nodeById = (id: string) => TOPOLOGY_NODES.find((n) => n.id === id)!;
  const joinReady = phase === 'up';

  return (
    <svg viewBox="0 0 800 440" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        {TOPOLOGY_NODES.map((n) => (
          <linearGradient key={n.id} id={`screenGrad-${n.color.replace('#', '')}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={n.color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={n.color} stopOpacity="0.05" />
          </linearGradient>
        ))}
      </defs>

      {/* cables: digambar di bawah perangkat */}
      {TOPOLOGY_EDGES.map((e, i) => {
        const a = nodeById(e.from);
        const b = nodeById(e.to);
        const ah = NODE_HEIGHTS[a.kind] / 2;
        const bh = NODE_HEIGHTS[b.kind] / 2;
        if (e.joining) {
          return (
            <g key={i}>
              <line x1={a.x} y1={a.y + ah} x2={b.x} y2={b.y - bh} stroke="#2b2d33" strokeWidth="1.5" />
              <line
                x1={a.x} y1={a.y + ah} x2={b.x} y2={b.y - bh}
                stroke={joinReady ? b.color : '#facc15'}
                strokeWidth="2"
                strokeOpacity={joinReady ? 0.8 : 0.6}
                strokeDasharray={joinReady ? '6 6' : '3 9'}
                style={{ animation: `netlab-packet ${joinReady ? 0.9 : 1.8}s linear infinite` }}
              />
            </g>
          );
        }
        return (
          <g key={i}>
            <line x1={a.x} y1={a.y + ah} x2={b.x} y2={b.y - bh} stroke="#2b2d33" strokeWidth="1.5" />
            {e.up && (
              <line
                x1={a.x} y1={a.y + ah} x2={b.x} y2={b.y - bh}
                stroke={a.color}
                strokeWidth="1.5"
                strokeOpacity="0.55"
                strokeDasharray="5 5"
                style={{ animation: 'netlab-packet 1.4s linear infinite', animationDelay: `${i * 0.3}s` }}
              />
            )}
          </g>
        );
      })}

      {TOPOLOGY_NODES.map((n) => {
        const joinPhase = n.joining ? phase : null;
        const h = NODE_HEIGHTS[n.kind];
        return (
          <g key={n.id}>
            {/* pulse ring di bawah perangkat */}
            <ellipse cx={n.x} cy={n.y + h / 2 + 4} rx={58} ry={6} fill="none" stroke={joinPhase === 'up' ? '#a3e635' : n.color} strokeWidth="1" strokeOpacity="0.35">
              <animate attributeName="rx" values="56;68;56" dur="2.6s" begin={`${delayFor(n.id)}s`} repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" values="0.35;0;0.35" dur="2.6s" begin={`${delayFor(n.id)}s`} repeatCount="indefinite" />
            </ellipse>

            <g transform={`translate(${n.x}, ${n.y})`} style={{ animation: 'netlab-float 4s ease-in-out infinite' }}>
              <DeviceGlyph node={n} phase={phase} />
            </g>

            {/* joining: outline scan */}
            {n.joining && (
              <rect
                x={n.x - 66} y={n.y - h / 2 - 10} width={132} height={h + 20} rx="9" fill="none"
                stroke={joinPhase === 'up' ? '#a3e635' : '#facc15'}
                strokeWidth="1.5"
                strokeDasharray="8 6"
                style={{ animation: 'netlab-packet 1.1s linear infinite', opacity: 0.7 }}
              />
            )}

            <text x={n.x} y={n.y + h / 2 + 18} textAnchor="middle" fill={joinPhase === 'up' && n.joining ? '#a3e635' : n.color} fontSize="10" fontFamily="monospace" fontWeight="700">
              {n.label}
            </text>
            {!dim && (
              <text x={n.x} y={n.y + h / 2 + 30} textAnchor="middle" fill="#64748b" fontSize="7.5" fontFamily="monospace">
                {NODE_CAPTIONS[n.kind]}
              </text>
            )}
            {n.joining && (
              <text x={n.x} y={n.y + h / 2 + 44} textAnchor="middle" fontSize="7.5" fontFamily="monospace"
                fill={joinPhase === 'up' ? '#a3e635' : '#facc15'} style={{ animation: 'netlab-blink 1.6s ease-in-out infinite' }}>
                {joinPhase === 'boot' ? 'discovering…' : joinPhase === 'config' ? 'configuring…' : 'LINK UP ✓'}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

interface HeroTopologyCta {
  label: string;
  onClick?: () => void;
  href?: string;
  external?: boolean;
  icon?: 'arrow' | 'arrowUp' | 'globe';
}

interface HeroTopologyProps {
  badge?: string;
  badgeVersion?: string;
  title: React.ReactNode;
  subtitle?: string;
  primary: HeroTopologyCta;
  secondary?: HeroTopologyCta;
  tertiary?: HeroTopologyCta;
  footnote?: string;
  mediaTitle?: string;
  mediaSubtitle?: string;
}

function CtaIcon({ icon }: { icon?: 'arrow' | 'arrowUp' | 'globe' }) {
  if (icon === 'arrowUp') return <ArrowUpRight className="w-4 h-4 text-slate-500 transition-all group-hover:text-sky-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />;
  if (icon === 'globe') return <Globe className="w-4 h-4 text-slate-500 transition-all group-hover:text-indigo-400" />;
  return <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />;
}

function renderCta(cta: HeroTopologyCta, className: string) {
  const content = (
    <>
      {cta.label}
      <CtaIcon icon={cta.icon} />
    </>
  );
  if (cta.href) {
    return (
      <a href={cta.href} target={cta.external ? '_blank' : undefined} rel={cta.external ? 'noopener noreferrer' : undefined}
        className={className}>
        {content}
      </a>
    );
  }
  return (
    <button onClick={cta.onClick} className={className}>
      {content}
    </button>
  );
}

export function HeroTopology({
  badge = 'Open-source Network Simulator',
  badgeVersion = 'v1.0',
  title,
  subtitle,
  primary,
  secondary,
  tertiary,
  footnote,
  mediaTitle = 'Mikrolab — Enterprise Multi-Vendor Core Lab',
  mediaSubtitle = 'SIMULATING',
}: HeroTopologyProps) {
  const [running, setRunning] = useState(true);
  const [phase, setPhase] = useState<JoinPhase>('boot');
  const [lineIdx, setLineIdx] = useState(0);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setPhase((p) => (p === 'boot' ? 'config' : p === 'config' ? 'up' : 'boot'));
    }, 3900);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setLineIdx((i) => (i >= TOPO_TERMINAL.length ? 0 : i + 1));
    }, 1250);
    return () => window.clearInterval(id);
  }, [running]);

  const joinLabel = phase === 'up' ? '4/4 links up' : '3/4 + 1 connecting…';

  return (
    <section className="relative min-h-[calc(100vh-40px)] overflow-hidden rounded-b-xl">
      {/* ── Animated topology backdrop ─────────────────────────────────── */}
      <div
        className={`pointer-events-none absolute inset-0 ${running ? '' : 'netlab-paused'}`}
        style={{
          maskImage: 'radial-gradient(ellipse 85% 65% at 50% 0%, black 25%, transparent 72%)',
          WebkitMaskImage: 'radial-gradient(ellipse 85% 65% at 50% 0%, black 25%, transparent 72%)',
        }}
      >
        <div className="h-[560px] w-full opacity-45 saturate-[0.85]">
          <TopologyScene running={running} dim />
        </div>
      </div>

      {/* ── Hero content ───────────────────────────────────────────────── */}
      <div className="relative mx-auto max-w-4xl px-6 pt-36 sm:pt-44 pb-6 text-center sm:px-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#1F2128] bg-[#0F1015]/70 backdrop-blur px-3.5 py-1.5 text-[12px] font-medium text-slate-300"
          style={{ animation: 'netlab-fade-in 0.6s ease-out both' }}>
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" style={{ animation: 'netlab-pulse-ring 1.6s ease-out infinite' }} />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          {badge}
          <span className="text-slate-600">·</span>
          <span className="font-mono text-[11px] text-slate-500">{badgeVersion}</span>
        </div>

        <h1 className="mt-7 text-4xl sm:text-6xl lg:text-[68px] font-extrabold tracking-[-0.04em] leading-[1.05] text-slate-50"
          style={{ animation: 'netlab-fade-up 0.7s 0.08s ease-out both' }}>
          {title}
        </h1>

        {subtitle && (
          <p className="mt-6 mx-auto max-w-2xl text-[15px] sm:text-base text-slate-400 leading-relaxed"
            style={{ animation: 'netlab-fade-up 0.7s 0.16s ease-out both' }}>
            {subtitle}
          </p>
        )}

        <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3.5"
          style={{ animation: 'netlab-fade-up 0.7s 0.24s ease-out both' }}>
          {renderCta(primary, 'group flex items-center gap-2 rounded-lg bg-white text-slate-900 text-sm font-semibold px-6 py-3 transition-all duration-200 hover:bg-slate-200 hover:scale-[1.03] active:scale-[0.98] shadow-[0_0_36px_-10px_rgba(255,255,255,0.5)]')}
          {secondary && renderCta(secondary, 'group flex items-center gap-2 rounded-lg border border-[#1F2128] bg-[#0F1015]/60 backdrop-blur text-slate-200 text-sm font-medium px-6 py-3 transition-all duration-200 hover:border-sky-500/40 hover:bg-[#0F1015] hover:scale-[1.03] active:scale-[0.98]')}
          {tertiary && renderCta(tertiary, 'group flex items-center gap-2 rounded-lg border border-[#1F2128] bg-[#0F1015]/60 backdrop-blur text-slate-400 text-sm font-medium px-5 py-3 transition-all duration-200 hover:border-indigo-500/40 hover:bg-[#0F1015] hover:text-slate-200 hover:scale-[1.03] active:scale-[0.98]')}
        </div>

        {footnote && (
          <p className="mt-5 text-[11px] font-mono text-slate-600" style={{ animation: 'netlab-fade-in 0.7s 0.34s ease-out both' }}>
            {footnote}
          </p>
        )}
      </div>

      {/* ── Media header: live topology console ────────────────────────── */}
      <div className="relative mx-auto max-w-6xl px-6 pb-14 sm:px-8"
        style={{ animation: 'netlab-fade-up 0.9s 0.32s ease-out both' }}>
        <div className="relative overflow-hidden rounded-2xl border border-[#1F2128] bg-[#0F1015]/70 backdrop-blur-xl shadow-[0_24px_80px_-24px_rgba(0,0,0,0.8)]">
          {/* window chrome */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1F2128]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#3d3f45]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#3d3f45]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#3d3f45]" />
            <span className="ml-3 text-[11px] font-mono text-slate-500 truncate">{mediaTitle}</span>
            <span className={`ml-auto flex items-center gap-1.5 text-[10px] font-mono ${running ? 'text-emerald-400' : 'text-amber-400'}`}>
              <span className="w-1 h-1 rounded-full bg-current" style={{ animation: running ? 'netlab-blink 1.2s ease-in-out infinite' : undefined }} />
              {running ? mediaSubtitle : 'PAUSED'}
            </span>
          </div>

          <div className={`grid md:grid-cols-[1fr_240px] ${running ? '' : 'netlab-paused'}`}>
            {/* topology canvas */}
            <div className="relative p-4 min-h-[300px] md:min-h-[360px] overflow-hidden">
              <div className="absolute inset-0" style={{
                backgroundImage: 'linear-gradient(rgba(148,163,184,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.04) 1px, transparent 1px)',
                backgroundSize: '28px 28px',
              }} />
              <div className="relative w-full max-h-[360px]">
                <TopologyScene running={running} />
              </div>

              {/* floating status chips */}
              <div className="absolute top-4 right-4 hidden sm:flex items-center gap-1.5 rounded-md border border-[#1F2128] bg-[#0B0C0E]/80 backdrop-blur px-2.5 py-1 text-[10px] font-mono text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: phase === 'up' ? '#34d399' : '#facc15' }} />
                {joinLabel}
              </div>
              <div className="absolute bottom-4 left-4 hidden sm:flex items-center gap-1.5 rounded-md border border-[#1F2128] bg-[#0B0C0E]/80 backdrop-blur px-2.5 py-1 text-[10px] font-mono text-slate-400">
                <Zap className="w-3 h-3 text-amber-400" /> TTL 62 · 2 hops
              </div>
              {/* media controls */}
              <button
                onClick={() => setRunning((r) => !r)}
                aria-label={running ? 'Pause simulation' : 'Resume simulation'}
                className="absolute bottom-4 right-4 z-10 w-11 h-11 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center hover:bg-white/20 transition-all duration-200 shadow-lg"
              >
                {running ? <Pause className="h-5 w-5 text-white fill-white" /> : <Play className="h-5 w-5 text-white fill-white ml-0.5" />}
              </button>
            </div>

            {/* live config terminal */}
            <div className="hidden md:flex flex-col border-l border-[#1F2128] bg-[#0B0C0E]/60">
              <div className="px-3 py-2 border-b border-[#1F2128] text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                MikroTik · node-1
              </div>
              <div className="flex-1 p-3 space-y-1.5 font-mono text-[10.5px] leading-relaxed overflow-hidden">
                {TOPO_TERMINAL.slice(0, lineIdx === 0 ? 0 : lineIdx).map((line, i) => (
                  <div key={i} className="whitespace-pre-wrap transition-opacity duration-500" style={{ color: line.color }}>
                    {line.text}
                  </div>
                ))}
                <div className="text-emerald-400">
                  [admin@MikroTik] &gt; <span className="inline-block w-1.5 h-3 bg-slate-300 align-middle" style={{ animation: 'netlab-blink 1s steps(2) infinite' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom fade into page background ───────────────────────────── */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0B0C0E] to-transparent" />
    </section>
  );
}