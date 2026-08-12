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
import { runLab, findScenarios, formatLabResult } from './src/engine/lab';
import { LAB_SCENARIOS } from './src/engine/lab/scenarios';
import { buildNodeExports, validateConfigExport, portLinksOfNode } from './src/utils/configExport';
import { runVendorInteropTests } from './tests/unit/vendorInterop.test';
import { runCliFacadeTest } from './tests/unit/cliFacade.test';
import { runCommandTreeTests } from './tests/unit/commandTree.test';
import { runPortInspectorTests } from './tests/unit/portInspector.test';

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

  // 6e. Isolasi VLAN trunk→access: frame bertag (VLAN 10) dari trunk TIDAK
  // boleh keluar port access yang access-VLAN-nya beda (regresi vlanAllows).
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('pcX', 'PCX', 'pc', 1, '20'), eNode('pcY', 'PCY', 'pc', 1, '21'),
        eNode('sw1', 'SW1', 'switch', 5, '22'), eNode('r1', 'R1', 'router', 3, '23'),
      ],
      edges: [
        eEdge('e1', 'pcX', 'port1', 'sw1', 'port1'), eEdge('e2', 'pcY', 'port1', 'sw1', 'port2'),
        eEdge('e3', 'sw1', 'port4', 'r1', 'port3'),
      ],
    };
    sim.syncTopology(project);
    // Access: ether1=VLAN 10, ether2=VLAN 20. Trunk: ether4 ke router.
    sim.setPortVlans('sw1', { ether1: 10, ether2: 20 });
    sim.setTrunkPorts('sw1', ['ether4']);
    sim.setSubinterfaces('r1', [{ name: 'ether3.10', parentPort: 'ether3', vlanId: 10 }]);
    sim.applyNodeConfig('r1', { 'ether3.10': '10.0.1.1/24' }, []);
    sim.applyNodeConfig('pcX', { ether1: '10.0.1.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
    sim.applyNodeConfig('pcY', { ether1: '10.0.2.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.2.1' }]);
    // Ping gateway subif (VLAN 10) dari pcX sukses — reply r1 harus kembali lewat VLAN 10.
    check('6e trunk: ping gateway VLAN10 dari pcX sukses', sim.simulatePing('pcX', '10.0.1.1').success);
    // pcY di VLAN 20 TIDAK boleh menjangkau gateway VLAN 10 (bocor trunk→access).
    check('6e trunk: VLAN20 terisolasi dari gateway VLAN10', !sim.simulatePing('pcY', '10.0.1.1').success);
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
    // Port tanpa kabel (ether3) tidak bisa forwarding — STP disabled sesuai topologi.
    const wired = st?.ports.filter((p: any) => p.port !== 'ether3');
    check('9b linear: semua port BERKABEL forwarding', !!wired && wired.every((p) => p.state === 'forwarding'), JSON.stringify(st?.ports));
    check('9b linear: port tanpa kabel = disabled', st?.ports.find((p: any) => p.port === 'ether3')?.state === 'disabled', JSON.stringify(st?.ports));
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

// ── 12. Integrasi: konfigurasi CLI → engine → konektivitas antar-device ──
// Mensimulasikan alur App persis: perintah CLI vendor → VendorDispatcher memory
// → sync ke NetworkSimulator (setNodeConfig/setRouting/setNat/...) → verifikasi
// ping/TCP lintas perangkat yang benar-benar terhubung (lintas vendor).
console.log('\n== 12. Integrasi CLI antar perangkat terhubung (alur App) ==');
{
  const iPorts = (n: number, macSeed: string) =>
    Array.from({ length: n }, (_, i) => ({ id: `ether${i + 1}`, name: `ether${i + 1}`, status: 'up', macAddress: `00:0c:29:${macSeed}:${(i + 1).toString().padStart(2, '0')}:01` }));
  const iNode = (id: string, name: string, vendor: string, deviceType: string, portCount: number, macSeed: string) => ({
    id, name, vendor, model: deviceType, deviceType,
    ports: iPorts(portCount, macSeed),
  });
  const iEdge = (id: string, a: string, ap: string, b: string, bp: string) => ({
    id, sourceNodeId: a, sourcePortId: ap, targetNodeId: b, targetPortId: bp, cableType: 'copper_straight',
  });

  // Replika App.syncNodeToEngine + App.syncDhcpPools
  const syncCli = (dis: VendorDispatcher, sim: NetworkSimulator, nodeId: string) => {
    const mem = dis.getNodeMemory(nodeId);
    sim.setSubinterfaces(nodeId, mem.subinterfaces || undefined);
    sim.setShutdownIfaces(nodeId, mem.shutdownIfaces || undefined);
    sim.applyNodeConfig(nodeId, mem.configuredIps, mem.routes);
    sim.setRouting(nodeId, mem.routing || undefined);
    sim.setBgp(nodeId, mem.bgp || undefined);
    sim.setSnmp(nodeId, mem.snmp || undefined);
    sim.setAcls(nodeId, mem.acls || undefined);
    sim.setNatRules(nodeId, mem.natRules || undefined);
    sim.setDnsRecords(nodeId, mem.dnsRecords || undefined);
    sim.setDnsServers(nodeId, mem.dnsServers || undefined);
    sim.setWebServer(nodeId, mem.webServer || undefined);
    sim.setPortVlans(nodeId, mem.portVlans || undefined);
    sim.setTrunkPorts(nodeId, mem.trunkPorts || undefined);
    sim.setStp(nodeId, mem.stp || undefined);
    sim.setWireless(nodeId, mem.wireless || mem.wirelessSecurityProfiles
      ? { interfaces: mem.wireless || {}, profiles: mem.wirelessSecurityProfiles || {} }
      : undefined);
    sim.setQos(nodeId, mem.queues || undefined, mem.mangleRules || undefined);
    sim.setDhcpRelays(nodeId, mem.dhcpRelays || undefined);
    sim.setPortSecurity(nodeId, mem.portSecurity || undefined);
    sim.setIpv6DhcpClients(nodeId, mem.ipv6DhcpClients || undefined);
  };
  const syncPools = (dis: VendorDispatcher, sim: NetworkSimulator) => {
    const poolsByNode: Record<string, any[]> = {};
    for (const [nodeId, m] of Object.entries(dis.serializeMemory())) {
      if (m && Array.isArray(m.dhcpPools) && m.dhcpPools.length > 0) poolsByNode[nodeId] = m.dhcpPools;
    }
    sim.setDhcpPools(poolsByNode);
  };
  // Konteks CLI replika App.handleTerminalCommand
  const iCtx = (dis: VendorDispatcher, sim: NetworkSimulator, nodeId: string, name: string, ports: any[]) => ({
    nodeId,
    name,
    ports,
    dhcpClientGrant: (iface: string, addDefaultRoute: boolean) => {
      const granted = sim.grantDhcpLease(nodeId, iface);
      return granted ? { ip: granted.ip, gateway: granted.gateway, prefix: granted.prefix, poolNodeId: granted.poolNodeId } : null;
    },
    pingSimulator: (host: string, vendorId: string) => formatPingOutput(vendorId, host, sim.simulatePing(nodeId, host)),
    ospfNeighborProvider: () => sim.getOspfNeighbors(nodeId),
  });

  // 12a. Rute statis CLI lintas vendor: Cisco R1 ↔ MikroTik R2
  {
    const dis = new VendorDispatcher();
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        iNode('pc1', 'PC1', 'linux', 'pc', 1, '61'), iNode('sw1', 'SW1', 'mikrotik', 'switch', 4, '62'),
        iNode('r1', 'R1', 'cisco_ios', 'router', 3, '63'), iNode('r2', 'R2', 'mikrotik', 'router', 3, '64'),
        iNode('sw2', 'SW2', 'mikrotik', 'switch', 4, '65'), iNode('svr1', 'SVR1', 'linux', 'server', 1, '66'),
      ],
      edges: [
        iEdge('e1', 'pc1', 'ether1', 'sw1', 'ether1'), iEdge('e2', 'sw1', 'ether2', 'r1', 'ether1'),
        iEdge('e3', 'r1', 'ether2', 'r2', 'ether1'), iEdge('e4', 'r2', 'ether2', 'sw2', 'ether1'),
        iEdge('e5', 'sw2', 'ether2', 'svr1', 'ether1'),
      ],
    };
    sim.syncTopology(project);
    for (const n of project.nodes) {
      if (n.vendor === 'linux') {
        dis.dispatch('linux', 'hostname ' + n.name, iCtx(dis, sim, n.id, n.name, n.ports));
      } else {
        dis.dispatch('mikrotik', '/system identity set name=' + n.name, iCtx(dis, sim, n.id, n.name, n.ports));
      }
    }
    // PC1 & SVR1 (linux)
    let ctx = iCtx(dis, sim, 'pc1', 'PC1', project.nodes[0].ports);
    dis.dispatch('linux', 'ip addr add 10.0.1.2/24 dev ether1', ctx);
    dis.dispatch('linux', 'ip route add default via 10.0.1.1', ctx);
    ctx = iCtx(dis, sim, 'svr1', 'SVR1', project.nodes[5].ports);
    dis.dispatch('linux', 'ip addr add 10.0.2.10/24 dev ether1', ctx);
    dis.dispatch('linux', 'ip route add default via 10.0.2.1', ctx);
    // R1 (cisco): IP + rute statis
    ctx = iCtx(dis, sim, 'r1', 'R1', project.nodes[2].ports);
    dis.dispatch('cisco_ios', 'interface ether1', ctx);
    dis.dispatch('cisco_ios', 'ip address 10.0.1.1 255.255.255.0', ctx);
    dis.dispatch('cisco_ios', 'interface ether2', ctx);
    dis.dispatch('cisco_ios', 'ip address 192.168.1.1 255.255.255.252', ctx);
    dis.dispatch('cisco_ios', 'ip route 10.0.2.0 255.255.255.0 192.168.1.2', ctx);
    // R2 (mikrotik): IP + rute statis
    ctx = iCtx(dis, sim, 'r2', 'R2', project.nodes[3].ports);
    dis.dispatch('mikrotik', '/ip address add address=192.168.1.2/30 interface=ether1', ctx);
    dis.dispatch('mikrotik', '/ip address add address=10.0.2.1/24 interface=ether2', ctx);
    dis.dispatch('mikrotik', '/ip route add dst-address=10.0.1.0/24 gateway=192.168.1.1', ctx);
    // Sync alur App
    for (const n of project.nodes) syncCli(dis, sim, n.id);
    syncPools(dis, sim);

    const m1 = dis.getNodeMemory('r1');
    const m2 = dis.getNodeMemory('r2');
    check('12a r1 memori IP 2 interface', Object.keys(m1.configuredIps).length === 2, JSON.stringify(m1.configuredIps));
    check('12a r2 memori IP 2 interface', Object.keys(m2.configuredIps).length === 2, JSON.stringify(m2.configuredIps));
    check('12a r1 route statis tersimpan', m1.routes.some((r: any) => r.dst.includes('10.0.2.0')), JSON.stringify(m1.routes));
    check('12a r2 route statis tersimpan', m2.routes.some((r: any) => r.dst === '10.0.1.0/24'), JSON.stringify(m2.routes));
    check('12a ping pc1→gateway R1', sim.simulatePing('pc1', '10.0.1.1').success);
    check('12a ping pc1→svr1 lintas 2 router', sim.simulatePing('pc1', '10.0.2.10').success);
    check('12a ping balik svr1→pc1', sim.simulatePing('svr1', '10.0.1.2').success);
    const tcp = sim.simulateTcpConnect('pc1', '10.0.2.10', 80);
    check('12a TCP web pc1→svr1', tcp.ok && tcp.status === 200, JSON.stringify(tcp));
    const showRoute = dis.dispatch('cisco_ios', 'show ip route', iCtx(dis, sim, 'r1', 'R1', project.nodes[2].ports));
    check('12a show ip route menampilkan 10.0.2.0', typeof showRoute === 'string' && showRoute.includes('10.0.2.0'), JSON.stringify(showRoute?.slice?.(0, 120)));
  }

  // 12b. DHCP via CLI: pool Cisco → klien Linux (dhclient)
  {
    const dis = new VendorDispatcher();
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        iNode('pc1', 'PC1', 'linux', 'pc', 1, '71'), iNode('sw1', 'SW1', 'mikrotik', 'switch', 4, '72'),
        iNode('r1', 'R1', 'cisco_ios', 'router', 3, '73'),
      ],
      edges: [
        iEdge('e1', 'pc1', 'ether1', 'sw1', 'ether1'), iEdge('e2', 'sw1', 'ether2', 'r1', 'ether1'),
      ],
    };
    sim.syncTopology(project);
    // R1 (cisco): IP + DHCP pool
    const r1ctx = iCtx(dis, sim, 'r1', 'R1', project.nodes[2].ports);
    dis.dispatch('cisco_ios', 'interface ether1', r1ctx);
    dis.dispatch('cisco_ios', 'ip address 10.0.1.1 255.255.255.0', r1ctx);
    dis.dispatch('cisco_ios', 'ip dhcp pool LAN', r1ctx);
    dis.dispatch('cisco_ios', 'network 10.0.1.0 255.255.255.0', r1ctx);
    dis.dispatch('cisco_ios', 'default-router 10.0.1.1', r1ctx);
    syncCli(dis, sim, 'r1');
    syncPools(dis, sim);
    // PC1 (linux): DHCP client — pool sudah masuk engine (alur App: sync tiap perintah)
    const pc1ctx = iCtx(dis, sim, 'pc1', 'PC1', project.nodes[0].ports);
    const dhcpOut = dis.dispatch('linux', 'dhclient ether1', pc1ctx);
    for (const n of project.nodes) syncCli(dis, sim, n.id);
    syncPools(dis, sim);

    const pool = dis.getNodeMemory('r1').dhcpPools;
    check('12b pool DHCP tersimpan (cisco)', Array.isArray(pool) && pool.length === 1 && pool[0]?.name === 'LAN', JSON.stringify(pool));
    check('12b dhclient menghasilkan output', typeof dhcpOut === 'string' && dhcpOut.trim().length > 0, JSON.stringify(dhcpOut?.slice?.(0, 80)));
    const lease = sim.getLeaseFor('pc1');
    check('12b lease DHCP ter-grant ke PC1', !!lease && lease.gateway === '10.0.1.1', JSON.stringify(lease));
    check('12b pc1 bisa ping gateway dari IP DHCP', sim.simulatePing('pc1', '10.0.1.1').success);
    const dhcpPrint = dis.dispatch('linux', 'ip addr show ether1', pc1ctx);
    check('12b CLI menampilkan IP hasil DHCP', typeof dhcpPrint === 'string' && dhcpPrint.includes('10.0.1.'), JSON.stringify(dhcpPrint?.slice?.(0, 120)));
  }

  // 12b2. Host tanpa klien DHCP: ping pertama memicu DORA otomatis
  {
    const dis = new VendorDispatcher();
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        iNode('pc1', 'PC1', 'linux', 'pc', 1, 'c1'), iNode('sw1', 'SW1', 'mikrotik', 'switch', 4, 'c2'),
        iNode('r1', 'R1', 'cisco_ios', 'router', 3, 'c3'),
      ],
      edges: [
        iEdge('e1', 'pc1', 'ether1', 'sw1', 'ether1'), iEdge('e2', 'sw1', 'ether2', 'r1', 'ether1'),
      ],
    };
    sim.syncTopology(project);
    const r1ctx = iCtx(dis, sim, 'r1', 'R1', project.nodes[2].ports);
    dis.dispatch('cisco_ios', 'interface ether1', r1ctx);
    dis.dispatch('cisco_ios', 'ip address 10.0.1.1 255.255.255.0', r1ctx);
    dis.dispatch('cisco_ios', 'ip dhcp pool LAN', r1ctx);
    dis.dispatch('cisco_ios', 'network 10.0.1.0 255.255.255.0', r1ctx);
    dis.dispatch('cisco_ios', 'default-router 10.0.1.1', r1ctx);
    syncCli(dis, sim, 'r1');
    syncPools(dis, sim);
    for (const n of project.nodes) if (n.id !== 'r1') syncCli(dis, sim, n.id);

    const ping = sim.simulatePing('pc1', '10.0.1.1');
    check('12b2 DHCP otomatis saat ping (dhcpGranted)', ping.dhcpGranted === true, JSON.stringify(ping));
    check('12b2 lease tersimpan setelah ping', !!sim.getLeaseFor('pc1'), JSON.stringify(sim.getLeaseFor('pc1')));
  }

  // 12c. OSPF CLI lintas vendor (Cisco ↔ MikroTik) — tanpa rute statis
  {
    const dis = new VendorDispatcher();
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        iNode('pc1', 'PC1', 'linux', 'pc', 1, '81'), iNode('sw1', 'SW1', 'mikrotik', 'switch', 4, '82'),
        iNode('r1', 'R1', 'cisco_ios', 'router', 3, '83'), iNode('r2', 'R2', 'mikrotik', 'router', 3, '84'),
        iNode('sw2', 'SW2', 'mikrotik', 'switch', 4, '85'), iNode('svr1', 'SVR1', 'linux', 'server', 1, '86'),
      ],
      edges: [
        iEdge('e1', 'pc1', 'ether1', 'sw1', 'ether1'), iEdge('e2', 'sw1', 'ether2', 'r1', 'ether1'),
        iEdge('e3', 'r1', 'ether2', 'r2', 'ether1'), iEdge('e4', 'r2', 'ether2', 'sw2', 'ether1'),
        iEdge('e5', 'sw2', 'ether2', 'svr1', 'ether1'),
      ],
    };
    sim.syncTopology(project);
    let ctx = iCtx(dis, sim, 'pc1', 'PC1', project.nodes[0].ports);
    dis.dispatch('linux', 'ip addr add 10.0.1.2/24 dev ether1', ctx);
    dis.dispatch('linux', 'ip route add default via 10.0.1.1', ctx);
    ctx = iCtx(dis, sim, 'svr1', 'SVR1', project.nodes[5].ports);
    dis.dispatch('linux', 'ip addr add 10.0.2.10/24 dev ether1', ctx);
    dis.dispatch('linux', 'ip route add default via 10.0.2.1', ctx);
    // R1 (cisco): IP + OSPF
    ctx = iCtx(dis, sim, 'r1', 'R1', project.nodes[2].ports);
    dis.dispatch('cisco_ios', 'interface ether1', ctx);
    dis.dispatch('cisco_ios', 'ip address 10.0.1.1 255.255.255.0', ctx);
    dis.dispatch('cisco_ios', 'interface ether2', ctx);
    dis.dispatch('cisco_ios', 'ip address 192.168.1.1 255.255.255.252', ctx);
    dis.dispatch('cisco_ios', 'router ospf 1', ctx);
    dis.dispatch('cisco_ios', 'network 10.0.1.0 0.0.0.255 area 0', ctx);
    dis.dispatch('cisco_ios', 'network 192.168.1.0 0.0.0.3 area 0', ctx);
    // R2 (mikrotik): IP + OSPF
    ctx = iCtx(dis, sim, 'r2', 'R2', project.nodes[3].ports);
    dis.dispatch('mikrotik', '/ip address add address=192.168.1.2/30 interface=ether1', ctx);
    dis.dispatch('mikrotik', '/ip address add address=10.0.2.1/24 interface=ether2', ctx);
    dis.dispatch('mikrotik', '/routing ospf instance add name=ospf1', ctx);
    dis.dispatch('mikrotik', '/routing ospf network add network=192.168.1.0/30 area=0', ctx);
    dis.dispatch('mikrotik', '/routing ospf network add network=10.0.2.0/24 area=0', ctx);
    for (const n of project.nodes) syncCli(dis, sim, n.id);
    syncPools(dis, sim);
    sim.computeDynamicRoutes();

    const ospfMem = dis.getNodeMemory('r1').routing.ospf;
    const ospfMem2 = dis.getNodeMemory('r2').routing.ospf;
    check('12c ospf r1 enabled + 2 network', ospfMem.enabled === true && ospfMem.networks.length === 2, JSON.stringify(ospfMem));
    check('12c ospf r2 enabled + 2 network', ospfMem2.enabled === true && ospfMem2.networks.length === 2, JSON.stringify(ospfMem2));
    check('12c tetangga OSPF R1 Established', sim.getOspfNeighbors('r1').some((n) => /^Full/.test(n.state)), JSON.stringify(sim.getOspfNeighbors('r1')));
    check('12c r1 belajar 10.0.2.0/24 (dynamic)', sim.getDeviceStats('r1')?.routes.some((r) => r.dst === '10.0.2.0/24' && r.kind === 'dynamic'));
    check('12c r2 belajar 10.0.1.0/24 (dynamic)', sim.getDeviceStats('r2')?.routes.some((r) => r.dst === '10.0.1.0/24' && r.kind === 'dynamic'));
    check('12c ping lintas OSPF multi-vendor', sim.simulatePing('pc1', '10.0.2.10').success);
    const ospfOut = dis.dispatch('cisco_ios', 'show ip ospf neighbor', iCtx(dis, sim, 'r1', 'R1', project.nodes[2].ports));
    check('12c show ip ospf neighbor berisi tetangga', typeof ospfOut === 'string' && ospfOut.toLowerCase().includes('full'), JSON.stringify(ospfOut?.slice?.(0, 120)));
  }

  // 12c2. Wildcard OSPF (Cisco "network 10.0.0.0 0.0.0.255") hanya merekrut
  // interface yang benar-benar dalam 10.0.0.x — bukan seluruh 10.x.x.x.
  {
    const dis = new VendorDispatcher();
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        iNode('r1', 'R1', 'cisco_ios', 'router', 3, 'a1'), iNode('r2', 'R2', 'cisco_ios', 'router', 3, 'a2'),
        iNode('r3', 'R3', 'cisco_ios', 'router', 3, 'a3'),
      ],
      edges: [
        iEdge('e1', 'r1', 'ether1', 'r2', 'ether1'), iEdge('e2', 'r2', 'ether3', 'r3', 'ether1'),
      ],
    };
    sim.syncTopology(project);
    let ctx = iCtx(dis, sim, 'r1', 'R1', project.nodes[0].ports);
    dis.dispatch('cisco_ios', 'interface ether1', ctx);
    dis.dispatch('cisco_ios', 'ip address 10.0.0.1 255.255.255.0', ctx);
    dis.dispatch('cisco_ios', 'router ospf 1', ctx);
    dis.dispatch('cisco_ios', 'network 10.0.0.0 0.0.0.255 area 0', ctx);
    ctx = iCtx(dis, sim, 'r2', 'R2', project.nodes[1].ports);
    dis.dispatch('cisco_ios', 'interface ether1', ctx);
    dis.dispatch('cisco_ios', 'ip address 10.0.0.2 255.255.255.0', ctx);
    dis.dispatch('cisco_ios', 'interface ether2', ctx);
    dis.dispatch('cisco_ios', 'ip address 10.99.1.1 255.255.255.0', ctx); // TIDAK diiklankan
    dis.dispatch('cisco_ios', 'interface ether3', ctx);
    dis.dispatch('cisco_ios', 'ip address 192.168.0.1 255.255.255.252', ctx);
    dis.dispatch('cisco_ios', 'router ospf 1', ctx);
    dis.dispatch('cisco_ios', 'network 10.0.0.0 0.0.0.255 area 0', ctx);
    dis.dispatch('cisco_ios', 'network 192.168.0.0 0.0.0.3 area 0', ctx);
    ctx = iCtx(dis, sim, 'r3', 'R3', project.nodes[2].ports);
    dis.dispatch('cisco_ios', 'interface ether1', ctx);
    dis.dispatch('cisco_ios', 'ip address 192.168.0.2 255.255.255.252', ctx);
    dis.dispatch('cisco_ios', 'router ospf 1', ctx);
    dis.dispatch('cisco_ios', 'network 192.168.0.0 0.0.0.3 area 0', ctx);
    for (const n of project.nodes) syncCli(dis, sim, n.id);
    sim.computeDynamicRoutes();
    // r3 belajar 10.0.0.0/24 persis (bukan 10.0.0.0/8) via transit r2.
    check('12c2 r3 belajar 10.0.0.0/24 presisi', sim.getDeviceStats('r3')?.routes.some((r) => r.dst === '10.0.0.0/24' && r.kind === 'dynamic'));
    // r1 TIDAK belajar 10.99.1.0/24: interface 10.99.1.1 r2 TIDAK masuk wildcard 10.0.0.0/24
    // (regresi: wildcard lama 0.0.0.255 dihitung /8 sehingga merekrut seluruh 10.x).
    check('12c2 r1 TIDAK belajar 10.99.1.0/24', !sim.getDeviceStats('r1')?.routes.some((r) => r.dst === '10.99.1.0/24'));
    check('12c2 ping r1→r3 via OSPF transit', sim.simulatePing('r1', '192.168.0.2').success);
  }

  // 12c3. Validasi range numerik CLI vendor + show MAC/ARP dari data engine sungguhan.
  {
    const dis = new VendorDispatcher();
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        iNode('sw1', 'SW1', 'cisco_ios', 'switch', 3, 'a1'),
        iNode('pc1', 'PC1', 'linux', 'server', 1, 'a2'),
      ],
      edges: [iEdge('e1', 'sw1', 'ether1', 'pc1', 'ether1')],
    };
    sim.syncTopology(project);
    const ctx = {
      ...iCtx(dis, sim, 'sw1', 'SW1', project.nodes[0].ports),
      macTableProvider: () => sim.getDeviceStats('sw1')?.macTable || [],
      arpProvider: () => sim.getDeviceStats('sw1')?.arp || [],
    };
    // VLAN ID out-of-range ditolak, bukan fake-ok.
    check('12c3 vlan 0 ditolak', /Invalid|error/i.test(dis.dispatch('cisco_ios', 'vlan 0', ctx) || ''));
    check('12c3 vlan 4095 ditolak', /Invalid|error/i.test(dis.dispatch('cisco_ios', 'vlan 4095', ctx) || ''));
    check('12c3 vlan 99999 ditolak', /Invalid|error/i.test(dis.dispatch('cisco_ios', 'vlan 99999', ctx) || ''));
    check('12c3 vlan 10 diterima', dis.dispatch('cisco_ios', 'vlan 10', ctx) === '');
    const mem = dis.getNodeMemory('sw1');
    check('12c3 hanya vlan 10 masuk mem', mem.vlans.length === 1 && mem.vlans[0].id === '10', JSON.stringify(mem.vlans));
    // STP priority harus kelipatan 4096.
    check('12c3 stp priority 100 ditolak', /Priority/i.test(dis.dispatch('cisco_ios', 'spanning-tree vlan 1 priority 100', ctx) || ''));
    check('12c3 stp priority 4096 diterima', dis.dispatch('cisco_ios', 'spanning-tree vlan 1 priority 4096', ctx) === '');
    check('12c3 stp priority tersimpan', mem.stp.priority === 4096);
    // OSPF cost di luar 1..65535.
    dis.dispatch('cisco_ios', 'interface ether1', ctx);
    check('12c3 ospf cost 70000 ditolak', /1 to 65535/i.test(dis.dispatch('cisco_ios', 'ip ospf cost 70000', ctx) || ''));
    check('12c3 ospf cost 10 diterima', dis.dispatch('cisco_ios', 'ip ospf cost 10', ctx) === '');
    // switchport access vlan out-of-range.
    check('12c3 access vlan 5000 ditolak', /Invalid|error/i.test(dis.dispatch('cisco_ios', 'switchport access vlan 5000', ctx) || ''));
    check('12c3 access vlan 10 diterima', dis.dispatch('cisco_ios', 'switchport access vlan 10', ctx) === '');
    // show mac/arp memakai data engine sungguhan (macTableProvider/arpProvider).
    sim.simulatePing('pc1', '10.0.0.1').success; // trigger MAC learning
    const macOut = dis.dispatch('cisco_ios', 'show mac address-table', ctx) || '';
    check('12c3 show mac berisi entri engine', macOut.includes('Mac Address Table'), macOut.slice(0, 120));
    const arpOut = dis.dispatch('cisco_ios', 'show ip arp', ctx) || '';
    check('12c3 show ip arp berisi entri engine', /Internet|Address/.test(arpOut), arpOut.slice(0, 120));
    // Huawei display mac-address / display arp.
    const hwMem = dis.getNodeMemory('sw1');
    const hwOut = dis.dispatch('huawei', 'display mac-address', ctx) || '';
    check('12c3 huawei display mac-address berisi tabel', /MAC address table/i.test(hwOut), hwOut.slice(0, 120));
    check('12c3 huawei display arp berisi tabel', /IP ADDRESS/.test(dis.dispatch('huawei', 'display arp', ctx) || ''));
    // BGP ASN di luar range (4-byte) ditolak.
    check('12c3 vyos ASN 99999999999 ditolak', /invalid ASN|failed/i.test(dis.dispatch('vyos', 'set protocols bgp 99999999999 parameters router-id 1.1.1.1', ctx) || ''));
    check('12c3 mikrotik vlan-id 0 ditolak', /1\.\.4094/i.test(dis.dispatch('mikrotik', '/interface vlan add name=vlan0 vlan-id=0 interface=ether1', ctx) || ''));
  }

  // 12d. VLAN via CLI (cisco switch) + trunk + router-on-a-stick (cisco router)
  {
    const dis = new VendorDispatcher();
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        iNode('pc1', 'PC1', 'linux', 'pc', 1, '91'), iNode('pc3', 'PC3', 'linux', 'pc', 1, '92'),
        iNode('sw1', 'SW1', 'cisco_ios', 'switch', 4, '93'), iNode('r1', 'R1', 'cisco_ios', 'router', 3, '94'),
      ],
      edges: [
        iEdge('e1', 'pc1', 'ether1', 'sw1', 'ether1'), iEdge('e2', 'pc3', 'ether1', 'sw1', 'ether3'),
        iEdge('e3', 'sw1', 'ether4', 'r1', 'ether1'),
      ],
    };
    sim.syncTopology(project);
    // SW1 (cisco): VLAN 10/20, port akses, trunk ke router
    let ctx = iCtx(dis, sim, 'sw1', 'SW1', project.nodes[2].ports);
    dis.dispatch('cisco_ios', 'vlan 10', ctx);
    dis.dispatch('cisco_ios', 'vlan 20', ctx);
    dis.dispatch('cisco_ios', 'interface ether1', ctx);
    dis.dispatch('cisco_ios', 'switchport access vlan 10', ctx);
    dis.dispatch('cisco_ios', 'interface ether3', ctx);
    dis.dispatch('cisco_ios', 'switchport access vlan 20', ctx);
    dis.dispatch('cisco_ios', 'interface ether4', ctx);
    dis.dispatch('cisco_ios', 'switchport mode trunk', ctx);
    // R1 (cisco): subinterface trunk
    ctx = iCtx(dis, sim, 'r1', 'R1', project.nodes[3].ports);
    dis.dispatch('cisco_ios', 'interface ether1.10', ctx);
    dis.dispatch('cisco_ios', 'encapsulation dot1q 10', ctx);
    dis.dispatch('cisco_ios', 'ip address 10.0.1.1 255.255.255.0', ctx);
    dis.dispatch('cisco_ios', 'interface ether1.20', ctx);
    dis.dispatch('cisco_ios', 'encapsulation dot1q 20', ctx);
    dis.dispatch('cisco_ios', 'ip address 10.0.2.1 255.255.255.0', ctx);
    // Host
    ctx = iCtx(dis, sim, 'pc1', 'PC1', project.nodes[0].ports);
    dis.dispatch('linux', 'ip addr add 10.0.1.2/24 dev ether1', ctx);
    dis.dispatch('linux', 'ip route add default via 10.0.1.1', ctx);
    ctx = iCtx(dis, sim, 'pc3', 'PC3', project.nodes[1].ports);
    dis.dispatch('linux', 'ip addr add 10.0.2.2/24 dev ether1', ctx);
    dis.dispatch('linux', 'ip route add default via 10.0.2.1', ctx);
    for (const n of project.nodes) syncCli(dis, sim, n.id);
    syncPools(dis, sim);

    const vlanMem = dis.getNodeMemory('sw1');
    check('12d VLAN 10 & 20 tersimpan', vlanMem.vlans.some((v: any) => v.id === '10') && vlanMem.vlans.some((v: any) => v.id === '20'), JSON.stringify(vlanMem.vlans));
    check('12d portVlans tersimpan', vlanMem.portVlans.ether1 === 10 && vlanMem.portVlans.ether3 === 20, JSON.stringify(vlanMem.portVlans));
    check('12d trunk tersimpan', vlanMem.trunkPorts.includes('ether4'), JSON.stringify(vlanMem.trunkPorts));
    check('12d subinterface r1 ada 2', dis.getNodeMemory('r1').subinterfaces.length === 2, JSON.stringify(dis.getNodeMemory('r1').subinterfaces));
    check('12d ping inter-VLAN (10→20) lewat trunk', sim.simulatePing('pc1', '10.0.2.2').success);
    check('12d ping balik (20→10)', sim.simulatePing('pc3', '10.0.1.2').success);
    check('12d ping ke gateway VLAN10', sim.simulatePing('pc1', '10.0.1.1').success);
  }

  // 12e. NAT masquerade via CLI (MikroTik) — keluar ke "internet"
  {
    const dis = new VendorDispatcher();
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        iNode('pc1', 'PC1', 'linux', 'pc', 1, 'a1'), iNode('sw1', 'SW1', 'mikrotik', 'switch', 4, 'a2'),
        iNode('r1', 'R1', 'mikrotik', 'router', 3, 'a3'), iNode('r2', 'R2-ISP', 'mikrotik', 'router', 3, 'a4'),
        iNode('pub', 'PUB', 'linux', 'server', 1, 'a5'),
      ],
      edges: [
        iEdge('e1', 'pc1', 'ether1', 'sw1', 'ether1'), iEdge('e2', 'sw1', 'ether2', 'r1', 'ether1'),
        iEdge('e3', 'r1', 'ether2', 'r2', 'ether1'), iEdge('e4', 'r2', 'ether2', 'pub', 'ether1'),
      ],
    };
    sim.syncTopology(project);
    let ctx = iCtx(dis, sim, 'pc1', 'PC1', project.nodes[0].ports);
    dis.dispatch('linux', 'ip addr add 192.168.1.10/24 dev ether1', ctx);
    dis.dispatch('linux', 'ip route add default via 192.168.1.1', ctx);
    ctx = iCtx(dis, sim, 'pub', 'PUB', project.nodes[4].ports);
    dis.dispatch('linux', 'ip addr add 8.8.8.8/24 dev ether1', ctx);
    dis.dispatch('linux', 'ip route add default via 8.8.8.1', ctx);
    // R2 ISP (mikrotik): dua segmen connected
    ctx = iCtx(dis, sim, 'r2', 'R2-ISP', project.nodes[3].ports);
    dis.dispatch('mikrotik', '/ip address add address=203.0.113.254/24 interface=ether1', ctx);
    dis.dispatch('mikrotik', '/ip address add address=8.8.8.1/24 interface=ether2', ctx);
    // R1 (mikrotik): IP + default route + NAT masquerade
    ctx = iCtx(dis, sim, 'r1', 'R1', project.nodes[2].ports);
    dis.dispatch('mikrotik', '/ip address add address=192.168.1.1/24 interface=ether1', ctx);
    dis.dispatch('mikrotik', '/ip address add address=203.0.113.1/24 interface=ether2', ctx);
    dis.dispatch('mikrotik', '/ip route add dst-address=0.0.0.0/0 gateway=203.0.113.254', ctx);
    dis.dispatch('mikrotik', '/ip firewall nat add chain=srcnat out-interface=ether2 action=masquerade', ctx);
    for (const n of project.nodes) syncCli(dis, sim, n.id);
    syncPools(dis, sim);

    const natMem = dis.getNodeMemory('r1').natRules;
    check('12e NAT rule tersimpan', Array.isArray(natMem) && natMem.length === 1 && natMem[0].chain === 'srcnat', JSON.stringify(natMem));
    check('12e ping pc1→internet via NAT', sim.simulatePing('pc1', '8.8.8.8').success);
    const tcp = sim.simulateTcpConnect('pc1', '8.8.8.8', 80);
    check('12e TCP pc1→8.8.8.8 via NAT', tcp.ok && tcp.status === 200, JSON.stringify(tcp));
  }

  // 12f. Fungsi CLI device: shutdown/up + write memory
  {
    const dis = new VendorDispatcher();
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        iNode('pc1', 'PC1', 'linux', 'pc', 1, 'b1'), iNode('sw1', 'SW1', 'cisco_ios', 'switch', 4, 'b2'),
        iNode('r1', 'R1', 'cisco_ios', 'router', 3, 'b3'),
      ],
      edges: [
        iEdge('e1', 'pc1', 'ether1', 'sw1', 'ether1'), iEdge('e2', 'sw1', 'ether2', 'r1', 'ether1'),
      ],
    };
    sim.syncTopology(project);
    let ctx = iCtx(dis, sim, 'pc1', 'PC1', project.nodes[0].ports);
    dis.dispatch('linux', 'ip addr add 10.0.1.2/24 dev ether1', ctx);
    ctx = iCtx(dis, sim, 'r1', 'R1', project.nodes[2].ports);
    dis.dispatch('cisco_ios', 'interface ether1', ctx);
    dis.dispatch('cisco_ios', 'ip address 10.0.1.1 255.255.255.0', ctx);
    ctx = iCtx(dis, sim, 'sw1', 'SW1', project.nodes[1].ports);
    dis.dispatch('cisco_ios', 'interface ether2', ctx);
    dis.dispatch('cisco_ios', 'shutdown', ctx);
    for (const n of project.nodes) syncCli(dis, sim, n.id);
    syncPools(dis, sim);
    check('12f shutdown tersimpan di memori', dis.getNodeMemory('sw1').shutdownIfaces.includes('ether2'), JSON.stringify(dis.getNodeMemory('sw1').shutdownIfaces));
    check('12f link down: ping pc1→r1 gagal', !sim.simulatePing('pc1', '10.0.1.1').success);
    ctx = iCtx(dis, sim, 'sw1', 'SW1', project.nodes[1].ports);
    dis.dispatch('cisco_ios', 'interface ether2', ctx);
    dis.dispatch('cisco_ios', 'no shutdown', ctx);
    syncCli(dis, sim, 'sw1');
    check('12f no shutdown: ping pulih', sim.simulatePing('pc1', '10.0.1.1').success);
    const wm = dis.dispatch('cisco_ios', 'write memory', ctx);
    check('12f write memory = Building config [OK]', typeof wm === 'string' && wm.includes('[OK]'), JSON.stringify(wm));
    const cp = dis.dispatch('cisco_ios', 'copy running-config startup-config', ctx);
    check('12f copy run start juga [OK]', typeof cp === 'string' && cp.includes('[OK]'), JSON.stringify(cp));
  }
}

