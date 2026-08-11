# TODO Items for @mikrolab/canvas

## Status: SELESAI (inti)
- [x] Implementasi inti diuji (440 test, run_all_tests.mts: 0 failed)
- [x] Efektif dipakai aplikasi (lihat catatan di bawah)

Canvas 60 FPS + unified pointer interaction engine: src/components/Canvas.tsx + src/engine/InteractionEngine.ts, SVG cable renderer, warna kabel per jenis.

## Berikutnya
- [ ] Migrasi implementasi lengkap dari src/engine + packages/vendors ke package ini (pemurnian arsitektur monorepo)
- [ ] Unit test khusus per package (isolated) & typedoc
