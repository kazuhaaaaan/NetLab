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

// ── Ringkasan ────────────────────────────────────────────────────────────
console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nFAILED:');
  for (const f of fails) console.log(' -', f);
  process.exit(1);
}
