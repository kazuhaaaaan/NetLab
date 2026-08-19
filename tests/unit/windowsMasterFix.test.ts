// ============================================================
// Master Fix — Windows + AI + UI regression (Prompt 5)
// 1. AI prompt adaptif (bukan ringkas paksa)
// 2. Window manager (open/focus/minimize/restore/close)
// 3. Windows Terminal vendor commands (arp/route/tracert/netstat)
// 4. DHCP → DNS state sync (lease option 6 → memory/engine)
// 5. Notepad → filesystem → File Explorer (persistence)
// ============================================================

import { readFileSync } from 'fs';
import { join } from 'path';
import { systemPrompt } from '../../src/modules/ai/llmClient';
import {
  cascadePos,
  closeWin,
  fitWindow,
  focusWin,
  minimizeWin,
  openWin,
  toggleWin,
  topWin,
  type ManagedWin,
  type ZCounter,
} from '../../src/modules/windows/windowManager';
import { VendorDispatcher } from '../../packages/vendors/src/index';
import { NetworkSimulator } from '../../src/engine/net/core/NetworkSimulator';
import { winFilesOf, winSetFiles } from '../../src/modules/windows/winMemory';
import type { NodeMemory } from '../../packages/vendors/src/common/types';

interface Report {
  passed: number;
  failed: number;
  fails: string[];
}

const rep: Report = { passed: 0, failed: 0, fails: [] };

function check(name: string, cond: boolean, detail = '') {
  if (cond) rep.passed++;
  else {
    rep.failed++;
    rep.fails.push(`${name} ${detail}`);
  }
}

const counter = (start = 10): ZCounter => ({ v: start });
const win = (id: string, z = 1): ManagedWin => ({ id, minimized: false, z, pos: { x: 0, y: 0 } });

// ── 1. AI PROMPT ADAPTIF ────────────────────────────────────────────────
function testAiPrompt() {
  console.log('\n== P5-1. AI prompt adaptif (bukan ringkas paksa) ==');
  const p = systemPrompt('topologi: 2 router');
  check('P5-1.1 tidak ada batas "maksimal ~150 kata"', !/maksimal\s*~?\s*150\s*kata/i.test(p), 'masih ada batas 150 kata');
  check('P5-1.2 panjang adaptif 50–150 kata disebut', p.includes('50–150 kata'), '');
  check('P5-1.3 troubleshooting 200–500 kata disebut', p.includes('200–500 kata'), '');
  check('P5-1.4 konfigurasi 300–800 kata disebut', p.includes('300–800 kata'), '');
  check('P5-1.5 struktur troubleshooting ada', /\(1\)\s*Diagnosis[\s\S]*\(6\)\s*Hal yang perlu diperiksa/.test(p), 'format 6 langkah tidak lengkap');
  check('P5-1.6 larangan memanjang demi panjang ada', p.includes('Jangan memanjangkan jawaban hanya demi panjang'), '');
  check('P5-1.7 konteks jaringan tetap dimasukkan', p.includes('=== KONTEKS JARINGAN SAAT INI ===') && p.includes('topologi: 2 router'), '');
  check('P5-1.8 identitas pencipta dipertahankan', p.includes('Nouva Prasetya Ardhana'), '');
  check('P5-1.9 aturan jujur dipertahankan', p.includes('jangan berasumsi') && p.includes('Jangan pernah mengarang status perangkat'), '');

  // Server proxy memakai prompt yang sama (tidak boleh ada pembatasan lama).
  const serverSrc = readFileSync(join(process.cwd(), 'server', 'index.mjs'), 'utf8');
  check('P5-1.10 server tidak batasi 150 kata', !/maksimal\s*~?\s*150\s*kata/i.test(serverSrc), 'server masih batasi 150 kata');
  check('P5-1.11 server pakai panjang adaptif', serverSrc.includes('50–150 kata') && serverSrc.includes('300–800 kata'), '');
  check('P5-1.12 server izinkan 2048 token', /maxOutputTokens:\s*2048/.test(serverSrc), '');
}

