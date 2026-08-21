// ============================================================
// Topology — LabProject → devices + link table
// ============================================================

import { DeviceFactory, NodeLike } from '../devices/DeviceFactory';
import { LinkSpec, NetworkInterface, Packet } from './types';

export interface LabProjectLike {
  nodes: NodeLike[];
  edges: {
    id: string;
    sourceNodeId: string;
    sourcePortId: string;
    targetNodeId: string;
    targetPortId: string;
    cableType: string;
    latencyMs?: number;
    bandwidthMbps?: number;
    down?: boolean;
  }[];
}

export interface Neighbor {
  nodeId: string;
  port: string;
  linkId: string;
}

/** Peta: nodeId → port → daftar peer (nodeId, port, linkId).
 *  Satu port boleh memiliki BANYAK kabel (segment hub): SEMUA frame yang
 *  keluar dari port itu direplikasi ke setiap kabel, dan host yang tidak
 *  ber-MAC cocok menolak frame via l2-filter. */
export class LinkTable {
  private map = new Map<string, Map<string, Neighbor[]>>();
  private links = new Map<string, LinkSpec>();
  private portsOf = new Map<string, Set<string>>();

  addLink(link: LinkSpec): void {
    this.links.set(link.id, link);
    const set = (nodeId: string, port: string) => {
      const m = this.map.get(nodeId) || new Map<string, Neighbor[]>();
      const list = m.get(port) || [];
      list.push({ ...link.b, linkId: link.id });
      m.set(port, list);
      this.map.set(nodeId, m);
      const ps = this.portsOf.get(nodeId) || new Set<string>();
      ps.add(port);
      this.portsOf.set(nodeId, ps);
    };
    set(link.a.nodeId, link.a.port);
    // sisi kedua memakai ujung b (port b pada node b terhubung ke a)
    const m = this.map.get(link.b.nodeId) || new Map<string, Neighbor[]>();
    const list = m.get(link.b.port) || [];
    list.push({ ...link.a, linkId: link.id });
    m.set(link.b.port, list);
    this.map.set(link.b.nodeId, m);
    const ps = this.portsOf.get(link.b.nodeId) || new Set<string>();
    ps.add(link.b.port);
    this.portsOf.set(link.b.nodeId, ps);
  }

  /** Semua peer sebuah port (segment hub: bisa lebih dari satu). */
  neighborsOf(nodeId: string, port: string): Neighbor[] {
    const m = this.map.get(nodeId);
    if (!m) return [];
    return m.get(port) || [];
  }

  /** Peer pertama sebuah port — kompatibilitas dengan pemakaian lama
   *  (port point-to-point selalu punya tepat satu peer). */
  neighborOf(nodeId: string, port: string): Neighbor | null {
    const all = this.neighborsOf(nodeId, port);
    return all.length > 0 ? all[0] : null;
  }

  linksOf(nodeId: string): LinkSpec[] {
    const out: LinkSpec[] = [];
    for (const [id, link] of this.links) {
      if (link.a.nodeId === nodeId || link.b.nodeId === nodeId) out.push(link);
    }
    return out;
  }

  linkById(id: string): LinkSpec | null {
    return this.links.get(id) || null;
  }

  get all(): LinkSpec[] {
    return [...this.links.values()];
  }

  clear(): void {
    this.map.clear();
    this.links.clear();
    this.portsOf.clear();
  }

  /** Kabel yang menempel di sebuah port. */
  linkOn(nodeId: string, port: string): LinkSpec | null {
    const m = this.map.get(nodeId);
    if (!m) return null;
    const n = m.get(port);
    if (!n || n.length === 0) return null;
    return this.links.get(n[0].linkId) || null;
  }
}

/** Perkiraan delay propagasi sebuah kabel (ms virtual). */
export function linkDelayMs(cableType: string): number {
  switch (cableType) {
    case 'fiber':
      return 1;
    case 'serial':
      return 5;
    default:
      return 2;
  }
}

export class Topology {
  readonly factory = new DeviceFactory();
  links = new LinkTable();
  /** Edge yang ditolak saat sync (referensi node/port hilang, self-loop, duplikat). */
  lastSkippedEdges: { id: string; reason: string }[] = [];

  sync(project: LabProjectLike): { nodes: Map<string, import('../devices/NetworkDevice').NetworkDevice> } {
    const nodes = new Map<string, import('../devices/NetworkDevice').NetworkDevice>();
    const skipped: { id: string; reason: string }[] = [];
    for (const n of project.nodes) {
      nodes.set(n.id, this.factory.create(n));
    }
    this.links.clear();
    const seen = new Set<string>();
    for (const e of project.edges) {
      const aNode = nodes.get(e.sourceNodeId);
      const bNode = nodes.get(e.targetNodeId);
      if (!aNode || !bNode) {
        skipped.push({ id: e.id || '(no-id)', reason: `node tidak ditemukan (${e.sourceNodeId}→${e.targetNodeId})` });
        continue;
      }
      const aPort = aNode.getIfaceByPortId(e.sourcePortId);
      const bPort = bNode.getIfaceByPortId(e.targetPortId);
      if (!aPort || !bPort) {
        skipped.push({
          id: e.id || '(no-id)',
          reason: `port tidak ditemukan (${e.sourceNodeId}:${e.sourcePortId} → ${e.targetNodeId}:${e.targetPortId})`,
        });
        continue;
      }
      // self-loop: kabel yang menempel port ke port itu sendiri.
      if (e.sourceNodeId === e.targetNodeId && e.sourcePortId === e.targetPortId) {
        skipped.push({ id: e.id || '(no-id)', reason: 'self-loop ditolak' });
        continue;
      }
      // kabel ganda antara dua port yang sama (duplikat) — cegah state korup.
      const key = [e.sourceNodeId, e.sourcePortId, e.targetNodeId, e.targetPortId].join('|');
      const keyRev = [e.targetNodeId, e.targetPortId, e.sourceNodeId, e.sourcePortId].join('|');
      if (seen.has(key) || seen.has(keyRev)) {
        skipped.push({ id: e.id || '(no-id)', reason: 'edge duplikat ditolak' });
        continue;
      }
      seen.add(key);
      this.links.addLink({
        id: e.id,
        a: { nodeId: e.sourceNodeId, port: e.sourcePortId },
        b: { nodeId: e.targetNodeId, port: e.targetPortId },
        cableType: e.cableType,
        latencyMs: e.latencyMs,
        bandwidthMbps: e.bandwidthMbps,
        down: e.down,
      });
    }
    this.lastSkippedEdges = skipped;
    return { nodes };
  }
}

/** Ujung port sebuah device yang menempel kabel tertentu. */
export function portOf(nodeId: string, iface: NetworkInterface): string {
  return iface.parentPort || iface.name;
}

/** Latensi efektif sebuah kabel (ms) — override custom bila di-set. */
export function linkLatencyMs(link: Pick<LinkSpec, 'cableType' | 'latencyMs'> | null | undefined): number {
  if (link && typeof link.latencyMs === 'number' && link.latencyMs >= 0) return link.latencyMs;
  return linkDelayMs(link?.cableType || 'copper_straight');
}

/** Delay transmisi (propagasi + waktu kirim) untuk paket pada sebuah kabel. */
export function transmissionDelay(link: LinkSpec | null | undefined, pkt: Packet): number {
  const base = linkLatencyMs(link);
  const bits = Math.max(64, pkt.size) * 8;
  const linkSpeed = link?.bandwidthMbps || 1000; // Mbit/s
  const serial = bits / (Math.max(1, linkSpeed) * 1e6) * 1000; // ms
  return Math.max(1, Math.round(base + serial));
}
