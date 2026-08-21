// ============================================================
// labGenerator — pembuat lab deterministik untuk AI.
//
// Setiap lab: topology (device + kabel) yang dibuat via tool
// topology (jalur sama dengan aksi AI lain), setupCommands per
// device (dijalankan via execute_cli → jalur vendor), tasks,
// expectedResults, dan grading berbasis STATE NYATA engine.
//
// Semua ID deterministik (seed) agar lab reproducible di test.
// ============================================================

import type { LabProject, LabNode } from '../../../types';
import type { NetworkSimulator } from '../../../engine/net/core/NetworkSimulator';
import type { GeneratedLab, LabTask, PlanAction, LabGradingResult } from './types';

/** bungkus hasil cek dengan label (untuk laporan grading). */
const g = (label: string, r: { pass: boolean; detail: string }): LabGradingResult => ({ label, ...r });
import { uid } from './runtime';

export type LabTemplateId =
  | 'ospf-3-router'
  | 'vlan-basic'
  | 'nat-internet'
  | 'dhcp-server'
  | 'bgp-2-as'
  | 'eigrp-3-router'
  | 'vrrp-2-router'
  | 'ipv6-slaac'
  | 'wireless-2-ap';

/** resolusi nama device → id engine (id berbentuk seeded uid, mis. node-ospf-3-router-r1). */
export function resolveDeviceId(project: LabProject, name: string): string {
  return project.nodes.find((n) => n.name === name || n.id === name)?.id ?? name;
}

export interface LabTemplate extends Omit<GeneratedLab, 'setupCommands' | 'grading'> {
  id: LabTemplateId;
  /** rancangan topologi (device + kabel) — dibuat via tool topology. */
  topology: LabTopologyBlueprint;
  setupCommands: Record<string, string[]>;
  grading: (sim: NetworkSimulator, project: LabProject) => LabGradingResult[];
}

export interface LabTopologyBlueprint {
  devices: Array<{
    deviceType: LabNode['deviceType'];
    vendor: string;
    name: string;
    seed: string;
    position: { x: number; y: number };
  }>;
  links: Array<{
    a: string;
    b: string;
    seed: string;
    sourceInterfaceSeed?: string;
    targetInterfaceSeed?: string;
  }>;
}

// ── helper grading ────────────────────────────────────────────

function hasPing(sim: NetworkSimulator, from: string, to: string): { pass: boolean; detail: string } {
  const r = sim.simulatePing(from, to);
  return {
    pass: r.success,
    detail: r.success ? `ping ${from} → ${to} ok (${r.path.length} hop)` : `ping ${from} → ${to} GAGAL: ${r.reason ?? 'unknown'}`,
  };
}

function ospfFull(sim: NetworkSimulator, nodeId: string): { pass: boolean; detail: string } {
  const info = sim.getOspfNeighbors(nodeId);
  const full = info.filter((n) => n.state === 'Full');
  return { pass: full.length > 0, detail: `OSPF ${nodeId}: ${full.length} adjacency Full dari ${info.length} total` };
}

function routeExists(sim: NetworkSimulator, nodeId: string, dst: string): { pass: boolean; detail: string } {
  const routes = (sim.getDevice(nodeId)?.getRoutes() ?? []).filter((r) => r.dst === dst);
  return { pass: routes.length > 0, detail: `rute ${dst} di ${nodeId}: ${routes.length > 0 ? 'ada' : 'TIDAK ADA'}` };
}

function vlanExists(sim: NetworkSimulator, nodeId: string, vlanId: number): { pass: boolean; detail: string } {
  const vlans = sim.getNodeVlans(nodeId);
  const hit = vlans.find((v) => v.id === vlanId);
  return { pass: !!hit, detail: `VLAN ${vlanId} di ${nodeId}: ${hit ? `ada (${hit.name ?? 'unnamed'})` : 'TIDAK ADA'}` };
}

