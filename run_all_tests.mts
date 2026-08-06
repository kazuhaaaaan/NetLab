/**
 * Uji coba menyeluruh NetLab — semua file/fungsi utama.
 * Jalankan: npx tsx run_all_tests.mts
 */
import { VendorDispatcher } from './packages/vendors/src/index';
import { SimulationEngine } from './src/engine/sim';
import { formatPingOutput } from './src/engine/sim/formatPing';
import {
  getModelsForVendor,
  getDefaultModel,
  getPortsForModel,
} from './src/data/deviceModels';
import { CLI_HINTS } from './src/data/cliHints';
import { BEGINNER_GUIDES } from './src/data/beginnerGuide';
import { TEMPLATE_BASIC, TEMPLATE_ENTERPRISE } from './src/data/templates';
import { LabProject } from './src/types';
import { NetworkSimulator } from './src/engine/net/core/NetworkSimulator';
import type { LabProjectLike } from './src/engine/net/core/Topology';
import type { AclRule, NatRule } from './src/engine/net/core/types';

let passed = 0;
let failed = 0;
const fails: string[] = [];

function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    passed++;
  } else {
    failed++;
    fails.push(`${name} ${detail}`);
  }
}

const VENDOR_IDS = [
  'mikrotik',
  'cisco_ios',
  'cisco_nxos',
  'juniper',
  'huawei',
  'ubiquiti',
  'vyos',
  'fortinet',
  'aruba',
  'openwrt',
  'linux',
];

const mkCtx = (nodeId: string, name: string, portNames: string[]) => ({
  nodeId,
  name,
  ports: portNames.map((n, i) => ({ id: n, name: n, status: (i === 0 ? 'up' : 'down') as 'up' | 'down' })),
  pingSimulator: undefined,
});

const okStr = (s: unknown) => typeof s === 'string' && !s.includes('[object Object]');

// ── 1. Data: deviceModels ────────────────────────────────────────────────
console.log('\n== 1. deviceModels ==');
{
  const all = VENDOR_IDS.map((v) => getModelsForVendor(v).length);
  check('semua vendor punya model', all.every((n) => n > 0), JSON.stringify(all));
  check('CRS326 = 26 port', getPortsForModel('mikrotik', 'CRS326-24G-2S+').length === 26);
  check('Nexus 3048 = 48 port', getPortsForModel('cisco_nxos', 'Nexus 3048').length === 48);
  check('hEX = 5 port', getPortsForModel('mikrotik', 'hEX (RB750Gr3)').length === 5);
  check('2960-X = 26 port', getPortsForModel('cisco_ios', 'Catalyst 2960-X').length === 26);
  const macs = getPortsForModel('mikrotik', 'CRS326-24G-2S+').map((p) => p.macAddress);
  check('MAC unik semua', new Set(macs).size === macs.length);
  const ciscoMacs = getPortsForModel('cisco_ios', 'Catalyst 2960-X').map((p) => p.macAddress);
  check('MAC cisco unik', new Set(ciscoMacs).size === ciscoMacs.length);
  check('default router mikrotik', getDefaultModel('mikrotik', 'router') === 'hEX (RB750Gr3)');
  check('default switch cisco', getDefaultModel('cisco_ios', 'switch') === 'Catalyst 2960-X');
  check('default server linux', getDefaultModel('linux', 'server') === 'Debian 12 (Bookworm)');
  check('model tidak dikenal -> fallback aman', getPortsForModel('mikrotik', 'XYZ').length > 0);
  check('port punya speedMbps', getPortsForModel('mikrotik', 'CCR2004-1G-12S+2XS').some((p) => p.speedMbps === 10000));
}

// ── 2. Vendor engine: perintah dasar tiap vendor ─────────────────────────
console.log('\n== 2. Vendor engine ==');
{
  const d = new VendorDispatcher();
  const ctx = mkCtx('n1', 'R1-GW', ['p1', 'p2', 'p3']);
  d.setNodeModelLabel('n1', 'hEX (RB750Gr3)');

  const versionCmd: Record<string, string> = {
    mikrotik: '/system resource print',
    cisco_ios: 'show version',
    cisco_nxos: 'show version',
    juniper: 'show version',
    huawei: 'display version',
    ubiquiti: 'show version',
    vyos: 'show version',
    fortinet: 'get system status',
    aruba: 'show version',
    openwrt: 'cat /etc/openwrt_release',
    linux: 'uname -a',
  };
  for (const v of VENDOR_IDS) {
    const out = d.dispatch(v, versionCmd[v], ctx);
    check(`version ${v} non-empty`, okStr(out) && out.trim().length > 0, JSON.stringify(out?.slice?.(0, 80)));
  }

  const hostnameCmd: Record<string, string[]> = {
    mikrotik: ['/system identity set name=Test1'],
    cisco_ios: ['hostname Test1'],
    cisco_nxos: ['hostname Test1'],
    juniper: ['set system host-name Test1'],
    huawei: ['sysname Test1'],
    ubiquiti: ['set system host-name Test1'],
    vyos: ['set system host-name Test1'],
    fortinet: ['config system global', 'set hostname "Test1"', 'end'],
    aruba: ['hostname Test1'],
    openwrt: ['uci set system.@system[0].hostname=Test1'],
    linux: ['hostname Test1'],
  };
  for (const v of VENDOR_IDS) {
    const id = `n_${v}`;
    const c = mkCtx(id, `${v}-gw`, ['p1', 'p2']);
    for (const cmd of hostnameCmd[v]) d.dispatch(v, cmd, c);
    const mem = d.getNodeMemory(id);
    check(`hostname ${v} tersimpan`, mem.hostname === 'Test1', `hostname=${mem.hostname}`);
  }

  const ipCmd: Record<string, string[]> = {
    mikrotik: ['/ip address add address=192.168.88.1/24 interface=p1'],
    cisco_ios: ['interface p1', 'ip address 192.168.88.1 255.255.255.0'],
    cisco_nxos: ['interface p1', 'ip address 192.168.88.1 255.255.255.0'],
    juniper: ['set interfaces p1 unit 0 family inet address 192.168.88.1/24'],
    huawei: ['interface p1', 'ip address 192.168.88.1 255.255.255.0'],
    ubiquiti: ['set interfaces ethernet p1 address 192.168.88.1/24'],
    vyos: ['set interfaces ethernet p1 address 192.168.88.1/24'],
    fortinet: ['config system interface', 'edit p1', 'set ip 192.168.88.1 255.255.255.0', 'end'],
    aruba: ['interface p1', 'ip address 192.168.88.1 255.255.255.0'],
    openwrt: ['ip addr add 192.168.88.1/24 dev p1'],
    linux: ['ip addr add 192.168.88.1/24 dev p1'],
  };
  for (const v of VENDOR_IDS) {
    const id = `ip_${v}`;
    const c = mkCtx(id, `${v}-gw`, ['p1', 'p2']);
    for (const cmd of ipCmd[v]) d.dispatch(v, cmd, c);
    const mem = d.getNodeMemory(id);
    check(`ip ${v} tersimpan`, Object.keys(mem.configuredIps).length > 0, JSON.stringify(mem.configuredIps));
  }

  const routeCmd: Record<string, string[]> = {
    mikrotik: ['/ip route add dst-address=10.10.10.0/24 gateway=192.168.88.254'],
    cisco_ios: ['ip route 10.10.10.0 255.255.255.0 192.168.88.254'],
    cisco_nxos: ['ip route 10.10.10.0 255.255.255.0 192.168.88.254'],
    juniper: ['set routing-options static route 10.10.10.0/24 next-hop 192.168.88.254'],
    huawei: ['ip route-static 10.10.10.0 24 192.168.88.254'],
    ubiquiti: ['set protocols static route 10.10.10.0/24 next-hop 192.168.88.254'],
    vyos: ['set protocols static route 10.10.10.0/24 next-hop 192.168.88.254'],
    fortinet: ['config router static', 'edit 1', 'set dst 10.10.10.0 255.255.255.0', 'set gateway 192.168.88.254', 'end'],
    aruba: ['ip route 10.10.10.0 255.255.255.0 192.168.88.254'],
    openwrt: ['ip route add 10.10.10.0/24 via 192.168.88.254'],
    linux: ['ip route add 10.10.10.0/24 via 192.168.88.254 dev p1'],
  };
  for (const v of VENDOR_IDS) {
    const id = `rt_${v}`;
    const c = mkCtx(id, `${v}-gw`, ['p1', 'p2']);
    for (const cmd of routeCmd[v]) d.dispatch(v, cmd, c);
    const mem = d.getNodeMemory(id);
    check(`route ${v} tersimpan`, mem.routes.length > 0, JSON.stringify(mem.routes));
  }
}

