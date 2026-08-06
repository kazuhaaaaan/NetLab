// ============================================================
// BridgeAnalyzer — port belum masuk bridge / state bridge
// (engine belum memodelkan bridge → tidak berhalusinasi)
// ============================================================

import { AnalyzerCtx, AnalyzerIssue, NetworkState } from './types';

export function analyzeBridge(state: NetworkState, ctx: AnalyzerCtx): AnalyzerIssue[] {
  const bridgeIfaces = state.devices.flatMap((d) =>
    d.interfaces.filter((i) => i.type === 'bridge').map((i) => ({ dev: d, iface: i }))
  );
  if (bridgeIfaces.length === 0) return [];

  const detail = bridgeIfaces.map(({ dev, iface }) => `${dev.name}:${iface.name}`).join(', ');
  return [
    {
      id: 'bridge-no-state',
      category: 'bridge',
      severity: 'info',
      title: 'Bridge State Tidak Tersedia',
      rootCause: `Interface bridge terdeteksi (${detail}) tetapi engine belum memodelkan anggota bridge (port belum masuk bridge).`,
      evidence: ['Tidak ada data anggota bridge', 'Tidak ada data STP'],
      affectedDeviceId: bridgeIfaces[0].dev.nodeId,
      affectedDeviceName: bridgeIfaces[0].dev.name,
      ifaceName: bridgeIfaces[0].iface.name,
      recommendation: 'Periksa konfigurasi bridge lewat CLI dan pastikan port yang diinginkan sudah masuk bridge.',
      commands: [],
      confidence: 0.3,
    },
  ];
}
