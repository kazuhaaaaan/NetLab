/**
 * LEGACY BARREL — src/engine/sim adalah engine generasi lama (SimulationEngine).
 * ENGINE PRODUKSI = src/engine/net (NetworkSimulator). Modul ini TIDAK diimpor
 * oleh produksi maupun test (verifikasi: grep "engine/sim" — hanya komentar).
 * formatPing dipindah ke src/engine/net/services/formatPing (masih runtime-used
 * sebagai pemformat CLI); berkas lama tetap ada sebagai re-export saja.
 *
 * MIGRATION: hapus file simulation.ts / simdevice.ts / packet.ts / ip.ts /
 * index.ts setelah semua impor lama dibersihkan (lihat sim/formatPing.ts).
 */
export * from './ip';
export * from './packet';
export * from './simdevice';
export * from './simulation';