// ============================================================
// DNSAnalyzer — server tidak ada, mati, atau tidak terjangkau
// ============================================================

import { AnalyzerCtx, AnalyzerIssue, NetworkState } from './types';
import { defaultRouteOf } from './NetworkStateReader';

export function analyzeDns(state: NetworkState, ctx: AnalyzerCtx): AnalyzerIssue[] {
  const issues: AnalyzerIssue[] = [];

  for (const dev of state.devices) {
    // Server DNS aktif (memiliki records)
    if (dev.dnsRecords.length > 0) {
      issues.push({
        id: `dns-server-${dev.nodeId}`,
        category: 'dns',
        severity: 'info',
        title: 'DNS Server Aktif',
        rootCause: `${dev.name} melayani ${dev.dnsRecords.length} record DNS.`,
        evidence: dev.dnsRecords.slice(0, 5).map((r) => `${r.name} → ${r.address}`),
        affectedDeviceId: dev.nodeId,
        affectedDeviceName: dev.name,
        recommendation: 'Tidak ada tindakan.',
        commands: [],
        confidence: 0.99,
      });
    }

    // Client DNS: cek server yang dituju
    for (const serverIp of dev.dnsServers) {
      const srvDev = state.byIp.get(serverIp);
      if (!srvDev) {
        issues.push({
          id: `dns-unknown-${dev.nodeId}-${serverIp}`,
          category: 'dns',
          severity: 'warning',
          title: 'DNS Server Tidak Ditemukan',
          rootCause: `${dev.name} menunjuk DNS server ${serverIp}, tetapi tidak ada perangkat dengan IP tersebut di jaringan.`,
          evidence: [`${dev.name} dns-servers=${dev.dnsServers.join(', ')}`, `${serverIp} tidak ada di topologi`],
          affectedDeviceId: dev.nodeId,
          affectedDeviceName: dev.name,
          recommendation: 'Perbaiki dns-server ke IP yang benar, atau buat server DNS dengan IP tersebut.',
          commands: [],
          confidence: 0.93,
          fixKey: 'dns-record',
          params: { ip: serverIp },
        });
        continue;
      }
      if (!srvDev.powered) {
        issues.push({
          id: `dns-down-${dev.nodeId}-${serverIp}`,
          category: 'dns',
          severity: 'critical',
          title: 'DNS Server Mati',
          rootCause: `DNS server ${srvDev.name} (${serverIp}) sedang dalam keadaan power off.`,
          evidence: [`${srvDev.name} powered=false`],
          affectedDeviceId: srvDev.nodeId,
          affectedDeviceName: srvDev.name,
          recommendation: 'Nyalakan perangkat DNS server.',
          commands: [],
          confidence: 0.98,
        });
        continue;
      }
      if (dev.isL3 && !dev.routes.some((r) => r.kind === 'connected' || r.dst === '0.0.0.0/0')) {
        issues.push({
          id: `dns-unreach-${dev.nodeId}-${serverIp}`,
          category: 'dns',
          severity: 'warning',
          title: 'DNS Tidak Dapat Dijangkau',
          rootCause: `${dev.name} tidak memiliki rute menuju ${serverIp} (tidak ada default route / rute spesifik).`,
          evidence: [`${dev.name} routes=${dev.routes.length} (tanpa default)`],
          affectedDeviceId: dev.nodeId,
          affectedDeviceName: dev.name,
          recommendation: 'Tambahkan rute menuju jaringan DNS server atau default route.',
          commands: [],
          confidence: 0.85,
          fixKey: 'default-route',
        });
      }
    }
  }

  return issues;
}
