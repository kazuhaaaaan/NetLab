export interface Point {
  x: number;
  y: number;
}

export type VendorType =
  | 'mikrotik'
  | 'cisco_ios'
  | 'cisco_nxos'
  | 'juniper'
  | 'huawei'
  | 'ubiquiti'
  | 'vyos'
  | 'fortinet'
  | 'aruba'
  | 'openwrt'
  | 'linux';

export interface VendorInfo {
  id: VendorType;
  name: string;
  osName: string;
  defaultPrompt: string;
  badgeColor: string;
  description: string;
}

export interface PortSpec {
  id: string;
  name: string;
  speedMbps: number;
  status: 'up' | 'down';
  ipAddress?: string;
  macAddress: string;
  type?: 'copper' | 'fiber' | 'serial';
}

export interface LabNode {
  id: string;
  name: string;
  vendor: VendorType;
  model: string;
  deviceType: 'router' | 'switch' | 'firewall' | 'pc' | 'server' | 'wireless';
  position: { x: number; y: number };
  ports: PortSpec[];
  selected?: boolean;
}

export interface LabEdge {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
  cableType: 'copper_straight' | 'copper_cross' | 'fiber' | 'serial';
  selected?: boolean;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface LabProject {
  version: string;
  metadata: {
    name: string;
    author: string;
    description: string;
    createdAt: string;
    updatedAt: string;
  };
  nodes: LabNode[];
  edges: LabEdge[];
  viewport: Viewport;
}

export interface TerminalLog {
  id: string;
  nodeId: string;
  text: string;
  type: 'input' | 'output' | 'error' | 'system';
  timestamp: string;
}

export type ActiveTool = 'select' | 'cable' | 'pan' | 'ping';

/** Animasi paket yang melintasi kabel di canvas (hasil simulasi ping). */
export interface PacketAnimation {
  id: string;
  /** edge ids dalam urutan lintasan (sumber → tujuan) */
  edgeIds: string[];
  /** true = arah balik (reply) */
  reverse?: boolean;
}