// ── 3. Vendor engine: fitur lanjutan (vlan/dhcp/dns/nat + running config) ─
console.log('\n== 3. Vendor lanjutan ==');
{
  const d = new VendorDispatcher();

  // MikroTik lengkap
  const mt = mkCtx('mt1', 'MT-GW', ['ether1', 'ether2']);
  d.dispatch('mikrotik', '/system identity set name=Router-Kantor', mt);
  d.dispatch('mikrotik', '/ip dns set servers=8.8.8.8', mt);
  d.dispatch('mikrotik', '/ip pool add name=pool1 ranges=192.168.88.100-192.168.88.200', mt);
  d.dispatch('mikrotik', '/ip dhcp-server add name=dhcp1 interface=ether1 address-pool=pool1', mt);
  d.dispatch('mikrotik', '/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade', mt);
  d.dispatch('mikrotik', '/interface vlan add name=vlan10 vlan-id=10 interface=ether2', mt);
  const mtMem = d.getNodeMemory('mt1');
  check('MT dns 1 entry', mtMem.dnsServers.length === 1);
  check('MT dhcp pool 1 entry', mtMem.dhcpPools.length === 1);
  check('MT nat 1 entry', mtMem.natRules.length === 1);
  check('MT vlan 1 entry (nama utuh)', mtMem.vlans.length === 1 && mtMem.vlans[0].name === 'vlan10');
  for (const [cmd, label] of [
    ['/system identity print', 'identity'],
    ['/ip dns print', 'dns'],
    ['/ip dhcp-server print', 'dhcp'],
    ['/ip firewall nat print', 'nat'],
    ['/interface vlan print', 'vlan'],
  ] as const) {
    const out = d.dispatch('mikrotik', cmd, mt);
    check(`MT print ${label} ter-handle`, okStr(out) && !out.includes('Command executed'), JSON.stringify(out?.slice?.(0, 60)));
  }
  const exportOut = d.dispatch('mikrotik', 'export', mt);
  check('MT export = running config', okStr(exportOut) && exportOut.includes('/ip dns set') && exportOut.includes('name=vlan10'));

  // Cisco dhcp pool + vlan
  const cs = mkCtx('cs1', 'SW1', ['Gi0/1', 'Gi0/2']);
  d.dispatch('cisco_ios', 'hostname R1', cs);
  d.dispatch('cisco_ios', 'vlan 10', cs);
  d.dispatch('cisco_ios', 'ip dhcp pool LAN1', cs);
  d.dispatch('cisco_ios', 'network 192.168.88.0 255.255.255.0', cs);
  d.dispatch('cisco_ios', 'default-router 192.168.88.1', cs);
  const csMem = d.getNodeMemory('cs1');
  check('cisco vlan 10', csMem.vlans.length === 1 && csMem.vlans[0].id === '10');
  check('cisco dhcp pool', csMem.dhcpPools.length === 1 && csMem.dhcpPools[0].name === 'LAN1');
  const showRun = d.dispatch('cisco_ios', 'show running-config', cs);
  check('cisco show run berisi vlan+hostname', okStr(showRun) && showRun.includes('hostname R1') && showRun.includes('vlan 10'));
  const showVlan = d.dispatch('cisco_ios', 'show vlan', cs);
  check('cisco show vlan', okStr(showVlan) && showVlan.includes('10'));
  const showDhcp = d.dispatch('cisco_ios', 'show ip dhcp pool', cs);
  check('cisco show dhcp pool', okStr(showDhcp) && showDhcp.includes('LAN1'));

  // Juniper running config
  const jp = mkCtx('jp1', 'SRX1', ['ge-0/0/0']);
  d.dispatch('juniper', 'set system host-name SRX1', jp);
  d.dispatch('juniper', 'set interfaces ge-0/0/0 unit 0 family inet address 10.0.0.1/30', jp);
  const jpCfg = d.dispatch('juniper', 'show configuration', jp);
  check('juniper show config', okStr(jpCfg) && jpCfg.includes('set interfaces ge-0/0/0') && jpCfg.includes('10.0.0.1'), JSON.stringify(jpCfg));

  // Huawei
  const hw = mkCtx('hw1', 'AR1', ['GigabitEthernet0/0/1']);
  d.dispatch('huawei', 'sysname AR1', hw);
  d.dispatch('huawei', 'interface GigabitEthernet0/0/1', hw);
  d.dispatch('huawei', 'ip address 10.1.1.1 255.255.255.0', hw);
  const hwCfg = d.dispatch('huawei', 'display current-configuration', hw);
  check('huawei display current', okStr(hwCfg) && hwCfg.includes('10.1.1.1'));

  // Fortinet
  const ft = mkCtx('ft1', 'FG1', ['port1']);
  d.dispatch('fortinet', 'get system status', ft);
  d.dispatch('fortinet', 'config system global', ft);
  d.dispatch('fortinet', 'set hostname "FG1"', ft);
  d.dispatch('fortinet', 'end', ft);
  const ftCfg = d.dispatch('fortinet', 'show full-configuration', ft);
  check('fortinet running config', okStr(ftCfg));

  // OpenWrt + Linux
  const ow = mkCtx('ow1', 'AP1', ['eth0']);
  d.dispatch('openwrt', 'uci set network.lan.ipaddr=192.168.1.1', ow);
  const owShow = d.dispatch('openwrt', 'uci show', ow);
  check('openwrt uci show', okStr(owShow));
  const lx = mkCtx('lx1', 'SRV1', ['eth0']);
  d.dispatch('linux', 'ip addr add 172.16.0.10/24 dev eth0', lx);
  const lxOut = d.dispatch('linux', 'ip addr show', lx);
  check('linux ip addr show', okStr(lxOut) && lxOut.includes('172.16.0.10'));

  // Serialisasi → restore (simulasi reload)
  const snapshot = d.serializeMemory();
  const d2 = new VendorDispatcher();
  d2.restoreMemory(snapshot);
  const mem2 = d2.getNodeMemory('mt1');
  check('restore: MT hostname', mem2.hostname === 'Router-Kantor');
  check('restore: MT dns', mem2.dnsServers.length === 1);
  check('restore: cisco dhcp', d2.getNodeMemory('cs1').dhcpPools.length === 1);
  check('restore: model label', d2.getNodeMemory('cs1').modelLabel === d.getNodeMemory('cs1').modelLabel);
  d2.forgetNodeMemory('mt1');
  check('forgetNodeMemory menghapus', d2.getNodeMemory('mt1').hostname === '');
}

