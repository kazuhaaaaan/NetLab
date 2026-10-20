import { LabProject, LabNode, VendorType } from '../types';
import { getPortsForModel } from './deviceModels';

/** Bangun node template dengan port asli model (getPortsForModel) + IP/status tambahan. */
function mkNode(
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

/** Template mudah: 1 router + 1 switch + 1 PC. */
export const TEMPLATE_BASIC: LabProject = {
  version: '1.0',
  metadata: {
    name: 'Mudah: Router + Switch + PC',
    author: 'KazuDev',
    description: 'Topologi sederhana: MikroTik RouterOS sebagai gateway, switch Cisco Catalyst, dan satu PC Debian.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  viewport: { x: 100, y: 100, zoom: 1.0 },
  nodes: [
    mkNode('node-1', 'MikroTik-GW', 'mikrotik', 'RB3011UiAS-RM', 'router', 180, 160, {
      ips: { ether1: '192.168.88.1/24' },
      up: ['ether2']
    }),
    mkNode('node-2', 'Cisco-SW', 'cisco_ios', 'Catalyst 2960-X', 'switch', 560, 160, {
      up: ['Gi0/1', 'Gi0/2']
    }),
    mkNode('node-3', 'PC-1', 'linux', 'Debian 12 (Bookworm)', 'pc', 940, 160, {
      ips: { eth1: '192.168.88.10/24' }
    })
  ],
  edges: [
    {
      id: 'edge-1',
      sourceNodeId: 'node-1',
      sourcePortId: 'ether2',
      targetNodeId: 'node-2',
      targetPortId: 'Gi0/1',
      cableType: 'copper_straight'
    },
    {
      id: 'edge-2',
      sourceNodeId: 'node-2',
      sourcePortId: 'Gi0/2',
      targetNodeId: 'node-3',
      targetPortId: 'eth1',
      cableType: 'copper_straight'
    }
  ]
};

/** Template besar: ISP + Data Center (16 perangkat, 17 kabel). */
export const TEMPLATE_ENTERPRISE: LabProject = {
  version: '1.0',
  metadata: {
    name: 'ISP / Data Center Lab',
    author: 'KazuDev',
    description:
      'Topologi lengkap: 3 router ISP (Juniper/Cisco/Huawei), firewall FortiGate, core Nexus 9K, distribution & access switch, server, dan gateway pelanggan.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  viewport: { x: 40, y: 40, zoom: 0.85 },
  nodes: [
    // ── Tier ISP ───────────────────────────────────────────────
    mkNode('isp-a-edge', 'ISP-A-Edge', 'juniper', 'MX480', 'router', 140, 100, {
      ips: { 'ge-0/0/1': '172.16.0.1/30' }
    }),
    mkNode('isp-c-edge', 'ISP-C-Edge', 'huawei', 'AR3260', 'router', 420, 100, {
      ips: { 'GigabitEthernet0/0/1': '172.16.0.5/30' }
    }),
    mkNode('isp-b-edge', 'ISP-B-Edge', 'cisco_ios', 'ASR 900 Series', 'router', 980, 100, {
      ips: { 'Gi0/0/0': '172.16.0.9/30' }
    }),
    // ── Perimeter DC ───────────────────────────────────────────
    mkNode('dc-fw', 'DC-Firewall', 'fortinet', 'FortiGate 60E', 'firewall', 140, 280, {
      ips: { port1: '172.16.0.2/30' },
      up: ['port2']
    }),
    mkNode('dc-core-1', 'DC-Core-SW1', 'cisco_nxos', 'Nexus 93180YC-EX', 'switch', 420, 280, {
      ips: { 'Eth1/1': '172.16.0.6/30' },
      up: ['Eth1/2', 'Eth1/3', 'Eth1/4', 'Eth1/5']
    }),
    mkNode('dc-core-2', 'DC-Core-SW2', 'cisco_nxos', 'Nexus 9364C', 'switch', 700, 280, {
      up: ['Eth1/1', 'Eth1/2', 'Eth1/3']
    }),
    // ── Distribution ───────────────────────────────────────────
    mkNode('dc-dist-1', 'DC-Dist-SW1', 'cisco_ios', 'Catalyst 9200', 'switch', 140, 460, {
      up: ['Gi1/0/1', 'Gi1/0/2', 'Gi1/0/3']
    }),
    mkNode('dc-dist-2', 'DC-Dist-SW2', 'aruba', 'Aruba 6300M-48G4X', 'switch', 420, 460, {
      up: ['1/1/1', '1/1/2', '1/1/3']
    }),
    mkNode('dc-dist-3', 'DC-Dist-SW3', 'huawei', 'S5720', 'switch', 700, 460, {
      up: ['GigabitEthernet0/0/1', 'GigabitEthernet0/0/2']
    }),
    // ── Access ─────────────────────────────────────────────────
    mkNode('acc-a1', 'Access-A1', 'cisco_ios', 'Catalyst 2960-X', 'switch', 140, 640, {
      up: ['Gi0/1', 'Gi0/2']
    }),
    mkNode('acc-a2', 'Access-A2', 'aruba', 'Aruba 2930F', 'switch', 420, 640, {
      up: ['1/1/1', '1/1/2']
    }),
    mkNode('acc-a3', 'Access-A3', 'mikrotik', 'CRS326-24G-2S+', 'switch', 700, 640, {
      up: ['ether1', 'ether2', 'ether3', 'ether4']
    }),
    // ── Server & pelanggan ─────────────────────────────────────
    mkNode('srv-1', 'Server-Web', 'linux', 'Ubuntu Server 22.04 LTS', 'server', 140, 820, {
      ips: { eth1: '10.1.10.10/24' }
    }),
    mkNode('srv-2', 'Server-DB', 'linux', 'Debian 12 (Bookworm)', 'server', 420, 820, {
      ips: { eth1: '10.1.10.11/24' }
    }),
    mkNode('cust-gw', 'Customer-GW', 'ubiquiti', 'EdgeRouter 4', 'router', 980, 640, {
      ips: { eth0: '10.1.20.1/24', eth1: '172.16.0.10/30' }
    }),
    mkNode('cust-pc', 'Customer-PC', 'linux', 'Debian 12 (Bookworm)', 'pc', 980, 820, {
      ips: { eth1: '10.1.20.10/24' }
    })
  ],
  edges: [
    // ISP ↔ perimeter
    { id: 'e-1', sourceNodeId: 'isp-a-edge', sourcePortId: 'ge-0/0/1', targetNodeId: 'dc-fw', targetPortId: 'port1', cableType: 'copper_straight' },
    { id: 'e-2', sourceNodeId: 'isp-b-edge', sourcePortId: 'Gi0/0/0', targetNodeId: 'cust-gw', targetPortId: 'eth1', cableType: 'copper_straight' },
    { id: 'e-3', sourceNodeId: 'isp-c-edge', sourcePortId: 'GigabitEthernet0/0/1', targetNodeId: 'dc-core-1', targetPortId: 'Eth1/1', cableType: 'fiber' },
    // Perimeter → core
    { id: 'e-4', sourceNodeId: 'dc-fw', sourcePortId: 'port2', targetNodeId: 'dc-core-1', targetPortId: 'Eth1/2', cableType: 'copper_straight' },
    // Core spine
    { id: 'e-5', sourceNodeId: 'dc-core-1', sourcePortId: 'Eth1/3', targetNodeId: 'dc-core-2', targetPortId: 'Eth1/1', cableType: 'fiber' },
    { id: 'e-6', sourceNodeId: 'dc-core-1', sourcePortId: 'Eth1/4', targetNodeId: 'dc-dist-1', targetPortId: 'Gi1/0/1', cableType: 'fiber' },
    { id: 'e-7', sourceNodeId: 'dc-core-1', sourcePortId: 'Eth1/5', targetNodeId: 'dc-dist-2', targetPortId: '1/1/1', cableType: 'fiber' },
    { id: 'e-8', sourceNodeId: 'dc-core-2', sourcePortId: 'Eth1/2', targetNodeId: 'dc-dist-2', targetPortId: '1/1/2', cableType: 'fiber' },
    { id: 'e-9', sourceNodeId: 'dc-core-2', sourcePortId: 'Eth1/3', targetNodeId: 'dc-dist-3', targetPortId: 'GigabitEthernet0/0/1', cableType: 'fiber' },
    // Distribution → access
    { id: 'e-10', sourceNodeId: 'dc-dist-1', sourcePortId: 'Gi1/0/2', targetNodeId: 'acc-a1', targetPortId: 'Gi0/1', cableType: 'copper_straight' },
    { id: 'e-11', sourceNodeId: 'dc-dist-1', sourcePortId: 'Gi1/0/3', targetNodeId: 'acc-a2', targetPortId: '1/1/1', cableType: 'copper_straight' },
    { id: 'e-12', sourceNodeId: 'dc-dist-2', sourcePortId: '1/1/3', targetNodeId: 'acc-a3', targetPortId: 'ether1', cableType: 'copper_straight' },
    { id: 'e-13', sourceNodeId: 'dc-dist-3', sourcePortId: 'GigabitEthernet0/0/2', targetNodeId: 'acc-a3', targetPortId: 'ether2', cableType: 'copper_straight' },
    // Access → server & pelanggan
    { id: 'e-14', sourceNodeId: 'acc-a1', sourcePortId: 'Gi0/2', targetNodeId: 'srv-1', targetPortId: 'eth1', cableType: 'copper_straight' },
    { id: 'e-15', sourceNodeId: 'acc-a2', sourcePortId: '1/1/2', targetNodeId: 'srv-2', targetPortId: 'eth1', cableType: 'copper_straight' },
    { id: 'e-16', sourceNodeId: 'acc-a3', sourcePortId: 'ether3', targetNodeId: 'cust-gw', targetPortId: 'eth0', cableType: 'copper_straight' },
    { id: 'e-17', sourceNodeId: 'acc-a3', sourcePortId: 'ether4', targetNodeId: 'cust-pc', targetPortId: 'eth1', cableType: 'copper_straight' }
  ]
};

/** Template kantor kecil: firewall + switch + server + klien Windows. */
export const TEMPLATE_SMALL_OFFICE: LabProject = {
  version: '1.0',
  metadata: {
    name: 'Kantor Kecil: Firewall + Switch + Klien',
    author: 'KazuDev',
    description:
      'Topologi kantor kecil: firewall FortiGate sebagai gateway, switch Cisco akses, server Ubuntu, dan klien Windows 11.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  viewport: { x: 80, y: 80, zoom: 1.0 },
  nodes: [
    mkNode('so-fw', 'Office-FW', 'fortinet', 'FortiGate 60E', 'firewall', 140, 170, {
      ips: { port1: '203.0.113.2/30' },
      up: ['port2']
    }),
    mkNode('so-sw', 'Office-SW', 'cisco_ios', 'Catalyst 2960-X', 'switch', 500, 170, {
      up: ['Gi0/1', 'Gi0/2', 'Gi0/3']
    }),
    mkNode('so-srv', 'Server-App', 'linux', 'Ubuntu Server 22.04 LTS', 'server', 860, 80, {
      ips: { eth1: '192.168.10.10/24' }
    }),
    mkNode('so-win', 'Klien-Win11', 'windows', 'Windows 11 Pro', 'windows-client', 860, 270, {
      ips: { eth0: '192.168.10.20/24' }
    })
  ],
  edges: [
    { id: 'so-e1', sourceNodeId: 'so-fw', sourcePortId: 'port2', targetNodeId: 'so-sw', targetPortId: 'Gi0/1', cableType: 'copper_straight' },
    { id: 'so-e2', sourceNodeId: 'so-sw', sourcePortId: 'Gi0/2', targetNodeId: 'so-srv', targetPortId: 'eth1', cableType: 'copper_straight' },
    { id: 'so-e3', sourceNodeId: 'so-sw', sourcePortId: 'Gi0/3', targetNodeId: 'so-win', targetPortId: 'eth0', cableType: 'copper_straight' }
  ]
};

/** Template wireless: gateway WiFi + switch + 2 klien. */
export const TEMPLATE_WIRELESS: LabProject = {
  version: '1.0',
  metadata: {
    name: 'Wireless: Gateway WiFi + Klien',
    author: 'KazuDev',
    description:
      'MikroTik hAP ac2 sebagai gateway WiFi (wlan1/wlan2 aktif), switch Cisco akses, 1 PC Linux dan 1 klien Windows.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  viewport: { x: 80, y: 80, zoom: 1.0 },
  nodes: [
    mkNode('wl-ap', 'WiFi-Gateway', 'mikrotik', 'hAP ac2', 'wireless', 160, 170, {
      ips: { ether2: '192.168.10.1/24' },
      up: ['ether1', 'wlan1', 'wlan2']
    }),
    mkNode('wl-sw', 'Access-SW', 'cisco_ios', 'Catalyst 2960-X', 'switch', 520, 170, {
      up: ['Gi0/1', 'Gi0/2', 'Gi0/3']
    }),
    mkNode('wl-pc', 'PC-Linux', 'linux', 'Debian 12 (Bookworm)', 'pc', 880, 80, {
      ips: { eth1: '192.168.10.10/24' }
    }),
    mkNode('wl-win', 'Laptop-Win11', 'windows', 'Windows 11 Pro', 'windows-client', 880, 270, {
      ips: { eth0: '192.168.10.20/24' }
    })
  ],
  edges: [
    { id: 'wl-e1', sourceNodeId: 'wl-ap', sourcePortId: 'ether2', targetNodeId: 'wl-sw', targetPortId: 'Gi0/1', cableType: 'copper_straight' },
    { id: 'wl-e2', sourceNodeId: 'wl-sw', sourcePortId: 'Gi0/2', targetNodeId: 'wl-pc', targetPortId: 'eth1', cableType: 'copper_straight' },
    { id: 'wl-e3', sourceNodeId: 'wl-sw', sourcePortId: 'Gi0/3', targetNodeId: 'wl-win', targetPortId: 'eth0', cableType: 'copper_straight' }
  ]
};

/** Template routing lintas vendor: Cisco + Juniper + Huawei + klien. */
export const TEMPLATE_ROUTING: LabProject = {
  version: '1.0',
  metadata: {
    name: 'Routing Lintas Vendor (OSPF)',
    author: 'KazuDev',
    description:
      'Tiga router lintas vendor (Cisco IOS, Juniper Junos, Huawei VRP) saling terhubung dengan PC & server — latihan routing statis/OSPF lintas platform.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  viewport: { x: 60, y: 80, zoom: 1.0 },
  nodes: [
    mkNode('rt-r1', 'R1-Cisco', 'cisco_ios', 'ISR 4331', 'router', 150, 150, {
      ips: { 'Gi0/0/0': '10.0.12.1/30', 'Gi0/0/1': '192.168.10.1/24' }
    }),
    mkNode('rt-r2', 'R2-Juniper', 'juniper', 'SRX300', 'router', 500, 150, {
      ips: { 'ge-0/0/1': '10.0.12.2/30', 'ge-0/0/2': '10.0.23.2/30' }
    }),
    mkNode('rt-r3', 'R3-Huawei', 'huawei', 'AR3260', 'router', 850, 150, {
      ips: { 'GigabitEthernet0/0/1': '10.0.23.3/30', 'GigabitEthernet0/0/2': '192.168.30.1/24' }
    }),
    mkNode('rt-pc', 'PC-Kantor', 'linux', 'Debian 12 (Bookworm)', 'pc', 150, 370, {
      ips: { eth1: '192.168.10.10/24' }
    }),
    mkNode('rt-srv', 'Server-Finance', 'linux', 'Ubuntu Server 22.04 LTS', 'server', 850, 370, {
      ips: { eth1: '192.168.30.10/24' }
    })
  ],
  edges: [
    { id: 'rt-e1', sourceNodeId: 'rt-r1', sourcePortId: 'Gi0/0/0', targetNodeId: 'rt-r2', targetPortId: 'ge-0/0/1', cableType: 'copper_straight' },
    { id: 'rt-e2', sourceNodeId: 'rt-r2', sourcePortId: 'ge-0/0/2', targetNodeId: 'rt-r3', targetPortId: 'GigabitEthernet0/0/1', cableType: 'copper_straight' },
    { id: 'rt-e3', sourceNodeId: 'rt-r1', sourcePortId: 'Gi0/0/1', targetNodeId: 'rt-pc', targetPortId: 'eth1', cableType: 'copper_straight' },
    { id: 'rt-e4', sourceNodeId: 'rt-r3', sourcePortId: 'GigabitEthernet0/0/2', targetNodeId: 'rt-srv', targetPortId: 'eth1', cableType: 'copper_straight' }
  ]
};

export interface TemplateEntry {
  id: string;
  title: string;
  subtitle: string;
  data: LabProject;
}

/** Registry template — dipakai menu Navbar & MobileHeader, load via App.tsx. */
export const TEMPLATES: TemplateEntry[] = [
  {
    id: 'basic',
    title: 'Mudah: Router + Switch + PC',
    subtitle: 'MikroTik gateway, switch Cisco, 1 PC',
    data: TEMPLATE_BASIC
  },
  {
    id: 'office',
    title: 'Kantor Kecil: Firewall + Switch + Klien',
    subtitle: 'FortiGate, switch Cisco, server, Windows 11',
    data: TEMPLATE_SMALL_OFFICE
  },
  {
    id: 'wireless',
    title: 'Wireless: Gateway WiFi + Klien',
    subtitle: 'MikroTik hAP ac2, switch, 2 klien',
    data: TEMPLATE_WIRELESS
  },
  {
    id: 'routing',
    title: 'Routing Lintas Vendor (OSPF)',
    subtitle: 'Cisco + Juniper + Huawei + PC & server',
    data: TEMPLATE_ROUTING
  },
  {
    id: 'enterprise',
    title: 'ISP / Data Center Lab',
    subtitle: '16 perangkat: ISP, firewall, core, server',
    data: TEMPLATE_ENTERPRISE
  }
];

export function getTemplate(id: string): TemplateEntry | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
