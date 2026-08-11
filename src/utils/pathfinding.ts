// ============================================================
// Pathfinding topologi (Tugas 4) — BFS sederhana di atas edge
// aktif (kabel yang tidak di-down-kan; perangkat yang menyala).
// Dipakai "Simulasi Jaringan" untuk mengecek konektivitas L1/L2
// dan menghasilkan lintasan kabel untuk animasi paket.
// ============================================================

import { LabEdge, LabNode } from '../types';

export interface PathResult {
  ok: boolean;
  /** edge ids berurutan dari sumber → tujuan (BFS terpendek). */
  edgeIds: string[];
  /** node ids berurutan sumber → tujuan (termasuk ujung). */
  nodeIds: string[];
  /** node tujuan tercapai atau berhenti di node terakhir yang terjangkau. */
  reachedAt: string | null;
}

/** Apakah kabel dianggap aktif untuk dilalui paket. */
function isEdgeTraversable(e: LabEdge): boolean {
  return !e.down;
}

/** Apakah perangkat bisa dilalui (menyala). */
function isNodeTraversable(n: LabNode): boolean {
  return n.powered !== false;
}

/**
 * BFS lintasan terpendek antara dua perangkat.
 * Kembalikan rincian path atau lokasi terputus untuk diagnostik.
 */
export function findPath(srcId: string, dstId: string, nodes: LabNode[], edges: LabEdge[]): PathResult {
  if (srcId === dstId) {
    return { ok: true, edgeIds: [], nodeIds: [srcId], reachedAt: srcId };
  }
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const adjacency = new Map<string, { nodeId: string; edgeId: string }[]>();
  for (const n of nodes) adjacency.set(n.id, []);
  for (const e of edges) {
    adjacency.get(e.sourceNodeId)?.push({ nodeId: e.targetNodeId, edgeId: e.id });
    adjacency.get(e.targetNodeId)?.push({ nodeId: e.sourceNodeId, edgeId: e.id });
  }

  const src = nodeById.get(srcId);
  const dst = nodeById.get(dstId);
  if (!src) return { ok: false, edgeIds: [], nodeIds: [], reachedAt: null };
  if (!dst) return { ok: false, edgeIds: [], nodeIds: [], reachedAt: null };

  // BFS — hanya lewati node menyala & edge tidak down
  const prevNode = new Map<string, string | null>();
  const prevEdge = new Map<string, string>();
  const seen = new Set<string>([srcId]);
  let frontier = [srcId];

  while (frontier.length > 0) {
    const next: string[] = [];
    for (const cur of frontier) {
      if (cur === dstId) {
        // rekonstruksi lintasan
        const edgeIds: string[] = [];
        const nodeIds: string[] = [dstId];
        let walk = dstId;
        while (walk !== srcId) {
          const pe = prevEdge.get(walk);
          const pn = prevNode.get(walk);
          if (!pe || !pn) break;
          edgeIds.unshift(pe);
          nodeIds.unshift(pn);
          walk = pn;
          if (nodeIds.length > 200) break; // pengaman topologi gila
        }
        return { ok: true, edgeIds, nodeIds, reachedAt: dstId };
      }
      for (const { nodeId, edgeId } of adjacency.get(cur) ?? []) {
        const edge = edges.find((e) => e.id === edgeId);
        const node = nodeById.get(nodeId);
        if (!edge || !node) continue;
        if (!isEdgeTraversable(edge) || !isNodeTraversable(node)) continue;
        if (seen.has(nodeId)) continue;
        seen.add(nodeId);
        prevNode.set(nodeId, cur);
        prevEdge.set(nodeId, edgeId);
        next.push(nodeId);
      }
    }
    frontier = next;
  }

  // Tidak tercapai — cari node terjauh yang dapat dijangkau untuk diagnostik
  let farthest: string | null = null;
  let farthestDist = 0;
  const depthMap = new Map<string, number>();
  let layer = 0;
  let cur = [srcId];
  const visited = new Set<string>([srcId]);
  while (cur.length > 0) {
    const nxt: string[] = [];
    for (const c of cur) {
      depthMap.set(c, layer);
      if (layer > farthestDist) {
        farthestDist = layer;
        farthest = c;
      }
      for (const { nodeId, edgeId } of adjacency.get(c) ?? []) {
        const edge = edges.find((e) => e.id === edgeId);
        const node = nodeById.get(nodeId);
        if (!edge || !node) continue;
        if (!isEdgeTraversable(edge) || !isNodeTraversable(node)) continue;
        if (visited.has(nodeId)) continue;
        visited.add(nodeId);
        nxt.push(nodeId);
      }
    }
    cur = nxt;
    layer++;
  }
  return { ok: false, edgeIds: [], nodeIds: [srcId], reachedAt: farthest };
}

export interface ProgressItem {
  nodeId: string;
  status: 'ok' | 'blocked';
  reason?: string;
}

/** Lintasan + status tiap hop (sumber → tujuan), termasuk hop yang diblokir. */
export function tracePath(srcId: string, dstId: string, nodes: LabNode[], edges: LabEdge[]): ProgressItem[] {
  const path = findPath(srcId, dstId, nodes, edges);
  const items: ProgressItem[] = [];
  for (let i = 0; i < path.nodeIds.length; i++) {
    const id = path.nodeIds[i];
    const node = nodes.find((n) => n.id === id);
    items.push({
      nodeId: id,
      status: node && node.powered === false ? 'blocked' : 'ok',
      reason: node && node.powered === false ? 'perangkat mati (power OFF)' : undefined,
    });
  }
  return items;
}