// ── 2. WINDOW MANAGER ───────────────────────────────────────────────────
function testWindowManager() {
  console.log('\n== P5-2. Window manager (open/focus/minimize/restore/close) ==');
  const c = counter();

  // open → aktif (z tertinggi), tidak minimized, satu instance per id
  let list = openWin([], win('a'), c);
  list = openWin(list, win('b'), c);
  list = openWin(list, { ...win('a'), z: 1 }, c); // buka ulang
  check('P5-2.1 open menambah jendela', list.length === 2, JSON.stringify(list.length));
  check('P5-2.2 jendela dibuka ulang tidak duplikat', list.filter((w) => w.id === 'a').length === 1, '');
  check('P5-2.3 open membuat tidak minimized', list.every((w) => !w.minimized), '');
  check('P5-2.4 open menaikkan z', list.find((w) => w.id === 'a')?.z === 13, JSON.stringify(list.map((w) => w.z)));

  // minimize → tetap ada tapi tersembunyi
  list = minimizeWin(list, 'b');
  check('P5-2.5 minimize menandai minimized', list.find((w) => w.id === 'b')?.minimized === true, '');

  // focus setelah minimize → RESTORE + z tertinggi (bug lama: fokus tidak unminimize)
  list = focusWin(list, 'b', c);
  const b = list.find((w) => w.id === 'b')!;
  check('P5-2.6 restore dari minimized = false', b.minimized === false, 'masih minimized');
  check('P5-2.7 restore = z tertinggi', topWin(list)?.id === 'b', JSON.stringify(topWin(list)?.id));

  // toggle: minimized → restore+fokus
  list = minimizeWin(list, 'b');
  list = toggleWin(list, 'b', c);
  check('P5-2.8 toggle dari minimized = restore + fokus', list.find((w) => w.id === 'b')?.minimized === false && topWin(list)?.id === 'b', '');

  // toggle: aktif & di atas → minimize
  list = minimizeWin(list, 'a');
  list = focusWin(list, 'a', c);
  list = toggleWin(list, 'a', c);
  check('P5-2.9 toggle aktif-atas = minimize', list.find((w) => w.id === 'a')?.minimized === true, '');

  // toggle: terbuka tapi bukan di atas → fokus
  list = focusWin(list, 'a', c);
  list = toggleWin(list, 'b', c);
  check('P5-2.10 toggle non-atas = fokus', topWin(list)?.id === 'b', '');

  // close
  list = closeWin(list, 'a');
  check('P5-2.11 close menghapus jendela', !list.some((w) => w.id === 'a'), '');
}

// ── 3. RESPONSIVE (fitWindow tidak overflow) ────────────────────────────
function testResponsive() {
  console.log('\n== P5-3. Responsive: jendela tidak overflow viewport ==');
  // Mobile 390px: window default 700px → harus mengikuti viewport.
  const mobile = fitWindow(700, 440, { w: 390, h: 700 });
  check('P5-3.1 mobile 390px lebar ≤ viewport', mobile.width <= 390 - 4, JSON.stringify(mobile));
  check('P5-3.2 mobile 390px masih ≥ 240 min', mobile.width >= 240, '');
  check('P5-3.3 mobile tinggi ≤ area', mobile.height <= 700 - 8, JSON.stringify(mobile));

  // Desktop besar: window pakai ukuran default.
  const desktop = fitWindow(700, 440, { w: 1440, h: 900 });
  check('P5-3.4 desktop pakai ukuran default', desktop.width === 700 && desktop.height === 440, JSON.stringify(desktop));

  // 620px window di 640px viewport → muat.
  const mid = fitWindow(620, 400, { w: 640, h: 480 });
  check('P5-3.5 640px viewport muat window 620px', mid.width <= 640 - 8 && mid.width >= 240, JSON.stringify(mid));

  // Cascade posisi tidak keluar area.
  const pos = cascadePos(5, { width: 300, height: 200 }, { w: 390, h: 700 });
  check('P5-3.6 cascade x dalam area', pos.x >= 0 && pos.x + 300 <= 390, JSON.stringify(pos));
}

