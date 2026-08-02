import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpenText,
  Boxes,
  Check,
  Copy,
  Cpu,
  ExternalLink,
  Globe,
  Heart,
  Layers,
  ListChecks,
  Network,
  Router,
  Sparkles,
  Terminal,
  Waypoints,
  Zap,
} from 'lucide-react';
import { BEGINNER_GUIDES, VendorGuide } from '../data/beginnerGuide';
import { CLI_HINTS, CliHint } from '../data/cliHints';
import { getModelsForVendor, getPortsForModel } from '../data/deviceModels';

interface LandingPageProps {
  onLaunch: () => void;
  onOpenDonate: () => void;
}

const STORE_URL = 'https://toko.kazudev.my.id';

// ─── Hero mock-topology data (SVG preview window) ─────────────────────────────
const PREVIEW_NODES = [
  { id: 'r1', x: 120, y: 84,  label: 'R1', color: '#38bdf8', type: 'router' },
  { id: 'sw', x: 300, y: 84,  label: 'SW', color: '#818cf8', type: 'switch' },
  { id: 'fw', x: 470, y: 84,  label: 'FW', color: '#f87171', type: 'firewall' },
  { id: 'pc', x: 190, y: 196, label: 'PC', color: '#34d399', type: 'pc' },
  { id: 'srv', x: 400, y: 196, label: 'SRV', color: '#fb923c', type: 'server' },
] as const;

const PREVIEW_EDGES = [
  { from: 0, to: 1 },
  { from: 1, to: 2 },
  { from: 0, to: 3 },
  { from: 1, to: 4 },
];

const TERMINAL_LINES = [
  { text: '[admin@MikroTik] > /ip address print', color: '#34d399' },
  { text: ' 0 192.168.88.1/24     ether1', color: '#94a3b8' },
  { text: ' 1 10.0.0.1/30        ether2', color: '#94a3b8' },
  { text: '[admin@MikroTik] > ping 192.168.88.2', color: '#34d399' },
  { text: '   0 192.168.88.2 56 64 0ms echo reply', color: '#38bdf8' },
  { text: '   sent=3 received=3 packet-loss=0%', color: '#a3e635' },
];

const FEATURES = [
  {
    icon: Waypoints,
    title: 'Real Packet Simulation',
    desc: 'Bukan sekadar gambar — router, switch, dan firewall benar-benar mem-forward paket hop-by-hop dengan TTL, ARP, dan return-path checking.',
    accent: '#38bdf8',
  },
  {
    icon: Terminal,
    title: '11 Vendor CLI Engine',
    desc: 'MikroTik, Cisco IOS/NX-OS, Juniper, Huawei, Fortinet, VyOS, EdgeOS, Aruba, OpenWrt, dan Linux — konfigurasi asli langsung bekerja.',
    accent: '#34d399',
  },
  {
    icon: Router,
    title: 'Routing & L2 Forwarding',
    desc: 'Longest-prefix-match routing, connected/static routes, flooding dan MAC learning pada switch, plus penelusuran jalur hop demi hop.',
    accent: '#818cf8',
  },
  {
    icon: Cpu,
    title: 'Ping & Traceroute',
    desc: 'Uji konektivitas dengan ICMP sungguhan. Lihat hop yang dilalui, TTL di tujuan, dan kenapa paket gagal (no route, TTL expired, dst).',
    accent: '#fb923c',
  },
  {
    icon: Boxes,
    title: 'Topologi Persisten',
    desc: 'Canvas, kabel, dan seluruh konfigurasi CLI tersimpan otomatis di browser — refresh tidak menghapus kerja kerasmu.',
    accent: '#f472b6',
  },
  {
    icon: Layers,
    title: 'Zero Setup, In-Browser',
    desc: 'Tidak perlu install GNS3, EVE-NG, atau VM. Cukup buka browser dan mulai mendesain jaringan enterprise-mu sekarang.',
    accent: '#22d3ee',
  },
];

const VENDOR_CHIPS = [
  'MikroTik',
  'Cisco IOS',
  'Cisco NX-OS',
  'Juniper JunOS',
  'Huawei VRP',
  'Fortinet FortiOS',
  'VyOS',
  'EdgeOS',
  'ArubaOS-CX',
  'OpenWrt',
  'Debian Linux',
];

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Vendors', href: '#vendors' },
  { label: 'Guide', href: '#guide' },
  { label: 'Services', href: '#services' },
];

