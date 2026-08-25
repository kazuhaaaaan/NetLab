// Chain commands vendor windows — output ala Windows CLI.
// GUI desktop (WinDesktopModal) menangani Network Settings, NetBrowser,
// Website Editor, File Explorer & Notepad; CLI ini menyediakan subset
// perintah standar dengan jalur engine yang SAMA (pingSimulator,
// connectivitySimulator, dnsResolver dari VendorContext).
import type { CommandResult, ChainEntry, NodeMemory } from '../common/types';
import { registerEntries } from '../common/chain';
import { isValidIpv4, isContiguousMask, maskToBits } from '../common/ip';

const filesOf = (mem: NodeMemory): Array<{ name: string; content: string }> =>
  Array.isArray(mem.files) ? (mem.files as Array<{ name: string; content: string }>) : [];

const WIN = 'windows';

/** Validasi & normalisasi spesifikasi route Windows.
 *  Real `route add` memakai bentuk `<dst> [mask <mask>] <gw>` — dst dengan
 *  `/prefix` (gaya Unix) BUKAN sintaks Windows → ditolak seperti perangkat
 *  nyata ("The route specification provided is invalid."). */
function parseRouteSpec(dst: string, mask: string | undefined, gw: string): { dst: string; gateway: string; distance: number } | string {
  if (dst.includes('/')) return 'The route specification provided is invalid.';
  if (!isValidIpv4(dst)) return `The parameter is incorrect: ${dst}`;
  if (!isValidIpv4(gw)) return `The parameter is incorrect: ${gw}`;
  const m = mask || '255.255.255.255';
  if (!isValidIpv4(m)) return `The parameter is incorrect: ${m}`;
  if (!isContiguousMask(m)) return 'The mask address is invalid or not contiguous.';
  const bits = maskToBits(m);
  // dst harus alamat network sesuai mask (Windows menormalkan host-bit).
  const ipParts = dst.split('.').map(Number);
  const maskParts = m.split('.').map(Number);
  const net = ipParts.map((o, i) => o & maskParts[i]).join('.');
  return { dst: `${net}/${bits}`, gateway: gw, distance: 1 };
}