// ── 4. SimulationEngine (ping hop-by-hop) ────────────────────────────────
console.log('\n== 4. SimulationEngine ==');
{
  const base: Omit<LabProject, 'nodes' | 'edges'> = {
    version: '1.0',
    metadata: { name: 'test', author: '', description: '', createdAt: '', updatedAt: '' },
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  const project: LabProject = {
    ...base,
    nodes: [
      { id: 'r1', name: 'R1', vendor: 'mikrotik', model: 'hEX (RB750Gr3)', deviceType: 'router', position: { x: 0, y: 0 }, ports: [{ id: 'ether1', name: 'ether1', speedMbps: 1000, status: 'up', macAddress: '00:00:00:00:00:01', type: 'copper' }] },
      { id: 'pc1', name: 'PC1', vendor: 'linux', model: 'Debian 12 (Bookworm)', deviceType: 'pc', position: { x: 0, y: 0 }, ports: [{ id: 'eth0', name: 'eth0', speedMbps: 1000, status: 'up', macAddress: '00:00:00:00:00:02', type: 'copper' }] },
      { id: 'pc2', name: 'PC2', vendor: 'linux', model: 'Debian 12 (Bookworm)', deviceType: 'pc', position: { x: 0, y: 0 }, ports: [{ id: 'eth0', name: 'eth0', speedMbps: 1000, status: 'up', macAddress: '00:00:00:00:00:03', type: 'copper' }] },
    ],
    edges: [
      { id: 'e1', sourceNodeId: 'r1', sourcePortId: 'ether1', targetNodeId: 'pc1', targetPortId: 'eth0', cableType: 'copper_straight' },
      { id: 'e2', sourceNodeId: 'pc1', sourcePortId: 'eth0', targetNodeId: 'pc2', targetPortId: 'eth0', cableType: 'copper_cross' },
    ],
  };
  const sim = new SimulationEngine();
  sim.syncTopology(project);
  sim.applyNodeConfig('r1', { ether1: '192.168.88.1/24' }, []);
  sim.applyNodeConfig('pc1', { eth0: '192.168.88.2/24' }, []);
  sim.applyNodeConfig('pc2', { eth0: '192.168.88.3/24' }, []);

  const pingOk = sim.simulatePing('pc1', '192.168.88.1');
  check('ping sukses ke router', pingOk.success, JSON.stringify(pingOk));
  check('ping path berisi R1', pingOk.path.includes('R1'), JSON.stringify(pingOk.path));
  check('ttl di tujuan < 64', pingOk.ttlAtDestination > 0 && pingOk.ttlAtDestination < 64, String(pingOk.ttlAtDestination));

  const pingUnreach = sim.simulatePing('pc1', '10.99.99.99');
  check('ping unreachable (no route)', !pingUnreach.success && pingUnreach.reason === 'unreachable', JSON.stringify(pingUnreach));

  const pingInvalid = sim.simulatePing('pc1', 'not-an-ip');
  check('ip invalid ditolak', !pingInvalid.success && pingInvalid.reason === 'invalid');

  const sim2 = new SimulationEngine();
  const solo: LabProject = { ...base, nodes: [project.nodes[1]], edges: [] };
  sim2.syncTopology(solo);
  const pingNoIp = sim2.simulatePing('pc1', '192.168.88.1');
  check('no-ip terdeteksi', !pingNoIp.success && pingNoIp.reason === 'no-ip', JSON.stringify(pingNoIp));

  const fmt = formatPingOutput('mikrotik', '192.168.88.1', pingOk);
  check('formatPingOutput berisi reply', typeof fmt === 'string' && fmt.length > 0 && fmt.toLowerCase().includes('reply'), JSON.stringify(fmt?.slice?.(0, 60)));
}

// ── 5. Integritas data (hints, guide, template) ──────────────────────────
console.log('\n== 5. Integritas data ==');
{
  const hintVendors = Object.keys(CLI_HINTS);
  check('CLI_HINTS mencakup semua vendor', VENDOR_IDS.every((v) => hintVendors.includes(v)), `hints=${hintVendors.join(',')}`);
  for (const v of VENDOR_IDS) {
    const list = CLI_HINTS[v];
    check(`hints ${v} punya entri valid`, Array.isArray(list) && list.length > 0);
  }
  const guideVendors = BEGINNER_GUIDES.map((g) => g.vendorId);
  check('beginnerGuide mencakup semua vendor', VENDOR_IDS.every((v) => guideVendors.includes(v)), `guide=${guideVendors.join(',')}`);
  for (const g of BEGINNER_GUIDES) {
    check(`guide ${g.vendorId} punya capabilities`, Array.isArray(g.capabilities) && g.capabilities.length > 0);
    check(`guide ${g.vendorId} punya langkah`, Array.isArray(g.steps) && g.steps.length > 0);
    check(
      `guide ${g.vendorId} semua langkah punya explain+perintah`,
      g.steps.every((s) => typeof s.explain === 'string' && typeof s.command === 'string' && s.command.length > 0)
    );
  }
  for (const [name, tpl] of [
    ['TEMPLATE_BASIC', TEMPLATE_BASIC],
    ['TEMPLATE_ENTERPRISE', TEMPLATE_ENTERPRISE],
  ] as const) {
    check(`${name} punya node`, tpl.nodes.length > 0);
    if (name === 'TEMPLATE_ENTERPRISE') check(`${name} template besar punya >= 10 perangkat`, tpl.nodes.length >= 10);
    const nodeIds = new Set(tpl.nodes.map((n) => n.id));
    check(`${name} edge merujuk node valid`, tpl.edges.every((e) => nodeIds.has(e.sourceNodeId) && nodeIds.has(e.targetNodeId)));
    check(
      `${name} edge merujuk port valid`,
      tpl.edges.every((e) => {
        const s = tpl.nodes.find((n) => n.id === e.sourceNodeId);
        const t = tpl.nodes.find((n) => n.id === e.targetNodeId);
        return !!s?.ports.find((p) => p.id === e.sourcePortId) && !!t?.ports.find((p) => p.id === e.targetPortId);
      })
    );
    check(`${name} node punya model dari katalog`, tpl.nodes.every((n) => getModelsForVendor(n.vendor).some((m) => m.label === n.model)));
  }
}

// ── 6. Network engine: TCP, NAT, dstnat, ACL, DNS, LLDP, VLAN ─────────────
console.log('\n== 6. Network engine (TCP/NAT/ACL/DNS/VLAN) ==');
{
  const ePorts = (n: number, macSeed: string) =>
    Array.from({ length: n }, (_, i) => ({ id: `port${i + 1}`, name: `ether${i + 1}`, status: 'up', macAddress: `00:0c:29:${macSeed}:${(i + 1).toString().padStart(2, '0')}:01` }));
  const eNode = (id: string, name: string, deviceType: string, portCount: number, macSeed: string) => ({
    id, name, vendor: deviceType === 'pc' || deviceType === 'server' ? 'linux' : 'mikrotik', model: deviceType, deviceType,
    ports: ePorts(portCount, macSeed),
  });
  const eEdge = (id: string, a: string, ap: string, b: string, bp: string) => ({
    id, sourceNodeId: a, sourcePortId: ap, targetNodeId: b, targetPortId: bp, cableType: 'copper_straight',
  });

  // 6a. TCP/ACL/DNS/LLDP: layanan internal + routing antar-router
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('pc1', 'PC1', 'pc', 1, '01'), eNode('svr1', 'SVR1', 'server', 1, '02'), eNode('sw1', 'SW1', 'switch', 4, '03'),
        eNode('r1', 'R1', 'router', 3, '04'), eNode('r2', 'R2', 'router', 3, '05'), eNode('sw2', 'SW2', 'switch', 4, '06'),
        eNode('pc2', 'PC2', 'pc', 1, '07'), eNode('svr2', 'SVR2', 'server', 1, '08'),
      ],
      edges: [
        eEdge('e1', 'pc1', 'port1', 'sw1', 'port1'), eEdge('e2', 'svr1', 'port1', 'sw1', 'port2'), eEdge('e3', 'sw1', 'port3', 'r1', 'port1'),
        eEdge('e4', 'r1', 'port2', 'r2', 'port1'), eEdge('e5', 'r2', 'port2', 'sw2', 'port1'),
        eEdge('e6', 'sw2', 'port2', 'pc2', 'port1'), eEdge('e7', 'sw2', 'port3', 'svr2', 'port1'),
      ],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24', ether2: '192.168.1.1/30' }, [{ dst: '10.0.2.0/24', gateway: '192.168.1.2' }]);
    sim.applyNodeConfig('r2', { ether1: '192.168.1.2/30', ether2: '10.0.2.1/24' }, [{ dst: '10.0.1.0/24', gateway: '192.168.1.1' }]);
    sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
    sim.applyNodeConfig('svr1', { ether1: '10.0.1.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
    sim.applyNodeConfig('pc2', { ether1: '10.0.2.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.2.1' }]);
    sim.applyNodeConfig('svr2', { ether1: '10.0.2.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.2.1' }]);
    sim.setWebServer('svr1', { enabled: true, port: 80, content: 'Hello NetLab' });
    sim.setWebServer('svr2', { enabled: true, port: 80, content: 'Back' });
    sim.setDnsRecords('r1', [{ name: 'web.lab', address: '10.0.1.10' }]);
    sim.setDnsServers('pc1', ['10.0.1.1']);

    check('6a ping lintas router', sim.simulatePing('pc1', '10.0.2.2').success);
    const tcp = sim.simulateTcpConnect('pc1', '10.0.1.10', 80);
    check('6a TCP web: status+body', tcp.ok && tcp.status === 200 && tcp.body === 'Hello NetLab', JSON.stringify(tcp));
    check('6a TCP port tertutup ditolak', !sim.simulateTcpConnect('pc1', '10.0.1.10', 22).ok);
    check('6a TCP ke host tanpa server ditolak', !sim.simulateTcpConnect('pc1', '10.0.2.2', 80).ok);
    const dns = sim.resolveHostname('pc1', 'web.lab');
    check('6a DNS resolve via server', dns.resolved === '10.0.1.10', JSON.stringify(dns));
    check('6a LLDP R1 -> 2 tetangga', sim.getLldpNeighbors('r1').length === 2);
    check('6a LLDP PC1 -> SW1', sim.getLldpNeighbors('pc1').some((n) => n.peerNodeId === 'sw1'));

    sim.setAcls('r1', [{ action: 'deny', proto: 'icmp', src: '10.0.1.0/24', dst: '10.0.2.0/24' }] as AclRule[]);
    const blocked = sim.simulatePing('pc1', '10.0.2.2');
    check('6a ACL deny icmp memblok ping', !blocked.success && blocked.reason === 'blocked', JSON.stringify(blocked));
    check('6a ACL hanya icmp -> TCP tetap jalan', sim.simulateTcpConnect('pc1', '10.0.2.10', 80).body === 'Back');
    sim.setAcls('r1', undefined);
    check('6a ACL dicabut -> ping sukses', sim.simulatePing('pc1', '10.0.2.2').success);
  }

  // 6b. NAT masquerade (tanpa rute balik → NAT wajib agar sukses)
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('pc1', 'PC1', 'pc', 1, '01'), eNode('sw1', 'SW1', 'switch', 4, '02'), eNode('r1', 'R1', 'router', 3, '03'),
        eNode('r2', 'R2-ISP', 'router', 3, '04'), eNode('pub', 'PUB', 'server', 1, '05'),
      ],
      edges: [
        eEdge('e1', 'pc1', 'port1', 'sw1', 'port1'), eEdge('e2', 'sw1', 'port2', 'r1', 'port1'),
        eEdge('e3', 'r1', 'port2', 'r2', 'port1'), eEdge('e4', 'r2', 'port2', 'pub', 'port1'),
      ],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24', ether2: '203.0.113.1/24' }, [{ dst: '0.0.0.0/0', gateway: '203.0.113.254' }]);
    sim.applyNodeConfig('r2', { ether1: '203.0.113.254/24', ether2: '8.8.8.1/24' }, []);
    sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
    sim.applyNodeConfig('pub', { ether1: '8.8.8.8/24' }, [{ dst: '0.0.0.0/0', gateway: '8.8.8.1' }]);
    sim.setWebServer('pub', { enabled: true, port: 80, content: 'Public' });

    check('6b tanpa NAT: egress gagal (no route balik)', !sim.simulateTcpConnect('pc1', '8.8.8.8', 80).ok);
    sim.setNatRules('r1', [{ chain: 'srcnat', action: 'masquerade', outInterface: 'ether2' }] as NatRule[]);
    const nat = sim.simulateTcpConnect('pc1', '8.8.8.8', 80);
    check('6b NAT masquerade: TCP ke internet sukses', nat.ok && nat.status === 200 && nat.body === 'Public', JSON.stringify(nat));
    check('6b NAT masquerade: ping ke internet sukses', sim.simulatePing('pc1', '8.8.8.8').success);
  }

  // 6b2. dstnat port-forward (dengan rute balik + host eksternal)
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('host2', 'HOST2', 'pc', 1, '01'), eNode('r2', 'R2-ISP', 'router', 3, '02'), eNode('r1', 'R1', 'router', 3, '03'),
        eNode('sw1', 'SW1', 'switch', 4, '04'), eNode('svr1', 'SVR1', 'server', 1, '05'),
      ],
      edges: [
        eEdge('e1', 'host2', 'port1', 'r2', 'port3'), eEdge('e2', 'r2', 'port1', 'r1', 'port2'),
        eEdge('e3', 'r1', 'port1', 'sw1', 'port3'), eEdge('e4', 'sw1', 'port2', 'svr1', 'port1'),
      ],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24', ether2: '203.0.113.1/24' }, [{ dst: '0.0.0.0/0', gateway: '203.0.113.254' }]);
    sim.applyNodeConfig('r2', { ether1: '203.0.113.254/24', ether3: '198.51.100.1/24' }, [{ dst: '10.0.1.0/24', gateway: '203.0.113.1' }]);
    sim.applyNodeConfig('svr1', { ether1: '10.0.1.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
    sim.applyNodeConfig('host2', { ether1: '198.51.100.10/24' }, [{ dst: '0.0.0.0/0', gateway: '198.51.100.1' }]);
    sim.setWebServer('svr1', { enabled: true, port: 80, content: 'Hello NetLab' });

    check('6b2 tanpa dstnat: port 8080 ditolak', !sim.simulateTcpConnect('host2', '203.0.113.1', 8080).ok);
    sim.setNatRules('r1', [{ chain: 'dstnat', protocol: 'tcp', dstAddress: '203.0.113.1', dstPort: '8080', toAddresses: '10.0.1.10', toPorts: '80' }] as NatRule[]);
    const pf = sim.simulateTcpConnect('host2', '203.0.113.1', 8080);
    check('6b2 dstnat: port-forward ke server internal', pf.ok && pf.status === 200 && pf.body === 'Hello NetLab', JSON.stringify(pf));
    check('6b2 dstnat: port lain tidak kena rule', !sim.simulateTcpConnect('host2', '203.0.113.1', 81).ok);
  }

  // 6c. VLAN isolation + router-on-a-stick
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('pc1', 'PC1', 'pc', 1, '01'), eNode('svr1', 'SVR1', 'server', 1, '02'), eNode('pc3', 'PC3', 'pc', 1, '03'),
        eNode('sw1', 'SW1', 'switch', 5, '04'), eNode('r1', 'R1', 'router', 3, '05'), eNode('r2', 'R2', 'router', 3, '06'),
        eNode('pc4', 'PC4', 'pc', 1, '07'),
      ],
      edges: [
        eEdge('e1', 'pc1', 'port1', 'sw1', 'port1'), eEdge('e2', 'svr1', 'port1', 'sw1', 'port2'), eEdge('e3', 'pc3', 'port1', 'sw1', 'port3'),
        eEdge('e4', 'sw1', 'port4', 'r1', 'port3'), eEdge('e5', 'r1', 'port1', 'r2', 'port1'), eEdge('e6', 'r2', 'port2', 'pc4', 'port1'),
      ],
    };
    sim.syncTopology(project);
    sim.setPortVlans('sw1', { ether1: 10, ether2: 10, ether3: 20 });
    sim.setTrunkPorts('sw1', ['ether4']);
    sim.setSubinterfaces('r1', [
      { name: 'ether3.10', parentPort: 'ether3', vlanId: 10 },
      { name: 'ether3.20', parentPort: 'ether3', vlanId: 20 },
    ]);
    sim.applyNodeConfig('r1', { 'ether3.10': '10.0.1.1/24', 'ether3.20': '10.0.2.1/24', ether1: '192.168.1.1/30' }, [{ dst: '10.0.3.0/24', gateway: '192.168.1.2' }]);
    sim.applyNodeConfig('r2', { ether1: '192.168.1.2/30', ether2: '10.0.3.1/24' }, [
      { dst: '10.0.1.0/24', gateway: '192.168.1.1' }, { dst: '10.0.2.0/24', gateway: '192.168.1.1' },
    ]);
    sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
    sim.applyNodeConfig('svr1', { ether1: '10.0.1.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
    sim.applyNodeConfig('pc3', { ether1: '10.0.2.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.2.1' }]);
    sim.applyNodeConfig('pc4', { ether1: '10.0.3.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.3.1' }]);
    sim.setWebServer('svr1', { enabled: true, port: 80, content: 'Hello NetLab' });

    check('6c VLAN: same-VLAN ping sukses', sim.simulatePing('pc1', '10.0.1.10').success);
    check('6c router-on-a-stick: ping gateway subif', sim.simulatePing('pc1', '10.0.1.1').success);
    check('6c inter-VLAN routing via R1', sim.simulatePing('pc1', '10.0.2.2').success);
    check('6c cross-router via trunk', sim.simulatePing('pc1', '10.0.3.2').success);
    check('6c VLAN TCP same-VLAN', sim.simulateTcpConnect('pc1', '10.0.1.10', 80).body === 'Hello NetLab');
  }

  // 6d. Isolasi L2 VLAN murni (tanpa router)
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('pcA', 'PCA', 'pc', 1, '10'), eNode('pcB', 'PCB', 'pc', 1, '11'), eNode('pcC', 'PCC', 'pc', 1, '12'),
        eNode('sw1', 'SW1', 'switch', 5, '13'),
      ],
      edges: [
        eEdge('e1', 'pcA', 'port1', 'sw1', 'port1'), eEdge('e2', 'pcB', 'port1', 'sw1', 'port2'), eEdge('e3', 'pcC', 'port1', 'sw1', 'port3'),
      ],
    };
    sim.syncTopology(project);
    sim.setPortVlans('sw1', { ether1: 10, ether2: 20, ether3: 10 });
    sim.applyNodeConfig('pcA', { ether1: '10.0.1.2/24' }, []);
    sim.applyNodeConfig('pcB', { ether1: '10.0.2.2/24' }, []);
    sim.applyNodeConfig('pcC', { ether1: '10.0.1.3/24' }, []);
    check('6d L2: same-VLAN sukses', sim.simulatePing('pcA', '10.0.1.3').success);
    check('6d L2: beda-VLAN terisolasi (A->B)', !sim.simulatePing('pcA', '10.0.2.2').success);
    check('6d L2: beda-VLAN terisolasi (B->C)', !sim.simulatePing('pcB', '10.0.1.3').success);
  }
}