// ── 13. Fitur CLI baru: IPv6 & VRRP (FHRP) antar perangkat ───────────────
console.log('\n== 13. IPv6 & VRRP via CLI antar perangkat ==');
{
  const iPorts = (n: number, macSeed: string) =>
    Array.from({ length: n }, (_, i) => ({ id: `ether${i + 1}`, name: `ether${i + 1}`, status: 'up', macAddress: `00:0c:29:${macSeed}:${(i + 1).toString().padStart(2, '0')}:01` }));
  const iNode = (id: string, name: string, vendor: string, deviceType: string, portCount: number, macSeed: string) => ({
    id, name, vendor, model: deviceType, deviceType,
    ports: iPorts(portCount, macSeed),
  });
  const iEdge = (id: string, a: string, ap: string, b: string, bp: string) => ({
    id, sourceNodeId: a, sourcePortId: ap, targetNodeId: b, targetPortId: bp, cableType: 'copper_straight',
  });
  const syncCli = (dis: VendorDispatcher, sim: NetworkSimulator, nodeId: string) => {
    const mem = dis.getNodeMemory(nodeId);
    sim.setSubinterfaces(nodeId, mem.subinterfaces || undefined);
    sim.setShutdownIfaces(nodeId, mem.shutdownIfaces || undefined);
    sim.applyNodeConfig(nodeId, mem.configuredIps, mem.routes);
    sim.applyNodeConfig6(nodeId, mem.configuredIps6 || {}, mem.routes6 || []);
    sim.setRouting(nodeId, mem.routing || undefined);
    sim.setBgp(nodeId, mem.bgp || undefined);
    sim.setSnmp(nodeId, mem.snmp || undefined);
    sim.setAcls(nodeId, mem.acls || undefined);
    sim.setNatRules(nodeId, mem.natRules || undefined);
    sim.setDnsRecords(nodeId, mem.dnsRecords || undefined);
    sim.setDnsServers(nodeId, mem.dnsServers || undefined);
    sim.setWebServer(nodeId, mem.webServer || undefined);
    sim.setPortVlans(nodeId, mem.portVlans || undefined);
    sim.setTrunkPorts(nodeId, mem.trunkPorts || undefined);
    sim.setStp(nodeId, mem.stp || undefined);
    sim.setFhrp(nodeId, mem.fhrpGroups || undefined);
  };
  const iCtx = (dis: VendorDispatcher, sim: NetworkSimulator, nodeId: string, name: string, ports: any[]) => ({
    nodeId,
    name,
    ports,
    pingSimulator: (host: string, vendorId: string) => formatPingOutput(vendorId, host, sim.simulatePing(nodeId, host)),
    ospfNeighborProvider: () => sim.getOspfNeighbors(nodeId),
    fhrpProvider: () => sim.getFhrpInfo(nodeId),
  });

  // 13a. IPv6 via CLI: Cisco R1 ↔ MikroTik R2, routing v6 statis, ping6 lintas
  {
    const dis = new VendorDispatcher();
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        iNode('pc1', 'PC1', 'linux', 'pc', 1, 'd1'), iNode('sw1', 'SW1', 'mikrotik', 'switch', 4, 'd2'),
        iNode('r1', 'R1', 'cisco_ios', 'router', 3, 'd3'), iNode('r2', 'R2', 'mikrotik', 'router', 3, 'd4'),
        iNode('sw2', 'SW2', 'mikrotik', 'switch', 4, 'd5'), iNode('svr1', 'SVR1', 'linux', 'server', 1, 'd6'),
      ],
      edges: [
        iEdge('e1', 'pc1', 'ether1', 'sw1', 'ether1'), iEdge('e2', 'sw1', 'ether2', 'r1', 'ether1'),
        iEdge('e3', 'r1', 'ether2', 'r2', 'ether1'), iEdge('e4', 'r2', 'ether2', 'sw2', 'ether1'),
        iEdge('e5', 'sw2', 'ether2', 'svr1', 'ether1'),
      ],
    };
    sim.syncTopology(project);
    let ctx = iCtx(dis, sim, 'pc1', 'PC1', project.nodes[0].ports);
    dis.dispatch('linux', 'ip addr add 2001:db8:1::10/64 dev ether1', ctx);
    dis.dispatch('linux', 'ip -6 route add default via 2001:db8:1::1', ctx);
    ctx = iCtx(dis, sim, 'svr1', 'SVR1', project.nodes[5].ports);
    dis.dispatch('linux', 'ip addr add 2001:db8:2::10/64 dev ether1', ctx);
    dis.dispatch('linux', 'ip -6 route add default via 2001:db8:2::1', ctx);
    // R1 (cisco): IPv6 interface + rute ke subnet R2
    ctx = iCtx(dis, sim, 'r1', 'R1', project.nodes[2].ports);
    dis.dispatch('cisco_ios', 'interface ether1', ctx);
    dis.dispatch('cisco_ios', 'ipv6 address 2001:db8:1::1/64', ctx);
    dis.dispatch('cisco_ios', 'interface ether2', ctx);
    dis.dispatch('cisco_ios', 'ipv6 address 2001:db8:ff::1/64', ctx);
    dis.dispatch('cisco_ios', 'ipv6 route 2001:db8:2::/64 2001:db8:ff::2', ctx);
    // R2 (mikrotik): IPv6 interface + rute balik
    ctx = iCtx(dis, sim, 'r2', 'R2', project.nodes[3].ports);
    dis.dispatch('mikrotik', '/ipv6 address add address=2001:db8:ff::2/64 interface=ether1', ctx);
    dis.dispatch('mikrotik', '/ipv6 address add address=2001:db8:2::1/64 interface=ether2', ctx);
    dis.dispatch('mikrotik', '/ipv6 route add dst-address=2001:db8:1::/64 gateway=2001:db8:ff::1', ctx);
    for (const n of project.nodes) syncCli(dis, sim, n.id);
    sim.computeDynamicRoutes();

    check('13a r1 memori IPv6 2 alamat', Object.keys(dis.getNodeMemory('r1').configuredIps6).length === 2, JSON.stringify(dis.getNodeMemory('r1').configuredIps6));
    check('13a r2 memori IPv6 2 alamat', Object.keys(dis.getNodeMemory('r2').configuredIps6).length === 2, JSON.stringify(dis.getNodeMemory('r2').configuredIps6));
    check('13a r1 rute v6 tersimpan', dis.getNodeMemory('r1').routes6.length === 1, JSON.stringify(dis.getNodeMemory('r1').routes6));
    check('13a r2 rute v6 tersimpan', dis.getNodeMemory('r2').routes6.length === 1, JSON.stringify(dis.getNodeMemory('r2').routes6));
    const ping6 = sim.simulatePing('pc1', '2001:db8:2::10');
    check('13a ping6 pc1→svr1 lintas 2 router', ping6.success, JSON.stringify(ping6));
    const ping6b = sim.simulatePing('svr1', '2001:db8:1::10');
    check('13a ping6 balik svr1→pc1', ping6b.success, JSON.stringify(ping6b));
    const cfg = dis.dispatch('cisco_ios', 'show running-config', ctx);
    check('13a show running-config memuat ipv6', typeof cfg === 'string' && cfg.includes('ipv6 address 2001:db8'), JSON.stringify(cfg?.slice?.(0, 120)));
    const cfgMt = dis.dispatch('mikrotik', 'export', ctx);
    check('13a export mikrotik memuat /ipv6 address', typeof cfgMt === 'string' && cfgMt.includes('/ipv6 address add'), JSON.stringify(cfgMt?.slice?.(0, 100)));
  }

  // 13b. VRRP via CLI (Cisco): master/backup + ping via virtual IP
  {
    const dis = new VendorDispatcher();
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        iNode('pc1', 'PC1', 'linux', 'pc', 1, 'e1'), iNode('sw1', 'SW1', 'cisco_ios', 'switch', 4, 'e2'),
        iNode('r1', 'R1', 'cisco_ios', 'router', 3, 'e3'), iNode('r2', 'R2', 'cisco_ios', 'router', 3, 'e4'),
      ],
      edges: [
        iEdge('e1', 'pc1', 'ether1', 'sw1', 'ether1'), iEdge('e2', 'sw1', 'ether2', 'r1', 'ether1'),
        iEdge('e3', 'sw1', 'ether3', 'r2', 'ether1'),
      ],
    };
    sim.syncTopology(project);
    let ctx = iCtx(dis, sim, 'pc1', 'PC1', project.nodes[0].ports);
    dis.dispatch('linux', 'ip addr add 192.168.1.10/24 dev ether1', ctx);
    dis.dispatch('linux', 'ip route add default via 192.168.1.254', ctx);
    // R1 (cisco): IP + VRRP prioritas tinggi
    ctx = iCtx(dis, sim, 'r1', 'R1', project.nodes[2].ports);
    dis.dispatch('cisco_ios', 'interface ether1', ctx);
    dis.dispatch('cisco_ios', 'ip address 192.168.1.1 255.255.255.0', ctx);
    dis.dispatch('cisco_ios', 'vrrp 1 ip 192.168.1.254', ctx);
    dis.dispatch('cisco_ios', 'vrrp 1 priority 120', ctx);
    // R2 (cisco): IP + VRRP prioritas default (100) → backup
    ctx = iCtx(dis, sim, 'r2', 'R2', project.nodes[3].ports);
    dis.dispatch('cisco_ios', 'interface ether1', ctx);
    dis.dispatch('cisco_ios', 'ip address 192.168.1.2 255.255.255.0', ctx);
    dis.dispatch('cisco_ios', 'vrrp 1 ip 192.168.1.254', ctx);
    for (const n of project.nodes) syncCli(dis, sim, n.id);
    sim.computeDynamicRoutes();

    const g1 = dis.getNodeMemory('r1').fhrpGroups;
    const g2 = dis.getNodeMemory('r2').fhrpGroups;
    check('13b R1 punya group VRRP', Array.isArray(g1) && g1.length === 1 && g1[0].vrid === 1 && g1[0].priority === 120, JSON.stringify(g1));
    check('13b R2 punya group VRRP', Array.isArray(g2) && g2.length === 1 && g2[0].priority === 100, JSON.stringify(g2));
    const st1 = sim.getFhrpInfo('r1');
    const st2 = sim.getFhrpInfo('r2');
    check('13b R1 = MASTER (prioritas 120)', !!st1 && st1.length === 1 && st1[0].isMaster && st1[0].masterName === 'R1', JSON.stringify(st1));
    check('13b R2 = BACKUP', !!st2 && st2.length === 1 && !st2[0].isMaster, JSON.stringify(st2));
    const pingVip = sim.simulatePing('pc1', '192.168.1.254');
    check('13b ping PC→virtual IP 192.168.1.254', pingVip.success, JSON.stringify(pingVip));
    check('13b ping ke R1 fisik tetap jalan', sim.simulatePing('pc1', '192.168.1.1').success);
    // Failover: master dimatikan → backup naik jadi master
    sim.setNodePowered('r1', false);
    sim.computeDynamicRoutes();
    const st2b = sim.getFhrpInfo('r2');
    check('13b failover: R2 jadi MASTER setelah R1 mati', !!st2b && st2b[0].isMaster, JSON.stringify(st2b));
    const pingVip2 = sim.simulatePing('pc1', '192.168.1.254');
    check('13b ping VIP tetap sukses (failover)', pingVip2.success, JSON.stringify(pingVip2));
    // CLI print via engine snapshot
    ctx = iCtx(dis, sim, 'r2', 'R2', project.nodes[3].ports);
    const vrrpPrint = dis.dispatch('mikrotik', '/routing vrrp instance print', ctx);
    check('13b mikrotik vrrp print menampilkan state', typeof vrrpPrint === 'string' && vrrpPrint.includes('MASTER'), JSON.stringify(vrrpPrint?.slice?.(0, 120)));
    // R1 hidup lagi → master kembali
    sim.setNodePowered('r1', true);
    sim.computeDynamicRoutes();
    const st1c = sim.getFhrpInfo('r1');
    check('13b R1 kembali jadi master', !!st1c && st1c[0].isMaster, JSON.stringify(st1c));
  }
}

