import React, { useMemo, useState } from 'react';
import { RefreshCw, Save, Wifi } from 'lucide-react';
import type { WinHostProps } from './types';
import { winSetWebsites, winWebsitesOf } from '../../modules/windows/winMemory';
import { activeWebsite } from '../../modules/windows/winMemory';

/** Network Settings — DHCP & static lewat ENGINE (sumber kebenaran). */
export const WinNetworkSettings: React.FC<WinHostProps> = ({ nodeId, nodeName, sim, getMem, onChanged }) => {
  const mem = useMemo(() => getMem(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [tab, setTab] = useState<'status' | 'settings'>('status');
  const [mode, setMode] = useState<'dhcp' | 'static'>('dhcp');
  const [ip, setIp] = useState('');
  const [prefix, setPrefix] = useState('24');
  const [gateway, setGateway] = useState('');
  const [dns, setDns] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const stats = sim.getDeviceStats(nodeId);
  const iface = stats?.interfaces[0];

  const currentIp = iface?.ip ?? null;
  const routes = stats?.routes ?? [];
  const defaultRoute = routes.find((r) => r.dst === '0.0.0.0/0' || r.dst === '0.0.0.0');
  // Satu sumber kebenaran: engine dulu (DHCP option 6 / static), memory sebagai cermin.
  const dnsServers = (sim.getDevice(nodeId)?.dnsServers ?? mem.dnsServers ?? []);

  const doDhcp = () => {
    setBusy(true);
    setFlash(null);
    // DHCP lewat engine: lease di-grant lewat jalur yang sama dengan CLI
    // (dhcpClientGrant) — server DHCP menentukan IP/gateway/DNS.
    const lease = sim.grantDhcpLease(nodeId, iface?.name ?? 'eth0');
    if (lease) {
      // DNS option 6 dari server DHCP → memory Windows (satu sumber kebenaran:
      // engine memberi, memory mencerminkan, sync berikutnya tidak menimpa).
      if (lease.dnsServers && lease.dnsServers.length > 0) {
        mem.dnsServers = [...lease.dnsServers];
        sim.setDnsServers(nodeId, mem.dnsServers);
      }
      setFlash(`DHCP berhasil: IP ${lease.ip}/${lease.prefix}, gateway ${lease.gateway}${lease.dnsServers?.length ? `, DNS ${lease.dnsServers.join(', ')}` : ''}`);
    } else {
      setFlash('DHCP gagal — tidak ada server DHCP yang merespons di segmen ini.');
    }
    onChanged();
    setBusy(false);
  };

  const applyStatic = () => {
    setBusy(true);
    setFlash(null);
    const cleanIp = ip.trim();
    if (!cleanIp || !/^\d+\.\d+\.\d+\.\d+$/.test(cleanIp) || !/^\d{1,2}$/.test(prefix)) {
      setFlash('Alamat IP / prefiks tidak valid.');
      setBusy(false);
      return;
    }
    const cidr = `${cleanIp}/${prefix}`;
    // 1. Engine dulu (sumber kebenaran) — applyNodeConfig = jalur CLI yang sama.
    sim.applyNodeConfig(
      nodeId,
      { [iface?.name ?? 'eth0']: cidr },
      gateway ? [{ dst: '0.0.0.0/0', gateway }] : []
    );
    // 2. Memory vendor supaya persisten (syncNodeToEngine akan menegakkan kembali).
    mem.configuredIps = { ...mem.configuredIps, [iface?.name ?? 'eth0']: cidr };
    mem.routes = gateway
      ? [...mem.routes.filter((r) => r.dst !== '0.0.0.0/0' && r.dst !== '0.0.0.0'), { dst: '0.0.0.0/0', gateway, iface: iface?.name ?? 'eth0', kind: 'static' }]
      : mem.routes.filter((r) => r.dst !== '0.0.0.0/0' && r.dst !== '0.0.0.0');
    mem.dnsServers = dns
      .split(/[,\s]+/)
      .filter((s) => /^\d+\.\d+\.\d+\.\d+$/.test(s));
    sim.setDnsServers(nodeId, mem.dnsServers);
    onChanged();
    setFlash('Konfigurasi statis disimpan & disinkronkan ke engine.');
    setBusy(false);
  };

  const websites = winWebsitesOf(mem);
  const site = activeWebsite(websites);

  return (
    <div className="flex flex-col h-full text-[12px]">
      <div className="flex gap-1 px-3 pt-2 border-b border-slate-700">
        {(['status', 'settings'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1 rounded-t text-[11px] font-medium ${
              tab === t ? 'bg-slate-800 text-sky-300 border border-b-0 border-slate-700' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t === 'status' ? 'Status Jaringan' : 'Pengaturan'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {tab === 'status' ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <InfoRow label="Nama komputer" value={nodeName} />
              <InfoRow label="Status" value={iface ? (iface.operational === 'up' ? 'Terhubung' : 'Terputus') : '—'} />
              <InfoRow label="Alamat IPv4" value={currentIp ?? '(belum ada — gunakan Pengaturan)'} />
              <InfoRow label="MAC Address" value={iface?.mac ?? '—'} />
              <InfoRow label="Default Gateway" value={defaultRoute?.gateway ?? '(tidak ada)'} />
              <InfoRow label="Server DNS" value={dnsServers.join(', ') || '(tidak ada)'} />
            </div>
            <div className="text-[10px] text-slate-500">
              Data di atas dibaca langsung dari mesin simulasi (NetworkSimulator) — jalur
              paket nyata dipakai ping/browser/curl.
            </div>
            {site && (
              <div className="border border-sky-800 bg-sky-950/40 rounded p-2">
                <div className="text-sky-300 font-semibold flex items-center gap-1">
                  <Wifi className="w-3 h-3" /> Situs web aktif
                </div>
                <div className="text-slate-300 mt-1">
                  {site.hostname ? (
                    <>
                      {site.hostname} (port {site.port}) — dari perangkat lain gunakan
                      server DNS <span className="text-sky-300">{currentIp ?? '(isi IP dulu)'}</span>
                    </>
                  ) : (
                    `Port ${site.port} — akses via alamat IP ${currentIp ?? '(isi IP dulu)'}`
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex gap-2">
              <button
                onClick={() => setMode('dhcp')}
                className={`px-3 py-1.5 rounded border text-[11px] ${mode === 'dhcp' ? 'bg-sky-700 border-sky-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'}`}
              >
                DHCP (Otomatis)
              </button>
              <button
                onClick={() => setMode('static')}
                className={`px-3 py-1.5 rounded border text-[11px] ${mode === 'static' ? 'bg-sky-700 border-sky-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'}`}
              >
                Static (Manual)
              </button>
            </div>

            {mode === 'dhcp' ? (
              <div className="space-y-2">
                <p className="text-slate-400">
                  Alamat IP, subnet, dan gateway diperoleh dari server DHCP di jaringan lewat mesin
                  simulasi. Jika tidak ada server DHCP di segmen broadcast, permintaan gagal secara
                  jujur.
                </p>
                <button
                  onClick={doDhcp}
                  disabled={busy}
                  className="flex items-center gap-2 px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-600 text-white text-[11px] disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${busy ? 'animate-spin' : ''}`} /> Dapatkan IP Otomatis
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Alamat IP" value={ip} onChange={setIp} placeholder="10.0.0.10" />
                  <Field label="Prefiks" value={prefix} onChange={setPrefix} placeholder="24" />
                </div>
                <Field label="Default Gateway" value={gateway} onChange={setGateway} placeholder="10.0.0.1" />
                <Field label="Server DNS (pisah koma)" value={dns} onChange={setDns} placeholder="10.0.0.1" />
                <button
                  onClick={applyStatic}
                  disabled={busy}
                  className="flex items-center gap-2 px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] disabled:opacity-50"
                >
                  <Save className="w-3 h-3" /> Simpan & Terapkan
                </button>
              </div>
            )}

            {flash && (
              <div className={`text-[11px] rounded p-2 border ${flash.includes('gagal') || flash.includes('tidak valid') ? 'bg-rose-950/40 border-rose-800 text-rose-300' : 'bg-emerald-950/40 border-emerald-800 text-emerald-300'}`}>
                {flash}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-slate-900 border border-slate-700 rounded p-2">
    <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    <div className="text-slate-200 font-mono text-[11px] break-all">{value}</div>
  </div>
);

const Field: React.FC<{ label: string; value: string; onChange: (v: string) => void; placeholder?: string }> = ({
  label,
  value,
  onChange,
  placeholder,
}) => (
  <label className="block">
    <span className="text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full mt-0.5 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] font-mono text-slate-200 focus:border-sky-600 outline-none"
    />
  </label>
);