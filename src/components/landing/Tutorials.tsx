import React, { useState } from 'react';
import {
  Rocket,
  Network,
  Router,
  Layers,
  Server,
  Map,
  Route,
  Share2,
  ArrowLeftRight,
  Wrench,
  Bot,
  Play,
  ChevronRight,
  BookOpen,
  ListChecks,
  Gauge,
} from 'lucide-react';
import { Reveal, SectionHeading } from './shared';
import { TUTORIAL_LABS } from '../../data/tutorialLabs';

interface TutorialDef {
  id: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  steps: string[];
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  est: string;
  /** id lab starter di tutorialLabs.ts — null = tanpa starter lab. */
  labId?: string;
}

const TUTORIALS: TutorialDef[] = [
  {
    id: 'getting-started',
    icon: <Rocket className="w-5 h-5" />,
    title: 'Getting Started',
    desc: 'Apa itu NetLab, perangkat apa saja yang tersedia, cara membuat lab, menyimpan proyek.',
    level: 'Beginner',
    est: '5 min',
    steps: [
      'Kenali perangkat: router, switch, firewall, PC, server dari 11 vendor',
      'Buat lab kosong lalu tambahkan perangkat dari sidebar',
      'Sambungkan perangkat dengan kabel (wizard tipe kabel)',
      'Buka terminal: double-click perangkat',
      'Simpan proyek: Export (.mlab) — semua tersimpan otomatis di browser',
    ],
  },
  {
    id: 'first-network',
    icon: <Network className="w-5 h-5" />,
    title: 'Build Your First Network',
    desc: 'PC1 → Switch → Router → PC2. Dari kanvas kosong sampai ping sukses.',
    level: 'Beginner',
    est: '10 min',
    labId: 'tut-first-network',
    steps: [
      'Tambahkan 2 PC, 1 switch, 1 router; sambungkan kabelnya',
      'Atur IP: PC1=10.0.1.10/24, PC2=10.0.2.10/24, router di dua subnet',
      'Pasang gateway di kedua PC (default route)',
      'Ping PC2 dari PC1 lewat panel Ping',
      'Baca hasil: TTL, hop, dan jalur paket di kanvas',
    ],
  },
  {
    id: 'configure-router',
    icon: <Router className="w-5 h-5" />,
    title: 'Configure a Router',
    desc: 'Konfigurasi interface, IP, status interface, dan routing table per vendor.',
    level: 'Beginner',
    est: '8 min',
    steps: [
      'MikroTik: /ip address add address=10.0.1.1/24 interface=ether1',
      'Cisco: interface Gi0/0/0 → ip address 10.0.1.1 255.255.255.0 → no shutdown',
      'Periksa: /ip address print atau show ip interface brief',
      'Interface down: /interface disable ether1 (atau shutdown)',
      'Lihat routing table: /ip route print / show ip route',
    ],
  },
  {
    id: 'vlan',
    icon: <Layers className="w-5 h-5" />,
    title: 'VLAN & Trunking',
    desc: 'VLAN 10 & 20, access port, trunk, dan router-on-a-stick untuk inter-VLAN.',
    level: 'Intermediate',
    est: '15 min',
    labId: 'tut-vlan',
    steps: [
      'Buat VLAN 10 dan 20 di switch (vlan 10 / name v10)',
      'Jadikan port ke PC sebagai access port masing-masing VLAN',
      'Port ke router jadi trunk (switchport mode trunk / allowed vlan)',
      'Router: subinterface Gi0/0/0.10 encapsulation dot1q 10',
      'Verifikasi: PC VLAN 10 bisa ping PC VLAN 20 lewat router',
    ],
  },
  {
    id: 'dhcp',
    icon: <Server className="w-5 h-5" />,
    title: 'DHCP Server',
    desc: 'DISCOVER → OFFER → REQUEST → ACK. Router jadi server, PC klien.',
    level: 'Intermediate',
    est: '10 min',
    labId: 'tut-dhcp',
    steps: [
      'Set IP router + buat pool (MikroTik: /ip pool add, /ip dhcp-server add)',
      'Klien: linux — ketik dhclient ether1 di terminal',
      'Lihat lease: /ip dhcp-server lease print (atau show ip dhcp binding)',
      'Verifikasi: PC klien otomatis dapat IP + gateway dari pool',
      'Uji: ping gateway dari PC tanpa set IP manual',
    ],
  },
  {
    id: 'static-routing',
    icon: <Map className="w-5 h-5" />,
    title: 'Static Routing',
    desc: 'Connected route, static route, default route, dan next-hop.',
    level: 'Intermediate',
    est: '12 min',
    labId: 'tut-static-routing',
    steps: [
      'Dua LAN dihubungkan dua router lewat link /30',
      'Cisco: ip route 10.0.2.0 255.255.255.0 10.0.1.2',
      'Juniper: set routing-options static route 10.0.2.0/24 next-hop 10.0.1.2',
      'Rute default untuk PC: 0.0.0.0/0 → gateway',
      'Cek rute aktif: show ip route / show route — rute harus di tabel',
    ],
  },
  {
    id: 'ospf',
    icon: <Route className="w-5 h-5" />,
    title: 'OSPF Multi-Vendor',
    desc: 'Router ID, area, adjacency, LSDB, SPF, dan cost.',
    level: 'Advanced',
    est: '15 min',
    labId: 'tut-ospf',
    steps: [
      'Set Router ID di tiap router (mis. 1.1.1.1)',
      'Aktifkan OSPF area 0 di semua link (perintah sesuai vendor)',
      'Periksa adjacency: show ip ospf neighbor — harus Full',
      'Lihat rute yang dipelajari OSPF di routing table',
      'Ubah cost untuk mengubah pilihan jalur SPF',
    ],
  },
  {
    id: 'bgp',
    icon: <Share2 className="w-5 h-5" />,
    title: 'BGP (eBGP)',
    desc: 'AS, eBGP/iBGP, neighbor, prefix advertisement, route selection.',
    level: 'Advanced',
    est: '15 min',
    labId: 'tut-bgp',
    steps: [
      'Tentukan AS: 65001 dan 65002 (router bgp 65001)',
      'Aktifkan neighbor dengan remote-as yang benar',
      'Advertise prefix jaringanmu (network ... )',
      'Cek state: show ip bgp summary — harus Established',
      'Verifikasi prefix di tabel BGP kedua AS',
    ],
  },
  {
    id: 'nat',
    icon: <ArrowLeftRight className="w-5 h-5" />,
    title: 'NAT & Masquerade',
    desc: 'IP privat → IP publik, source NAT, masquerade, dan translation table.',
    level: 'Intermediate',
    est: '10 min',
    labId: 'tut-nat',
    steps: [
      'LAN privat (192.168.1.0/24) lewat router NAT ke WAN',
      'MikroTik: /ip firewall nat add chain=srcnat out-interface=ether2 action=masquerade',
      'Cisco: ip nat inside / ip nat outside + access-list + ip nat inside source list',
      'Uji: PC LAN ping IP WAN — paket harus lewat',
      'Lihat translation: /ip firewall nat print atau show ip nat translations',
    ],
  },
  {
    id: 'troubleshooting',
    icon: <Wrench className="w-5 h-5" />,
    title: 'Troubleshooting',
    desc: 'Metode Layer 1→7: kabel, IP, gateway, VLAN, ARP, rute, NAT, ACL.',
    level: 'Intermediate',
    est: '10 min',
    steps: [
      'Layer 1: kabel terpasang? interface up? (show interfaces / /interface print)',
      'Layer 2: VLAN cocok? trunk/allowed vlan benar?',
      'Layer 3: IP & subnet konsisten di kedua sisi? gateway benar?',
      'ARP: host bisa resolve gateway? (show arp / /ip arp print)',
      'Routing: ada rute ke subnet tujuan? lalu NAT/ACL memblokir?',
      'Pakai /ai diagnose di terminal untuk analisis otomatis',
    ],
  },
  {
    id: 'ai-mentor',
    icon: <Bot className="w-5 h-5" />,
    title: 'AI Mentor',
    desc: 'Tanya mengapa jaringan gagal, minta penjelasan rute, dapat perintah perbaikan.',
    level: 'Beginner',
    est: '5 min',
    steps: [
      'Buka panel AI Mentor (ikon bot di toolbar)',
      'Tanya kontekstual: "Kenapa PC1 tidak bisa ping PC2?"',
      'AI membaca state engine sungguhan — bukan tebakan',
      'Coba /ai diagnose di terminal untuk laporan terstruktur',
      'Selalu verifikasi jawaban AI lewat show/print command nyata',
    ],
  },
];