function natActive(sim: NetworkSimulator, nodeId: string): { pass: boolean; detail: string } {
  const nats = sim.getNodeNats(nodeId);
  return { pass: nats.length > 0, detail: `NAT di ${nodeId}: ${nats.length > 0 ? 'aktif' : 'tidak ada rule aktif'}` };
}

function leaseGranted(sim: NetworkSimulator, nodeId: string): { pass: boolean; detail: string } {
  const lease = sim.getLeaseFor(nodeId);
  return { pass: !!lease, detail: `lease DHCP ${nodeId}: ${lease ? lease.ip : 'BELUM DAPAT LEASE'}` };
}

function bgpEstablished(sim: NetworkSimulator, nodeId: string): { pass: boolean; detail: string } {
  const peers = sim.getBgpNeighborStates(nodeId);
  const est = peers.filter((p) => p.state === 'Established');
  return { pass: est.length > 0, detail: `BGP ${nodeId}: ${est.length} session Established dari ${peers.length}` };
}

function eigrpAdjacency(sim: NetworkSimulator, nodeId: string): { pass: boolean; detail: string } {
  const info = sim.getEigrpInfo(nodeId);
  const adj = info.neighbors;
  return { pass: adj.length > 0, detail: `EIGRP ${nodeId}: ${adj.length} neighbor terdeteksi` };
}

function vrrpMaster(sim: NetworkSimulator, nodeId: string): { pass: boolean; detail: string } {
  const states = sim.getFhrpInfo(nodeId) ?? [];
  const master = states.some((s) => s.isMaster);
  return { pass: master, detail: `VRRP ${nodeId}: ${master ? 'Master' : 'bukan Master'} (${states.length} grup)` };
}

function ipv6Address(sim: NetworkSimulator, nodeId: string): { pass: boolean; detail: string } {
  const info = sim.getIpv6Info(nodeId);
  const hasV6 = !!info && info.addresses.length > 0;
  return { pass: hasV6, detail: `IPv6 ${nodeId}: ${hasV6 ? 'memiliki alamat' : 'belum ada alamat v6'}` };
}

function wirelessClient(sim: NetworkSimulator, apNodeId: string): { pass: boolean; detail: string } {
  const info = sim.getWirelessInfo(apNodeId);
  const clients = info?.associations?.length ?? 0;
  return { pass: clients > 0, detail: `wireless ${apNodeId}: ${clients} client terasosiasi` };
}

function tcpOk(sim: NetworkSimulator, from: string, to: string, port: number): { pass: boolean; detail: string } {
  const r = sim.simulateTcpConnect(from, to, port);
  return { pass: r.ok, detail: r.ok ? `TCP ${from} → ${to}:${port} handshake ok` : `TCP GAGAL: ${r.reason ?? 'unknown'}` };
}

// ── Templates ─────────────────────────────────────────────────

