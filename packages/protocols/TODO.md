# TODO Items for @mikrolab/protocols

## Status: SELESAI (inti)
- [x] Implementasi inti diuji (440 test, run_all_tests.mts: 0 failed)
- [x] Efektif dipakai aplikasi (lihat catatan di bawah)

OSPFRIP/BGP, ARP, IPv4/IPv6/ICMP, STP, FHRP, DHCP, NAT: src/engine/net/services + layer3 + RoutingProtocolEngine. Diuji §6-§19.

## Berikutnya
- [ ] Migrasi implementasi lengkap dari src/engine + packages/vendors ke package ini (pemurnian arsitektur monorepo)
- [ ] Unit test khusus per package (isolated) & typedoc
