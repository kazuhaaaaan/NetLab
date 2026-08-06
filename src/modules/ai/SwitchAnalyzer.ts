// ============================================================
// SwitchAnalyzer — MAC learning, broadcast/flood, physical loop
// ============================================================

import { AnalyzerCtx, AnalyzerIssue, NetworkState } from './types';

/** Deteksi siklus pada graf yang hanya terdiri dari switch (loop bridged). */
function findSwitchLoop(state: NetworkState): string[] | null {
  const switches = state.devices.filter((d) => d.isSwitch);
  const idByName = new Map(switches.map((s) => [s.nodeId, s.name]));
  const adj = new Map<string, string[]>();
  for (const s of switches) adj.set(s.nodeId, []);
  for (const l of state.links) {
    const a = idByName.has(l.a.nodeId) ? l.a.nodeId : null;
    const b = idByName.has(l.b.nodeId) ? l.b.nodeId : null;
    if (a && b && a !== b) {
      adj.get(a)!.push(b);
      adj.get(b)!.push(a);
    }
  }

  const visited = new Set<string>();
  const stack: string[] = [];

  const dfs = (node: string, parent: string, path: string[]): string[] | null => {
    visited.add(node);
    const name = idByName.get(node)!;
    const idx = path.indexOf(name);
    if (idx !== -1) return path.slice(idx).concat(name);
    const next = path.concat(name);
    for (const nb of adj.get(node) || []) {
      if (nb === parent) continue;
      const res = dfs(nb, node, next);
      if (res) return res;
    }
    return null;
  };

  for (const s of switches) {
    if (visited.has(s.nodeId)) continue;
    const res = dfs(s.nodeId, '', []);
    if (res) return res;
  }
  return null;
}

export function analyzeSwitch(state: NetworkState, ctx: AnalyzerCtx): AnalyzerIssue[] {
  const issues: AnalyzerIssue[] = [];
  const learned = state.events.filter((e) => e.type === 'MAC_LEARNED');

  const loop = findSwitchLoop(state);
  if (loop) {
    issues.push({
      id: 'switch-loop',
      category: 'switch',
      severity: 'critical',
      title: 'Switch Loop (Physical)',
      rootCause: `Terdapat loop fisik pada jaringan switch: ${loop.join(' → ')}. Frame broadcast/unknown-unicast akan berputar tanpa henti (broadcast storm).`,
      evidence: [`Loop: ${loop.join(' → ')}`, 'Tidak ada STP di engine'],
      recommendation: 'Hapus salah satu kabel yang membentuk loop, atau implementasikan STP/RSTP.',
      commands: [],
      confidence: 0.95,
      fixKey: 'loop',
      params: { path: loop.join(' -> ') },
    });
  }

  for (const sw of state.devices) {
    if (!sw.isSwitch) continue;
    const hasLinks = sw.interfaces.some((i) => i.cable);
    if (!hasLinks) continue;

    if (sw.macTable.length === 0 && learned.length === 0) {
      issues.push({
        id: `switch-mac-${sw.nodeId}`,
        category: 'switch',
        severity: 'info',
        title: 'MAC Table Kosong',
        rootCause: `${sw.name} belum belajar MAC address — belum ada trafik yang melewatinya.`,
        evidence: [`${sw.name} mac-table=${sw.macTable.length} entri`],
        affectedDeviceId: sw.nodeId,
        affectedDeviceName: sw.name,
        recommendation: 'Kirim trafik (ping) agar switch belajar MAC; periksa status port.',
        commands: [],
        confidence: 0.8,
      });
    } else if (sw.macTable.length > 0) {
      const bridged = learned.filter((e) => e.nodeId === sw.nodeId).length;
      issues.push({
        id: `switch-mac-ok-${sw.nodeId}`,
        category: 'switch',
        severity: 'info',
        title: 'MAC Learning Aktif',
        rootCause: `${sw.name} telah mempelajari ${sw.macTable.length} MAC address.`,
        evidence: [`${sw.name} mac-table=${sw.macTable.length} entri`, `MAC_LEARNED events: ${bridged}`],
        affectedDeviceId: sw.nodeId,
        affectedDeviceName: sw.name,
        recommendation: 'Tidak ada tindakan.',
        commands: [],
        confidence: 0.97,
      });
    }

    // unknown-unicast/broadcast yang di-flood
    const flooded = state.events.filter(
      (e) => e.type === 'PACKET_FORWARDED' && e.nodeId === sw.nodeId && (e.data as { flood?: boolean }).flood
    );
    if (flooded.length > 0) {
      issues.push({
        id: `switch-flood-${sw.nodeId}`,
        category: 'switch',
        severity: 'info',
        title: 'Broadcast / Unknown Unicast',
        rootCause: `${sw.name} mem-flood ${flooded.length} frame (broadcast atau unknown unicast) ke semua port.`,
        evidence: [`Flood ${flooded.length}x di ${sw.name}`],
        affectedDeviceId: sw.nodeId,
        affectedDeviceName: sw.name,
        recommendation: 'Normal untuk broadcast; jika terus-menerus cek kemungkinan loop atau host baru.',
        commands: [],
        confidence: 0.7,
      });
    }
  }

  return issues;
}
