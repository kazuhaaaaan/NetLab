import React, { useRef, useState } from 'react';
import {
  Network,
  Plus,
  Download,
  Upload,
  FolderTree,
  Heart,
  Home,
  Share2,
  Image,
  FileImage,
  Undo2,
  Redo2,
  X,
  Sun,
  Moon,
  FileCode,
  HelpCircle,
  PackageCheck,
  Bot,
  MoreVertical,
  Wand2,
  BookOpen,
  FlaskConical,
  Play
} from 'lucide-react';
import { LabProject } from '../../types';

interface MobileHeaderProps {
  project: LabProject;
  onGoHome: () => void;
  onNewProject: () => void;
  onExportMlab: () => void;
  onImportMlab: (file: File) => void;
  onOpenMonorepo: () => void;
  onOpenTutorial: () => void;
  onOpenGrading: () => void;
  onOpenAiChat: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onLoadTemplate: (templateName: string) => void;
  onOpenDonate: () => void;
  onShare: () => void;
  onExportPng: () => void;
  onExportSvg: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenVendorCaps: () => void;
  onOpenConfigGen: () => void;
  onOpenConfigLib: () => void;
  onOpenPresetLabs: () => void;
  onOpenNetSim: () => void;
  onOpenAddDevice: () => void;
}

