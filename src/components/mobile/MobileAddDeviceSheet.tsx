import React, { useMemo, useState } from 'react';
import {
  Router,
  Network,
  ShieldAlert,
  Laptop,
  Server,
  Wifi,
  ChevronLeft,
  Check,
  Boxes,
  Plus
} from 'lucide-react';
import { MobileSheet } from './MobileSheet';
import { VENDOR_MAP } from '../../data/vendors';
import { getModelsForVendor, getDefaultModel } from '../../data/deviceModels';
import { VendorType } from '../../types';

type DeviceType = 'router' | 'switch' | 'firewall' | 'pc' | 'server' | 'wireless';

const DEVICE_TYPES: { id: DeviceType; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'router', label: 'Router', icon: Router, color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  { id: 'switch', label: 'Switch', icon: Network, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' },
  { id: 'firewall', label: 'Firewall', icon: ShieldAlert, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  { id: 'pc', label: 'PC / Client', icon: Laptop, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  { id: 'server', label: 'Server', icon: Server, color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
  { id: 'wireless', label: 'Wireless AP', icon: Wifi, color: 'text-violet-400 bg-violet-500/10 border-violet-500/30' },
];

interface MobileAddDeviceSheetProps {
  open: boolean;
  onClose: () => void;
  onAddNode: (vendor: VendorType, deviceType: DeviceType, model?: string) => void;
}

type Step = 'type' | 'vendor' | 'model';

export const MobileAddDeviceSheet: React.FC<MobileAddDeviceSheetProps> = ({ open, onClose, onAddNode }) => {
  const [step, setStep] = useState<Step>('type');
  const [deviceType, setDeviceType] = useState<DeviceType | null>(null);
  const [vendor, setVendor] = useState<VendorType | null>(null);

  const reset = () => {
    setStep('type');
    setDeviceType(null);
    setVendor(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // Server hanya tersedia di vendor Linux; sisanya tampilkan semua vendor
  const vendors = useMemo(() => {
    const all = Object.values(VENDOR_MAP);
    if (deviceType === 'server') {
      return all.filter((v) => v.id === 'linux');
    }
    return all;
  }, [deviceType]);

  const models = useMemo(() => {
    if (!vendor) return [];
    const all = getModelsForVendor(vendor);
    if (!deviceType) return all;
    const fitting = all.filter((m) => m.types.includes(deviceType));
    return fitting.length > 0 ? fitting : all;
  }, [vendor, deviceType]);

  const stepTitle = step === 'type' ? 'Pilih Jenis Perangkat' : step === 'vendor' ? 'Pilih Vendor' : 'Pilih Model';

  const pickModel = (vendorId: VendorType) => {
    const fitting = getModelsForVendor(vendorId).filter((m) => deviceType && m.types.includes(deviceType));
    return fitting[0]?.label || getDefaultModel(vendorId, deviceType || 'router');
  };

  return (
    <MobileSheet open={open} onClose={handleClose} title={stepTitle} height="h-[70dvh]">
      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-4">
        {(['type', 'vendor', 'model'] as Step[]).map((s, i) => (
          <div key={s} className="flex-1">
            <div
              className={`h-1 rounded-full transition ${
                step === s || (step === 'model' && s === 'vendor') || (step === 'vendor' && s === 'type')
                  ? 'bg-blue-500'
                  : 'bg-slate-800'
              }`}
            />
            <div className={`mt-1.5 text-[10px] font-medium ${step === s ? 'text-blue-400' : 'text-slate-500'}`}>
              {i + 1}. {s === 'type' ? 'Jenis' : s === 'vendor' ? 'Vendor' : 'Model'}
            </div>
          </div>
        ))}
      </div>

      {step === 'type' && (
        <div className="grid grid-cols-2 gap-3">
          {DEVICE_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setDeviceType(t.id);
                setStep('vendor');
              }}
              className={`flex flex-col items-center gap-2 p-4 rounded-2xl border bg-slate-900/60 hover:bg-slate-800 transition min-h-[92px] ${t.color}`}
            >
              <t.icon className="w-7 h-7" />
              <span className="text-xs font-semibold text-slate-100">{t.label}</span>
            </button>
          ))}
        </div>
      )}

      {step === 'vendor' && (
        <div className="space-y-0.5">
          <button
            onClick={() => setStep('type')}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white mb-2 transition"
          >
            <ChevronLeft className="w-4 h-4" /> Kembali
          </button>
          {vendors.map((v) => (
            <button
              key={v.id}
              onClick={() => {
                setVendor(v.id);
                setStep('model');
              }}
              className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl hover:bg-slate-800 transition border border-transparent hover:border-slate-700"
            >
              <span className="text-sm font-medium text-slate-100">{v.name}</span>
              <span className="text-[11px] text-slate-500">{v.osName}</span>
            </button>
          ))}
        </div>
      )}

      {step === 'model' && vendor && (
        <div className="space-y-0.5">
          <button
            onClick={() => setStep('vendor')}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white mb-2 transition"
          >
            <ChevronLeft className="w-4 h-4" /> Ganti Vendor
          </button>
          <div className="max-h-[30dvh] overflow-y-auto space-y-0.5 pr-1">
            {models.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  onAddNode(vendor, deviceType || 'router', m.label);
                  handleClose();
                }}
                className="w-full text-left px-4 py-3 rounded-xl hover:bg-slate-800 transition border border-transparent hover:border-slate-700"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-100">{m.label}</span>
                  <Boxes className="w-4 h-4 text-slate-500" />
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{m.description}</p>
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              onAddNode(vendor, deviceType || 'router', pickModel(vendor));
              handleClose();
            }}
            className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition"
          >
            <Plus className="w-4 h-4" /> Tambah dengan Default
          </button>
        </div>
      )}

      {step === 'model' && (
        <p className="mt-3 text-center text-[11px] text-slate-500 flex items-center justify-center gap-1">
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          {deviceType && VENDOR_MAP[vendor!]?.name} — {DEVICE_TYPES.find((t) => t.id === deviceType)?.label}
        </p>
      )}
    </MobileSheet>
  );
};