// ============================================================
// windowManager — SATU sumber kebenaran untuk state window manager
// Windows Desktop (aktif, minimized, z-index, posisi, ukuran).
// Murni & bisa diuji tanpa React.
// ============================================================

export interface ManagedWin {
  id: string;
  minimized: boolean;
  z: number;
  pos: { x: number; y: number };
}

export interface WinArea {
  w: number;
  h: number;
}

export interface ZCounter {
  v: number;
}

/** Ukuran jendela adaptif: min(ukuran default, area) — mobile ≈ fullscreen. */
export function fitWindow(defaultW: number, defaultH: number, area: WinArea): { width: number; height: number } {
  const isSmall = Math.min(area.w, area.h) < 640;
  const pad = isSmall ? 4 : 16;
  return {
    width: Math.max(240, Math.min(defaultW, area.w - pad * 2)),
    height: Math.max(180, Math.min(defaultH, area.h - pad * 2 - 8)),
  };
}

export function topWin<T extends ManagedWin>(list: T[]): T | undefined {
  return [...list].sort((a, b) => b.z - a.z)[0];
}

/** Buka (atau restore+fokus bila sudah ada) — z tertinggi, minimized=false. */
export function openWin<T extends ManagedWin>(list: T[], win: T, counter: ZCounter): T[] {
  const z = ++counter.v;
  const existing = list.find((w) => w.id === win.id);
  if (existing) {
    return list.map((w) => (w.id === win.id ? { ...w, minimized: false, z } : w));
  }
  return [...list, { ...win, minimized: false, z }];
}

/** Restore (jika minimized) + jadikan aktif — z tertinggi. */
export function focusWin<T extends ManagedWin>(list: T[], id: string, counter: ZCounter): T[] {
  const z = ++counter.v;
  return list.map((w) => (w.id === id ? { ...w, minimized: false, z } : w));
}

export function minimizeWin<T extends ManagedWin>(list: T[], id: string): T[] {
  return list.map((w) => (w.id === id ? { ...w, minimized: true } : w));
}

export function closeWin<T extends ManagedWin>(list: T[], id: string): T[] {
  return list.filter((w) => w.id !== id);
}

/**
 * Perilaku klik ikon taskbar (Windows nyata):
 *  - minimized → restore + fokus (z tertinggi)
 *  - aktif & di atas → minimize
 *  - terbuka tapi bukan di atas → fokus
 */
export function toggleWin<T extends ManagedWin>(list: T[], id: string, counter: ZCounter): T[] {
  const w = list.find((x) => x.id === id);
  if (!w) return list;
  if (w.minimized) return focusWin(list, id, counter);
  const top = topWin(list);
  if (top?.id === id) return minimizeWin(list, id);
  return focusWin(list, id, counter);
}

/** Posisi cascade agar jendela baru tidak menumpuk tepat di jendela lain. */
export function cascadePos(index: number, size: { width: number; height: number }, area: WinArea): { x: number; y: number } {
  const isSmall = Math.min(area.w, area.h) < 640;
  const pad = isSmall ? 2 : 12;
  const x = Math.max(pad, Math.min((index % 6) * 24 + pad, area.w - size.width - pad));
  const y = Math.max(pad, Math.min((index % 6) * 20 + pad, area.h - size.height - pad));
  return { x, y };
}