// ── Ringkasan ────────────────────────────────────────────────────────────
// ── 14. Fitur baru: reload, OSPF cost/passive, port-security, DHCP relay, SLAAC ──
// Harness lokal (helper section 12/13 berada di scope blok masing-masing).
{
  const iPorts = (n: number, seed: string) =>
    Array.from({ length: n }, (_, i) => ({
      id: `ether${i + 1}`, name: `ether${i + 1}`, status: 'up',
      macAddress: `00:0c:29:${seed}:${(i + 1).toString().padStart(2, '0')}:01`,
    }));
  const iNode = (id: string, name: string, vendor: string, model: string, n: number, seed: string) => ({
    id, name, vendor, model, deviceType: model === 'switch' ? 'switch' : model === 'pc' || model === 'server' ? model : 'router',
    ports: iPorts(n, seed),
  });
  const iEdge = (id: string, a: string, ap: string, b: string, bp: string) => ({
    id, sourceNodeId: a, sourcePortId: ap, targetNodeId: b, targetPortId: bp, cableType: 'copper_straight',
  });
  function iCtx(dis: VendorDispatcher, sim: NetworkSimulator, nodeId: string, name: string, ports: any[], extra: Record<string, any> = {}) {
    const node = (sim as any).nodes.get(nodeId);
    const ctx: any = {
      nodeId, name, ports,
      dhcpClientGrant: (iface: string, addDefaultRoute: boolean) => {
        const granted = sim.grantDhcpLease(nodeId, iface);
        return granted ? { ip: granted.ip, gateway: granted.gateway, prefix: granted.prefix, poolNodeId: granted.poolNodeId } : null;
      },
      pingSimulator: (host: string, vendorId: string) => formatPingOutput(vendorId, host, sim.simulatePing(nodeId, host)),
      ospfNeighborProvider: () => sim.getOspfNeighbors(nodeId),
      fhrpProvider: () => sim.getFhrpInfo(node),
      ipv6Provider: () => sim.getIpv6Info(nodeId),
    };
    return { ...ctx, ...extra };
  }
  const syncCli = (d: VendorDispatcher, s: NetworkSimulator, nodeId: string) => {
    const mem = d.getNodeMemory(nodeId);
    s.applyNodeConfig(nodeId, mem.configuredIps, mem.routes);
    s.setDhcpPools({ [nodeId]: mem.dhcpPools });
    s.setRouting(nodeId, mem.routing);
    s.setBgp(nodeId, mem.bgp);
    s.setDnsRecords(nodeId, mem.dnsRecords);
    s.setDnsServers(nodeId, mem.dnsServers);
    s.setAcls(nodeId, mem.acls);
    s.setNatRules(nodeId, mem.natRules);
    s.setPortVlans(nodeId, mem.portVlans as Record<string, number>);
    s.setShutdownIfaces(nodeId, mem.shutdownIfaces);
    s.setSubinterfaces(nodeId, mem.subinterfaces);
    s.setTrunkPorts(nodeId, mem.trunkPorts);
    s.setStp(nodeId, mem.stp);
    s.setFhrp(nodeId, mem.fhrpGroups);
    s.applyNodeConfig6(nodeId, mem.configuredIps6, mem.routes6);
    s.setDhcpRelays(nodeId, mem.dhcpRelays);
    s.setPortSecurity(nodeId, mem.portSecurity);
    s.setIpv6DhcpClients(nodeId, mem.ipv6DhcpClients);
    s.setWireless(nodeId, { interfaces: mem.wireless, profiles: mem.wirelessSecurityProfiles });
    s.setQos(nodeId, mem.queues, mem.mangleRules);
    s.setSnmp(nodeId, mem.snmp);
  };

// ── 14a. reload: restore node dari startup-config ──────────────
{
  const dis = new VendorDispatcher();
  const sim = new NetworkSimulator();
  const project: LabProjectLike = {
    nodes: [
      iNode('r1', 'R1', 'cisco_ios', 'router', 3, 'a1'),
      iNode('svr1', 'SVR1', 'linux', 'server', 1, 'a2'),
    ],
    edges: [iEdge('e1', 'r1', 'ether1', 'svr1', 'ether1')],
  };
  sim.syncTopology(project);
  let ctx = iCtx(dis, sim, 'r1', 'R1', project.nodes[0].ports);
  dis.dispatch('cisco_ios', 'interface ether1', ctx);
  dis.dispatch('cisco_ios', 'ip address 192.168.1.1 255.255.255.0', ctx);
  dis.dispatch('cisco_ios', 'exit', ctx);
  dis.dispatch('cisco_ios', 'ip route 0.0.0.0 0.0.0.0 192.168.1.254', ctx);
  dis.dispatch('cisco_ios', 'write memory', ctx);
  // Tambahan konfigurasi SETELAH write memory → harus hilang saat reload.
  dis.dispatch('cisco_ios', 'interface ether2', ctx);
  dis.dispatch('cisco_ios', 'ip address 10.0.0.1 255.255.255.0', ctx);
  dis.dispatch('cisco_ios', 'exit', ctx);
  dis.dispatch('cisco_ios', 'ip route 172.16.0.0 255.255.0.0 10.0.0.254', ctx);
  for (const n of project.nodes) syncCli(dis, sim, n.id);

  const memPre = dis.getNodeMemory('r1');
  check('14a sebelum reload: ether2 terkonfigurasi', !!memPre.configuredIps['ether2']);
  check('14a sebelum reload: rute 172.16 ada', memPre.routes.some((r: any) => r.dst === '172.16.0.0 255.255.0.0'));
  const pre = sim.getDeviceStats('r1');
  check('14a sebelum reload: engine punya rute 172.16', !!pre?.routes.some((r) => r.dst === '172.16.0.0/16'));

  const reloadOut = dis.dispatch('cisco_ios', 'reload', ctx);
  const memPost = dis.getNodeMemory('r1');
  check('14a reload output menyebut restart', typeof reloadOut === 'string' && /restart|reload/i.test(reloadOut), JSON.stringify(reloadOut));
  check('14a sesudah reload: ether2 hilang', !memPost.configuredIps['ether2']);
  check('14a sesudah reload: ether1 & default route tersimpan', !!memPost.configuredIps['ether1'] && memPost.routes.some((r: any) => r.dst === '0.0.0.0 0.0.0.0'));
  check('14a sesudah reload: rute 172.16 hilang', !memPost.routes.some((r: any) => r.dst === '172.16.0.0 255.255.0.0'));

  for (const n of project.nodes) syncCli(dis, sim, n.id);
  const post = sim.getDeviceStats('r1');
  check('14a engine ikut reset: 172.16 tidak ada', !post?.routes.some((r) => r.dst === '172.16.0.0/16'));
  check('14a engine: ether2 IP hilang', !post?.interfaces.some((i) => i.ip === '10.0.0.1'));
}

// ── 14b. OSPF cost interface + passive-interface ───────────────
{
  const dis = new VendorDispatcher();
  const sim = new NetworkSimulator();
  const project: LabProjectLike = {
    nodes: [
      iNode('r2', 'R2', 'cisco_ios', 'router', 3, 'b2'),
      iNode('r3', 'R3', 'cisco_ios', 'router', 3, 'b3'),
      iNode('r4', 'R4', 'cisco_ios', 'router', 3, 'b4'),
    ],
    edges: [
      iEdge('e1', 'r2', 'ether1', 'r4', 'ether1'),
      iEdge('e2', 'r2', 'ether2', 'r3', 'ether1'),
      iEdge('e3', 'r4', 'ether2', 'r3', 'ether2'),
    ],
  };
  sim.syncTopology(project);
  // Segment S1: r2.e1–r4.e1 (192.168.1.0/30) · S2: r2.e2–r3.e1 (192.168.2.0/30)
  // S3: r4.e2–r3.e2 (192.168.3.0/30) · LAN r3.e3: 192.168.4.0/24
  const cfg = (id: string, ips: Record<string, string>) => {
    const ctx = iCtx(dis, sim, id, id.toUpperCase(), project.nodes.find((n) => n.id === id)!.ports);
    for (const [iface, ip] of Object.entries(ips)) {
      dis.dispatch('cisco_ios', `interface ${iface}`, ctx);
      dis.dispatch('cisco_ios', `ip address ${ip}`, ctx);
      dis.dispatch('cisco_ios', 'exit', ctx);
    }
    return ctx;
  };
  const ctxR2 = cfg('r2', { ether1: '192.168.1.1 255.255.255.252', ether2: '192.168.2.1 255.255.255.252' });
  cfg('r3', { ether1: '192.168.2.2 255.255.255.252', ether2: '192.168.3.2 255.255.255.252', ether3: '192.168.4.1 255.255.255.0' });
  cfg('r4', { ether1: '192.168.1.2 255.255.255.252', ether2: '192.168.3.1 255.255.255.252' });

  const ospf = (id: string, nets: string[]) => {
    const ctx = iCtx(dis, sim, id, id.toUpperCase(), project.nodes.find((n) => n.id === id)!.ports);
    dis.dispatch('cisco_ios', 'router ospf 1', ctx);
    for (const n of nets) dis.dispatch('cisco_ios', `network ${n} area 0`, ctx);
    dis.dispatch('cisco_ios', 'exit', ctx);
  };
  ospf('r2', ['192.168.1.0 0.0.0.3', '192.168.2.0 0.0.0.3']);
  ospf('r3', ['192.168.2.0 0.0.0.3', '192.168.3.0 0.0.0.3', '192.168.4.0 0.0.0.255']);
  ospf('r4', ['192.168.1.0 0.0.0.3', '192.168.3.0 0.0.0.3']);

  // Jalur ke LAN R3 (192.168.4.0/24) dari R2:
  //   langsung r2→r3 via S2 (cost r3.ether1 = 100)
  //   vs r2→r4→r3 via S3+S1 (cost r3.ether2 = 1 + cost r4.ether1 = 1 → total 2).
  // Cost dipasang di sisi ADVERTISER (r3) sesuai model metrik flooding engine.
  const ctxR3 = cfg('r3', {});
  dis.dispatch('cisco_ios', 'interface ether1', ctxR3);
  dis.dispatch('cisco_ios', 'ip ospf cost 100', ctxR3);
  dis.dispatch('cisco_ios', 'exit', ctxR3);
  dis.dispatch('cisco_ios', 'interface ether2', ctxR3);
  dis.dispatch('cisco_ios', 'ip ospf cost 1', ctxR3);
  dis.dispatch('cisco_ios', 'exit', ctxR3);
  const costMem = dis.getNodeMemory('r3').routing.ospf;
  check('14b cost interface tersimpan', (costMem as any).interfaceCosts?.ether1 === 100 && (costMem as any).interfaceCosts?.ether2 === 1, JSON.stringify((costMem as any).interfaceCosts));
  for (const n of project.nodes) syncCli(dis, sim, n.id);
  sim.computeDynamicRoutes();

  const r2Route = () =>
    sim.getDeviceStats('r2')?.routes.find((x) => x.dst === '192.168.4.0/24' && x.kind === 'dynamic')?.gateway || '';
  // Jalur murah: r2→r4→r3 (2) < r2→r3 langsung (100) → via R4.
  check('14b R2 memilih jalur murah via R4', r2Route() === '192.168.1.2', r2Route());
  const pingCheap = sim.simulatePing('r2', '192.168.4.1');
  check('14b ping ke R3/LAN sukses lewat jalur murah', pingCheap.success, JSON.stringify(pingCheap));
  const neighborsCheap = sim.getOspfNeighbors('r2');
  check('14b OSPF neighbor r2: 2 tetangga', neighborsCheap.length === 2, JSON.stringify(neighborsCheap));

  // Naikkan cost r3.ether2 (ke R4) menjadi 1000 → R2 beralih ke jalur langsung r2→r3.
  dis.dispatch('cisco_ios', 'interface ether2', ctxR3);
  dis.dispatch('cisco_ios', 'ip ospf cost 1000', ctxR3);
  dis.dispatch('cisco_ios', 'exit', ctxR3);
  for (const n of project.nodes) syncCli(dis, sim, n.id);
  sim.computeDynamicRoutes();
  check('14b R2 berpindah ke jalur langsung R3', r2Route() === '192.168.2.2', r2Route());
  check('14b ping tetap sukses setelah cost naik', sim.simulatePing('r2', '192.168.4.1').success);

  // passive-interface di sisi r2 (ether1 ke r4): adjacency r2–r4 hilang.
  dis.dispatch('cisco_ios', 'router ospf 1', ctxR2);
  dis.dispatch('cisco_ios', 'passive-interface ether1', ctxR2);
  dis.dispatch('cisco_ios', 'exit', ctxR2);
  const passMem = dis.getNodeMemory('r2').routing.ospf;
  check('14b passive-interface tersimpan', (passMem as any).passiveInterfaces?.includes('ether1'), JSON.stringify((passMem as any).passiveInterfaces));
  for (const n of project.nodes) syncCli(dis, sim, n.id);
  sim.computeDynamicRoutes();

  const n2 = sim.getOspfNeighbors('r2');
  const n4 = sim.getOspfNeighbors('r4');
  check('14b passive: r2 tidak melihat R4', n2.length === 1 && n2[0].routerId === '192.168.2.2', JSON.stringify(n2));
  check('14b passive: r4 tidak melihat R2', n4.length === 1 && n4[0].routerId === '192.168.2.2', JSON.stringify(n4));
  check('14b passive: rute R2 masih ada (via R3 langsung)', r2Route() === '192.168.2.2', r2Route());
  check('14b passive: ping R2→LAN R3 tetap sukses', sim.simulatePing('r2', '192.168.4.1').success);
  check('14b passive: ping R4→LAN R3 tetap sukses', sim.simulatePing('r4', '192.168.4.1').success);
}

// ── 14c. port-security (Cisco switch): config → engine → stats ─
{
  const dis = new VendorDispatcher();
  const sim = new NetworkSimulator();
  const project: LabProjectLike = {
    nodes: [
      iNode('pc1', 'PC1', 'linux', 'pc', 1, 'c1'),
      iNode('pc2', 'PC2', 'linux', 'pc', 1, 'c2'),
      iNode('sw1', 'SW1', 'cisco_ios', 'switch', 3, 'c3'),
    ],
    edges: [
      iEdge('e1', 'pc1', 'ether1', 'sw1', 'ether1'),
      iEdge('e2', 'pc2', 'ether1', 'sw1', 'ether2'),
    ],
  };
  sim.syncTopology(project);
  const ctxPc1 = iCtx(dis, sim, 'pc1', 'PC1', project.nodes[0].ports);
  const ctxPc2 = iCtx(dis, sim, 'pc2', 'PC2', project.nodes[1].ports);
  dis.dispatch('linux', 'ip addr add 192.168.1.10/24 dev ether1', ctxPc1);
  dis.dispatch('linux', 'ip addr add 192.168.1.20/24 dev ether1', ctxPc2);
  const ctxSw1 = iCtx(dis, sim, 'sw1', 'SW1', project.nodes[2].ports);
  dis.dispatch('cisco_ios', 'interface ether1', ctxSw1);
  dis.dispatch('cisco_ios', 'switchport port-security', ctxSw1);
  dis.dispatch('cisco_ios', 'switchport port-security maximum 1', ctxSw1);
  dis.dispatch('cisco_ios', 'switchport port-security mac-address sticky', ctxSw1);
  dis.dispatch('cisco_ios', 'switchport port-security violation restrict', ctxSw1);
  dis.dispatch('cisco_ios', 'exit', ctxSw1);
  const psMem = dis.getNodeMemory('sw1').portSecurity;
  check('14c config port-security tersimpan', !!psMem['ether1'] && psMem['ether1'].limit === 1 && psMem['ether1'].sticky === true, JSON.stringify(psMem));
  for (const n of project.nodes) syncCli(dis, sim, n.id);

  const stats1 = sim.getDeviceStats('sw1');
  check('14c engine mendapat port-security (limit+sticky)', !!stats1?.portSecurity && stats1.portSecurity['ether1']?.limit === 1 && stats1.portSecurity['ether1']?.sticky === true, JSON.stringify(stats1?.portSecurity));
  // Operasi normal: satu MAC per port tetap lancar dengan port-security aktif.
  const pingOk = sim.simulatePing('pc1', '192.168.1.20');
  check('14c forwarding normal dengan port-security aktif', pingOk.success, JSON.stringify(pingOk));
  const stats2 = sim.getDeviceStats('sw1');
  check('14c MAC dipelajari per port', (stats2?.portSecurity?.['ether1']?.learned?.length ?? 0) >= 1, JSON.stringify(stats2?.portSecurity));

  dis.dispatch('cisco_ios', 'interface ether1', ctxSw1);
  dis.dispatch('cisco_ios', 'no switchport port-security', ctxSw1);
  dis.dispatch('cisco_ios', 'exit', ctxSw1);
  for (const n of project.nodes) syncCli(dis, sim, n.id);
  const stats3 = sim.getDeviceStats('sw1');
  check('14c no port-security → config hilang dari engine', !stats3?.portSecurity?.['ether1'], JSON.stringify(stats3?.portSecurity));
  check('14c ping tetap sukses setelah nonaktif', sim.simulatePing('pc1', '192.168.1.20').success);
}

// ── 14d. DHCP relay (ip helper-address) ─────────────────────────
{
  const dis = new VendorDispatcher();
  const sim = new NetworkSimulator();
  const project: LabProjectLike = {
    nodes: [
      iNode('pc1', 'PC1', 'linux', 'pc', 1, 'd1'),
      iNode('r1', 'R1', 'cisco_ios', 'router', 2, 'd2'),
      iNode('r2', 'R2', 'mikrotik', 'router', 2, 'd3'),
    ],
    edges: [
      iEdge('e1', 'pc1', 'ether1', 'r1', 'ether1'),
      iEdge('e2', 'r1', 'ether2', 'r2', 'ether1'),
    ],
  };
  sim.syncTopology(project);
  let ctx = iCtx(dis, sim, 'r1', 'R1', project.nodes[1].ports);
  dis.dispatch('cisco_ios', 'interface ether1', ctx);
  dis.dispatch('cisco_ios', 'ip address 192.168.1.1 255.255.255.0', ctx);
  dis.dispatch('cisco_ios', 'ip helper-address 10.0.1.2', ctx);
  dis.dispatch('cisco_ios', 'interface ether2', ctx);
  dis.dispatch('cisco_ios', 'ip address 10.0.1.1 255.255.255.0', ctx);
  dis.dispatch('cisco_ios', 'exit', ctx);
  check('14d helper-address tersimpan', dis.getNodeMemory('r1').dhcpRelays['ether1'] === '10.0.1.2', JSON.stringify(dis.getNodeMemory('r1').dhcpRelays));

  ctx = iCtx(dis, sim, 'r2', 'R2', project.nodes[2].ports);
  dis.dispatch('mikrotik', '/ip address add address=10.0.1.2/24 interface=ether1', ctx);
  dis.dispatch('mikrotik', '/ip pool add name=pool1 ranges=192.168.1.100-192.168.1.200', ctx);
  dis.dispatch('mikrotik', '/ip dhcp-server add name=dhcp1 interface=ether1 address-pool=pool1', ctx);
  const poolsMem = dis.getNodeMemory('r2').dhcpPools;
  check('14d pool server tersimpan', poolsMem.some((p: any) => p.name === 'pool1'), JSON.stringify(poolsMem));
  for (const n of project.nodes) syncCli(dis, sim, n.id);

  const lease = sim.grantDhcpLease('pc1', 'ether1');
  check('14d client dapat IP via relay', !!lease && lease.ip === '192.168.1.100', JSON.stringify(lease));
  check('14d IP tercatat di leases', sim.getLeases().some((l) => l.nodeId === 'pc1' && l.ip === '192.168.1.100'));
}

// ── 14e. SLAAC / DHCPv6 client (MikroTik) ───────────────────────
{
  const dis = new VendorDispatcher();
  const sim = new NetworkSimulator();
  const project: LabProjectLike = {
    nodes: [
      iNode('r1', 'R1', 'cisco_ios', 'router', 2, 'e1'),
      iNode('r2', 'R2', 'mikrotik', 'router', 2, 'e2'),
    ],
    edges: [iEdge('e1', 'r1', 'ether1', 'r2', 'ether1')],
  };
  sim.syncTopology(project);
  let ctx = iCtx(dis, sim, 'r1', 'R1', project.nodes[0].ports);
  dis.dispatch('cisco_ios', 'interface ether1', ctx);
  dis.dispatch('cisco_ios', 'ipv6 address 2001:db8:1::1/64', ctx);
  dis.dispatch('cisco_ios', 'exit', ctx);
  const mem6 = dis.getNodeMemory('r1');
  check('14e ipv6 r1 terkonfigurasi', mem6.configuredIps6['ether1'] === '2001:db8:1::1/64', JSON.stringify(mem6.configuredIps6));

  ctx = iCtx(dis, sim, 'r2', 'R2', project.nodes[1].ports);
  dis.dispatch('mikrotik', '/ipv6 dhcp-client add interface=ether1', ctx);
  check('14e dhcp-client r2 tersimpan', dis.getNodeMemory('r2').ipv6DhcpClients.length === 1, JSON.stringify(dis.getNodeMemory('r2').ipv6DhcpClients));
  for (const n of project.nodes) syncCli(dis, sim, n.id);

  const info = sim.getIpv6Info('r2');
  const addr6 = info?.addresses?.find((i) => i.iface === 'ether1')?.address || '';
  check('14e SLAAC r2 dapat global address', typeof addr6 === 'string' && addr6.startsWith('2001:db8:1:'), JSON.stringify(info));
  const ping6 = sim.simulatePing6('r2', '2001:db8:1::1');
  check('14e ping6 r2 ke gateway sukses', ping6.success, JSON.stringify(ping6));
  const out = dis.dispatch('mikrotik', '/ipv6 dhcp-client print', iCtx(dis, sim, 'r2', 'R2', project.nodes[1].ports));
  check('14e print dhcp-client BOUND', typeof out === 'string' && /bound/i.test(out), JSON.stringify(out));
}
}

