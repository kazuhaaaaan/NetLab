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
  { id: 'inet', x: 88, y: 84, label: 'INET', color: '#94a3b8', kind: 'cloud' },
  { id: 'r1', x: 214, y: 84, label: 'R1', color: '#38bdf8', kind: 'router' },
  { id: 'sw1', x: 400, y: 84, label: 'SW1', color: '#818cf8', kind: 'switch' },
  { id: 'fw1', x: 588, y: 84, label: 'FW1', color: '#f87171', kind: 'firewall' },
  { id: 'r2', x: 712, y: 216, label: 'R2', color: '#22d3ee', kind: 'router' },
  { id: 'pc-a', x: 214, y: 262, label: 'PC-A', color: '#34d399', kind: 'pc' },
  { id: 'pc-b', x: 400, y: 262, label: 'PC-B', color: '#f472b6', kind: 'pc' },
  { id: 'srv', x: 588, y: 262, label: 'SRV', color: '#fb923c', kind: 'server' },
  { id: 'r3', x: 712, y: 350, label: 'R3', color: '#a3e635', kind: 'router', joining: true },
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

const TOPO_TERMINAL = [
  { text: '[admin@MikroTik] > /ip address add', color: '#34d399' },
  { text: '  address=10.0.0.1/30 interface=ether1', color: '#94a3b8' },
  { text: '[admin@MikroTik] > /ip route add', color: '#34d399' },
  { text: '  dst-address=0.0.0.0/0 gateway=10.0.0.2', color: '#94a3b8' },
  { text: '[admin@MikroTik] > ping 10.0.0.2', color: '#34d399' },
  { text: '  sent=4 received=4 packet-loss=0%', color: '#a3e635' },
];

type JoinPhase = 'boot' | 'config' | 'up';

interface TopologySceneProps {
  running: boolean;
  dim?: boolean;
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

  const nodeById = (id: string) => TOPOLOGY_NODES.find((n) => n.id === id)!;
  const joinReady = phase === 'up';

  return (
    <svg viewBox="0 0 800 440" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      {TOPOLOGY_EDGES.map((e, i) => {
        const a = nodeById(e.from);
        const b = nodeById(e.to);
        if (e.joining) {
          return (
            <g key={i}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#2b2d33" strokeWidth="1.5" />
              <line
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
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
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#2b2d33" strokeWidth="1.5" />
            {e.up && (
              <line
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
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
        return (
          <g key={n.id}>
            {n.kind === 'cloud' && (
              <circle cx={n.x} cy={n.y} r="26" fill="none" stroke={n.color} strokeWidth="1" strokeDasharray="4 6" strokeOpacity="0.5" />
            )}
            <circle cx={n.x} cy={n.y} r="20" fill="#0f172a" stroke={n.color} strokeWidth="1.5"
              style={{ filter: `drop-shadow(0 0 8px ${n.color}44)`, animation: 'netlab-float 4s ease-in-out infinite' }} />
            <circle cx={n.x} cy={n.y} r="20" fill="none" stroke={joinPhase === 'up' ? '#a3e635' : n.color} strokeWidth="1" strokeOpacity="0.4">
              <animate attributeName="r" values="20;28;20" dur="2.6s" begin={`${n.id.charCodeAt(1) * 0.2}s`} repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" values="0.4;0;0.4" dur="2.6s" begin={`${n.id.charCodeAt(1) * 0.2}s`} repeatCount="indefinite" />
            </circle>
            {n.joining && (
              <circle cx={n.x} cy={n.y} r="28" fill="none" stroke={joinPhase === 'up' ? '#a3e635' : '#facc15'} strokeWidth="1.5" strokeDasharray="7 7"
                style={{ animation: 'netlab-joinring 2.4s linear infinite', transformBox: 'fill-box', transformOrigin: 'center' }} />
            )}
            <text x={n.x} y={n.y + 4} textAnchor="middle" fill={n.color} fontSize="10" fontFamily="monospace" fontWeight="700">
              {n.label}
            </text>
            {!dim && (
              <text x={n.x} y={n.y + 18} textAnchor="middle" fill="#64748b" fontSize="7.5" fontFamily="monospace">
                {n.kind === 'cloud' ? 'WAN' : n.kind === 'router' ? 'router' : n.kind === 'switch' ? 'switch' : n.kind === 'firewall' ? 'firewall' : n.kind === 'server' ? 'server' : 'endpoint'}
              </text>
            )}
            {n.joining && (
              <text x={n.x} y={n.y + 40} textAnchor="middle" fontSize="7.5" fontFamily="monospace"
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