/**
 * LEGACY — src/engine/sim adalah engine generasi lama (SimulationEngine /
 * SimDevice / packet), BUKAN engine produksi. Engine produksi = src/engine/net
 * (NetworkSimulator), dipakai App.tsx, GradingModal, PingPanel, dan tests.
 *
 * Berkas ini (formatPing) adalah SATU-SATUNYA bagian engine/sim yang masih
 * dipakai saat runtime — dan hanya sebagai pemformat teks CLI. Implementasi
 * sebenarnya kini berada di src/engine/net/services/formatPing.ts; berkas ini
 * hanya re-export agar impor lama (engine/net atau run_all_tests) tetap jalan.
 *
 * MIGRATION PLAN (untuk phase berikutnya):
 * 1. sim/simulation.ts, sim/simdevice.ts, sim/packet.ts, sim/ip.ts — DEAD
 *    CODE: tidak diimpor produksi maupun test (verifikasi: grep engine/sim).
 *    Langkah aman: hapus setelah formatPing re-export dihapus.
 * 2. Tidak ada test yang memakai SimulationEngine lama; section 4 run_all_tests
 *    sudah menguji NetworkSimulator produksi dengan nama SimulationEngine.
 * 3. update impor run_all_tests.mts dari './src/engine/sim/formatPing' → net.
 * 4. engine/vendors/*.ts adalah adapter KLASIFIKASI (bukan engine) — masih
 *    dipakai pipeline facade (src/engine/cli/parser.ts) dan tetap dipertahankan.
 */

export { formatPingOutput, formatTracerouteOutput } from '../net/services/formatPing';
export type { PingSimResult, TracerouteResult, TracerouteHop } from '../net/compat';