export const windowsEntries: ChainEntry[] = [
  {
    // netsh/route konfiguratif — order 5 sebelum handler umum w10 (order 10).
    name: 'w5',
    order: 5,
    vendors: 'all',
    match: ({ vendorId, rawInput }) =>
      vendorId === WIN &&
      /^(netsh\s+interface|route\s+(add|delete)\b)/i.test(rawInput.trim()),
    run: ({ rawInput, mem, context }) => {
      const input = rawInput.trim();
      let cmdResult: CommandResult | undefined;

      // Nama interface harus ada di perangkat (seperti netsh nyata).
      const ifaceExists = (name: string): boolean => {
        const ports = (context?.ports || []) as Array<Record<string, unknown>>;
        if (ports.length === 0) return true; // ctx tanpa port (unit test) → terima
        return ports.some((p) => String(p.name || '').toLowerCase() === name.toLowerCase());
      };
      const unknownIface = (name: string): CommandResult => ({
        raw: `The filename, directory name, or volume label syntax is incorrect. (interface "${name}" not found)`,
      });

      // ── netsh interface ipv4 set address ──────────────────────────────
      let m = input.match(/^netsh\s+interface\s+ipv4\s+set\s+address\s+name="?([^"]+?)"?\s+static\s+(\S+)\s+(\S+)(?:\s+(\S+))?(?:\s+\d+)?$/i);
      if (m) {
        const iface = m[1].trim();
        const ip = m[2];
        const mask = m[3];
        const gw = m[4];
        if (!ifaceExists(iface)) cmdResult = unknownIface(iface);
        else if (!isValidIpv4(ip)) cmdResult = { raw: `The parameter is incorrect: ${ip}` };
        else if (!isContiguousMask(mask) || !isValidIpv4(mask)) cmdResult = { raw: 'The mask address is invalid or not contiguous.' };
        else if (gw && !isValidIpv4(gw)) cmdResult = { raw: `The parameter is incorrect: ${gw}` };
        else {
          mem.configuredIps[iface] = `${ip}/${maskToBits(mask)}`;
          if (gw && !mem.routes.some((r) => r.dst === '0.0.0.0/0' && r.gateway === gw)) {
            mem.routes.push({ dst: '0.0.0.0/0', gateway: gw, distance: 1 });
          }
          cmdResult = { raw: '' };
        }
      }
      if (!cmdResult) {
        // netsh ... set address source=dhcp → klien DHCP pada interface tsb.
        m = input.match(/^netsh\s+interface\s+ipv4\s+set\s+address\s+name="?([^"]+?)"?\s+source=dhcp$/i);
        if (m) {
          const iface = m[1].trim();
          if (!mem.dhcpClients.some((c) => c.iface === iface)) {
            mem.dhcpClients.push({ iface, addDefaultRoute: true, status: 'searching' });
          }
          delete mem.configuredIps[iface];
          cmdResult = { raw: '' };
        }
      }

      // ── netsh interface ipv4 set dnsservers ───────────────────────────
      if (!cmdResult) {
        m = input.match(/^netsh\s+interface\s+ipv4\s+set\s+dnsservers\s+name="?([^"]+?)"?\s+static\s+(\S+)(?:\s+primary)?$/i);
        if (m) {
          const ip = m[2];
          if (!ifaceExists(m[1].trim())) cmdResult = unknownIface(m[1].trim());
          else if (!isValidIpv4(ip)) cmdResult = { raw: `The parameter is incorrect: ${ip}` };
          else {
            if (!mem.dnsServers.includes(ip)) mem.dnsServers.push(ip);
            cmdResult = { raw: '' };
          }
        }
      }
      if (!cmdResult) {
        m = input.match(/^netsh\s+interface\s+ipv4\s+set\s+dnsservers\s+name="?([^"]+?)"?\s+source=dhcp(?:\s+register=primary)?$/i);
        if (m) {
          mem.dnsServers.length = 0;
          cmdResult = { raw: '' };
        }
      }

      // ── route add [-p] <dst> [mask <mask>] <gw> [metric <n>] ──────────
      if (!cmdResult) {
        m = input.match(/^route\s+add\s+(?:-p\s+)?(\S+)(?:\s+mask\s+(\S+))?\s+(\S+)(?:\s+metric\s+\d+)?$/i);
        if (m) {
          const spec = parseRouteSpec(m[1], m[2], m[3]);
          if (typeof spec === 'string') cmdResult = { raw: spec };
          else {
            if (!mem.routes.some((r) => r.dst === spec.dst && r.gateway === spec.gateway)) {
              mem.routes.push(spec);
            }
            cmdResult = { raw: '' };
          }
        }
      }
      // ── route delete [-p] <dst> ───────────────────────────────────────
      if (!cmdResult) {
        m = input.match(/^route\s+delete\s+(?:-p\s+)?(\S+)$/i);
        if (m) {
          const target = m[1];
          if (target.includes('/')) cmdResult = { raw: 'The route specification provided is invalid.' };
          else if (!isValidIpv4(target)) cmdResult = { raw: `The parameter is incorrect: ${target}` };
          else {
            // Hapus rute dengan alamat tujuan yang cocok (bentuk Windows:
            // tanpa mask berarti host route /32 saat add, tapi delete cocokkan
            // alamat tujuan apa pun yang tersimpan).
            mem.routes = mem.routes.filter((r) => r.dst.split('/')[0] !== target);
            cmdResult = { raw: '' };
          }
        }
      }
      return cmdResult;
    },
  },
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
        const gw = mem.routes.find((r) => r.dst === '0.0.0.0/0')?.gateway;
        for (const p of ports) {
          const name = String(p.name || '');
          // IP otoritatif: hasil netsh/DHCP di memori CLI lebih baru daripada
          // ipAddress awal proyek (state canvas bisa basi setelah konfigurasi CLI).
          const memCidr = mem.configuredIps?.[name] || mem.configuredIps?.[String(p.id || '')];
          const shown = memCidr || (p.ipAddress ? String(p.ipAddress) : null);
          const ip = shown ? shown.split('/')[0] : null;
          const prefix = shown ? (shown.split('/')[1] || '24') : null;
          const mac = String(p.macAddress || '');
          const up = p.linkConnected !== false && p.linkDown !== true;
          rows.push(
            `Koneksi Ethernet Adapter ${name}:`,
            `   Status Media. . . . . . . : ${up ? 'Media tersambung' : 'Media terputus'}`,
            `   Alamat Fisik. . . . . . . : ${mac}`,
            ...(ip
              ? [
                  `   Alamat IPv4. . . . . . . . : ${ip}`,
                  `   Prefiks Subnet . . . . . . : /${prefix}`,
                  `   Default Gateway . . . . . : ${gw || '(tidak ada)'}`,
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
        const tokens = input.replace(/^ping\s+/i, '').split(/\s+/).filter((t) => t && !t.startsWith('-'));
        const host = tokens[tokens.length - 1] || '';
        const sizeM = input.match(/-l\s+(\d+)/i);
        const size = sizeM ? Math.min(65500, Math.max(1, parseInt(sizeM[1], 10))) : undefined;
        cmdResult = { raw: context?.pingSimulator ? context.pingSimulator(host, WIN, size) : `% Tidak dapat menemukan host ${host}. Periksa ejaan dan coba lagi.` };
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
        cmdResult = { type: 'http_get', host: target, port };
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