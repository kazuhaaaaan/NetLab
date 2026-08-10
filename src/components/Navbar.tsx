import React, { useRef, useState } from 'react';
import {
  Network,
  Download,
  Upload,
  FileCode,
  HelpCircle,
  Sun,
  Moon,
  Plus,
  PackageCheck,
  FolderTree,
  Heart,
  Undo2,
  Redo2,
  Home,
  Share2,
  Image,
  FileImage,
  ClipboardCheck,
  Menu,
  X,
  ChevronDown,
  Bot
} from 'lucide-react';
import { LabProject } from '../types';

interface NavbarProps {
  project: LabProject;
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
  onGoHome: () => void;
  onShare: () => void;
  onExportPng: () => void;
  onExportSvg: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

function MobileItem({
  icon,
  label,
  sub,
  onClick,
  href,
  disabled,
}: {
  icon?: React.ReactNode;
  label: string;
  sub?: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
}) {
  const cls = `w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition ${
    disabled
      ? 'text-slate-600 cursor-not-allowed'
      : 'text-slate-200 hover:bg-slate-800'
  }`;
  const inner = (
    <>
      {icon}
      <span className="min-w-0">
        <span className="block truncate">{label}</span>
        {sub && <span className="block text-[10px] text-slate-500 truncate">{sub}</span>}
      </span>
    </>
  );
  if (href) {
    return (
      <a href={href} download className={cls} onClick={onClick}>
        {inner}
      </a>
    );
  }
  return (
    <button className={cls} onClick={onClick} disabled={disabled}>
      {inner}
    </button>
  );
}

export const Navbar: React.FC<NavbarProps> = ({
  project,
  onNewProject,
  onExportMlab,
  onImportMlab,
  onOpenMonorepo,
  onOpenTutorial,
  onOpenGrading,
  onOpenAiChat,
  theme,
  onToggleTheme,
  onLoadTemplate,
  onOpenDonate,
  onGoHome,
  onShare,
  onExportPng,
  onExportSvg,
  canUndo,
  canRedo,
  onUndo,
  onRedo
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tplBtnRef = useRef<HTMLButtonElement>(null);
  const [isTemplateOpen, setIsTemplateOpen] = useState(false);
  const [tplMenuPos, setTplMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [mobileTplOpen, setMobileTplOpen] = useState(false);

  const chooseTemplate = (name: 'basic' | 'enterprise') => {
    onLoadTemplate(name);
    toggleTemplateMenu();
    setIsMobileOpen(false);
    setMobileTplOpen(false);
  };

  const closeMobile = () => {
    setIsMobileOpen(false);
    setMobileTplOpen(false);
  };

  const toggleTemplateMenu = () => {
    const btn = tplBtnRef.current;
    if (!btn) return;
    if (isTemplateOpen) {
      setIsTemplateOpen(false);
      setTplMenuPos(null);
      return;
    }
    const r = btn.getBoundingClientRect();
    setTplMenuPos({ left: Math.min(r.left, window.innerWidth - 250), top: r.bottom + 6 });
    setIsTemplateOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onImportMlab(e.target.files[0]);
    }
  };

  return (
    <header className="h-14 border-b border-[#2B2D31] bg-[#0F1015] px-4 flex items-center justify-between text-slate-200 select-none z-30">
      {/* Brand & Project Info */}
      <div className="flex items-center space-x-3 flex-shrink-0">
        <div className="flex items-center space-x-2 bg-[#1A1D24] border border-[#2B2D31] px-2 sm:px-3 py-1.5 rounded-md text-slate-200 font-bold tracking-tight shadow-sm">
          <Network className="w-5 h-5 animate-pulse" />
          <span className="hidden sm:inline text-base font-extrabold tracking-wider">MikroLab</span>
        </div>
        <div className="hidden lg:block text-xs px-2 py-0.5 rounded border border-blue-500/40 bg-blue-500/10 text-blue-400 font-mono">
          v1.0 Foundation
        </div>
        <div className="h-4 w-px bg-slate-700 hidden md:block" />
        <div className="hidden md:flex flex-col">
          <span className="text-sm font-semibold text-slate-100">{project.metadata.name}</span>
          <span className="text-[10px] text-slate-400 font-mono">{project.nodes.length} Nodes • {project.edges.length} Cables</span>
        </div>
      </div>

      {/* Toolbar Controls */}
      <div className="flex items-center space-x-1.5 sm:space-x-2 overflow-x-auto scrollbar-hide px-2 lg:hidden flex-shrink">
        {/* Mobile hamburger */}
        <button
          onClick={() => setIsMobileOpen((o) => !o)}
          title="Menu"
          aria-label="Menu utama"
          className={`flex-shrink-0 p-2 rounded-md border transition ${
            isMobileOpen
              ? 'bg-slate-700 text-slate-100 border-emerald-500/50'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
          }`}
        >
          {isMobileOpen ? <X className="w-4.5 h-4.5" /> : <Menu className="w-4.5 h-4.5" />}
        </button>

        {isMobileOpen && (
          <>
            <div className="fixed inset-0 z-[55]" onClick={closeMobile} />
            <div className="fixed z-[70] right-0 top-14 bottom-0 w-[300px] max-w-[85vw] bg-[#0F1015] border-l border-[#2B2D31] overflow-y-auto flex flex-col shadow-2xl">
              {/* Header panel */}
              <div className="px-4 py-3 border-b border-[#2B2D31] flex items-center gap-2">
                <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wider shrink-0">Menu</span>
                <span className="truncate text-[12px] font-semibold text-slate-200">{project.metadata.name}</span>
                <span className="ml-auto text-[10px] font-mono text-slate-500 shrink-0">{project.nodes.length}N · {project.edges.length}C</span>
              </div>

              {/* Groups */}
              <div className="flex-1 px-2 py-2 space-y-3 overflow-y-auto">
                <div className="space-y-0.5">
                  <div className="px-2 pt-1 pb-1 text-[10px] font-mono uppercase tracking-widest text-slate-600">Project</div>
                  <MobileItem icon={<Home className="w-4 h-4 text-sky-400" />} label="Home" onClick={() => { onGoHome(); closeMobile(); }} />
                  <MobileItem icon={<Plus className="w-4 h-4 text-blue-400" />} label="New Topology" onClick={() => { onNewProject(); closeMobile(); }} />
                  <div className="flex items-center space-x-1 px-1 pt-1">
                    <MobileItem icon={<Undo2 className="w-4 h-4 text-slate-400" />} label="Undo" disabled={!canUndo} onClick={() => { onUndo(); }} />
                    <MobileItem icon={<Redo2 className="w-4 h-4 text-slate-400" />} label="Redo" disabled={!canRedo} onClick={() => { onRedo(); }} />
                  </div>
                </div>

                <div className="space-y-0.5">
                  <div className="px-2 pt-1 pb-1 text-[10px] font-mono uppercase tracking-widest text-slate-600">Templates</div>
                  <button
                    onClick={() => setMobileTplOpen((o) => !o)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-md text-[13px] font-medium text-slate-200 hover:bg-slate-800 transition"
                  >
                    <span className="flex items-center gap-2.5">
                      <FolderTree className="w-4 h-4 text-emerald-400" />
                      Templates
                    </span>
                    <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${mobileTplOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {mobileTplOpen && (
                    <div className="ml-4 mt-1 border-l border-slate-700 pl-2 space-y-1 pb-1">
                      <MobileItem label="Mudah: Router + Switch + PC" sub="MikroTik gateway, switch Cisco, 1 PC" onClick={() => chooseTemplate('basic')} />
                      <MobileItem label="ISP / Data Center Lab" sub="16 perangkat: ISP, firewall, core, server" onClick={() => chooseTemplate('enterprise')} />
                    </div>
                  )}
                </div>

                <div className="space-y-0.5">
                  <div className="px-2 pt-1 pb-1 text-[10px] font-mono uppercase tracking-widest text-slate-600">File</div>
                  <MobileItem icon={<Upload className="w-4 h-4 text-amber-400" />} label="Import (.mlab)" onClick={() => { fileInputRef.current?.click(); closeMobile(); }} />
                  <MobileItem icon={<FileCode className="w-4 h-4 text-indigo-400" />} label="Export (.mlab)" onClick={() => { onExportMlab(); closeMobile(); }} />
                  <MobileItem icon={<Image className="w-4 h-4 text-cyan-400" />} label="Export PNG" onClick={() => { onExportPng(); closeMobile(); }} />
                  <MobileItem icon={<FileImage className="w-4 h-4 text-fuchsia-400" />} label="Export SVG" onClick={() => { onExportSvg(); closeMobile(); }} />
                  <MobileItem icon={<Share2 className="w-4 h-4 text-emerald-400" />} label="Share Link" onClick={() => { onShare(); closeMobile(); }} />
                </div>

                <div className="space-y-0.5">
                  <div className="px-2 pt-1 pb-1 text-[10px] font-mono uppercase tracking-widest text-slate-600">Learning</div>
                  <MobileItem icon={<Bot className="w-4 h-4 text-violet-400" />} label="AI Mentor" onClick={() => { onOpenAiChat(); closeMobile(); }} />
                  <MobileItem icon={<ClipboardCheck className="w-4 h-4 text-violet-400" />} label="Auto-Grading" onClick={() => { onOpenGrading(); closeMobile(); }} />
                  <MobileItem icon={<PackageCheck className="w-4 h-4 text-blue-400" />} label="Monorepo Docs" onClick={() => { onOpenMonorepo(); closeMobile(); }} />
                </div>

                <div className="space-y-0.5">
                  <div className="px-2 pt-1 pb-1 text-[10px] font-mono uppercase tracking-widest text-slate-600">Support</div>
                  <MobileItem icon={<Download className="w-4 h-4 text-emerald-400" />} label="Download Foundation ZIP" href="/MikroLab-Foundation-v1.zip" onClick={closeMobile} />
                  <MobileItem icon={<Heart className="w-4 h-4 text-rose-400" />} label="Donate (QRIS)" onClick={() => { onOpenDonate(); closeMobile(); }} />
                  <MobileItem icon={<HelpCircle className="w-4 h-4 text-cyan-400" />} label="Tutorial / Panduan" onClick={() => { onOpenTutorial(); closeMobile(); }} />
                </div>
              </div>

              {/* Footer: theme toggle */}
              <div className="px-3 py-3 border-t border-[#2B2D31] flex items-center justify-between">
                <span className="text-[12px] font-medium text-slate-300">Tema</span>
                <button
                  onClick={() => { onToggleTheme(); }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
                  <span className="text-[12px]">{theme === 'dark' ? 'Light' : 'Dark'}</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Desktop toolbar */}
      <div className="hidden lg:flex items-center space-x-1.5 sm:space-x-2 overflow-x-auto scrollbar-hide px-2">
        <button
          onClick={onGoHome}
          title="Back to Home Page"
          className="flex-shrink-0 flex items-center space-x-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
        >
          <Home className="w-3.5 h-3.5 text-sky-400" />
          <span className="hidden sm:inline">Home</span>
        </button>

        <button
          onClick={onNewProject}
          title="New Topology"
          className="flex-shrink-0 flex items-center space-x-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
        >
          <Plus className="w-3.5 h-3.5 text-blue-400" />
          <span className="hidden sm:inline">New</span>
        </button>

        {/* Undo / Redo */}
        <div className="flex items-center space-x-0.5 flex-shrink-0">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className={`p-1.5 rounded-md border transition ${
              canUndo
                ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
            }`}
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            className={`p-1.5 rounded-md border transition ${
              canRedo
                ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
            }`}
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Template Selector (popover ke bawah, klik & sentuh) */}
        <div className="relative flex-shrink-0">
          <button
            ref={tplBtnRef}
            onClick={toggleTemplateMenu}
            className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-md text-xs font-medium border transition ${
              isTemplateOpen
                ? 'bg-slate-700 text-slate-100 border-emerald-500/50'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            <FolderTree className="w-3.5 h-3.5 text-emerald-400" />
            <span>Templates</span>
          </button>
          {isTemplateOpen && tplMenuPos && (
            <>
              <div className="fixed inset-0 z-[55]" onClick={toggleTemplateMenu} />
              <div
                className="fixed z-[60] w-56 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl p-1 font-sans animate-in fade-in zoom-in-95 duration-150"
                style={{ left: tplMenuPos.left, top: tplMenuPos.top }}
              >
                <button
                  onClick={() => {
                    onLoadTemplate('basic');
                    toggleTemplateMenu();
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-slate-800 rounded text-slate-200"
                >
                  <div className="font-semibold text-slate-100">Mudah: Router + Switch + PC</div>
                  <div className="text-[10px] text-slate-400">MikroTik gateway, switch Cisco, 1 PC</div>
                </button>
                <button
                  onClick={() => {
                    onLoadTemplate('enterprise');
                    toggleTemplateMenu();
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-slate-800 rounded text-slate-200"
                >
                  <div className="font-semibold text-slate-100">ISP / Data Center Lab</div>
                  <div className="text-[10px] text-slate-400">16 perangkat: ISP, firewall, core, server</div>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Import .mlab */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".mlab,.json"
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Import .mlab Project"
          className="flex-shrink-0 flex items-center space-x-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
        >
          <Upload className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden md:inline">Import</span>
        </button>

        {/* Export .mlab */}
        <button
          onClick={onExportMlab}
          title="Export Topology (.mlab)"
          className="flex-shrink-0 flex items-center space-x-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
        >
          <FileCode className="w-3.5 h-3.5 text-indigo-400" />
          <span className="hidden md:inline">Export</span>
        </button>

        {/* Share link */}
        <button
          onClick={onShare}
          title="Bagikan topologi lewat link"
          className="flex-shrink-0 flex items-center space-x-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
        >
          <Share2 className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden lg:inline">Share</span>
        </button>

        {/* Export PNG */}
        <button
          onClick={onExportPng}
          title="Export Topologi sebagai Gambar (PNG)"
          className="flex-shrink-0 flex items-center space-x-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
        >
          <Image className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden lg:inline">PNG</span>
        </button>

        {/* Export SVG */}
        <button
          onClick={onExportSvg}
          title="Export Topologi sebagai Vektor (SVG)"
          className="flex-shrink-0 flex items-center space-x-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
        >
          <FileImage className="w-3.5 h-3.5 text-fuchsia-400" />
          <span className="hidden lg:inline">SVG</span>
        </button>

        {/* AI Mentor */}
        <button
          onClick={onOpenAiChat}
          title="Tanya AI Mentor — kenapa jaringan gagal, cara kerja, perbaikan"
          className="flex-shrink-0 flex items-center space-x-1 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-violet-950 hover:bg-violet-900 text-violet-200 border border-violet-700 transition"
        >
          <Bot className="w-3.5 h-3.5 text-violet-400" />
          <span className="hidden xl:inline">AI Mentor</span>
        </button>

        {/* Auto-Grading */}
        <button
          onClick={onOpenGrading}
          title="Auto-grading: validasi lab otomatis (skripsi/praktikum)"
          className="flex-shrink-0 flex items-center space-x-1 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-violet-950 hover:bg-violet-900 text-violet-200 border border-violet-800 transition"
        >
          <ClipboardCheck className="w-3.5 h-3.5 text-violet-400" />
          <span className="hidden xl:inline">Grading</span>
        </button>

        {/* Monorepo Architecture Explorer */}
        <button
          onClick={onOpenMonorepo}
          title="Monorepo Packages & Architecture"
          className="flex-shrink-0 flex items-center space-x-1 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-blue-950 hover:bg-blue-900 text-blue-200 border border-blue-800 transition"
        >
          <PackageCheck className="w-3.5 h-3.5 text-blue-400" />
          <span className="hidden xl:inline">Monorepo Docs</span>
        </button>

        {/* Download Foundation ZIP */}
        <a
          href="/MikroLab-Foundation-v1.zip"
          download="MikroLab-Foundation-v1.zip"
          title="Download Complete Foundation Monorepo ZIP"
          className="flex-shrink-0 flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 shadow-sm transition"
        >
          <Download className="w-3.5 h-3.5" />
          <span>ZIP</span>
        </a>

        {/* Donate (QRIS) */}
        <button
          onClick={onOpenDonate}
          title="Donate / Dukung Kreator"
          className="flex-shrink-0 flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/30 shadow-sm transition"
        >
          <Heart className="w-3.5 h-3.5 fill-white" />
          <span className="hidden xl:inline">Donate</span>
        </button>

        {/* Help Tutorial */}
        <button
          onClick={onOpenTutorial}
          title="Panduan Penggunaan NetLab"
          className="flex-shrink-0 p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
        >
          <HelpCircle className="w-4 h-4 text-cyan-400" />
        </button>

        {/* Dark/Light Toggle */}
        <button
          onClick={onToggleTheme}
          title="Toggle Dark / Light Theme"
          className="flex-shrink-0 p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
        </button>
      </div>
    </header>
  );
};
