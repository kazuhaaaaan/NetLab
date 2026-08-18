# AI Prompt Directives for @mikrolab/vendors

1. Jangan merusak kontrak bersih yang didefinisikan di CONTRACT.md.
2. Pertahankan nol dependensi server eksternal.
3. Entry chain baru: wajib `name`, `order` (posisi relatif pada alur if-else lama), `match`, `run`. Jangan panggil `registerEntries` di luar `src/index.ts` (side-effect import) — chain lain tidak boleh bergantung pada urutan import.
4. Jangan menambah `any` eksplisit. Sumber dinamis (parser/CLI) wajib lewat `recordArray`/`recordObject`.
5. Jangan membuat salinan `syncNodeToEngine`/`syncDhcpPools` baru — gunakan `src/utils/cliSync.ts` di root app.
6. Batas CLI→engine wajib divalidasi (route dst/gateway, bgp asn, acl permit/deny, nat srcnat/dstnat, stp mode, fhrp virtualAddress, queues, dhcpRelays, mangleRules) — tidak boleh ada "fake success" (lihat CONTRACT.md aturan 12).

## Deliverable Prompt 1 (refactor vendor — selesai)

1. Dispatcher monolit → router murni + chain entries terurut.
2. Eliminasi `any` eksplisit; strict typecheck 0 error.
3. Satu chain global (semantik if-else lama) — fix chain kosong / nama dash-underscore.
4. `src/utils/cliSync.ts` — batas CLI→engine tunggal dengan validasi.
5. App.tsx + kedua replica test mendelegasikan ke helper (hapus duplikasi).
6. `serializeMemory(): Record<string, NodeMemory>`.
7. Regresi penuh 1498/0 (identik HEAD).
8. Bug runtime chain registration (side-effect import index.ts).
9. Dokumen ini + ARCHITECTURE/README/TODO/API diperbarui.
10. Commit + push ke GitHub (instruksi user) setelah semua hijau.

## Deliverable Prompt 2 (protocol fidelity — belum dikerjakan)

1. IPv6 & SLAAC/PD antar vendor (engine `applyNodeConfig6`, rute v6, DHCPv6).
2. Routing dinamis EIGRP/OSPF multi-area/redistribute — label jujur (partial/parser-only).
3. FHRP/VRRP antar vendor (engine FhrpService) — sinkronisasi `setFhrp` konsisten.
4. QoS (SimpleQueue/mangle/HTB) — representasi + perhitungan antrean nyata.
5. TCP/L4 (seq/ack, window, congestion) — engine layer4; klaim jujur per vendor.
6. NAT/Firewall (DNAT/SNAT/masquerade/port-forward, policy) — matriks lintas vendor.
7. DHCP/DNS (pool, lease, relay, resolv) + Wireless (SSID/security) + SNMP (agent/query) — bukti per kapabilitas; turunkan status kapabilitas ke partial/parser-only bila tidak ada test bukti (V0).