// ── 7. BGP antar-perangkat: eBGP langsung & trans-it (next-hop benar) ─────
console.log('\n== 7. BGP antar-perangkat ==');
{
  const ePorts = (n: number, macSeed: string) =>
    Array.from({ length: n }, (_, i) => ({ id: `port${i + 1}`, name: `ether${i + 1}`, status: 'up', macAddress: `00:0c:29:${macSeed}:${(i + 1).toString().padStart(2, '0')}:01` }));
  const eNode = (id: string, name: string, deviceType: string, portCount: number, macSeed: string) => ({
    id, name, vendor: deviceType === 'pc' || deviceType === 'server' ? 'linux' : 'mikrotik', model: deviceType, deviceType,
    ports: ePorts(portCount, macSeed),
  });
  const eEdge = (id: string, a: string, ap: string, b: string, bp: string) => ({
    id, sourceNodeId: a, sourcePortId: ap, targetNodeId: b, targetPortId: bp, cableType: 'copper_straight',
  });
  // 7a. eBGP langsung — 2 AS tanpa rute statis
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('pc1', 'PC1', 'pc', 1, '21'), eNode('r1', 'R1', 'router', 3, '22'),
        eNode('r2', 'R2', 'router', 3, '23'), eNode('svr2', 'SVR2', 'server', 1, '25'),
      ],
      edges: [
        eEdge('e1', 'pc1', 'port1', 'r1', 'port1'),
        eEdge('e2', 'r1', 'port2', 'r2', 'port1'),
        eEdge('e3', 'r2', 'port2', 'svr2', 'port1'),
      ],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24', ether2: '192.168.1.1/30' }, []);
    sim.applyNodeConfig('r2', { ether1: '192.168.1.2/30', ether2: '10.0.2.1/24' }, []);
    sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
    sim.applyNodeConfig('svr2', { ether1: '10.0.2.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.2.1' }]);
    sim.setWebServer('svr2', { enabled: true, port: 80, content: 'Hello NetLab' });
    sim.setBgp('r1', { asn: 65001, peers: [{ remoteAs: 65002, remoteAddr: '192.168.1.2' }], networks: [] });
    sim.setBgp('r2', { asn: 65002, peers: [{ remoteAs: 65001, remoteAddr: '192.168.1.1' }], networks: [] });
    sim.computeDynamicRoutes();

    check('7a BGP neighbor R1 Established', sim.getBgpNeighborStates('r1').some((s) => s.state === 'Established'), JSON.stringify(sim.getBgpNeighborStates('r1')));
    check('7a BGP neighbor R2 Established', sim.getBgpNeighborStates('r2').some((s) => s.state === 'Established'), JSON.stringify(sim.getBgpNeighborStates('r2')));
    check('7a R1 belajar 10.0.2.0/24 via BGP', sim.getDeviceStats('r1')?.routes.some((r) => r.dst === '10.0.2.0/24' && r.kind === 'dynamic'));
    check('7a R2 belajar 10.0.1.0/24 via BGP', sim.getDeviceStats('r2')?.routes.some((r) => r.dst === '10.0.1.0/24' && r.kind === 'dynamic'));
    const g1 = sim.getDeviceStats('r2')?.routes.find((r) => r.dst === '10.0.1.0/24' && r.kind === 'dynamic');
    check('7a next-hop R2 = peer-facing 192.168.1.1', g1?.gateway === '192.168.1.1', JSON.stringify(g1));
    const g2 = sim.getDeviceStats('r1')?.routes.find((r) => r.dst === '10.0.2.0/24' && r.kind === 'dynamic');
    check('7a next-hop R1 = peer-facing 192.168.1.2', g2?.gateway === '192.168.1.2', JSON.stringify(g2));
    check('7a connected route = network (bukan host IP)', sim.getDeviceStats('r1')?.routes.some((r) => r.dst === '10.0.1.0/24' && r.kind === 'connected'));
    const ping = sim.simulatePing('pc1', '10.0.2.10');
    check('7a ping lintas AS via BGP', ping.success, JSON.stringify(ping));
    const tcp = sim.simulateTcpConnect('pc1', '10.0.2.10', 80);
    check('7a TCP lintas AS via BGP', tcp.ok && tcp.status === 200 && tcp.body === 'Hello NetLab', JSON.stringify(tcp));
  }

  // 7b. eBGP rangkaian — 3 AS, rute transit melalui R2
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('r1', 'R1', 'router', 3, '31'), eNode('r2', 'R2', 'router', 3, '32'), eNode('r3', 'R3', 'router', 3, '33'),
        eNode('pc1', 'PC1', 'pc', 1, '34'), eNode('svr3', 'SVR3', 'server', 1, '35'),
      ],
      edges: [
        eEdge('e1', 'r1', 'port1', 'r2', 'port1'),
        eEdge('e2', 'r2', 'port2', 'r3', 'port1'),
        eEdge('e3', 'pc1', 'port1', 'r1', 'port3'),
        eEdge('e4', 'svr3', 'port1', 'r3', 'port3'),
      ],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('r1', { ether1: '192.168.1.1/30', ether3: '10.0.1.1/24' }, []);
    sim.applyNodeConfig('r2', { ether1: '192.168.1.2/30', ether2: '192.168.2.1/30' }, []);
    sim.applyNodeConfig('r3', { ether1: '192.168.2.2/30', ether3: '10.0.9.1/24' }, []);
    sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
    sim.applyNodeConfig('svr3', { ether1: '10.0.9.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.9.1' }]);
    sim.setBgp('r1', { asn: 65001, peers: [{ remoteAs: 65002, remoteAddr: '192.168.1.2' }], networks: [] });
    sim.setBgp('r2', { asn: 65002, peers: [{ remoteAs: 65001, remoteAddr: '192.168.1.1' }, { remoteAs: 65003, remoteAddr: '192.168.2.2' }], networks: [] });
    sim.setBgp('r3', { asn: 65003, peers: [{ remoteAs: 65002, remoteAddr: '192.168.2.1' }], networks: [] });
    sim.computeDynamicRoutes();

    const gA = sim.getDeviceStats('r1')?.routes.find((r) => r.dst === '10.0.9.0/24' && r.kind === 'dynamic');
    check('7b next-hop R1->LAN9 = R2 (192.168.1.2)', gA?.gateway === '192.168.1.2', JSON.stringify(gA));
    const gB = sim.getDeviceStats('r3')?.routes.find((r) => r.dst === '10.0.1.0/24' && r.kind === 'dynamic');
    check('7b next-hop R3->LAN1 = R2 (192.168.2.1)', gB?.gateway === '192.168.2.1', JSON.stringify(gB));
    const ping = sim.simulatePing('pc1', '10.0.9.10');
    check('7b ping transit BGP', ping.success, JSON.stringify(ping));
    const pingb = sim.simulatePing('svr3', '10.0.1.2');
    check('7b ping balik transit BGP', pingb.success, JSON.stringify(pingb));
  }
}

