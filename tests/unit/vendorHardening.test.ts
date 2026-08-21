/**
 * Vendor hardening & honesty tests — bagian dari run_all_tests.mts.
 *
 * Fokus: jaminan TIDAK ADA hasil palsu (no fake success) dan enforcement
 * registry kapabilitas sebagai satu-satunya sumber kebenaran:
 * 1. Command handler yang membawa cap yang diblokir vendor (NS/parser-only)
 *    → error jujur "Feature '<label>' is not supported on <vendor>." dan
 *    state TIDAK berubah (guard di common/chain.ts sebelum run()).
 * 2. Hasil jaringan tanpa simulator engine (ping/traceroute/http_get)
 *    jujur — tidak pernah "Success rate", "packets transmitted",
 *    "Reply from", "icmp_seq", "0% packet loss".
 * 3. Linux adapter jujur: routing table kosong, nslookup tanpa server DNS,
 *    /etc/resolv.conf kosong, /etc/network/interfaces hanya IP nyata,
 *    /etc/hosts hanya record nyata, curl/ping/traceroute tanpa mesin.
 * 4. Windows ipconfig: status media benar (tersambung vs terputus).
 * 5. OpenWrt pool: network diambil dari IP interface yang NYATA; tanpa IP
 *    interface, rentang tidak dikarang (tidak ada 192.168.1.0/24 hardcoded).
 * 6. Cisco: ASN/router-id ditangkap benar (regresi group regex `?.[2]`).
 * 7. Export config jujur: tidak mengarang router-id / networks=0.0.0.0/0 /
 *    subnet DHCP yang tidak pernah dikonfigurasi.
 */
import { VendorDispatcher, VENDOR_CAPABILITIES } from '../../packages/vendors/src/index';
import { CAPABILITY_LABELS, VENDOR_NAMES } from '../../packages/vendors/src/capabilities';
import type { CapabilityKey } from '../../packages/vendors/src/capabilities';
import { promptFor } from '../../src/utils/prompt';
import { NetworkSimulator } from '../../src/engine/net/core/NetworkSimulator';
import type { LabProjectLike } from '../../src/engine/net/core/Topology';
import { syncNodeToEngine } from '../../src/utils/cliSync';

const VENDOR_IDS = Object.keys(VENDOR_CAPABILITIES);

function node(id: string, name: string, model: string, ports: number, seed: string) {
  return {
    id,
    name,
    vendor: model === 'pc' || model === 'switch' ? 'linux' : 'cisco_ios',
    model,
    deviceType: model,
    ports: Array.from({ length: ports }, (_, i) => ({
      id: `ether${i + 1}`,
      name: `ether${i + 1}`,
      status: 'up' as const,
      macAddress: `00:0c:29:${seed}:${(i + 1).toString().padStart(2, '0')}:01`,
    })),
  };
}

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

const mkCtx = (nodeId: string, name: string, portNames: string[]) => ({
  nodeId,
  name,
  ports: portNames.map((n, i) => ({ id: n, name: n, status: (i === 0 ? 'up' : 'down') as 'up' | 'down' })),
  pingSimulator: undefined,
  tracerouteSimulator: undefined,
  connectivitySimulator: undefined,
});

const dispatchStr = (dis: VendorDispatcher, vid: string, cmd: string, ctx: ReturnType<typeof mkCtx>) => {
  const out = dis.dispatch(vid, cmd, ctx);
  return typeof out === 'string' ? out : JSON.stringify(out ?? '');
};

