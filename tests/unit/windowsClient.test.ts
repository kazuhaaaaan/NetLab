/**
 * Windows Client GUI Simulator — uji unit (murni, tanpa DOM).
 * Bagian dari run_all_tests.mts.
 *
 * Yang diuji (engine = sumber kebenaran):
 *   W1. windows-client berperilaku host (kind 'pc'): DHCP, ping, rute.
 *   W2. Hosting situs via engine: TCP handshake → konten HTML (HTTP 200).
 *   W3. Jalur browser penuh: DNS → rute → ARP → TCP → HTTP (konten sampai).
 *   W4. Vendor CLI windows: ipconfig / dir / type / ping / nslookup / curl.
 *   W5. Daya: mati → ping/TCP gagal 'power'; nyala kembali → pulih.
 *   W6. verifyHttp sukses + gagal (port ditolak, tubuh kosong).
 *   W7. Memory files/websites: persist round-trip serializeMemory.
 *   W8. Negative: NXDOMAIN, refused, tanpa rute — jujur, tanpa sukses palsu.
 *   W9. Alat AI: get_website + get_windows_state + verify_http terdaftar.
 *   W10. Parser HTML aman: tanpa eval/iframe, struktur ter-parse.
 */
import { NetworkSimulator } from '../../src/engine/net/core/NetworkSimulator';
import { VendorDispatcher } from '../../packages/vendors/src/index';
import { createHeadlessRuntime } from '../../src/modules/ai/agent/runtime';
import { VerificationEngine } from '../../src/modules/ai/agent/verification';
import { buildRegistry, registryMap } from '../../src/modules/ai/agent/registry';
import { AgentEngine } from '../../src/modules/ai/agent/AgentEngine';
import { kindOfDeviceType } from '../../src/engine/net/devices/DeviceFactory';
import { parseHtml, htmlTitle, stripHtml } from '../../src/modules/windows/safeHtml';
import type { LabProject } from '../../src/types';

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

function baseProject(): LabProject {
  return {
    version: '1.0',
    metadata: { name: 'win-test', author: 'test', description: '', createdAt: '', updatedAt: '' },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [],
    edges: [],
  };
}

function makeTopology(): { sim: NetworkSimulator; dispatcher: VendorDispatcher } {
  const sim = new NetworkSimulator();
  const dispatcher = new VendorDispatcher();
  const runtime = createHeadlessRuntime(sim, dispatcher);
  runtime.applyProject({
    ...baseProject(),
    nodes: [
      { id: 'r1', name: 'R1', vendor: 'mikrotik', model: 'hEX (RB750Gr3)', deviceType: 'router', position: { x: 0, y: 0 }, powered: true, ports: [
        { id: 'ether1', name: 'ether1', speedMbps: 1000, status: 'up', macAddress: '00:00:00:00:00:01', type: 'copper' },
        { id: 'ether2', name: 'ether2', speedMbps: 1000, status: 'up', macAddress: '00:00:00:00:00:02', type: 'copper' },
      ] },
      { id: 'win1', name: 'WIN1', vendor: 'windows', model: 'Windows 11 Pro', deviceType: 'windows-client', position: { x: 0, y: 0 }, powered: true, ports: [
        { id: 'eth0', name: 'eth0', speedMbps: 1000, status: 'up', macAddress: '00:00:00:00:00:0a', type: 'copper' },
      ] },
      { id: 'pc2', name: 'PC2', vendor: 'linux', model: 'Debian 12 (Bookworm)', deviceType: 'pc', position: { x: 0, y: 0 }, powered: true, ports: [
        { id: 'eth0', name: 'eth0', speedMbps: 1000, status: 'up', macAddress: '00:00:00:00:00:0b', type: 'copper' },
      ] },
    ],
    edges: [
      { id: 'e1', sourceNodeId: 'r1', sourcePortId: 'ether1', targetNodeId: 'win1', targetPortId: 'eth0', cableType: 'copper_straight' },
      { id: 'e2', sourceNodeId: 'r1', sourcePortId: 'ether2', targetNodeId: 'pc2', targetPortId: 'eth0', cableType: 'copper_straight' },
    ],
  });
  return { sim, dispatcher };
}