const TEMPLATES: Record<LabTemplateId, LabTemplate> = {
  'ospf-3-router': {
    id: 'ospf-3-router',
    name: 'OSPF 3 Router',
    description: 'Tiga router OSPF area 0. Siswa harus membuat adjacency OSPF penuh dan route dinamik antar loopback.',
    topology: {
      devices: [
        { deviceType: 'router', vendor: 'mikrotik', name: 'R1', seed: 'r1', position: { x: 100, y: 150 } },
        { deviceType: 'router', vendor: 'mikrotik', name: 'R2', seed: 'r2', position: { x: 420, y: 150 } },
        { deviceType: 'router', vendor: 'mikrotik', name: 'R3', seed: 'r3', position: { x: 260, y: 420 } },
      ],
      links: [
        { a: 'R1', b: 'R2', seed: 'l12' },
        { a: 'R2', b: 'R3', seed: 'l23' },
        { a: 'R1', b: 'R3', seed: 'l13' },
      ],
    },
    setupCommands: {
      R1: [
        '/ip address add address=10.0.1.1/30 interface=ether1',
        '/ip address add address=10.0.3.1/30 interface=ether2',
        '/ip address add address=1.1.1.1/32 interface=ether3',
      ],
      R2: [
        '/ip address add address=10.0.1.2/30 interface=ether1',
        '/ip address add address=10.0.2.1/30 interface=ether2',
        '/ip address add address=2.2.2.2/32 interface=ether3',
      ],
      R3: [
        '/ip address add address=10.0.2.2/30 interface=ether1',
        '/ip address add address=10.0.3.2/30 interface=ether2',
        '/ip address add address=3.3.3.3/32 interface=ether3',
      ],
    },
    tasks: [
      { title: 'Buat adjacency OSPF', detail: 'Aktifkan OSPF area 0 di semua network (10.0.1.0/30, 10.0.2.0/30, 10.0.3.0/30).' },
      { title: 'Verifikasi neighbor Full', detail: 'Semua router harus memiliki 2 tetangga Full.' },
      { title: 'Reachability loopback', detail: 'R1 harus bisa ping 2.2.2.2 dan 3.3.3.3.' },
    ],
    expectedResults: [
      'setiap router memiliki 2 adjacency OSPF Full',
      'rute dinamik 1.1.1.1/32, 2.2.2.2/32, 3.3.3.3/32 saling dikenal',
      'ping loopback lintas router berhasil',
    ],
    grading: (sim, project) => [
      g('OSPF R1 Full', ospfFull(sim, resolveDeviceId(project, 'R1'))),
      g('OSPF R2 Full', ospfFull(sim, resolveDeviceId(project, 'R2'))),
      g('OSPF R3 Full', ospfFull(sim, resolveDeviceId(project, 'R3'))),
      g('ping R1→2.2.2.2', hasPing(sim, resolveDeviceId(project, 'R1'), '2.2.2.2')),
      g('ping R2→3.3.3.3', hasPing(sim, resolveDeviceId(project, 'R2'), '3.3.3.3')),
      g('ping R3→1.1.1.1', hasPing(sim, resolveDeviceId(project, 'R3'), '1.1.1.1')),
    ],
  },

  'vlan-basic': {
    id: 'vlan-basic',
    name: 'VLAN + Inter-VLAN Routing',
    description: 'Switch dengan 2 VLAN (10 & 20) + trunk ke router untuk inter-VLAN routing.',
    topology: {
      devices: [
        { deviceType: 'switch', vendor: 'cisco_ios', name: 'SW1', seed: 'sw1', position: { x: 150, y: 200 } },
        { deviceType: 'router', vendor: 'cisco_ios', name: 'RT1', seed: 'rt1', position: { x: 450, y: 100 } },
        { deviceType: 'pc', vendor: 'linux', name: 'PC-A', seed: 'pca', position: { x: 60, y: 420 } },
        { deviceType: 'pc', vendor: 'linux', name: 'PC-B', seed: 'pcb', position: { x: 240, y: 420 } },
      ],
      links: [
        { a: 'SW1', b: 'RT1', seed: 'l-trunk' },
        { a: 'SW1', b: 'PC-A', seed: 'l-a' },
        { a: 'SW1', b: 'PC-B', seed: 'l-b' },
      ],
    },
    setupCommands: {
      SW1: [
        'vlan 10', 'name users', 'exit',
        'vlan 20', 'name servers', 'exit',
        'interface ether1', 'switchport mode access', 'switchport access vlan 10', 'exit',
        'interface ether2', 'switchport mode access', 'switchport access vlan 20', 'exit',
        'interface ether3', 'switchport mode trunk', 'exit',
      ],
      RT1: [
        'interface ether1', 'no switchport', 'ip address 10.0.10.1 255.255.255.0', 'exit',
        'interface ether1.10', 'encapsulation dot1q 10', 'ip address 10.0.10.254 255.255.255.0', 'exit',
        'interface ether1.20', 'encapsulation dot1q 20', 'ip address 10.0.20.254 255.255.255.0', 'exit',
      ],
      'PC-A': ['ip addr add 10.0.10.100/24 dev eth0', 'ip route add default via 10.0.10.254'],
      'PC-B': ['ip addr add 10.0.20.100/24 dev eth0', 'ip route add default via 10.0.20.254'],
    },
    tasks: [
      { title: 'Buat VLAN', detail: 'VLAN 10 (users) dan VLAN 20 (servers) di SW1.' },
      { title: 'Trunk ke router', detail: 'Port ke RT1 harus trunk.' },
      { title: 'Inter-VLAN routing', detail: 'PC-A (VLAN 10) harus bisa ping PC-B (VLAN 20) via router.' },
    ],
    expectedResults: [
      'VLAN 10 & 20 terkonfigurasi',
      'port trunk aktif ke router',
      'komunikasi antar VLAN melalui router',
    ],
    grading: (sim, project) => [
      g('VLAN 10 di SW1', vlanExists(sim, resolveDeviceId(project, 'SW1'), 10)),
      g('VLAN 20 di SW1', vlanExists(sim, resolveDeviceId(project, 'SW1'), 20)),
      g('inter-VLAN ping', hasPing(sim, resolveDeviceId(project, 'PC-A'), '10.0.20.100')),
    ],
  },

  'nat-internet': {
    id: 'nat-internet',
    name: 'NAT Internet',
    description: 'LAN internal → NAT masquerade → internet. Siswa harus menerapkan NAT dengan benar.',
    topology: {
      devices: [
        { deviceType: 'router', vendor: 'mikrotik', name: 'GW', seed: 'gw', position: { x: 300, y: 120 } },
        { deviceType: 'switch', vendor: 'mikrotik', name: 'SW', seed: 'sw', position: { x: 150, y: 300 } },
        { deviceType: 'pc', vendor: 'linux', name: 'PC1', seed: 'pc1', position: { x: 60, y: 460 } },
        { deviceType: 'server', vendor: 'linux', name: 'SVR', seed: 'svr', position: { x: 520, y: 200 } },
      ],
      links: [
        { a: 'GW', b: 'SW', seed: 'l-gwsw' },
        { a: 'SW', b: 'PC1', seed: 'l-pc1' },
        { a: 'GW', b: 'SVR', seed: 'l-wan' },
      ],
    },
    setupCommands: {
      GW: [
        '/ip address add address=192.168.1.1/24 interface=ether1',
        '/ip address add address=203.0.113.1/30 interface=ether2',
        '/ip route add dst-address=0.0.0.0/0 gateway=203.0.113.2',
      ],
      SW: [],
      PC1: [
        'ip addr add 192.168.1.10/24 dev eth0',
        'ip route add default via 192.168.1.1',
      ],
      SVR: [
        'ip addr add 203.0.113.2/30 dev eth0',
        'ip route add default via 203.0.113.1',
      ],
    },
    tasks: [
      { title: 'NAT masquerade', detail: 'PC1 harus bisa ping server WAN (203.0.113.2) — dengan NAT aktif.' },
      { title: 'Verifikasi', detail: 'NAT rule ada dan ping berhasil.' },
    ],
    expectedResults: [
      'NAT masquerade aktif di GW',
      'PC1 bisa menjangkau jaringan WAN',
    ],
    grading: (sim, project) => [
      g('NAT ping ke WAN', hasPing(sim, resolveDeviceId(project, 'PC1'), '203.0.113.2')),
    ],
  },

  'dhcp-server': {
    id: 'dhcp-server',
    name: 'DHCP Server',
    description: 'Router sebagai DHCP server. Client harus mendapat lease otomatis.',
    topology: {
      devices: [
        { deviceType: 'router', vendor: 'mikrotik', name: 'DHCPSRV', seed: 'dh1', position: { x: 300, y: 120 } },
        { deviceType: 'switch', vendor: 'mikrotik', name: 'SW', seed: 'dhsw', position: { x: 150, y: 300 } },
        { deviceType: 'pc', vendor: 'linux', name: 'CLIENT', seed: 'dhcl', position: { x: 60, y: 460 } },
      ],
      links: [
        { a: 'DHCPSRV', b: 'SW', seed: 'l-dh1' },
        { a: 'SW', b: 'CLIENT', seed: 'l-dhc' },
      ],
    },
    setupCommands: {
      DHCPSRV: ['/ip address add address=10.10.0.1/24 interface=ether1'],
      SW: [],
      CLIENT: [],
    },
    tasks: [
      { title: 'DHCP server', detail: 'Pool 10.10.0.100-10.10.0.200 di DHCPSRV.' },
      { title: 'Client otomatis', detail: 'CLIENT harus mendapat lease dari server.' },
    ],
    expectedResults: [
      'CLIENT mendapat IP dari pool DHCP',
      'CLIENT bisa ping gateway 10.10.0.1',
    ],
    grading: (sim, project) => [
      g('lease DHCP CLIENT', leaseGranted(sim, resolveDeviceId(project, 'CLIENT'))),
      g('ping gateway', hasPing(sim, resolveDeviceId(project, 'CLIENT'), '10.10.0.1')),
    ],
  },

  'bgp-2-as': {
    id: 'bgp-2-as',
    name: 'BGP 2 AS',
    description: 'Dua AS (65001 & 65002) saling berpeering BGP eBGP.',
    topology: {
      devices: [
        { deviceType: 'router', vendor: 'cisco_ios', name: 'AS1-R', seed: 'bgp1', position: { x: 150, y: 200 } },
        { deviceType: 'router', vendor: 'cisco_ios', name: 'AS2-R', seed: 'bgp2', position: { x: 450, y: 200 } },
      ],
      links: [{ a: 'AS1-R', b: 'AS2-R', seed: 'l-bgp' }],
    },
    setupCommands: {
      'AS1-R': [
        'interface ether1', 'ip address 10.255.0.1 255.255.255.252', 'no shutdown', 'exit',
        'interface ether2', 'ip address 172.16.1.1 255.255.255.0', 'no shutdown', 'exit',
        'router bgp 65001',
        'neighbor 10.255.0.2 remote-as 65002',
        'network 172.16.1.0 mask 255.255.255.0',
        'exit',
      ],
      'AS2-R': [
        'interface ether1', 'ip address 10.255.0.2 255.255.255.252', 'no shutdown', 'exit',
        'interface ether2', 'ip address 172.16.2.1 255.255.255.0', 'no shutdown', 'exit',
        'router bgp 65002',
        'neighbor 10.255.0.1 remote-as 65001',
        'network 172.16.2.0 mask 255.255.255.0',
        'exit',
      ],
    },
    tasks: [
      { title: 'Session BGP', detail: 'Peer eBGP 10.255.0.2 ↔ 10.255.0.1 harus Established.' },
      { title: 'Prefix exchange', detail: '172.16.1.0/24 diiklankan ke AS2, 172.16.2.0/24 ke AS1.' },
    ],
    expectedResults: [
      'BGP session Established',
      'rute antar AS tersedia via BGP',
    ],
    grading: (sim, project) => [
      g('BGP AS1 Established', bgpEstablished(sim, resolveDeviceId(project, 'AS1-R'))),
      g('BGP AS2 Established', bgpEstablished(sim, resolveDeviceId(project, 'AS2-R'))),
      g('rute prefix AS2', routeExists(sim, resolveDeviceId(project, 'AS1-R'), '172.16.2.0/24')),
      g('ping lintas AS', hasPing(sim, resolveDeviceId(project, 'AS1-R'), '172.16.2.1')),
    ],
  },

  'eigrp-3-router': {
    id: 'eigrp-3-router',
    name: 'EIGRP 3 Router',
    description: 'Tiga router EIGRP (AS 100) — siswa harus membangun adjacency dan route dinamik.',
    topology: {
      devices: [
        { deviceType: 'router', vendor: 'cisco_ios', name: 'E1', seed: 'e1', position: { x: 100, y: 150 } },
        { deviceType: 'router', vendor: 'cisco_ios', name: 'E2', seed: 'e2', position: { x: 420, y: 150 } },
        { deviceType: 'router', vendor: 'cisco_ios', name: 'E3', seed: 'e3', position: { x: 260, y: 420 } },
      ],
      links: [
        { a: 'E1', b: 'E2', seed: 'le12' },
        { a: 'E2', b: 'E3', seed: 'le23' },
        { a: 'E1', b: 'E3', seed: 'le13' },
      ],
    },
    setupCommands: {
      E1: [
        'interface ether1', 'ip address 10.1.0.1 255.255.255.252', 'no shutdown', 'exit',
        'interface ether2', 'ip address 10.1.0.5 255.255.255.252', 'no shutdown', 'exit',
        'interface ether3', 'ip address 192.168.1.1 255.255.255.0', 'no shutdown', 'exit',
      ],
      E2: [
        'interface ether1', 'ip address 10.1.0.2 255.255.255.252', 'no shutdown', 'exit',
        'interface ether2', 'ip address 10.1.0.9 255.255.255.252', 'no shutdown', 'exit',
        'interface ether3', 'ip address 192.168.2.1 255.255.255.0', 'no shutdown', 'exit',
      ],
      E3: [
        'interface ether1', 'ip address 10.1.0.10 255.255.255.252', 'no shutdown', 'exit',
        'interface ether2', 'ip address 10.1.0.6 255.255.255.252', 'no shutdown', 'exit',
        'interface ether3', 'ip address 192.168.3.1 255.255.255.0', 'no shutdown', 'exit',
      ],
    },
    tasks: [
      { title: 'Adjacency EIGRP', detail: 'AS 100, network 10.1.0.0/24 di semua router.' },
      { title: 'Reachability', detail: 'E1 harus bisa ping 192.168.2.1 dan 192.168.3.1.' },
    ],
    expectedResults: [
      'neighbor EIGRP Up',
      'route dinamik antar LAN',
    ],
    grading: (sim, project) => [
      g('EIGRP E1 adjacency', eigrpAdjacency(sim, resolveDeviceId(project, 'E1'))),
      g('EIGRP E2 adjacency', eigrpAdjacency(sim, resolveDeviceId(project, 'E2'))),
      g('EIGRP E3 adjacency', eigrpAdjacency(sim, resolveDeviceId(project, 'E3'))),
      g('ping E1→LAN E2', hasPing(sim, resolveDeviceId(project, 'E1'), '192.168.2.1')),
      g('ping E3→LAN E1', hasPing(sim, resolveDeviceId(project, 'E3'), '192.168.1.1')),
    ],
  },

  'vrrp-2-router': {
    id: 'vrrp-2-router',
    name: 'VRRP High Availability',
    description: 'Dua router VRRP (virtual 10.0.0.254) untuk gateway redundancy LAN.',
    topology: {
      devices: [
        { deviceType: 'router', vendor: 'mikrotik', name: 'VR1', seed: 'vr1', position: { x: 150, y: 120 } },
        { deviceType: 'router', vendor: 'mikrotik', name: 'VR2', seed: 'vr2', position: { x: 450, y: 120 } },
        { deviceType: 'switch', vendor: 'mikrotik', name: 'VSW', seed: 'vsw', position: { x: 300, y: 300 } },
        { deviceType: 'pc', vendor: 'linux', name: 'VPC', seed: 'vpc', position: { x: 300, y: 460 } },
      ],
      links: [
        { a: 'VR1', b: 'VSW', seed: 'lv1' },
        { a: 'VR2', b: 'VSW', seed: 'lv2' },
        { a: 'VSW', b: 'VPC', seed: 'lvpc' },
      ],
    },
    setupCommands: {
      VR1: [
        '/ip address add address=10.0.0.1/24 interface=ether1',
        '/ip address add address=10.0.99.1/30 interface=ether2',
      ],
      VR2: [
        '/ip address add address=10.0.0.2/24 interface=ether1',
        '/ip address add address=10.0.99.2/30 interface=ether2',
      ],
      VSW: [],
      VPC: ['ip addr add 10.0.0.100/24 dev eth0', 'ip route add default via 10.0.0.254'],
    },
    tasks: [
      { title: 'VRRP group', detail: 'Virtual IP 10.0.0.254/24, grup 1, di VR1 & VR2.' },
      { title: 'Failover', detail: 'Satu Master, satu Backup. Client ping 10.0.0.254.' },
    ],
    expectedResults: [
      'satu router menjadi Master',
      'client menjangkau virtual IP',
    ],
    grading: (sim, project) => [
      g('VRRP VR1 Master', vrrpMaster(sim, resolveDeviceId(project, 'VR1'))),
      g('VRRP VR2 Master', vrrpMaster(sim, resolveDeviceId(project, 'VR2'))),
      g('ping virtual IP', hasPing(sim, resolveDeviceId(project, 'VPC'), '10.0.0.254')),
    ],
  },

  'ipv6-slaac': {
    id: 'ipv6-slaac',
    name: 'IPv6 SLAAC',
    description: 'Router mengiklankan prefix IPv6 (SLAAC/RA); client mendapat alamat otomatis.',
    topology: {
      devices: [
        { deviceType: 'router', vendor: 'mikrotik', name: 'V6R', seed: 'v6r', position: { x: 300, y: 120 } },
        { deviceType: 'switch', vendor: 'mikrotik', name: 'V6SW', seed: 'v6sw', position: { x: 150, y: 300 } },
        { deviceType: 'pc', vendor: 'linux', name: 'V6PC', seed: 'v6pc', position: { x: 60, y: 460 } },
      ],
      links: [
        { a: 'V6R', b: 'V6SW', seed: 'lv6r' },
        { a: 'V6SW', b: 'V6PC', seed: 'lv6c' },
      ],
    },
    setupCommands: {
      V6R: ['/ipv6 address add address=2001:db8:1::1/64 interface=ether1'],
      V6SW: [],
      V6PC: [],
    },
    tasks: [
      { title: 'Prefix IPv6', detail: '2001:db8:1::/64 di interface LAN V6R (RA otomatis).' },
      { title: 'SLAAC client', detail: 'V6PC mendapat alamat v6 dan ping 2001:db8:1::1.' },
    ],
    expectedResults: [
      'V6PC memiliki alamat IPv6',
      'ping IPv6 ke router berhasil',
    ],
    grading: (sim, project) => [
      g('IPv6 V6PC address', ipv6Address(sim, resolveDeviceId(project, 'V6PC'))),
      g('ping IPv6 router', hasPing(sim, resolveDeviceId(project, 'V6PC'), '2001:db8:1::1')),
    ],
  },

  'wireless-2-ap': {
    id: 'wireless-2-ap',
    name: 'Wireless 2 AP',
    description: 'Dua AP wireless terhubung ke switch; client station bergabung via WPA2.',
    topology: {
      devices: [
        { deviceType: 'wireless', vendor: 'mikrotik', name: 'AP1', seed: 'ap1', position: { x: 150, y: 120 } },
        { deviceType: 'wireless', vendor: 'mikrotik', name: 'AP2', seed: 'ap2', position: { x: 450, y: 120 } },
        { deviceType: 'switch', vendor: 'mikrotik', name: 'WSW', seed: 'wsw', position: { x: 300, y: 300 } },
        { deviceType: 'wireless', vendor: 'mikrotik', name: 'WPC', seed: 'wpc', position: { x: 300, y: 460 } },
      ],
      links: [
        { a: 'AP1', b: 'WSW', seed: 'lw1' },
        { a: 'AP2', b: 'WSW', seed: 'lw2' },
        { a: 'WSW', b: 'WPC', seed: 'lwpc' },
        { a: 'AP1', b: 'WPC', seed: 'lwair' },
      ],
    },
    setupCommands: {
      AP1: [
        '/interface wireless set wlan1 mode=ap-bridge ssid=NetLabLab band=2ghz-b/g/n',
        '/interface wireless security-profiles set default mode=dynamic-keys authentication-types=wpa2-psk wpa2-pre-shared-key=netlab123',
        '/interface wireless set wlan1 security-profile=default',
        '/ip address add address=192.168.88.1/24 interface=wlan1',
      ],
      AP2: [
        '/interface wireless set wlan1 mode=ap-bridge ssid=NetLabLab band=2ghz-b/g/n',
        '/interface wireless security-profiles set default mode=dynamic-keys authentication-types=wpa2-psk wpa2-pre-shared-key=netlab123',
        '/interface wireless set wlan1 security-profile=default',
        '/ip address add address=192.168.88.2/24 interface=wlan1',
      ],
      WSW: [],
      WPC: [
        '/interface wireless set wlan1 mode=station ssid=NetLabLab band=2ghz-b/g/n',
        '/interface wireless security-profiles set default mode=dynamic-keys authentication-types=wpa2-psk wpa2-pre-shared-key=netlab123',
        '/interface wireless set wlan1 security-profile=default',
        '/ip address add address=192.168.88.100/24 interface=wlan1',
      ],
    },
    tasks: [
      { title: 'AP mode', detail: 'AP1 & AP2 sebagai ap-bridge dengan SSID NetLabLab (WPA2).' },
      { title: 'Client join', detail: 'WPC (station) bergabung ke jaringan wireless.' },
    ],
    expectedResults: [
      'client terasosiasi ke AP',
      'konektivitas wireless bekerja',
    ],
    grading: (sim, project) => [
      g('wireless AP1 client', wirelessClient(sim, resolveDeviceId(project, 'AP1'))),
      g('wireless AP2 client', wirelessClient(sim, resolveDeviceId(project, 'AP2'))),
      g('ping via wireless', hasPing(sim, resolveDeviceId(project, 'WPC'), '192.168.88.1')),
    ],
  },
};

