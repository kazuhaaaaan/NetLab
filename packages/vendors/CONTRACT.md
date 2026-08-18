# Contract Guarantees for @mikrolab/vendors

1. Strictly typed interfaces (tanpa `any` eksplisit; sumber dinamis lewat `recordArray`/`recordObject`).
2. Tidak ada circular dependency dengan layer paket lain.
3. `VendorDispatcher` adalah router murni — seluruh logika branch hidup di chain entries (`common/generic.ts` + `<vendor>/commands.ts`), dieksekusi `runChain` dengan urutan global `order`.
4. Semua chain terdaftar via side-effect import di `src/index.ts`; importer cukup `import { VendorDispatcher } from 'packages/vendors/src'`.
5. `serializeMemory()` mengembalikan `Record<string, NodeMemory>` — nilai selalu NodeMemory penuh (bukan snapshot parsial).
6. Batas CLI→engine hanya lewat `src/utils/cliSync.ts` (`syncNodeToEngine`, `syncDhcpPools`) dengan validasi: route (dst+gateway), bgp (asn numerik ≥ 1), acl (action permit/deny), nat (chain srcnat/dstnat), stp (mode divalidasi), fhrp (virtualAddress wajib), queues (name/target/maxLimit), dhcpRelays (string), mangleRules (chain string).
7. Output `ping`/`traceroute`/`http_get` tidak boleh dipalsukan vendor: tanpa simulator engine, hasil jaringan = respon jujur (error/unreachable), bukan "Success" karangan.
8. Perintah yang tidak didukung vendor → error jujur (`% Error …` / `unknown command`), bukan sukses palsu.
9. Kapabilitas di `capabilities.ts` harus konsisten dengan bukti test (V0 di run_all_tests.mts): klaim `supported` = ada feature case yang terbukti.