// ── 15. Perilaku engine baru: validasi IP host, traceroute TTL, power-off,
//       DHCP lanjutan (disabled/excluded/lease-time/option 6), NAT & firewall
//       src-address/out-interface, loop guard L2 ─────────────────────────────
console.log('\n== 15. Engine correctness (host IP, traceroute, power, DHCP, NAT/FW, L2 loop) ==');
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
  const ifaceIps = (sim: NetworkSimulator, nodeId: string) =>
    (sim.getDeviceStats(nodeId)?.interfaces || []).map((i) => i.ip).filter((x): x is string => !!x);

  // 15a. Alamat network/broadcast/prefix>30 DITOLAK sebagai host IP
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = { nodes: [eNode('r1', 'R1', 'router', 4, 'a1')], edges: [] };
    sim.syncTopology(project);
    sim.applyNodeConfig('r1', {
      ether1: '192.168.1.0/24',    // alamat network — bukan host valid
      ether2: '192.168.2.255/24',  // alamat broadcast
      ether3: '192.168.3.1/32',    // /32 — tidak ada ruang host
      ether4: '192.168.4.1/24',    // host valid
    }, []);
    const ips = ifaceIps(sim, 'r1');
    check('15a alamat network ditolak', !ips.includes('192.168.1.0/24'), JSON.stringify(ips));
    check('15a alamat broadcast ditolak', !ips.includes('192.168.2.255/24'), JSON.stringify(ips));
    check('15a prefix /32 ditolak', !ips.includes('192.168.3.1/32'), JSON.stringify(ips));
    check('15a host valid diterima', ips.includes('192.168.4.1/24'), JSON.stringify(ips));
    check('15a hanya 1 IP terpasang', ips.length === 1, JSON.stringify(ips));
  }

  // 15b. Traceroute per-TTL hop-by-hop (bukan satu ping): sukses, putus tengah, unreachable
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('pc1', 'PC1', 'pc', 1, 'b1'), eNode('sw1', 'SW1', 'switch', 4, 'b2'), eNode('r1', 'R1', 'router', 3, 'b3'),
        eNode('r2', 'R2', 'router', 3, 'b4'), eNode('sw2', 'SW2', 'switch', 4, 'b5'), eNode('pc2', 'PC2', 'pc', 1, 'b6'),
      ],
      edges: [
        eEdge('e1', 'pc1', 'port1', 'sw1', 'port1'), eEdge('e2', 'sw1', 'port2', 'r1', 'port1'),
        eEdge('e3', 'r1', 'port2', 'r2', 'port1'), eEdge('e4', 'r2', 'port2', 'sw2', 'port1'),
        eEdge('e5', 'sw2', 'port2', 'pc2', 'port1'),
      ],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24', ether2: '192.168.1.1/30' }, [{ dst: '10.0.2.0/24', gateway: '192.168.1.2' }]);
    sim.applyNodeConfig('r2', { ether1: '192.168.1.2/30', ether2: '10.0.2.1/24' }, [{ dst: '10.0.1.0/24', gateway: '192.168.1.1' }]);
    sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
    sim.applyNodeConfig('pc2', { ether1: '10.0.2.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.2.1' }]);

    const tr = sim.simulateTraceroute('pc1', '10.0.2.2');
    check('15b traceroute sukses ke tujuan', tr.ok, JSON.stringify(tr));
    check('15b hop1 = R1 (10.0.1.1) TTL1', tr.hops[0]?.name === 'R1' && tr.hops[0]?.ttl === 1 && tr.hops[0]?.ip === '10.0.1.1', JSON.stringify(tr.hops));
    check('15b hop2 = R2 (192.168.1.2) TTL2', tr.hops[1]?.name === 'R2' && tr.hops[1]?.ttl === 2 && tr.hops[1]?.ip === '192.168.1.2', JSON.stringify(tr.hops));
    check('15b hop3 = PC2 tujuan TTL3', tr.hops[2]?.name === 'PC2' && tr.hops[2]?.ttl === 3 && tr.hops[2]?.ip === '10.0.2.2', JSON.stringify(tr.hops));

    // Jalur putus di tengah: ACL di R2 → hop parsial [R1] + reason blocked.
    sim.setAcls('r2', [{ action: 'deny', proto: 'icmp', src: '10.0.1.0/24', dst: '10.0.2.0/24' }] as AclRule[]);
    const blocked = sim.simulateTraceroute('pc1', '10.0.2.2');
    check('15b terblokir tengah: hop parsial + reason blocked', !blocked.ok && blocked.hops.length === 1 && blocked.hops[0]?.name === 'R1' && blocked.reason === 'blocked', JSON.stringify(blocked));

    // Tidak ada rute sama sekali → ICMP dest-unreachable di hop pertama.
    const unr = sim.simulateTraceroute('pc1', '10.0.9.9');
    check('15b unreachable: reason unreachable + hop tercatat', !unr.ok && unr.reason === 'unreachable' && unr.hops.length >= 1, JSON.stringify(unr));
    check('15b IP invalid ditolak', !sim.simulateTraceroute('pc1', '999.1.1.1').ok);
  }

  // 15c. Power-off mencabut rute dinamis (OSPF) yang next-hop-nya lewat device mati
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('r1', 'R1', 'router', 3, 'c1'), eNode('r2', 'R2', 'router', 3, 'c2'), eNode('r3', 'R3', 'router', 3, 'c3'),
      ],
      edges: [
        eEdge('e1', 'r1', 'port2', 'r2', 'port1'), eEdge('e2', 'r2', 'port2', 'r3', 'port1'),
      ],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24', ether2: '192.168.1.1/30' }, []);
    sim.applyNodeConfig('r2', { ether1: '192.168.1.2/30', ether2: '192.168.2.1/30' }, []);
    sim.applyNodeConfig('r3', { ether1: '192.168.2.2/30', ether2: '10.0.3.1/24' }, []);
    sim.setRouting('r1', { ospf: { enabled: true, networks: ['10.0.1.0/24', '192.168.1.0/30'] } });
    sim.setRouting('r2', { ospf: { enabled: true, networks: ['192.168.1.0/30', '192.168.2.0/30'] } });
    sim.setRouting('r3', { ospf: { enabled: true, networks: ['192.168.2.0/30', '10.0.3.0/24'] } });
    sim.computeDynamicRoutes();
    const hasRoute = (id: string, dst: string) => sim.getDeviceStats(id)?.routes.some((r) => r.dst === dst && r.kind === 'dynamic');
    check('15c r1 belajar 10.0.3.0/24 via OSPF', !!hasRoute('r1', '10.0.3.0/24'));
    check('15c ping r1→10.0.3.1 sukses', sim.simulatePing('r1', '10.0.3.1').success);
    sim.setNodePowered('r2', false);
    check('15c R2 mati → rute r1 dicabut', !hasRoute('r1', '10.0.3.0/24'));
    check('15c R2 mati → ping gagal', !sim.simulatePing('r1', '10.0.3.1').success);
    sim.setNodePowered('r2', true);
    check('15c R2 hidup → rute kembali', !!hasRoute('r1', '10.0.3.0/24'));
    check('15c R2 hidup → ping sukses lagi', sim.simulatePing('r1', '10.0.3.1').success);
  }

  // 15d. DHCP lanjutan: excluded-address, lease-time, DNS option 6, pool disabled
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('pc1', 'PC1', 'pc', 1, 'd1'), eNode('pc2', 'PC2', 'pc', 1, 'd2'),
        eNode('sw1', 'SW1', 'switch', 4, 'd3'), eNode('r1', 'R1', 'router', 3, 'd4'),
      ],
      edges: [
        eEdge('e1', 'pc1', 'port1', 'sw1', 'port1'), eEdge('e2', 'pc2', 'port1', 'sw1', 'port2'),
        eEdge('e3', 'sw1', 'port3', 'r1', 'port1'),
      ],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('r1', { ether1: '192.168.5.1/24' }, []);
    sim.setDnsRecords('r1', [{ name: 'web.lab', address: '192.168.5.50' }]);
    const pool: any = {
      name: 'lan5', iface: 'ether1', network: '192.168.5.0/24', range: '192.168.5.100-192.168.5.150',
      gateway: '192.168.5.1', excluded: ['192.168.5.100'], leaseTimeMs: 3_600_000, dnsServers: ['192.168.5.1'],
    };
    sim.setDhcpPools({ r1: [pool] });

    const lease = sim.grantDhcpLease('pc1', 'ether1');
    check('15d IP pertama melewati excluded-address', !!lease && lease.ip === '192.168.5.101', JSON.stringify(lease));
    const pcNode: any = (sim as any).nodes.get('pc1');
    const leaseRec = pcNode?.leases.get('ether1');
    check('15d lease-time pool (1 jam) dipakai', !!leaseRec && Math.abs(leaseRec.expiresAt - sim.time.now() - 3_600_000) < 1000, JSON.stringify(leaseRec));
    check('15d DNS option 6 terpasang di klien', JSON.stringify(pcNode?.dnsServers) === JSON.stringify(['192.168.5.1']), JSON.stringify(pcNode?.dnsServers));
    const dns = sim.resolveHostname('pc1', 'web.lab');
    check('15d resolve via DNS server dari option 6', dns.resolved === '192.168.5.50', JSON.stringify(dns));

    pool.disabled = true;
    sim.setDhcpPools({ r1: [pool] });
    check('15d pool disabled → client baru tanpa lease', sim.grantDhcpLease('pc2', 'ether1') === null);
    pool.disabled = false;
    sim.setDhcpPools({ r1: [pool] });
    const lease2 = sim.grantDhcpLease('pc2', 'ether1');
    check('15d pool aktif kembali → IP berikutnya', !!lease2 && lease2.ip === '192.168.5.102', JSON.stringify(lease2));
  }

  // 15e. NAT mematuhi src-address rule (masquerade & dstnat port-forward)
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('pc1', 'PC1', 'pc', 1, 'e1'), eNode('sw1', 'SW1', 'switch', 4, 'e2'), eNode('r1', 'R1', 'router', 3, 'e3'),
        eNode('r2', 'R2-ISP', 'router', 3, 'e4'), eNode('pub', 'PUB', 'server', 1, 'e5'), eNode('svr', 'SVR', 'server', 1, 'e6'),
      ],
      edges: [
        eEdge('e1', 'pc1', 'port1', 'sw1', 'port1'), eEdge('e2', 'sw1', 'port2', 'r1', 'port1'),
        eEdge('e3', 'r1', 'port2', 'r2', 'port1'), eEdge('e4', 'r2', 'port2', 'pub', 'port1'),
        eEdge('e5', 'sw1', 'port3', 'svr', 'port1'),
      ],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24', ether2: '203.0.113.1/24' }, [{ dst: '0.0.0.0/0', gateway: '203.0.113.254' }]);
    sim.applyNodeConfig('r2', { ether1: '203.0.113.254/24', ether2: '8.8.8.1/24' }, []); // tanpa rute balik
    sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
    sim.applyNodeConfig('svr', { ether1: '10.0.1.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
    sim.applyNodeConfig('pub', { ether1: '8.8.8.8/24' }, [{ dst: '0.0.0.0/0', gateway: '8.8.8.1' }]);
    sim.setWebServer('pub', { enabled: true, port: 80, content: 'Public' });
    sim.setWebServer('svr', { enabled: true, port: 80, content: 'SVR' });

    // masquerade dengan src-address yang TIDAK cocok → tanpa NAT → egress gagal
    sim.setNatRules('r1', [{ chain: 'srcnat', action: 'masquerade', outInterface: 'ether2', srcAddress: '192.168.99.0/24' }] as NatRule[]);
    check('15e srcnat rule tak cocok → egress gagal', !sim.simulateTcpConnect('pc1', '8.8.8.8', 80).ok);
    // src-address cocok → NAT aktif → sukses
    sim.setNatRules('r1', [{ chain: 'srcnat', action: 'masquerade', outInterface: 'ether2', srcAddress: '10.0.1.0/24' }] as NatRule[]);
    check('15e srcnat rule cocok → NAT jalan', sim.simulateTcpConnect('pc1', '8.8.8.8', 80).body === 'Public');

    // dstnat port-forward dengan src-address: hanya 10.0.1.0/24 yang diterjemahkan
    sim.setNatRules('r1', [{ chain: 'dstnat', dstAddress: '203.0.113.1', dstPort: '80', protocol: 'tcp', srcAddress: '10.0.1.0/24', toAddresses: '10.0.1.10' }] as NatRule[]);
    check('15e dstnat src cocok → port-forward ke SVR', sim.simulateTcpConnect('pc1', '203.0.113.1', 80).body === 'SVR');
    check('15e dstnat src tak cocok → tidak diterjemahkan', !sim.simulateTcpConnect('pub', '203.0.113.1', 80).ok);
  }

  // 15f. Rule firewall out-interface hanya memblokir egress interface tsb
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('pc1', 'PC1', 'pc', 1, 'f1'), eNode('sw1', 'SW1', 'switch', 4, 'f2'), eNode('r1', 'R1', 'router', 4, 'f3'),
        eNode('r2', 'R2-ISP', 'router', 3, 'f4'), eNode('pub', 'PUB', 'server', 1, 'f5'), eNode('svr', 'SVR', 'server', 1, 'f6'),
      ],
      edges: [
        eEdge('e1', 'pc1', 'port1', 'sw1', 'port1'), eEdge('e2', 'sw1', 'port2', 'r1', 'port1'),
        eEdge('e3', 'r1', 'port2', 'r2', 'port1'), eEdge('e4', 'r2', 'port2', 'pub', 'port1'),
        eEdge('e5', 'r1', 'port3', 'svr', 'port1'),
      ],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24', ether2: '203.0.113.1/24', ether3: '10.0.9.1/24' }, [{ dst: '0.0.0.0/0', gateway: '203.0.113.254' }]);
    sim.applyNodeConfig('r2', { ether1: '203.0.113.254/24', ether2: '8.8.8.1/24' }, [
      { dst: '10.0.1.0/24', gateway: '203.0.113.1' }, { dst: '10.0.9.0/24', gateway: '203.0.113.1' },
    ]);
    sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
    sim.applyNodeConfig('svr', { ether1: '10.0.9.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.9.1' }]);
    sim.applyNodeConfig('pub', { ether1: '8.8.8.8/24' }, [{ dst: '0.0.0.0/0', gateway: '8.8.8.1' }]);

    check('15f sebelum ACL: ping wan sukses', sim.simulatePing('pc1', '8.8.8.8').success);
    sim.setAcls('r1', [{ action: 'deny', proto: 'icmp', outInterface: 'ether2' }] as AclRule[]);
    const wan = sim.simulatePing('pc1', '8.8.8.8');
    check('15f deny out-interface=wan blokir egress wan', !wan.success && wan.reason === 'blocked', JSON.stringify(wan));
    check('15f egress lan (ether3) TIDAK kena rule wan', sim.simulatePing('pc1', '10.0.9.10').success);
    sim.setAcls('r1', [{ action: 'deny', proto: 'icmp', outInterface: 'ether3' }] as AclRule[]);
    check('15f egress lan kini diblokir', !sim.simulatePing('pc1', '10.0.9.10').success);
    check('15f egress wan lepas dari blokir', sim.simulatePing('pc1', '8.8.8.8').success);
  }

  // 15g. Loop L2 tanpa STP: loop guard membatasi hop → simulasi tidak menggantung
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('pc1', 'PC1', 'pc', 1, 'g1'), eNode('sw1', 'SW1', 'switch', 4, 'g2'),
        eNode('sw2', 'SW2', 'switch', 4, 'g3'), eNode('pc2', 'PC2', 'pc', 1, 'g4'),
      ],
      edges: [
        eEdge('e1', 'pc1', 'port1', 'sw1', 'port1'), eEdge('e2', 'sw1', 'port2', 'sw2', 'port1'),
        eEdge('e3', 'sw1', 'port3', 'sw2', 'port2'), eEdge('e4', 'sw2', 'port3', 'pc2', 'port1'),
      ],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, []);
    sim.applyNodeConfig('pc2', { ether1: '10.0.1.3/24' }, []);
    const res = sim.simulatePing('pc1', '10.0.1.3');
    check('15g ping di loop L2 selesai (tidak hang)', typeof res.success === 'boolean', JSON.stringify(res));
    const res2 = sim.simulatePing('pc1', '10.0.1.3');
    check('15g loop tidak mengunci state (ping kedua jalan)', typeof res2.success === 'boolean', JSON.stringify(res2));
  }
}

