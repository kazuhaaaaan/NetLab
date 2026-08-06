// ============================================================
// DeviceAnalyzer — status perangkat & interface (power, cable, down)
// ============================================================

import { AnalyzerCtx, AnalyzerIssue, DeviceState, NetworkState } from './types';
import { defaultRouteOf } from './NetworkStateReader';

export function analyzeDevices(state: NetworkState, ctx: AnalyzerCtx): AnalyzerIssue[] {
  const issues: AnalyzerIssue[] = [];

  for (const dev of state.devices) {
    if (!dev.powered) {
      issues.push({
        id: `device-power-${dev.nodeId}`,
        category: 'interface',
        severity: 'critical',
        title: 'Device Mati (Power Off)',
        rootCause: `${dev.name} dalam keadaan mati, sehingga paket tidak dapat melaluinya.`,
        evidence: [`${dev.name} powered=false`],
        affectedDeviceId: dev.nodeId,
        affectedDeviceName: dev.name,
        recommendation: 'Nyalakan kembali device dari tombol power pada sidebar.',
        commands: [],
        confidence: 0.99,
      });
      continue;
    }

    const cabled = dev.interfaces.filter((i) => i.cable);

    for (const i of cabled) {
      if (i.shutdown) {
        issues.push({
          id: `device-shutdown-${dev.nodeId}-${i.name}`,
          category: 'interface',
          severity: 'warning',
          title: 'Interface Disabled (shutdown)',
          rootCause: `Interface ${dev.name}:${i.name} di-shutdown lewat CLI sehingga tidak bisa mengirim/menerima frame.`,
          evidence: [`Interface ${i.name} shutdown/disabled`],
          affectedDeviceId: dev.nodeId,
          affectedDeviceName: dev.name,
          ifaceName: i.name,
          recommendation: 'Hidupkan kembali interface tersebut.',
          commands: [],
          confidence: 0.98,
          fixKey: 'iface-up',
          params: { iface: i.name },
        });
      } else if (!i.up) {
        issues.push({
          id: `device-down-${dev.nodeId}-${i.name}`,
          category: 'interface',
          severity: dev.interfaces.filter((x) => x.cable).length === 1 ? 'critical' : 'warning',
          title: 'Interface DOWN',
          rootCause: `Interface ${dev.name}:${i.name} berstatus down, sehingga link L2 terputus.`,
          evidence: [`Interface ${i.name} DOWN`],
          affectedDeviceId: dev.nodeId,
          affectedDeviceName: dev.name,
          ifaceName: i.name,
          recommendation: 'Periksa kabel & nyalakan interface.',
          commands: [],
          confidence: 0.97,
          fixKey: 'iface-up',
          params: { iface: i.name },
        });
      }
    }

    // Host terisolasi: tidak ada kabel sama sekali
    const isHost = dev.kind === 'pc' || dev.kind === 'server';
    if (isHost && cabled.length === 0 && dev.interfaces.length > 0) {
      issues.push({
        id: `device-nocable-${dev.nodeId}`,
        category: 'interface',
        severity: 'critical',
        title: 'No Cable (Host Terputus)',
        rootCause: `${dev.name} tidak terhubung kabel ke switch/router mana pun, sehingga tidak bisa berkomunikasi.`,
        evidence: ['No cable terpasang pada host'],
        affectedDeviceId: dev.nodeId,
        affectedDeviceName: dev.name,
        recommendation: 'Hubungkan host ke switch/router dengan kabel yang sesuai.',
        commands: [],
        confidence: 0.95,
      });
    }

    // Host butuh IP tapi tidak punya & belum dhcp-client
    if (isHost && !dev.ip && cabled.length > 0) {
      const hasPoolAnywhere = state.devices.some((d) => d.dhcpPools.length > 0);
      if (!hasPoolAnywhere) {
        issues.push({
          id: `device-noip-${dev.nodeId}`,
          category: 'dhcp',
          severity: 'warning',
          title: 'DHCP Network Belum Dibuat',
          rootCause: `${dev.name} belum punya IP dan tidak ada DHCP server/pool di seluruh jaringan.`,
          evidence: [`${dev.name} ip=none`, 'Tidak ada dhcp pool di jaringan'],
          affectedDeviceId: dev.nodeId,
          affectedDeviceName: dev.name,
          recommendation: 'Buat DHCP server & pool pada router segmen, atau set IP manual lewat CLI.',
          commands: [],
          confidence: 0.9,
          fixKey: 'dhcp-pool',
          params: { iface: cabled[0].name },
        });
      }
    }
  }

  return issues;
}

export function defaultGatewayOf(dev: DeviceState): string | null {
  const dr = defaultRouteOf(dev);
  return dr?.gateway ?? null;
}

export function hasCabledUpIface(dev: DeviceState): boolean {
  return dev.interfaces.some((i) => i.cable && i.up && !i.shutdown);
}
