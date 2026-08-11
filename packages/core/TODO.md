# TODO Items for @mikrolab/core

## Status: SELESAI (inti)
- [x] Implementasi inti diuji (440 test, run_all_tests.mts: 0 failed)
- [x] Efektif dipakai aplikasi (lihat catatan di bawah)

CoreTopologyEngine dipakai aplikasi; pola yang sama diperluas di src/engine/net + src/engine/sim. Integritas data diuji di run_all_tests.mts §5.

## Berikutnya
- [ ] Migrasi implementasi lengkap dari src/engine + packages/vendors ke package ini (pemurnian arsitektur monorepo)
- [ ] Unit test khusus per package (isolated) & typedoc