// ── 16. Lab scenarios (/test) ─────────────────────────────────────────────
console.log('\n== 16. Lab scenarios ==');
{
  const summary = runLab(LAB_SCENARIOS);
  for (const s of summary.scenarios) {
    const failedAssertions = s.assertions.filter((a) => !a.pass);
    check(
      `16 ${s.id} — ${s.name} (${s.passed}/${s.assertions.length})`,
      s.pass,
      failedAssertions.map((a) => `${a.name} [expected ${a.expected}, actual ${a.actual}]`).join(' | ')
    );
  }
}

// ── 17. Route precedence: connected vs static, penimpaan, distance, inactive ──
console.log('\n== 17. Route precedence (connected>static, distance, inactive) ==');
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

  // 17a. Rute statis dst yang sama dengan connected → connected menang (2-tier).
  // Skenario jebakan: rute statis 10.0.1.0/24 via gateway hantu 10.0.1.200
  // TIDAK boleh dipakai untuk trafik 10.0.1.x yang sudah connected.
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('pc1', 'PC1', 'pc', 1, '17a'), eNode('svr', 'SVR', 'server', 1, '17b'),
        eNode('sw1', 'SW1', 'switch', 4, '17c'), eNode('r1', 'R1', 'router', 3, '17d'),
      ],
      edges: [
        eEdge('e1', 'pc1', 'port1', 'sw1', 'port1'), eEdge('e2', 'svr', 'port1', 'sw1', 'port2'),
        eEdge('e3', 'sw1', 'port3', 'r1', 'port1'),
      ],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24' }, [{ dst: '10.0.1.0/24', gateway: '10.0.1.200' }]);
    sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, []);
    sim.applyNodeConfig('svr', { ether1: '10.0.1.5/24' }, []);
    const routes = sim.getDevice('r1')!.getRoutes();
    check('17a rute statis sama-dst tetap TERCATAT', routes.some((r) => r.kind === 'static' && r.dst === '10.0.1.0/24'), JSON.stringify(routes));
    check('17a rute connected juga tercatat', routes.some((r) => r.kind === 'connected' && r.dst === '10.0.1.0/24'), JSON.stringify(routes));
    check('17a ping langsung memakai connected (bukan gateway hantu)', sim.simulatePing('pc1', '10.0.1.5').success);
  }

  // 17b. Rute statis dst sama + gateway sama ditimpa (tidak dobel); dst sama
  // + gateway beda → keduanya bertahan, lookup milih distance terkecil.
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('pc1', 'PC1', 'pc', 1, '17e'), eNode('r1', 'R1', 'router', 4, '17f'),
        eNode('r2a', 'R2A', 'router', 3, '17g'), eNode('r2b', 'R2B', 'router', 3, '17h'),
        eNode('svr', 'SVR', 'server', 1, '17i'),
      ],
      edges: [
        eEdge('e1', 'pc1', 'port1', 'r1', 'port1'),
        eEdge('e2', 'r1', 'port2', 'r2a', 'port1'),
        eEdge('e3', 'r1', 'port3', 'r2b', 'port1'),
        eEdge('e4', 'r2b', 'port3', 'svr', 'port1'),
      ],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24', ether2: '192.168.1.1/30', ether3: '192.168.1.4/29' }, [
      { dst: '10.0.7.0/24', gateway: '192.168.1.2', distance: 10 }, // via R2A mahal
      { dst: '10.0.7.0/24', gateway: '192.168.1.2', distance: 10 },  // penimpaan: sama dst+gw → 1 entri (distance ikut ditimpa)
      { dst: '10.0.7.0/24', gateway: '192.168.1.5', distance: 1 }, // via R2B lebih murah
    ]);
    sim.applyNodeConfig('r2a', { ether1: '192.168.1.2/30' }, [{ dst: '10.0.1.0/24', gateway: '192.168.1.1' }, { dst: '10.0.7.0/24', gateway: '192.168.1.1' }]);
    sim.applyNodeConfig('r2b', { ether1: '192.168.1.5/29', ether3: '10.0.7.1/24' }, [{ dst: '10.0.1.0/24', gateway: '192.168.1.4' }]);
    sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
    sim.applyNodeConfig('svr', { ether1: '10.0.7.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.7.1' }]);
    sim.setWebServer('svr', { enabled: true, port: 80, content: 'SVR' });

    const routes = sim.getDevice('r1')!.getRoutes();
    check('17b penimpaan: satu entri dst+gw sama', routes.filter((r) => r.dst === '10.0.7.0/24' && r.gateway === '192.168.1.2').length === 1, JSON.stringify(routes));
    check('17b dua next-hop berbeda bertahan', routes.filter((r) => r.dst === '10.0.7.0/24' && r.kind === 'static').length === 2, JSON.stringify(routes));
    check('17b distance 1 < 10 → next hop = R2B (192.168.1.5)', sim.simulatePing('pc1', '10.0.7.10').success);
    const tcp = sim.simulateTcpConnect('pc1', '10.0.7.10', 80);
    check('17b TCP lewat jalur distance terendah', tcp.ok && tcp.body === 'SVR', JSON.stringify(tcp));
  }

  // 17c. Rute statis gateway di subnet tanpa interface → inactive (tetap
  // tampil, tapi tidak dipakai). Rute aktif lain tetap jalan.
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('pc1', 'PC1', 'pc', 1, '17j'), eNode('svr', 'SVR', 'server', 1, '17k'),
        eNode('sw1', 'SW1', 'switch', 4, '17l'), eNode('r1', 'R1', 'router', 3, '17m'),
      ],
      edges: [
        eEdge('e1', 'pc1', 'port1', 'sw1', 'port1'), eEdge('e2', 'svr', 'port1', 'sw1', 'port2'),
        eEdge('e3', 'sw1', 'port3', 'r1', 'port1'),
      ],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24' }, [{ dst: '10.99.0.0/24', gateway: '192.168.99.1' }]);
    sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
    sim.applyNodeConfig('svr', { ether1: '10.0.1.5/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
    const inactive = sim.getDevice('r1')!.getRoutes().find((r) => r.dst === '10.99.0.0/24');
    check('17c gateway unreachable → rute inactive=true', !!inactive && inactive.active === false, JSON.stringify(inactive));
    const ping = sim.simulatePing('pc1', '10.99.0.10');
    check('17c ping ke dst rute inactive → unreachable', !ping.success && ping.reason === 'unreachable', JSON.stringify(ping));
    check('17c rute lokal lain tetap normal', sim.simulatePing('pc1', '10.0.1.5').success);
  }
}

