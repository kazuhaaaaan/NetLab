// ============================================================
// VLANAnalyzer — trunk mismatch, access vlan mismatch, subinterface
// ============================================================

import { AnalyzerCtx, AnalyzerIssue, DeviceState, NetworkState } from './types';

function portInfo(dev: DeviceState, ifaceName: string): { trunk: boolean; vlan: number } {
  const trunk = dev.trunkPorts.some((t) => t.toLowerCase() === ifaceName.toLowerCase());
  const vlan = dev.portVlans[ifaceName] ?? dev.portVlans[ifaceName.toLowerCase()] ?? 1;
  return { trunk, vlan };
}

export function analyzeVlan(state: NetworkState, ctx: AnalyzerCtx): AnalyzerIssue[] {
  const issues: AnalyzerIssue[] = [];

  for (const link of state.links) {
    const aDev = state.byId.get(link.a.nodeId);
    const bDev = state.byId.get(link.b.nodeId);
    if (!aDev || !bDev) continue;

    const a = portInfo(aDev, link.a.ifaceName);
    const b = portInfo(bDev, link.b.ifaceName);

    // Trunk mismatch: satu sisi trunk, sisi lain access
    if (a.trunk !== b.trunk) {
      issues.push({
        id: `vlan-trunk-${link.id}`,
        category: 'vlan',
        severity: 'critical',
        title: 'Trunk Mismatch',
        rootCause: `Link ${aDev.name}:${link.a.ifaceName} ↔ ${bDev.name}:${link.b.ifaceName}: satu sisi trunk, sisi lain bukan trunk.`,
        evidence: [
          `${aDev.name}:${link.a.ifaceName} ${a.trunk ? 'TRUNK' : `access vlan ${a.vlan}`}`,
          `${bDev.name}:${link.b.ifaceName} ${b.trunk ? 'TRUNK' : `access vlan ${b.vlan}`}`,
        ],
        affectedDeviceId: aDev.nodeId,
        affectedDeviceName: aDev.name,
        ifaceName: link.a.ifaceName,
        recommendation: 'Samakan mode port (keduanya trunk, atau keduanya access) pada link tersebut.',
        commands: [],
        confidence: 0.94,
        fixKey: 'vlan-trunk',
        params: { iface: link.a.ifaceName },
      });
    } else if (!a.trunk && a.vlan !== b.vlan) {
      issues.push({
        id: `vlan-mismatch-${link.id}`,
        category: 'vlan',
        severity: 'warning',
        title: 'VLAN Mismatch (Access)',
        rootCause: `Kedua sisi access port tapi VLAN berbeda: ${a.vlan} vs ${b.vlan}.`,
        evidence: [
          `${aDev.name}:${link.a.ifaceName} vlan ${a.vlan}`,
          `${bDev.name}:${link.b.ifaceName} vlan ${b.vlan}`,
        ],
        affectedDeviceId: aDev.nodeId,
        affectedDeviceName: aDev.name,
        ifaceName: link.a.ifaceName,
        recommendation: 'Set VLAN access yang sama pada kedua ujung link.',
        commands: [],
        confidence: 0.9,
        fixKey: 'vlan-access',
        params: { iface: link.a.ifaceName, vlanId: String(b.vlan) },
      });
    }

    // Router-on-a-stick: subinterface router vs access vlan switch
    const aSubs = Object.entries(aDev.subinterfaces).find(([, s]) => s.parentPort === link.a.ifaceName);
    const bSubs = Object.entries(bDev.subinterfaces).find(([, s]) => s.parentPort === link.b.ifaceName);
    const sub = aSubs || bSubs;
    if (sub) {
      const [name, s] = sub;
      const peerVlan = aSubs ? b.vlan : a.vlan;
      const peerTrunk = aSubs ? b.trunk : a.trunk;
      if (!peerTrunk && s.vlanId !== peerVlan) {
        issues.push({
          id: `vlan-ros-${link.id}`,
          category: 'vlan',
          severity: 'warning',
          title: 'VLAN Subinterface Tidak Cocok',
          rootCause: `Subinterface ${name} (vlan ${s.vlanId}) terhubung ke port access vlan ${peerVlan} — frame tidak akan masuk ke subinterface yang benar.`,
          evidence: [`subinterface ${name} vlan ${s.vlanId}`, `peer access vlan ${peerVlan}`],
          affectedDeviceId: aSubs ? aDev.nodeId : bDev.nodeId,
          affectedDeviceName: aSubs ? aDev.name : bDev.name,
          ifaceName: name,
          recommendation: 'Samakan vlan-id subinterface dengan vlan access port switch, atau jadikan trunk.',
          commands: [],
          confidence: 0.88,
          fixKey: 'subinterface',
          params: { iface: name, vlanId: String(s.vlanId) },
        });
      }
    }
  }

  return issues;
}
