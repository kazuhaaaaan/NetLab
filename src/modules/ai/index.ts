// ============================================================
// AI Mentor — public API.
// Penggunaan: new MentorEngine(simulator) → .ask/.diagnose/.hint/...
// Seluruh analisis berbasis data nyata dari Simulation Engine.
// ============================================================

export { MentorEngine } from './MentorEngine';
export { NetworkStateReader } from './NetworkStateReader';
export { DiagnoseEngine } from './DiagnoseEngine';
export { HintEngine } from './HintEngine';
export { LearnEngine } from './LearnEngine';
export { LearningEngine } from './LearningEngine';
export { ExplainEngine } from './ExplainEngine';
export { SmartCli, levenshtein } from './SmartCli';
export { CommandGenerator, normalizeVendor } from './CommandGenerator';
export { PromptBuilder } from './PromptBuilder';
export { renderDiagnosis, renderResponse } from './format';

// analyzer (dipakai internal, diekspos untuk ekstensi vendor/analis)
export { analyzeDevices } from './DeviceAnalyzer';
export { analyzeRouting } from './RoutingAnalyzer';
export { analyzeFirewall } from './FirewallAnalyzer';
export { analyzeNat } from './NATAnalyzer';
export { analyzeDhcp } from './DHCPAnalyzer';
export { analyzeDns } from './DNSAnalyzer';
export { analyzeSwitch } from './SwitchAnalyzer';
export { analyzeVlan } from './VLANAnalyzer';
export { analyzeWireless } from './WirelessAnalyzer';
export { analyzeBridge } from './BridgeAnalyzer';
export { analyzePackets } from './PacketAnalyzer';
export { buildChecks, probeIssues } from './NetworkAnalyzer';

export type * from './types';

// ── AI Network Agent (tool system + shared verification) ──────
export * from './agent';
