# TODO Items for @mikrolab/vendors

## Status: SELESAI (inti)
- [x] Implementasi inti diuji (440 test, run_all_tests.mts: 0 failed)
- [x] Efektif dipakai aplikasi (lihat catatan di bawah)

VendorDispatcher lengkap (6053 baris): 10 adapters vendor + engine snapshot routing/OSPF/BGP/DHCP/DNS + CLI validasi. Diuji §2-§3.

## Berikutnya
- [ ] Migrasi implementasi lengkap dari src/engine + packages/vendors ke package ini (pemurnian arsitektur monorepo)
- [ ] Unit test khusus per package (isolated) & typedoc
