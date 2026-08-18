# TODO Items for @mikrolab/vendors

## Status: SELESAI (refactor dispatcher + typecheck)

- [x] Refactor `VendorDispatcher` monolit (~6053 baris, if-else raksasa) → **router murni** + chain entries (`common/generic.ts` + `<vendor>/commands.ts`), dijalankan oleh `runChain` (satu chain global terurut `order` — semantik if-else lama dipertahankan eksak).
- [x] TypeScript ketat: eliminasi seluruh `any` eksplisit; sumber dinamis (parser/CLI) dijaga via `recordArray`/`recordObject`.
- [x] `tsc --noEmit` seluruh repo: **0 error** (sebelumnya ±370 error di paket ini + 42 di App/test).
- [x] Regression penuh: **1498 test pass, 0 failed** (identik dengan baseline HEAD) — `npm test` = `tsx run_all_tests.mts`.
- [x] Batas CLI→engine tunggal: `src/utils/cliSync.ts` (`syncNodeToEngine`, `syncDhcpPools`) dengan validasi; App.tsx + replica test mendelegasikan ke helper (tidak ada salinan duplikat).
- [x] `serializeMemory()` → `Record<string, NodeMemory>` (jujur: selalu NodeMemory penuh; JSON roundtrip).
- [x] Bug runtime yang ditemukan & diperbaiki selama refactor: (1) registrasi chain butuh side-effect import di `index.ts`; (2) nama chain `cisco-ios`/`cisco-nxos` (dash) vs vendorId `cisco_ios`/`cisco_nxos` (underscore); (3) chain per-vendor kaku → satu chain global.
- [x] Efektif dipakai aplikasi: `src/App.tsx` + engine + storage memakai paket ini via `src/utils/cliSync.ts`.

## Berikutnya

- [ ] Unit test khusus per package (isolated) & typedoc.
- [ ] Prompt 2: network protocol fidelity (IPv6, EIGRP, FHRP/VRRP, QoS, TCP/L4, NAT, Firewall, DHCP/DNS, Wireless, SNMP) — label kapabilitas jujur, lihat PROMPT.md.