// ── 8. SNMP: agent + snmpget/snmpwalk/snmpset lintas perangkat ────────────
console.log('\n== 8. SNMP (agent + query) ==');
{
  const ePorts = (n: number, macSeed: string) =>
    Array.from({ length: n }, (_, i) => ({ id: `port${i + 1}`, name: `ether${i + 1}`, status: 'up', macAddress: `00:0c:29:${macSeed}:${(i + 1).toString().padStart(2, '0')}:01` }));
  const eNode = (id: string, name: string, deviceType: string, portCount: number, macSeed: string) => ({
    id, name, vendor: deviceType === 'pc' || deviceType === 'server' ? 'linux' : 'mikrotik', model: deviceType, deviceType,
    ports: ePorts(portCount, macSeed),
  });
  const eEdge = (id: string, a: string, ap: string, b: string, bp: string) => ({
    id, sourceNodeId: a, sourcePortId: ap, targetNodeId: b, targetPortId: bp, cableType: 'copper_straight',
  });
  // 8a. Agent di router, query dari PC satu segment
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('pc1', 'PC1', 'pc', 1, '41'), eNode('sw1', 'SW1', 'switch', 4, '42'), eNode('r1', 'R1', 'router', 3, '43'),
      ],
      edges: [
        eEdge('e1', 'pc1', 'port1', 'sw1', 'port1'), eEdge('e2', 'sw1', 'port2', 'r1', 'port1'),
      ],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24' }, []);
    sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);

    const noAgent = sim.simulateSnmpQuery('pc1', '10.0.1.1', 'public', '.1.3.6.1.2.1.1.1.0');
    check('8a agent dimatikan -> no-agent', !noAgent.ok && noAgent.reason === 'no-agent', JSON.stringify(noAgent));

    sim.setSnmp('r1', { enabled: true, community: 'public', communityRW: 'private', sysContact: 'admin@lab', sysLocation: 'DC-1' });
    sim.setSnmp('rx-nonexistent', undefined); // harus aman (node tidak ada)

    const sys = sim.simulateSnmpQuery('pc1', '10.0.1.1', 'public', '.1.3.6.1.2.1.1.1.0');
    check('8a sysDescr terbaca', sys.ok && sys.oids?.[0]?.oid === '.1.3.6.1.2.1.1.1.0' && String(sys.oids[0].value).length > 0, JSON.stringify(sys));

    const name = sim.simulateSnmpQuery('pc1', '10.0.1.1', 'public', '.1.3.6.1.2.1.1.5.0');
    check('8a sysName = R1', name.ok && name.oids?.[0]?.value === 'R1', JSON.stringify(name));

    const contact = sim.simulateSnmpQuery('pc1', '10.0.1.1', 'public', '.1.3.6.1.2.1.1.4.0');
    check('8a sysContact = admin@lab', contact.ok && contact.oids?.[0]?.value === 'admin@lab', JSON.stringify(contact));

    const walk = sim.simulateSnmpQuery('pc1', '10.0.1.1', 'public', '.1.3.6.1.2.1.2', { walk: true });
    check('8a walk ifTable >= 3 entri', walk.ok && (walk.oids?.length || 0) >= 3, JSON.stringify(walk));

    const bad = sim.simulateSnmpQuery('pc1', '10.0.1.1', 'nope', '.1.3.6.1.2.1.1.1.0');
    check('8a community salah -> auth', !bad.ok && bad.reason === 'auth', JSON.stringify(bad));

    const nosuch = sim.simulateSnmpQuery('pc1', '10.0.1.1', 'public', '.1.3.6.1.2.1.1.99.1.0');
    check('8a OID tak ada -> not-found-oid', !nosuch.ok && nosuch.reason === 'not-found-oid', JSON.stringify(nosuch));

    const ro = sim.simulateSnmpQuery('pc1', '10.0.1.1', 'public', '.1.3.6.1.2.1.1.5.0', { setValue: 'Hacked' });
    check('8a set pakai community RO -> readonly', !ro.ok && ro.reason === 'readonly', JSON.stringify(ro));

    const set = sim.simulateSnmpQuery('pc1', '10.0.1.1', 'private', '.1.3.6.1.2.1.1.5.0', { setValue: 'Router-Utama' });
    check('8a set pakai community RW -> ok', set.ok, JSON.stringify(set));
    const after = sim.simulateSnmpQuery('pc1', '10.0.1.1', 'public', '.1.3.6.1.2.1.1.5.0');
    check('8a sysName berubah jadi Router-Utama', after.oids?.[0]?.value === 'Router-Utama', JSON.stringify(after));
  }

  // 8b. Query lintas router (perlu rute BGP/statis) + uptime ifIndex
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('pc1', 'PC1', 'pc', 1, '51'), eNode('r1', 'R1', 'router', 3, '52'), eNode('r2', 'R2', 'router', 3, '53'),
        eNode('sw2', 'SW2', 'switch', 4, '54'), eNode('pc2', 'PC2', 'pc', 1, '55'),
      ],
      edges: [
        eEdge('e1', 'pc1', 'port1', 'r1', 'port1'),
        eEdge('e2', 'r1', 'port2', 'r2', 'port1'),
        eEdge('e3', 'r2', 'port2', 'sw2', 'port1'),
        eEdge('e4', 'sw2', 'port2', 'pc2', 'port1'),
      ],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24', ether2: '192.168.1.1/30' }, []);
    sim.applyNodeConfig('r2', { ether1: '192.168.1.2/30', ether2: '10.0.2.1/24' }, []);
    sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
    sim.applyNodeConfig('pc2', { ether1: '10.0.2.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.2.1' }]);
    sim.setBgp('r1', { asn: 65001, peers: [{ remoteAs: 65002, remoteAddr: '192.168.1.2' }], networks: [] });
    sim.setBgp('r2', { asn: 65002, peers: [{ remoteAs: 65001, remoteAddr: '192.168.1.1' }], networks: [] });
    sim.computeDynamicRoutes();
    sim.setSnmp('r2', { enabled: true, community: 'public' });
    sim.setSnmp('r1', { enabled: true, community: 'public' });

    const ping = sim.simulatePing('pc1', '10.0.2.1');
    check('8b prasyarat: ping lintas BGP sukses', ping.success, JSON.stringify(ping));

    const cross = sim.simulateSnmpQuery('pc1', '10.0.2.1', 'public', '.1.3.6.1.2.1.1.5.0');
    check('8b snmpget lintas router -> R2', cross.ok && cross.oids?.[0]?.value === 'R2', JSON.stringify(cross));

    const walkIf = sim.simulateSnmpQuery('pc2', '10.0.1.1', 'public', '.1.3.6.1.2.1.2', { walk: true });
    check('8b walk ifTable R1 dari segmen lain', walkIf.ok && (walkIf.oids?.length || 0) >= 2, JSON.stringify(walkIf));

    const uptime = sim.simulateSnmpQuery('pc1', '10.0.2.1', 'public', '.1.3.6.1.2.1.1.3.0');
    check('8b sysUpTime Timeticks', uptime.ok && /^\(\d+\)/.test(String(uptime.oids?.[0]?.value)), JSON.stringify(uptime));

    const unr = sim.simulateSnmpQuery('pc1', '192.168.99.99', 'public', '.1.3.6.1.2.1.1.1.0');
    check('8b IP tak terjangkau -> unreachable', !unr.ok && unr.reason === 'unreachable', JSON.stringify(unr));
  }
}

