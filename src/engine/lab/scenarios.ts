// ============================================================
// Registry skenario /test — setiap skenario = topologi segar
// + setup + assertion. Tidak butuh input pengguna.
// ============================================================

import { NetworkSimulator } from '../net/core/NetworkSimulator';
import type { LabProjectLike } from '../net/core/Topology';
import type { AclRule, NatRule } from '../net/core/types';
import { TestScenario } from './index';

const port = (n: number, seed: string) =>
  Array.from({ length: n }, (_, i) => ({
    id: `ether${i + 1}`,
    name: `ether${i + 1}`,
    status: 'up',
    macAddress: `00:0c:29:${seed}:${(i + 1).toString().padStart(2, '0')}:01`,
  }));

const node = (
  id: string,
  name: string,
  deviceType: 'router' | 'switch' | 'pc' | 'server',
  portCount: number,
  seed: string
): LabProjectLike['nodes'][number] => ({
  id,
  name,
  vendor: deviceType === 'pc' || deviceType === 'server' ? 'linux' : 'mikrotik',
  model: deviceType,
  deviceType,
  ports: port(portCount, seed),
});

const edge = (
  id: string,
  a: string,
  ap: string,
  b: string,
  bp: string
): LabProjectLike['edges'][number] => ({
  id,
  sourceNodeId: a,
  sourcePortId: ap,
  targetNodeId: b,
  targetPortId: bp,
  cableType: 'copper_straight',
});