function MenuRow({
  icon,
  label,
  sub,
  onClick,
  disabled,
  danger,
}: {
  icon?: React.ReactNode;
  label: string;
  sub?: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition ${
        disabled
          ? 'text-slate-600 cursor-not-allowed'
          : danger
            ? 'text-rose-400 hover:bg-rose-500/10'
            : 'text-slate-200 hover:bg-slate-800'
      }`}
    >
      {icon}
      <span className="min-w-0 text-left">
        <span className="block truncate">{label}</span>
        {sub && <span className="block text-[10px] text-slate-500 truncate">{sub}</span>}
      </span>
    </button>
  );
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  project,
  onGoHome,
  onNewProject,
  onExportMlab,
  onImportMlab,
  onOpenMonorepo,
  onOpenTutorial,
  onOpenGrading,
  onOpenAiChat,
  onOpenVendorCaps,
  onOpenConfigGen,
  onOpenConfigLib,
  onOpenPresetLabs,
  onOpenNetSim,
  theme,
  onToggleTheme,
  onLoadTemplate,
  onOpenDonate,
  onShare,
  onExportPng,
  onExportSvg,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenAddDevice,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  const handleImportClick = () => fileInputRef.current?.click();

  return (
    <>
      <header className="flex items-center justify-between h-14 px-2.5 border-b border-[#26282E] bg-[#0F1015]/95 backdrop-blur-md z-40 shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setDrawerOpen(true)}
            className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-300 hover:bg-slate-800 active:scale-95 transition"
            title="Menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
            </svg>
          </button>
          <button onClick={onGoHome} className="flex items-center gap-1.5 ml-0.5" title="NetLab Home">
            <Network className="w-5 h-5 text-blue-400" />
            <span className="text-sm font-extrabold tracking-tight text-slate-100">
              Net<span className="text-blue-400">Lab</span>
            </span>
          </button>
        </div>

        <div className="flex items-center gap-0.5">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-800 disabled:opacity-30 transition"
            title="Undo"
          >
            <Undo2 className="w-5 h-5" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-800 disabled:opacity-30 transition"
            title="Redo"
          >
            <Redo2 className="w-5 h-5" />
          </button>
          <button
            onClick={onOpenAddDevice}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-500 active:scale-95 transition shadow-lg shadow-blue-900/40"
            title="Tambah Perangkat"
          >
            <Plus className="w-5 h-5" />
          </button>
          <div className="relative" ref={moreRef}>
            <button
              onClick={() => setMoreOpen((v) => !v)}
              className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-300 hover:bg-slate-800 active:scale-95 transition"
              title="Lainnya"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
            {moreOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
                <div className="absolute right-0 top-12 z-50 w-56 rounded-2xl bg-[#141519] border border-[#2B2D31] shadow-2xl p-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
                  <MenuRow icon={<Image className="w-4 h-4" />} label="Export PNG" onClick={() => { setMoreOpen(false); onExportPng(); }} />
                  <MenuRow icon={<FileImage className="w-4 h-4" />} label="Export SVG" onClick={() => { setMoreOpen(false); onExportSvg(); }} />
                  <MenuRow icon={<Download className="w-4 h-4" />} label="Download .mlab" onClick={() => { setMoreOpen(false); onExportMlab(); }} />
                  <MenuRow icon={<Upload className="w-4 h-4" />} label="Import .mlab" onClick={() => { setMoreOpen(false); handleImportClick(); }} />
                  <div className="my-1 h-px bg-[#26282E]" />
                  <MenuRow icon={<Share2 className="w-4 h-4" />} label="Bagikan Topologi" onClick={() => { setMoreOpen(false); onShare(); }} />
                  <MenuRow icon={<FolderTree className="w-4 h-4" />} label="Monorepo Explorer" onClick={() => { setMoreOpen(false); onOpenMonorepo(); }} />
                  <div className="my-1 h-px bg-[#26282E]" />
                  <MenuRow icon={<Wand2 className="w-4 h-4" />} label="Config Generator" sub="Buat konfigurasi otomatis" onClick={() => { setMoreOpen(false); onOpenConfigGen(); }} />
                  <MenuRow icon={<BookOpen className="w-4 h-4" />} label="Config Library" sub="Snippet siap salin" onClick={() => { setMoreOpen(false); onOpenConfigLib(); }} />
                  <MenuRow icon={<FlaskConical className="w-4 h-4" />} label="Preset Labs" sub="Topologi siap pakai" onClick={() => { setMoreOpen(false); onOpenPresetLabs(); }} />
                  <MenuRow icon={<Play className="w-4 h-4" />} label="Network Simulation" sub="Uji jalur & latensi" onClick={() => { setMoreOpen(false); onOpenNetSim(); }} />
                  <div className="my-1 h-px bg-[#26282E]" />
                  <MenuRow
                    label={theme === 'dark' ? 'Tema Terang' : 'Tema Gelap'}
                    onClick={() => { setMoreOpen(false); onToggleTheme(); }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Drawer menu (☰) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[80]">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-[300px] bg-[#0F1015] border-r border-[#26282E] shadow-2xl flex flex-col animate-in slide-in-from-left-4 duration-200 pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center justify-between px-4 h-14 border-b border-[#26282E]">
              <div className="flex items-center gap-2">
                <Network className="w-5 h-5 text-blue-400" />
                <span className="text-sm font-extrabold text-slate-100">NetLab</span>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              <div>
                <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Proyek</p>
                <div className="px-2 py-1.5 rounded-xl bg-slate-900/60 border border-[#26282E] mb-1.5">
                  <p className="text-xs font-semibold text-slate-100 truncate">{project.metadata.name}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {project.nodes.length} perangkat • {project.edges.length} kabel
                  </p>
                </div>
                <MenuRow icon={<Plus className="w-4 h-4" />} label="Topologi Baru" sub="Mulai dari kosong" onClick={() => { setDrawerOpen(false); onNewProject(); }} />
                <MenuRow icon={<FileCode className="w-4 h-4" />} label="Template Basic" sub="Lab sederhana" onClick={() => { setDrawerOpen(false); onLoadTemplate('basic'); }} />
                <MenuRow icon={<FileCode className="w-4 h-4" />} label="Template Enterprise" sub="Topologi perusahaan" onClick={() => { setDrawerOpen(false); onLoadTemplate('enterprise'); }} />
              </div>

              <div>
                <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Bantuan</p>
                <MenuRow icon={<HelpCircle className="w-4 h-4" />} label="Tutorial" onClick={() => { setDrawerOpen(false); onOpenTutorial(); }} />
                <MenuRow icon={<Bot className="w-4 h-4" />} label="AI Mentor" onClick={() => { setDrawerOpen(false); onOpenAiChat(); }} />
                <MenuRow icon={<PackageCheck className="w-4 h-4" />} label="Auto-Grading" onClick={() => { setDrawerOpen(false); onOpenGrading(); }} />
                <MenuRow icon={<Wand2 className="w-4 h-4" />} label="Config Generator" onClick={() => { setDrawerOpen(false); onOpenConfigGen(); }} />
                <MenuRow icon={<BookOpen className="w-4 h-4" />} label="Config Library" onClick={() => { setDrawerOpen(false); onOpenConfigLib(); }} />
                <MenuRow icon={<FlaskConical className="w-4 h-4" />} label="Preset Labs" onClick={() => { setDrawerOpen(false); onOpenPresetLabs(); }} />
                <MenuRow icon={<Play className="w-4 h-4" />} label="Network Simulation" onClick={() => { setDrawerOpen(false); onOpenNetSim(); }} />
                <MenuRow icon={<Home className="w-4 h-4" />} label="Beranda" onClick={() => { setDrawerOpen(false); onGoHome(); }} />
              </div>

              <div>
                <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Dukungan</p>
                <MenuRow icon={<Heart className="w-4 h-4" />} label="Donasi" sub="Dukung pengembangan NetLab" onClick={() => { setDrawerOpen(false); onOpenDonate(); }} />
              </div>
            </div>

            <div className="px-4 py-3 border-t border-[#26282E]">
              <p className="text-[10px] text-center text-slate-600">NetLab v{project.version} • KazuDev</p>
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".mlab,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImportMlab(file);
          e.target.value = '';
        }}
      />
    </>
  );
};