import React, { useState } from 'react';
import {
  Layers,
  Sliders,
  Trash2,
  Terminal,
  Search,
  ChevronDown,
  ChevronRight,
  Power,
  PowerOff,
  Plus
} from 'lucide-react';
import { LabNode, VendorType } from '../types';
import { VENDOR_MAP } from '../data/vendors';
import { getModelsForVendor, ModelDeviceType } from '../data/deviceModels';
import { DeviceIcon } from './DeviceIcon';

type DeviceTypeId = ModelDeviceType;

const DEVICE_META: Record<DeviceTypeId, { label: string; description: string; color: string }> = {
  router: { label: 'Router', description: 'Routing LAN/WAN antar jaringan', color: 'text-sky-400 bg-sky-500/10 border-sky-500/30' },
  switch: { label: 'Switch', description: 'Menghubungkan perangkat dalam LAN', color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  firewall: { label: 'Firewall', description: 'Filter traffic dan kebijakan akses', color: 'text-rose-400 bg-rose-500/10 border-rose-500/30' },
  wireless: { label: 'Wireless AP', description: 'Akses jaringan melalui WiFi', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' },
  server: { label: 'Server', description: 'Layanan jaringan berbasis Linux', color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
  pc: { label: 'PC / Client', description: 'Host klien untuk latihan TCP/IP', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  'windows-client': { label: 'Windows Client', description: 'Desktop Windows dengan GUI', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30' },
};

const DEVICE_GROUPS: { label: string; types: DeviceTypeId[] }[] = [
  { label: 'Networking', types: ['router', 'switch', 'firewall', 'wireless'] },
  { label: 'Compute & End Devices', types: ['server', 'pc', 'windows-client'] },
];

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
  const [deviceSearch, setDeviceSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [selection, setSelection] = useState<
    Partial<Record<DeviceTypeId, { vendor: VendorType; model: string }>>
  >({});

  const effectiveVendor = (vendorId: VendorType, deviceType: DeviceTypeId): VendorType =>
    deviceType === 'server' ? 'linux' : deviceType === 'windows-client' ? 'windows' : vendorId;

  const vendorsForType = (deviceType: DeviceTypeId) => {
    if (deviceType === 'server') return [VENDOR_MAP.linux];
    if (deviceType === 'windows-client') return [VENDOR_MAP.windows];
    return Object.values(VENDOR_MAP).filter((v) =>
      getModelsForVendor(v.id).some((m) => m.types.includes(deviceType))
    );
  };

  const modelsForType = (vendorId: VendorType, deviceType: DeviceTypeId) =>
    getModelsForVendor(effectiveVendor(vendorId, deviceType)).filter((m) => m.types.includes(deviceType));

  const resolveSelection = (deviceType: DeviceTypeId) => {
    const vendors = vendorsForType(deviceType);
    const stored = selection[deviceType];
    const vendor =
      stored && vendors.some((v) => v.id === stored.vendor) ? stored.vendor : vendors[0]?.id;
    if (!vendor) return null;
    const models = modelsForType(vendor, deviceType);
    const model =
      stored?.model && models.some((m) => m.label === stored.model) ? stored.model : models[0]?.label;
    if (!model) return null;
    return { vendor, model };
  };

  const query = deviceSearch.trim().toLowerCase();
  const visibleGroups = DEVICE_GROUPS.map((group) => ({
    ...group,
    types: group.types.filter((deviceType) => {
      if (!query) return true;
      const meta = DEVICE_META[deviceType];
      if (meta.label.toLowerCase().includes(query) || meta.description.toLowerCase().includes(query)) return true;
      return vendorsForType(deviceType).some(
        (v) => v.name.toLowerCase().includes(query) || v.osName.toLowerCase().includes(query)
      );
    }),
  })).filter((group) => group.types.length > 0);

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
          <div className="space-y-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Cari perangkat / vendor..."
                value={deviceSearch}
                onChange={(e) => setDeviceSearch(e.target.value)}
                className="w-full bg-[#1A1D24] border border-[#2B2D31] rounded-md pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-500 transition-colors"
              />
            </div>

            <div className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase">
              Device Library
            </div>

            {visibleGroups.length === 0 && (
              <div className="rounded-md border border-dashed border-[#2B2D31] py-8 text-center text-[11px] text-slate-500">
                Tidak ada perangkat yang cocok.
              </div>
            )}

            <div className="space-y-3">
              {visibleGroups.map((group) => (
                <section key={group.label} className="rounded-lg border border-[#2B2D31] bg-[#12141A] overflow-hidden">
                  <button
                    onClick={() => setCollapsed((c) => ({ ...c, [group.label]: !c[group.label] }))}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-white/[0.02] transition"
                  >
                    <span className="flex items-center gap-2">
                      {collapsed[group.label] ? (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                      )}
                      <span className="text-[11px] font-semibold text-slate-200 uppercase tracking-wide">{group.label}</span>
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">{group.types.length}</span>
                  </button>

                  {!collapsed[group.label] && (
                    <div className="space-y-2 px-2 pb-2">
                      {group.types.map((deviceType) => {
                        const resolved = resolveSelection(deviceType);
                        if (!resolved) return null;
                        const meta = DEVICE_META[deviceType];
                        const vendors = vendorsForType(deviceType);
                        const models = modelsForType(resolved.vendor, deviceType);
                        return (
                          <div key={deviceType} className="rounded-md border border-[#2B2D31] bg-[#1A1D24] p-2.5 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className={`w-9 h-9 shrink-0 rounded-lg border flex items-center justify-center ${meta.color}`}>
                                <DeviceIcon type={deviceType} className="w-5 h-5" />
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-100">{meta.label}</p>
                                <p className="text-[10px] text-slate-500 truncate">{meta.description}</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              <select
                                value={resolved.vendor}
                                onChange={(e) =>
                                  setSelection((s) => ({
                                    ...s,
                                    [deviceType]: { vendor: e.target.value as VendorType, model: '' },
                                  }))
                                }
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-blue-500"
                              >
                                {vendors.map((v) => (
                                  <option key={v.id} value={v.id}>{v.name}</option>
                                ))}
                              </select>
                              <select
                                value={resolved.model}
                                onChange={(e) =>
                                  setSelection((s) => ({
                                    ...s,
                                    [deviceType]: { vendor: resolved.vendor, model: e.target.value },
                                  }))
                                }
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-blue-500"
                              >
                                {models.map((m) => (
                                  <option key={m.id} value={m.label}>{m.label}</option>
                                ))}
                              </select>
                            </div>
                            <button
                              onClick={() => onAddNode(resolved.vendor, deviceType, resolved.model)}
                              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/40 text-[11px] font-semibold text-blue-200 transition"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Tambah {meta.label}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
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
