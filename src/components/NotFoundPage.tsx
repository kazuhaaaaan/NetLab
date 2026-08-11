import React, { useMemo } from 'react';
import { Globe, Home, Rocket } from 'lucide-react';

interface NotFoundPageProps {
  onGoHome: () => void;
}

/** Bintang latar yang deterministik (seeded) supaya tidak berubah tiap render. */
function seededStars(n: number, seed: number): { x: number; y: number; r: number; d: number; o: number }[] {
  const rand = (s: number) => {
    const x = Math.sin(s) * 43758.5453123;
    return x - Math.floor(x);
  };
  return Array.from({ length: n }, (_, i) => ({
    x: rand(seed + i * 7.13) * 100,
    y: rand(seed + i * 3.71) * 100,
    r: 0.6 + rand(seed + i * 1.91) * 1.8,
    d: 1.5 + rand(seed + i * 11.3) * 3.5,
    o: 0.35 + rand(seed + i * 5.17) * 0.65,
  }));
}

/** Topologi "yang sedang terhubung" — susunan node tetap (lab standar),
 *  dirender sebagai rasi bintang: node = bintang berdenyut, kabel = garis
 *  dengan paket data meluncur. */
const TOPO_NODES: { x: number; y: number; label: string; kind: 'router' | 'switch' | 'host' }[] = [
  { x: 50, y: 18, label: 'ISP', kind: 'router' },
  { x: 18, y: 44, label: 'R1', kind: 'router' },
  { x: 50, y: 58, label: 'SW1', kind: 'switch' },
  { x: 82, y: 44, label: 'R2', kind: 'router' },
  { x: 16, y: 80, label: 'PC1', kind: 'host' },
  { x: 50, y: 82, label: 'PC2', kind: 'host' },
  { x: 84, y: 80, label: 'PC3', kind: 'host' },
];

const TOPO_LINKS: [number, number][] = [
  [0, 1], [0, 3], [1, 2], [3, 2], [1, 4], [2, 5], [3, 6],
];

const KIND_GLOW: Record<string, string> = {
  router: '#22d3ee', // cyan
  switch: '#a78bfa', // violet
  host: '#34d399',   // emerald
};

export default function NotFoundPage({ onGoHome }: NotFoundPageProps) {
  const stars = useMemo(() => seededStars(140, 404), []);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#0B0C0E] text-slate-100 font-sans">
      {/* Gradasi luar angkasa: nebula deep blue & ungu */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_45%_at_18%_12%,rgba(56,59,164,0.28),transparent_62%),radial-gradient(ellipse_55%_50%_at_85%_22%,rgba(109,40,217,0.22),transparent_60%),radial-gradient(ellipse_70%_60%_at_50%_115%,rgba(8,145,178,0.18),transparent_65%)]" />

      {/* Starfield berkelip */}
      <div className="absolute inset-0" aria-hidden>
        {stars.map((s, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-white netlab-star"
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: s.r,
              height: s.r,
              opacity: s.o,
              animationDuration: `${s.d}s`,
              animationDelay: `${(i % 7) * 0.42}s`,
            }}
          />
        ))}
      </div>

      {/* Topologi yang sedang terhubung — rasi bintang dengan paket meluncur */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full opacity-80"
        aria-hidden
      >
        <defs>
          <radialGradient id="nfp-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="white" stopOpacity="0.9" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Kabel antar node */}
        {TOPO_LINKS.map(([a, b], i) => {
          const na = TOPO_NODES[a];
          const nb = TOPO_NODES[b];
          return (
            <g key={i}>
              <line
                x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
                stroke="#64748b"
                strokeWidth="0.12"
                strokeOpacity="0.5"
                strokeDasharray="0.6 0.9"
              />
              {/* Paket data meluncur di kabel */}
              <circle r="0.45" fill={KIND_GLOW[na.kind]} opacity="0.95">
                <animateMotion
                  dur={`${2.4 + (i % 4) * 0.8}s`}
                  repeatCount="indefinite"
                  path={`M${na.x},${na.y} L${nb.x},${nb.y}`}
                />
              </circle>
            </g>
          );
        })}

        {/* Node — bintang berdenyut */}
        {TOPO_NODES.map((n, i) => (
          <g key={i}>
            <circle cx={n.x} cy={n.y} r="3.2" fill={KIND_GLOW[n.kind]} opacity="0.14">
              <animate attributeName="r" values="2.2;3.8;2.2" dur="3.6s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.14;0.32;0.14" dur="3.6s" repeatCount="indefinite" />
            </circle>
            <circle cx={n.x} cy={n.y} r="1.15" fill={KIND_GLOW[n.kind]} />
            <circle cx={n.x} cy={n.y} r="2.1" fill="url(#nfp-glow)" opacity="0.55" />
            <text
              x={n.x} y={n.y - 2.1}
              textAnchor="middle"
              fontSize="2.4"
              fill={KIND_GLOW[n.kind]}
              fillOpacity="0.9"
              fontFamily="'JetBrains Mono', monospace"
            >
              {n.label}
            </text>
          </g>
        ))}
      </svg>

      {/* Kabut nebula di bawah + "planet" */}
      <div className="absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-violet-500/10 blur-3xl" />

      {/* Konten 404 */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <div className="netlab-float-404">
          <div className="flex items-center justify-center gap-2 text-cyan-300/70 font-mono text-xs tracking-[0.35em] uppercase mb-3">
            <Globe size={13} /> Err 404 · Halaman Tidak Ditemukan
          </div>
          <h1
            className="text-[86px] sm:text-[128px] leading-none font-black tracking-tight netlab-404-glow"
            style={{ backgroundImage: 'linear-gradient(120deg,#67e8f9 0%,#a78bfa 55%,#34d399 100%)' }}
          >
            404
          </h1>
          <p className="mt-5 max-w-md text-sm sm:text-base text-slate-400 leading-relaxed">
            Jalanmu ke halaman ini terputus dari topologi — kayaknya kabelnya
            belum disambung, atau planetnya sudah pindah galaksi.
          </p>
          <p className="mt-2 font-mono text-xs text-slate-600">
            route 0.0.0.0/0 unreachable → destination host does not exist
          </p>
        </div>

        <div className="mt-10 flex flex-col sm:flex-row items-center gap-3">
          <button
            onClick={onGoHome}
            className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition-transform hover:scale-[1.04] active:scale-95"
          >
            <Home size={16} />
            Kembali ke NetLab
            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs font-normal">/home</span>
          </button>
          <a
            href="https://www.kazudev.my.id"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-6 py-3 text-sm font-semibold text-slate-200 backdrop-blur transition-colors hover:border-slate-500 hover:bg-slate-800/70 hover:text-white"
          >
            <Rocket size={16} className="text-emerald-400" />
            Portofolio Developer · kazudev.my.id
          </a>
        </div>

        <p className="mt-10 font-mono text-[11px] text-slate-700">
          NetLab — Networking Laboratory · Multi-Vendor Network Simulator
        </p>
      </div>
    </div>
  );
}