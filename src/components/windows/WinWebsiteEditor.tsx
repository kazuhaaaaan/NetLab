import React, { useMemo, useState } from 'react';
import { Globe, Plus, Save, Trash2 } from 'lucide-react';
import type { WinHostProps } from './types';
import { activeWebsite, winSetWebsites, winWebsitesOf, type WinWebsite } from '../../modules/windows/winMemory';

const DEFAULT_HTML = `<html>
<head><title>Perusahaan NetLab</title></head>
<body>
<h1>Selamat datang di situs kami</h1>
<p>Halaman ini di-hosting oleh <b>Windows Client</b> dan disajikan lewat <i>mesin simulasi</i> NetLab.</p>
<ul>
  <li>Ketik URL di NetBrowser perangkat lain</li>
  <li>Paket benar-benar lewat: DNS → rute → ARP → TCP → HTTP</li>
</ul>
<p>Kunjungi <a href="http://10.0.0.1/">halaman router</a> (pastikan IP sesuai).</p>
</body>
</html>`;

/** Website Editor — situs yang di-hosting perangkat ini, disajikan engine. */
export const WinWebsiteEditor: React.FC<WinHostProps> = ({ nodeId, sim, getMem, onChanged }) => {
  const mem = useMemo(() => getMem(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const websites = winWebsitesOf(mem);
  const [editing, setEditing] = useState<WinWebsite | null>(null);
  const [hostname, setHostname] = useState('');
  const [port, setPort] = useState('80');
  const [content, setContent] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);

  const stats = sim.getDeviceStats(nodeId);
  const selfIp = stats?.interfaces[0]?.ip ?? null;

  const beginNew = () => {
    setEditing({ hostname: '', port: 80, content: DEFAULT_HTML, enabled: true });
    setHostname('');
    setPort('80');
    setContent(DEFAULT_HTML);
    setEnabled(true);
    setFlash(null);
  };

  const beginEdit = (w: WinWebsite) => {
    setEditing(w);
    setHostname(w.hostname);
    setPort(String(w.port));
    setContent(w.content);
    setEnabled(w.enabled);
    setFlash(null);
  };

  const save = () => {
    const p = Number(port);
    if (Number.isNaN(p) || p < 1 || p > 65535) {
      setFlash('Port tidak valid (1–65535).');
      return;
    }
    const cleanHost = hostname.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
    const next: WinWebsite = { hostname: cleanHost, port: p, content, enabled };
    const rest = websites.filter((w) => w !== editing);
    const list = [...rest, next];
    winSetWebsites(mem, list);
    syncEngine(mem, list, selfIp);
    onChanged();
    setEditing(null);
    setFlash('Situs disimpan & disinkronkan ke engine.');
  };

  const remove = (w: WinWebsite) => {
    const list = websites.filter((x) => x !== w);
    winSetWebsites(mem, list);
    syncEngine(mem, list, selfIp);
    onChanged();
  };

  const active = activeWebsite(websites);

  return (
    <div className="flex flex-col h-full text-[12px]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
        <div className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5 text-sky-400" /> IIS Manager — {websites.length} situs
        </div>
        <button onClick={beginNew} className="flex items-center gap-1 px-2 py-1 rounded bg-sky-700 hover:bg-sky-600 text-white text-[10px]">
          <Plus className="w-3 h-3" /> Situs Baru
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {websites.length === 0 && (
          <div className="text-slate-500 text-[11px] border border-dashed border-slate-700 rounded p-4">
            Belum ada situs web. Klik "Situs Baru" untuk menghosting halaman pertama — halaman ini
            akan disajikan lewat mesin simulasi (bukan server sungguhan).
          </div>
        )}
        {websites.map((w) => (
          <div key={w.hostname || `port-${w.port}`} className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded p-2">
            <div className={`w-2 h-2 rounded-full ${w.enabled ? 'bg-emerald-400' : 'bg-slate-600'}`} />
            <button className="flex-1 text-left" onClick={() => beginEdit(w)}>
              <div className="text-slate-200 text-[11px] font-mono">
                {w.hostname || `port ${w.port}`}
                {w.hostname && <span className="text-slate-500"> → {selfIp ?? 'IP belum ada'}</span>}
              </div>
              <div className="text-[9px] text-slate-500">port {w.port} • {w.enabled ? 'aktif' : 'nonaktif'} • {w.content.length} char</div>
            </button>
            <button onClick={() => remove(w)} className="p-1 rounded hover:bg-rose-900/40 text-rose-400" title="Hapus situs">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        {editing && (
          <div className="border border-sky-800 bg-slate-900 rounded p-3 space-y-2">
            <div className="text-[11px] font-semibold text-sky-300">Edit situs</div>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wide text-slate-500">Nama host (DNS A-record otomatis, kosongkan = akses via IP)</span>
              <input
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="www.perusahaan.local"
                className="w-full mt-0.5 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[11px] font-mono text-slate-200 focus:border-sky-600 outline-none"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wide text-slate-500">Port HTTP</span>
              <input
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="w-24 mt-0.5 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[11px] font-mono text-slate-200 focus:border-sky-600 outline-none"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wide text-slate-500">Konten HTML</span>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={12}
                spellCheck={false}
                className="w-full mt-0.5 bg-slate-950 border border-slate-700 rounded p-2 text-[11px] font-mono text-slate-200 focus:border-sky-600 outline-none resize-none"
              />
            </label>
            <label className="flex items-center gap-2 text-[11px] text-slate-300">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              Situs aktif (melayani koneksi TCP ke port {port || '80'})
            </label>
            <div className="flex items-center gap-2">
              <button onClick={save} className="flex items-center gap-1 px-3 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[11px]">
                <Save className="w-3 h-3" /> Simpan
              </button>
              <button onClick={() => setEditing(null)} className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]">
                Batal
              </button>
            </div>
          </div>
        )}

        {flash && (
          <div className={`text-[11px] rounded p-2 border ${flash.includes('tidak valid') ? 'bg-rose-950/40 border-rose-800 text-rose-300' : 'bg-emerald-950/40 border-emerald-800 text-emerald-300'}`}>
            {flash}
          </div>
        )}

        {active && (
          <div className="text-[10px] text-slate-500 border-t border-slate-800 pt-2">
            Mesin hanya melayani <b>satu</b> situs aktif per perangkat (port + konten — seperti
            webServer tunggal). Situs aktif saat ini: {active.hostname || `port ${active.port}`}.
            {active.hostname && (
              <>
                {' '}Catatan DNS <code className="bg-slate-800 px-1">{active.hostname} → {selfIp ?? '?'}</code>{' '}
                terpasang di perangkat ini — dari klien lain, set server DNS ke {selfIp ?? 'IP perangkat ini'}.
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

function syncEngine(mem: ReturnType<WinHostProps['getMem']>, list: WinWebsite[], selfIp: string | null): void {
  const active = activeWebsite(list);
  mem.webServer = active
    ? { enabled: active.enabled, port: active.port, content: active.content }
    : { enabled: false, port: 80, content: '' };
  const dnsRecords = (mem.dnsRecords ?? [])
    .filter((r) => !list.some((w) => w.hostname && w.hostname.toLowerCase() === r.name.toLowerCase()))
    .concat(
      list
        .filter((w) => w.hostname && w.enabled && selfIp)
        .map((w) => ({ name: w.hostname, address: selfIp as string }))
    );
  mem.dnsRecords = dnsRecords;
}