// ── 18. Forwarding validation: host no-route, loopback, PHW ───────────────
console.log('\n== 18. Forwarding validation (host, loopback, PHW) ==');
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

  // 18a. Host TIDAK mem-forward: tanpa default route / gateway off-link → unreachable.
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('pc1', 'PC1', 'pc', 1, '18a'), eNode('sw1', 'SW1', 'switch', 4, '18b'),
        eNode('r1', 'R1', 'router', 3, '18c'), eNode('r2', 'R2', 'router', 3, '18d'),
        eNode('svr', 'SVR', 'server', 1, '18e'),
      ],
      edges: [
        eEdge('e1', 'pc1', 'port1', 'sw1', 'port1'), eEdge('e2', 'sw1', 'port2', 'r1', 'port1'),
        eEdge('e3', 'r1', 'port2', 'r2', 'port1'), eEdge('e4', 'r2', 'port2', 'svr', 'port1'),
      ],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24', ether2: '192.168.1.1/30' }, [{ dst: '10.0.2.0/24', gateway: '192.168.1.2' }]);
    sim.applyNodeConfig('r2', { ether1: '192.168.1.2/30', ether2: '10.0.2.1/24' }, [{ dst: '10.0.1.0/24', gateway: '192.168.1.1' }]);
    sim.applyNodeConfig('svr', { ether1: '10.0.2.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.2.1' }]);

    sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, []);
    check('18a host tanpa default route → dst jauh unreachable', !sim.simulatePing('pc1', '10.0.2.10').success);

    sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, [{ dst: '10.0.2.0/24', gateway: '10.0.9.9' }]);
    check('18a host dgn gateway off-link → tetap unreachable', !sim.simulatePing('pc1', '10.0.2.10').success);

    sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
    check('18a host dgn default route on-link → sukses', sim.simulatePing('pc1', '10.0.2.10').success);
    check('18a ping balik svr→pc1', sim.simulatePing('svr', '10.0.1.2').success);
  }

  // 18b. Device tipe 'loopback' diterima, bisa dipasangi IP dan membalas ping.
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('lb1', 'LB1', 'loopback', 1, '18f'), eNode('pc1', 'PC1', 'pc', 1, '18g'),
      ],
      edges: [eEdge('e1', 'lb1', 'port1', 'pc1', 'port1')],
    };
    sim.syncTopology(project);
    const dev = sim.getDevice('lb1');
    check('18b loopback ter-cipta', !!dev && dev.deviceType === 'loopback', JSON.stringify(dev?.deviceType));
    sim.applyNodeConfig('lb1', { ether1: '10.0.9.1/24' }, []);
    sim.applyNodeConfig('pc1', { ether1: '10.0.9.2/24' }, []);
    const ping = sim.simulatePing('pc1', '10.0.9.1');
    check('18b ping ke loopback device sukses', ping.success, JSON.stringify(ping));
  }

  // 18c. PHW: next-hop powered off → paket tidak pernah tiba (unreachable);
  // dinyalakan lagi → pulih.
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('pc1', 'PC1', 'pc', 1, '18h'), eNode('sw1', 'SW1', 'switch', 4, '18i'),
        eNode('r1', 'R1', 'router', 3, '18j'), eNode('r2', 'R2', 'router', 3, '18k'),
        eNode('svr', 'SVR', 'server', 1, '18l'),
      ],
      edges: [
        eEdge('e1', 'pc1', 'port1', 'sw1', 'port1'), eEdge('e2', 'sw1', 'port2', 'r1', 'port1'),
        eEdge('e3', 'r1', 'port2', 'r2', 'port1'), eEdge('e4', 'r2', 'port2', 'svr', 'port1'),
      ],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24', ether2: '192.168.1.1/30' }, [{ dst: '10.0.2.0/24', gateway: '192.168.1.2' }]);
    sim.applyNodeConfig('r2', { ether1: '192.168.1.2/30', ether2: '10.0.2.1/24' }, [{ dst: '10.0.1.0/24', gateway: '192.168.1.1' }]);
    sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
    sim.applyNodeConfig('svr', { ether1: '10.0.2.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.2.1' }]);
    check('18c baseline ping lintas router', sim.simulatePing('pc1', '10.0.2.10').success);
    sim.setNodePowered('r2', false);
    check('18c next-hop mati → ping unreachable', !sim.simulatePing('pc1', '10.0.2.10').success);
    sim.setNodePowered('r2', true);
    check('18c next-hop hidup lagi → pulih', sim.simulatePing('pc1', '10.0.2.10').success);
  }
}

