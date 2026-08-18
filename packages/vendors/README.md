# @mikrolab/vendors

> NetLab Vendor Syntax Adapters

Paket vendor syntax adapters: menerjemahkan CLI syntax MikroTik RouterOS, Cisco IOS, Cisco NX-OS, Juniper JunOS, Huawei VRP, Ubiquiti EdgeOS, VyOS, Fortinet, Aruba, OpenWrt, dan Linux/OpenWrt menjadi perintah ternormalisasi + mutasi state (NodeMemory).

## Arsitektur (setelah refactor dispatcher)

- `dispatcher/VendorDispatcher.ts` — **router murni** (bukan if-else raksasa lagi): lookup adapter + memory, parse, jalankan chain, format respons, hook simulator.
- `common/chain.ts` — registri chain entries; `runChain` menjalankan SATU chain global terurut `order` (= posisi asli if-else lama), guard `vendorId === …` di dalam entry memutuskan vendor mana yang terpengaruh.
- `common/generic.ts` — branch tanpa guard vendor (ip address, route, bgp, nat, acl, vlan, snmp, dll).
- `<vendor>/commands.ts` — branch ber-guard vendor (termasuk guard multi-vendor: `cisco_ios || cisco_nxos || aruba || huawei`, `juniper || ubiquiti || vyos`, `linux || openwrt`).
- `<vendor>/adapter.ts` — parseSyntax + formatResponse per vendor.
- `common/types.ts` — tipe bersama (NodeMemory, CommandResult, ChainEntry/ChainEnv, dst). TypeScript strict di seluruh paket: **0 error tsc, 0 `any`**.
- `common/memory.ts`, `common/format.ts`, `common/ip.ts`, `common/state.ts`, `common/snmp.ts`, `common/deletion.ts`, `common/errors.ts` — utilitas + `handleDeletion` (perintah `no …`/`remove`/`delete`/`undo`).

## Aturan main

1. `registerEntries` dipanggil sebagai **side-effect di `src/index.ts`** — importer cukup `import { VendorDispatcher } from 'packages/vendors/src'`; tanpa ini chain kosong.
2. Entry baru wajib punya `name`, `order` (= posisi relatif pada alur if-else lama), `match`, `run`.
3. Simulator tidak boleh dipalsukan oleh vendor (lihat CONTRACT.md).
