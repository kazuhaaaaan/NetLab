import React, { useState } from 'react';
import {
  PackageCheck,
  Download,
  X,
  FileText,
  Code,
  ShieldAlert,
  CheckCircle,
  FolderTree
} from 'lucide-react';
import { MONOREPO_PACKAGES_DOCS, PackageDoc } from '../data/monorepoDocs';

interface MonorepoExplorerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MonorepoExplorerModal: React.FC<MonorepoExplorerModalProps> = ({ isOpen, onClose }) => {
  const [selectedPkg, setSelectedPkg] = useState<PackageDoc>(MONOREPO_PACKAGES_DOCS[0]);
  const [docTab, setDocTab] = useState<'architecture' | 'prompt' | 'contract' | 'api' | 'todo'>('architecture');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-5xl w-full h-[85vh] flex flex-col shadow-2xl text-slate-100 overflow-hidden">
        {/* Modal Header */}
        <div className="h-14 border-b border-slate-800 px-5 flex items-center justify-between bg-slate-950">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
              <FolderTree className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">NetLab Monorepo Foundation Architecture</h2>
              <p className="text-xs text-slate-400">11 Workspace Packages • Clean Architecture • SOLID Contracts</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <a
              href="/NetLab-Foundation-v1.zip"
              download="NetLab-Foundation-v1.zip"
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-md shadow-emerald-950/40 transition"
            >
              <Download className="w-4 h-4" />
              <span>Download ZIP Archive</span>
            </a>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar - Packages List */}
          <div className="w-64 border-r border-slate-800 bg-slate-950/50 p-2 overflow-y-auto space-y-1">
            <div className="text-[10px] font-bold text-slate-500 uppercase px-3 py-1 tracking-wider">
              Workspace Packages ({MONOREPO_PACKAGES_DOCS.length})
            </div>
            {MONOREPO_PACKAGES_DOCS.map((pkg) => {
              const isSelected = selectedPkg.name === pkg.name;
              return (
                <button
                  key={pkg.name}
                  onClick={() => setSelectedPkg(pkg)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition flex items-center justify-between ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-slate-100'
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate">
                    <PackageCheck className="w-4 h-4 shrink-0" />
                    <span className="truncate">{pkg.title}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Panel - Package Details & Docs */}
          <div className="flex-1 flex flex-col bg-slate-900 overflow-hidden">
            {/* Package Summary Header */}
            <div className="p-4 border-b border-slate-800 bg-slate-950/30">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-base font-extrabold text-blue-400 font-mono">{selectedPkg.title}</h3>
                <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono border border-slate-700">
                  packages/{selectedPkg.name}
                </span>
              </div>
              <p className="text-xs text-slate-300">{selectedPkg.description}</p>
            </div>

            {/* Doc Sub-tabs */}
            <div className="flex border-b border-slate-800 bg-slate-950 px-3">
              {[
                { key: 'architecture', label: 'ARCHITECTURE.md', icon: FileText },
                { key: 'prompt', label: 'PROMPT.md', icon: Code },
                { key: 'contract', label: 'CONTRACT.md', icon: ShieldAlert },
                { key: 'api', label: 'API.md', icon: Code },
                { key: 'todo', label: 'TODO.md', icon: CheckCircle }
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = docTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setDocTab(tab.key as any)}
                    className={`px-3 py-2 text-xs font-mono font-medium flex items-center space-x-1.5 border-b-2 transition ${
                      isActive
                        ? 'border-blue-500 text-blue-400 bg-slate-900'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Content Display */}
            <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-slate-200 bg-slate-950/60 leading-relaxed whitespace-pre-wrap">
              {selectedPkg[docTab]}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
