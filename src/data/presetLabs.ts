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
    mkNode('lab2-rtr', 'Router-IVR', 'cisco_ios', 'ISR 4321', 'router', 140, 220, {
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
    mkNode('lab2-pc30', 'PC-VLAN30', 'linux', 'Debian 11 (Bullseye)', 'pc', 820, 370, {
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
    mkNode('lab3-isp1', 'ISP-1', 'mikrotik', 'CCR2004-1G-12S+2XS', 'router', 140, 140, {
      ips: { ether1: '10.0.0.1/30' },
    }),
    mkNode('lab3-isp2', 'ISP-2', 'mikrotik', 'CCR2004-1G-12S+2XS', 'router', 140, 400, {
      ips: { ether1: '10.0.1.1/30' },
    }),
    mkNode('lab3-main', 'Main-Router', 'mikrotik', 'RB4011iGS+', 'router', 480, 260, {
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
    mkNode('lab4-r1', 'R1', 'cisco_ios', 'ISR 4321', 'router', 140, 140, {
      ips: { 'Gi0/0/0': '10.0.12.1/30', 'Gi0/0/1': '10.0.13.1/30', 'Gi0/0/2': '192.168.10.1/24' },
    }),
    mkNode('lab4-r2', 'R2', 'cisco_ios', 'ISR 4331', 'router', 660, 140, {
      ips: { 'Gi0/0/0': '10.0.12.2/30', 'Gi0/0/1': '10.0.23.2/30', 'Gi0/0/2': '192.168.20.1/24' },
    }),
    mkNode('lab4-r3', 'R3', 'cisco_ios', 'ISR 4321', 'router', 660, 480, {
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
  },
];

export function getPresetLab(id: string): PresetLab | undefined {
  return PRESET_LABS.find((l) => l.id === id);
}