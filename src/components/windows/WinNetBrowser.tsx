import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Home, Lock, RefreshCw, Search } from 'lucide-react';
import type { WinHostProps } from './types';
import { htmlTitle, parseHtml, renderHtml } from '../../modules/windows/safeHtml';

interface PageState {
  url: string;
  kind: 'ok' | 'error' | 'loading';
  title: string;
  html: string;
  error?: string;
  resolvedIp?: string;
  viaDns?: boolean;
}

const HOME_URL = 'netlab://home';

export const WinNetBrowser: React.FC<WinHostProps> = ({ nodeId, nodeName, sim }) => {
  const [history, setHistory] = useState<PageState[]>([
    { url: HOME_URL, kind: 'loading', title: 'NetBrowser', html: '' },
  ]);
  const [cursor, setCursor] = useState(0);
  const [address, setAddress] = useState(HOME_URL);
  const [seq, setSeq] = useState(0);
  const abortSeq = useRef(0);

  const current = history[cursor];

  const pushPage = (page: PageState) => {
    setHistory((prev) => [...prev.slice(0, cursor + 1), page]);
    setCursor((c) => c + 1);
    setAddress(page.url);
  };

  const navigate = (rawUrl: string) => {
    if (!rawUrl || rawUrl === HOME_URL) {
      pushPage({ url: HOME_URL, kind: 'loading', title: 'NetBrowser', html: '' });
      setSeq((s) => s + 1);
      return;
    }
    const url = normalizeUrl(rawUrl);
    setAddress(url);
    setSeq((s) => s + 1);
    pushPage({ url, kind: 'loading', title: 'Memuat…', html: '' });
  };

  // Navigasi asinkron via ENGINE (resolveHostname → simulateTcpConnect).
  useEffect(() => {
    if (current.kind !== 'loading' && !(current.url === HOME_URL && current.html === '')) return;
    const mySeq = ++abortSeq.current;
    const url = current.url;

    if (url === HOME_URL) {
      const home = buildHome();
      setHistory((prev) => {
        const next = prev.map((p, i) => (i === cursor ? { url, kind: 'ok' as const, title: 'NetBrowser — Beranda', html: home } : p));
        return next;
      });
      return;
    }

    const parsed = parseUrl(url);
    if (!parsed) {
      setHistory((prev) => prev.map((p, i) => (i === cursor ? { ...p, kind: 'error', title: 'URL tidak valid', error: `URL tidak dikenali: ${url}` } : p)));
      return;
    }

    let ip: string | null = null;
    let viaDns = false;
    if (isIp(parsed.host)) {
      ip = parsed.host;
    } else {
      const res = sim.resolveHostname(nodeId, parsed.host);
      if (res.resolved) {
        ip = String(res.resolved);
        viaDns = true;
      } else if (res.nxdomain) {
        finishError(mySeq, url, `Host ${parsed.host} tidak ditemukan (NXDOMAIN) — pastikan catatan DNS ada & server DNS dikonfigurasi.`);
        return;
      } else {
        finishError(mySeq, url, `Tidak ada server DNS yang merespons untuk ${parsed.host}. Konfigurasi DNS di Network Settings.`);
        return;
      }
    }

    const conn = sim.simulateTcpConnect(nodeId, ip, parsed.port);
    if (conn.ok) {
      const body = conn.body || '<html><body><h1>Halaman kosong</h1></body></html>';
      setHistory((prev) =>
        prev.map((p, i) =>
          i === cursor
            ? {
                ...p,
                kind: 'ok',
                title: htmlTitle(body) ?? `HTTP 200 — ${parsed.host}`,
                html: body,
                resolvedIp: ip,
                viaDns,
              }
            : p
        )
      );
    } else {
      finishError(mySeq, url, mapConnError(conn.reason, parsed));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);

  const finishError = (mySeq: number, url: string, error: string) => {
    if (mySeq !== abortSeq.current) return;
    setHistory((prev) => prev.map((p, i) => (i === cursor ? { ...p, kind: 'error', title: 'Halaman tidak dapat ditampilkan', error } : p)));
  };

  const go = (delta: number) => {
    const next = Math.max(0, Math.min(history.length - 1, cursor + delta));
    if (next === cursor) return;
    setCursor(next);
    setAddress(history[next].url);
  };

  const onLink = (href: string) => {
    const base = current.url === HOME_URL ? 'http://localhost/' : current.url;
    navigate(resolveHref(base, href));
  };

  const back = () => go(-1);
  const fwd = () => go(1);

  const page: PageState = current;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-slate-800 border-b border-slate-700">
        <button onClick={back} disabled={cursor === 0} className="p-1 rounded hover:bg-slate-700 disabled:opacity-30 text-slate-300" title="Kembali">
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <button onClick={fwd} disabled={cursor >= history.length - 1} className="p-1 rounded hover:bg-slate-700 disabled:opacity-30 text-slate-300" title="Maju">
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => navigate(HOME_URL)}
          className="p-1 rounded hover:bg-slate-700 text-slate-300"
          title="Beranda"
        >
          <Home className="w-3.5 h-3.5" />
        </button>
        <div className="flex items-center flex-1 mx-1 bg-slate-900 border border-slate-700 rounded px-2 py-0.5">
          <Lock className="w-3 h-3 text-emerald-400 mr-1.5" />
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') navigate(address);
            }}
            className="flex-1 bg-transparent outline-none text-[11px] font-mono text-slate-200"
            spellCheck={false}
          />
          <Search className="w-3 h-3 text-slate-500" />
        </div>
        <button
          onClick={() => navigate(address)}
          className="flex items-center gap-1 px-2 py-0.5 rounded bg-sky-700 hover:bg-sky-600 text-white text-[10px]"
        >
          <RefreshCw className="w-3 h-3" /> Buka
        </button>
      </div>

      {/* Konten */}
      <div className="flex-1 overflow-auto bg-[#f4f6f8]">
        {page.kind === 'loading' && (
          <div className="flex items-center justify-center h-full text-slate-600 text-xs">
            <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Menghubungi server melalui mesin simulasi…
          </div>
        )}
        {page.kind === 'error' && (
          <div className="p-8 max-w-xl mx-auto">
            <div className="bg-white border border-slate-300 rounded-lg shadow-sm p-6">
              <div className="text-2xl font-bold text-slate-800">Halaman tidak dapat ditampilkan</div>
              <div className="mt-2 text-slate-600 text-xs">{page.error}</div>
              <div className="mt-4 text-[10px] text-slate-400 font-mono">{page.url}</div>
            </div>
          </div>
        )}
        {page.kind === 'ok' && page.url === HOME_URL && (
          <div className="p-8">
            <div className="max-w-2xl mx-auto bg-white border border-slate-300 rounded-lg shadow-sm p-6 text-slate-700">
              <div className="flex items-center gap-2">
                <Search className="w-6 h-6 text-sky-600" />
                <span className="text-xl font-semibold">NetBrowser</span>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Browser ini berjalan 100% lewat mesin simulasi: DNS di-resolve lewat
                <code className="bg-slate-100 px-1">resolveHostname</code>, halaman diambil lewat
                handshake TCP (SYN → SYN-ACK → ACK) dengan <code className="bg-slate-100 px-1">simulateTcpConnect</code>.
                Tanpa fetch, tanpa iframe, tanpa eval.
              </p>
              <div className="mt-4 grid gap-2">
                <Hint label="Contoh alamat yang dapat dibuka (sesuaikan topologi):" value="http://10.0.0.5/" />
                <Hint label="Lewat nama host (butuh DNS record + server DNS):" value="http://www.perusahaan.local/" />
                <Hint label="Situs web dibuat & di-hosting di:" value="Website Editor (Windows Client)" />
              </div>
            </div>
          </div>
        )}
        {page.kind === 'ok' && page.url !== HOME_URL && (
          <div className="win-page">{renderHtml(parseHtml(page.html), { onLinkClick: onLink })}</div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-3 px-2 py-0.5 bg-slate-800 border-t border-slate-700 text-[9px] text-slate-400 font-mono">
        <span>
          {page.kind === 'ok' && page.url !== HOME_URL ? `HTTP 200 — ${page.resolvedIp ?? '?'}${page.viaDns ? ' (via DNS)' : ''}` : page.kind === 'error' ? 'GAGAL' : 'idle'}
        </span>
        <span className="flex-1" />
        <span>{nodeName} • TCP/80</span>
      </div>
    </div>
  );
};

