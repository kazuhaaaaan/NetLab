import React from 'react';
import { X, ShieldCheck, Table2 } from 'lucide-react';
import {
  VENDOR_CAPABILITIES,
  CAPABILITY_LABELS,
  getVendorCapabilities,
} from '../../packages/vendors/src/capabilities';
import type { CapabilityKey, CapabilityStatus } from '../../packages/vendors/src/capabilities';

interface VendorCapabilitiesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Label & warna status dukungan fitur (jujur — parser-only ≠ supported). */
const STATUS_META: Record<CapabilityStatus, { label: string; cls: string; dot: string }> = {
  supported: {
    label: 'Supported',
    cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    dot: 'bg-emerald-400',
  },
  partial: {
    label: 'Partial',
    cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    dot: 'bg-amber-400',
  },
  'parser-only': {
    label: 'Parser Only',
    cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    dot: 'bg-sky-400',
  },
  'not-supported': {
    label: 'Not Supported',
    cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    dot: 'bg-rose-400',
  },
};

const CAP_ORDER: CapabilityKey[] = [
  'ipv4',
  'ipv6',
  'staticRoute',
  'vlan',
  'dhcp',
  'nat',
  'ospf',
  'bgp',
  'vrrp',
  'firewall',
  'dns',
  'commit',
];

const VENDOR_ORDER = ['mikrotik', 'cisco_ios', 'cisco_nxos', 'juniper', 'huawei', 'ubiquiti', 'vyos', 'fortinet', 'aruba', 'openwrt', 'linux', 'windows'];

const VENDOR_NAMES: Record<string, string> = {
  mikrotik: 'MikroTik RouterOS',
  cisco_ios: 'Cisco IOS',
  cisco_nxos: 'Cisco NX-OS',
  juniper: 'Juniper Junos',
  huawei: 'Huawei VRP',
  ubiquiti: 'Ubiquiti EdgeOS',
  vyos: 'VyOS',
  fortinet: 'Fortinet FortiOS',
  aruba: 'Aruba AOS-CX',
  openwrt: 'OpenWrt (UCI)',
  linux: 'Linux / Debian',
};

export const VendorCapabilitiesModal: React.FC<VendorCapabilitiesModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl p-4 sm:p-6 shadow-2xl text-slate-100 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
              <Table2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Kemampuan Vendor</h2>
              <p className="text-xs text-slate-400">
                Status dukungan fitur per vendor — berdasarkan tes otomatis, bukan klaim parser
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg" aria-label="Tutup">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-2 py-3 flex-shrink-0">
          {(Object.keys(STATUS_META) as CapabilityStatus[]).map((s) => (
            <span key={s} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-semibold ${STATUS_META[s].cls}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_META[s].dot}`} />
              {STATUS_META[s].label}
            </span>
          ))}
          <span className="text-[10px] text-slate-500 ml-auto hidden sm:inline">
            Status diverifikasi oleh tests/unit/vendorInterop.test.mts
          </span>
        </div>

        {/* Table */}
        <div className="overflow-auto rounded-xl border border-slate-800 flex-1 min-h-0">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-950">
              <tr>
                <th className="px-3 py-2 font-semibold text-slate-300 border-b border-slate-800 whitespace-nowrap">Vendor</th>
                {CAP_ORDER.map((c) => (
                  <th key={c} className="px-1.5 py-2 font-semibold text-slate-400 border-b border-slate-800 text-center whitespace-nowrap" title={CAPABILITY_LABELS[c]}>
                    {CAPABILITY_LABELS[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {VENDOR_ORDER.map((vid) => {
                const reg = getVendorCapabilities(vid);
                if (!reg) return null;
                return (
                  <tr key={vid} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                    <td className="px-3 py-1.5 font-semibold text-slate-200 whitespace-nowrap">
                      {VENDOR_NAMES[vid] || vid}
                    </td>
                    {CAP_ORDER.map((c) => {
                      const st = reg.caps[c];
                      const meta = STATUS_META[st];
                      return (
                        <td key={c} className="px-1.5 py-1.5 text-center">
                          <span
                            title={meta.label}
                            className={`inline-flex w-2.5 h-2.5 rounded-full ${meta.dot} ${
                              st === 'not-supported' ? 'opacity-60' : ''
                            }`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Notes */}
        <div className="pt-3 space-y-1 overflow-y-auto max-h-40 flex-shrink-0">
          {VENDOR_ORDER.map((vid) => {
            const reg = getVendorCapabilities(vid);
            if (!reg) return null;
            const hasNonFull = Object.values(reg.caps).some((s) => s !== 'supported');
            if (!hasNonFull || !reg.notes) return null;
            return (
              <p key={vid} className="text-[11px] text-slate-400 leading-relaxed">
                <span className="font-semibold text-slate-300">{VENDOR_NAMES[vid] || vid}:</span> {reg.notes}
              </p>
            );
          })}
          <p className="text-[11px] text-slate-500 leading-relaxed pt-1 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            "Supported" hanya diberikan bila: sintaks benar, state memengaruhi engine, dan ≥1 tes otomatis lulus.
            Fitur yang tidak didukung tidak pernah mengembalikan sukses palsu.
          </p>
        </div>
      </div>
    </div>
  );
};
