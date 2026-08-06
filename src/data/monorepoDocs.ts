export interface PackageDoc {
  name: string;
  title: string;
  description: string;
  architecture: string;
  prompt: string;
  contract: string;
  api: string;
  todo: string;
}

export const MONOREPO_PACKAGES_DOCS: PackageDoc[] = [
  {
    name: 'ui',
    title: '@mikrolab/ui',
    description: 'VS Code, Figma, and Cisco Packet Tracer inspired React UI design system, panel dockers, gesture toolbars, dark/light theme systems.',
    architecture: `Layer: Presentation UI\nDependents: apps/web\nDesign Tokens: Dark/Light Mode Tailwind CSS v4 variables\nComponents: Navbar, Sidebar, Dock, Modal, ContextMenu, GestureOverlay`,
    prompt: `Maintain clean separation between UI components and simulation logic. Never put networking rules in React state handlers.`,
    contract: `All UI state must be serializable. Touch targets must adhere to 44px minimum sizing for mobile compliance.`,
    api: `export interface UITheme;\nexport interface PanelState;\nexport const defaultDarkTheme: UITheme;`,
    todo: `- [ ] Add customizable workspace layout docking\n- [ ] Add accessibility ARIA labels for screen reader topology navigation`
  },
  {
    name: 'canvas',
    title: '@mikrolab/canvas',
    description: '60 FPS Canvas & SVG rendering engine supporting device nodes, interactive cable links, port indicators, grid snappers, selection boxes, and gesture pans/zooms.',
    architecture: `Layer: Visualization Engine\nRenderer: Hybrid SVG + HTML5 Canvas\nPerformance: RequestAnimationFrame loop with dirty-rect invalidation`,
    prompt: `All pan/zoom transforms must be computed using Pointer Events in @mikrolab/shared. Do not write separate touch vs mouse handlers.`,
    contract: `Guarantees 60 FPS viewport transforms up to 500 connected device nodes.`,
    api: `export class CanvasRenderer;\nexport interface CanvasNode;\nexport interface CanvasEdge;`,
    todo: `- [ ] Implement animated binary packet particle stream along SVG edges\n- [ ] Add canvas minimap navigator`
  },
  {
    name: 'terminal',
    title: '@mikrolab/terminal',
    description: 'Vendor-authentic interactive CLI viewport supporting prompt customization (MikroTik RouterOS, Cisco IOS, JunOS), command history, tab autocomplete, and speed control.',
    architecture: `Layer: Presentation CLI Viewport\nTerminal Engine: In-browser xterm-compatible token buffer\nMulti-Tab: Active session router per virtual node`,
    prompt: `Ensure vendor prompt formatters reflect exact vendor defaults ([admin@MikroTik] >, Router#, admin@JunOS>).`,
    contract: `Must handle up to 10,000 output scrollback lines with sub-10ms rendering latency.`,
    api: `export interface TerminalTab;\nexport interface TerminalOutputLine;`,
    todo: `- [ ] Add ANSI color highlight theme for MikroTik /ip/address print output\n- [ ] Add session logging export to .txt`
  },
  {
    name: 'core',
    title: '@mikrolab/core',
    description: 'Vendor-agnostic state engine managing topology entities, link connectivity, device lifecycle, simulation ticks, and event bus dispatching.',
    architecture: `Layer: Domain Simulation Engine\nPattern: Entity-Component System & Event Bus\nPure Functions: Core state mutations are 100% deterministic and pure`,
    prompt: `Core engine must remain 100% vendor-agnostic. Never inspect vendor strings to execute state transitions.`,
    contract: `All topology mutations emit explicit events via EventBus. Core state is fully serializable to .mlab JSON.`,
    api: `export interface DeviceEntity;\nexport interface DevicePort;\nexport class CoreTopologyEngine;`,
    todo: `- [ ] Add simulation tick pause/resume/step controls\n- [ ] Add link failure injection API`
  },
  {
    name: 'cli',
    title: '@mikrolab/cli',
    description: 'Grammar lexer, token stream generator, AST parser, and command object compiler converting vendor syntax strings into normalized engine actions.',
    architecture: `Layer: Translation & Parsing\nPipeline: Raw String -> Lexer -> Token Stream -> AST Parser -> Command Object`,
    prompt: `Parser must output normalized Command Objects ({ action, target, payload }) suitable for Core Engine execution.`,
    contract: `Invalid CLI syntax must throw clear parse errors with column offset indicators.`,
    api: `export interface Token;\nexport interface ASTNode;\nexport interface NormalizedCommand;`,
    todo: `- [ ] Implement MikroTik hierarchical tree parser (/ip/address/add)\n- [ ] Implement Cisco IOS abbreviation expander (conf t -> configure terminal)`
  },
  {
    name: 'packet',
    title: '@mikrolab/packet',
    description: 'In-memory binary packet buffer management, frame encapsulation/decapsulation, checksum calculation, and packet trace events.',
    architecture: `Layer: Networking Data Link & Network Layers\nBuffer: Uint8Array ArrayBuffers for zero-copy binary frame manipulation`,
    prompt: `Packet structures must conform strictly to RFC standards for Ethernet II, ARP, IPv4, IPv6, and ICMP.`,
    contract: `All frame operations must preserve original binary byte offset pointers.`,
    api: `export interface EthernetFrame;\nexport interface IPv4Packet;`,
    todo: `- [ ] Add Wireshark pcap format export builder\n- [ ] Add ICMP checksum validator`
  },
  {
    name: 'protocols',
    title: '@mikrolab/protocols',
    description: 'Vendor-agnostic implementations of Ethernet II, ARP, IPv4, IPv6, ICMP, static routing, OSPF, and BGP state machines.',
    architecture: `Layer: Protocol Stack Processing\nState Machines: Discrete state machine per protocol instance per device interface`,
    prompt: `Protocols must query normalized Device state and emit binary packet buffers.`,
    contract: `Routing table lookups must use Longest Prefix Match (LPM) algorithms.`,
    api: `export interface RoutingTableEntry;\nexport interface ARPCacheEntry;`,
    todo: `- [ ] Implement OSPF Hello/LSA adjacency state machine\n- [ ] Implement BGP Peering handshake protocol`
  },
  {
    name: 'devices',
    title: '@mikrolab/devices',
    description: 'Virtual hardware specifications including ethernet port count, MAC address generators, switch fabrics, and router memory buffers.',
    architecture: `Layer: Hardware Hardware Abstraction\nSpecs: Presets for MikroTik CCR/RB, Cisco Catalyst/Nexus, Juniper MX/SRX`,
    prompt: `Every device hardware model must explicitly specify interface speed, port naming conventions, and MAC ranges.`,
    contract: `Unique EUI-48 MAC address generator guarantees zero MAC collisions in topology canvas.`,
    api: `export interface HardwareSpec;\nexport const ROUTERBOARD_3011_SPEC: HardwareSpec;`,
    todo: `- [ ] Add customizable modular port expansion slot definitions\n- [ ] Add power supply status modeling`
  },
  {
    name: 'vendors',
    title: '@mikrolab/vendors',
    description: 'Vendor syntax adapters translating CLI syntax for MikroTik RouterOS, Cisco IOS, Cisco NX-OS, Juniper JunOS, Huawei VRP, Ubiquiti EdgeOS, VyOS, Fortinet, Aruba, and OpenWrt into normalized Command Objects.',
    architecture: `Layer: Vendor Syntax Adapters\nPattern: Strategy / Adapter Pattern implementing IVendorAdapter interface`,
    prompt: `Vendor adapters convert syntax into normalized engine commands. Never execute networking mutations directly inside vendor adapters.`,
    contract: `Every vendor adapter must implement IVendorAdapter and export prompt formatters.`,
    api: `export interface IVendorAdapter;\nexport class MikroTikVendorAdapter implements IVendorAdapter;`,
    todo: `- [ ] Complete syntax dictionaries for all 10 vendor CLI adapters\n- [ ] Add vendor-specific error string formatters`
  },
  {
    name: 'sdk',
    title: '@mikrolab/sdk',
    description: 'Public developer SDK enabling community developers to build custom vendor adapters, new network protocol handlers, and custom canvas overlays.',
    architecture: `Layer: Extension SDK\nPlugin Architecture: Dynamic plugin loader & lifecycle manager`,
    prompt: `Expose clean, stable extension APIs without exposing internal engine private state.`,
    contract: `Plugin hooks must catch exceptions to prevent custom plugins from crashing the main simulation thread.`,
    api: `export interface MikroLabPlugin;`,
    todo: `- [ ] Add web worker plugin runtime sandboxing\n- [ ] Add plugin marketplace manifest validator`
  },
  {
    name: 'shared',
    title: '@mikrolab/shared',
    description: 'Shared geometry types, point calculations, pointer event abstractions, touch gesture recognizers, and serialization schema definitions.',
    architecture: `Layer: Foundation Utilities\nZero Dependencies: Pure math, geometry, pointer, and gesture recognizers`,
    prompt: `Shared module must contain pure, reusable math helpers and gesture event schemas. No framework dependencies.`,
    contract: `Geometry functions must be side-effect free and memory efficient.`,
    api: `export interface Point;\nexport interface ViewportState;\nexport interface GestureEvent;`,
    todo: `- [ ] Add BoundingBox intersection detector\n- [ ] Add Bezier curve connector calculation math`
  }
];
