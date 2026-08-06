// ============================================================
// WirelessAnalyzer — SSID/password/signal tidak tersedia di engine
// (engine belum memodelkan state wireless → tidak berhalusinasi)
// ============================================================

import { AnalyzerCtx, AnalyzerIssue, NetworkState } from './types';

export function analyzeWireless(state: NetworkState, ctx: AnalyzerCtx): AnalyzerIssue[] {
  const wirelessDevices = state.devices.filter((d) => d.deviceType === 'wireless' || d.interfaces.some((i) => i.type === 'wireless'));
  if (wirelessDevices.length === 0) return [];

  const names = wirelessDevices.map((d) => d.name).join(', ');
  return [
    {
      id: 'wireless-no-state',
      category: 'wireless',
      severity: 'info',
      title: 'Wireless State Tidak Tersedia',
      rootCause: `Perangkat wireless terdeteksi (${names}) tetapi engine belum menyimpan state SSID/password/signal.`,
      evidence: ['Tidak ada data SSID', 'Tidak ada data signal strength', 'Tidak ada data password'],
      affectedDeviceId: wirelessDevices[0].nodeId,
      affectedDeviceName: wirelessDevices[0].name,
      recommendation: 'Verifikasi konfigurasi wireless melalui CLI (SSID, security-profile, channel).',
      commands: [],
      confidence: 0.3,
    },
  ];
}