// ── 9. STP/RSTP: loop handling + failover ───────────────────────────────
console.log('\n== 9. STP (loop-breaking & failover) ==');
{
  const ePorts = (n: number, macSeed: string) =>
    Array.from({ length: n }, (_, i) => ({ id: `port${i + 1}`, name: `ether${i + 1}`, status: 'up', macAddress: `00:0c:29:${macSeed}:${(i + 1).toString().padStart(2, '0')}:01` }));
  const eNode = (id: string, name: string, deviceType: string, portCount: number, macSeed: string) => ({
    id, name, vendor: deviceType === 'pc' || deviceType === 'server' ? 'linux' : 'mikrotik', model: deviceType, deviceType,
    ports: ePorts(portCount, macSeed),
  });
  const eEdge = (id: string, a: string, ap: string, b: string, bp: string) => ({
    id, sourceNodeId: a, sourcePortId: ap, targetNodeId: b, targetPortId: bp, cableType: 'copper_straight',
  });

  // 9a. Segitiga switch (loop) — satu port harus blocking, ping tetap jalan
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('pc1', 'PC1', 'pc', 1, '31'), eNode('pc2', 'PC2', 'pc', 1, '32'),
        eNode('sw1', 'SW1', 'switch', 3, '01'), eNode('sw2', 'SW2', 'switch', 3, '02'), eNode('sw3', 'SW3', 'switch', 3, '03'),
      ],
      edges: [
        eEdge('e1', 'sw1', 'port1', 'sw2', 'port1'),
        eEdge('e2', 'sw2', 'port2', 'sw3', 'port1'),
        eEdge('e3', 'sw3', 'port2', 'sw1', 'port2'),
        eEdge('e4', 'pc1', 'port1', 'sw3', 'port3'),
        eEdge('e5', 'pc2', 'port1', 'sw2', 'port3'),
      ],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('pc1', { ether1: '10.0.0.2/24' }, []);
    sim.applyNodeConfig('pc2', { ether1: '10.0.0.3/24' }, []);

    // Root = bridge ID terkecil → SW1 (MAC seed 01, prioritas sama)
    const st = sim.getStpInfo('sw3');
    check('9a root adalah SW1', !!st && st.rootName === 'SW1', JSON.stringify(st));
    // Edge SW2-SW3: SW2 (MAC lebih kecil) designated, SW3 alternate → blocking.
    const rootPort = sim.getStpInfo('sw1');
    check('9a SW1 tidak punya root port', !!rootPort && rootPort.rootPort === null, JSON.stringify(rootPort));
    const sw3 = sim.getStpInfo('sw3');
    const blocking = sw3?.ports.find((p) => p.state === 'blocking');
    check('9a SW3 punya 1 port blocking (loop dipotong)', !!blocking && blocking.role === 'alternate', JSON.stringify(sw3?.ports));
    check('9a hanya 1 sisi loop yang blokir', (sw3?.ports.filter((p) => p.state === 'blocking').length || 0) === 1);

    // Broadcast/flood tetap bisa: ping lewat pohon
    check('9a ping via spanning tree sukses', sim.simulatePing('pc1', '10.0.0.3').success);

    // Failover: SW1 mati → STP recompute, SW2-SW3 jadi jalur aktif
    sim.setNodePowered('sw1', false);
    const sw3b = sim.getStpInfo('sw3');
    check('9a failover: SW3 root berubah', !!sw3b && sw3b.rootName !== 'SW1', JSON.stringify(sw3b));
    check('9a failover: tidak ada port blocking lagi', sw3b?.ports.every((p) => p.state === 'forwarding'), JSON.stringify(sw3b?.ports));
    check('9a failover: ping tetap jalan', sim.simulatePing('pc1', '10.0.0.3').success);

    // Prioritas lebih kecil → jadi root baru
    sim.setNodePowered('sw1', true);
    sim.setStp('sw2', { enabled: true, priority: 4096, mode: 'rstp' });
    const root2 = sim.getStpInfo('sw3');
    check('9a prioritas 4096: SW2 jadi root', !!root2 && root2.rootName === 'SW2', JSON.stringify(root2));
    sim.setStp('sw2', undefined); // reset ke default

    // STP dimatikan → semua port forwarding
    sim.setStp('sw3', { enabled: false, priority: 32768, mode: 'rstp' });
    const sw3c = sim.getStpInfo('sw3');
    check('9a stp off: semua port forwarding', sw3c?.ports.every((p) => p.state === 'forwarding'), JSON.stringify(sw3c?.ports));
  }

  // 9b. STP tidak mengganggu topologi pohon tanpa loop (semua port forwarding)
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('pc1', 'PC1', 'pc', 1, '21'), eNode('sw1', 'SW1', 'switch', 3, '22'), eNode('pc2', 'PC2', 'pc', 1, '23'),
      ],
      edges: [
        eEdge('e1', 'pc1', 'port1', 'sw1', 'port1'),
        eEdge('e2', 'sw1', 'port2', 'pc2', 'port1'),
      ],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('pc1', { ether1: '10.0.0.2/24' }, []);
    sim.applyNodeConfig('pc2', { ether1: '10.0.0.3/24' }, []);
    const st = sim.getStpInfo('sw1');
    check('9b linear: semua port forwarding', st?.ports.every((p) => p.state === 'forwarding'), JSON.stringify(st?.ports));
    check('9b linear: ping sukses', sim.simulatePing('pc1', '10.0.0.3').success);
  }
}

