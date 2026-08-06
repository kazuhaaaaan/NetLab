import React, { useState } from 'react';
import {
  HelpCircle,
  MousePointer,
  Touchpad,
  Smartphone,
  Monitor,
  X,
  CheckCircle2,
  Network,
  ChevronLeft,
  ChevronRight,
  MousePointerClick,
  Cable,
  TerminalSquare,
  FolderTree,
  Zap,
  Rocket
} from 'lucide-react';
import { StorageEngine } from '../storage/db';

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface GuideStep {
  icon: React.ReactNode;
  title: string;
  desc: string;
  points: { label: string; text: string }[];
}

const GUIDE_STEPS: GuideStep[] = [
  {
    icon: <Rocket className="w-5 h-5" />,
    title: 'Selamat Datang di MikroAi',
    desc: 'Simulator jaringan enterprise yang berjalan sepenuhnya di browser â€” tanpa install, tanpa server. Semua yang kamu kerjakan tersimpan otomatis.',
    points: [
      { label: 'Simpan Otomatis', text: 'Topologi, konfigurasi CLI, dan log terminal tetap tersimpan saat halaman di-reload.' },
      { label: 'Anti Hilang', text: 'Undo/Redo (Ctrl+Z / Ctrl+Y) untuk membatalkan atau mengulang perubahan.' },
      { label: 'Gratis & Terbuka', text: 'Cukup buka browser, pilih perangkat, dan mulai membangun lab jaringanmu.' },
    ],
  },
  {
    icon: <MousePointerClick className="w-5 h-5" />,
    title: '1. Menambahkan Perangkat',
    desc: 'Semua perangkat tersedia di panel kiri (Sidebar) dikelompokkan per vendor: MikroTik, Cisco, Juniper, Huawei, Fortinet, Ubiquiti, dan lainnya.',
    points: [
      { label: 'Pilih Vendor', text: 'Klik vendor di sidebar untuk melihat daftar model perangkatnya.' },
      { label: 'Tambah ke Canvas', text: 'Klik nama model â€” perangkat langsung muncul di kanvas.' },
      { label: 'Atur Posisi', text: 'Seret perangkat untuk menata posisinya di kanvas.' },
      { label: 'Klik = Pilih', text: 'Klik perangkat untuk memilihnya, klik kanan untuk menu hapus.' },
    ],
  },
  {
    icon: <Cable className="w-5 h-5" />,
    title: '2. Menyambungkan Kabel',
    desc: 'Sambungkan perangkat ala Cisco Packet Tracer: pilih tipe kabel terlebih dahulu, baru pilih port. Kabel yang tidak cocok tidak akan bisa masuk.',
    points: [
      { label: 'Mulai Wizard', text: 'Klik tombol kabel di toolbar, atau tombol "+" pada perangkat.' },
      { label: 'Pilih Tipe Kabel', text: 'Wajib pilih Copper Straight, Crossover, Fiber, atau Serial sebelum memilih port.' },
      { label: 'Sumber â†’ Tujuan', text: 'Klik perangkat sumber â†’ pilih port â†’ klik perangkat tujuan â†’ pilih port.' },
      { label: 'Port Tidak Cocok', text: 'Port yang tidak sesuai tipe kabel otomatis dinonaktifkan (contoh: kabel fiber tidak masuk ke port copper).' },
      { label: 'Info Kabel', text: 'Arahkan kursor ke kabel untuk melihat perangkat & port yang terhubung.' },
    ],
  },
  {
    icon: <TerminalSquare className="w-5 h-5" />,
    title: '3. Konfigurasi CLI',
    desc: 'Setiap perangkat punya terminal CLI asli vendor: MikroTik (RouterOS), Cisco (IOS), Juniper, Huawei, Fortinet, OpenWrt, Linux, dan lainnya.',
    points: [
      { label: 'Buka Terminal', text: 'Double-click perangkat untuk membuka terminal CLI-nya.' },
      { label: 'Contoh MikroTik', text: 'Ketik /ip address print untuk lihat IP, lalu /ip address add address=192.168.1.1/24 interface=ether1.' },
      { label: 'Contoh Cisco', text: 'Ketik configure terminal, lalu interface GigabitEthernet0/0 dan ip address 192.168.1.1 255.255.255.0.' },
      { label: 'Konfigurasi Tersimpan', text: 'IP dan rute yang kamu set ikut tersimpan saat reload dan dipakai simulasi ping.' },
    ],
  },
  {
    icon: <FolderTree className="w-5 h-5" />,
    title: '4. Template & Simulasi',
    desc: 'Lanjutkan dengan template siap pakai atau uji konektivitas antar perangkat dengan simulasi ping.',
    points: [
      { label: 'Template Cepat', text: 'Dropdown Templates: "Mudah" (router + switch + PC) atau "ISP / Data Center Lab" (16 perangkat).' },
      { label: 'Simulasi Ping', text: 'Gunakan panel Ping: pilih sumber â†’ pilih tujuan â†’ lihat hasilnya (TTL & hop).' },
      { label: 'Zoom & Pan', text: 'Scroll / pinch touchpad untuk zoom, seret area kosong (atau dua jari) untuk pan.' },
      { label: 'Export/Import', text: 'Simpan topologi ke file .mlab atau buka kembali proyek dari file.' },
    ],
  },
];

