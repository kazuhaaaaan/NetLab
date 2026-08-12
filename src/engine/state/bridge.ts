/**
 * Bridge — seam facade ke engine nyata NetLab.
 *
 * Executor/resolver facade TIDAK tahu VendorDispatcher/NetworkSimulator
 * (supaya murni dan bisa diuji). Semua kontak dengan engine nyata lewat
 * interface ini. Implementasi produksi dibuat di `createNetLabBridge`
 * (src/engine/index.ts); test memakai bridge tiruan.
 */

/** Hasil ping engine nyata (subset PingSimResult NetworkSimulator). */
export interface BridgePingResult {
  success: boolean;
  path: string[];
  reason?: string;
  rttMs?: number;
}

/** Satu interface dari snapshot stats engine nyata. */
export interface BridgeInterface {
  name: string;
  mac: string;
  ip: string | null;
  up: boolean;
  linked: boolean;
  operational: 'up' | 'down' | 'not-connected' | 'admin-down' | 'link-down';
}

/** Satu route dari snapshot stats engine nyata. */
export interface BridgeRoute {
  dst: string;
  gateway: string;
  iface: string;
  kind: string;
}

/** Snapshot stats perangkat engine nyata (subset DeviceStatsSnapshot). */
export interface BridgeDeviceStats {
  name: string;
  interfaces: BridgeInterface[];
  routes: BridgeRoute[];
}

/** Kontrak minimal engine nyata yang dipakai facade. */
export interface NetLabBridge {
  dispatch(vendor: string, rawInput: string, context: unknown): string;
  simulatePing(nodeId: string, dstIp: string): BridgePingResult;
  getDeviceStats(nodeId: string): BridgeDeviceStats | null;
}
