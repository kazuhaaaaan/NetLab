// ============================================================
// Tutorial starter labs — dipakai tombol "Try It Yourself" di
// section Tutorial & Getting Started (landing page).
// Setiap lab sengaja setengah-jadi: topologi + kabel sudah rapi,
// tapi konfigurasi IP/rute sengaja dikosongkan supaya user
// menyelesaikan langkah tutorialnya sendiri.
// ============================================================

import { LabProject } from '../types';
import { mkNode } from './presetLabs';

function base(id: string, name: string, description: string, nodes: LabProject['nodes'], edges: LabProject['edges']): LabProject {
  return {
    version: '1.0',
    metadata: {
      name,
      author: 'NetLab Tutorials',
      description,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    viewport: { x: 80, y: 120, zoom: 1.0 },
    nodes,
    edges,
  };
}

export interface TutorialLab {
  id: string;
  title: string;
  /** 1-2 kalimat apa yang akan dikerjakan user di lab ini. */
  mission: string;
  build: () => LabProject;
}

// T2 — Build Your First Network: PC1 ─ SW ─ Router ─ PC2
const tFirstNetwork = (): LabProject =>
  base(
    'tut-first-network',
    'Tutorial: First Network',
    'PC1 melalui switch menuju router, lalu ke PC2. Semua kabel sudah terpasang — sekarang atur IP dan rutenya sendiri.',
    [
      mkNode('t2-pc1', 'PC-1', 'linux', 'Debian 12 (Bookworm)', 'pc', 60, 220),
      mkNode('t2-sw', 'SW-1', 'cisco_ios', 'Catalyst 2960-X', 'switch', 320, 220, { up: ['Gi0/1', 'Gi0/2'] }),
      mkNode('t2-rtr', 'R-1', 'mikrotik', 'RB3011UiAS-RM', 'router', 580, 220),
      mkNode('t2-pc2', 'PC-2', 'linux', 'Ubuntu Server 22.04 LTS', 'pc', 840, 220),
    ],
    [
      { id: 't2-e1', sourceNodeId: 't2-pc1', sourcePortId: 'eth1', targetNodeId: 't2-sw', targetPortId: 'Gi0/1', cableType: 'copper_straight' },
      { id: 't2-e2', sourceNodeId: 't2-sw', sourcePortId: 'Gi0/2', targetNodeId: 't2-rtr', targetPortId: 'ether1', cableType: 'copper_straight' },
      { id: 't2-e3', sourceNodeId: 't2-rtr', sourcePortId: 'ether2', targetNodeId: 't2-pc2', targetPortId: 'eth1', cableType: 'copper_straight' },
    ]
  );

// T4 — VLAN: router-on-a-stick + 2 VLAN
const tVlan = (): LabProject =>
  base(
    'tut-vlan',
    'Tutorial: VLAN & Trunk',
    'Satu switch dengan VLAN 10 dan VLAN 20, trunk ke router untuk inter-VLAN routing. Belum ada VLAN yang dibuat.',
    [
      mkNode('t4-rtr', 'Router-IVR', 'cisco_ios', 'ISR 4331', 'router', 120, 220),
      mkNode('t4-sw', 'SW-L2', 'cisco_ios', 'Catalyst 2960-X', 'switch', 440, 220, { up: ['Gi0/1', 'Gi0/2', 'Gi0/3'] }),
      mkNode('t4-pc10', 'PC-VLAN10', 'linux', 'Debian 12 (Bookworm)', 'pc', 760, 90),
      mkNode('t4-pc20', 'PC-VLAN20', 'linux', 'Ubuntu Server 22.04 LTS', 'pc', 760, 350),
    ],
    [
      { id: 't4-e1', sourceNodeId: 't4-rtr', sourcePortId: 'Gi0/0/0', targetNodeId: 't4-sw', targetPortId: 'Gi0/1', cableType: 'copper_straight' },
      { id: 't4-e2', sourceNodeId: 't4-sw', sourcePortId: 'Gi0/2', targetNodeId: 't4-pc10', targetPortId: 'eth1', cableType: 'copper_straight' },
      { id: 't4-e3', sourceNodeId: 't4-sw', sourcePortId: 'Gi0/3', targetNodeId: 't4-pc20', targetPortId: 'eth1', cableType: 'copper_straight' },
    ]
  );

// T5 — DHCP: router server, PC klien
const tDhcp = (): LabProject =>
  base(
    'tut-dhcp',
    'Tutorial: DHCP Server',
    'Router sebagai DHCP server untuk klien di LAN. Belum ada pool dan belum ada IP router.',
    [
      mkNode('t5-rtr', 'Router-DHCP', 'mikrotik', 'RB3011UiAS-RM', 'router', 160, 220),
      mkNode('t5-sw', 'SW-LAN', 'cisco_ios', 'Catalyst 2960-X', 'switch', 460, 220, { up: ['Gi0/1', 'Gi0/2'] }),
      mkNode('t5-pc', 'PC-Klien', 'linux', 'Debian 12 (Bookworm)', 'pc', 760, 220),
    ],
    [
      { id: 't5-e1', sourceNodeId: 't5-rtr', sourcePortId: 'ether1', targetNodeId: 't5-sw', targetPortId: 'Gi0/1', cableType: 'copper_straight' },
      { id: 't5-e2', sourceNodeId: 't5-sw', sourcePortId: 'Gi0/2', targetNodeId: 't5-pc', targetPortId: 'eth1', cableType: 'copper_straight' },
    ]
  );

// T6 — Static routing: dua jaringan, satu router per sisi
const tStatic = (): LabProject =>
  base(
    'tut-static-routing',
    'Tutorial: Static Routing',
    'Dua LAN (10.0.1.0/24 dan 10.0.2.0/24) dihubungkan dua router lewat link /30. Belum ada rute statis.',
    [
      mkNode('t6-pc1', 'PC-A', 'linux', 'Debian 12 (Bookworm)', 'pc', 40, 220),
      mkNode('t6-r1', 'R-1', 'cisco_ios', 'ISR 4331', 'router', 300, 220),
      mkNode('t6-r2', 'R-2', 'juniper', 'SRX300', 'router', 620, 220),
      mkNode('t6-pc2', 'PC-B', 'linux', 'Ubuntu Server 22.04 LTS', 'pc', 880, 220),
    ],
    [
      { id: 't6-e1', sourceNodeId: 't6-pc1', sourcePortId: 'eth1', targetNodeId: 't6-r1', targetPortId: 'Gi0/0/2', cableType: 'copper_straight' },
      { id: 't6-e2', sourceNodeId: 't6-r1', sourcePortId: 'Gi0/0/0', targetNodeId: 't6-r2', targetPortId: 'ge-0/0/2', cableType: 'copper_straight' },
      { id: 't6-e3', sourceNodeId: 't6-r2', sourcePortId: 'ge-0/0/2', targetNodeId: 't6-pc2', targetPortId: 'eth1', cableType: 'copper_straight' },
    ]
  );

// T7 — OSPF: ring tiga router
const tOspf = (): LabProject =>
  base(
    'tut-ospf',
    'Tutorial: OSPF',
    'Tiga router (Cisco, MikroTik, Huawei) dalam ring — OSPF area 0 akan membagikan rute LAN secara dinamis.',
    [
      mkNode('t7-r1', 'R1-Cisco', 'cisco_ios', 'ISR 4331', 'router', 180, 120),
      mkNode('t7-r2', 'R2-MikroTik', 'mikrotik', 'RB3011UiAS-RM', 'router', 640, 120),
      mkNode('t7-r3', 'R3-Huawei', 'huawei', 'AR6120', 'router', 640, 460),
      mkNode('t7-pc', 'PC-LAN', 'linux', 'Debian 12 (Bookworm)', 'pc', 180, 460),
    ],
    [
      { id: 't7-e1', sourceNodeId: 't7-r1', sourcePortId: 'Gi0/0/0', targetNodeId: 't7-r2', targetPortId: 'ether1', cableType: 'copper_straight' },
      { id: 't7-e2', sourceNodeId: 't7-r2', sourcePortId: 'ether2', targetNodeId: 't7-r3', targetPortId: 'GigabitEthernet0/0/2', cableType: 'copper_straight' },
      { id: 't7-e3', sourceNodeId: 't7-r3', sourcePortId: 'GigabitEthernet0/0/2', targetNodeId: 't7-r1', targetPortId: 'Gi0/0/1', cableType: 'copper_straight' },
      { id: 't7-e4', sourceNodeId: 't7-r1', sourcePortId: 'Gi0/0/2', targetNodeId: 't7-pc', targetPortId: 'eth1', cableType: 'copper_straight' },
    ]
  );

// T8 — BGP: eBGP dua AS
const tBgp = (): LabProject =>
  base(
    'tut-bgp',
    'Tutorial: BGP (eBGP)',
    'Dua AS (65001 dan 65002) saling bertukar prefix melalui eBGP. Belum ada konfigurasi BGP sama sekali.',
    [
      mkNode('t8-r1', 'R-AS65001', 'cisco_ios', 'ISR 4331', 'router', 200, 220),
      mkNode('t8-r2', 'R-AS65002', 'huawei', 'AR6120', 'router', 700, 220),
    ],
    [
      { id: 't8-e1', sourceNodeId: 't8-r1', sourcePortId: 'Gi0/0/0', targetNodeId: 't8-r2', targetPortId: 'GigabitEthernet0/0/2', cableType: 'copper_straight' },
    ]
  );

// T9 — NAT: LAN privat → router NAT → WAN
const tNat = (): LabProject =>
  base(
    'tut-nat',
    'Tutorial: NAT / Masquerade',
    'LAN privat (192.168.1.0/24) keluar lewat router dengan NAT masquerade menuju WAN (203.0.113.0/30).',
    [
      mkNode('t9-pc', 'PC-LAN', 'linux', 'Debian 12 (Bookworm)', 'pc', 60, 220),
      mkNode('t9-rtr', 'Router-NAT', 'mikrotik', 'RB3011UiAS-RM', 'router', 320, 220),
      mkNode('t9-isp', 'Router-WAN', 'mikrotik', 'CCR2004-1G-12S+2XS', 'router', 640, 220),
    ],
    [
      { id: 't9-e1', sourceNodeId: 't9-pc', sourcePortId: 'eth1', targetNodeId: 't9-rtr', targetPortId: 'ether1', cableType: 'copper_straight' },
      { id: 't9-e2', sourceNodeId: 't9-rtr', sourcePortId: 'ether2', targetNodeId: 't9-isp', targetPortId: 'ether1', cableType: 'copper_straight' },
    ]
  );

export const TUTORIAL_LABS: TutorialLab[] = [
  { id: 'tut-first-network', title: 'Build Your First Network', mission: 'Atur IP di PC1–PC2 dan router, lalu buat PC1 bisa ping PC2.', build: tFirstNetwork },
  { id: 'tut-vlan', title: 'VLAN & Inter-VLAN Routing', mission: 'Buat VLAN 10 & 20, jadikan port trunk, lalu routing antar VLAN.', build: tVlan },
  { id: 'tut-dhcp', title: 'DHCP Server', mission: 'Konfigurasi DHCP pool di router, lalu klien mengambil lease.', build: tDhcp },
  { id: 'tut-static-routing', title: 'Static Routing', mission: 'Pasang IP di kedua router dan hubungkan dua LAN dengan rute statis.', build: tStatic },
  { id: 'tut-ospf', title: 'OSPF Multi-Vendor', mission: 'Nyalakan OSPF area 0 di ketiga router dan lihat rute belajar sendiri.', build: tOspf },
  { id: 'tut-bgp', title: 'BGP eBGP', mission: 'Konfigurasi BGP di kedua AS dan lihat adjacency Established.', build: tBgp },
  { id: 'tut-nat', title: 'NAT & Masquerade', mission: 'Pasang NAT masquerade agar PC LAN bisa menjangkau WAN.', build: tNat },
];

export function getTutorialLab(id: string): TutorialLab | undefined {
  return TUTORIAL_LABS.find((l) => l.id === id);
}
