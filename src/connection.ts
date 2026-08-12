import { LabEdge, LabNode, PortSpec } from './types';

/**
 * Modul terpusat untuk logika koneksi kabel (single source of truth).
 * Semua aturan port/cable dipakai dari sini — App & Canvas tidak boleh
 * mendefinisikan ulang logika yang sama di file masing-masing.
 */

/** Edge kabel yang menempel pada sebuah port device (atau null). */
export function edgeForPort(nodes: LabNode[], edges: LabEdge[], nodeId: string, portId: string): LabEdge | null {
  return (
    edges.find(
      (e) =>
        (e.sourceNodeId === nodeId && e.sourcePortId === portId) ||
        (e.targetNodeId === nodeId && e.targetPortId === portId)
    ) || null
  );
}

/** Sisi remote sebuah edge dilihat dari node tertentu. */
export function remoteSide(edge: LabEdge, nodeId: string): { nodeId: string; portId: string } {
  const isSource = edge.sourceNodeId === nodeId;
  return {
    nodeId: isSource ? edge.targetNodeId : edge.sourceNodeId,
    portId: isSource ? edge.targetPortId : edge.sourcePortId,
  };
}

export interface PortConnection {
  edge: LabEdge;
  remoteNode: LabNode;
  remotePortId: string;
  remotePortName: string;
  remoteNodeName: string;
}

/**
 * Koneksi lengkap sebuah port: edge + perangkat remote + port remote.
 * Turunan langsung dari grafik topologi (edges) — tidak ada duplikasi state.
 * Mengembalikan null bila port tidak terhubung atau remote sudah dihapus.
 */
export function portConnection(
  nodes: LabNode[],
  edges: LabEdge[],
  nodeId: string,
  portId: string
): PortConnection | null {
  const edge = edgeForPort(nodes, edges, nodeId, portId);
  if (!edge) return null;
  const remote = remoteSide(edge, nodeId);
  const remoteNode = nodes.find((n) => n.id === remote.nodeId);
  if (!remoteNode) return null;
  const remotePort = remoteNode.ports.find((p) => p.id === remote.portId);
  return {
    edge,
    remoteNode,
    remotePortId: remote.portId,
    remotePortName: remotePort?.name ?? remote.portId,
    remoteNodeName: remoteNode.name,
  };
}

export type PortHealth = 'up' | 'down' | 'admin-down' | 'not-connected' | 'unknown';

export const PORT_HEALTH_LABEL: Record<PortHealth, string> = {
  up: 'UP',
  down: 'DOWN',
  'admin-down': 'ADMIN DOWN',
  'not-connected': 'NOT CONNECTED',
  unknown: 'UNKNOWN',
};

/**
 * Status kesehatan sebuah port, turunan dari state yang ada:
 * - tanpa kabel        → NOT CONNECTED
 * - dishutdown via CLI → ADMIN DOWN (state CLI engine — shutdownIfaces)
 * - kabel sengaja down → DOWN (link failure injection)
 * - else               → UP
 *
 * Urutan prioritas mengikuti engine (getDeviceStats): not-connected
 * > admin-down > link-down > up.
 *
 * `adminDownPorts` = nama/id port yang di-shutdown via CLI (state engine),
 * di-sync App dari `vendorDispatcher.getNodeMemory().shutdownIfaces`.
 */
export function portHealth(
  port: Pick<PortSpec, 'status' | 'name' | 'id'>,
  conn: PortConnection | null,
  adminDownPorts: string[] = []
): PortHealth {
  if (!conn) return 'not-connected';
  if (adminDownPorts.includes(port.name) || adminDownPorts.includes(port.id)) return 'admin-down';
  if (port.status === 'down') return 'admin-down';
  if (conn.edge.down) return 'down';
  return 'up';
}

/**
 * Side of the connection for the port inspector. Menampilkan nama remote
 * "Device / port" dalam format stabil (tidak bergantung arah edge).
 */
export function connectionLabel(conn: PortConnection): string {
  return `${conn.remoteNodeName} / ${conn.remotePortName}`;
}

/**
 * ID VLAN access sebuah port dari state engine (`mem.portVlans` — di-set
 * lewat `set port vlan` / `switchport access vlan`/`port default vlan`).
 * Key map = nama interface (ether1, Gi0/0, …). Mengembalikan null bila
 * port tidak punya VLAN access (state default access tanpa VLAN).
 */
export function accessVlanFor(portName: string, vlanMap?: Record<string, number>): number | null {
  if (!vlanMap) return null;
  const v = vlanMap[portName];
  return typeof v === 'number' && v > 0 ? v : null;
}

/**
 * Sisi port dalam node (kiri/kanan) — diambil dari metadata port.
 * Fallback ke posisi array agar kompatibel dengan data lama.
 */
export function portSide(port: { side?: 'left' | 'right' } | undefined, fallbackIdx: number): 'left' | 'right' {
  return port?.side ?? (fallbackIdx % 2 === 0 ? 'left' : 'right');
}

/** Sisi baris port dalam node — diambil dari metadata port (fallback: posisi array). */
export function portSlot(port: { slot?: number } | undefined, fallbackIdx: number): number {
  return port?.slot ?? Math.floor(fallbackIdx / 2);
}

/** Apakah tipe kabel cocok dengan tipe media port. */
export function cableMatchesPort(cableType: string | null, portType: string | undefined): boolean {
  if (!cableType) return false;
  if (cableType === 'fiber') return portType === 'fiber';
  if (cableType === 'serial') return portType === 'serial';
  // kabel copper bisa ke port copper maupun radio (link wireless)
  return portType === 'copper' || portType === 'radio';
}

export const CABLE_TYPE_LABEL: Record<LabEdge['cableType'], string> = {
  copper_straight: 'Copper Straight',
  copper_cross: 'Copper Crossover',
  fiber: 'Fiber Optic',
  serial: 'Serial',
};

/**
 * Infer tipe kabel (auto-detection) — prioritas: media port (fiber/serial),
 * lalu class device (host ↔ network → straight, sesama network → cross).
 */
export function inferCableType(
  srcDeviceType: string,
  tgtDeviceType: string,
  srcPortType?: string,
  tgtPortType?: string
): LabEdge['cableType'] {
  const media = [srcPortType, tgtPortType].filter(Boolean);
  if (media.includes('fiber')) return 'fiber';
  if (media.includes('serial')) return 'serial';
  const srcHost = srcDeviceType === 'pc' || srcDeviceType === 'server';
  const tgtHost = tgtDeviceType === 'pc' || tgtDeviceType === 'server';
  if (srcHost !== tgtHost) return 'copper_straight';
  if (srcDeviceType === tgtDeviceType) return 'copper_cross';
  return 'copper_straight';
}