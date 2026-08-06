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
  }[];
}

export interface Neighbor {
  nodeId: string;
  port: string;
  linkId: string;
}

/** Peta: nodeId → port → peer (nodeId, port, linkId). */
export class LinkTable {
  private map = new Map<string, Map<string, Neighbor>>();
  private links = new Map<string, LinkSpec>();
  private portsOf = new Map<string, Set<string>>();

  addLink(link: LinkSpec): void {
    this.links.set(link.id, link);
    const set = (nodeId: string, port: string) => {
      const m = this.map.get(nodeId) || new Map<string, Neighbor>();
      m.set(port, { ...link.b, linkId: link.id });
      this.map.set(nodeId, m);
      const ps = this.portsOf.get(nodeId) || new Set<string>();
      ps.add(port);
      this.portsOf.set(nodeId, ps);
    };
    set(link.a.nodeId, link.a.port);
    // sisi kedua memakai ujung b (port b pada node b terhubung ke a)
    const m = this.map.get(link.b.nodeId) || new Map<string, Neighbor>();
    m.set(link.b.port, { ...link.a, linkId: link.id });
    this.map.set(link.b.nodeId, m);
    const ps = this.portsOf.get(link.b.nodeId) || new Set<string>();
    ps.add(link.b.port);
    this.portsOf.set(link.b.nodeId, ps);
  }

  neighborOf(nodeId: string, port: string): Neighbor | null {
    const m = this.map.get(nodeId);
    if (!m) return null;
    return m.get(port) || null;
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
    if (!n) return null;
    return this.links.get(n.linkId) || null;
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

  sync(project: LabProjectLike): { nodes: Map<string, import('../devices/NetworkDevice').NetworkDevice> } {
    const nodes = new Map<string, import('../devices/NetworkDevice').NetworkDevice>();
    for (const n of project.nodes) {
      nodes.set(n.id, this.factory.create(n));
    }
    this.links.clear();
    for (const e of project.edges) {
      this.links.addLink({
        id: e.id,
        a: { nodeId: e.sourceNodeId, port: e.sourcePortId },
        b: { nodeId: e.targetNodeId, port: e.targetPortId },
        cableType: e.cableType,
      });
    }
    return { nodes };
  }
}

/** Ujung port sebuah device yang menempel kabel tertentu. */
export function portOf(nodeId: string, iface: NetworkInterface): string {
  return iface.parentPort || iface.name;
}

/** Delay transmisi (propagasi + waktu kirim) untuk paket pada sebuah kabel. */
export function transmissionDelay(cableType: string, pkt: Packet): number {
  const base = linkDelayMs(cableType);
  const bits = Math.max(64, pkt.size) * 8;
  const linkSpeed = cableType === 'fiber' ? 1000 : 1000; // Mbit/s
  const serial = bits / (linkSpeed * 1e6) * 1000; // ms
  return Math.max(1, Math.round(base + serial));
}