// ── 19. IPv6 routing: connected, static, inactive, discard ────────────────
console.log('\n== 19. IPv6 routing (connected/static/inactive/discard) ==');
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

  // 19a. Connected v6: dua host satu switch — ping6 langsung.
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('pc1', 'PC1', 'pc', 1, '19a'), eNode('pc2', 'PC2', 'pc', 1, '19b'), eNode('sw1', 'SW1', 'switch', 4, '19c'),
      ],
      edges: [eEdge('e1', 'pc1', 'port1', 'sw1', 'port1'), eEdge('e2', 'pc2', 'port1', 'sw1', 'port2')],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig6('pc1', { ether1: '2001:db8:1::10/64' }, []);
    sim.applyNodeConfig6('pc2', { ether1: '2001:db8:1::20/64' }, []);
    check('19a ping6 on-link sukses', sim.simulatePing6('pc1', '2001:db8:1::20').success);
    check('19a ping6 balik', sim.simulatePing6('pc2', '2001:db8:1::10').success);
  }

  // 19b. Static v6 lintas 2 router (kebalikan dari skenario basic: tanpa host default dulu → unreachable, lalu diberi default → sukses).
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('pc1', 'PC1', 'pc', 1, '19d'), eNode('sw1', 'SW1', 'switch', 4, '19e'),
        eNode('r1', 'R1', 'router', 3, '19f'), eNode('r2', 'R2', 'router', 3, '19g'),
        eNode('sw2', 'SW2', 'switch', 4, '19h'), eNode('svr', 'SVR', 'server', 1, '19i'),
      ],
      edges: [
        eEdge('e1', 'pc1', 'port1', 'sw1', 'port1'), eEdge('e2', 'sw1', 'port2', 'r1', 'port1'),
        eEdge('e3', 'r1', 'port2', 'r2', 'port1'), eEdge('e4', 'r2', 'port2', 'sw2', 'port1'),
        eEdge('e5', 'sw2', 'port2', 'svr', 'port1'),
      ],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig6('r1', { ether1: '2001:db8:1::1/64', ether2: '2001:db8:ff::1/64' }, [{ dst: '2001:db8:2::/64', gateway: '2001:db8:ff::2' }]);
    sim.applyNodeConfig6('r2', { ether1: '2001:db8:ff::2/64', ether2: '2001:db8:2::1/64' }, [{ dst: '2001:db8:1::/64', gateway: '2001:db8:ff::1' }]);
    sim.applyNodeConfig6('pc1', { ether1: '2001:db8:1::10/64' }, []);
    sim.applyNodeConfig6('svr', { ether1: '2001:db8:2::10/64' }, []);
    check('19b host tanpa default v6 → unreachable', !sim.simulatePing6('pc1', '2001:db8:2::10').success);
    sim.applyNodeConfig6('pc1', { ether1: '2001:db8:1::10/64' }, [{ dst: '::/0', gateway: '2001:db8:1::1' }]);
    sim.applyNodeConfig6('svr', { ether1: '2001:db8:2::10/64' }, [{ dst: '::/0', gateway: '2001:db8:2::1' }]);
    const p1 = sim.simulatePing6('pc1', '2001:db8:2::10');
    check('19b ping6 lintas router via static v6', p1.success, JSON.stringify(p1));
    check('19b ping6 balik', sim.simulatePing6('svr', '2001:db8:1::10').success);
  }

  // 19c. Static v6 gateway off-link → inactive (terdaftar, tidak dipakai).
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('pc1', 'PC1', 'pc', 1, '19j'), eNode('sw1', 'SW1', 'switch', 4, '19k'), eNode('r1', 'R1', 'router', 3, '19l'),
      ],
      edges: [eEdge('e1', 'pc1', 'port1', 'sw1', 'port1'), eEdge('e2', 'sw1', 'port2', 'r1', 'port1')],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig6('r1', { ether1: '2001:db8:1::1/64' }, [{ dst: '2001:db8:99::/64', gateway: '2001:db8:ff::99' }]);
    sim.applyNodeConfig6('pc1', { ether1: '2001:db8:1::10/64' }, [{ dst: '::/0', gateway: '2001:db8:1::1' }]);
    const inactive = sim.getDevice('r1')!.getIpv6Routes().find((r) => r.dst === '2001:db8:99::/64');
    check('19c rute v6 off-link inactive', !!inactive && inactive.active === false, JSON.stringify(inactive));
    check('19c ping6 ke dst rute inactive unreachable', !sim.simulatePing6('pc1', '2001:db8:99::1').success);
  }

  // 19d. Blackhole/discard v6: paket dibuang diam-diam (unreachable).
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('pc1', 'PC1', 'pc', 1, '19m'), eNode('sw1', 'SW1', 'switch', 4, '19n'), eNode('r1', 'R1', 'router', 3, '19o'),
      ],
      edges: [eEdge('e1', 'pc1', 'port1', 'sw1', 'port1'), eEdge('e2', 'sw1', 'port2', 'r1', 'port1')],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig6('r1', { ether1: '2001:db8:1::1/64' }, [{ dst: '2001:db8:98::/64', gateway: 'discard' }]);
    sim.applyNodeConfig6('pc1', { ether1: '2001:db8:1::10/64' }, [{ dst: '::/0', gateway: '2001:db8:1::1' }]);
    check('19d | ::/0 default masih jalan (dst biasa)', sim.simulatePing6('pc1', '2001:db8:1::1').success);
    const p = sim.simulatePing6('pc1', '2001:db8:98::1');
    check('19d ping6 ke prefix discard → unreachable', !p.success && p.reason === 'unreachable', JSON.stringify(p));
  }
}