export const LAB_SCENARIOS: TestScenario[] = [
  // ── Basic ────────────────────────────────────────────────────
  {
    id: 'basic-ping',
    name: 'Basic Ping',
    description: 'Dua PC dalam subnet yang sama via switch — ARP + ICMP echo.',
    category: 'basic',
    topology: { nodes: [node('pc1', 'PC1', 'pc', 1, 'b1'), node('sw1', 'SW1', 'switch', 4, 'b2'), node('pc2', 'PC2', 'pc', 1, 'b3')], edges: [edge('e1', 'pc1', 'ether1', 'sw1', 'ether1'), edge('e2', 'sw1', 'ether2', 'pc2', 'ether1')] },
    setup: (sim) => {
      sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, []);
      sim.applyNodeConfig('pc2', { ether1: '10.0.1.3/24' }, []);
    },
    tests: [
      { type: 'assertPing', name: 'PC1 → PC2 reachable', from: 'pc1', to: '10.0.1.3' },
      { type: 'assertPing', name: 'PC2 → PC1 reachable', from: 'pc2', to: '10.0.1.2' },
      { type: 'assertIpConfigured', name: 'PC1 IP terpasang', node: 'pc1', iface: 'ether1', cidr: '10.0.1.2/24' },
    ],
    expectedResult: 'Semua PC saling reachable',
  },
  {
    id: 'basic-gateway',
    name: 'Default Gateway',
    description: 'PC memakai default gateway ke router — host di subnet lain dapat dijangkau.',
    category: 'basic',
    topology: { nodes: [node('pc1', 'PC1', 'pc', 1, 'b1'), node('r1', 'R1', 'router', 3, 'b2'), node('svr', 'SVR', 'server', 1, 'b3')], edges: [edge('e1', 'pc1', 'ether1', 'r1', 'ether1'), edge('e2', 'r1', 'ether2', 'svr', 'ether1')] },
    setup: (sim) => {
      sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24', ether2: '10.0.9.1/24' }, []);
      sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
      sim.applyNodeConfig('svr', { ether1: '10.0.9.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.9.1' }]);
    },
    tests: [
      { type: 'assertPing', name: 'PC1 → gateway', from: 'pc1', to: '10.0.1.1' },
      { type: 'assertPing', name: 'PC1 → server via default route', from: 'pc1', to: '10.0.9.10' },
      { type: 'assertRouteExists', name: 'Default route di PC1', node: 'pc1', dst: '0.0.0.0/0' },
    ],
    expectedResult: 'PC bisa menjangkau gateway dan server lintas subnet',
  },
  {
    id: 'basic-routing',
    name: 'Basic Routing',
    description: 'Static route dua arah PC1—R1—R2—PC2 (topologi uji section 5).',
    category: 'basic',
    topology: {
      nodes: [node('pc1', 'PC1', 'pc', 1, 'b1'), node('r1', 'R1', 'router', 3, 'b2'), node('r2', 'R2', 'router', 3, 'b3'), node('pc2', 'PC2', 'pc', 1, 'b4')],
      edges: [edge('e1', 'pc1', 'ether1', 'r1', 'ether1'), edge('e2', 'r1', 'ether2', 'r2', 'ether1'), edge('e3', 'r2', 'ether2', 'pc2', 'ether1')],
    },
    setup: (sim) => {
      sim.applyNodeConfig('pc1', { ether1: '10.1.1.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.1.1.1' }]);
      sim.applyNodeConfig('r1', { ether1: '10.1.1.1/24', ether2: '10.10.10.1/30' }, [{ dst: '10.2.2.0/24', gateway: '10.10.10.2' }]);
      sim.applyNodeConfig('r2', { ether1: '10.10.10.2/30', ether2: '10.2.2.1/24' }, [{ dst: '10.1.1.0/24', gateway: '10.10.10.1' }]);
      sim.applyNodeConfig('pc2', { ether1: '10.2.2.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.2.2.1' }]);
    },
    tests: [
      { type: 'assertRouteExists', name: 'R1 route ke 10.2.2.0/24', node: 'r1', dst: '10.2.2.0/24', kind: 'static' },
      { type: 'assertRouteExists', name: 'R2 route ke 10.1.1.0/24', node: 'r2', dst: '10.1.1.0/24', kind: 'static' },
      { type: 'assertPing', name: 'PC1 → PC2', from: 'pc1', to: '10.2.2.10' },
      { type: 'assertPing', name: 'PC2 → PC1', from: 'pc2', to: '10.1.1.10' },
    ],
    expectedResult: 'PC1 dan PC2 saling reachable melalui dua router',
  },

  // ── Switching ────────────────────────────────────────────────
  {
    id: 'switching-vlan',
    name: 'VLAN Access Port',
    description: 'PC di VLAN berbeda pada switch yang sama harus terisolasi.',
    category: 'switching',
    topology: { nodes: [node('pc1', 'PC1', 'pc', 1, 's1'), node('pc2', 'PC2', 'pc', 1, 's2'), node('pc3', 'PC3', 'pc', 1, 's3'), node('sw1', 'SW1', 'switch', 4, 's4')], edges: [edge('e1', 'pc1', 'ether1', 'sw1', 'ether1'), edge('e2', 'pc2', 'ether1', 'sw1', 'ether2'), edge('e3', 'pc3', 'ether1', 'sw1', 'ether3')] },
    setup: (sim) => {
      sim.setPortVlans('sw1', { ether1: 10, ether2: 10, ether3: 20 });
      sim.applyNodeConfig('pc1', { ether1: '10.0.10.2/24' }, []);
      sim.applyNodeConfig('pc2', { ether1: '10.0.10.3/24' }, []);
      sim.applyNodeConfig('pc3', { ether1: '10.0.20.3/24' }, []);
    },
    tests: [
      { type: 'assertVlanReachability', name: 'PC1 ↔ PC2 (sama VLAN 10) reachable', from: 'pc1', to: '10.0.10.3', reachable: true },
      { type: 'assertVlanReachability', name: 'PC1 → PC3 (VLAN 20) terisolasi', from: 'pc1', to: '10.0.20.3', reachable: false },
    ],
    expectedResult: 'VLAN sama reachable, VLAN beda terisolasi',
  },
  {
    id: 'switching-trunk',
    name: 'VLAN Trunk',
    description: 'Trunk membawa frame bertag antar switch; access port hanya menerima VLAN-nya.',
    category: 'switching',
    topology: {
      nodes: [node('pc1', 'PC1', 'pc', 1, 's1'), node('pc2', 'PC2', 'pc', 1, 's2'), node('sw1', 'SW1', 'switch', 4, 's3'), node('sw2', 'SW2', 'switch', 4, 's4')],
      edges: [edge('e1', 'pc1', 'ether1', 'sw1', 'ether1'), edge('e2', 'pc2', 'ether1', 'sw2', 'ether1'), edge('e3', 'sw1', 'ether3', 'sw2', 'ether3')],
    },
    setup: (sim) => {
      sim.setPortVlans('sw1', { ether1: 10 });
      sim.setPortVlans('sw2', { ether1: 10 });
      sim.setTrunkPorts('sw1', ['ether3']);
      sim.setTrunkPorts('sw2', ['ether3']);
      sim.applyNodeConfig('pc1', { ether1: '10.0.10.2/24' }, []);
      sim.applyNodeConfig('pc2', { ether1: '10.0.10.3/24' }, []);
    },
    tests: [{ type: 'assertPing', name: 'PC1 → PC2 lewat trunk antar switch', from: 'pc1', to: '10.0.10.3' }],
    expectedResult: 'VLAN 10 menyeberang trunk antar switch',
  },
  {
    id: 'switching-intervlan',
    name: 'Inter-VLAN Routing (Router-on-a-Stick)',
    description: 'Subinterface VLAN 10 & 20 di router meneruskan antar VLAN.',
    category: 'switching',
    topology: {
      nodes: [node('pc1', 'PC1', 'pc', 1, 's1'), node('pc2', 'PC2', 'pc', 1, 's2'), node('sw1', 'SW1', 'switch', 4, 's3'), node('r1', 'R1', 'router', 3, 's4')],
      edges: [edge('e1', 'pc1', 'ether1', 'sw1', 'ether1'), edge('e2', 'pc2', 'ether1', 'sw1', 'ether2'), edge('e3', 'sw1', 'ether4', 'r1', 'ether3')],
    },
    setup: (sim) => {
      sim.setPortVlans('sw1', { ether1: 10, ether2: 20 });
      sim.setTrunkPorts('sw1', ['ether4']);
      sim.setSubinterfaces('r1', [{ name: 'ether3.10', parentPort: 'ether3', vlanId: 10 }, { name: 'ether3.20', parentPort: 'ether3', vlanId: 20 }]);
      sim.applyNodeConfig('r1', { 'ether3.10': '192.168.10.1/24', 'ether3.20': '192.168.20.1/24' }, []);
      sim.applyNodeConfig('pc1', { ether1: '192.168.10.10/24' }, [{ dst: '0.0.0.0/0', gateway: '192.168.10.1' }]);
      sim.applyNodeConfig('pc2', { ether1: '192.168.20.10/24' }, [{ dst: '0.0.0.0/0', gateway: '192.168.20.1' }]);
    },
    tests: [
      { type: 'assertPing', name: 'PC1 → gateway VLAN 10', from: 'pc1', to: '192.168.10.1' },
      { type: 'assertPing', name: 'PC1 → PC2 (VLAN 10 → 20)', from: 'pc1', to: '192.168.20.10' },
      { type: 'assertPing', name: 'PC2 → PC1 (VLAN 20 → 10)', from: 'pc2', to: '192.168.10.10' },
    ],
    expectedResult: 'Router-on-a-stick menghubungkan VLAN 10 dan 20',
  },

  // ── Services ─────────────────────────────────────────────────
  {
    id: 'services-dhcp',
    name: 'DHCP',
    description: 'Client mendapat IP/gateway/DNS dari server DHCP; server disabled → tanpa lease.',
    category: 'services',
    topology: { nodes: [node('pc1', 'PC1', 'pc', 1, 'd1'), node('sw1', 'SW1', 'switch', 4, 'd2'), node('r1', 'R1', 'router', 3, 'd3'), node('pc2', 'PC2', 'pc', 1, 'd4')], edges: [edge('e1', 'pc1', 'ether1', 'sw1', 'ether1'), edge('e2', 'pc2', 'ether1', 'sw1', 'ether2'), edge('e3', 'sw1', 'ether3', 'r1', 'ether1')] },
    setup: (sim) => {
      sim.applyNodeConfig('r1', { ether1: '192.168.5.1/24' }, []);
      sim.setDnsRecords('r1', [{ name: 'web.lab', address: '192.168.5.50' }]);
      sim.setDhcpPools({ r1: [{ name: 'lan5', iface: 'ether1', network: '192.168.5.0/24', range: '192.168.5.100-192.168.5.150', gateway: '192.168.5.1', dnsServers: ['192.168.5.1'] }] });
    },
    tests: [
      { type: 'assertDhcpLease', name: 'PC1 mendapat lease DHCP', node: 'pc1', iface: 'ether1', expectedPrefix: '192.168.5.' },
      { type: 'assertPing', name: 'PC1 → gateway via lease', from: 'pc1', to: '192.168.5.1' },
      { type: 'assertDnsResolve', name: 'PC1 resolve via DNS option 6', node: 'pc1', hostname: 'web.lab', expected: '192.168.5.50' },
    ],
    expectedResult: 'Client memperoleh IP + DNS otomatis',
  },
  {
    id: 'services-nat',
    name: 'NAT Masquerade',
    description: 'Host LAN 192.168.1.0/24 keluar WAN sebagai IP router (203.0.113.10).',
    category: 'services',
    topology: {
      nodes: [node('pc1', 'PC1', 'pc', 1, 'n1'), node('sw1', 'SW1', 'switch', 4, 'n2'), node('r1', 'R1', 'router', 3, 'n3'), node('r2', 'R2-ISP', 'router', 3, 'n4'), node('pub', 'PUB', 'server', 1, 'n5')],
      edges: [edge('e1', 'pc1', 'ether1', 'sw1', 'ether1'), edge('e2', 'sw1', 'ether2', 'r1', 'ether1'), edge('e3', 'r1', 'ether2', 'r2', 'ether1'), edge('e4', 'r2', 'ether2', 'pub', 'ether1')],
    },
    setup: (sim) => {
      sim.applyNodeConfig('r1', { ether1: '192.168.1.1/24', ether2: '203.0.113.10/24' }, [{ dst: '0.0.0.0/0', gateway: '203.0.113.254' }]);
      sim.applyNodeConfig('r2', { ether1: '203.0.113.254/24', ether2: '8.8.8.1/24' }, []);
      sim.applyNodeConfig('pc1', { ether1: '192.168.1.10/24' }, [{ dst: '0.0.0.0/0', gateway: '192.168.1.1' }]);
      sim.applyNodeConfig('pub', { ether1: '8.8.8.8/24' }, [{ dst: '0.0.0.0/0', gateway: '8.8.8.1' }]);
      sim.setNatRules('r1', [{ chain: 'srcnat', action: 'masquerade', outInterface: 'ether2' }] as NatRule[]);
      sim.setWebServer('pub', { enabled: true, port: 80, content: 'Public' });
    },
    tests: [
      { type: 'assertPing', name: 'PC1 → pub (NAT aktif)', from: 'pc1', to: '8.8.8.8' },
      { type: 'assertAllowed', name: 'PC1 HTTP ke pub (NAT + web)', from: 'pc1', to: '8.8.8.8', proto: 'tcp', port: 80 },
    ],
    expectedResult: 'Trafik LAN keluar WAN memakai IP publik router',
  },

  // ── Routing ──────────────────────────────────────────────────
  {
    id: 'routing-ospf',
    name: 'OSPF',
    description: 'R1—R2—R3 di area 0; setiap router belajar network yang jauh.',
    category: 'routing',
    topology: {
      nodes: [node('r1', 'R1', 'router', 3, 'o1'), node('r2', 'R2', 'router', 3, 'o2'), node('r3', 'R3', 'router', 3, 'o3'), node('pc1', 'PC1', 'pc', 1, 'o4')],
      edges: [edge('e1', 'r1', 'ether2', 'r2', 'ether1'), edge('e2', 'r2', 'ether2', 'r3', 'ether1'), edge('e3', 'pc1', 'ether1', 'r1', 'ether1')],
    },
    setup: (sim) => {
      sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24', ether2: '192.168.1.1/30' }, []);
      sim.applyNodeConfig('r2', { ether1: '192.168.1.2/30', ether2: '192.168.2.1/30' }, []);
      sim.applyNodeConfig('r3', { ether1: '192.168.2.2/30', ether2: '10.0.3.1/24' }, []);
      sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
      sim.setRouting('r1', { ospf: { enabled: true, networks: ['10.0.1.0/24', '192.168.1.0/30'] } });
      sim.setRouting('r2', { ospf: { enabled: true, networks: ['192.168.1.0/30', '192.168.2.0/30'] } });
      sim.setRouting('r3', { ospf: { enabled: true, networks: ['192.168.2.0/30', '10.0.3.0/24'] } });
      sim.computeDynamicRoutes();
    },
    tests: [
      { type: 'assertOspfNeighbor', name: 'R1 punya neighbor OSPF', node: 'r1' },
      { type: 'assertRouteExists', name: 'R1 belajar 10.0.3.0/24 (via R3)', node: 'r1', dst: '10.0.3.0/24', kind: 'dynamic' },
      { type: 'assertRouteExists', name: 'R3 belajar 10.0.1.0/24 (via R1)', node: 'r3', dst: '10.0.1.0/24', kind: 'dynamic' },
      { type: 'assertPing', name: 'PC1 → network belakang R3', from: 'pc1', to: '10.0.3.1' },
    ],
    expectedResult: 'OSPF menyebarkan rute di seluruh area 0',
  },
  {
    id: 'routing-rip',
    name: 'RIP',
    description: 'RIP distance-vector: R1 dan R2 saling belajar network (max 15 hop).',
    category: 'routing',
    topology: {
      nodes: [node('r1', 'R1', 'router', 3, 'p1'), node('r2', 'R2', 'router', 3, 'p2'), node('pc1', 'PC1', 'pc', 1, 'p3')],
      edges: [edge('e1', 'r1', 'ether2', 'r2', 'ether1'), edge('e2', 'pc1', 'ether1', 'r1', 'ether1')],
    },
    setup: (sim) => {
      sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24', ether2: '192.168.1.1/30' }, []);
      sim.applyNodeConfig('r2', { ether1: '192.168.1.2/30', ether2: '10.0.4.1/24' }, []);
      sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
      sim.setRouting('r1', { rip: { enabled: true, networks: ['10.0.1.0/24', '192.168.1.0/30'] } });
      sim.setRouting('r2', { rip: { enabled: true, networks: ['192.168.1.0/30', '10.0.4.0/24'] } });
      sim.computeDynamicRoutes();
    },
    tests: [
      { type: 'assertRouteExists', name: 'R1 belajar 10.0.4.0/24 via RIP', node: 'r1', dst: '10.0.4.0/24', kind: 'dynamic' },
      { type: 'assertRouteExists', name: 'R2 belajar 10.0.1.0/24 via RIP', node: 'r2', dst: '10.0.1.0/24', kind: 'dynamic' },
      { type: 'assertPing', name: 'PC1 → network belakang R2', from: 'pc1', to: '10.0.4.1' },
    ],
    expectedResult: 'RIP menyebarkan rute antar router',
  },
  {
    id: 'routing-bgp',
    name: 'BGP eBGP',
    description: 'R1 AS65001 ↔ R2 AS65002: adjacency Established + prefix 10.1.1.0/24 diiklankan.',
    category: 'routing',
    topology: {
      nodes: [node('r1', 'R1', 'router', 3, 'g1'), node('r2', 'R2', 'router', 3, 'g2')],
      edges: [edge('e1', 'r1', 'ether2', 'r2', 'ether1')],
    },
    setup: (sim) => {
      sim.applyNodeConfig('r1', { ether1: '10.1.1.1/24', ether2: '192.168.1.1/30' }, []);
      sim.applyNodeConfig('r2', { ether1: '192.168.1.2/30', ether2: '10.2.2.1/24' }, []);
      sim.setBgp('r1', { asn: 65001, peers: [{ remoteAs: 65002, remoteAddr: '192.168.1.2' }], networks: ['10.1.1.0/24'] });
      sim.setBgp('r2', { asn: 65002, peers: [{ remoteAs: 65001, remoteAddr: '192.168.1.1' }], networks: ['10.2.2.0/24'] });
      sim.computeDynamicRoutes();
    },
    tests: [
      { type: 'assertBgpEstablished', name: 'R1 peer R2 = Established', node: 'r1', remoteIp: '192.168.1.2' },
      { type: 'assertRouteExists', name: 'R2 menerima 10.1.1.0/24 dari R1', node: 'r2', dst: '10.1.1.0/24', kind: 'dynamic' },
    ],
    expectedResult: 'Peer eBGP Established dan prefix dipertukarkan',
  },

  // ── Security ─────────────────────────────────────────────────
  {
    id: 'security-firewall',
    name: 'Firewall (out-interface)',
    description: 'Rule deny icmp out-interface=wan memblokir egress WAN, LAN tetap jalan.',
    category: 'security',
    topology: {
      nodes: [node('pc1', 'PC1', 'pc', 1, 'f1'), node('sw1', 'SW1', 'switch', 4, 'f2'), node('r1', 'R1', 'router', 4, 'f3'), node('r2', 'R2-ISP', 'router', 3, 'f4'), node('pub', 'PUB', 'server', 1, 'f5'), node('svr', 'SVR', 'server', 1, 'f6')],
      edges: [edge('e1', 'pc1', 'ether1', 'sw1', 'ether1'), edge('e2', 'sw1', 'ether2', 'r1', 'ether1'), edge('e3', 'r1', 'ether2', 'r2', 'ether1'), edge('e4', 'r2', 'ether2', 'pub', 'ether1'), edge('e5', 'r1', 'ether3', 'svr', 'ether1')],
    },
    setup: (sim) => {
      sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24', ether2: '203.0.113.1/24', ether3: '10.0.9.1/24' }, [{ dst: '0.0.0.0/0', gateway: '203.0.113.254' }]);
      sim.applyNodeConfig('r2', { ether1: '203.0.113.254/24', ether2: '8.8.8.1/24' }, [{ dst: '10.0.1.0/24', gateway: '203.0.113.1' }, { dst: '10.0.9.0/24', gateway: '203.0.113.1' }]);
      sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
      sim.applyNodeConfig('svr', { ether1: '10.0.9.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.9.1' }]);
      sim.applyNodeConfig('pub', { ether1: '8.8.8.8/24' }, [{ dst: '0.0.0.0/0', gateway: '8.8.8.1' }]);
      sim.setAcls('r1', [{ action: 'deny', proto: 'icmp', outInterface: 'ether2' }] as AclRule[]);
    },
    tests: [
      { type: 'assertBlocked', name: 'ICMP ke WAN diblokir', from: 'pc1', to: '8.8.8.8' },
      { type: 'assertPing', name: 'ICMP ke LAN (ether3) tetap jalan', from: 'pc1', to: '10.0.9.10' },
    ],
    expectedResult: 'Egress WAN diblokir, trafik LAN aman',
  },
  {
    id: 'security-acl',
    name: 'ACL TCP/80',
    description: 'Deny TCP/80 — HTTP diblokir, ping tetap diizinkan.',
    category: 'security',
    topology: {
      nodes: [node('pc1', 'PC1', 'pc', 1, 'f1'), node('sw1', 'SW1', 'switch', 4, 'f2'), node('r1', 'R1', 'router', 3, 'f3'), node('svr', 'SVR', 'server', 1, 'f4')],
      edges: [edge('e1', 'pc1', 'ether1', 'sw1', 'ether1'), edge('e2', 'sw1', 'ether2', 'r1', 'ether1'), edge('e3', 'r1', 'ether2', 'svr', 'ether1')],
    },
    setup: (sim) => {
      sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24', ether2: '10.0.9.1/24' }, []);
      sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
      sim.applyNodeConfig('svr', { ether1: '10.0.9.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.9.1' }]);
      sim.setWebServer('svr', { enabled: true, port: 80, content: 'SVR' });
      sim.setAcls('r1', [{ action: 'deny', proto: 'tcp', dst: '10.0.9.0/24', dstPort: '80' }] as AclRule[]);
    },
    tests: [
      { type: 'assertBlocked', name: 'HTTP/80 diblokir', from: 'pc1', to: '10.0.9.10', proto: 'tcp', port: 80 },
      { type: 'assertPing', name: 'Ping tetap diizinkan', from: 'pc1', to: '10.0.9.10' },
    ],
    expectedResult: 'ACL deny port 80 tanpa memblokir ICMP',
  },

  // ── IPv6 ─────────────────────────────────────────────────────
  {
    id: 'ipv6-connectivity',
    name: 'IPv6 Connectivity',
    description: 'Address global IPv6 + NDP + ICMPv6 echo antar host.',
    category: 'ipv6',
    topology: { nodes: [node('r1', 'R1', 'router', 3, 'v1'), node('pc1', 'PC1', 'pc', 1, 'v2')], edges: [edge('e1', 'pc1', 'ether1', 'r1', 'ether1')] },
    setup: (sim) => {
      sim.applyNodeConfig6('r1', { ether1: '2001:db8:1::1/64' }, []);
      sim.applyNodeConfig6('pc1', { ether1: '2001:db8:1::10/64' }, []);
    },
    tests: [
      { type: 'assertIpConfigured', name: 'PC1 IPv6 terpasang', node: 'pc1', iface: 'ether1', cidr: '2001:db8:1::10/64' },
      { type: 'assertPing', name: 'PC1 ping6 gateway', from: 'pc1', to: '2001:db8:1::1' },
    ],
    expectedResult: 'IPv6 ping sukses via NDP',
  },
  {
    id: 'ipv6-routing',
    name: 'IPv6 Static Routing',
    description: 'Static route IPv6 antar dua router; rute IPv4 TIDAK dipakai untuk IPv6.',
    category: 'ipv6',
    topology: {
      nodes: [node('r1', 'R1', 'router', 3, 'v1'), node('r2', 'R2', 'router', 3, 'v2'), node('pc2', 'PC2', 'pc', 1, 'v3')],
      edges: [edge('e1', 'r1', 'ether2', 'r2', 'ether1'), edge('e2', 'r2', 'ether2', 'pc2', 'ether1')],
    },
    setup: (sim) => {
      sim.applyNodeConfig6('r1', { ether1: '2001:db8:1::1/64', ether2: '2001:db8:12::1/64' }, [{ dst: '2001:db8:2::/64', gateway: '2001:db8:12::2' }]);
      sim.applyNodeConfig6('r2', { ether1: '2001:db8:12::2/64', ether2: '2001:db8:2::1/64' }, [{ dst: '2001:db8:1::/64', gateway: '2001:db8:12::1' }]);
      sim.applyNodeConfig6('pc2', { ether1: '2001:db8:2::10/64' }, [{ dst: '::/0', gateway: '2001:db8:2::1' }]);
    },
    tests: [
      { type: 'assertPing', name: 'PC2 ping6 network R1', from: 'pc2', to: '2001:db8:1::1' },
      { type: 'assertPing', name: 'R1 ping6 network belakang R2', from: 'r1', to: '2001:db8:2::10' },
    ],
    expectedResult: 'Rute statis IPv6 berfungsi lintas router',
  },

  // ── Troubleshooting (skenario sengaja rusak — hasil FAIL + sebab) ──
  {
    id: 'trouble-interface-down',
    name: 'Interface Down',
    description: 'Interface router di-shutdown → konektivitas putus terdeteksi.',
    category: 'troubleshooting',
    topology: {
      nodes: [node('pc1', 'PC1', 'pc', 1, 't1'), node('r1', 'R1', 'router', 3, 't2'), node('r2', 'R2', 'router', 3, 't3'), node('pc2', 'PC2', 'pc', 1, 't4')],
      edges: [edge('e1', 'pc1', 'ether1', 'r1', 'ether1'), edge('e2', 'r1', 'ether2', 'r2', 'ether1'), edge('e3', 'r2', 'ether2', 'pc2', 'ether1')],
    },
    setup: (sim) => {
      sim.applyNodeConfig('pc1', { ether1: '10.1.1.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.1.1.1' }]);
      sim.applyNodeConfig('r1', { ether1: '10.1.1.1/24', ether2: '10.10.10.1/30' }, [{ dst: '10.2.2.0/24', gateway: '10.10.10.2' }]);
      sim.applyNodeConfig('r2', { ether1: '10.10.10.2/30', ether2: '10.2.2.1/24' }, [{ dst: '10.1.1.0/24', gateway: '10.10.10.1' }]);
      sim.applyNodeConfig('pc2', { ether1: '10.2.2.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.2.2.1' }]);
      sim.setShutdownIfaces('r2', ['ether1']);
    },
    tests: [
      { type: 'assertInterfaceDown', name: 'R2 ether1 down', node: 'r2', iface: 'ether1' },
      { type: 'assertPing', name: 'PC1 → PC2 GAGAL (interface mati)', from: 'pc1', to: '10.2.2.10', shouldSucceed: false },
    ],
    expectedResult: 'Konektivitas putus saat interface di-shutdown',
  },
  {
    id: 'trouble-wrong-gateway',
    name: 'Wrong Gateway',
    description: 'Default gateway salah → host tidak bisa keluar subnet.',
    category: 'troubleshooting',
    topology: { nodes: [node('pc1', 'PC1', 'pc', 1, 't1'), node('r1', 'R1', 'router', 2, 't2'), node('svr', 'SVR', 'server', 1, 't3')], edges: [edge('e1', 'pc1', 'ether1', 'r1', 'ether1'), edge('e2', 'r1', 'ether2', 'svr', 'ether1')] },
    setup: (sim) => {
      sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24', ether2: '10.0.9.1/24' }, []);
      sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.99.1' }]);
      sim.applyNodeConfig('svr', { ether1: '10.0.9.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.9.1' }]);
    },
    tests: [
      { type: 'assertPing', name: 'PC1 → router langsung tetap OK (on-link)', from: 'pc1', to: '10.0.1.1' },
      { type: 'assertPing', name: 'PC1 → lintas subnet GAGAL (default gw salah)', from: 'pc1', to: '10.0.9.10', shouldSucceed: false },
      { type: 'assertRouteExists', name: 'Rute default ditandai inactive', node: 'pc1', dst: '0.0.0.0/0', kind: 'static' },
    ],
    expectedResult: 'Gateway tidak di subnet → rute default inactive → ARP gagal → unreachable',
  },
  {
    id: 'trouble-missing-route',
    name: 'Missing Route',
    description: 'Router tanpa rute ke subnet tujuan → ICMP dest-unreachable (bukan timeout).',
    category: 'troubleshooting',
    topology: {
      nodes: [node('pc1', 'PC1', 'pc', 1, 't1'), node('r1', 'R1', 'router', 3, 't2'), node('r2', 'R2', 'router', 3, 't3'), node('pc2', 'PC2', 'pc', 1, 't4')],
      edges: [edge('e1', 'pc1', 'ether1', 'r1', 'ether1'), edge('e2', 'r1', 'ether2', 'r2', 'ether1'), edge('e3', 'r2', 'ether2', 'pc2', 'ether1')],
    },
    setup: (sim) => {
      sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24', ether2: '10.0.9.1/30' }, []);
      sim.applyNodeConfig('r2', { ether1: '10.0.9.2/30', ether2: '10.0.7.1/24' }, []);
      sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
      sim.applyNodeConfig('pc2', { ether1: '10.0.7.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.7.1' }]);
    },
    tests: [
      { type: 'assertPing', name: 'PC1 → PC2 GAGAL (rute hilang di R1)', from: 'pc1', to: '10.0.7.10', shouldSucceed: false },
      { type: 'assertPing', name: 'PC1 → R1 sendiri tetap OK', from: 'pc1', to: '10.0.1.1' },
      { type: 'assertRouteAbsent', name: 'Tidak ada rute ke 10.0.7.0/24 di R1', node: 'r1', dst: '10.0.7.0/24' },
    ],
    expectedResult: 'Router tanpa rute → ICMP dest-unreachable (bukan timeout palsu)',
  },
  {
    id: 'trouble-vlan-mismatch',
    name: 'VLAN Mismatch',
    description: 'Dua PC di VLAN berbeda tanpa routing → terisolasi (skenario menunjukkan kegagalan reachability).',
    category: 'troubleshooting',
    topology: { nodes: [node('pc1', 'PC1', 'pc', 1, 't1'), node('pc2', 'PC2', 'pc', 1, 't2'), node('sw1', 'SW1', 'switch', 4, 't3')], edges: [edge('e1', 'pc1', 'ether1', 'sw1', 'ether1'), edge('e2', 'pc2', 'ether1', 'sw1', 'ether2')] },
    setup: (sim) => {
      sim.setPortVlans('sw1', { ether1: 10, ether2: 20 });
      sim.applyNodeConfig('pc1', { ether1: '10.0.10.2/24' }, []);
      sim.applyNodeConfig('pc2', { ether1: '10.0.20.2/24' }, []);
    },
    tests: [{ type: 'assertPing', name: 'PC1 → PC2 (VLAN beda) harus GAGAL', from: 'pc1', to: '10.0.20.2', shouldSucceed: false }],
    expectedResult: 'Isolasi VLAN tanpa routing',
  },
  {
    id: 'trouble-firewall-block',
    name: 'Firewall Block',
    description: 'ACL deny semua ICMP → ping diblokir dengan alasan yang jelas.',
    category: 'troubleshooting',
    topology: {
      nodes: [node('pc1', 'PC1', 'pc', 1, 't1'), node('sw1', 'SW1', 'switch', 4, 't2'), node('r1', 'R1', 'router', 3, 't3'), node('pc2', 'PC2', 'pc', 1, 't4')],
      edges: [edge('e1', 'pc1', 'ether1', 'sw1', 'ether1'), edge('e2', 'sw1', 'ether2', 'r1', 'ether1'), edge('e3', 'r1', 'ether2', 'pc2', 'ether1')],
    },
    setup: (sim) => {
      sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24', ether2: '10.0.9.1/24' }, []);
      sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
      sim.applyNodeConfig('pc2', { ether1: '10.0.9.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.9.1' }]);
      sim.setAcls('r1', [{ action: 'deny', proto: 'icmp' }] as AclRule[]);
    },
    tests: [
      { type: 'assertBlocked', name: 'Ping diblokir firewall', from: 'pc1', to: '10.0.9.10' },
      { type: 'assertRouteExists', name: 'Route tetap ada (masalah di firewall)', node: 'r1', dst: '10.0.9.0/24', kind: 'connected' },
    ],
    expectedResult: 'ACL deny ICMP memblokir ping tanpa merusak routing',
  },
];

export { NetworkSimulator };
