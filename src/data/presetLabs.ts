// ============================================================
// Preset Lab Templates (Tugas 5) — 4 skenario siap pakai.
// Seluruh node memakai port asli model perangkat (getPortsForModel)
// supaya konsisten dengan palette sidebar & sim engine.
// ============================================================

import { LabProject, LabNode, VendorType } from '../types';
import { getPortsForModel } from './deviceModels';

export function mkNode(
  id: string,
  name: string,
  vendor: VendorType,
  model: string,
  deviceType: LabNode['deviceType'],
  x: number,
  y: number,
  opts: { ips?: Record<string, string>; up?: string[] } = {}
): LabNode {
  const ports = getPortsForModel(vendor, model).map((p) => {
    const port = { ...p };
    if (opts.ips?.[p.name]) {
      port.ipAddress = opts.ips[p.name];
      port.status = 'up';
    } else if (opts.up?.includes(p.name)) {
      port.status = 'up';
    }
    return port;
  });
  return { id, name, vendor, model, deviceType, position: { x, y }, ports };
}

export interface PresetLab {
  id: string;
  title: string;
  short: string;
  description: string;
  category: 'gateway' | 'routing' | 'switching' | 'wan';
  difficulty: 'Mudah' | 'Sedang' | 'Lanjut';
  features: string[];
  topologySummary: string;
  build: () => LabProject;
}