export const TutorialModal: React.FC<TutorialModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'guide' | 'desktop' | 'mobile'>('guide');
  const [stepIndex, setStepIndex] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  if (!isOpen) return null;

  const handleClose = () => {
    if (dontShowAgain) {
      StorageEngine.setTutorialSeen(true);
    }
    onClose();
  };

  const step = GUIDE_STEPS[stepIndex];
  const isLastStep = stepIndex === GUIDE_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl text-slate-100 space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
              <Network className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Panduan MikroAi</h2>
              <p className="text-xs text-slate-400">Cara memakai simulator jaringan di browser</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-1 text-slate-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-slate-950 border border-slate-800 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('guide')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center space-x-2 transition ${
              activeTab === 'guide'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            <span>Panduan Langkah</span>
          </button>
          <button
            onClick={() => setActiveTab('desktop')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center space-x-2 transition ${
              activeTab === 'desktop'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Monitor className="w-4 h-4" />
            <span>Mouse & Keyboard</span>
          </button>
          <button
            onClick={() => setActiveTab('mobile')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center space-x-2 transition ${
              activeTab === 'mobile'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>Sentuhan</span>
          </button>
        </div>

        {/* Guide Steps */}
        {activeTab === 'guide' && (
          <div className="space-y-4">
            {/* Progress dots */}
            <div className="flex items-center justify-center space-x-2">
              {GUIDE_STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStepIndex(i)}
                  className={`h-2 rounded-full transition-all ${
                    i === stepIndex ? 'w-6 bg-blue-500' : 'w-2 bg-slate-700 hover:bg-slate-600'
                  }`}
                  title={`Langkah ${i + 1}`}
                />
              ))}
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30 flex-shrink-0">
                  {step.icon}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-100">{step.title}</h3>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{step.desc}</p>
                </div>
              </div>
              <div className="space-y-2">
                {step.points.map((pt, i) => (
                  <div key={i} className="flex items-start space-x-2.5 text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="font-semibold text-slate-200">{pt.label}: </span>
                      <span className="text-slate-400">{pt.text}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Step navigation */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setStepIndex((s) => Math.max(0, s - 1))}
                disabled={stepIndex === 0}
                className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition ${
                  stepIndex === 0
                    ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                }`}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Kembali</span>
              </button>
              <span className="text-[11px] text-slate-500 font-mono">
                {stepIndex + 1} / {GUIDE_STEPS.length}
              </span>
              <button
                onClick={() =>
                  isLastStep ? handleClose() : setStepIndex((s) => Math.min(GUIDE_STEPS.length - 1, s + 1))
                }
                className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition ${
                  isLastStep
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                }`}
              >
                <span>{isLastStep ? 'Mulai Simulasi' : 'Lanjut'}</span>
                {isLastStep ? <Zap className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        )}

        {/* Desktop Controls */}
        {activeTab === 'desktop' && (
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
              <div className="font-bold text-blue-400 flex items-center space-x-1.5">
                <MousePointer className="w-3.5 h-3.5" />
                <span>Left Click</span>
              </div>
              <p className="text-slate-400 text-[11px]">Pilih perangkat/port di kanvas.</p>
            </div>
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
              <div className="font-bold text-emerald-400 flex items-center space-x-1.5">
                <MousePointer className="w-3.5 h-3.5" />
                <span>Double Click</span>
              </div>
              <p className="text-slate-400 text-[11px]">Buka terminal CLI vendor perangkat.</p>
            </div>
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
              <div className="font-bold text-amber-400 flex items-center space-x-1.5">
                <MousePointer className="w-3.5 h-3.5" />
                <span>Scroll / Pinch</span>
              </div>
              <p className="text-slate-400 text-[11px]">Zoom kanvas: cubit keluar = zoom in, cubit masuk = zoom out.</p>
            </div>
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
              <div className="font-bold text-purple-400 flex items-center space-x-1.5">
                <MousePointer className="w-3.5 h-3.5" />
                <span>Middle Drag / Pan</span>
              </div>
              <p className="text-slate-400 text-[11px]">Geser kanvas tak terbatas.</p>
            </div>
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
              <div className="font-bold text-cyan-400 flex items-center space-x-1.5">
                <MousePointer className="w-3.5 h-3.5" />
                <span>Seret Perangkat</span>
              </div>
              <p className="text-slate-400 text-[11px]">Tahan kiri pada perangkat untuk memindahkannya.</p>
            </div>
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
              <div className="font-bold text-rose-400 flex items-center space-x-1.5">
                <MousePointer className="w-3.5 h-3.5" />
                <span>Shift + Drag Kosong</span>
              </div>
              <p className="text-slate-400 text-[11px]">Kotak seleksi banyak perangkat sekaligus.</p>
            </div>
          </div>
        )}

        {/* Mobile Gestures */}
        {activeTab === 'mobile' && (
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
              <div className="font-bold text-blue-400 flex items-center space-x-1.5">
                <Touchpad className="w-3.5 h-3.5" />
                <span>Single Tap</span>
              </div>
              <p className="text-slate-400 text-[11px]">Pilih perangkat, atau tap port untuk menyambung kabel.</p>
            </div>
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
              <div className="font-bold text-emerald-400 flex items-center space-x-1.5">
                <Touchpad className="w-3.5 h-3.5" />
                <span>Double Tap</span>
              </div>
              <p className="text-slate-400 text-[11px]">Buka terminal CLI perangkat.</p>
            </div>
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
              <div className="font-bold text-cyan-400 flex items-center space-x-1.5">
                <Touchpad className="w-3.5 h-3.5" />
                <span>Pinch Gesture</span>
              </div>
              <p className="text-slate-400 text-[11px]">Cubit dua jari untuk zoom kanvas.</p>
            </div>
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
              <div className="font-bold text-amber-400 flex items-center space-x-1.5">
                <Touchpad className="w-3.5 h-3.5" />
                <span>Two Finger Drag</span>
              </div>
              <p className="text-slate-400 text-[11px]">Geser kanvas dengan dua jari.</p>
            </div>
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
              <div className="font-bold text-purple-400 flex items-center space-x-1.5">
                <Touchpad className="w-3.5 h-3.5" />
                <span>Tahan Lama</span>
              </div>
              <p className="text-slate-400 text-[11px]">Long press perangkat untuk menu cepat.</p>
            </div>
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
              <div className="font-bold text-rose-400 flex items-center space-x-1.5">
                <Touchpad className="w-3.5 h-3.5" />
                <span>Kabel</span>
              </div>
              <p className="text-slate-400 text-[11px]">Wizard kabel berjalan dengan tap perangkat, tanpa drag.</p>
            </div>
          </div>
        )}

        {/* Footer & LocalStorage checkbox */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between flex-wrap gap-2">
          <label className="flex items-center space-x-2 text-xs text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="rounded bg-slate-950 border-slate-700 text-blue-600 focus:ring-0"
            />
            <span>Jangan tampilkan lagi saat membuka</span>
          </label>

          <button
            onClick={handleClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs transition flex items-center space-x-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Mulai Simulasi</span>
          </button>
        </div>
      </div>
    </div>
  );
};