// ── 20. CLI route distance + /test E2E ────────────────────────────────────
console.log('\n== 20. CLI route distance + /test E2E ==');
{
  // 20a. MikroTik /ip route add distance=n — tersimpan, validasi nilai.
  {
    const d = new VendorDispatcher();
    const ctx = mkCtx('d1', 'R1', ['ether1', 'ether2']);
    d.dispatch('mikrotik', '/ip route add dst-address=192.168.50.0/24 gateway=192.168.88.254 distance=10', ctx);
    const mem = d.getNodeMemory('d1');
    check('20a distance=10 tersimpan', mem.routes.length === 1 && mem.routes[0].distance === 10, JSON.stringify(mem.routes));
    d.dispatch('mikrotik', '/ip route add dst-address=192.168.51.0/24 gateway=192.168.88.254 distance=0', ctx);
    check('20a distance=0 dikoreksi ke 1', mem.routes[1].distance === 1, JSON.stringify(mem.routes));
    d.dispatch('mikrotik', '/ip route add dst-address=192.168.52.0/24 gateway=192.168.88.254 distance=abc', ctx);
    check('20a distance non-numerik → 1', mem.routes[2].distance === 1, JSON.stringify(mem.routes));
    d.dispatch('mikrotik', '/ip route add dst-address=192.168.53.0/24 gateway=192.168.88.254', ctx);
    check('20a tanpa distance → default 1', mem.routes[3].distance === 1, JSON.stringify(mem.routes));
    const print = d.dispatch('mikrotik', '/ip route print', ctx);
    check('20a print menampilkan kolom distance', typeof print === 'string' && print.includes('10'), JSON.stringify(print?.slice?.(0, 200)));
  }

  // 20b. CLI distance mengalir ke engine: statis dst sama, distance beda → jalur termurah menang.
  {
    const dis = new VendorDispatcher();
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        { id: 'r1', name: 'R1', vendor: 'mikrotik', model: 'router', deviceType: 'router', ports: [1, 2, 3].map((i) => ({ id: `ether${i}`, name: `ether${i}`, status: 'up', macAddress: `00:0c:29:20${i}:00:01` })) },
        { id: 'r2', name: 'R2', vendor: 'mikrotik', model: 'router', deviceType: 'router', ports: [1, 2].map((i) => ({ id: `ether${i}`, name: `ether${i}`, status: 'up', macAddress: `00:0c:29:20a:0${i}:01` })) },
        { id: 'svr', name: 'SVR', vendor: 'linux', model: 'server', deviceType: 'server', ports: [{ id: 'ether1', name: 'ether1', status: 'up', macAddress: '00:0c:29:20b:01:01' }] },
      ],
      edges: [
        { id: 'e1', sourceNodeId: 'r1', sourcePortId: 'ether2', targetNodeId: 'r2', targetPortId: 'ether1', cableType: 'copper_straight' },
        { id: 'e2', sourceNodeId: 'r2', sourcePortId: 'ether2', targetNodeId: 'svr', targetPortId: 'ether1', cableType: 'copper_straight' },
      ],
    };
    sim.syncTopology(project);
    let ctx = iCtx2('r1', 'R1', project.nodes[0].ports);
    function iCtx2(nodeId: string, name: string, ports: any[]) {
      return {
        nodeId, name, ports,
        dhcpClientGrant: (iface: string, addDefaultRoute: boolean) => {
          const granted = sim.grantDhcpLease(nodeId, iface);
          return granted ? { ip: granted.ip, gateway: granted.gateway, prefix: granted.prefix, poolNodeId: granted.poolNodeId } : null;
        },
        pingSimulator: (host: string, vendorId: string) => formatPingOutput(vendorId, host, sim.simulatePing(nodeId, host)),
        ospfNeighborProvider: () => sim.getOspfNeighbors(nodeId),
      };
    }
    dis.dispatch('mikrotik', '/ip address add address=10.0.1.1/24 interface=ether1', ctx);
    dis.dispatch('mikrotik', '/ip address add address=192.168.1.1/30 interface=ether2', ctx);
    dis.dispatch('mikrotik', '/ip route add dst-address=10.0.2.0/24 gateway=192.168.99.99 distance=5', ctx);
    dis.dispatch('mikrotik', '/ip route add dst-address=10.0.2.0/24 gateway=192.168.1.2 distance=1', ctx);
    const mem = dis.getNodeMemory('r1');
    check('20b dua route tersimpan via CLI', mem.routes.filter((r: any) => r.dst === '10.0.2.0/24').length === 2, JSON.stringify(mem.routes));
    dis.dispatch('mikrotik', '/ip address add address=192.168.1.2/30 interface=ether1', iCtx2('r2', 'R2', project.nodes[1].ports));
    dis.dispatch('mikrotik', '/ip address add address=10.0.2.1/24 interface=ether2', iCtx2('r2', 'R2', project.nodes[1].ports));
    dis.dispatch('mikrotik', '/ip route add dst-address=10.0.1.0/24 gateway=192.168.1.1', iCtx2('r2', 'R2', project.nodes[1].ports));
    dis.dispatch('linux', 'ip addr add 10.0.2.10/24 dev ether1', iCtx2('svr', 'SVR', project.nodes[2].ports));
    dis.dispatch('linux', 'ip route add default via 10.0.2.1', iCtx2('svr', 'SVR', project.nodes[2].ports));
    const syncCli = (nodeId: string) => {
      const m = dis.getNodeMemory(nodeId);
      sim.applyNodeConfig(nodeId, m.configuredIps, m.routes);
    };
    for (const n of project.nodes) syncCli(n.id);
    const stats = sim.getDevice('r1')!.getRoutes();
    const bad = stats.find((r) => r.dst === '10.0.2.0/24' && r.gateway === '192.168.99.99');
    check('20b gateway off-link → inactive (dari CLI distance flow)', !!bad && bad.active === false, JSON.stringify(bad));
    check('20b ping via gateway aktif (distance 1)', sim.simulatePing('r1', '10.0.2.10').success);
  }

  // 20c. /test: findScenarios filter + formatLabResult kelengkapan output.
  {
    const all = findScenarios(LAB_SCENARIOS);
    check('20c semua skenario terdaftar', all.length === LAB_SCENARIOS.length, `all=${all.length}`);
    const dhcp = findScenarios(LAB_SCENARIOS, 'dhcp');
    check('20c filter "dhcp" cocok', dhcp.length > 0 && dhcp.every((s) => s.id.includes('dhcp')), dhcp.map((s) => s.id).join(','));
    const routing = findScenarios(LAB_SCENARIOS, 'routing');
    check('20c filter "routing" cocok', routing.length > 0 && routing.every((s) => s.category === 'routing' || s.id.includes('routing')), routing.map((s) => s.id).join(','));
    check('20c filter tak dikenal → kosong', findScenarios(LAB_SCENARIOS, 'zalando-miss').length === 0);

    const subset = findScenarios(LAB_SCENARIOS, 'dhcp');
    const out = formatLabResult(runLab(subset));
    check('20c output /test memuat header', typeof out === 'string' && out.includes('NETWORK TEST'), out.slice(0, 120));
    check('20c output /test memuat RESULT', out.includes('RESULT'), out.slice(-200));
    check('20c output /test memuat id skenario', subset.every((s) => out.includes(s.id)), out.slice(0, 400));
    check('20c output /test memuat kategori', /Test\/Expected|Expected|assert/i.test(out), out.slice(0, 400));
    check('20c /test semua skenario tidak crash + lulus', formatLabResult(runLab(all)).includes(`RESULT: ${all.length}`));
  }
}

// ── 21. Export running-config & status link fisik (kabel dihapus) ─────────
console.log('\n== 21. Export config & link status ==');
{
  const vPorts = (n: number, seed: string): any[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `ether${i + 1}`, name: `ether${i + 1}`, status: 'up' as const,
      macAddress: `00:0c:29:${seed}:${(i + 1).toString().padStart(2, '0')}:01`,
    }));
  const vNode = (id: string, name: string, vendor: string, model: string, n: number, seed: string): any => ({
    id, name, vendor, model,
    deviceType: model === 'switch' ? 'switch' : model === 'pc' || model === 'server' ? model : 'router',
    ports: vPorts(n, seed),
  });
  const vEdge = (id: string, a: string, ap: string, b: string, bp: string) => ({
    id, sourceNodeId: a, sourcePortId: ap, targetNodeId: b, targetPortId: bp, cableType: 'copper_straight',
  });

  // 21a. Port tanpa kabel → "not connected" di show; export tetap memuat config.
  {
    const dis = new VendorDispatcher();
    const ctx = mkCtx('n21a', 'R1', ['ether1', 'ether2']);
    dis.dispatch('cisco_ios', 'interface ether1', ctx);
    dis.dispatch('cisco_ios', 'ip address 192.168.1.1 255.255.255.0', ctx);
    dis.dispatch('cisco_ios', 'exit', ctx);

    const ctxLinks = { ...ctx, ports: ctx.ports.map((p) => ({ ...p, status: 'up' as const })), portLinks: { ether2: true } as Record<string, boolean> };
    const brief = dis.dispatch('cisco_ios', 'show ip interface brief', ctxLinks);
    check('21a port tanpa kabel → "not connected"', /ether1[^\n]*not connected/.test(brief), brief);
    check('21a port berkabel tetap up', /ether2[^\n]*\bup\b/.test(brief), brief);
    const full = dis.dispatch('cisco_ios', 'show interfaces', ctxLinks);
    check('21a "is not connected, line protocol is down"', full.includes('ether1 is not connected, line protocol is down'), full.split('\n').slice(0, 2).join(' | '));

    const cfg = dis.exportRunningConfig('cisco_ios', ctxLinks);
    check('21a IP tetap diekspor walau kabel dihapus', cfg.includes('ip address 192.168.1.1 255.255.255.0'), cfg.split('\n').slice(0, 10).join(' | '));
    check('21a interface tetap "no shutdown"', /\n no shutdown/.test(cfg), cfg.split('\n').slice(0, 10).join(' | '));
  }

  // 21b. "shutdown" via CLI → administratively down (bukan not connected).
  {
    const dis = new VendorDispatcher();
    const ctx = mkCtx('n21b', 'R1', ['ether1', 'ether2']);
    dis.dispatch('cisco_ios', 'interface ether1', ctx);
    dis.dispatch('cisco_ios', 'shutdown', ctx);
    dis.dispatch('cisco_ios', 'exit', ctx);
    const brief = dis.dispatch('cisco_ios', 'show ip interface brief', { ...ctx, portLinks: { ether1: true, ether2: true } });
    check('21b shutdown → administratively down', /ether1[^\n]*administratively down/.test(brief), brief);
    const cfg = dis.exportRunningConfig('cisco_ios', ctx);
    check('21b "shutdown" ikut diekspor', /\n shutdown\b/.test(cfg), cfg.split('\n').slice(0, 10).join(' | '));
  }

  // 21c. Export: mask di ip route Cisco + OSPF (Cisco & MikroTik).
  {
    const dis = new VendorDispatcher();
    const ctx = mkCtx('n21c', 'R1', ['ether1', 'ether2']);
    dis.dispatch('cisco_ios', 'interface ether1', ctx);
    dis.dispatch('cisco_ios', 'ip address 10.0.0.1 255.255.255.252', ctx);
    dis.dispatch('cisco_ios', 'exit', ctx);
    dis.dispatch('cisco_ios', 'ip route 10.20.0.0 255.255.0.0 192.168.1.254', ctx);
    dis.dispatch('cisco_ios', 'router ospf 1', ctx);
    dis.dispatch('cisco_ios', 'network 10.0.0.0 0.0.0.3 area 0', ctx);
    dis.dispatch('cisco_ios', 'exit', ctx);
    const cfg = dis.exportRunningConfig('cisco_ios', ctx);
    check('21c ip route memakai netmask', cfg.includes('ip route 10.20.0.0 255.255.0.0 192.168.1.254'), cfg.split('\n').filter((l) => l.includes('ip route')).join(' | '));
    check('21c OSPF masuk running-config cisco', cfg.includes('router ospf 1') && cfg.includes('network 10.0.0.0/30 area 0'), cfg.split('\n').filter((l) => l.includes('ospf') || l.includes('network')).join(' | '));

    const ctxM = mkCtx('n21d', 'MT', ['ether1', 'ether2']);
    dis.dispatch('mikrotik', '/ip address add address=10.0.0.2/30 interface=ether1', ctxM);
    dis.dispatch('mikrotik', '/routing ospf instance add name=ospf1', ctxM);
    dis.dispatch('mikrotik', '/routing ospf network add network=10.0.0.0/30 area=0', ctxM);
    const cfgM = dis.exportRunningConfig('mikrotik', ctxM);
    check('21c IP mikrotik terekpor', cfgM.includes('/ip address add address=10.0.0.2/30 interface=ether1'), cfgM.split('\n').slice(0, 6).join(' | '));
    check('21c OSPF mikrotik di export (area + interface-template)', cfgM.includes('/routing ospf area add name=backbone area-id=0.0.0.0') && cfgM.includes('/routing ospf interface-template add networks=10.0.0.0/30'), cfgM.split('\n').filter((l) => l.includes('ospf')).join(' | '));
  }

  // 21d. buildNodeExports + validasi: duplicate IP, netmask mismatch,
  //      VLAN tanpa switch, port belum dikonfigurasi, format file per vendor.
  {
    const dis = new VendorDispatcher();
    const r1 = vNode('r1', 'R1', 'cisco_ios', 'router', 2, 'x1');
    const r2 = vNode('r2', 'R2', 'mikrotik', 'router', 2, 'x2');
    const r3 = vNode('r3', 'R3', 'mikrotik', 'router', 1, 'x3');
    r1.ports[0].ipAddress = '192.168.1.1/24';
    r1.ports[1].ipAddress = '192.168.2.1/30';
    r2.ports[0].ipAddress = '192.168.2.2/28';
    r2.ports[1].ipAddress = '192.168.1.1/24'; // duplikat dgn r1.ether1
    const project: any = {
      nodes: [r1, r2, r3],
      edges: [vEdge('e1', 'r1', 'ether2', 'r2', 'ether1')],
    };
    dis.getNodeMemory('r3').vlans.push({ id: 10, name: 'VLAN10' });

    const pl = portLinksOfNode(r1, project.edges);
    check('21d portLinks r1: ether2 terhubung, ether1 tidak', pl['ether2'] === true && !('ether1' in pl), JSON.stringify(pl));

    const warnings = validateConfigExport(project, dis);
    check('21d error IP duplikat terdeteksi', warnings.some((w) => w.severity === 'error' && w.message.includes('duplikat')), JSON.stringify(warnings));
    check('21d warning netmask mismatch (30 vs 28)', warnings.some((w) => w.severity === 'warn' && /netmask mismatch/i.test(w.message)), JSON.stringify(warnings));
    check('21d warning VLAN tanpa switch', warnings.some((w) => w.severity === 'warn' && w.nodeName === 'R3' && /switch/i.test(w.message)), JSON.stringify(warnings));
    check('21d info port belum ber-IP', warnings.some((w) => w.severity === 'info' && w.nodeName === 'R3'), JSON.stringify(warnings));

    const entries = buildNodeExports(project, dis);
    check('21d export membangun 3 entri', entries.length === 3, `${entries.length}`);
    const eR1 = entries.find((e) => e.nodeId === 'r1');
    check('21d r1 → .txt + hostname + ip', !!eR1 && eR1.filename.endsWith('.txt') && eR1.content.includes('hostname R1') && eR1.content.includes('ip address 192.168.1.1 255.255.255.0'), JSON.stringify(eR1?.content.slice(0, 220)));
    const eR2 = entries.find((e) => e.nodeId === 'r2');
    check('21d r2 → .rsc + ip', !!eR2 && eR2.filename.endsWith('.rsc') && eR2.content.includes('/ip address add address=192.168.2.2/28 interface=ether1'), JSON.stringify(eR2?.content.slice(0, 220)));
    const eR3 = entries.find((e) => e.nodeId === 'r3');
    check('21d r3 (kosong) tetap ada file', !!eR3 && eR3.lineCount > 0, JSON.stringify(eR3?.content.slice(0, 120)));
  }
}

// ── 22. Interop & validasi vendor (registry konsistensi, round-trip,
//     lintas-vendor statis/DHCP, fitur tak didukung gagal jujur) ──
const vrep = runVendorInteropTests();
passed += vrep.passed;
failed += vrep.failed;
fails.push(...vrep.fails);

// ── 23. Facade engine: lexer → parser → adapter → state → executor → resolver.
//     Lapisan klasifikasi murni di atas engine nyata (tanpa mengubah perilaku).
const frep = runCliFacadeTest();
passed += frep.passed;
failed += frep.failed;
fails.push(...frep.fails);

// ── 24. Command tree: abbreviation, ambiguitas, TAB completion context-aware,
//     mode CLI (exec/config/config-if), fasilitasi runCliCommand.
console.log('\n== 24. Command tree (abbreviation & completion) ==');
const trep = runCommandTreeTests();
passed += trep.passed;
failed += trep.failed;
fails.push(...trep.fails);

// ── 25. Port Inspector: derivasi koneksi dari topologi + lifecycle paket.
console.log('\n== 25. Port Inspector & packet lifecycle ==');
const prep = runPortInspectorTests();
passed += prep.passed;
failed += prep.failed;
fails.push(...prep.fails);

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nFAILED:');
  for (const f of fails) console.log(' -', f);
  process.exit(1);
}