// ── Lab 1: Basic Internet Gateway & DHCP Server ────────────────
const lab1 = (): LabProject => ({
  version: '1.0',
  metadata: {
    name: 'Lab 1: Internet Gateway & DHCP',
    author: 'NetLab Presets',
    description:
      'Router gateway (MikroTik) + switch akses + 2 PC. PC mengambil IP otomatis dari DHCP pool router. Cocok untuk latihan dasar IP addressing & DHCP.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  viewport: { x: 80, y: 120, zoom: 1.0 },
  nodes: [
    mkNode('lab1-gw', 'Router-GW', 'mikrotik', 'RB3011UiAS-RM', 'router', 140, 180, {
      ips: { ether1: '192.168.88.1/24', ether2: '203.0.113.1/30' },
      up: ['ether3'],
    }),
    mkNode('lab1-sw', 'Switch-Access', 'cisco_ios', 'Catalyst 2960-X', 'switch', 500, 180, {
      up: ['Gi0/1', 'Gi0/2', 'Gi0/3'],
    }),
    mkNode('lab1-pc1', 'PC-1', 'linux', 'Debian 12 (Bookworm)', 'pc', 840, 90, { up: ['eth1'] }),
    mkNode('lab1-pc2', 'PC-2', 'linux', 'Ubuntu Server 22.04 LTS', 'pc', 840, 280, { up: ['eth1'] }),
  ],
  edges: [
    { id: 'lab1-e1', sourceNodeId: 'lab1-gw', sourcePortId: 'ether3', targetNodeId: 'lab1-sw', targetPortId: 'Gi0/1', cableType: 'copper_straight' },
    { id: 'lab1-e2', sourceNodeId: 'lab1-sw', sourcePortId: 'Gi0/2', targetNodeId: 'lab1-pc1', targetPortId: 'eth1', cableType: 'copper_straight' },
    { id: 'lab1-e3', sourceNodeId: 'lab1-sw', sourcePortId: 'Gi0/3', targetNodeId: 'lab1-pc2', targetPortId: 'eth1', cableType: 'copper_straight' },
  ],
});

// ── Lab 2: Inter-VLAN Routing & Trunking ────────────────────────
const lab2 = (): LabProject => ({
  version: '1.0',
  metadata: {
    name: 'Lab 2: Inter-VLAN Routing & Trunk',
    author: 'NetLab Presets',
    description:
      'Router-on-a-stick: 1 router + 1 switch L2 + 3 PC di VLAN berbeda (VLAN 10, 20, 30). Trunk menuju router membawa seluruh VLAN — latihan trunk, access port & inter-VLAN.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  viewport: { x: 80, y: 120, zoom: 1.0 },
  nodes: [
    mkNode('lab2-rtr', 'Router-IVR', 'cisco_ios', 'ISR 4331', 'router', 140, 220, {
      ips: { 'Gi0/0/0': '10.1.10.1/24' },
    }),
    mkNode('lab2-sw', 'SW-L2', 'cisco_ios', 'Catalyst 2960-X', 'switch', 480, 220, {
      up: ['Gi0/1', 'Gi0/2', 'Gi0/3', 'Gi0/4'],
    }),
    mkNode('lab2-pc10', 'PC-VLAN10', 'linux', 'Debian 12 (Bookworm)', 'pc', 820, 70, {
      ips: { eth1: '10.1.10.10/24' },
    }),
    mkNode('lab2-pc20', 'PC-VLAN20', 'linux', 'Ubuntu Server 22.04 LTS', 'pc', 820, 220, {
      ips: { eth1: '10.1.20.10/24' },
    }),
    mkNode('lab2-pc30', 'PC-VLAN30', 'linux', 'Debian 12 (Bookworm)', 'pc', 820, 370, {
      ips: { eth1: '10.1.30.10/24' },
    }),
  ],
  edges: [
    { id: 'lab2-e1', sourceNodeId: 'lab2-rtr', sourcePortId: 'Gi0/0/0', targetNodeId: 'lab2-sw', targetPortId: 'Gi0/1', cableType: 'copper_straight' },
    { id: 'lab2-e2', sourceNodeId: 'lab2-sw', sourcePortId: 'Gi0/2', targetNodeId: 'lab2-pc10', targetPortId: 'eth1', cableType: 'copper_straight' },
    { id: 'lab2-e3', sourceNodeId: 'lab2-sw', sourcePortId: 'Gi0/3', targetNodeId: 'lab2-pc20', targetPortId: 'eth1', cableType: 'copper_straight' },
    { id: 'lab2-e4', sourceNodeId: 'lab2-sw', sourcePortId: 'Gi0/4', targetNodeId: 'lab2-pc30', targetPortId: 'eth1', cableType: 'copper_straight' },
  ],
});

// ── Lab 3: Dual-ISP Load Balancing & Failover ───────────────────
const lab3 = (): LabProject => ({
  version: '1.0',
  metadata: {
    name: 'Lab 3: Dual-ISP Load Balancing',
    author: 'NetLab Presets',
    description:
      '2 router ISP + 1 router utama (MikroTik) + switch + 2 PC LAN. Latihan default route ganda (ECMP/backup), failover link WAN, dan NAT keluar.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  viewport: { x: 60, y: 100, zoom: 0.95 },
  nodes: [
    mkNode('lab3-isp1', 'ISP-1', 'mikrotik', 'RB3011UiAS-RM', 'router', 140, 140, {
      ips: { ether1: '10.0.0.1/30' },
    }),
    mkNode('lab3-isp2', 'ISP-2', 'mikrotik', 'RB3011UiAS-RM', 'router', 140, 400, {
      ips: { ether1: '10.0.1.1/30' },
    }),
    mkNode('lab3-main', 'Main-Router', 'mikrotik', 'RB3011UiAS-RM', 'router', 480, 260, {
      ips: { ether1: '10.0.0.2/30', ether2: '10.0.1.2/30', ether3: '192.168.1.1/24' },
    }),
    mkNode('lab3-sw', 'SW-LAN', 'aruba', 'Aruba 2930F', 'switch', 800, 200, {
      up: ['1/1/1', '1/1/2', '1/1/3'],
    }),
    mkNode('lab3-pc1', 'PC-1', 'linux', 'Debian 12 (Bookworm)', 'pc', 1060, 120, {
      ips: { eth1: '192.168.1.10/24' },
    }),
    mkNode('lab3-pc2', 'PC-2', 'linux', 'Ubuntu Server 22.04 LTS', 'pc', 1060, 320, {
      ips: { eth1: '192.168.1.11/24' },
    }),
  ],
  edges: [
    { id: 'lab3-e1', sourceNodeId: 'lab3-isp1', sourcePortId: 'ether2', targetNodeId: 'lab3-main', targetPortId: 'ether1', cableType: 'copper_straight' },
    { id: 'lab3-e2', sourceNodeId: 'lab3-isp2', sourcePortId: 'ether2', targetNodeId: 'lab3-main', targetPortId: 'ether2', cableType: 'copper_straight' },
    { id: 'lab3-e3', sourceNodeId: 'lab3-main', sourcePortId: 'ether3', targetNodeId: 'lab3-sw', targetPortId: '1/1/1', cableType: 'copper_straight' },
    { id: 'lab3-e4', sourceNodeId: 'lab3-sw', sourcePortId: '1/1/2', targetNodeId: 'lab3-pc1', targetPortId: 'eth1', cableType: 'copper_straight' },
    { id: 'lab3-e5', sourceNodeId: 'lab3-sw', sourcePortId: '1/1/3', targetNodeId: 'lab3-pc2', targetPortId: 'eth1', cableType: 'copper_straight' },
  ],
});

// ── Lab 4: Dynamic Routing OSPF Multi-Router ────────────────────
const lab4 = (): LabProject => ({
  version: '1.0',
  metadata: {
    name: 'Lab 4: OSPF Multi-Router',
    author: 'NetLab Presets',
    description:
      '3 router Cisco saling terhubung melingkar (ring) — OSPF area 0 dengan LAN masing-masing. Latihan adjacency OSPF, jenis link, dan rute dinamis.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  viewport: { x: 40, y: 180, zoom: 1.0 },
  nodes: [
    mkNode('lab4-r1', 'R1', 'cisco_ios', 'ISR 4331', 'router', 140, 140, {
      ips: { 'Gi0/0/0': '10.0.12.1/30', 'Gi0/0/1': '10.0.13.1/30', 'Gi0/0/2': '192.168.10.1/24' },
    }),
    mkNode('lab4-r2', 'R2', 'cisco_ios', 'ISR 4331', 'router', 660, 140, {
      ips: { 'Gi0/0/0': '10.0.12.2/30', 'Gi0/0/1': '10.0.23.2/30', 'Gi0/0/2': '192.168.20.1/24' },
    }),
    mkNode('lab4-r3', 'R3', 'cisco_ios', 'ISR 4331', 'router', 660, 480, {
      ips: { 'Gi0/0/0': '10.0.13.3/30', 'Gi0/0/1': '10.0.23.3/30', 'Gi0/0/2': '192.168.30.1/24' },
    }),
    mkNode('lab4-pc1', 'PC-A', 'linux', 'Debian 12 (Bookworm)', 'pc', 40, 480, {
      ips: { eth1: '192.168.10.10/24' },
    }),
    mkNode('lab4-pc2', 'PC-B', 'linux', 'Ubuntu Server 22.04 LTS', 'pc', 1000, 340, {
      ips: { eth1: '192.168.30.10/24' },
    }),
  ],
  edges: [
    { id: 'lab4-e1', sourceNodeId: 'lab4-r1', sourcePortId: 'Gi0/0/0', targetNodeId: 'lab4-r2', targetPortId: 'Gi0/0/0', cableType: 'copper_straight' },
    { id: 'lab4-e2', sourceNodeId: 'lab4-r1', sourcePortId: 'Gi0/0/1', targetNodeId: 'lab4-r3', targetPortId: 'Gi0/0/0', cableType: 'copper_straight' },
    { id: 'lab4-e3', sourceNodeId: 'lab4-r2', sourcePortId: 'Gi0/0/1', targetNodeId: 'lab4-r3', targetPortId: 'Gi0/0/1', cableType: 'copper_straight' },
    { id: 'lab4-e4', sourceNodeId: 'lab4-r1', sourcePortId: 'Gi0/0/2', targetNodeId: 'lab4-pc1', targetPortId: 'eth1', cableType: 'copper_straight' },
    { id: 'lab4-e5', sourceNodeId: 'lab4-r3', sourcePortId: 'Gi0/0/2', targetNodeId: 'lab4-pc2', targetPortId: 'eth1', cableType: 'copper_straight' },
  ],
});


// ── Lab 6: Dual-ISP Load Balancing (PCC) + iPerf Bandwidth Test ──
const lab6 = (): LabProject => ({
  version: '1.0',
  metadata: {
    name: 'Lab 6: Dual-ISP Load Balancing + iPerf',
    author: 'NetLab Advanced',
    description: 'Dual-WAN (ISP1 & ISP2) + MikroTik Edge Router. Ada iPerf Server di sisi "WAN/Dummy ISP" buat simulasi internet & tes throughput pake iperf3 antar PC ke server.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  viewport: { x: 40, y: 80, zoom: 0.9 },
  nodes: [
    mkNode('lb-isp1', 'ISP-1', 'mikrotik', 'RB3011UiAS-RM', 'router', 80, 140, {
      ips: { ether1: '100.64.1.1/30', ether2: '10.10.12.1/30' },
      up: ['ether1', 'ether2'],
    }),
    mkNode('lb-isp2', 'ISP-2', 'mikrotik', 'RB3011UiAS-RM', 'router', 80, 420, {
      ips: { ether1: '100.64.2.1/30', ether2: '10.10.23.1/30' },
      up: ['ether1', 'ether2'],
    }),
    mkNode('lb-edge', 'EDGE-RTR (LB)', 'mikrotik', 'CCR1009-7G-1C-1S+', 'router', 420, 280, {
      ips: { ether1: '10.10.12.2/30', ether2: '10.10.23.2/30', ether3: '192.168.10.1/24' },
      up: ['ether1', 'ether2', 'ether3'],
    }),
    mkNode('lb-srv', 'IPERF-SERVER', 'linux', 'Debian 12 (Bookworm)', 'server', 80, 280, {
      ips: { eth1: '10.10.99.100/24' },
      up: ['eth1'],
    }),
    mkNode('lb-sw', 'CORE-SW', 'cisco_ios', 'Catalyst 2960-X', 'switch', 720, 280, {
      up: ['Gi0/1', 'Gi0/2', 'Gi0/3', 'Gi0/4'],
    }),
    mkNode('lb-pc1', 'CLIENT-1', 'linux', 'Debian 12 (Bookworm)', 'pc', 980, 160, {
      ips: { eth1: '192.168.10.11/24' },
      up: ['eth1'],
    }),
    mkNode('lb-pc2', 'CLIENT-2', 'linux', 'Ubuntu Server 22.04 LTS', 'pc', 980, 280, {
      ips: { eth1: '192.168.10.12/24' },
      up: ['eth1'],
    }),
    mkNode('lb-pc3', 'CLIENT-3', 'linux', 'Alpine Linux', 'pc', 980, 400, {
      ips: { eth1: '192.168.10.13/24' },
      up: ['eth1'],
    }),
  ],
  edges: [
    { id: 'lb-e1', sourceNodeId: 'lb-isp1', sourcePortId: 'ether2', targetNodeId: 'lb-edge', targetPortId: 'ether1', cableType: 'copper_straight' },
    { id: 'lb-e2', sourceNodeId: 'lb-isp2', sourcePortId: 'ether2', targetNodeId: 'lb-edge', targetPortId: 'ether2', cableType: 'copper_straight' },
    { id: 'lb-e3', sourceNodeId: 'lb-edge', sourcePortId: 'ether3', targetNodeId: 'lb-sw', targetPortId: 'Gi0/1', cableType: 'copper_straight' },
    { id: 'lb-e4', sourceNodeId: 'lb-sw', sourcePortId: 'Gi0/2', targetNodeId: 'lb-pc1', targetPortId: 'eth1', cableType: 'copper_straight' },
    { id: 'lb-e5', sourceNodeId: 'lb-sw', sourcePortId: 'Gi0/3', targetNodeId: 'lb-pc2', targetPortId: 'eth1', cableType: 'copper_straight' },
    { id: 'lb-e6', sourceNodeId: 'lb-sw', sourcePortId: 'Gi0/4', targetNodeId: 'lb-pc3', targetPortId: 'eth1', cableType: 'copper_straight' },
    { id: 'lb-e7', sourceNodeId: 'lb-isp1', sourcePortId: 'ether1', targetNodeId: 'lb-srv', targetPortId: 'eth1', cableType: 'copper_straight' },
    { id: 'lb-e8', sourceNodeId: 'lb-isp2', sourcePortId: 'ether1', targetNodeId: 'lb-srv', targetPortId: 'eth1', cableType: 'copper_cross' },
  ],
});

// ── Lab 7: ECMP Load Balancing (Equal-Cost Multi-Path) ─────────
const lab7 = (): LabProject => ({
  version: '1.0',
  metadata: {
    name: 'Lab 7: ECMP Load Balancing',
    author: 'NetLab Advanced',
    description: '2 jalur equal-cost dari EDGE ke "Internet". Cocok buat liat per-flow load balancing via ECMP. Bisa test pake ping/iperf buat bandingin hasilnya.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  viewport: { x: 60, y: 100, zoom: 0.95 },
  nodes: [
    mkNode('ecmp-net', 'INTERNET-NET', 'linux', 'Debian 12 (Bookworm)', 'server', 100, 260, {
      ips: { eth1: '8.8.8.8/32' },
      up: ['eth1'],
    }),
    mkNode('ecmp-r1', 'ISP-R1', 'cisco_ios', 'ISR 4331', 'router', 360, 160, {
      ips: { 'Gi0/0/0': '172.16.1.1/30', 'Gi0/0/1': '203.0.113.1/30' },
      up: ['Gi0/0/0', 'Gi0/0/1'],
    }),
    mkNode('ecmp-r2', 'ISP-R2', 'cisco_ios', 'ISR 4331', 'router', 360, 360, {
      ips: { 'Gi0/0/0': '172.16.2.1/30', 'Gi0/0/1': '203.0.113.5/30' },
      up: ['Gi0/0/0', 'Gi0/0/1'],
    }),
    mkNode('ecmp-edge', 'EDGE-ECMP', 'cisco_ios', 'ISR 4431', 'router', 660, 260, {
      ips: { 'Gi0/0/0': '172.16.1.2/30', 'Gi0/0/1': '172.16.2.2/30', 'Gi0/0/2': '192.168.50.1/24' },
      up: ['Gi0/0/0', 'Gi0/0/1', 'Gi0/0/2'],
    }),
    mkNode('ecmp-sw', 'LAN-SW', 'cisco_ios', 'Catalyst 2960-X', 'switch', 920, 260, {
      up: ['Gi0/1', 'Gi0/2'],
    }),
    mkNode('ecmp-pc1', 'PC-TEST-1', 'linux', 'Ubuntu Server 22.04 LTS', 'pc', 1160, 180, {
      ips: { eth1: '192.168.50.10/24' },
      up: ['eth1'],
    }),
    mkNode('ecmp-pc2', 'PC-TEST-2', 'linux', 'Debian 12 (Bookworm)', 'pc', 1160, 340, {
      ips: { eth1: '192.168.50.20/24' },
      up: ['eth1'],
    }),
  ],
  edges: [
    { id: 'ecmp-e1', sourceNodeId: 'ecmp-net', sourcePortId: 'eth1', targetNodeId: 'ecmp-r1', targetPortId: 'Gi0/0/0', cableType: 'copper_straight' },
    { id: 'ecmp-e2', sourceNodeId: 'ecmp-net', sourcePortId: 'eth1', targetNodeId: 'ecmp-r2', targetPortId: 'Gi0/0/0', cableType: 'copper_straight' },
    { id: 'ecmp-e3', sourceNodeId: 'ecmp-r1', sourcePortId: 'Gi0/0/1', targetNodeId: 'ecmp-edge', targetPortId: 'Gi0/0/0', cableType: 'copper_straight' },
    { id: 'ecmp-e4', sourceNodeId: 'ecmp-r2', sourcePortId: 'Gi0/0/1', targetNodeId: 'ecmp-edge', targetPortId: 'Gi0/0/1', cableType: 'copper_straight' },
    { id: 'ecmp-e5', sourceNodeId: 'ecmp-edge', sourcePortId: 'Gi0/0/2', targetNodeId: 'ecmp-sw', targetPortId: 'Gi0/1', cableType: 'copper_straight' },
    { id: 'ecmp-e6', sourceNodeId: 'ecmp-sw', sourcePortId: 'Gi0/2', targetNodeId: 'ecmp-pc1', targetPortId: 'eth1', cableType: 'copper_straight' },
    { id: 'ecmp-e7', sourceNodeId: 'ecmp-sw', sourcePortId: 'Gi0/2', targetNodeId: 'ecmp-pc2', targetPortId: 'eth1', cableType: 'copper_straight' },
  ],
});

// ── Lab 8: WAN Failover (Primary/Backup) ────────────────────────
const lab8 = (): LabProject => ({
  version: '1.0',
  metadata: {
    name: 'Lab 8: WAN Failover (Primary/Backup)',
    author: 'NetLab Advanced',
    description: 'Hanya 1 jalur aktif (Primary), kalo down auto pindah ke Backup. Cocok buat simulasi ISP down & tracking route. Bisa diuji koneksi LAN ke Internet.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  viewport: { x: 80, y: 120, zoom: 0.95 },
  nodes: [
    mkNode('fo-isp1', 'ISP-PRIMARY', 'mikrotik', 'RB3011UiAS-RM', 'router', 160, 120, {
      ips: { ether1: '203.0.113.1/30' },
      up: ['ether1'],
    }),
    mkNode('fo-isp2', 'ISP-BACKUP', 'mikrotik', 'RB3011UiAS-RM', 'router', 160, 380, {
      ips: { ether1: '198.51.100.1/30' },
      up: ['ether1'],
    }),
    mkNode('fo-edge', 'EDGE-FAILOVER', 'mikrotik', 'RB4011iGS+', 'router', 480, 250, {
      ips: { ether1: '203.0.113.2/30', ether2: '198.51.100.2/30', ether3: '192.168.20.1/24' },
      up: ['ether1', 'ether2', 'ether3'],
    }),
    mkNode('fo-sw', 'ACCESS-SW', 'cisco_ios', 'Catalyst 2960-S', 'switch', 760, 200, {
      up: ['Fa0/1', 'Fa0/2', 'Fa0/3'],
    }),
    mkNode('fo-pc1', 'USER-1', 'linux', 'Debian 12 (Bookworm)', 'pc', 980, 140, {
      ips: { eth1: '192.168.20.10/24' },
      up: ['eth1'],
    }),
    mkNode('fo-pc2', 'USER-2', 'linux', 'Ubuntu Server 22.04 LTS', 'pc', 980, 280, {
      ips: { eth1: '192.168.20.20/24' },
      up: ['eth1'],
    }),
  ],
  edges: [
    { id: 'fo-e1', sourceNodeId: 'fo-isp1', sourcePortId: 'ether2', targetNodeId: 'fo-edge', targetPortId: 'ether1', cableType: 'copper_straight' },
    { id: 'fo-e2', sourceNodeId: 'fo-isp2', sourcePortId: 'ether2', targetNodeId: 'fo-edge', targetPortId: 'ether2', cableType: 'copper_straight' },
    { id: 'fo-e3', sourceNodeId: 'fo-edge', sourcePortId: 'ether3', targetNodeId: 'fo-sw', targetPortId: 'Fa0/1', cableType: 'copper_straight' },
    { id: 'fo-e4', sourceNodeId: 'fo-sw', sourcePortId: 'Fa0/2', targetNodeId: 'fo-pc1', targetPortId: 'eth1', cableType: 'copper_straight' },
    { id: 'fo-e5', sourceNodeId: 'fo-sw', sourcePortId: 'Fa0/3', targetNodeId: 'fo-pc2', targetPortId: 'eth1', cableType: 'copper_straight' },
  ],
});

// ── Lab 9: Inter-VLAN + DHCP + Internet Gateway ────────────────
const lab9 = (): LabProject => ({
  version: '1.0',
  metadata: {
    name: 'Lab 9: Inter-VLAN + DHCP + Gateway',
    author: 'NetLab Advanced',
    description: 'Router-on-a-stick + VLAN 10 (STAFF), VLAN 20 (GUEST), VLAN 30 (IT). Router jadi DHCP server per-VLAN + gateway ke internet. Sangat umum buat latihan.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  viewport: { x: 40, y: 100, zoom: 0.95 },
  nodes: [
    mkNode('iv-gw', 'GW-ROAS', 'cisco_ios', 'ISR 4331', 'router', 160, 280, {
      ips: { 'Gi0/0/0.10': '10.10.10.1/24', 'Gi0/0/0.20': '10.10.20.1/24', 'Gi0/0/0.30': '10.10.30.1/24' },
      up: ['Gi0/0/0'],
    }),
    mkNode('iv-sw', 'SW-CORE-L2', 'cisco_ios', 'Catalyst 3560', 'switch', 520, 280, {
      up: ['Gi0/1', 'Gi0/2', 'Gi0/3', 'Gi0/4'],
    }),
    mkNode('iv-pc1', 'STAFF-PC', 'linux', 'Debian 12 (Bookworm)', 'pc', 820, 140, {
      up: ['eth1'],
    }),
    mkNode('iv-pc2', 'GUEST-PC', 'linux', 'Ubuntu Server 22.04 LTS', 'pc', 820, 280, {
      up: ['eth1'],
    }),
    mkNode('iv-pc3', 'IT-PC', 'linux', 'Alpine Linux', 'pc', 820, 420, {
      up: ['eth1'],
    }),
  ],
  edges: [
    { id: 'iv-e1', sourceNodeId: 'iv-gw', sourcePortId: 'Gi0/0/0', targetNodeId: 'iv-sw', targetPortId: 'Gi0/1', cableType: 'copper_straight' },
    { id: 'iv-e2', sourceNodeId: 'iv-sw', sourcePortId: 'Gi0/2', targetNodeId: 'iv-pc1', targetPortId: 'eth1', cableType: 'copper_straight' },
    { id: 'iv-e3', sourceNodeId: 'iv-sw', sourcePortId: 'Gi0/3', targetNodeId: 'iv-pc2', targetPortId: 'eth1', cableType: 'copper_straight' },
    { id: 'iv-e4', sourceNodeId: 'iv-sw', sourcePortId: 'Gi0/4', targetNodeId: 'iv-pc3', targetPortId: 'eth1', cableType: 'copper_straight' },
  ],
});



// ── Lab 11: Windows Client + Dual-ISP Load Balancing + NetSpeedTest GUI ──
const lab11 = (): LabProject => ({
  version: '1.0',
  metadata: {
    name: 'Lab 11: Windows Dual-ISP LB + NetSpeedTest GUI',
    author: 'NetLab Advanced',
    description: 'Windows 11 client sebagai main client, Dual-WAN MikroTik Edge (Load Balancing), 2 ISP, Switch LAN, Linux iPerf Server di sisi ISP buat simulasi throughput & tes GUI via NetSpeedTest.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  viewport: { x: 40, y: 80, zoom: 0.9 },
  nodes: [
    mkNode('wlb-isp1', 'ISP-1', 'mikrotik', 'RB3011UiAS-RM', 'router', 80, 140, {
      ips: { ether1: '100.64.1.1/30', ether2: '10.10.12.1/30' },
      up: ['ether1', 'ether2'],
    }),
    mkNode('wlb-isp2', 'ISP-2', 'mikrotik', 'RB3011UiAS-RM', 'router', 80,420, {
      ips: { ether1: '100.64.2.1/30', ether2: '10.10.23.1/30' },
      up: ['ether1', 'ether2'],
    }),
    mkNode('wlb-edge', 'EDGE-RTR (LB)', 'mikrotik', 'CCR1009-7G-1C-1S+', 'router', 420,280, {
      ips: { ether1: '10.10.12.2/30', ether2: '10.10.23.2/30', ether3: '192.168.10.1/24' },
      up: ['ether1, ether2, ether3'],
    }),
    mkNode('wlb-srv', 'IPERF-SERVER', 'linux', 'Debian 12 (Bookworm)', 'server', 80,280, {
      ips: { eth1: '10.10.99.100/24' },
      up: ['eth1'],
    }),
    mkNode('wlb-sw', 'CORE-SW', 'cisco_ios', 'Catalyst 2960-X', 'switch', 720,280, {
      up: ['Gi0/1', 'Gi0/2', 'Gi0/3', 'Gi0/4', 'Gi0/5'],
    }),
    mkNode('wlb-win', 'WIN-LB-CLIENT', 'windows', 'Windows 11 Pro', 'pc', 980,160, {
      ips: { Ethernet: '192.168.10.50/24' },
      up: ['Ethernet'],
    }),
    mkNode('wlb-pc1', 'LINUX-CLIENT-1', 'linux', 'Debian 12 (Bookworm)', 'pc', 980,280, {
      ips: { eth1: '192.168.10.11/24' },
      up: ['eth1'],
    }),
    mkNode('wlb-pc2', 'LINUX-CLIENT-2', 'linux', 'Ubuntu Server 22.04 LTS', 'pc', 980,400, {
      ips: { eth1: '192.168.10.12/24' },
      up: ['eth1'],
    }),
  ],
  edges: [
    { id: 'wlb-e1', sourceNodeId: 'wlb-isp1', sourcePortId: 'ether2', targetNodeId: 'wlb-edge', targetPortId: 'ether1', cableType: 'copper_straight' },
    { id: 'wlb-e2', sourceNodeId: 'wlb-isp2', sourcePortId: 'ether2', targetNodeId: 'wlb-edge', targetPortId: 'ether2', cableType: 'copper_straight' },
    { id: 'wlb-e3', sourceNodeId: 'wlb-edge', sourcePortId: 'ether3', targetNodeId: 'wlb-sw', targetPortId: 'Gi0/1', cableType: 'copper_straight' },
    { id: 'wlb-e7', sourceNodeId: 'wlb-isp1', sourcePortId: 'ether1', targetNodeId: 'wlb-srv', targetPortId: 'eth1', cableType: 'copper_straight' },
    { id: 'wlb-e8', sourceNodeId: 'wlb-isp2', sourcePortId: 'ether1', targetNodeId: 'wlb-srv', targetPortId: 'eth1', cableType: 'copper_cross' },
    { id: 'wlb-e4', sourceNodeId: 'wlb-sw', sourcePortId: 'Gi0/2', targetNodeId: 'wlb-win', targetPortId: 'Ethernet', cableType: 'copper_straight' },
    { id: 'wlb-e5', sourceNodeId: 'wlb-sw', sourcePortId: 'Gi0/3', targetNodeId: 'wlb-pc1', targetPortId: 'eth1', cableType: 'copper_straight' },
    { id: 'wlb-e6', sourceNodeId: 'wlb-sw', sourcePortId: 'Gi0/4', targetNodeId: 'wlb-pc2', targetPortId: 'eth1', cableType: 'copper_straight' },
  ],
});


export const PRESET_LABS: PresetLab[] = [
  {
    id: 'lab-basic-gateway',
    title: 'Lab 1: Internet Gateway & DHCP',
    short: '1 Router · 1 Switch · 2 PC',
    description: 'Router gateway + DHCP server + 2 PC klien. Latihan dasar IP & DHCP.',
    category: 'gateway',
    difficulty: 'Mudah',
    features: ['DHCP Server', 'Default Route', 'NAT dasar', 'IP Addressing'],
    topologySummary: 'Router-GW ── Switch-Access ── PC-1 / PC-2 (DHCP)',
    build: lab1,
  },
  {
    id: 'lab-inter-vlan',
    title: 'Lab 2: Inter-VLAN Routing & Trunk',
    short: '1 Router · 1 Switch · 3 PC',
    description: 'Router-on-a-stick + trunk, 3 VLAN terpisah dengan routing antar VLAN.',
    category: 'switching',
    difficulty: 'Sedang',
    features: ['VLAN 10/20/30', 'Trunking', 'Subinterface', 'Inter-VLAN'],
    topologySummary: 'Router-IVR ⇢[trunk]⇢ SW-L2 ── PC VLAN 10/20/30',
    build: lab2,
  },
  {
    id: 'lab-dual-isp',
    title: 'Lab 3: Dual-ISP Load Balancing & Failover',
    short: '2 ISP · 1 Router · 1 Switch · 2 PC',
    description: 'Dua koneksi ISP dengan default route ganda — load balancing & failover WAN.',
    category: 'wan',
    difficulty: 'Lanjut',
    features: ['Default Route Ganda', 'Failover', 'NAT Masquerade', 'ECMP'],
    topologySummary: 'ISP-1/ISP-2 ── Main-Router ── SW-LAN ── PC-1 / PC-2',
    build: lab3,
  },
  {
    id: 'lab-ospf-ring',
    title: 'Lab 4: Dynamic Routing OSPF Multi-Router',
    short: '3 Router · 2 PC',
    description: 'Ring 3 router Cisco + OSPF area 0, LAN masing-masing — routing dinamis.',
    category: 'routing',
    difficulty: 'Lanjut',
    features: ['OSPF Area 0', 'Adjacency', 'Route Learning', 'Dynamic Routing'],
    topologySummary: 'R1 ─ R2 ─ R3 ─ (kembali ke) R1 — ring OSPF',
    build: lab4,
  },  {
    id: 'lab-lb-iperf',
    title: 'Lab 6: Dual-ISP Load Balancing + iPerf',
    short: '2 ISP · 1 Edge · 3 Clients · iPerf Server',
    description: 'Dual-WAN PCC style + iPerf Server buat test bandwidth/load share. Sangat pas buat validasi load balancing beneran.',
    category: 'gateway',
    difficulty: 'Lanjut',
    features: ['Dual-ISP', 'Load Balancing', 'PCC/Policy Routing', 'NAT', 'iPerf/Bandwidth Test'],
    topologySummary: 'ISP1/ISP2 ── EDGE-LB ── SW ── CLIENT-1/2/3 | iPerf-SERVER via ISP',
    build: lab6,
  },
  {
    id: 'lab-ecmp',
    title: 'Lab 7: ECMP Load Balancing',
    short: '2 Equal Paths · Multi-Router',
    description: 'Equal-Cost Multi-Path ke internet. Bandingin behavior vs PCC. Bisa cek per-flow vs per-packet.',
    category: 'routing',
    difficulty: 'Lanjut',
    features: ['ECMP', 'OSPF/Static Equal Cost', 'Hash-based Load Share', 'Bandwidth Test'],
    topologySummary: 'LAN ── EDGE ──(2x equal)── ISP-R1/R2 ── INTERNET-NET',
    build: lab7,
  },
  {
    id: 'lab-wan-failover',
    title: 'Lab 8: WAN Failover (Primary/Backup)',
    short: 'Primary/Backup WAN · Auto-Switch',
    description: 'Hanya jalur utama yang dipake, otomatis failover ke backup kalo primary down. Cocok simulasi ISP outage.',
    category: 'gateway',
    difficulty: 'Sedang',
    features: ['WAN Failover', 'Route Tracking', 'Default Route Backup', 'Redundancy'],
    topologySummary: 'LAN ── EDGE-FAILOVER ── ISP-PRIMARY | ISP-BACKUP (standby)',
    build: lab8,
  },
  {
    id: 'lab-vlan-dhcp-gw',
    title: 'Lab 9: Inter-VLAN + DHCP + Gateway',
    short: 'Router-on-a-Stick · 3 VLAN',
    description: 'VLAN terpisah + DHCP per-VLAN + routing antar VLAN + siap outbound. Praktis & umum dipake.',
    category: 'switching',
    difficulty: 'Sedang',
    features: ['Inter-VLAN Routing', '802.1Q Trunk', 'DHCP Pool per VLAN', 'Router-on-a-Stick'],
    topologySummary: 'GW-ROAS(trunk) ── SW ── VLAN10/20/30',
    build: lab9,
  },  {
    id: 'lab-windows-lb-iperf-gui',
    title: 'Lab 11: Windows Dual-ISP LB + NetSpeedTest GUI',
    short: '2 ISP · Windows 11 · iPerf Server · 3 Clients',
    description: 'Windows 11 client buka NetSpeedTest GUI buat tes bandwidth ke server, barengan client Linux & dual-WAN load balancing.',
    category: 'gateway',
    difficulty: 'Lanjut',
    features: ['Dual-ISP', 'Load Balancing', 'Windows GUI', 'NetSpeedTest', 'iPerf/Bandwidth Test'],
    topologySummary: 'ISP1/ISP2 ── EDGE-LB ── SW ── WIN-LB-CLIENT + LINUX CLIENTS | IPERF-SERVER',
    build: lab11,
  },
];

export function getPresetLab(id: string): PresetLab | undefined {
  return PRESET_LABS.find((l) => l.id === id);
}