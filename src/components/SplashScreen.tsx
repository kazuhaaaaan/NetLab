import React, { useEffect, useState, useRef } from 'react';

// â”€â”€â”€ Node positions for topology animation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const NODES = [
  { id: 0, x: 300, y: 160, delay: 0,   label: 'R1', color: '#38bdf8' },
  { id: 1, x: 160, y: 290, delay: 180, label: 'SW', color: '#818cf8' },
  { id: 2, x: 440, y: 290, delay: 180, label: 'FW', color: '#f87171' },
  { id: 3, x: 80,  y: 420, delay: 360, label: 'PC', color: '#34d399' },
  { id: 4, x: 260, y: 420, delay: 360, label: 'SRV', color: '#fb923c' },
  { id: 5, x: 400, y: 410, delay: 360, label: 'AP',  color: '#22d3ee' },
  { id: 6, x: 520, y: 420, delay: 360, label: 'PC2', color: '#34d399' },
];

const EDGES = [
  { from: 0, to: 1, delay: 500 },
  { from: 0, to: 2, delay: 600 },
  { from: 1, to: 3, delay: 750 },
  { from: 1, to: 4, delay: 850 },
  { from: 2, to: 5, delay: 950 },
  { from: 2, to: 6, delay: 1050 },
];

interface SplashScreenProps {
  onDone: () => void;
}

const NODE_R = 22;
const TOTAL_MS = 2800; // total anim before fade-out starts

