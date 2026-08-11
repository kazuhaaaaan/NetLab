import { LabEdge } from './types';

/**
 * Modul terpusat untuk logika koneksi kabel (single source of truth).
 * Semua aturan port/cable dipakai dari sini — App & Canvas tidak boleh
 * mendefinisikan ulang logika yang sama di file masing-masing.
 */

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