// ── 10. Wireless (asosiasi AP–station, keamanan, radio) ──────────────────
{
  const ePorts = (n: number, macSeed: string) =>
    Array.from({ length: n }, (_, i) => ({ id: `port${i + 1}`, name: `ether${i + 1}`, status: 'up', macAddress: `00:0c:29:${macSeed}:${(i + 1).toString().padStart(2, '0')}:01` }));
  const eNode = (id: string, name: string, deviceType: string, portCount: number, macSeed: string) => ({
    id, name, vendor: deviceType === 'pc' || deviceType === 'server' ? 'linux' : 'mikrotik', model: deviceType, deviceType,
    ports: ePorts(portCount, macSeed),
  });
  const eEdge = (id: string, a: string, ap: string, b: string, bp: string) => ({
    id, sourceNodeId: a, sourcePortId: ap, targetNodeId: b, targetPortId: bp, cableType: 'copper_straight',
  });
  const apNode = (id: string, name: string, seed: string) => ({
    id, name, vendor: 'mikrotik', model: 'wireless', deviceType: 'wireless',
    ports: [
      { id: 'port1', name: 'ether1', status: 'up', macAddress: `00:0c:29:${seed}:01:01` },
      { id: 'port2', name: 'ether2', status: 'up', macAddress: `00:0c:29:${seed}:02:01` },
      { id: 'port3', name: 'wlan1', status: 'up', macAddress: `00:0c:29:${seed}:03:01` },
    ],
  });
  const buildWifi = () => {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('pc1', 'PC1', 'pc', 1, '41'), eNode('pc2', 'PC2', 'pc', 1, '42'),
        apNode('ap1', 'AP1', '43'), apNode('st1', 'ST1', '44'),
      ],
      edges: [
        eEdge('e1', 'pc1', 'port1', 'ap1', 'port2'),
        eEdge('e2', 'ap1', 'port3', 'st1', 'port3'),
        eEdge('e3', 'st1', 'port2', 'pc2', 'port1'),
      ],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('pc1', { ether1: '10.0.0.2/24' }, []);
    sim.applyNodeConfig('pc2', { ether1: '10.0.0.3/24' }, []);
    return sim;
  };

  // 10a. AP terbuka tanpa config → asosiasi default, ping jalan
  {
    const sim = buildWifi();
    check('10a tanpa config: ping lewat radio sukses', sim.simulatePing('pc1', '10.0.0.3').success);
  }

  // 10b. SSID harus sama (ap-bridge ↔ station)
  {
    const sim = buildWifi();
    sim.setWireless('ap1', { interfaces: { wlan1: { ssid: 'NetLab', mode: 'ap-bridge' } }, profiles: {} });
    sim.setWireless('st1', { interfaces: { wlan1: { ssid: 'NetLab', mode: 'station' } }, profiles: {} });
    check('10b ssid sama: station terasosiasi', sim.getWirelessInfo('ap1')?.associations.length === 1);
    check('10b ssid sama: ping sukses', sim.simulatePing('pc1', '10.0.0.3').success);

    sim.setWireless('st1', { interfaces: { wlan1: { ssid: 'Lain', mode: 'station' } }, profiles: {} });
    check('10b ssid beda: tidak terasosiasi', sim.getWirelessInfo('ap1')?.associations.length === 0);
    check('10b ssid beda: ping gagal', !sim.simulatePing('pc1', '10.0.0.3').success);
  }

  // 10c. WPA2-PSK: key harus cocok
  {
    const sim = buildWifi();
    const sec = { authenticationTypes: 'wpa2-psk', key: 'rahasia123' };
    sim.setWireless('ap1', { interfaces: { wlan1: { ssid: 'NetLab', mode: 'ap-bridge', securityProfile: 's1' } }, profiles: { s1: sec } });
    sim.setWireless('st1', { interfaces: { wlan1: { ssid: 'NetLab', mode: 'station', securityProfile: 's1' } }, profiles: { s1: { ...sec, key: 'salah' } } });
    check('10c key salah: tidak terasosiasi', sim.getWirelessInfo('ap1')?.associations.length === 0);
    check('10c key salah: ping gagal', !sim.simulatePing('pc1', '10.0.0.3').success);
    sim.setWireless('st1', { interfaces: { wlan1: { ssid: 'NetLab', mode: 'station', securityProfile: 's1' } }, profiles: { s1: sec } });
    check('10c key benar: terasosiasi', sim.getWirelessInfo('ap1')?.associations.length === 1);
    check('10c key benar: ping sukses', sim.simulatePing('pc1', '10.0.0.3').success);
  }

  // 10d. AP mati → asosiasi hilang, jaringan terisolasi
  {
    const sim = buildWifi();
    sim.setNodePowered('ap1', false);
    check('10d AP mati: tidak ada asosiasi', sim.getWirelessInfo('ap1')?.associations.length === 0);
    check('10d AP mati: ping gagal', !sim.simulatePing('pc1', '10.0.0.3').success);
  }
}