export const LAB_TEMPLATES: Record<LabTemplateId, LabTemplate> = TEMPLATES;
export const LAB_TEMPLATE_IDS = Object.keys(TEMPLATES) as LabTemplateId[];

/** Ambil template; null bila tidak dikenal. */
export function getLabTemplate(id: string): LabTemplate | null {
  return TEMPLATES[id as LabTemplateId] ?? null;
}

/**
 * Bangun GeneratedLab dari template + seed id.
 * setupCommands dikembalikan apa adanya (dieksekusi via execute_cli).
 */
export function buildLabFromTemplate(id: LabTemplateId, seed?: string): GeneratedLab {
  const t = TEMPLATES[id];
  return {
    id: uid('lab', seed ?? id),
    name: t.name,
    description: t.description,
    setupCommands: t.setupCommands,
    tasks: t.tasks.map((task): LabTask => ({ ...task })),
    expectedResults: [...t.expectedResults],
    grading: t.grading,
  };
}

/**
 * Rancang topologi lab (device + kabel) sebagai daftar PlanAction —
 * dieksekusi oleh AgentEngine seperti action biasa.
 */
export function topologyPlan(template: LabTemplate, seed?: string): PlanAction[] {
  const actions: PlanAction[] = [];
  for (const d of template.topology.devices) {
    actions.push({
      id: uid('act-create', seed ? `${seed}-${d.seed}` : undefined),
      type: 'create_device',
      target: d.name,
      params: {
        type: d.deviceType,
        vendor: d.vendor,
        name: d.name,
        position: d.position,
        seed: seed ? `${seed}-${d.seed}` : undefined,
      },
      reason: `Lab ${template.name}: buat device ${d.name}`,
      expectedEffect: `${d.name} tersedia di canvas dengan type ${d.deviceType}`,
      risk: 'low',
      validation: 'type/vendor valid; nama unik',
    });
  }
  for (const l of template.topology.links) {
    actions.push({
      id: uid('act-link', seed ? `${seed}-${l.seed}` : undefined),
      type: 'connect_devices',
      target: `${l.a} ↔ ${l.b}`,
      params: {
        sourceDeviceId: l.a,
        targetDeviceId: l.b,
        seed: seed ? `${seed}-${l.seed}` : undefined,
      },
      reason: `Lab ${template.name}: kabel ${l.a} ↔ ${l.b}`,
      expectedEffect: `kabel terhubung ${l.a} ↔ ${l.b}`,
      risk: 'low',
      validation: 'kedua device ada',
    });
  }
  return actions;
}