import React, { useState } from 'react';
import {
  Layers,
  Sliders,
  Cable,
  Trash2,
  Terminal,
  Search,
  ChevronRight,
  Power,
  PowerOff
} from 'lucide-react';
import { LabNode, VendorType } from '../types';
import { VENDOR_MAP } from '../data/vendors';
import { getDefaultModel, getModelsForVendor } from '../data/deviceModels';

interface SidebarProps {
  selectedNode: LabNode | null;
  onAddNode: (vendor: VendorType, deviceType: 'router' | 'switch' | 'firewall' | 'pc' | 'server' | 'wireless' | 'windows-client', model?: string) => void;
  onUpdateNodeName: (nodeId: string, name: string) => void;
  onUpdateNodeModel: (nodeId: string, model: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onTogglePower: (nodeId: string) => void;
  onOpenTerminal: (nodeId: string) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  selectedNode,
  onAddNode,
  onUpdateNodeName,
  onUpdateNodeModel,
  onDeleteNode,
  onTogglePower,
  onOpenTerminal,
  isOpen,
  onToggleOpen
}) => {
  const [activeTab, setActiveTab] = useState<'palette' | 'inspector'>('palette');
  const [vendorSearch, setVendorSearch] = useState('');
  const [preferredModel, setPreferredModel] = useState<Record<string, string>>({});

  /** Model yang cocok untuk tipe device; server selalu pakai vendor linux. */
  const pickModel = (vendorId: VendorType, deviceType: 'router' | 'switch' | 'firewall' | 'pc' | 'server' | 'wireless' | 'windows-client'): string => {
    const effVendor: VendorType =
      deviceType === 'server' ? 'linux' : deviceType === 'windows-client' ? 'windows' : vendorId;
    const pre = preferredModel[effVendor];
    if (pre && getModelsForVendor(effVendor).some((m) => m.label === pre && m.types.includes(deviceType))) {
      return pre;
    }
    return getDefaultModel(effVendor, deviceType);
  };

  const vendorsList = Object.values(VENDOR_MAP).filter(
    (v) =>
      v.name.toLowerCase().includes(vendorSearch.toLowerCase()) ||
      v.osName.toLowerCase().includes(vendorSearch.toLowerCase())
  );

  return (
    <aside
      className={`fixed top-14 left-0 bottom-0 z-20 w-80 bg-[#0F1015] border-r border-[#2B2D31] transition-transform duration-300 flex flex-col ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* Sidebar Toggle Handle */}
      <button
        onClick={onToggleOpen}
        className="absolute -right-7 top-4 bg-[#0F1015] border border-[#2B2D31] border-l-0 text-slate-400 p-1.5 rounded-r-md hover:text-white transition shadow-sm"
      >
        <ChevronRight className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Tab Header */}
      <div className="flex border-b border-[#2B2D31] bg-[#0B0C0E]">
        <button
          onClick={() => setActiveTab('palette')}
          className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center space-x-1.5 border-b-2 transition ${
            activeTab === 'palette'
              ? 'border-blue-500 text-blue-400 bg-slate-900'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Palette</span>
        </button>
        <button
          onClick={() => setActiveTab('inspector')}
          className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center space-x-1.5 border-b-2 transition ${
            activeTab === 'inspector'
              ? 'border-blue-500 text-blue-400 bg-slate-900'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Inspector</span>
          {selectedNode && <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />}
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* PALETTE TAB */}
        {activeTab === 'palette' && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search vendor / OS..."
                value={vendorSearch}
                onChange={(e) => setVendorSearch(e.target.value)}
                className="w-full bg-[#1A1D24] border border-[#2B2D31] rounded-md pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-500 transition-colors"
              />
            </div>

            <div className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase">
              Enterprise Vendors ({vendorsList.length})
            </div>

            <div className="space-y-2.5">
              {vendorsList.map((vendor) => (
                <div
                  key={vendor.id}
                  className="bg-[#1A1D24] border border-[#2B2D31] rounded-md p-2.5 hover:border-[#4B4D51] transition space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-100">{vendor.name}</span>
                      <span className="text-[10px] text-slate-400 block font-mono">{vendor.osName}</span>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${vendor.badgeColor}`}>
                      {vendor.id}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 line-clamp-2">{vendor.description}</p>

                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-medium block">
                      Model Perangkat (dipakai saat tombol add diklik)
                    </label>
                    <select
                      value={preferredModel[vendor.id] ?? ''}
                      onChange={(e) => setPreferredModel((p) => ({ ...p, [vendor.id]: e.target.value }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-blue-500"
                    >
                      <option value="">Default (otomatis per tipe)</option>
                      {getModelsForVendor(vendor.id).map((m) => (
                        <option key={m.id} value={m.label}>
                          {m.label} — {m.specs.ports}
                        </option>
                      ))}
                    </select>
                    {preferredModel[vendor.id] &&
                      (() => {
                        const m = getModelsForVendor(vendor.id).find((x) => x.label === preferredModel[vendor.id]);
                        if (!m) return null;
                        return (
                          <p className="text-[10px] text-slate-500 leading-snug">
                            <span className="text-slate-400 font-medium">{m.types.join(', ')}</span> • {m.specs.cpu} •{' '}
                            {m.specs.ports} • {m.description}
                          </p>
                        );
                      })()}
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-1.5 pt-1">
                    <button
                      onClick={() => onAddNode(vendor.id, 'router', pickModel(vendor.id, 'router'))}
                      className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded text-[11px] font-medium text-slate-200 transition"
                    >
                      + Router
                    </button>
                    <button
                      onClick={() => onAddNode(vendor.id, 'switch', pickModel(vendor.id, 'switch'))}
                      className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded text-[11px] font-medium text-slate-200 transition"
                    >
                      + Switch
                    </button>
                    <button
                      onClick={() => onAddNode(vendor.id, 'server', pickModel('linux', 'server'))}
                      className="px-2 py-1 bg-slate-900 hover:bg-indigo-900/50 border border-indigo-800/50 rounded text-[11px] font-medium text-indigo-200 transition"
                    >
                      + Server
                    </button>
                    <button
                      onClick={() => onAddNode(vendor.id, 'wireless', pickModel(vendor.id, 'wireless'))}
                      className="px-2 py-1 bg-slate-900 hover:bg-cyan-900/50 border border-cyan-800/50 rounded text-[11px] font-medium text-cyan-200 transition"
                    >
                      + Wireless
                    </button>
                    <button
                      onClick={() => onAddNode(vendor.id, 'pc', pickModel(vendor.id, 'pc'))}
                      className="px-2 py-1 bg-slate-900 hover:bg-emerald-900/50 border border-emerald-800/50 rounded text-[11px] font-medium text-emerald-200 transition"
                    >
                      + PC
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* INSPECTOR TAB */}
        {activeTab === 'inspector' && (
          <div>
            {selectedNode ? (
              <div className="space-y-4">
                <div className="bg-[#1A1D24] border border-[#2B2D31] rounded-md p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-100">Node Properties</span>
                    <div className="flex items-center space-x-1.5">
                      <button
                        onClick={() => onTogglePower(selectedNode.id)}
                        title={selectedNode.powered === false ? 'Device dimatikan' : 'Device menyala'}
                        className={`flex items-center space-x-1 px-2 py-1 rounded text-[11px] font-semibold border transition ${
                          selectedNode.powered === false
                            ? 'bg-rose-950/60 hover:bg-rose-900 border-rose-800 text-rose-200'
                            : 'bg-emerald-950/60 hover:bg-emerald-900 border-emerald-800 text-emerald-200'
                        }`}
                      >
                        {selectedNode.powered === false ? <PowerOff className="w-3 h-3" /> : <Power className="w-3 h-3" />}
                        <span>{selectedNode.powered === false ? 'Power: OFF' : 'Power: ON'}</span>
                      </button>
                      <button
                        onClick={() => onOpenTerminal(selectedNode.id)}
                        className="flex items-center space-x-1 px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold"
                      >
                        <Terminal className="w-3 h-3" />
                        <span>CLI Terminal</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">Hostname</label>
                    <input
                      type="text"
                      value={selectedNode.name}
                      onChange={(e) => onUpdateNodeName(selectedNode.id, e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Vendor</span>
                      <span className="text-slate-200 font-semibold">{VENDOR_MAP[selectedNode.vendor]?.name}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Type</span>
                      <span className="text-slate-200 font-semibold uppercase">{selectedNode.deviceType}</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">
                      Model Perangkat
                    </label>
                    <select
                      value={selectedNode.model}
                      onChange={(e) => onUpdateNodeModel(selectedNode.id, e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                    >
                      {(() => {
                        const all = getModelsForVendor(selectedNode.vendor);
                        const fitting = all.filter((m) => m.types.includes(selectedNode.deviceType));
                        const list = fitting.length > 0 ? fitting : all;
                        return list.map((m) => (
                          <option key={m.id} value={m.label}>
                            {m.label}
                          </option>
                        ));
                      })()}
                    </select>
                    {(() => {
                      const selected = getModelsForVendor(selectedNode.vendor).find((m) => m.label === selectedNode.model);
                      if (!selected) return null;
                      return (
                        <div className="mt-1.5 text-[10.5px] text-slate-500 leading-relaxed space-y-0.5">
                          <p>{selected.description}</p>
                          <p className="font-mono text-[9.5px] text-slate-600">
                            {selected.specs.cpu} · {selected.specs.ram} · {selected.specs.ports || selected.specs.flash}
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Ports list */}
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase block">
                    Network Interfaces ({selectedNode.ports.length})
                  </span>
                  <div className="space-y-1.5">
                    {selectedNode.ports.map((port) => (
                      <div
                        key={port.id}
                        className="bg-[#1A1D24] border border-[#2B2D31] rounded-md p-2 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center space-x-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              port.status === 'up' ? 'bg-emerald-500 shadow-sm shadow-emerald-500' : 'bg-slate-600'
                            }`}
                          />
                          <span className="font-mono font-medium text-slate-200">{port.name}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {port.speedMbps} Mbps • {port.ipAddress || 'Unassigned'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => onDeleteNode(selectedNode.id)}
                  className="w-full py-2 bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-200 rounded-md text-xs font-semibold flex items-center justify-center space-x-1.5 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Device Node</span>
                </button>
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500 space-y-2">
                <Sliders className="w-8 h-8 mx-auto text-slate-600 stroke-1" />
                <p className="text-xs">Select a device on the topology canvas to inspect or edit properties.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
