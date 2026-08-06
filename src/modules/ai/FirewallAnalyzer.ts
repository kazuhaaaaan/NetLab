// ============================================================
// FirewallAnalyzer — ACL/firewall rules yang memblok trafik
// ============================================================

import { AnalyzerCtx, AnalyzerIssue, NetworkState } from './types';

export function analyzeFirewall(state: NetworkState, ctx: AnalyzerCtx): AnalyzerIssue[] {
  const issues: AnalyzerIssue[] = [];

  for (const dev of state.devices) {
    if (dev.acls.length === 0) continue;
    const denies = dev.acls.filter((a) => a.action === 'deny');

    const blocked = ctx.probes.some(
      (p) => p.stopAt === dev.nodeId && p.events.some((e) => e.type === 'FIREWALL_BLOCK' && e.nodeId === dev.nodeId)
    );
    const blockedEvents = state.events.filter((e) => e.type === 'FIREWALL_BLOCK' && e.nodeId === dev.nodeId);

    if (blocked || blockedEvents.length > 0) {
      issues.push({
        id: `firewall-block-${dev.nodeId}`,
        category: 'firewall',
        severity: 'critical',
        title: 'Firewall Block',
        rootCause: `${dev.name} memblokir paket melalui aturan deny pada ACL/firewall.`,
        evidence: blockedEvents.map((e) => {
          const d = e.data as { srcIp?: string; dstIp?: string };
          return `Firewall Block: ${d.srcIp ?? '?'} → ${d.dstIp ?? '?'}`;
        }).concat(denies.length > 0 ? [`Rule deny: ${denies.map((r) => r.action).join(', ')}`] : []),
        affectedDeviceId: dev.nodeId,
        affectedDeviceName: dev.name,
        recommendation: 'Tambahkan rule permit untuk trafik yang dibutuhkan, atau hapus rule deny yang salah.',
        commands: [],
        confidence: 0.97,
        fixKey: 'acl-allow',
      });
    } else if (denies.length > 0) {
      const broad = denies.filter((d) => !d.dst && !d.src);
      issues.push({
        id: `firewall-deny-${dev.nodeId}`,
        category: 'firewall',
        severity: broad.length > 0 ? 'warning' : 'info',
        title: 'ACL Deny Terdeteksi',
        rootCause: `${dev.name} memiliki ${denies.length} rule deny. Rule ini bisa memblok trafik jika cocok dengan flow.`,
        evidence: denies.map((d) => `deny ${d.proto ?? 'all'} ${d.src ?? '*'}:${d.dst ?? '*'}`),
        affectedDeviceId: dev.nodeId,
        affectedDeviceName: dev.name,
        recommendation: 'Pastikan rule deny tidak menghalangi trafik yang dibutuhkan (periksa urutan & parameter).',
        commands: [],
        confidence: 0.8,
        fixKey: 'acl-allow',
      });
    }
  }

  return issues;
}