const Hint: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="border border-slate-200 rounded p-2 bg-slate-50">
    <div className="text-[10px] text-slate-400">{label}</div>
    <div className="text-xs font-mono text-sky-700">{value}</div>
  </div>
);

function buildHome(): string {
  return '<html><head><title>NetBrowser</title></head><body><h1>Selamat datang di NetBrowser</h1><p>Browser yang jujur terhadap mesin simulasi.</p></body></html>';
}

function normalizeUrl(raw: string): string {
  let u = raw.trim();
  if (u === 'localhost' || u === '') return HOME_URL;
  if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
  return u;
}

function parseUrl(url: string): { host: string; port: number; path: string } | null {
  const m = url.match(/^https?:\/\/([^/:]+)(?::(\d+))?(\/.*)?$/i);
  if (!m || !m[1]) return null;
  const port = m[2] ? Number(m[2]) : 80;
  if (Number.isNaN(port) || port < 1 || port > 65535) return null;
  return { host: m[1], port, path: m[3] ?? '/' };
}

function isIp(s: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(s);
}

function resolveHref(base: string, href: string): string {
  try {
    const b = base === HOME_URL ? 'http://localhost/' : base;
    return normalizeUrl(new URL(href, b).toString());
  } catch {
    return normalizeUrl(href);
  }
}

function mapConnError(reason: string | undefined, parsed: { host: string; port: number }): string {
  switch (reason) {
    case 'refused':
      return `Koneksi ke ${parsed.host}:${parsed.port} ditolak — tidak ada situs web yang aktif di port tersebut. Gunakan Website Editor untuk menghosting situs.`;
    case 'ttl':
      return `Waktu habis (TTL exceeded) menuju ${parsed.host} — periksa rute.`;
    case 'no-ip':
      return `${parsed.host} tidak punya alamat IP terkonfigurasi.`;
    case 'self':
      return 'Tujuan sama dengan perangkat ini.';
    case 'blocked':
      return 'Paket diblokir firewall.';
    case 'power':
      return 'Server mati (powered off).';
    default:
      return `Tidak dapat terhubung ke ${parsed.host}:${parsed.port} (${reason ?? 'unknown'}) — periksa jaringan.`;
  }
}