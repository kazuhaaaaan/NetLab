import React, { useRef } from 'react';
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
  Home
} from 'lucide-react';
import { LabProject } from '../types';

interface NavbarProps {
  project: LabProject;
  onNewProject: () => void;
  onExportMlab: () => void;
  onImportMlab: (file: File) => void;
  onOpenMonorepo: () => void;
  onOpenTutorial: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onLoadTemplate: (templateName: string) => void;
  onOpenDonate: () => void;
  onGoHome: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  project,
  onNewProject,
  onExportMlab,
  onImportMlab,
  onOpenMonorepo,
  onOpenTutorial,
  theme,
  onToggleTheme,
  onLoadTemplate,
  onOpenDonate,
  onGoHome,
  canUndo,
  canRedo,
  onUndo,
  onRedo
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      <div className="flex items-center space-x-1.5 sm:space-x-2 overflow-x-auto scrollbar-hide px-2">
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

        {/* Template Selector */}
        <div className="relative group hidden lg:block">
          <button className="flex items-center space-x-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition">
            <FolderTree className="w-3.5 h-3.5 text-emerald-400" />
            <span>Templates</span>
          </button>
          <div className="absolute left-0 mt-1 w-52 bg-slate-900 border border-slate-700 rounded-lg shadow-xl hidden group-hover:block z-50 p-1 font-sans">
            <button
              onClick={() => onLoadTemplate('basic')}
              className="w-full text-left px-3 py-2 text-xs hover:bg-slate-800 rounded text-slate-200"
            >
              <div className="font-semibold text-slate-100">Mudah: Router + Switch + PC</div>
              <div className="text-[10px] text-slate-400">MikroTik gateway, switch Cisco, 1 PC</div>
            </button>
            <button
              onClick={() => onLoadTemplate('enterprise')}
              className="w-full text-left px-3 py-2 text-xs hover:bg-slate-800 rounded text-slate-200"
            >
              <div className="font-semibold text-slate-100">ISP / Data Center Lab</div>
              <div className="text-[10px] text-slate-400">16 perangkat: ISP, firewall, core, server</div>
            </button>
          </div>
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
          title="Gesture & Control Tutorial"
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