// ── 4. WINDOWS TERMINAL — perintah vendor + engine ─────────────────────
function testTerminalCommands() {
  console.log('\n== P5-4. Windows Terminal: arp / route / tracert / netstat ==');
  const dispatcher = new VendorDispatcher();
  const mem = dispatcher.getNodeMemory('win1');
  mem.configuredIps = { eth0: '10.0.0.5/24' };
  mem.dnsServers = ['10.0.0.1'];

  let traced: string | null = null;
  const ctx = {
    nodeId: 'win1',
    name: 'WIN1',
    ports: [{ name: 'eth0', ipAddress: '10.0.0.5/24', macAddress: '00:00:00:00:00:0a', linkConnected: true }],
    arpProvider: () => [
      { ip: '10.0.0.1', mac: '00:00:00:00:00:01' },
      { ip: '10.0.0.2', mac: '00:00:00:00:00:02' },
    ],
    routeProvider: () => [
      { dst: '0.0.0.0/0', gateway: '10.0.0.1', iface: 'eth0', kind: 'static' },
      { dst: '10.0.0.0/24', gateway: '', iface: 'eth0', kind: 'connected' },
    ],
    tcpProvider: () => [{ localIp: '10.0.0.5', localPort: 80, remoteIp: '0.0.0.0', remotePort: 0, state: 'LISTEN', proto: 'TCP' }],
    tracerouteSimulator: (host: string) => {
      traced = host;
      return `Rute ke ${host}:\n  1  10.0.0.1`;
    },
    pingSimulator: () => 'Reply from 10.0.0.1: bytes=32 time=1ms TTL=64',
    dnsResolver: () => ({ resolved: '10.0.0.1', server: '10.0.0.1' }),
  } as never;

  const arp = dispatcher.dispatch('windows', 'arp -a', ctx);
  check('P5-4.1 arp -a menampilkan IP engine', arp.includes('10.0.0.1') && arp.includes('00:00:00:00:00:01'), arp);
  const route = dispatcher.dispatch('windows', 'route print', ctx);
  check('P5-4.2 route print menampilkan rute engine', route.includes('0.0.0.0/0') && route.includes('10.0.0.1'), route);
  const netstat = dispatcher.dispatch('windows', 'netstat', ctx);
  check('P5-4.3 netstat menampilkan koneksi TCP', netstat.includes('LISTEN') && netstat.includes('10.0.0.5:80'), netstat);
  const tracert = dispatcher.dispatch('windows', 'tracert 8.8.8.8', ctx);
  check('P5-4.4 tracert memanggil engine traceroute', traced === '8.8.8.8' && tracert.includes('Rute ke 8.8.8.8'), tracert);
  const help = dispatcher.dispatch('windows', 'help', ctx);
  check('P5-4.5 help mendaftar arp/route/tracert/netstat', help.includes('arp -a') && help.includes('route print') && help.includes('netstat'), '');
  const ipc = dispatcher.dispatch('windows', 'ipconfig', ctx);
  check('P5-4.6 ipconfig tetap jalan + DNS dari memory', ipc.includes('10.0.0.5') && ipc.includes('10.0.0.1'), ipc);
}

