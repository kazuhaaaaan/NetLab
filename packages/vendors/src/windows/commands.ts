// Chain commands vendor windows — output ala Windows CLI.
// GUI desktop (WinDesktopModal) menangani Network Settings, NetBrowser,
// Website Editor, File Explorer & Notepad; CLI ini menyediakan subset
// perintah standar dengan jalur engine yang SAMA (pingSimulator,
// connectivitySimulator, dnsResolver dari VendorContext).
import type { CommandResult, ChainEntry, NodeMemory } from '../common/types';
import { registerEntries } from '../common/chain';

const filesOf = (mem: NodeMemory): Array<{ name: string; content: string }> =>
  Array.isArray(mem.files) ? (mem.files as Array<{ name: string; content: string }>) : [];

const WIN = 'windows';

export const windowsEntries: ChainEntry[] = [
  {
    // help khusus windows — order 0 agar menang atas generic b1 (order 1)
    // yang membungkus help dengan { type: 'help' } → output kosong.
    name: 'w9',
    order: 0,
    vendors: 'all',
    match: ({ vendorId, rawInput }) => vendorId === WIN && (/^help\b/i.test(rawInput.trim()) || rawInput.trim() === '?'),
    run: () => ({
      raw: [
        'Perintah yang tersedia:',
        '  ipconfig [/all]     Tampilkan konfigurasi IP (seperti Status Jaringan)',
        '  ping <host>         Uji konektivitas via engine',
        '  tracert <host>      Lacak rute paket via engine',
        '  nslookup <host>     Resolusi DNS via engine',
        '  curl <url>          Ambil halaman web via engine (jalur paket nyata)',
        '  arp -a              Tabel ARP perangkat (state engine)',
        '  route print         Tabel rute perangkat (state engine)',
        '  netstat             Koneksi TCP aktif (state engine)',
        '  hostname            Nama komputer',
        '  ver                 Versi Windows',
        '  systeminfo          Ringkasan sistem',
        '  dir                 Daftar file (My Documents)',
        '  type <file>         Isi file teks',
        '  cls                 Bersihkan layar',
        '  echo <teks>         Cetak teks',
      ].join('\r\n'),
    }),
  },
  {
    name: 'w10',
    order: 10,
    vendors: 'all',
    match: ({ vendorId }) => vendorId === WIN,
    run: ({ rawInput, context, mem, nodeId }) => {
      let cmdResult: CommandResult | undefined;
      const input = rawInput.trim();
      const action = (input.match(/^(\S+)/) || [])[1]?.toLowerCase() || '';

      if (action === 'help') {
        // Normalnya tidak pernah tercapai (entry w9 order 0 menang), dijaga
        // untuk ketahanan bila urutan chain berubah.
        cmdResult = { raw: 'Ketik: ipconfig, ping, tracert, nslookup, curl, arp -a, route print, netstat, hostname, ver, systeminfo, dir, type, cls, echo' };
      } else if (action === 'ipconfig') {
        const all = /\/all/i.test(input);
        const rows: string[] = [];
        const ports = (context?.ports || []) as Array<Record<string, unknown>>;
        for (const p of ports) {
          const name = String(p.name || '');
          const ip = p.ipAddress ? String(p.ipAddress).split('/')[0] : null;
          const prefix = p.ipAddress ? (String(p.ipAddress).split('/')[1] || '24') : null;
          const mac = String(p.macAddress || '');
          const up = p.linkConnected !== false && p.linkDown !== true;
          rows.push(
            `Koneksi Ethernet Adapter ${name}:`,
            `   Status Media. . . . . . . : ${up ? 'Media terputus' : 'Media terputus'}`,
            `   Alamat Fisik. . . . . . . : ${mac}`,
            ...(ip
              ? [
                  `   Alamat IPv4. . . . . . . . : ${ip}`,
                  `   Prefiks Subnet . . . . . . : /${prefix}`,
                  `   Default Gateway . . . . . : ${String(p.gateway || '(tidak ada)')}`,
                ]
              : [`   Alamat IPv4. . . . . . . . : (belum ada IP — atur via Network Settings atau DHCP)`]),
            ''
          );
        }
        cmdResult = {
          raw:
            (all ? 'Konfigurasi IP Windows\r\n\r\n' : '') + rows.join('\r\n') + `\r\nServer DNS. . . . . . . . . : ${(mem.dnsServers || []).join(', ') || '(tidak ada)'}`,
        };
      } else if (action === 'ping') {
        const host = input.replace(/^ping\s+/i, '').split(/\s+/)[0] || '';
        cmdResult = { raw: context?.pingSimulator ? context.pingSimulator(host, WIN) : `% Tidak dapat menemukan host ${host}. Periksa ejaan dan coba lagi.` };
      } else if (action === 'nslookup') {
        const host = input.replace(/^nslookup\s+/i, '').split(/\s+/)[0] || '';
        if (!context?.dnsResolver) cmdResult = { raw: '*** dns resolver tidak tersedia' };
        else {
          const res = context.dnsResolver(host);
          if (res && (res.resolved || res.server)) {
            cmdResult = { raw: `Server:  ${res.server || '(cache lokal)'}\r\nNama:    ${host}\r\nAlamat:  ${String(res.resolved || '')}` };
          } else if (res && res.nxdomain) {
            cmdResult = { raw: `*** ${host} tidak ditemukan (NXDOMAIN)` };
          } else {
            cmdResult = { raw: `*** Permintaan ke ${host} habis waktu (tidak ada server DNS)` };
          }
        }
      } else if (action === 'curl') {
        const url = input.replace(/^curl\s+/i, '').split(/\s+/)[0] || '';
        let target = url;
        let port: number | undefined;
        const m = url.match(/^https?:\/\/([^/:]+)(?::(\d+))?(?:\/.*)?$/i);
        if (m) {
          target = m[1];
          if (m[2]) port = Number(m[2]);
        }
        cmdResult = { raw: context?.connectivitySimulator ? context.connectivitySimulator(target, WIN, port) : `curl: tidak ada simulator` };
      } else if (action === 'arp') {
        // arp -a: tabel ARP nyata dari engine (state perangkat, bukan teks palsu).
        const entries = (context?.arpProvider ? context.arpProvider() : []) as Array<{ ip?: string; mac?: string }>;
        if (entries.length === 0) {
          cmdResult = { raw: 'Tidak ada entri ARP — lakukan ping/curl dulu agar tabel terisi (paket nyata).' };
        } else {
          const rows = entries.map((e) => `  ${String(e.ip || '-').padEnd(18)}${String(e.mac || '-').padEnd(22)}dynamic`);
          cmdResult = {
            raw: [
              'Interface: ' + (mem.configuredIps ? Object.values(mem.configuredIps)[0]?.split('/')[0] ?? '-' : '-'),
              '',
              '  Internet Address      Physical Address      Type',
              rows.join('\r\n'),
            ].join('\r\n'),
          };
        }
      } else if (action === 'route') {
        // route print: tabel rute nyata dari engine.
        const routes = (context?.routeProvider ? context.routeProvider() : []) as Array<{ dst?: string; gateway?: string; iface?: string; kind?: string }>;
        if (routes.length === 0) {
          cmdResult = { raw: 'Tidak ada rute aktif — konfigurasi IP/route dulu (Network Settings).' };
        } else {
          const rows = routes.map((r) => `  ${String(r.dst || '-').padEnd(16)}${String(r.gateway || '-').padEnd(14)}${String(r.iface || '-').padEnd(8)}${String(r.kind || '')}`);
          cmdResult = {
            raw: [
              'Route aktif:',
              '===========================================================================',
              '  Tujuan           Gateway          Interface  Sumber',
              rows.join('\r\n'),
              '===========================================================================',
            ].join('\r\n'),
          };
        }
      } else if (action === 'tracert' || action === 'traceroute') {
        const host = input.replace(/^(tracert|traceroute)\s+/i, '').split(/\s+/)[0] || '';
        cmdResult = { raw: context?.tracerouteSimulator ? context.tracerouteSimulator(host, WIN) : `% Tidak dapat menemukan host ${host}. Periksa ejaan dan coba lagi.` };
      } else if (action === 'netstat') {
        const conns = (context?.tcpProvider ? context.tcpProvider() : []) as Array<{ localIp?: string; localPort?: number; remoteIp?: string; remotePort?: number; state?: string; proto?: string }>;
        if (conns.length === 0) {
          cmdResult = { raw: 'Tidak ada koneksi TCP aktif.' };
        } else {
          const rows = conns.map((c) => {
            const local = `${c.localIp ?? '0.0.0.0'}:${c.localPort ?? 0}`;
            const remote = `${c.remoteIp ?? '0.0.0.0'}:${c.remotePort ?? 0}`;
            return `  ${String(c.proto ?? 'TCP').padEnd(6)}${local.padEnd(28)}${remote.padEnd(28)}${String(c.state ?? '')}`;
          });
          cmdResult = {
            raw: [
              'Koneksi Aktif',
              '',
              '  Proto  Alamat Lokal                  Alamat Asing                 Status',
              rows.join('\r\n'),
            ].join('\r\n'),
          };
        }
      } else if (action === 'hostname') {
        cmdResult = { raw: context?.name || mem.hostname || 'windows-client' };
      } else if (action === 'ver') {
        cmdResult = { raw: 'Microsoft Windows [Version 11.0.22631.3737]' };
      } else if (action === 'systeminfo') {
        cmdResult = { raw: `Nama Host:            ${context?.name || nodeId}\r\nVersi OS:             Windows 11 Pro\r\nTipe Sistem:          x64-based PC\r\nServer DNS:           ${(mem.dnsServers || []).join(', ') || '(tidak ada)'}` };
      } else if (action === 'dir' || action === 'ls') {
        const files = filesOf(mem);
        if (files.length === 0) {
          cmdResult = { raw: ' Volume di drive C tidak berlabel.\r\n Direktori C:\\Users\\admin\\Documents\r\n\r\nFile tidak ditemukan.' };
        } else {
          const rows = files.map((f) => {
            const size = (f.content || '').length;
            return ` ${size.toString().padStart(12)}  ${f.name}`;
          });
          cmdResult = { raw: ` Direktori C:\\Users\\admin\\Documents\r\n\r\n${rows.join('\r\n')}\r\n${' '.repeat(12)}${files.length} File` };
        }
      } else if (action === 'type' || action === 'cat') {
        const name = input.replace(/^(type|cat)\s+/i, '').trim().split(/[\\/]/).pop() || '';
        const file = filesOf(mem).find((f) => f.name.toLowerCase() === name.toLowerCase());
        cmdResult = { raw: file ? file.content || '(file kosong)' : `% Sistem tidak menemukan file ${name}.` };
      } else if (action === 'cls' || action === 'clear') {
        cmdResult = { raw: '' };
      } else if (action === 'echo') {
        cmdResult = { raw: input.replace(/^echo\s+/i, '') };
      }
      return cmdResult;
    },
  },
];

export function registerWindowsCommands(): void {
  registerEntries('windows', windowsEntries);
}

registerEntries('windows', windowsEntries);