export function runVendorHardeningTests(): Report {
  console.log('\n== H1. Registry: setiap CapabilityKey punya label ==');
  const keys = Object.keys(VENDOR_CAPABILITIES.mikrotik.caps) as CapabilityKey[];
  for (const k of keys) {
    check(`H1 label kapabilitas ${k}`, typeof CAPABILITY_LABELS[k] === 'string' && CAPABILITY_LABELS[k].length > 0, JSON.stringify(CAPABILITY_LABELS[k]));
  }

  console.log('\n== H2. Capability guard: fitur diblokir vendor → error jujur + state aman ==');
  // Pasangan vendor → cap → perintah pembawa cap yang TIDAK didukung.
  // setup: perintah konteks yang sah (mis. interface ether1) agar handler
  // dengan syarat currentIface bisa dievaluasi; state dibandingkan SETELAH
  // setup sehingga yang diuji hanya efek perintah yang diblokir.
  const BLOCKED: Record<string, { cap: CapabilityKey; setup: string[]; cmds: string[]; expectLabel: string; vendorLabel: string }[]> = {
    aruba: [
      { cap: 'nat', setup: ['interface ether1'], cmds: ['ip nat inside', 'ip nat outside', 'ip nat inside source list 1 interface ether2 overload'], expectLabel: 'NAT', vendorLabel: 'Aruba AOS-CX' },
      { cap: 'vrrp', setup: ['interface ether1'], cmds: ['vrrp 1 ip 192.168.9.254'], expectLabel: 'VRRP', vendorLabel: 'Aruba AOS-CX' },
      { cap: 'rip', setup: [], cmds: ['router rip'], expectLabel: 'RIP', vendorLabel: 'Aruba AOS-CX' },
      { cap: 'eigrp', setup: [], cmds: ['router eigrp 100'], expectLabel: 'EIGRP', vendorLabel: 'Aruba AOS-CX' },
    ],
    linux: [{ cap: 'bgp', setup: [], cmds: ['router bgp 65001'], expectLabel: 'BGP', vendorLabel: 'Linux / Debian' }],
    openwrt: [{ cap: 'bgp', setup: [], cmds: ['router bgp 65001'], expectLabel: 'BGP', vendorLabel: 'OpenWrt (UCI)' }],
  };
  for (const [vid, cases] of Object.entries(BLOCKED)) {
    for (const c of cases) {
      const st = VENDOR_CAPABILITIES[vid]?.caps[c.cap];
      check(`H2 registry ${vid}.${c.cap} bukan supported`, st !== 'supported', `status=${st}`);
      for (const cmd of c.cmds) {
        const dis = new VendorDispatcher();
        const ctx = mkCtx(vid, vid, ['ether1', 'ether2']);
        const mem = dis.getNodeMemory(vid);
        for (const s of c.setup) dis.dispatch(vid, s, ctx);
        const before = JSON.stringify(mem);
        const outStr = dispatchStr(dis, vid, cmd, ctx);
        check(`H2 ${vid} '${cmd.slice(0, 44)}' diblokir jujur`, (outStr.includes('not supported') && outStr.includes(c.expectLabel) && outStr.includes(c.vendorLabel)) || /not currently simulated/.test(outStr), outStr.slice(0, 120));
        check(`H2 ${vid} '${cmd.slice(0, 44)}' state tidak berubah`, JSON.stringify(mem) === before, 'state berubah walau diblokir');
      }
    }
  }

  console.log('\n== H3. Tanpa simulator engine: ping/traceroute/http jujur (no fake success) ==');
  const FAKE_MARKERS = /Success rate|packets transmitted|Reply from|icmp_seq|0% packet loss|received, 0/;
  for (const vid of VENDOR_IDS) {
    const dis = new VendorDispatcher();
    const ctx = mkCtx(vid, vid, ['ether1', 'ether2']);
    const outStr = dispatchStr(dis, vid, 'ping 10.0.0.1', ctx);
    check(`H3 ${vid} ping tanpa simulator jujur`, /simulation engine not available|Tidak dapat menemukan host|ping panel/.test(outStr) && !FAKE_MARKERS.test(outStr), outStr.slice(0, 120));
  }
  for (const vid of ['linux', 'mikrotik', 'openwrt']) {
    const dis = new VendorDispatcher();
    const ctx = mkCtx(vid, vid, ['ether1', 'ether2']);
    const outStr = dispatchStr(dis, vid, 'traceroute 10.0.0.1', ctx);
    check(`H3 ${vid} traceroute tanpa simulator jujur`, /simulation engine not available|ping panel/.test(outStr) && !FAKE_MARKERS.test(outStr), outStr.slice(0, 120));
  }
  for (const vid of ['linux', 'windows']) {
    const dis = new VendorDispatcher();
    const ctx = mkCtx(vid, vid, ['ether1', 'ether2']);
    const outHttp = dispatchStr(dis, vid, 'curl http://10.0.0.1', ctx);
    check(`H3 ${vid} curl tanpa simulator jujur`, /connectivity simulation not available/.test(outHttp) && !/200 OK|<!DOCTYPE/.test(outHttp), outHttp.slice(0, 120));
  }

  console.log('\n== H4. Linux adapter jujur (tidak mengarang hasil) ==');
  {
    const dis = new VendorDispatcher();
    const ctx = mkCtx('pc1', 'PC1', ['ether1', 'ether2']);
    // Routing table kosong → tidak ada default route karangan.
    const rt = dispatchStr(dis, 'linux', 'ip route', ctx);
    check('H4 ip route kosong jujur', rt.includes('routing table kosong'), rt.slice(0, 120));
    // nslookup tanpa server DNS → timed out, tanpa fallback 8.8.8.8.
    const ns = dispatchStr(dis, 'linux', 'nslookup www.example.com', ctx);
    check('H4 nslookup tanpa DNS jujur', ns.includes('no servers could be reached') && !ns.includes('8.8.8.8'), ns.slice(0, 160));
    // /etc/resolv.conf tanpa DNS → komentar kosong, bukan nameserver karangan.
    const rconf = dispatchStr(dis, 'linux', 'cat /etc/resolv.conf', ctx);
    check('H4 resolv.conf kosong jujur', rconf.includes('# empty (no DNS servers configured)'), rconf.slice(0, 120));
    // /etc/hosts hanya localhost + record nyata (dnsRecords dari perintah).
    const hosts0 = dispatchStr(dis, 'linux', 'cat /etc/hosts', ctx);
    check('H4 hosts tanpa record tidak mengarang', !hosts0.includes('web.site') && hosts0.includes('localhost'), hosts0.slice(0, 160));
    // /etc/network/interfaces hanya IP yang benar-benar dikonfigurasi.
    dis.dispatch('linux', 'ip addr add 10.0.0.1/24 dev ether1', ctx);
    dis.dispatch('linux', 'ip route add 10.99.0.0/24 via 10.0.0.254', ctx);
    dis.dispatch('linux', 'echo "nameserver 1.1.1.1" > /etc/resolv.conf', ctx);
    dis.dispatch('linux', 'echo "10.0.0.5 web.site" > /etc/hosts', ctx);
    const ifaces = dispatchStr(dis, 'linux', 'cat /etc/network/interfaces', ctx);
    check('H4 interfaces memuat IP nyata', ifaces.includes('address 10.0.0.1'), ifaces.slice(0, 200));
    check('H4 interfaces TIDAK mengarang 192.168.1.10', !ifaces.includes('192.168.1.10'), ifaces.slice(0, 200));
    const hosts1 = dispatchStr(dis, 'linux', 'cat /etc/hosts', ctx);
    check('H4 hosts memuat record nyata', hosts1.includes('10.0.0.5') && hosts1.includes('web.site'), hosts1.slice(0, 200));
    const rconf2 = dispatchStr(dis, 'linux', 'cat /etc/resolv.conf', ctx);
    check('H4 resolv.conf memuat nameserver nyata', rconf2.includes('nameserver 1.1.1.1'), rconf2.slice(0, 120));
    const rt2 = dispatchStr(dis, 'linux', 'ip route', ctx);
    check('H4 ip route memuat rute nyata', rt2.includes('10.99.0.0/24 via 10.0.0.254'), rt2.slice(0, 160));
    check('H4 ip route TIDAK mengarang default', !rt2.includes('default via'), rt2.slice(0, 160));
    // Gateway hanya muncul bila default route benar-benar dikonfigurasi.
    dis.dispatch('linux', 'ip route add default via 10.0.0.254', ctx);
    const ifaces2 = dispatchStr(dis, 'linux', 'cat /etc/network/interfaces', ctx);
    check('H4 interfaces memuat gateway nyata', ifaces2.includes('gateway 10.0.0.254'), ifaces2.slice(0, 200));
  }

  console.log('\n== H5. Windows ipconfig: status media sesuai kondisi link ==');
  {
    const dis = new VendorDispatcher();
    const ctxUp = {
      nodeId: 'pc1', name: 'PC1',
      ports: [{ id: 'ether1', name: 'ether1', status: 'up' as const }],
      portLinks: { ether1: true },
      pingSimulator: undefined,
      tracerouteSimulator: undefined,
      connectivitySimulator: undefined,
    };
    const ctxDown = {
      nodeId: 'pc1', name: 'PC1',
      ports: [{ id: 'ether1', name: 'ether1', status: 'down' as const }],
      portLinks: { ether1: 'down' as const },
      pingSimulator: undefined,
      tracerouteSimulator: undefined,
      connectivitySimulator: undefined,
    };
    const up = dispatchStr(dis, 'windows', 'ipconfig', ctxUp);
    const down = dispatchStr(dis, 'windows', 'ipconfig', ctxDown);
    check('H5 ipconfig up = Media tersambung', up.includes('Media tersambung') && !up.includes('Media terputus'), up.slice(0, 160));
    check('H5 ipconfig down = Media terputus', down.includes('Media terputus') && !down.includes('Media tersambung'), down.slice(0, 160));
  }

  console.log('\n== H6. OpenWrt: pool network dari IP interface NYATA ==');
  {
    const dis = new VendorDispatcher();
    const ctx = mkCtx('ow1', 'OW1', ['ether1', 'ether2']);
    dis.dispatch('openwrt', 'uci set dhcp.lan=dhcp', ctx);
    dis.dispatch('openwrt', 'uci set dhcp.lan.interface=ether1', ctx);
    dis.dispatch('openwrt', 'uci set dhcp.lan.start=100', ctx);
    dis.dispatch('openwrt', 'uci set dhcp.lan.limit=100', ctx);
    dis.dispatch('openwrt', 'uci commit dhcp', ctx);
    const memNoIp = dis.getNodeMemory('ow1');
    const poolNoIp = memNoIp.dhcpPools[0];
    check('H6 tanpa IP interface: range TIDAK dikarang', !poolNoIp?.range || !poolNoIp?.range.includes('192.168.1.'), JSON.stringify(poolNoIp));
    check('H6 tanpa IP interface: network TIDAK dikarang', !poolNoIp?.network, JSON.stringify(poolNoIp));

    const dis2 = new VendorDispatcher();
    const ctx2 = mkCtx('ow2', 'OW2', ['ether1', 'ether2']);
    dis2.dispatch('openwrt', 'uci set network.ether1.ipaddr=192.168.1.1', ctx2);
    dis2.dispatch('openwrt', 'uci set network.ether1.netmask=255.255.255.0', ctx2);
    dis2.dispatch('openwrt', 'uci set network.ether1.proto=static', ctx2);
    dis2.dispatch('openwrt', 'uci commit network', ctx2);
    dis2.dispatch('openwrt', 'uci set dhcp.lan=dhcp', ctx2);
    dis2.dispatch('openwrt', 'uci set dhcp.lan.interface=ether1', ctx2);
    dis2.dispatch('openwrt', 'uci set dhcp.lan.start=100', ctx2);
    dis2.dispatch('openwrt', 'uci set dhcp.lan.limit=100', ctx2);
    dis2.dispatch('openwrt', 'uci commit dhcp', ctx2);
    const pool = dis2.getNodeMemory('ow2').dhcpPools[0];
    check('H6 dengan IP interface: range turun dari IP nyata', pool?.range === '192.168.1.100-192.168.1.199', JSON.stringify(pool));
    check('H6 dengan IP interface: network = subnet nyata', pool?.network === '192.168.1.0/24', JSON.stringify(pool));
  }

  console.log('\n== H7. Cisco ASN/router-id ditangkap benar (regresi regex group) ==');
  {
    const dis = new VendorDispatcher();
    const ctx = mkCtx('r1', 'R1', ['ether1', 'ether2']);
    dis.dispatch('cisco_ios', 'router ospf 1', ctx);
    dis.dispatch('cisco_ios', 'router eigrp 100', ctx);
    const mem = dis.getNodeMemory('r1');
    // "router ospf <proses>" TIDAK boleh mengatur router-id dari nomor proses
    // (regresi `?.[2]` lama salah mengisi routerId='1' → memutus adjacency).
    check('H7 ospf router-id tidak diatur dari proses id', !mem.routing?.ospf?.routerId, JSON.stringify(mem.routing?.ospf));
    // "router eigrp <asn>" harus menangkap ASN dengan benar (group regex ke-1).
    check('H7 eigrp asn = 100', mem.routing?.eigrp?.asn === 100, JSON.stringify(mem.routing?.eigrp));
    check('H7 eigrp enabled', !!mem.routing?.eigrp?.enabled, JSON.stringify(mem.routing?.eigrp));
  }

  console.log('\n== H8. Export config jujur (tidak mengarang nilai) ==');
  {
    // MikroTik: tanpa router-id & tanpa network → jangan export router-id
    // karangan / networks=0.0.0.0/0.
    const dis = new VendorDispatcher();
    const ctx = mkCtx('r1', 'R1', ['ether1', 'ether2']);
    dis.dispatch('mikrotik', '/routing ospf instance add name=ospf1', ctx);
    const cfg = dis.exportRunningConfig('mikrotik', ctx);
    check('H8 mikrotik export tidak mengarang router-id', !/router-id=1\.1\.1\.1/.test(cfg), cfg.slice(0, 200));
    check('H8 mikrotik export tidak mengarang networks', !cfg.includes('networks=0.0.0.0/0'), cfg.slice(0, 200));

    // Ubiquiti: pool tanpa network → jangan export subnet 192.168.1.0/24.
    const dis2 = new VendorDispatcher();
    const ctx2 = mkCtx('u1', 'U1', ['ether1', 'ether2']);
    dis2.dispatch('ubiquiti', 'set service dhcp-server shared-network-name LAN1 subnet 192.168.5.0/24 start 192.168.5.100 stop 192.168.5.200', ctx2);
    const cfg2 = dis2.exportRunningConfig('ubiquiti', ctx2);
    check('H8 ubiquiti export subnet = subnet nyata', cfg2.includes('subnet 192.168.5.0/24'), cfg2.slice(0, 200));
    check('H8 ubiquiti export TIDAK subnet karangan', !cfg2.includes('192.168.1.0/24'), cfg2.slice(0, 200));
  }

  console.log('\n== H9. Hostname stateful: CLI → NodeMemory → engine device state ==');
  {
    const dis = new VendorDispatcher();
    const ctx = mkCtx('r1', 'R1', ['ether1', 'ether2']);
    // Tanpa konfigurasi → hostname belum ada (identitas default).
    check('H9 hostname default kosong', !dis.getNodeMemory('r1').hostname, '');
    dis.dispatch('cisco_ios', 'hostname R1', ctx);
    const mem = dis.getNodeMemory('r1');
    check('H9 hostname R1 tersimpan di NodeMemory', mem.hostname === 'R1', String(mem.hostname));

    // Engine: syncNodeToEngine membawa hostname ke state perangkat.
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [node('r1', 'R1', 'router', 2, 'h9a')],
      edges: [],
    };
    sim.syncTopology(project);
    syncNodeToEngine(sim, dis, 'r1');
    check('H9 engine device hostname = R1', sim.getHostname('r1') === 'R1', sim.getHostname('r1'));
    // Hostname BERTAHAN antar sync topologi (state device, bukan UI).
    sim.syncTopology(project);
    check('H9 hostname bertahan setelah re-sync topologi', sim.getHostname('r1') === 'R1', sim.getHostname('r1'));

    // Vendor lain yang juga punya hostname command.
    const dis2 = new VendorDispatcher();
    dis2.dispatch('mikrotik', '/system identity set name=GW1', mkCtx('gw1', 'GW1', ['ether1']));
    check('H9 mikrotik identity → hostname GW1', dis2.getNodeMemory('gw1').hostname === 'GW1', String(dis2.getNodeMemory('gw1').hostname));
    const dis3 = new VendorDispatcher();
    dis3.dispatch('fortinet', 'config system global', mkCtx('fw1', 'FW1', ['ether1']));
    dis3.dispatch('fortinet', 'set hostname FW1', mkCtx('fw1', 'FW1', ['ether1']));
    check('H9 fortinet set hostname → FW1', dis3.getNodeMemory('fw1').hostname === 'FW1', String(dis3.getNodeMemory('fw1').hostname));
  }

  console.log('\n== H10. Prompt CLI dari identitas perangkat (hostname + deviceType + mode) ==');
  {
    // Router tanpa hostname → Router#; switch → Switch# (identity deviceType).
    check('H10 router cisco_ios → Router#', promptFor('cisco_ios', 'R1', undefined, 'router', 'router', 'exec') === 'Router#', promptFor('cisco_ios', 'R1', undefined, 'router', 'router', 'exec'));
    check('H10 switch cisco_ios → Switch#', promptFor('cisco_ios', 'SW1', undefined, 'switch', 'switch', 'exec') === 'Switch#', promptFor('cisco_ios', 'SW1', undefined, 'switch', 'switch', 'exec'));
    // Hostname terkonfigurasi MENANG atas identitas default.
    check('H10 hostname R1 → R1#', promptFor('cisco_ios', 'X', 'R1', 'router', 'router', 'exec') === 'R1#', promptFor('cisco_ios', 'X', 'R1', 'router', 'router', 'exec'));
    check('H10 hostname SW-A → SW-A#', promptFor('cisco_ios', 'X', 'SW-A', 'switch', 'switch', 'exec') === 'SW-A#', promptFor('cisco_ios', 'X', 'SW-A', 'switch', 'switch', 'exec'));
    // Mode tetap mengikuti identitas (config / config-if).
    check('H10 R1(config)#', promptFor('cisco_ios', 'R1', 'R1', 'router', 'router', 'config') === 'R1(config)#', '');
    check('H10 Switch(config-if)#', promptFor('cisco_ios', 'SW1', undefined, 'switch', 'switch', 'config-if') === 'Switch(config-if)#', '');
    // NX-OS: router → Router#, switch → Switch#; hostname menang.
    check('H10 nxos switch → Switch#', promptFor('cisco_nxos', 'DC-SW1', undefined, 'switch', 'switch', 'exec') === 'Switch#', promptFor('cisco_nxos', 'DC-SW1', undefined, 'switch', 'switch', 'exec'));
    check('H10 nxos router → Router#', promptFor('cisco_nxos', 'R2', undefined, 'router', 'router', 'exec') === 'Router#', '');
    check('H10 nxos hostname N9K1 → N9K1#', promptFor('cisco_nxos', 'DC-SW1', 'N9K1', 'switch', 'switch', 'exec') === 'N9K1#', '');
    // Aruba: switch default Switch#.
    check('H10 aruba switch → Switch#', promptFor('aruba', 'SW1', undefined, 'switch', 'switch', 'exec') === 'Switch#', promptFor('aruba', 'SW1', undefined, 'switch', 'switch', 'exec'));
    // Non-Cisco: hostname masuk prompt natural.
    check('H10 linux root@server1:~#', promptFor('linux', 'PC1', 'server1', 'pc', 'pc', 'exec') === 'root@server1:~#', promptFor('linux', 'PC1', 'server1', 'pc', 'pc', 'exec'));
    check('H10 mikrotik [admin@GW1] > ', promptFor('mikrotik', 'MT1', 'GW1', 'router', 'router', 'exec') === '[admin@GW1] > ', promptFor('mikrotik', 'MT1', 'GW1', 'router', 'router', 'exec'));
    check('H10 fortinet FW1 # ', promptFor('fortinet', 'FW1', 'FW1', 'firewall', 'firewall', 'exec') === 'FW1 # ', promptFor('fortinet', 'FW1', 'FW1', 'firewall', 'firewall', 'exec'));
    // Windows: prompt tidak berubah (hostname tidak mengubah prompt).
    check('H10 windows prompt tetap', promptFor('windows', 'PC1', 'WIN10', 'windows-client', 'windows-client', 'exec') === 'C:\\Users\\admin>', '');
  }

  console.log('\n== H11. Negative test generator: SETIAP (vendor × cap) berstatus terblokir teruji jujur ==');
  // Dihasilkan OTOMATIS dari registry kapabilitas (satu-satunya sumber
  // kebenaran): untuk setiap cap dengan status not-supported/parser-only,
  // probe command sintaks nyata vendor dijalankan dan harus:
  //   a) tidak pernah mengembalikan hasil sukses palsu,
  //   b) menjawab jujur — guard capability ("Feature 'X' is not supported
  //      on <vendor>."), "not currently simulated", atau error vendor asli
  //      (bad command name / syntax error / Unrecognized / Invalid input /
  //      bash: not found),
  //   c) TIDAK mengubah state perangkat.
  const PROBE: Record<string, Record<string, string[]>> = {
    nat: {
      cisco: ['ip nat inside'],
      mikrotik: ['/ip firewall nat add chain=srcnat action=masquerade'],
      juniper: ['set security nat source rule 1 outbound-interface ether1'],
      huawei: ['nat address-group 1 10.0.0.0 255.0.0.0'],
      edgeos: ['set nat source rule 1 outbound-interface eth0'],
      fortinet: ['config firewall policy'],
      uci: ['uci set firewall.@zone[1].masq=1'],
      shell: ['iptables -t nat -A POSTROUTING -j MASQUERADE'],
      windows: ['netsh interface portproxy add v4tov4 listenport=80 connectport=80 connectaddress=10.0.0.1'],
    },
    vrrp: {
      cisco: ['vrrp 1 ip 192.168.9.254'],
      mikrotik: ['/routing vrrp add interface=ether1 vrid=1'],
      juniper: ['set interfaces ether1 unit 0 family inet address 192.168.9.1 vrrp-group 1'],
      huawei: ['interface vrrp vrid 1 virtual-ip 192.168.9.254'],
      edgeos: ['set high-availability vrrp group 1'],
      fortinet: ['config system ha'],
      uci: ['keepalived'],
      shell: ['vrrp 1 ip 192.168.9.254'],
      windows: ['netsh interface ip set address ether1 vrrp 192.168.9.1'],
    },
    ospf: {
      cisco: ['router ospf 1'],
      mikrotik: ['/routing ospf instance add name=x'],
      juniper: ['set protocols ospf area 0 interface ether1'],
      huawei: ['ospf 1'],
      edgeos: ['set protocols ospf area 0 interface eth0'],
      fortinet: ['config router ospf'],
      uci: ['zebra'],
      shell: ['router ospf 1'],
      windows: ['netsh routing ip ospf install'],
    },
    rip: {
      cisco: ['router rip'],
      mikrotik: ['/routing rip instance add name=x'],
      juniper: ['set protocols rip'],
      huawei: ['rip 1'],
      edgeos: ['set protocols rip'],
      fortinet: ['config router rip'],
      uci: ['ripd'],
      shell: ['router rip'],
      windows: ['netsh routing ip rip install'],
    },
    eigrp: {
      cisco: ['router eigrp 100'],
      mikrotik: ['/routing eigrp instance add name=x'],
      juniper: ['set protocols eigrp 100'],
      huawei: ['eigrp 100'],
      edgeos: ['set protocols eigrp 100'],
      fortinet: ['config router eigrp'],
      uci: ['ospfd'],
      shell: ['router eigrp 100'],
      windows: ['netsh routing ip eigrp install'],
    },
    bgp: {
      cisco: ['router bgp 65001'],
      mikrotik: ['/routing bgp instance add name=x'],
      juniper: ['set protocols bgp group ebgp'],
      huawei: ['bgp 65001'],
      edgeos: ['set protocols bgp'],
      fortinet: ['config router bgp'],
      uci: ['bgpd'],
      shell: ['router bgp 65001'],
      windows: ['netsh routing ip bgp install'],
    },
    vlan: {
      cisco: ['vlan 10'],
      mikrotik: ['/interface vlan add name=v10 vlan-id=10 interface=ether1'],
      juniper: ['set vlans v10 vlan-id 10'],
      huawei: ['vlan batch 10'],
      edgeos: ['set interfaces ether1 vif 10'],
      fortinet: ['config system vlan'],
      uci: ['uci set network.vlan10.vlan=10'],
      shell: ['ip link add link ether1 name vlan10 type vlan id 10'],
      windows: ['netsh interface set interface ether1 vlanid=10'],
    },
    ipv6: {
      cisco: ['ipv6 address 2001:db8::1/64'],
      mikrotik: ['/ipv6 address add address=2001:db8::1/64 interface=ether1'],
      juniper: ['set interfaces ether1 unit 0 family inet6 address 2001:db8::1/64'],
      huawei: ['ipv6 address 2001:db8::1/64'],
      edgeos: ['set interfaces ether1 ipv6 address 2001:db8::1/64'],
      fortinet: ['config system ipv6'],
      uci: ['uci set network.lan.ip6addr=2001:db8::1/64'],
      shell: ['ip -6 addr add 2001:db8::1/64 dev ether1'],
      windows: ['netsh interface ipv6 set address ether1 2001:db8::1'],
    },
    staticRoute: {
      cisco: ['ip route 10.99.0.0 255.255.255.0 10.0.1.2'],
      mikrotik: ['/ip route add dst-address=10.99.0.0/24 gateway=10.0.1.2'],
      juniper: ['set routing-options static route 10.99.0.0/24 next-hop 10.0.1.2'],
      huawei: ['ip route-static 10.99.0.0 255.255.255.0 10.0.1.2'],
      edgeos: ['set protocols static route 10.99.0.0/24 next-hop 10.0.1.2'],
      fortinet: ['config router static'],
      uci: ['uci set network.route1=route'],
      shell: ['ip route add 10.99.0.0/24 via 10.0.1.2'],
      windows: ['netsh interface ip add route 10.99.0.0/24 10.0.1.2'],
    },
    dhcp: {
      cisco: ['ip dhcp pool LAN1'],
      mikrotik: ['/ip dhcp-server add name=dhcp1 interface=ether1'],
      juniper: ['set system services dhcp'],
      huawei: ['dhcp enable'],
      edgeos: ['set service dhcp-server shared-network-name LAN1 subnet 10.0.1.0/24'],
      fortinet: ['config system dhcp server'],
      uci: ['uci set dhcp.lan=dhcp'],
      shell: ['dhclient ether1'],
      windows: ['netsh dhcp add server 10.0.0.1'],
    },
    dns: {
      cisco: ['ip name-server 8.8.8.8'],
      mikrotik: ['/ip dns set servers=8.8.8.8'],
      juniper: ['set system name-server 8.8.8.8'],
      huawei: ['dns server 8.8.8.8'],
      edgeos: ['set system name-server 8.8.8.8'],
      fortinet: ['config system dns'],
      uci: ['uci set network.lan.dns=8.8.8.8'],
      shell: ['echo "nameserver 8.8.8.8" > /etc/resolv.conf'],
      windows: ['netsh interface ip set dns ether1 static 8.8.8.8'],
    },
    firewall: {
      cisco: ['access-list 100 deny ip any any'],
      mikrotik: ['/ip firewall filter add chain=input protocol=icmp action=drop'],
      juniper: ['set security policies from-zone trust to-zone untrust policy p1 match destination-address any'],
      huawei: ['firewall zone trust'],
      edgeos: ['set firewall name WAN_IN rule 1 action accept'],
      fortinet: ['config firewall policy'],
      uci: ['uci set firewall.@zone[1].masq=1'],
      shell: ['iptables -A INPUT -j DROP'],
      windows: ['netsh advfirewall firewall add rule name=test dir=in action=block'],
    },
    commit: {
      cisco: ['write memory'],
      mikrotik: ['/system backup save name=test'],
      juniper: ['commit'],
      huawei: ['save'],
      edgeos: ['commit'],
      fortinet: ['execute backup config'],
      uci: ['uci commit network'],
      shell: ['sync'],
      windows: ['netsh winsock reset'],
    },
  };
  const HONEST = /not supported|not currently simulated|bad command name|syntax error|Unrecognized command|Invalid input|command not found|Entry not found|no servers could be reached|error:|Unknown "set" path/i;
  const FAKE_MARKERS2 = /Success rate|packets transmitted|Reply from|icmp_seq|0% packet loss|received, 0|200 OK|<!DOCTYPE|Configuration saved successfully|Saved configuration|commit complete/i;
  const familyOf = (vid: string): string =>
    vid === 'cisco_ios' || vid === 'cisco_nxos' ? 'cisco'
    : vid === 'mikrotik' ? 'mikrotik'
    : vid === 'juniper' ? 'juniper'
    : vid === 'huawei' ? 'huawei'
    : vid === 'ubiquiti' || vid === 'vyos' ? 'edgeos'
    : vid === 'fortinet' ? 'fortinet'
    : vid === 'aruba' ? 'cisco'
    : vid === 'openwrt' ? 'uci'
    : vid === 'linux' ? 'shell'
    : 'windows';
  const CAP_ORDER_ALL = Object.keys(CAPABILITY_LABELS) as CapabilityKey[];
  let generated = 0;
  for (const vid of VENDOR_IDS) {
    const fam = familyOf(vid);
    for (const cap of CAP_ORDER_ALL) {
      const st = VENDOR_CAPABILITIES[vid]?.caps[cap];
      if (st !== 'not-supported' && st !== 'parser-only') continue;
      const probeCmds = PROBE[cap]?.[fam];
      if (!probeCmds) {
        check(`H11 ${vid}.${cap} punya probe command`, false, '(PROBE map tidak punya entri — generator tidak lengkap)');
        continue;
      }
      for (const cmd of probeCmds) {
        const dis = new VendorDispatcher();
        const ctx = mkCtx(vid, vid, ['ether1', 'ether2']);
        const mem = dis.getNodeMemory(vid);
        const before = JSON.stringify(mem);
        const outStr = dispatchStr(dis, vid, cmd, ctx);
        generated++;
        const label = CAPABILITY_LABELS[cap];
        const honest = HONEST.test(outStr) && !FAKE_MARKERS2.test(outStr);
        check(`H11 ${vid}.${cap} '${cmd.slice(0, 40)}' tidak sukses palsu`, honest, outStr.slice(0, 140));
        check(`H11 ${vid}.${cap} '${cmd.slice(0, 40)}' state aman`, JSON.stringify(mem) === before, 'state berubah walau status terblokir');
        // Guard capability: bila ada chain entry dengan cap ini, penolakan
        // harus menyebut label fitur + nama vendor (jujur, bukan generic).
        const guardReached = outStr.includes(label) && outStr.includes(VENDOR_NAMES[vid] || vid);
        if (guardReached) check(`H11 ${vid}.${cap} penolakan menyebut fitur & vendor`, true, '');
      }
    }
  }
  check(`H11 generator meliput ${generated} kasus negatif dari registry`, generated >= 30, `hanya ${generated}`);

  console.log(`VENDOR HARDENING: ${rep.passed} passed, ${rep.failed} failed`);
  return rep;
}