# Architecture Specification for @mikrolab/vendors

## Sebelum refactor

`VendorDispatcher` = monolit ~6053 baris: satu `dispatch()` berisi if-else raksasa (~150 branch) yang mencampur parse, mutasi memory, dan format respons untuk 10 vendor.

## Sesudah refactor

```
packages/vendors/src/
├── index.ts                 — public API + side-effect registrasi semua chain
├── capabilities.ts          — registry kapabilitas vendor (V0 test = konsistensi)
├── common/
│   ├── types.ts             — NodeMemory, CommandResult, ChainEntry/ChainEnv, dsb.
│   ├── chain.ts             — registerEntries + runChain (satu chain GLOBAL terurut)
│   ├── generic.ts           — branch tanpa guard vendor (order = posisi if-else lama)
│   ├── memory.ts            — MemoryRegistryImpl + blankNodeMemory + serializeMemory
│   ├── format.ts            — generateRunningConfig / export config per vendor
│   ├── deletion.ts          — handleDeletion: "no …", "/ip … remove", "delete …", "undo …"
│   ├── ip.ts / state.ts     — util IP (isPrefix, toCidr) + portOperational/STP helpers
│   ├── snmp.ts              — handler SNMP agent (snmpCommand)
│   └── errors.ts            — unknownCommand / knownUnsupported (no fake success)
├── dispatcher/VendorDispatcher.ts — router murni
├── <vendor>/adapter.ts      — parseSyntax + formatResponse
└── <vendor>/commands.ts     — branch ber-guard vendor (ChainEntry[])
```

## Alur dispatch

1. `VendorDispatcher.dispatch(vendorId, rawInput, context)`
2. dekorasi `context.ports` dengan `linkConnected`/`linkDown` dari topologi
3. `adapter.parseSyntax(rawInput)` → `NormalizedCommand`
4. `runChain(vendorId, env)` — iterasi SEMUA entry (generic + semua vendor) terurut `order`; entry yang `match` (guard vendorId/regex/normalized.action) dan `run()` mengembalikan `CommandResult` akan berhenti; `undefined` melanjutkan chain
5. fallback `knownUnsupported`/`unknownCommand` → `formatResponse` → hook simulator (ping/traceroute/http_get) bila disediakan host

## Mengapa satu chain global?

HEAD adalah satu if-else untuk semua vendor; banyak branch ber-guard multi-vendor (mis. `cisco_ios || cisco_nxos || aruba || huawei`). Chain per-vendor yang kaku membuat entry semacam itu tidak pernah berjalan untuk vendor lain. Satu chain global terurut `order` = semantik if-else lama secara eksak.

## Batas integrasi (CLI → engine)

`src/utils/cliSync.ts` (di root app, bukan di paket ini) menyediakan `syncNodeToEngine`/`syncDhcpPools` — satu-satunya jalur resmi mensinkronkan NodeMemory vendor ke SimulationEngine, dengan validasi di batas (route dst/gateway, bgp asn numerik, acl action permit/deny, nat chain srcnat/dstnat, stp mode, fhrp virtualAddress, queues, dhcpRelays, mangleRules).