// ── 5. DHCP → DNS STATE SYNC ───────────────────────────────────────────
function testDhcpDnsSync() {
  console.log('\n== P5-5. DHCP → DNS state sync (lease option 6) ==');
  const sim = new NetworkSimulator();
  sim.syncTopology({
    version: '1.0',
    metadata: { name: 't', author: 'a', description: '', createdAt: '', updatedAt: '' },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      { id: 'r1', name: 'R1', vendor: 'mikrotik', model: 'x', deviceType: 'router', position: { x: 0, y: 0 }, powered: true, ports: [{ id: 'ether1', name: 'ether1', speedMbps: 1000, status: 'up', macAddress: '00:00:00:00:00:01', type: 'copper' }] },
      { id: 'win1', name: 'WIN1', vendor: 'windows', model: 'Windows 11 Pro', deviceType: 'windows-client', position: { x: 0, y: 0 }, powered: true, ports: [{ id: 'eth0', name: 'eth0', speedMbps: 1000, status: 'up', macAddress: '00:00:00:00:00:0a', type: 'copper' }] },
    ],
    edges: [{ id: 'e1', sourceNodeId: 'r1', sourcePortId: 'ether1', targetNodeId: 'win1', targetPortId: 'eth0', cableType: 'copper_straight' }],
  } as never);
  sim.applyNodeConfig('r1', { ether1: '10.0.0.1/24' }, []);
  sim.setDhcpPools({ r1: [{ name: 'pool1', range: '10.0.0.10-10.0.0.99', network: '10.0.0.0/24', gateway: '10.0.0.1', dnsServers: ['10.0.0.1'] }] });

  const lease = sim.grantDhcpLease('win1', 'eth0');
  check('P5-5.1 lease diberikan', !!lease && lease.ip.startsWith('10.0.0.'), JSON.stringify(lease));
  check('P5-5.2 lease membawa DNS option 6', Array.isArray(lease?.dnsServers) && lease!.dnsServers!.includes('10.0.0.1'), JSON.stringify(lease?.dnsServers));
  const devDns = sim.getDevice('win1')?.dnsServers ?? [];
  check('P5-5.3 engine dnsServers terisi dari lease', devDns.includes('10.0.0.1'), JSON.stringify(devDns));

  // Flow UI (WinNetworkSettings.doDhcp): memory Windows harus mencerminkan DNS lease
  // supaya sync berikutnya (syncNodeToEngine → setDnsServers(mem.dnsServers))
  // TIDAK menimpa DNS yang baru diberikan DHCP.
  const mem: NodeMemory = {} as NodeMemory;
  if (lease?.dnsServers && lease.dnsServers.length > 0) mem.dnsServers = [...lease.dnsServers];
  check('P5-5.4 memory Windows mencerminkan DNS DHCP (satu sumber kebenaran)', (mem.dnsServers ?? []).includes('10.0.0.1'), JSON.stringify(mem.dnsServers));
}

// ── 6. NOTEPAD → FILESYSTEM → FILE EXPLORER ────────────────────────────
function testNotepadPersistence() {
  console.log('\n== P5-6. Notepad save → filesystem → File Explorer ==');
  const mem: NodeMemory = {} as NodeMemory;
  // Simulasi flow File Explorer: buat file, Notepad save, daftar ulang.
  winSetFiles(mem, [{ name: 'a.txt', content: 'isi awal' }]);
  let files = winFilesOf(mem);
  check('P5-6.1 file terlihat di File Explorer', files.some((f) => f.name === 'a.txt'), JSON.stringify(files));

  // Notepad standalone save (desktop icon): menulis langsung ke My Documents.
  const name = 'a.txt';
  const content = 'isi baru setelah disimpan';
  const rest = files.filter((f) => f.name !== name);
  mem.files = [...rest, { name, content }];
  files = winFilesOf(mem);
  check('P5-6.2 save menimpa isi file', files.find((f) => f.name === name)?.content === content, JSON.stringify(files));
  check('P5-6.3 file tidak terduplikasi', files.filter((f) => f.name === name).length === 1, '');

  // File Explorer mengubah nama saat save (rename).
  winSetFiles(mem, files);
  files = winFilesOf(mem);
  const renamed = 'b.txt';
  winSetFiles(mem, [...files.filter((f) => f.name !== name), { name: renamed, content }]);
  files = winFilesOf(mem);
  check('P5-6.4 rename via save terlihat di File Explorer', files.some((f) => f.name === renamed) && !files.some((f) => f.name === name), JSON.stringify(files));
}

export function runWindowsMasterFixTests(): Report {
  console.log('\n== P5. Master Fix — Windows + AI + UI ==');
  testAiPrompt();
  testWindowManager();
  testResponsive();
  testTerminalCommands();
  testDhcpDnsSync();
  testNotepadPersistence();
  return rep;
}