// ── 11. QoS: mangle mark-packet + simple queue (token bucket) ────────────
{
  const ePorts = (n: number, macSeed: string) =>
    Array.from({ length: n }, (_, i) => ({ id: `port${i + 1}`, name: `ether${i + 1}`, status: 'up', macAddress: `00:0c:29:${macSeed}:${(i + 1).toString().padStart(2, '0')}:01` }));
  const eNode = (id: string, name: string, deviceType: string, portCount: number, macSeed: string) => ({
    id, name, vendor: deviceType === 'pc' || deviceType === 'server' ? 'linux' : 'mikrotik', model: deviceType, deviceType,
    ports: ePorts(portCount, macSeed),
  });
  const eEdge = (id: string, a: string, ap: string, b: string, bp: string) => ({
    id, sourceNodeId: a, sourcePortId: ap, targetNodeId: b, targetPortId: bp, cableType: 'copper_straight',
  });
  const buildQos = () => {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('r1', 'R1', 'router', 3, '51'), eNode('pc1', 'PC1', 'pc', 1, '52'), eNode('pc2', 'PC2', 'pc', 1, '53'),
      ],
      edges: [
        eEdge('e1', 'pc1', 'port1', 'r1', 'port1'),
        eEdge('e2', 'r1', 'port2', 'pc2', 'port1'),
      ],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('r1', { ether1: '192.168.1.1/24', ether2: '192.168.2.1/24' }, []);
    sim.applyNodeConfig('pc1', { ether1: '192.168.1.10/24' }, [{ dst: '0.0.0.0/0', gateway: '192.168.1.1' }]);
    sim.applyNodeConfig('pc2', { ether1: '192.168.2.10/24' }, [{ dst: '0.0.0.0/0', gateway: '192.168.2.1' }]);
    return sim;
  };

  // 11a. Baseline tanpa queue → ping sukses
  {
    const sim = buildQos();
    check('11a baseline ping sukses', sim.simulatePing('pc1', '192.168.2.10').success);
  }

  // 11b. Simple queue rate rendah → paket di-drop token bucket
  {
    const sim = buildQos();
    sim.setQos('r1', [{ name: 'q-kecil', target: '192.168.2.0/24', maxLimit: '1k' }], []);
    const r = sim.simulatePing('pc1', '192.168.2.10');
    check('11b queue 1k: ping gagal', !r.success, JSON.stringify(r));
    const stats = sim.getQosStats('r1');
    check('11b ada paket di-drop', (stats[0]?.dropped || 0) > 0, JSON.stringify(stats));
  }

  // 11c. Queue dibuka → ping sukses lagi
  {
    const sim = buildQos();
    sim.setQos('r1', [{ name: 'q-besar', target: '192.168.2.0/24', maxLimit: '100M' }], []);
    check('11c queue 100M: ping sukses', sim.simulatePing('pc1', '192.168.2.10').success);
    check('11c tidak ada drop', (sim.getQosStats('r1')[0]?.dropped || 0) === 0);
  }

  // 11d. Mangle mark-packet + queue per-mark → hanya icmp yang di-drop
  {
    const sim = buildQos();
    sim.setQos('r1', [
      { name: 'q-voice', target: 'packet-mark=voice', maxLimit: '1k' },
    ], [
      { chain: 'forward', protocol: 'icmp', action: 'mark-packet', newPacketMark: 'voice' },
    ]);
    const r = sim.simulatePing('pc1', '192.168.2.10');
    check('11d icmp ter-mark voice: ping drop', !r.success, JSON.stringify(r));
    const voice = sim.getQosStats('r1').find((s) => s.name === 'q-voice');
    check('11d queue voice mencatat drop', !!voice && voice.dropped > 0, JSON.stringify(voice));
  }
}

// ── Ringkasan ────────────────────────────────────────────────────────────
console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nFAILED:');
  for (const f of fails) console.log(' -', f);
  process.exit(1);
}
