import fs from 'fs';
import path from 'path';

const packages = [
  {
    name: 'ui',
    title: 'NetLab UI Design System',
    desc: 'VS Code, Figma, and Cisco Packet Tracer inspired React UI components, panels, dark/light theme systems, gesture controls, and responsive layouts.',
    deps: { '@mikrolab/shared': 'workspace:*', 'lucide-react': '^0.546.0', 'react': '^19.0.1', 'motion': '^12.23.24' },
    code: `export interface UITheme {
  mode: 'dark' | 'light';
  primaryColor: string;
  surfaceBg: string;
  panelBorder: string;
}

export interface PanelState {
  isSidebarOpen: boolean;
  isTerminalOpen: boolean;
  isInspectorOpen: boolean;
}

export const defaultDarkTheme: UITheme = {
  mode: 'dark',
  primaryColor: '#3b82f6',
  surfaceBg: '#0f172a',
  panelBorder: '#1e293b'
};`
  },
  {
    name: 'canvas',
    title: 'NetLab Interactive Topology Canvas Engine',
    desc: '60 FPS Canvas & SVG rendering engine supporting device nodes, interactive cable links, port indicators, grid snappers, selection boxes, and gesture pans/zooms.',
    deps: { '@mikrolab/shared': 'workspace:*', '@mikrolab/core': 'workspace:*', 'react': '^19.0.1' },
    code: `import { Point, ViewportState } from '@mikrolab/shared';

export interface CanvasNode {
  id: string;
  name: string;
  vendor: string;
  model: string;
  position: Point;
  selected?: boolean;
}

export interface CanvasEdge {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
  cableType: 'copper_straight' | 'copper_cross' | 'fiber' | 'serial';
}

export class CanvasRenderer {
  renderViewport(ctx: CanvasRenderingContext2D, viewport: ViewportState): void {
    ctx.save();
    ctx.translate(viewport.pan.x, viewport.pan.y);
    ctx.scale(viewport.zoom, viewport.zoom);
    // Grid rendering logic
    ctx.restore();
  }
}`
  },
  {
    name: 'terminal',
    title: 'NetLab Multi-Vendor Terminal Viewport',
    desc: 'Vendor-authentic interactive CLI viewport supporting prompt customization (MikroTik RouterOS, Cisco IOS, JunOS), command history, tab autocomplete, and speed control.',
    deps: { '@mikrolab/shared': 'workspace:*', '@mikrolab/cli': 'workspace:*', '@mikrolab/vendors': 'workspace:*' },
    code: `export interface TerminalTab {
  id: string;
  deviceId: string;
  deviceName: string;
  vendor: string;
  history: string[];
  currentPrompt: string;
}

export interface TerminalOutputLine {
  id: string;
  text: string;
  type: 'input' | 'output' | 'error' | 'system';
  timestamp: number;
}`
  },
  {
    name: 'core',
    title: 'NetLab Core Topology & Simulation Engine',
    desc: 'Vendor-agnostic state engine managing topology entities, link connectivity, device lifecycle, simulation ticks, and event bus dispatching.',
    deps: { '@mikrolab/shared': 'workspace:*' },
    code: `export interface DeviceEntity {
  id: string;
  name: string;
  vendor: string;
  deviceType: 'router' | 'switch' | 'firewall' | 'pc' | 'server';
  ports: DevicePort[];
  status: 'powered_on' | 'powered_off' | 'rebooting';
}

export interface DevicePort {
  id: string;
  name: string;
  speedMbps: number;
  macAddress: string;
  connectedEdgeId?: string;
}

export class CoreTopologyEngine {
  private devices: Map<string, DeviceEntity> = new Map();

  public addDevice(device: DeviceEntity): void {
    this.devices.set(device.id, device);
  }

  public getDevice(id: string): DeviceEntity | undefined {
    return this.devices.get(id);
  }
}`
  },
  {
    name: 'cli',
    title: 'NetLab Lexer, Parser, & AST Command Engine',
    desc: 'Grammar lexer, token stream generator, AST parser, and command object compiler converting vendor syntax strings into normalized engine actions.',
    deps: { '@mikrolab/shared': 'workspace:*' },
    code: `export interface Token {
  type: 'KEYWORD' | 'ARGUMENT' | 'FLAG' | 'STRING' | 'NUMBER' | 'PIPE';
  value: string;
  position: number;
}

export interface ASTNode {
  command: string;
  subCommands: string[];
  parameters: Record<string, string>;
  flags: string[];
}

export interface NormalizedCommand {
  action: string;
  target: string;
  payload: Record<string, unknown>;
}`
  },
  {
    name: 'packet',
    title: 'NetLab Packet Processing & Encapsulation Engine',
    desc: 'In-memory binary packet buffer management, frame encapsulation/decapsulation, checksum calculation, and packet trace events.',
    deps: { '@mikrolab/shared': 'workspace:*' },
    code: `export interface EthernetFrame {
  destMac: string;
  srcMac: string;
  etherType: number;
  payload: Uint8Array;
}

export interface IPv4Packet {
  version: number;
  ttl: number;
  protocol: number;
  srcIp: string;
  destIp: string;
  payload: Uint8Array;
}`
  },
  {
    name: 'protocols',
    title: 'NetLab Networking Protocol Stack',
    desc: 'Vendor-agnostic implementations of Ethernet II, ARP, IPv4, IPv6, ICMP, static routing, OSPF, and BGP state machines.',
    deps: { '@mikrolab/shared': 'workspace:*', '@mikrolab/packet': 'workspace:*' },
    code: `export interface RoutingTableEntry {
  network: string;
  netmask: string;
  gateway: string;
  interfaceName: string;
  metric: number;
  protocol: 'static' | 'connected' | 'ospf' | 'bgp';
}

export interface ARPCacheEntry {
  ipAddress: string;
  macAddress: string;
  ttlSeconds: number;
}`
  },
  {
    name: 'devices',
    title: 'NetLab Hardware & Virtual Device Definitions',
    desc: 'Virtual hardware specifications including ethernet port count, MAC address generators, switch fabrics, and router memory buffers.',
    deps: { '@mikrolab/shared': 'workspace:*', '@mikrolab/core': 'workspace:*' },
    code: `export interface HardwareSpec {
  modelName: string;
  vendor: string;
  defaultPorts: Array<{ name: string; speedMbps: number }>;
  ramMb: number;
  cpuCores: number;
}

export const ROUTERBOARD_3011_SPEC: HardwareSpec = {
  modelName: 'RB3011UiAS-RM',
  vendor: 'MikroTik',
  defaultPorts: [
    { name: 'ether1', speedMbps: 1000 },
    { name: 'ether2', speedMbps: 1000 },
    { name: 'ether3', speedMbps: 1000 },
    { name: 'ether4', speedMbps: 1000 },
    { name: 'sfp1', speedMbps: 1250 }
  ],
  ramMb: 1024,
  cpuCores: 2
};`
  },
  {
    name: 'vendors',
    title: 'NetLab Vendor Syntax Adapters',
    desc: 'Vendor syntax adapters translating CLI syntax for MikroTik RouterOS, Cisco IOS, Cisco NX-OS, Juniper JunOS, Huawei VRP, Ubiquiti EdgeOS, VyOS, Fortinet, Aruba, and OpenWrt into normalized Command Objects.',
    deps: { '@mikrolab/shared': 'workspace:*', '@mikrolab/cli': 'workspace:*' },
    code: `import { NormalizedCommand } from '@mikrolab/cli';

export interface IVendorAdapter {
  vendorId: string;
  vendorName: string;
  promptTemplate: string;
  parseSyntax(rawInput: string): NormalizedCommand;
  formatResponse(cmdResult: unknown): string;
}

export class MikroTikVendorAdapter implements IVendorAdapter {
  vendorId = 'mikrotik';
  vendorName = 'MikroTik RouterOS';
  promptTemplate = '[admin@MikroTik] > ';

  parseSyntax(rawInput: string): NormalizedCommand {
    return {
      action: 'EXEC_COMMAND',
      target: 'routeros',
      payload: { raw: rawInput }
    };
  }

  formatResponse(cmdResult: unknown): string {
    return String(cmdResult);
  }
}`
  },
  {
    name: 'sdk',
    title: 'NetLab Plugin Extension SDK',
    desc: 'Public developer SDK enabling community developers to build custom vendor adapters, new network protocol handlers, and custom canvas overlays.',
    deps: { '@mikrolab/shared': 'workspace:*', '@mikrolab/core': 'workspace:*', '@mikrolab/vendors': 'workspace:*' },
    code: `import { IVendorAdapter } from '@mikrolab/vendors';

export interface MikroLabPlugin {
  id: string;
  name: string;
  version: string;
  vendorAdapters?: IVendorAdapter[];
  onInit?(): void;
}`
  },
  {
    name: 'shared',
    title: 'NetLab Universal Utilities & Math Models',
    desc: 'Shared geometry types, point calculations, pointer event abstractions, touch gesture recognizers, and serialization schema definitions.',
    deps: {},
    code: `export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface ViewportState {
  pan: Point;
  zoom: number;
}

export type PointerGestureType = 
  | 'TAP' 
  | 'DOUBLE_TAP' 
  | 'LONG_PRESS' 
  | 'PINCH' 
  | 'PAN' 
  | 'CABLE_CONNECT' 
  | 'SELECT_BOX';

export interface GestureEvent {
  type: PointerGestureType;
  point: Point;
  secondaryPoint?: Point;
  scaleDelta?: number;
  panDelta?: Point;
  targetId?: string;
  targetType?: 'node' | 'port' | 'edge' | 'canvas';
}`
  }
];

