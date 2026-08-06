// ============================================================
// NetworkAnalyzer — rangkuman lintas kategori + analisis probe
// ============================================================

import {
  AnalyzerCtx,
  AnalyzerIssue,
  CategoryCheck,
  IssueCategory,
  NetworkState,
} from './types';

export const CATEGORY_LABEL: Record<IssueCategory, string> = {
  dhcp: 'DHCP',
  routing: 'Routing / Gateway',
  dns: 'DNS',
  nat: 'NAT',
  firewall: 'Firewall',
  switch: 'Switch / MAC',
  vlan: 'VLAN',
  interface: 'Interface',
  packet: 'Packet',
  wireless: 'Wireless',
  bridge: 'Bridge',
  network: 'Network',
};

const CRITICAL = ['critical', 'warning'] as const;

export function buildChecks(
  issues: AnalyzerIssue[],
  probes: AnalyzerCtx['probes']
): CategoryCheck[] {
  const categories: IssueCategory[] = [
    'dhcp',
    'routing',
    'dns',
    'nat',
    'firewall',
    'switch',
    'vlan',
    'interface',
    'packet',
    'wireless',
    'bridge',
    'network',
  ];

  return categories.map((cat) => {
    const ofCat = issues.filter((i) => i.category === cat);
    const label = CATEGORY_LABEL[cat];

    if (cat === 'wireless' || cat === 'bridge') {
      if (ofCat.length === 0) {
        return { category: cat, label, ok: true, detail: 'Tidak ada data di engine — tidak bisa diverifikasi' };
      }
    }

    const worst = ofCat.find((i) => i.severity === 'critical') ?? ofCat.find((i) => i.severity === 'warning');
    if (worst) {
      return { category: cat, label, ok: false, detail: worst.title };
    }
    if (ofCat.length > 0) {
      return { category: cat, label, ok: true, detail: ofCat.map((i) => i.title).join('; ') };
    }
    return { category: cat, label, ok: true, detail: 'OK' };
  });
}

/** Temuan dari probe konektivitas: di mana paket berhenti. */
export function probeIssues(state: NetworkState, probes: AnalyzerCtx['probes']): AnalyzerIssue[] {
  const issues: AnalyzerIssue[] = [];
  for (const p of probes) {
    const fromName = state.byId.get(p.from)?.name ?? p.from;
    if (p.result.success) continue;

    const reason = p.result.reason;
    const mk = (id: string, title: string, sev: AnalyzerIssue['severity'], rc: string, ev: string, fixKey?: string, params?: Record<string, string>) =>
      issues.push({
        id,
        category: 'network',
        severity: sev,
        title,
        rootCause: rc,
        evidence: [ev],
        affectedDeviceId: p.stopAt,
        affectedDeviceName: p.stopName,
        recommendation: 'Periksa evidence di atas; gunakan mode hint untuk langkah bertahap.',
        commands: [],
        confidence: p.stopName ? 0.9 : 0.75,
        fixKey,
        params,
      });

    if (reason === 'no-ip') {
      mk('probe-no-ip', `${fromName} Tidak Punya IP`, 'critical', `${fromName} tidak memiliki IP dan tidak ada DHCP yang berhasil.`, `${fromName} ip=none`, 'dhcp-pool');
    } else if (reason === 'ttl') {
      mk('probe-ttl', 'TTL Expired / Loop', 'critical', 'Paket berputar hingga TTL habis (kemungkinan routing loop).', 'TTL Expired', 'loop');
    } else if (reason === 'blocked') {
      mk('probe-blocked', 'Traffic Blocked', 'critical', 'Paket ditolak oleh firewall/ACL.', 'Firewall Block', 'acl-allow');
    } else if (p.stopName) {
      mk('probe-stop', `Packet Berhenti pada ${p.stopName}`, 'critical', `Probe ${fromName} → ${p.to} gagal; paket berhenti/di-drop pada ${p.stopName}.`, `Packet berhenti pada ${p.stopName}`, 'default-route');
    } else {
      mk('probe-noevents', 'Inject Gagal (No Route)', 'critical', `Probe ${fromName} → ${p.to} gagal tanpa ada event — sumber tidak menemukan next-hop (no route/default route).`, 'Default Route Missing', 'default-route');
    }
  }
  return issues;
}
