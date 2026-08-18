import type { ChainEntry, ChainEnv, CommandResult } from './types';

// ============================================================
// Chain registry — pengganti if-else raksasa di dispatch() lama.
//
// Setiap branch lama menjadi ChainEntry { name, order, vendors, match, run }.
// Chain 'generic' berisi branch tanpa guard vendor; chain per-vendor berisi
// branch dengan guard vendor tersebut (vendor pertama di guard → pemilik).
// runChain(vendorId, env) menjalankan generic + chain vendor, diurutkan
// berdasarkan `order` = posisi asli di if-else lama → perilaku identik.
// ============================================================

const CHAINS: Record<string, ChainEntry[]> = {};

/** Daftarkan batch entries untuk satu chain (generic / vendor id). */
export function registerEntries(chainName: string, entries: ChainEntry[]): void {
  const existing = CHAINS[chainName] || [];
  CHAINS[chainName] = [...existing, ...entries];
  SORTED_CACHE = null;
}

// Satu chain GLOBAL — persis if-else tunggal di dispatch() lama: setiap branch
// (dengan guard vendor-nya masing-masing) diuji untuk SEMUA vendor, diurutkan
// berdasarkan `order` = posisi asli di if-else lama. Guard di dalam entry
// (vendorId === … / vendorId===…) yang memutuskan branch berlaku atau tidak.
let SORTED_CACHE: ChainEntry[] | null = null;

function allSorted(): ChainEntry[] {
  if (!SORTED_CACHE) {
    const flat: ChainEntry[] = [];
    for (const name of Object.keys(CHAINS)) flat.push(...CHAINS[name]);
    SORTED_CACHE = flat.sort((a, b) => a.order - b.order);
  }
  return SORTED_CACHE;
}

/**
 * Jalankan chain untuk satu vendor — urutan global dispatch() lama dipertahankan
 * via `order`. HARD: entry yang match menghentikan chain (meski run() undefined).
 * SOFT: entry yang run() kembalikan undefined MELANJUTKAN chain (handler
 * opsional seperti handleDeletion / snmpCommand / vendor command functions).
 */
export function runChain(vendorId: string, env: ChainEnv): CommandResult | undefined {
  for (const entry of allSorted()) {
    if (!entry.match(env)) continue;
    const result = entry.run(env);
    if (result !== undefined) return result;
  }
  return undefined;
}