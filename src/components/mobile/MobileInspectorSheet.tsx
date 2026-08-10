import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Power,
  PowerOff,
  Terminal,
  Trash2,
  Cpu,
  MemoryStick,
  HardDrive
} from 'lucide-react';
import { MobileSheet } from './MobileSheet';
import { VENDOR_MAP } from '../../data/vendors';
import { getModelsForVendor } from '../../data/deviceModels';
import { LabNode, VendorType } from '../../types';

interface MobileInspectorSheetProps {
  open: boolean;
  onClose: () => void;
  node: LabNode | null;
  onUpdateNodeName: (nodeId: string, name: string) => void;
  onUpdateNodeModel: (nodeId: string, model: string) => void;
  onTogglePower: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onOpenTerminal: (nodeId: string) => void;
}

type Section = 'basic' | 'interfaces' | 'advanced';

export const MobileInspectorSheet: React.FC<MobileInspectorSheetProps> = ({
  open,
  onClose,
  node,
  onUpdateNodeName,
  onUpdateNodeModel,
  onTogglePower,
  onDeleteNode,
  onOpenTerminal,
}) => {
  const [openSections, setOpenSections] = useState<Section[]>(['basic']);

  if (!node) return null;

  const vendorInfo = VENDOR_MAP[node.vendor];
  const models = getModelsForVendor(node.vendor);
  const modelInfo = models.find((m) => m.label === node.model);

  const toggleSection = (s: Section) =>
    setOpenSections((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const SectionHeader: React.FC<{ id: Section; label: string }> = ({ id, label }) => (
    <button
      onClick={() => toggleSection(id)}
      className="w-full flex items-center justify-between py-3 text-sm font-semibold text-slate-100"
    >
      <span>{label}</span>
      {openSections.includes(id) ? (
        <ChevronDown className="w-4 h-4 text-slate-500" />
      ) : (
        <ChevronRight className="w-4 h-4 text-slate-500" />
      )}
    </button>
  );

  return (
    <MobileSheet open={open} onClose={onClose} title="Inspeksi Perangkat" height="h-[78dvh]">
      <div className="divide-y divide-[#26282E]">
        {/* Basic */}
        <div>
          <SectionHeader id="basic" label="Dasar" />
          {openSections.includes('basic') && (
            <div className="pb-4 space-y-3">
              <div>
                <label className="text-[11px] text-slate-500 font-medium">Nama Host</label>
                <input
                  value={node.name}
                  onChange={(e) => onUpdateNodeName(node.id, e.target.value)}
                  className="mt-1 w-full px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-500 font-medium">Vendor</label>
                  <div className="mt-1 px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-sm text-slate-300">
                    {vendorInfo?.name}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 font-medium">Tipe</label>
                  <div className="mt-1 px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-sm text-slate-300 capitalize">
                    {node.deviceType}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-slate-500 font-medium">Model</label>
                <select
                  value={node.model}
                  onChange={(e) => onUpdateNodeModel(node.id, e.target.value)}
                  className="mt-1 w-full px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.label}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Interfaces */}
        <div>
          <SectionHeader id="interfaces" label={`Antarmuka (${node.ports.length})`} />
          {openSections.includes('interfaces') && (
            <div className="pb-4 space-y-1">
              {node.ports.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-900/60"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${p.status === 'up' ? 'bg-emerald-400' : 'bg-rose-500'}`}
                    />
                    <span className="text-xs font-medium text-slate-200">{p.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-slate-400">{p.ipAddress || '—'}</span>
                    <span className="text-[10px] text-slate-600 block">{p.speedMbps} Mbps</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Advanced */}
        <div>
          <SectionHeader id="advanced" label="Spesifikasi" />
          {openSections.includes('advanced') && (
            <div className="pb-4">
              {modelInfo && (
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-slate-300">
                    <Cpu className="w-4 h-4 text-slate-500" />
                    {modelInfo.specs.cpu}
                  </div>
                  <div className="flex items-center gap-2 text-slate-300">
                    <MemoryStick className="w-4 h-4 text-slate-500" />
                    {modelInfo.specs.ram} RAM
                  </div>
                  {modelInfo.specs.flash && (
                    <div className="flex items-center gap-2 text-slate-300">
                      <HardDrive className="w-4 h-4 text-slate-500" />
                      {modelInfo.specs.flash}
                    </div>
                  )}
                  <p className="text-slate-500 text-[11px] leading-relaxed mt-1">{modelInfo.description}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 grid grid-cols-3 gap-2.5 border-t border-[#26282E] pt-4">
        <button
          onClick={() => {
            onOpenTerminal(node.id);
            onClose();
          }}
          className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
        >
          <Terminal className="w-4 h-4" /> Terminal
        </button>
        <button
          onClick={() => onTogglePower(node.id)}
          className={`flex items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-semibold transition ${
            node.powered === false
              ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-600/40'
              : 'bg-amber-900/30 text-amber-300 border border-amber-600/40'
          }`}
        >
          {node.powered === false ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
          {node.powered === false ? 'Nyalakan' : 'Matikan'}
        </button>
        <button
          onClick={() => {
            onDeleteNode(node.id);
            onClose();
          }}
          className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 text-xs font-semibold transition border border-rose-700/40"
        >
          <Trash2 className="w-4 h-4" /> Hapus
        </button>
      </div>
    </MobileSheet>
  );
};