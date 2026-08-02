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
    mkNode('isp-a-edge', 'ISP-A-Edge', 'juniper', 'MX480', 'router', 120, 120, {
      ips: { 'ge-0/0/1': '172.16.0.1/30' }
    }),
    mkNode('isp-b-edge', 'ISP-B-Edge', 'cisco_ios', 'ASR 900 Series', 'router', 980, 120, {
      ips: { 'Gi0/0/0': '172.16.0.9/30' }
    }),
    mkNode('isp-c-edge', 'ISP-C-Edge', 'huawei', 'AR3260', 'router', 560, 120, {
      ips: { 'GigabitEthernet0/0/1': '172.16.0.5/30' }
    }),
    // ── Perimeter DC ───────────────────────────────────────────
    mkNode('dc-fw', 'DC-Firewall', 'fortinet', 'FortiGate 60E', 'firewall', 120, 300, {
      ips: { port1: '172.16.0.2/30' },
      up: ['port2']
    }),
    mkNode('dc-core-1', 'DC-Core-SW1', 'cisco_nxos', 'Nexus 93180YC-EX', 'switch', 380, 300, {
      ips: { 'Eth1/1': '172.16.0.6/30' },
      up: ['Eth1/2', 'Eth1/3', 'Eth1/4', 'Eth1/5']
    }),
    mkNode('dc-core-2', 'DC-Core-SW2', 'cisco_nxos', 'Nexus 9364C', 'switch', 760, 300, {
      up: ['Eth1/1', 'Eth1/2', 'Eth1/3']
    }),
    // ── Distribution ───────────────────────────────────────────
    mkNode('dc-dist-1', 'DC-Dist-SW1', 'cisco_ios', 'Catalyst 9200', 'switch', 140, 480, {
      up: ['Gi1/0/1', 'Gi1/0/2', 'Gi1/0/3']
    }),
    mkNode('dc-dist-2', 'DC-Dist-SW2', 'aruba', 'Aruba 6300M-48G4X', 'switch', 460, 480, {
      up: ['1/1/1', '1/1/2', '1/1/3']
    }),
    mkNode('dc-dist-3', 'DC-Dist-SW3', 'huawei', 'S5720', 'switch', 780, 480, {
      up: ['GigabitEthernet0/0/1', 'GigabitEthernet0/0/2']
    }),
    // ── Access ─────────────────────────────────────────────────
    mkNode('acc-a1', 'Access-A1', 'cisco_ios', 'Catalyst 2960-X', 'switch', 100, 640, {
      up: ['Gi0/1', 'Gi0/2']
    }),
    mkNode('acc-a2', 'Access-A2', 'aruba', 'Aruba 2930F', 'switch', 360, 640, {
      up: ['1/1/1', '1/1/2']
    }),
    mkNode('acc-a3', 'Access-A3', 'mikrotik', 'CRS326-24G-2S+', 'switch', 640, 640, {
      up: ['ether1', 'ether2', 'ether3', 'ether4']
    }),
    // ── Server & pelanggan ─────────────────────────────────────
    mkNode('srv-1', 'Server-Web', 'linux', 'Ubuntu Server 22.04 LTS', 'server', 100, 800, {
      ips: { eth1: '10.1.10.10/24' }
    }),
    mkNode('srv-2', 'Server-DB', 'linux', 'Debian 12 (Bookworm)', 'server', 360, 800, {
      ips: { eth1: '10.1.10.11/24' }
    }),
    mkNode('cust-gw', 'Customer-GW', 'ubiquiti', 'EdgeRouter 4', 'router', 980, 640, {
      ips: { eth0: '10.1.20.1/24', eth1: '172.16.0.10/30' }
    }),
    mkNode('cust-pc', 'Customer-PC', 'linux', 'Debian 12 (Bookworm)', 'pc', 980, 800, {
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
