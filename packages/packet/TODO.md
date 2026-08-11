# TODO Items for @mikrolab/packet

## Status: SELESAI (inti)
- [x] Implementasi inti diuji (440 test, run_all_tests.mts: 0 failed)
- [x] Efektif dipakai aplikasi (lihat catatan di bawah)

Pemrosesan frame/paket aktual di src/engine/net (Ethernet II, VLAN tag, ARP, IPv4/6, ICMP) — diuji §6-§19 run_all_tests.mts.

## Berikutnya
- [ ] Migrasi implementasi lengkap dari src/engine + packages/vendors ke package ini (pemurnian arsitektur monorepo)
- [ ] Unit test khusus per package (isolated) & typedoc
