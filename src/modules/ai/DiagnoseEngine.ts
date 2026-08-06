// ============================================================
// DiagnoseEngine — analisis seluruh jaringan (semua analyzer)
// ============================================================

import { NetworkStateReader } from './NetworkStateReader';
import { CommandGenerator } from './CommandGenerator';
import { analyzeDevices } from './DeviceAnalyzer';
import { analyzeRouting } from './RoutingAnalyzer';
import { analyzeFirewall } from './FirewallAnalyzer';
import { analyzeNat } from './NATAnalyzer';
import { analyzeDhcp } from './DHCPAnalyzer';
import { analyzeDns } from './DNSAnalyzer';
import { analyzeSwitch } from './SwitchAnalyzer';
import { analyzeVlan } from './VLANAnalyzer';
import { analyzeWireless } from './WirelessAnalyzer';
import { analyzeBridge } from './BridgeAnalyzer';
import { analyzePackets } from './PacketAnalyzer';
import { buildChecks, probeIssues } from './NetworkAnalyzer';
import { AnalyzerCtx, AnalyzerIssue, AnalysisResult, ProbeResult, VendorId } from './types';

export interface DiagnoseOptions {
  /** pasangan probe (from: nodeId/name, to: nodeId/name/ip) */
  probes?: { from: string; to: string }[];
}

export class DiagnoseEngine {
  private cmdGen = new CommandGenerator();

  constructor(readonly reader: NetworkStateReader) {}

  diagnose(opts: DiagnoseOptions = {}): AnalysisResult {
    const state = this.reader.read();

    const probeResults: ProbeResult[] = (opts.probes ?? [])
      .map((p) => this.runProbe(p.from, p.to, state))
      .filter((x): x is ProbeResult => !!x);

    const ctx: AnalyzerCtx = { engine: this.reader.engine, probes: probeResults };

    const rawIssues = [
      ...analyzeDevices(state, ctx),
      ...analyzeRouting(state, ctx),
      ...analyzeFirewall(state, ctx),
      ...analyzeNat(state, ctx),
      ...analyzeDhcp(state, ctx),
      ...analyzeDns(state, ctx),
      ...analyzeSwitch(state, ctx),
      ...analyzeVlan(state, ctx),
      ...analyzeWireless(state, ctx),
      ...analyzeBridge(state, ctx),
      ...analyzePackets(state, ctx),
      ...probeIssues(state, probeResults),
    ];

    const withCommands = rawIssues.map((i) => {
      const dev = state.byId.get(i.affectedDeviceId ?? '');
      const vendor = dev?.vendor ?? 'mikrotik';
      return { ...i, commands: this.cmdGen.generate(i, vendor) };
    });

    const issues = dedupeIssues(withCommands).sort(
      (a, b) => sevRank(a.severity) - sevRank(b.severity) || b.confidence - a.confidence
    );

    const checks = buildChecks(issues, probeResults);
    const status: AnalysisResult['status'] =
      issues.some((i) => i.severity === 'critical' || i.severity === 'warning') ? 'problem' : 'healthy';
    const confidence = computeConfidence(state.devices.length, issues);
    const note =
      state.devices.length === 0
        ? 'Tidak cukup data — tidak ada perangkat di jaringan.'
        : undefined;

    return {
      status,
      issues,
      checks,
      confidence,
      probePaths: probeResults.map((p) => ({
        from: state.byId.get(p.from)?.name ?? p.from,
        to: p.to,
        path: p.result.path,
        ok: p.result.success,
        reason: p.result.reason,
      })),
      note,
    };
  }

  private runProbe(from: string, to: string, state: ReturnType<NetworkStateReader['read']>): ProbeResult | null {
    const fromId = state.byId.has(from) ? from : this.reader.deviceIdByName(from);
    if (!fromId) return null;

    let toIp = to;
    const toDev = state.byId.get(to) ?? (this.reader.deviceIdByName(to) ? state.byId.get(this.reader.deviceIdByName(to)!) : undefined);
    if (toDev?.ip) toIp = toDev.ip;
    else if (!state.byIp.has(toIp)) toIp = to; // tetap dipakai apa adanya

    return this.reader.probe(fromId, toIp);
  }
}

function dedupeIssues(issues: AnalyzerIssue[]): AnalyzerIssue[] {
  const map = new Map<string, AnalyzerIssue>();
  for (const i of issues) {
    const existing = map.get(i.id);
    if (!existing) {
      map.set(i.id, i);
      continue;
    }
    map.set(i.id, {
      ...existing,
      evidence: [...new Set([...existing.evidence, ...i.evidence])],
      commands: mergeCommands(existing.commands, i.commands),
    });
  }
  return [...map.values()];
}

function mergeCommands(a: AnalyzerIssue['commands'], b: AnalyzerIssue['commands']) {
  const byVendor = new Map<VendorId, string[]>();
  for (const c of [...a, ...b]) {
    byVendor.set(c.vendor, [...(byVendor.get(c.vendor) ?? []), ...c.commands]);
  }
  return [...byVendor.entries()].map(([vendor, commands]) => ({ vendor, commands }));
}

function sevRank(s: AnalyzerIssue['severity']): number {
  return s === 'critical' ? 0 : s === 'warning' ? 1 : 2;
}

function computeConfidence(deviceCount: number, issues: AnalyzerIssue[]): number {
  if (deviceCount === 0) return 0.2;
  const prob = issues.filter((i) => i.severity === 'critical' || i.severity === 'warning');
  if (prob.length === 0) return Math.min(0.95, 0.6 + deviceCount * 0.05);
  const avg = prob.reduce((acc, i) => acc + i.confidence, 0) / prob.length;
  return Math.max(0.5, Math.min(0.99, avg));
}
