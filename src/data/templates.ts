import { LabProject } from '../types';

export const TEMPLATE_BASIC: LabProject = {
  version: '1.0',
  metadata: {
    name: 'Enterprise Multi-Vendor Core Lab',
    author: 'MikroLab Architect',
    description: 'In-browser enterprise lab featuring MikroTik RouterOS, Cisco IOS, and Juniper JunOS.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  viewport: { x: 100, y: 100, zoom: 1.0 },
  nodes: [
    {
      id: 'node-1',
      name: 'MikroTik-GW',
      vendor: 'mikrotik',
      model: 'RB3011UiAS-RM',
      deviceType: 'router',
      position: { x: 180, y: 160 },
      ports: [
        { id: 'ether1', name: 'ether1', speedMbps: 1000, status: 'up', ipAddress: '192.168.88.1/24', macAddress: 'E4:8D:8C:01:02:01' },
        { id: 'ether2', name: 'ether2', speedMbps: 1000, status: 'up', ipAddress: '10.0.0.1/30', macAddress: 'E4:8D:8C:01:02:02' },
        { id: 'sfp1', name: 'sfp1', speedMbps: 1250, status: 'down', macAddress: 'E4:8D:8C:01:02:03' }
      ]
    },
    {
      id: 'node-2',
      name: 'Cisco-Core-SW',
      vendor: 'cisco_ios',
      model: 'Catalyst 2960-X',
      deviceType: 'switch',
      position: { x: 500, y: 160 },
      ports: [
        { id: 'gi0_1', name: 'Gi0/1', speedMbps: 1000, status: 'up', macAddress: '00:1B:D4:11:22:01' },
        { id: 'gi0_2', name: 'Gi0/2', speedMbps: 1000, status: 'up', macAddress: '00:1B:D4:11:22:02' },
        { id: 'fa0_1', name: 'Fa0/1', speedMbps: 100, status: 'up', macAddress: '00:1B:D4:11:22:03' }
      ]
    },
    {
      id: 'node-3',
      name: 'Juniper-MX240',
      vendor: 'juniper',
      model: 'MX240',
      deviceType: 'router',
      position: { x: 800, y: 160 },
      ports: [
        { id: 'ge0_0_0', name: 'ge-0/0/0', speedMbps: 1000, status: 'up', ipAddress: '10.0.0.2/30', macAddress: '2C:6B:F5:AA:BB:01' },
        { id: 'ge0_0_1', name: 'ge-0/0/1', speedMbps: 1000, status: 'down', macAddress: '2C:6B:F5:AA:BB:02' }
      ]
    }
  ],
  edges: [
    {
      id: 'edge-1',
      sourceNodeId: 'node-1',
      sourcePortId: 'ether2',
      targetNodeId: 'node-2',
      targetPortId: 'gi0_1',
      cableType: 'copper_straight'
    },
    {
      id: 'edge-2',
      sourceNodeId: 'node-2',
      sourcePortId: 'gi0_2',
      targetNodeId: 'node-3',
      targetPortId: 'ge0_0_0',
      cableType: 'fiber'
    }
  ]
};

export const TEMPLATE_BGP: LabProject = {
  version: '1.0',
  metadata: {
    name: 'Service Provider BGP',
    author: 'MikroLab Architect',
    description: 'BGP peering between multiple Service Providers',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  viewport: { x: 50, y: 50, zoom: 0.9 },
  nodes: [
    {
      id: 'bgp-node-1',
      name: 'ISP-A-Edge',
      vendor: 'juniper',
      model: 'MX480',
      deviceType: 'router',
      position: { x: 200, y: 100 },
      ports: [
        { id: 'ge0_0_0', name: 'ge-0/0/0', speedMbps: 1000, status: 'up', ipAddress: '172.16.0.1/30', macAddress: 'AA:BB:CC:00:01:01' },
        { id: 'ge0_0_1', name: 'ge-0/0/1', speedMbps: 1000, status: 'down', macAddress: 'AA:BB:CC:00:01:02' }
      ]
    },
    {
      id: 'bgp-node-2',
      name: 'ISP-B-Edge',
      vendor: 'cisco_ios',
      model: 'ASR 900 Series',
      deviceType: 'router',
      position: { x: 600, y: 100 },
      ports: [
        { id: 'gi0_1', name: 'Gi0/1', speedMbps: 1000, status: 'up', ipAddress: '172.16.0.2/30', macAddress: 'AA:BB:CC:00:02:01' },
        { id: 'gi0_2', name: 'Gi0/2', speedMbps: 1000, status: 'down', macAddress: 'AA:BB:CC:00:02:02' }
      ]
    },
    {
      id: 'bgp-node-3',
      name: 'Enterprise-GW',
      vendor: 'mikrotik',
      model: 'CCR2004-1G-12S+2XS',
      deviceType: 'router',
      position: { x: 400, y: 300 },
      ports: [
        { id: 'ether1', name: 'ether1', speedMbps: 1000, status: 'up', ipAddress: '10.10.10.1/30', macAddress: 'AA:BB:CC:00:03:01' },
        { id: 'ether2', name: 'ether2', speedMbps: 1000, status: 'up', ipAddress: '10.10.10.5/30', macAddress: 'AA:BB:CC:00:03:02' }
      ]
    }
  ],
  edges: [
    { id: 'b-edge-1', sourceNodeId: 'bgp-node-1', sourcePortId: 'ge0_0_0', targetNodeId: 'bgp-node-2', targetPortId: 'gi0_1', cableType: 'fiber' },
    { id: 'b-edge-2', sourceNodeId: 'bgp-node-3', sourcePortId: 'ether1', targetNodeId: 'bgp-node-1', targetPortId: 'ge0_0_1', cableType: 'copper_straight' },
    { id: 'b-edge-3', sourceNodeId: 'bgp-node-3', sourcePortId: 'ether2', targetNodeId: 'bgp-node-2', targetPortId: 'gi0_2', cableType: 'copper_straight' }
  ]
};
