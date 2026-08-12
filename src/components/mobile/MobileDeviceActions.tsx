import React from 'react';
import {
  Terminal,
  SlidersHorizontal,
  ListChecks,
  Cable,
  Activity,
  Power,
  PowerOff,
  Trash2
} from 'lucide-react';
import { MobileSheet } from './MobileSheet';
import { VENDOR_MAP } from '../../data/vendors';
import { LabNode } from '../../types';

interface MobileDeviceActionsProps {
  open: boolean;
  onClose: () => void;
  node: LabNode | null;
  onOpenTerminal: (nodeId: string) => void;
  onStartCable: () => void;
  onStartPing: () => void;
  onTogglePower: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onInspect: () => void;
  onOpenPortInspector: (nodeId: string) => void;
}

export const MobileDeviceActions: React.FC<MobileDeviceActionsProps> = ({
  open,
  onClose,
  node,
  onOpenTerminal,
  onStartCable,
  onStartPing,
  onTogglePower,
  onDelete,
  onInspect,
  onOpenPortInspector,
}) => {
  if (!node) return null;

  const vendorInfo = VENDOR_MAP[node.vendor];

  const actions: { label: string; icon: React.ElementType; color: string; onClick: () => void }[] = [
    { label: 'Terminal', icon: Terminal, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', onClick: () => {
      onOpenTerminal(node.id);
      onClose();
    }},
    { label: 'Inspeksi', icon: SlidersHorizontal, color: 'text-blue-400 bg-blue-500/10 border-blue-500/30', onClick: () => {
      onClose();
      onInspect();
    }},
    { label: 'Ports', icon: ListChecks, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30', onClick: () => {
      onClose();
      onOpenPortInspector(node.id);
    }},
    { label: 'Kabel', icon: Cable, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30', onClick: () => {
      onStartCable();
      onClose();
    }},
    { label: 'Ping (PDU)', icon: Activity, color: 'text-violet-400 bg-violet-500/10 border-violet-500/30', onClick: () => {
      onStartPing();
      onClose();
    }},
    {
      label: node.powered === false ? 'Nyalakan' : 'Matikan',
      icon: node.powered === false ? Power : PowerOff,
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
      onClick: () => onTogglePower(node.id),
    },
    { label: 'Hapus', icon: Trash2, color: 'text-rose-400 bg-rose-500/10 border-rose-500/30', onClick: () => {
      onDelete(node.id);
      onClose();
    }},
  ];

  return (
    <MobileSheet open={open} onClose={onClose} title="Aksi Perangkat" height="h-[48dvh]">
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[#26282E]">
        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg font-bold text-white border ${vendorInfo?.badgeColor || 'bg-slate-700'}`}
        >
          {node.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-slate-100 truncate">{node.name}</h3>
          <p className="text-[11px] text-slate-400 truncate">
            {vendorInfo?.name} • {node.model}
          </p>
        </div>
        <span
          className={`text-[10px] font-bold px-2 py-1 rounded-full border ${
            node.powered === false ? 'text-rose-400 border-rose-500/40 bg-rose-500/10' : 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
          }`}
        >
          {node.powered === false ? 'OFF' : 'ON'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={a.onClick}
            className={`flex flex-col items-center gap-2 py-4 rounded-2xl border transition active:scale-95 ${a.color}`}
          >
            <a.icon className="w-6 h-6" />
            <span className="text-[11px] font-semibold text-slate-100">{a.label}</span>
          </button>
        ))}
      </div>
    </MobileSheet>
  );
};