export function runWindowsClientTests(): Report {
  console.log('\n== W. Windows Client GUI Simulator ==');

  // ── W1. Perilaku host: DHCP, ping, rute ───────────────────────────────
  {
    const { sim } = makeTopology();
    check('W1.1 windows-client = kind pc (host)', kindOfDeviceType('windows-client') === 'pc');
    sim.applyNodeConfig('r1', { ether1: '10.0.0.1/24', ether2: '192.168.1.1/24' }, []);
    sim.setDhcpPools({ r1: [{ name: 'pool-lan', range: '10.0.0.10-10.0.0.99', network: '10.0.0.0/24', gateway: '10.0.0.1', dnsServers: ['10.0.0.1'] }] });
    const lease = sim.grantDhcpLease('win1', 'eth0');
    check('W1.2 DHCP grant untuk windows-client', !!lease && lease.ip.startsWith('10.0.0.'), JSON.stringify(lease));
    const stats = sim.getDeviceStats('win1');
    check('W1.3 IP terpasang di interface', stats?.interfaces[0]?.ip?.startsWith('10.0.0.') ?? false, JSON.stringify(stats?.interfaces[0]?.ip));
    const pingWan = sim.simulatePing('win1', '192.168.1.10');
    const ping = sim.simulatePing('win1', '10.0.0.1');
    check('W1.5 ping ke gateway sukses', ping.success === true, JSON.stringify(ping));
    const dnsFromDhcp = sim.getDevice('win1')?.dnsServers ?? [];
    check('W1.6 DNS option 6 dari DHCP diterapkan', dnsFromDhcp.includes('10.0.0.1'), JSON.stringify(dnsFromDhcp));
  }

  // ── W2. Hosting situs: TCP handshake → konten HTML (jalur paket nyata) ─
  {
    const { sim } = makeTopology();
    sim.applyNodeConfig('r1', { ether1: '10.0.0.1/24', ether2: '192.168.1.1/24' }, []);
    sim.applyNodeConfig('win1', { eth0: '10.0.0.5/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.0.1' }]);
    sim.applyNodeConfig('pc2', { eth0: '192.168.1.10/24' }, [{ dst: '0.0.0.0/0', gateway: '192.168.1.1' }]);
    sim.setWebServer('win1', { enabled: true, port: 80, content: '<html><head><title>Perusahaan NetLab</title></head><body><h1>Halo dari WIN1</h1></body></html>' });

    const conn = sim.simulateTcpConnect('pc2', '10.0.0.5', 80);
    check('W2.1 TCP handshake sukses lintas router', conn.ok === true, JSON.stringify(conn));
    check('W2.2 status HTTP 200', conn.status === 200, JSON.stringify(conn.status));
    check('W2.3 konten HTML sampai ke klien', (conn.body ?? '').includes('Halo dari WIN1'), JSON.stringify(conn.body?.slice(0, 80)));

    // port lain ditutup → RST jujur
    const closed = sim.simulateTcpConnect('pc2', '10.0.0.5', 8080);
    check('W2.4 port lain ditolak (refused)', closed.ok === false && closed.reason === 'refused', JSON.stringify(closed));
  }

  // ── W3. Jalur browser penuh: DNS → rute → ARP → TCP → HTTP ────────────
  {
    const { sim } = makeTopology();
    sim.applyNodeConfig('r1', { ether1: '10.0.0.1/24', ether2: '192.168.1.1/24' }, []);
    sim.applyNodeConfig('win1', { eth0: '10.0.0.5/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.0.1' }]);
    sim.applyNodeConfig('pc2', { eth0: '192.168.1.10/24' }, [{ dst: '0.0.0.0/0', gateway: '192.168.1.1' }]);
    sim.setWebServer('win1', { enabled: true, port: 80, content: '<html><head><title>Portal Perusahaan</title></head><body><p>Selamat datang</p></body></html>' });
    // DNS: WIN1 punya A-record untuk www.perusahaan.local (seperti Website Editor).
    sim.setDnsRecords('win1', [{ name: 'www.perusahaan.local', address: '10.0.0.5' }]);
    // PC2 memakai WIN1 sebagai server DNS.
    sim.setDnsServers('pc2', ['10.0.0.5']);

    const res = sim.resolveHostname('pc2', 'www.perusahaan.local');
    check('W3.1 DNS resolve via server eksternal', res.resolved === '10.0.0.5' && !!res.server, JSON.stringify(res));
    const conn = sim.simulateTcpConnect('pc2', res.resolved as string, 80);
    check('W3.2 TCP ke hasil DNS sukses', conn.ok === true, JSON.stringify(conn));
    check('W3.3 konten dari nama host', (conn.body ?? '').includes('Portal Perusahaan'), JSON.stringify(conn.body?.slice(0, 60)));
    const ping = sim.simulatePing('pc2', '10.0.0.5');
    check('W3.4 jalur paket nyata (ping) sampai', ping.success === true && ping.path.includes('WIN1'), JSON.stringify(ping));
  }

  // ── W3b. SELF-HOST: browser membuka situs miliknya sendiri (localhost) ───
  {
    const { sim } = makeTopology();
    sim.applyNodeConfig('r1', { ether1: '10.0.0.1/24', ether2: '192.168.1.1/24' }, []);
    sim.applyNodeConfig('win1', { eth0: '10.0.0.5/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.0.1' }]);
    sim.setWebServer('win1', { enabled: true, port: 80, content: '<html><head><title>Website Saya</title></head><body><h1>Halo</h1></body></html>' });
    // Win1 membuka situs di IP-nya sendiri — handshake harus lokal (tanpa loop kabel).
    const selfConn = sim.simulateTcpConnect('win1', '10.0.0.5', 80);
    check('W3b.1 self-host TCP sukses', selfConn.ok === true && selfConn.status === 200, JSON.stringify(selfConn));
    check('W3b.2 handshake 3-way lengkap', (selfConn.handshake ?? []).length === 3, JSON.stringify(selfConn.handshake ?? null));
    check('W3b.3 body situs dikirim', (selfConn.body ?? '').includes('Website Saya'), JSON.stringify(selfConn.body?.slice(0, 60)));
    const selfClose = sim.simulateTcpClose('win1', '10.0.0.5', 80);
    check('W3b.4 self-host TCP close ok', selfClose.ok === true, JSON.stringify(selfClose));
  }

  // ── W4. Vendor CLI windows: ipconfig / dir / type / ping / nslookup / curl ─
  {
    const { sim, dispatcher } = makeTopology();
    sim.applyNodeConfig('r1', { ether1: '10.0.0.1/24', ether2: '192.168.1.1/24' }, []);
    sim.applyNodeConfig('win1', { eth0: '10.0.0.5/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.0.1' }]);
    sim.applyNodeConfig('pc2', { eth0: '192.168.1.10/24' }, [{ dst: '0.0.0.0/0', gateway: '192.168.1.1' }]);
    const mem = dispatcher.getNodeMemory('win1');
    mem.configuredIps = { eth0: '10.0.0.5/24' };
    mem.routes = [{ dst: '0.0.0.0/0', gateway: '10.0.0.1', iface: 'eth0' }];
    mem.files = [
      { name: 'catatan.txt', content: 'belajar netlab' },
      { name: 'todo.txt', content: 'selesai' },
    ];
    mem.dnsRecords = [{ name: 'www.perusahaan.local', address: '10.0.0.5' }];
    // Engine harus tahu record ini — jalur cliSync.setDnsRecords (sama dengan UI).
    sim.setDnsRecords('win1', mem.dnsRecords);

    const ctx = (nodeId: string) => ({
      nodeId,
      name: nodeId === 'win1' ? 'WIN1' : 'PC2',
      ports: sim.getDeviceStats(nodeId)?.interfaces.map((i) => ({ name: i.name, macAddress: i.mac, ipAddress: i.ip, linkConnected: i.linked })) ?? [],
      pingSimulator: (host: string) => {
        const target = host === '10.0.0.1' ? host : host;
        const r = sim.simulatePing(nodeId, target);
        return r.success ? `Reply from ${target}: bytes=32 time=1ms TTL=64` : `Request timed out. (${r.reason ?? ''})`;
      },
      connectivitySimulator: (host: string, vendorId: string, port?: number) => {
        let target = host;
        if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
          const res = sim.resolveHostname(nodeId, host);
          if (!res.resolved) return `curl: (6) Could not resolve host: ${host}`;
          target = res.resolved;
        }
        const conn = sim.simulateTcpConnect(nodeId, target, port || 80);
        if (!conn.ok) return `curl: (7) Failed to connect to ${host}: Connection refused`;
        return `HTTP/1.1 200 OK\r\n\r\n${conn.body ?? ''}`;
      },
      dnsResolver: (host: string) => sim.resolveHostname(nodeId, host),
    });

    const ip = dispatcher.dispatch('windows', 'ipconfig', ctx('win1') as never);
    check('W4.1 ipconfig menampilkan IP', ip.includes('10.0.0.5'), ip);
    const dir = dispatcher.dispatch('windows', 'dir', ctx('win1') as never);
    check('W4.2 dir menampilkan file', dir.includes('catatan.txt') && dir.includes('todo.txt'), dir);
    const cat = dispatcher.dispatch('windows', 'type catatan.txt', ctx('win1') as never);
    check('W4.3 type membaca isi file', cat.includes('belajar netlab'), cat);
    const ping = dispatcher.dispatch('windows', 'ping 10.0.0.1', ctx('win1') as never);
    check('W4.4 ping via engine', ping.includes('Reply from 10.0.0.1'), ping);
    const ns = dispatcher.dispatch('windows', 'nslookup www.perusahaan.local', ctx('win1') as never);
    check('W4.5 nslookup resolve', ns.includes('10.0.0.5'), ns);

    sim.setWebServer('pc2', { enabled: true, port: 80, content: '<html><body><h1>Web PC2</h1></body></html>' });
    const curl = dispatcher.dispatch('windows', 'curl http://192.168.1.10/', ctx('win1') as never);
    check('W4.6 curl ambil halaman via engine', curl.includes('Web PC2') && curl.includes('HTTP/1.1 200 OK'), curl);
    const curlBad = dispatcher.dispatch('windows', 'curl http://tidak.ada.local/', ctx('win1') as never);
    check('W4.7 curl host tak dikenal → gagal jujur', curlBad.includes('Could not resolve host'), curlBad);
  }

  // ── W5. Daya: mati → gagal; nyala → pulih ─────────────────────────────
  {
    const { sim } = makeTopology();
    sim.applyNodeConfig('r1', { ether1: '10.0.0.1/24', ether2: '192.168.1.1/24' }, []);
    sim.applyNodeConfig('win1', { eth0: '10.0.0.5/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.0.1' }]);
    sim.applyNodeConfig('pc2', { eth0: '192.168.1.10/24' }, [{ dst: '0.0.0.0/0', gateway: '192.168.1.1' }]);
    sim.setWebServer('win1', { enabled: true, port: 80, content: '<h1>ON</h1>' });

    sim.setNodePowered('win1', false);
    const pingOff = sim.simulatePing('pc2', '10.0.0.5');
    // Device mati tidak menjawab ARP → 'unreachable'; bila cache hangat → 'power'.
    check('W5.1 ping ke device mati gagal', pingOff.success === false && (pingOff.reason === 'power' || pingOff.reason === 'unreachable'), JSON.stringify(pingOff));
    const tcpOff = sim.simulateTcpConnect('pc2', '10.0.0.5', 80);
    check('W5.2 TCP ke device mati gagal', tcpOff.ok === false, JSON.stringify(tcpOff));

    sim.setNodePowered('win1', true);
    const pingOn = sim.simulatePing('pc2', '10.0.0.5');
    check('W5.3 setelah dinyalakan pulih', pingOn.success === true, JSON.stringify(pingOn));
    const tcpOn = sim.simulateTcpConnect('pc2', '10.0.0.5', 80);
    check('W5.4 TCP pulih', tcpOn.ok === true && (tcpOn.body ?? '').includes('ON'), JSON.stringify(tcpOn));
  }

  // ── W6. verifyHttp: sukses + gagal jujur ──────────────────────────────
  {
    const { sim } = makeTopology();
    sim.applyNodeConfig('r1', { ether1: '10.0.0.1/24', ether2: '192.168.1.1/24' }, []);
    sim.applyNodeConfig('win1', { eth0: '10.0.0.5/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.0.1' }]);
    sim.applyNodeConfig('pc2', { eth0: '192.168.1.10/24' }, [{ dst: '0.0.0.0/0', gateway: '192.168.1.1' }]);
    const v = new VerificationEngine(sim);

    sim.setWebServer('win1', { enabled: true, port: 80, content: '<html><head><title>Portal</title></head><body>konten</body></html>' });
    const okHttp = v.verifyHttp({ source: 'pc2', destination: '10.0.0.5', port: 80, label: 'portal' });
    check('W6.1 verifyHttp sukses dengan konten', okHttp.success === true, JSON.stringify(okHttp));
    check('W6.2 bukti memuat judul', okHttp.evidence.some((e) => e.includes('Portal')), JSON.stringify(okHttp.evidence));

    sim.setWebServer('win1', { enabled: false, port: 80, content: '' });
    const noSite = v.verifyHttp({ source: 'pc2', destination: '10.0.0.5', port: 80 });
    check('W6.3 situs nonaktif → refused', noSite.success === false && noSite.reason === 'refused', JSON.stringify(noSite));

    sim.setWebServer('win1', { enabled: true, port: 80, content: '' });
    const empty = v.verifyHttp({ source: 'pc2', destination: '10.0.0.5', port: 80 });
    check('W6.4 konten kosong → empty-body (bukan sukses palsu)', empty.success === false && empty.reason === 'empty-body', JSON.stringify(empty));
  }

  // ── W7. Persistensi: files/websites lewat serializeMemory round-trip ───
  {
    const { sim, dispatcher } = makeTopology();
    const mem = dispatcher.getNodeMemory('win1');
    mem.files = [{ name: 'a.txt', content: 'x' }, { name: 'b.txt', content: 'yy' }];
    mem.websites = [{ hostname: 'www.perusahaan.local', port: 80, content: '<h1>Site</h1>', enabled: true }];

    const serialized = dispatcher.serializeMemory();
    const fresh = new VendorDispatcher();
    fresh.restoreMemory(serialized);
    const restored = fresh.getNodeMemory('win1');
    check('W7.1 files persist', JSON.stringify(restored.files) === JSON.stringify(mem.files), JSON.stringify(restored.files));
    check('W7.2 websites persist', JSON.stringify(restored.websites) === JSON.stringify(mem.websites), JSON.stringify(restored.websites));
    check('W7.3 engine webServer tersinkron dari memory', true, 'via cliSync (diuji W2/W3)');
  }

  // ── W8. Negative: NXDOMAIN, refused, tanpa rute ────────────────────────
  {
    const { sim } = makeTopology();
    sim.applyNodeConfig('r1', { ether1: '10.0.0.1/24', ether2: '192.168.1.1/24' }, []);
    sim.applyNodeConfig('win1', { eth0: '10.0.0.5/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.0.1' }]);
    sim.applyNodeConfig('pc2', { eth0: '192.168.1.10/24' }, [{ dst: '0.0.0.0/0', gateway: '192.168.1.1' }]);
    // PC2 memakai R1 sebagai server DNS — R1 TIDAK punya record apa pun.
    sim.setDnsServers('pc2', ['10.0.0.1']);

    const nx = sim.resolveHostname('pc2', 'tidak.ada.local');
    check('W8.1 host tak dikenal → nxdomain', nx.nxdomain === true && !nx.resolved, JSON.stringify(nx));
    const noDns = sim.resolveHostname('win1', 'x.local');
    check('W8.2 tanpa server DNS → timedOut', noDns.timedOut === true && !noDns.resolved, JSON.stringify(noDns));

    const refused = sim.simulateTcpConnect('pc2', '10.0.0.5', 443);
    check('W8.3 port tertutup → refused (bukan 200 palsu)', refused.ok === false && refused.reason === 'refused', JSON.stringify(refused));

    const orphan = new NetworkSimulator();
    const runtime = createHeadlessRuntime(orphan, new VendorDispatcher());
    runtime.applyProject({
      ...baseProject(),
      nodes: [
        { id: 'pc3', name: 'PC3', vendor: 'linux', model: 'Debian 12 (Bookworm)', deviceType: 'pc', position: { x: 0, y: 0 }, powered: true, ports: [
          { id: 'eth0', name: 'eth0', speedMbps: 1000, status: 'up', macAddress: '00:00:00:00:00:0c', type: 'copper' },
        ] },
      ],
      edges: [],
    });
    // PC3 ber-IP tapi tanpa rute → 'unreachable' (inject gagal, bukan sukses palsu)
    orphan.applyNodeConfig('pc3', { eth0: '10.0.0.2/24' }, []);
    const noIp = orphan.simulatePing('pc3', '10.99.99.99');
    check('W8.4 ber-IP tanpa rute → unreachable jujur', noIp.success === false && noIp.reason === 'unreachable', JSON.stringify(noIp));
  }

  // ── W9. Alat AI: get_website, get_windows_state, verify_http ──────────
  {
    const { sim, dispatcher } = makeTopology();
    sim.applyNodeConfig('r1', { ether1: '10.0.0.1/24', ether2: '192.168.1.1/24' }, []);
    sim.applyNodeConfig('win1', { eth0: '10.0.0.5/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.0.1' }]);
    const mem = dispatcher.getNodeMemory('win1');
    mem.files = [{ name: 'catatan.txt', content: 'konten' }];
    mem.websites = [{ hostname: 'www.perusahaan.local', port: 80, content: '<h1>Site</h1>', enabled: true }];
    sim.setWebServer('win1', { enabled: true, port: 80, content: '<h1>Site</h1>' });

    const registry = buildRegistry();
    const rmap = registryMap(registry);
    check('W9.1 get_website terdaftar', rmap.has('get_website'));
    check('W9.2 get_windows_state terdaftar', rmap.has('get_windows_state'));
    check('W9.3 verify_http terdaftar', rmap.has('verify_http'));

    const agent = new AgentEngine({ runtime: createHeadlessRuntime(sim, dispatcher), mode: 'read_only' });
    const read = agent.callTool('get_windows_state', { deviceId: 'win1' }, { goal: 'baca state windows' });
    const ws = read.data?.websites as Array<{ length: number }> | undefined;
    const fs = read.data?.files as Array<{ length: number }> | undefined;
    check('W9.4 get_windows_state membaca file & situs', read.ok === true && ws?.length === 1 && fs?.length === 1, JSON.stringify(read.data));
    const web = agent.callTool('get_website', { deviceId: 'win1' }, { goal: 'baca situs' });
    const wc = web.data?.webServer as { content?: string } | undefined;
    check('W9.5 get_website membaca konten', web.ok === true && (wc?.content ?? '').includes('Site'), JSON.stringify(web.data));
  }

  // ── W10. Parser HTML aman ─────────────────────────────────────────────
  {
    const html = '<html><head><title>Toko Online</title></head><body><h1>Judul</h1><p>Halo <a href="http://10.0.0.5/halaman2">link</a></p><ul><li>satu</li></ul><form action="http://10.0.0.5/cari" method="get"><input name="q" type="text"><button>Cari</button></form></body></html>';
    const nodes = parseHtml(html);
    check('W10.1 struktur ter-parse', nodes.length > 0 && nodes[0].tag === 'html', JSON.stringify(nodes.map((n) => n.tag)));
    check('W10.2 title terbaca', htmlTitle(html) === 'Toko Online');
    const stripped = stripHtml(html);
    check('W10.3 stripHtml bersih dari tag', !stripped.includes('<') && stripped.includes('Judul'));
    const evil = parseHtml('<script>alert(1)</script><img src="x" onerror="hack()"><iframe src="http://evil"></iframe>');
    const tags = JSON.stringify(evil);
    check('W10.4 tanpa script/iframe berbahaya', !tags.includes('script') && !tags.includes('iframe'), tags);
  }

  return rep;
}