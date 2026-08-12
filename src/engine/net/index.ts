// ============================================================
// engine/net — entry point engine simulasi event-driven.
// API public kompatibel dengan engine lama (SimulationEngine)
// sehingga App.tsx cukup mengganti import './engine/sim' → './engine/net'.
// ============================================================

export { NetworkSimulator as SimulationEngine } from './core/NetworkSimulator';
export type { SimRunOptions } from './core/NetworkSimulator';

export * from './compat';
export * from './core/types';
export { EventScheduler } from './core/EventScheduler';
export { TimeManager } from './core/TimeManager';
export { EventBus } from './core/EventBus';
export { Topology, LinkTable, linkDelayMs, transmissionDelay } from './core/Topology';
export * from './core/ip';
export { NetworkDevice } from './devices/NetworkDevice';
export { DeviceFactory, kindOfDeviceType } from './devices/DeviceFactory';
export { processorKind, deviceLabel } from './devices/DeviceProcessor';
export type { DeviceProcessor, SimulatorCore } from './devices/DeviceProcessor';
export { SwitchProcessor } from './devices/SwitchProcessor';
export { RouterProcessor } from './devices/RouterProcessor';
export { HostProcessor } from './devices/HostProcessor';
export { computeFhrp, DEFAULT_FHRP_PRIORITY } from './services/FhrpService';
export type { FhrpGroup, FhrpState, FhrpResult } from './services/FhrpService';
export { MacTable } from './layer2/MacTable';
export { ArpCache } from './layer2/ArpCache';
export { VlanTable, isValidVlanId, VLAN_ID_MIN, VLAN_ID_MAX } from './layer2/VlanTable';
export type { VlanInput } from './layer2/VlanTable';
export { RoutingTable } from './layer3/RoutingTable';
export { NatTranslator } from './layer4/Nat';

// Formatter CLI (vendor-flavored) — bagian PRODUKSI engine (tidak lagi
// bergantung pada src/engine/sim; file legacy di sim/formatPing hanya
// re-export untuk kompatibilitas import lama).
export { formatPingOutput, formatTracerouteOutput } from './services/formatPing';