export const SplashScreen: React.FC<SplashScreenProps> = ({ onDone }) => {
  const [phase, setPhase] = useState<'visible' | 'fadeout'>('visible');
  // Track which nodes/edges are "revealed"
  const [visibleNodes, setVisibleNodes] = useState<Set<number>>(new Set());
  const [visibleEdges, setVisibleEdges] = useState<Set<number>>(new Set());
  const [textVisible, setTextVisible] = useState(false);
  const [dotCount, setDotCount] = useState(1);

  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    // Nodes appear
    NODES.forEach((n) => {
      const t = window.setTimeout(() => {
        setVisibleNodes((prev) => new Set([...prev, n.id]));
      }, 200 + n.delay);
      timersRef.current.push(t);
    });

    // Edges appear
    EDGES.forEach((e, i) => {
      const t = window.setTimeout(() => {
        setVisibleEdges((prev) => new Set([...prev, i]));
      }, e.delay);
      timersRef.current.push(t);
    });

    // Text fades in
    const tText = window.setTimeout(() => setTextVisible(true), 900);
    timersRef.current.push(tText);

    // Start fade-out
    const tFade = window.setTimeout(() => setPhase('fadeout'), TOTAL_MS);
    timersRef.current.push(tFade);

    // Call onDone after fade-out completes
    const tDone = window.setTimeout(() => onDone(), TOTAL_MS + 650);
    timersRef.current.push(tDone);

    // Animate dots
    const dotInterval = window.setInterval(() => {
      setDotCount((c) => (c % 3) + 1);
    }, 400);
    timersRef.current.push(dotInterval as unknown as number);

    return () => {
      timersRef.current.forEach(clearTimeout);
      clearInterval(dotInterval);
    };
  }, [onDone]);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center transition-opacity duration-700 ease-in-out ${
        phase === 'fadeout' ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      style={{
        background: 'radial-gradient(ellipse at 50% 40%, #0f172a 0%, #020617 70%)',
      }}
    >
      {/* Grid background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.07]"
        style={{
          backgroundImage: `linear-gradient(rgba(148,163,184,1) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(148,163,184,1) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Glow blobs */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(56,189,248,0.08) 0%, transparent 70%)' }} />
      <div className="absolute top-1/2 left-1/3 w-64 h-64 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(129,140,248,0.06) 0%, transparent 70%)' }} />

      {/* SVG Topology Animation */}
      <svg
        viewBox="0 0 600 520"
        className="w-72 h-56 sm:w-96 sm:h-72 relative z-10 drop-shadow-xl"
        style={{ filter: 'drop-shadow(0 0 18px rgba(56,189,248,0.15))' }}
      >
        {/* Edges */}
        {EDGES.map((edge, i) => {
          const from = NODES[edge.from];
          const to = NODES[edge.to];
          const visible = visibleEdges.has(i);
          return (
            <g key={i}>
              {/* Glow edge */}
              <line
                x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                stroke="#38bdf8"
                strokeWidth="6"
                strokeOpacity={visible ? 0.12 : 0}
                style={{ transition: 'stroke-opacity 0.5s ease' }}
              />
              {/* Main edge */}
              <line
                x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                stroke="#38bdf8"
                strokeWidth="1.5"
                strokeOpacity={visible ? 0.7 : 0}
                strokeDasharray="4 3"
                style={{ transition: 'stroke-opacity 0.5s ease' }}
              />
              {/* Traveling packet dot */}
              {visible && (
                <circle r="3" fill="#a5f3fc" opacity="0.9">
                  <animateMotion
                    path={`M ${from.x} ${from.y} L ${to.x} ${to.y}`}
                    dur="1.8s"
                    repeatCount="indefinite"
                    begin={`${(i * 0.3).toFixed(1)}s`}
                  />
                </circle>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {NODES.map((node) => {
          const visible = visibleNodes.has(node.id);
          return (
            <g key={node.id} style={{ transition: 'opacity 0.4s ease, transform 0.4s ease', opacity: visible ? 1 : 0 }}>
              {/* Outer pulse ring */}
              <circle cx={node.x} cy={node.y} r={NODE_R + 8} fill="none"
                stroke={node.color} strokeWidth="1" strokeOpacity={visible ? 0.25 : 0}
                style={{ transition: 'stroke-opacity 0.4s' }}>
                {visible && (
                  <animate attributeName="r" values={`${NODE_R + 4};${NODE_R + 14};${NODE_R + 4}`}
                    dur="2.5s" repeatCount="indefinite" />
                )}
                {visible && (
                  <animate attributeName="stroke-opacity" values="0.3;0;0.3" dur="2.5s" repeatCount="indefinite" />
                )}
              </circle>
              {/* Node bg */}
              <circle cx={node.x} cy={node.y} r={NODE_R}
                fill="#0f172a" stroke={node.color} strokeWidth="1.5"
                style={{ filter: `drop-shadow(0 0 6px ${node.color}55)` }}
              />
              {/* Label */}
              <text x={node.x} y={node.y + 5} textAnchor="middle"
                fill={node.color} fontSize="10" fontFamily="monospace" fontWeight="700">
                {node.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Branding Text */}
      <div
        className="relative z-10 text-center mt-2 flex flex-col items-center"
        style={{
          opacity: textVisible ? 1 : 0,
          transform: textVisible ? 'translateY(0)' : 'translateY(12px)',
          transition: 'opacity 0.7s ease, transform 0.7s ease',
        }}
      >
        {/* Logo + name */}
        <div className="flex items-center space-x-2 mb-1">
          <span className="text-3xl sm:text-4xl font-extrabold tracking-tight"
            style={{
              background: 'linear-gradient(90deg, #38bdf8, #818cf8, #34d399)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
            Mikrolab
          </span>
        </div>

        {/* By KazuDev */}
        <p className="text-xs sm:text-sm text-slate-400 font-mono tracking-[0.2em] mb-4">
          by <span className="text-indigo-400 font-semibold">KazuDev</span>
        </p>

        {/* Tech tagline */}
        <p className="text-slate-500 text-[11px] sm:text-xs font-mono tracking-wider max-w-xs text-center leading-relaxed">
          Design. Simulate. Configure.
          <br />
          <span className="text-slate-600">Open-source network lab for engineers.</span>
        </p>

        {/* Loading dots */}
        <div className="mt-6 flex items-center space-x-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor: i < dotCount ? '#38bdf8' : '#1e293b',
                transition: 'background-color 0.2s',
                boxShadow: i < dotCount ? '0 0 6px #38bdf8' : 'none',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