const packagesDir = path.resolve(process.cwd(), 'packages');

if (!fs.existsSync(packagesDir)) {
  fs.mkdirSync(packagesDir, { recursive: true });
}

packages.forEach((pkg) => {
  const pDir = path.join(packagesDir, pkg.name);
  const srcDir = path.join(pDir, 'src');

  if (!fs.existsSync(srcDir)) {
    fs.mkdirSync(srcDir, { recursive: true });
  }

  // 1. package.json
  const pkgJson = {
    name: `@mikrolab/${pkg.name}`,
    version: '1.0.0',
    private: true,
    type: 'module',
    main: './src/index.ts',
    types: './src/index.ts',
    dependencies: pkg.deps
  };
  fs.writeFileSync(path.join(pDir, 'package.json'), JSON.stringify(pkgJson, null, 2));

  // 2. src/index.ts
  fs.writeFileSync(path.join(srcDir, 'index.ts'), pkg.code + '\n');

  // 3. README.md
  fs.writeFileSync(
    path.join(pDir, 'README.md'),
    `# @mikrolab/${pkg.name}\n\n> ${pkg.title}\n\n${pkg.desc}\n\n## Responsibilities\n- Module specific execution\n- Clean Architecture interface adherence\n`
  );

  // 4. PROMPT.md
  fs.writeFileSync(
    path.join(pDir, 'PROMPT.md'),
    `# AI Prompt Directives for @mikrolab/${pkg.name}\n\n- Do not break the clean contracts defined in CONTRACT.md.\n- Maintain zero external server dependencies.\n`
  );

  // 5. CONTRACT.md
  fs.writeFileSync(
    path.join(pDir, 'CONTRACT.md'),
    `# Contract Guarantees for @mikrolab/${pkg.name}\n\n1. Strictly typed interfaces.\n2. No circular dependencies with other package layers.\n`
  );

  // 6. TODO.md
  fs.writeFileSync(
    path.join(pDir, 'TODO.md'),
    `# TODO Items for @mikrolab/${pkg.name}\n\n- [ ] Implement full unit tests\n- [ ] Add extended protocol adapters\n`
  );

  // 7. ARCHITECTURE.md
  fs.writeFileSync(
    path.join(pDir, 'ARCHITECTURE.md'),
    `# Architecture Specification for @mikrolab/${pkg.name}\n\nDescribes the internal layout, class hierarchy, and interaction flow for the ${pkg.name} package.\n`
  );

  // 8. API.md
  fs.writeFileSync(
    path.join(pDir, 'API.md'),
    `# Public API Reference for @mikrolab/${pkg.name}\n\nRefer to \`src/index.ts\` for complete TypeScript interface definitions.\n`
  );

  // 9. EXAMPLES.md
  fs.writeFileSync(
    path.join(pDir, 'EXAMPLES.md'),
    `# Usage Examples for @mikrolab/${pkg.name}\n\n\`\`\`typescript\nimport * from '@mikrolab/${pkg.name}';\n\`\`\`\n`
  );

  console.log(`Generated package: @mikrolab/${pkg.name}`);
});

console.log('All 11 packages successfully built!');