const LEVEL_STYLE: Record<TutorialDef['level'], string> = {
  Beginner: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  Intermediate: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  Advanced: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};

interface TutorialsProps {
  /** Buka simulator; bila labId diberikan, starter lab tutorial dimuat. */
  onLaunch: (labId?: string) => void;
}

export function Tutorials({ onLaunch }: TutorialsProps) {
  const [active, setActive] = useState<string | null>('getting-started');

  const open = TUTORIALS.find((t) => t.id === active) ?? TUTORIALS[0];

  const tryIt = (t: TutorialDef) => {
    onLaunch(t.labId);
  };

  return (
    <section id="tutorials" className="relative scroll-mt-20 py-20 sm:py-28 border-t border-[#14161c]">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="tutorial & getting started"
            title={
              <span className="flex items-center gap-3 flex-wrap">
                Belajar NetLab dari nol sampai lanjutan.
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-300 text-[11px] font-semibold normal-case tracking-normal">
                  <BookOpen className="w-3.5 h-3.5" />
                  {TUTORIALS.length} tutorial
                </span>
              </span>
            }
            description="Pilih tutorial, ikuti langkahnya, lalu langsung coba di lab nyata — starter lab siap dimuat dengan sekali klik."
          />
        </Reveal>

        <div className="mt-12 grid w-full min-w-0 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-6 items-start">
          {/* Daftar tutorial (kiri) */}
          <Reveal className="min-w-0">
            <div className="flex flex-col gap-1 rounded-2xl border border-[#1c1f27] bg-[#0F1015]/80 p-2">
              {TUTORIALS.map((t) => {
                const isActive = t.id === active;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActive(t.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition ${
                      isActive ? 'bg-sky-500/10 border border-sky-500/30' : 'border border-transparent hover:bg-slate-800/50'
                    }`}
                  >
                    <span
                      className={`flex-shrink-0 p-1.5 rounded-lg border ${
                        isActive ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {t.icon}
                    </span>
                    <span className="min-w-0">
                      <span className={`block truncate text-[13px] font-semibold ${isActive ? 'text-slate-100' : 'text-slate-300'}`}>
                        {t.title}
                      </span>
                      <span className="block text-[10px] text-slate-500 truncate">{t.desc}</span>
                    </span>
                    <ChevronRight className={`ml-auto w-4 h-4 flex-shrink-0 ${isActive ? 'text-sky-400' : 'text-slate-700'}`} />
                  </button>
                );
              })}
            </div>
          </Reveal>

          {/* Detail tutorial (kanan) */}
          <Reveal delay={80} className="min-w-0">
            <div className="rounded-2xl border border-[#1c1f27] bg-[#0F1015]/80 p-5 sm:p-7">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-2.5 py-1 rounded-full border text-[10px] font-bold ${LEVEL_STYLE[open.level]}`}>{open.level}</span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-slate-700 bg-slate-800/60 text-[10px] font-semibold text-slate-400">
                  <Gauge className="w-3 h-3" />
                  {open.est}
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-slate-700 bg-slate-800/60 text-[10px] font-semibold text-slate-400">
                  <ListChecks className="w-3 h-3" />
                  {open.steps.length} langkah
                </span>
              </div>

              <div className="mt-4 flex items-start gap-3.5">
                <div className="p-2.5 bg-sky-500/15 text-sky-300 rounded-xl border border-sky-500/30 flex-shrink-0">{open.icon}</div>
                <div>
                  <h3 className="text-lg font-bold tracking-tight text-slate-100">{open.title}</h3>
                  <p className="mt-1 text-[13px] text-slate-400 leading-relaxed">{open.desc}</p>
                </div>
              </div>

              <ol className="mt-6 space-y-0">
                {open.steps.map((s, i) => (
                  <li key={i} className="flex items-start gap-3 py-2.5 border-b border-[#1c1f27] last:border-0">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-800 border border-slate-700 text-[11px] font-bold text-sky-400 flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="text-[13px] text-slate-300 leading-relaxed pt-0.5">{s}</span>
                  </li>
                ))}
              </ol>

              {open.labId && (
                <button
                  onClick={() => tryIt(open)}
                  className="mt-6 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[13px] font-bold shadow-lg shadow-emerald-900/40 transition active:scale-95"
                >
                  <Play className="w-4 h-4" />
                  Try It Yourself — muat starter lab
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
              {!open.labId && (
                <p className="mt-6 text-[11px] text-slate-500">
                  Tutorial ini bisa langsung dipraktikkan di simulator — buat lab baru dari kanvas.
                </p>
              )}
            </div>
          </Reveal>
        </div>

        {/* Panduan singkat langkah umum */}
        <Reveal delay={120}>
          <div className="mt-10 grid w-full min-w-0 grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: <Rocket className="w-4 h-4" />, t: 'Tambah Perangkat', d: 'Pilih model dari sidebar sesuai vendor.' },
              { icon: <Network className="w-4 h-4" />, t: 'Sambungkan', d: 'Wizard kabel: pilih tipe lalu pilih port.' },
              { icon: <Router className="w-4 h-4" />, t: 'Konfigurasi', d: 'Terminal CLI vendor asli di tiap perangkat.' },
              { icon: <Bot className="w-4 h-4" />, t: 'Butuh Bantuan?', d: 'AI Mentor menganalisis state lab sungguhan.' },
            ].map((c) => (
              <div key={c.t} className="rounded-xl border border-[#1c1f27] bg-[#0F1015]/60 px-4 py-3.5">
                <div className="flex items-center gap-2 text-sky-300">{c.icon}<span className="text-[12px] font-bold text-slate-200">{c.t}</span></div>
                <p className="mt-1.5 text-[11px] text-slate-500 leading-relaxed">{c.d}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
