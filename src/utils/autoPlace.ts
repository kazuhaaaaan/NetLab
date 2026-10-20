// ============================================================
// autoPlace — penempatan perangkat otomatis di canvas.
// Deterministik (tanpa Math.random): same nodes = same layout.
// Dipakai saat load template/preset dan saat user menambah device
// supaya tidak pernah tumpang-tindih (anti overlap).
// ============================================================

import type { LabProject, LabNode, Point } from '../types';

/** Dimensi card node di Canvas (lihat Canvas.tsx NODE_W/NODE_H). */
const NODE_W = 96;
const NODE_H = 88;

/** Jarak minimum antar node sebelum dianggap tumpang-tindih. */
const GAP_X = NODE_W + 20;
const GAP_Y = NODE_H + 10;

/** Step grid auto-layout (deterministik). */
const GRID_X = 220;
const GRID_Y = 140;
const COLS = 5;
const ORIGIN: Point = { x: 140, y: 140 };

/** Dua node tumpang-tindih bila jarak X dan Y keduanya di bawah gap. */
export function nodesOverlap(a: LabNode, b: LabNode): boolean {
  const ax = a.position?.x;
  const ay = a.position?.y;
  const bx = b.position?.x;
  const by = b.position?.y;
  if (
    typeof ax !== 'number' || typeof ay !== 'number' ||
    typeof bx !== 'number' || typeof by !== 'number' ||
    !Number.isFinite(ax) || !Number.isFinite(ay) ||
    !Number.isFinite(bx) || !Number.isFinite(by)
  ) {
    return true; // posisi rusak/hilang dianggap tidak valid
  }
  return Math.abs(ax - bx) < GAP_X && Math.abs(ay - by) < GAP_Y;
}

/** Semua node punya posisi valid & tidak ada yang tumpang-tindih. */
export function hasValidLayout(nodes: LabNode[]): boolean {
  for (let i = 0; i < nodes.length; i++) {
    const p = nodes[i].position;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
    for (let j = i + 1; j < nodes.length; j++) {
      if (nodesOverlap(nodes[i], nodes[j])) return false;
    }
  }
  return true;
}

/**
 * Slot grid pertama dari `origin` yang bebas dari semua node `nodes`.
 * Kandidat menyebar ke kanan lalu ke bawah (COLS kolom), deterministik.
 */
export function nextFreePosition(nodes: LabNode[], origin: Point = ORIGIN): Point {
  const occupied = nodes.map((n) => n.position).filter(Boolean);
  const free = (x: number, y: number) =>
    !occupied.some((o) => Math.abs(o.x - x) < GAP_X && Math.abs(o.y - y) < GAP_Y);

  for (let i = 0; i < 256; i++) {
    const x = origin.x + (i % COLS) * GRID_X;
    const y = origin.y + Math.floor(i / COLS) * GRID_Y;
    if (free(x, y)) return { x, y };
  }
  // Grid penuh → baris baru di bawah (tetap deterministik).
  const row = Math.ceil(256 / COLS);
  return { x: origin.x, y: origin.y + row * GRID_Y };
}

/**
 * Guard saat load template/preset: bila layout sudah valid → biarkan
 * (posisi buatan penulis dipertahankan); bila ada node tumpang-tindih /
 * posisi hilang → seluruh node diatur ulang ke grid deterministik.
 */
export function autoPlaceProject(project: LabProject): LabProject {
  if (hasValidLayout(project.nodes)) return project;
  const nodes: LabNode[] = project.nodes.map((n, i) => ({
    ...n,
    position: nextFreePosition(project.nodes.slice(0, i), ORIGIN),
  }));
  return { ...project, nodes };
}