function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-lg border border-slate-700/60 shadow-[0_0_20px_-6px_rgba(56,189,248,0.4)]"
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      }}
    >
      <Network className="text-sky-400" style={{ width: size * 0.55, height: size * 0.55 }} />
    </div>
  );
}

/** Reusable frosted-glass card used across the page. */
function GlassCard({
  children,
  className = '',
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`relative rounded-xl border border-[#1F2128] bg-[#0F1015]/70 backdrop-blur-xl transition-all duration-300 hover:border-sky-500/30 hover:shadow-[0_0_0_1px_rgba(56,189,248,0.12),0_12px_48px_-12px_rgba(56,189,248,0.12)] hover:scale-[1.02] ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

interface CommandGroup {
  root: string;
  commands: CliHint[];
}

function flattenCommandGroups(vendorId: string): CommandGroup[] {
  const tree = CLI_HINTS[vendorId] || [];
  if (tree.length === 0) return [];
  const groups: CommandGroup[] = [];
  const standalone: CliHint[] = [];
  for (const h of tree) {
    if (h.children && h.children.length > 0) {
      const leaves: CliHint[] = [];
      const walk = (list: CliHint[]) => {
        for (const c of list) {
          if (c.children && c.children.length > 0) walk(c.children);
          else leaves.push(c);
        }
      };
      walk(h.children);
      groups.push({ root: h.command, commands: leaves });
    } else {
      standalone.push(h);
    }
  }
  if (standalone.length > 0) groups.push({ root: 'Perintah Utama', commands: standalone });
  return groups;
}

const VENDOR_ACCENTS: Record<string, string> = {
  mikrotik: '#34d399',
  cisco_ios: '#38bdf8',
  cisco_nxos: '#818cf8',
  juniper: '#fb923c',
  huawei: '#f472b6',
  ubiquiti: '#22d3ee',
  vyos: '#a3e635',
  fortinet: '#f87171',
  aruba: '#c084fc',
  openwrt: '#facc15',
  linux: '#94a3b8',
};

export const LandingPage: React.FC<LandingPageProps> = ({ onLaunch, onOpenDonate }) => {
  const [scrolled, setScrolled] = useState(false);
  const [pingLine, setPingLine] = useState(0);
  const [guideVendorId, setGuideVendorId] = useState('mikrotik');
  const [copiedKey, setCopiedKey] = useState('');

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((c) => (c === key ? '' : c)), 1500);
    } catch {
      setCopiedKey('');
    }
  };

  const activeGuide: VendorGuide =
    BEGINNER_GUIDES.find((g) => g.vendorId === guideVendorId) || BEGINNER_GUIDES[0];
  const guideAccent = VENDOR_ACCENTS[guideVendorId] || '#38bdf8';
  const guideGroups = flattenCommandGroups(guideVendorId);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Animate the terminal lines in the hero preview
  useEffect(() => {
    const t = window.setInterval(() => {
      setPingLine((p) => (p + 1) % TERMINAL_LINES.length);
    }, 1400);
    return () => window.clearInterval(t);
  }, []);

  const launch = () => {
    window.scrollTo({ top: 0 });
    onLaunch();
  };

  return (
    <div
      className="relative min-h-screen w-full overflow-x-hidden bg-[#0B0C0E] text-slate-100 font-sans scroll-smooth"
    >
      {/* ── Ambient background: grid + glow blobs ─────────────────────────── */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(148,163,184,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.05) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage:
            'radial-gradient(ellipse 90% 60% at 50% 0%, black 30%, transparent 75%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 90% 60% at 50% 0%, black 30%, transparent 75%)',
        }}
      />
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[720px] h-[480px] rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(56,189,248,0.09) 0%, transparent 65%)' }} />
      <div className="pointer-events-none absolute top-1/3 -left-40 w-[480px] h-[480px] rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(129,140,248,0.06) 0%, transparent 65%)' }} />
      <div className="pointer-events-none absolute top-1/2 -right-40 w-[480px] h-[480px] rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(52,211,153,0.05) 0%, transparent 65%)' }} />

      {/* ── Navbar ───────────────────────────────────────────────────────── */}
      <header
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-[#0B0C0E]/80 backdrop-blur-xl border-b border-white/[0.06]'
            : 'bg-transparent border-b border-transparent'
        }`}
      >
        <nav className="mx-auto max-w-6xl px-5 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LogoMark />
            <div className="flex flex-col leading-none">
              <span className="text-[15px] font-bold tracking-tight text-slate-100">
                NetLab
              </span>
              <span className="text-[10px] font-mono text-slate-500 tracking-[0.18em] uppercase">
                by KazuDev
              </span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-7">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-[13px] font-medium text-slate-400 hover:text-slate-100 transition-colors"
              >
                {l.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onOpenDonate}
              className="group flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-300 text-[13px] font-semibold px-3.5 py-2 transition-all duration-200 hover:bg-rose-500/20 hover:scale-[1.03] active:scale-[0.98]"
              title="Donate untuk support developer"
            >
              <Heart className="w-3.5 h-3.5 text-rose-400 transition-transform group-hover:scale-125" />
              Donate
            </button>
            <button
              onClick={launch}
              className="group flex items-center gap-1.5 rounded-lg bg-white text-slate-900 text-[13px] font-semibold px-4 py-2 transition-all duration-200 hover:bg-slate-200 hover:scale-[1.03] active:scale-[0.98] shadow-[0_0_24px_-8px_rgba(255,255,255,0.4)]"
            >
              Open Canvas
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </nav>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative pt-36 sm:pt-44 pb-16 sm:pb-24 px-5 sm:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            className="inline-flex items-center gap-2 rounded-full border border-[#1F2128] bg-[#0F1015]/70 backdrop-blur px-3.5 py-1.5 text-[12px] font-medium text-slate-300"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" style={{ animation: 'netlab-pulse-ring 1.6s ease-out infinite' }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            Open-source Network Simulator
            <span className="text-slate-600">·</span>
            <span className="font-mono text-[11px] text-slate-500">v1.0</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08, ease: 'easeOut' }}
            className="mt-7 text-4xl sm:text-6xl lg:text-[68px] font-extrabold tracking-[-0.04em] leading-[1.05] text-slate-50"
          >
            Simulate &amp; Architect
            <br />
            <span
              className="bg-gradient-to-r from-sky-400 via-indigo-400 to-emerald-400 bg-clip-text text-transparent"
            >
              Network Systems
            </span>{' '}
            with Precision
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.16, ease: 'easeOut' }}
            className="mt-6 mx-auto max-w-2xl text-[15px] sm:text-base text-slate-400 leading-relaxed"
          >
            Desain topologi, konfigurasi 11 vendor network OS lewat CLI asli, dan
            uji konektivitas dengan simulasi paket sungguhan — semua berjalan
            langsung di browser. Dari MikroTik sampai Cisco, dari switch L2
            sampai routing BGP.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.24, ease: 'easeOut' }}
            className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3.5"
          >
            <button
              onClick={launch}
              className="group flex items-center gap-2 rounded-lg bg-white text-slate-900 text-sm font-semibold px-6 py-3 transition-all duration-200 hover:bg-slate-200 hover:scale-[1.03] active:scale-[0.98] shadow-[0_0_36px_-10px_rgba(255,255,255,0.5)]"
            >
              Launch Simulator
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </button>

            <a
              href={STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2 rounded-lg border border-[#1F2128] bg-[#0F1015]/60 backdrop-blur text-slate-200 text-sm font-medium px-6 py-3 transition-all duration-200 hover:border-sky-500/40 hover:bg-[#0F1015] hover:scale-[1.03] active:scale-[0.98]"
            >
              Book Custom Web / Order Services
              <ArrowUpRight className="w-4 h-4 text-slate-500 transition-all group-hover:text-sky-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>

            <a
              href="https://kazudev.my.id"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2 rounded-lg border border-[#1F2128] bg-[#0F1015]/60 backdrop-blur text-slate-400 text-sm font-medium px-5 py-3 transition-all duration-200 hover:border-indigo-500/40 hover:bg-[#0F1015] hover:text-slate-200 hover:scale-[1.03] active:scale-[0.98]"
            >
              <Globe className="w-4 h-4 text-slate-500 transition-all group-hover:text-indigo-400" />
              kazudev.my.id
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-600 transition-all group-hover:text-indigo-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.34 }}
            className="mt-5 text-[11px] font-mono text-slate-600"
          >
            Free · No install · Runs 100% in your browser · Topologi &amp; config auto-save
          </motion.p>
        </div>

        {/* ── App preview window ─────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 32, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.32, ease: 'easeOut' }}
          className="mx-auto mt-16 sm:mt-20 max-w-5xl"
        >
          <div className="relative rounded-2xl border border-[#1F2128] bg-[#0F1015]/70 backdrop-blur-xl shadow-[0_24px_80px_-24px_rgba(0,0,0,0.8)]">
            {/* window chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1F2128] rounded-t-2xl">
              <span className="w-2.5 h-2.5 rounded-full bg-[#3d3f45]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#3d3f45]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#3d3f45]" />
              <span className="ml-3 text-[11px] font-mono text-slate-500">
                NetLab — Enterprise Multi-Vendor Core Lab
              </span>
              <span className="ml-auto flex items-center gap-1.5 text-[10px] font-mono text-emerald-400">
                <span className="w-1 h-1 rounded-full bg-emerald-400" style={{ animation: 'netlab-blink 1.2s ease-in-out infinite' }} />
                SIMULATING
              </span>
            </div>

            <div className="grid md:grid-cols-[1fr_240px]">
              {/* topology canvas mock */}
              <div className="relative p-4 min-h-[300px] md:min-h-[320px] overflow-hidden">
                <div className="absolute inset-0" style={{
                  backgroundImage: 'linear-gradient(rgba(148,163,184,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.04) 1px, transparent 1px)',
                  backgroundSize: '28px 28px',
                }} />
                <svg viewBox="0 0 600 280" className="relative w-full h-full">
                  {PREVIEW_EDGES.map((e, i) => {
                    const a = PREVIEW_NODES[e.from];
                    const b = PREVIEW_NODES[e.to];
                    return (
                      <g key={i}>
                        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#2b2d33" strokeWidth="1.5" />
                        <line
                          x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                          stroke={a.color} strokeWidth="1.5" strokeOpacity="0.55"
                          strokeDasharray="5 5"
                          style={{ animation: 'netlab-packet 1.4s linear infinite', animationDelay: `${i * 0.35}s` }}
                        />
                      </g>
                    );
                  })}
                  {PREVIEW_NODES.map((n) => (
                    <g key={n.id}>
                      <circle cx={n.x} cy={n.y} r="20" fill="#0f172a" stroke={n.color} strokeWidth="1.5"
                        style={{ filter: `drop-shadow(0 0 8px ${n.color}44)`, animation: 'netlab-float 4s ease-in-out infinite' }} />
                      <circle cx={n.x} cy={n.y} r="20" fill="none" stroke={n.color} strokeWidth="1" strokeOpacity="0.4">
                        <animate attributeName="r" values="20;28;20" dur="2.6s" begin={`${n.id.charCodeAt(1) * 0.2}s`} repeatCount="indefinite" />
                        <animate attributeName="stroke-opacity" values="0.4;0;0.4" dur="2.6s" begin={`${n.id.charCodeAt(1) * 0.2}s`} repeatCount="indefinite" />
                      </circle>
                      <text x={n.x} y={n.y + 4} textAnchor="middle" fill={n.color} fontSize="10" fontFamily="monospace" fontWeight="700">
                        {n.label}
                      </text>
                    </g>
                  ))}
                </svg>

                {/* floating status chips */}
                <div className="absolute top-4 right-4 hidden sm:flex items-center gap-1.5 rounded-md border border-[#1F2128] bg-[#0B0C0E]/80 backdrop-blur px-2.5 py-1 text-[10px] font-mono text-slate-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> 3/3 links up
                </div>
                <div className="absolute bottom-4 left-4 hidden sm:flex items-center gap-1.5 rounded-md border border-[#1F2128] bg-[#0B0C0E]/80 backdrop-blur px-2.5 py-1 text-[10px] font-mono text-slate-400">
                  <Zap className="w-3 h-3 text-amber-400" /> TTL 62 · 2 hops
                </div>
              </div>

              {/* terminal mock */}
              <div className="hidden md:flex flex-col border-l border-[#1F2128] bg-[#0B0C0E]/60">
                <div className="px-3 py-2 border-b border-[#1F2128] text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                  MikroTik · node-1
                </div>
                <div className="flex-1 p-3 space-y-1.5 font-mono text-[10.5px] leading-relaxed overflow-hidden">
                  {TERMINAL_LINES.map((line, i) => (
                    <div
                      key={i}
                      className={`whitespace-pre-wrap transition-opacity duration-500 ${i > pingLine ? 'opacity-25' : 'opacity-100'}`}
                      style={{ color: line.color }}
                    >
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
        </motion.div>
      </section>

      {/* ── Stats strip ──────────────────────────────────────────────────── */}
      <section className="relative border-y border-[#14161c] bg-[#0F1015]/40 backdrop-blur">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-8 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { value: '11+', label: 'Network OS vendors' },
            { value: '100%', label: 'Runs in-browser' },
            { value: 'Real', label: 'Packet simulation engine' },
            { value: '0', label: 'Setup required' },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.45, delay: i * 0.06 }}
            >
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-100">{s.value}</div>
              <div className="mt-1 text-[11px] sm:text-xs text-slate-500">{s.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Features grid ────────────────────────────────────────────────── */}
      <section id="features" className="relative px-5 sm:px-8 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5 }}
            className="max-w-2xl"
          >
            <div className="text-[11px] font-mono uppercase tracking-[0.22em] text-sky-400/80 mb-3">
              // capabilities
            </div>
            <h2 className="text-3xl sm:text-[40px] font-bold tracking-[-0.03em] text-slate-50 leading-tight">
              Everything a network engineer needs.
            </h2>
            <p className="mt-4 text-sm sm:text-[15px] text-slate-400 leading-relaxed">
              NetLab menggabungkan canvas topologi visual dengan mesin simulasi
              jaringan sungguhan — seperti GNS3 di dalam browser, tanpa beban
              setup apa pun.
            </p>
          </motion.div>

          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.5, delay: (i % 3) * 0.08 }}
              >
                <GlassCard className="h-full p-6">
                  <div
                    className="flex items-center justify-center w-10 h-10 rounded-lg border border-[#1F2128] bg-[#0B0C0E] mb-4"
                    style={{ boxShadow: `0 0 24px -8px ${f.accent}44` }}
                  >
                    <f.icon className="w-5 h-5" style={{ color: f.accent }} />
                  </div>
                  <h3 className="text-[15px] font-semibold tracking-tight text-slate-100">
                    {f.title}
                  </h3>
                  <p className="mt-2 text-[13px] text-slate-400 leading-relaxed">
                    {f.desc}
                  </p>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Vendors strip ────────────────────────────────────────────────── */}
      <section id="vendors" className="relative px-5 sm:px-8 pb-20 sm:pb-28">
        <div className="mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5 }}
            className="text-center"
          >
            <div className="text-[11px] font-mono uppercase tracking-[0.22em] text-indigo-400/80 mb-3">
              // supported vendors
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-100">
              One simulator. Every major network OS.
            </h2>
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-2.5"
          >
            {VENDOR_CHIPS.map((v) => (
              <span
                key={v}
                className="rounded-lg border border-[#1F2128] bg-[#0F1015]/70 backdrop-blur px-3.5 py-1.5 text-[12px] font-medium text-slate-400 transition-all duration-200 hover:text-slate-200 hover:border-slate-500/50 hover:scale-[1.04]"
              >
                {v}
              </span>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Configuration Guide Book ─────────────────────────────────────── */}
      <section id="guide" className="relative px-5 sm:px-8 pb-20 sm:pb-28 scroll-mt-20">
        <div className="mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5 }}
            className="flex flex-col sm:flex-row sm:items-end justify-between gap-4"
          >
            <div className="max-w-2xl">
              <div className="text-[11px] font-mono uppercase tracking-[0.22em] text-emerald-400/80 mb-3">
                // panduan konfigurasi perangkat
              </div>
              <h2 className="text-3xl sm:text-[40px] font-bold tracking-[-0.03em] text-slate-50 leading-tight">
                Buku Panduan <span className="bg-gradient-to-r from-emerald-400 to-sky-400 bg-clip-text text-transparent">Konfigurasi</span>
              </h2>
              <p className="mt-4 text-sm sm:text-[15px] text-slate-400 leading-relaxed">
                Langkah demi langkah dan kamus perintah CLI untuk semua perangkat.
                Pilih vendor, pelajari, lalu <span className="text-slate-200">salin perintahnya</span> dan
                tempel langsung di terminal simulator.
              </p>
            </div>
            <div className="text-[11px] font-mono text-slate-600 shrink-0">
              {BEGINNER_GUIDES.length} vendor · semua bisa dicoba di simulator
            </div>
          </motion.div>

          {/* Vendor tabs */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.55, delay: 0.05 }}
            className="mt-9 flex flex-wrap gap-2"
          >
            {BEGINNER_GUIDES.map((g) => {
              const isActive = g.vendorId === guideVendorId;
              const accent = VENDOR_ACCENTS[g.vendorId] || '#38bdf8';
              return (
                <button
                  key={g.vendorId}
                  onClick={() => setGuideVendorId(g.vendorId)}
                  className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-[12px] font-semibold transition-all duration-200 ${
                    isActive
                      ? 'bg-[#0F1015] text-slate-100 shadow-[0_0_24px_-8px_rgba(56,189,248,0.35)]'
                      : 'border-[#1F2128] bg-[#0F1015]/50 text-slate-400 hover:text-slate-200 hover:border-slate-500/50'
                  }`}
                  style={isActive ? { borderColor: accent, boxShadow: `0 0 24px -8px ${accent}55` } : undefined}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: accent, boxShadow: isActive ? `0 0 8px ${accent}` : undefined }}
                  />
                  {g.label}
                </button>
              );
            })}
          </motion.div>

          {/* Guide content */}
          <motion.div
            key={guideVendorId}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mt-6 grid lg:grid-cols-2 gap-4 items-start"
          >
            {/* Steps */}
            <div className="rounded-2xl border border-[#1F2128] bg-[#0F1015]/70 backdrop-blur-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#1F2128] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <ListChecks className="w-4 h-4 shrink-0" style={{ color: guideAccent }} />
                  <span className="text-[13px] font-bold text-slate-100 truncate">
                    Panduan Langkah — {activeGuide.label}
                  </span>
                </div>
                <button
                  onClick={() => copyText(activeGuide.steps.map((s) => s.command).join('\n'), `all-${guideVendorId}`)}
                  className="flex items-center gap-1.5 rounded-md border border-[#1F2128] bg-[#0B0C0E] px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:text-slate-100 hover:border-sky-500/50 transition shrink-0"
                >
                  {copiedKey === `all-${guideVendorId}` ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  {copiedKey === `all-${guideVendorId}` ? 'Tersalin!' : 'Salin Semua'}
                </button>
              </div>
              <div className="p-3 text-[11px] text-slate-500 border-b border-[#1F2128] bg-[#0B0C0E]/40">
                {activeGuide.intro}
              </div>
              {activeGuide.capabilities.length > 0 && (
                <div className="px-5 py-2.5 border-b border-[#1F2128] bg-[#0B0C0E]/40 flex flex-wrap gap-1.5">
                  {activeGuide.capabilities.map((c) => (
                    <span
                      key={c}
                      className="rounded-md border border-[#1F2128] bg-[#0F1015] px-2 py-0.5 text-[10px] text-slate-400"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
              <div className="divide-y divide-[#1F2128]/60">
                {activeGuide.steps.map((step, i) => (
                  <div key={step.command} className="px-5 py-3 flex items-start gap-3 hover:bg-[#0B0C0E]/50 transition">
                    <span
                      className="mt-0.5 flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0"
                      style={{ color: guideAccent, border: `1px solid ${guideAccent}66`, background: `${guideAccent}14` }}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-semibold text-slate-200">{step.title}</div>
                      <div className="mt-1 font-mono text-[11.5px] text-emerald-300 break-all">{step.command}</div>
                      {step.explain && (
                        <div className="mt-1.5 text-[11.5px] text-slate-400 leading-relaxed border-l-2 pl-2.5" style={{ borderColor: `${guideAccent}55` }}>
                          💡 {step.explain}
                        </div>
                      )}
                      {step.note && <div className="mt-1 text-[10.5px] font-mono text-slate-600">{step.note}</div>}
                    </div>
                    <button
                      onClick={() => copyText(step.command, `step-${guideVendorId}-${i}`)}
                      className="p-1.5 rounded-md text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition shrink-0"
                      title="Salin perintah"
                    >
                      {copiedKey === `step-${guideVendorId}-${i}` ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Command dictionary */}
            <div className="rounded-2xl border border-[#1F2128] bg-[#0F1015]/70 backdrop-blur-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#1F2128] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <BookOpenText className="w-4 h-4 shrink-0" style={{ color: guideAccent }} />
                  <span className="text-[13px] font-bold text-slate-100 truncate">
                    Kamus Perintah CLI — {activeGuide.label}
                  </span>
                </div>
                {guideGroups.length > 0 && (
                  <button
                    onClick={() =>
                      copyText(
                        guideGroups.flatMap((grp) => grp.commands.map((c) => c.command)).join('\n'),
                        `dict-${guideVendorId}`
                      )
                    }
                    className="flex items-center gap-1.5 rounded-md border border-[#1F2128] bg-[#0B0C0E] px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:text-slate-100 hover:border-sky-500/50 transition shrink-0"
                  >
                    {copiedKey === `dict-${guideVendorId}` ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    {copiedKey === `dict-${guideVendorId}` ? 'Tersalin!' : 'Salin Semua'}
                  </button>
                )}
              </div>
              <div className="max-h-[520px] overflow-y-auto divide-y divide-[#1F2128]/60">
                {guideGroups.length === 0 && (
                  <div className="px-5 py-8 text-center text-[12px] text-slate-500">
                    Kamus perintah untuk {activeGuide.label} mengikuti langkah panduan di samping.
                  </div>
                )}
                {guideGroups.map((group) => (
                  <div key={group.root} className="px-5 py-3">
                    <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-slate-500 mb-2">
                      {group.root}
                    </div>
                    <div className="space-y-1">
                      {group.commands.map((c) => (
                        <div
                          key={c.command}
                          className="group flex items-start gap-2 rounded-lg px-2.5 py-1.5 hover:bg-[#0B0C0E]/60 transition"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-mono text-[11.5px] text-slate-200 break-all">{c.command}</div>
                            {c.description && (
                              <div className="text-[10.5px] text-slate-500">{c.description}</div>
                            )}
                          </div>
                          <button
                            onClick={() => copyText(c.command, `cmd-${guideVendorId}-${group.root}-${c.command}`)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition shrink-0"
                            title="Salin perintah"
                          >
                            {copiedKey === `cmd-${guideVendorId}-${group.root}-${c.command}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
          {/* Device models */}
          <motion.div
            key={`models-${guideVendorId}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="mt-4 rounded-2xl border border-[#1F2128] bg-[#0F1015]/70 backdrop-blur-xl overflow-hidden"
          >
            <div className="px-5 py-3.5 border-b border-[#1F2128] flex items-center gap-2.5">
              <Cpu className="w-4 h-4 shrink-0" style={{ color: guideAccent }} />
              <span className="text-[13px] font-bold text-slate-100">
                Model Perangkat {activeGuide.label}
              </span>
              <span className="ml-auto text-[10px] font-mono text-slate-600">
                pilih model saat menambah device di simulator
              </span>
            </div>
            <div className="p-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {getModelsForVendor(guideVendorId).map((m) => (
                <div key={m.id} className="rounded-lg border border-[#1F2128] bg-[#0B0C0E]/60 px-3.5 py-2.5 hover:border-slate-500/40 transition">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-bold text-slate-200 truncate">{m.label}</span>
                    <span className="text-[9px] font-mono uppercase text-slate-500 shrink-0">
                      {m.types.join(' · ')}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">{m.description}</p>
                  <p className="mt-1.5 text-[10px] font-mono text-slate-600 truncate">
                    {m.specs.cpu} · {m.specs.ram} · {m.specs.ports || m.specs.flash} · {getPortsForModel(guideVendorId, m.label).length} port
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Services promo banner ────────────────────────────────────────── */}
      <section id="services" className="relative px-5 sm:px-8 pb-24 sm:pb-32">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.55 }}
          className="mx-auto max-w-6xl rounded-2xl p-[1px] bg-gradient-to-r from-sky-500/40 via-indigo-500/30 to-emerald-500/40"
        >
          <div className="relative overflow-hidden rounded-2xl bg-[#0F1015]/90 backdrop-blur-xl px-6 sm:px-12 py-10 sm:py-14">
            {/* faint glow inside banner */}
            <div className="pointer-events-none absolute -top-24 -right-16 w-72 h-72 rounded-full"
              style={{ background: 'radial-gradient(ellipse, rgba(56,189,248,0.12) 0%, transparent 65%)' }} />
            <div className="pointer-events-none absolute -bottom-24 -left-16 w-72 h-72 rounded-full"
              style={{ background: 'radial-gradient(ellipse, rgba(52,211,153,0.08) 0%, transparent 65%)' }} />

            <div className="relative grid lg:grid-cols-[1fr_auto] items-center gap-8">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.22em] text-emerald-400/90 mb-3">
                  <Sparkles className="w-3.5 h-3.5" />
                  Custom Development
                </div>
                <h2 className="text-2xl sm:text-[34px] font-bold tracking-[-0.03em] text-slate-50 leading-tight">
                  Need a Custom Network System or Web App?
                </h2>
                <p className="mt-3 max-w-xl text-sm sm:text-[15px] text-slate-400 leading-relaxed">
                  Butuh website, dashboard monitoring jaringan, sistem informasi,
                  atau aplikasi web kustom? KazuDev siap membangun produkmu —
                  mulai dari desain hingga deployment.
                </p>
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-slate-500">
                  {['UI/UX & Landing Page', 'Web Application', 'Network Monitoring Tools', 'System Integration'].map((s) => (
                    <span key={s} className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-emerald-400/80" />
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-col items-start lg:items-end gap-3">
                <a
                  href={STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-2 rounded-lg bg-gradient-to-r from-sky-500 to-indigo-500 text-white text-sm font-semibold px-6 py-3 transition-all duration-200 hover:scale-[1.03] hover:shadow-[0_0_36px_-8px_rgba(56,189,248,0.55)] active:scale-[0.98]"
                >
                  Visit toko.kazudev.my.id
                  <ExternalLink className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </a>
                <span className="text-[11px] font-mono text-slate-600">
                  Opens in a new tab
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="relative border-t border-[#14161c]">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <LogoMark size={30} />
            <div className="flex flex-col leading-none">
              <span className="text-[13px] font-bold tracking-tight text-slate-200">NetLab</span>
              <span className="text-[10px] font-mono text-slate-600">Open-source network lab · by KazuDev</span>
            </div>
          </div>

          <div className="flex items-center gap-6 text-[12px] text-slate-500">
            <a href="#features" className="hover:text-slate-300 transition-colors">Features</a>
            <a href="#vendors" className="hover:text-slate-300 transition-colors">Vendors</a>
            <a href="#guide" className="hover:text-slate-300 transition-colors">Guide</a>
            <a href="#services" className="hover:text-slate-300 transition-colors">Services</a>
            <a href={STORE_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-slate-300 transition-colors">
              Store <ArrowUpRight className="w-3 h-3" />
            </a>
            <button
              onClick={onOpenDonate}
              className="flex items-center gap-1.5 text-rose-300 hover:text-rose-200 transition-colors font-medium"
              title="Donate untuk support developer"
            >
              <Heart className="w-3.5 h-3.5 text-rose-400" />
              Donate untuk Support Developer
            </button>
          </div>

          <div className="text-[11px] font-mono text-slate-600">
            © {new Date().getFullYear()} KazuDev — built with precision
          </div>
        </div>
      </footer>
    </div>
  );
};
