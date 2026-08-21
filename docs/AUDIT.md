# NetLab — Internal Engineering Audit

> Audit status: **COMPLETE (iterasi klarifikasi — audit ulang penuh + 3 bug invariant CLI/ENGINE/UI diperbaiki)**.
> Semua temuan diverifikasi terhadap kode & test (1129 test, typecheck, build semua hijau).

## 1. Ringkasan arsitektur (terverifikasi benar)

```
UI (App/Canvas/TerminalPanel)
  → runCliCommand (src/engine/index.ts) — SATU-SATUNYA entry terminal
      → commandTree (abbreviation/ambiguity, mode exec/config/config-if)
      → lexer (src/engine/cli/lexer.ts) → parser → vendor adapter (mikrotik/cisco)
      → executor → DeviceState mirror (immutabel)
  → bridge (createNetLabBridge) → VendorDispatcher (packages/vendors/src/index.ts, 11 vendor)
  → context providers (routeProvider, pingSimulator, …) → NetworkSimulator
      → event-driven: inject → transmit → scheduler PACKET_SEND → processors → drop/forward
```

- NetworkSimulator: engine paket nyata (ARP buffer/flush, MAC learning, VLAN tagging,
  routing LPM, DHCP lease, NAT session, ACL, QoS, STP/RSTP + failover, VRRP failover,
  BGP/OSPF via RoutingProtocolEngine, IPv6/NDP/SLAAC, wireless, SNMP, LLDP, DNS).
- **Packet lifecycle lengkap**: PACKET_CREATED → PACKET_QUEUED (scheduler) →
  PACKET_SEND → PACKET_TRANSMITTED (kabel) → PACKET_RECEIVED → PACKET_FORWARDED
  (L2/L3 forwarding decision, sw/router/wireless) → PACKET_DELIVERED (host/router
  lokal IPv4+IPv6) → PACKET_DROPPED (selalu punya reason konkret: no-route, ttl,
  arp, vlan, stp, iface-down, acl/firewall, same-port, flood-empty, dsb.).
- State tidak diduplikasi: koneksi kabel dari `project.edges` (single source of
  truth), `src/connection.ts` memusatkan logika kabel + derivasi Port Inspector.
- Kapabilitas vendor jujur (capabilities.ts: supported/partial/parser-only/not-supported,
  diverifikasi test V5).
- Persistensi `.mlab` dengan schemaVersion + migrasi + test round-trip.
- CLI invalid tidak memutasi state (parse → validate → execute → commit).

## 2. Temuan — STATUS

| # | Feature | Status | Severity | Resolusi |
|---|---------|--------|----------|----------|
| A1 | Abbreviation ambigu | **FIXED** | HIGH | `src/engine/cli/commandTree.ts` — prefix matching, ambigu → error vendor-autentik (`% Ambiguous command` / `bad command name … (12)`), tanpa dispatch (state aman). Verifikasi E2E via runCliCommand. |
| A2 | TAB completion ambigu | **FIXED** | HIGH | `completionFor` — common prefix + kandidat, context-aware per (vendor, mode). |
| A3 | Completion/help tidak context-aware | **FIXED** | MEDIUM | Mode CLI per-perangkat (exec/config/config-if) di TerminalPanel + `nextCliMode`; `?` help per mode; prompt mode-aware (`Router(config-if)#`). |
| A4 | History CLI bocor antar device | **FIXED** | MEDIUM | `historyByNode` per-perangkat di TerminalPanel. |
| A5 | Packet lifecycle tidak lengkap | **FIXED** | MEDIUM | PACKET_QUEUED/TRANSMITTED/DELIVERED ditambah; PACKET_FORWARDED baru di-emit di switch/router/wireless (sebelumnya hanya dideklarasikan). |
| A6 | Port Inspector belum ada | **FIXED** | HIGH | `src/components/PortInspector.tsx` — tabel port (Port/Status/Connected To/Link/VLAN), search, filter UP/DOWN/ADMIN DOWN/NOT CONNECTED, status ikon+teks, klik koneksi → highlight edge + remote + pusatkan viewport. Desktop drawer, mobile sheet penuh. |
| A7 | Status port UI hanya warna | **FIXED** | LOW | Ikon+teks di Port Inspector & panel mini canvas (UP/DOWN/ADMIN DOWN/NC). |
| A8 | Device tanpa tombol "Ports" | **FIXED** | MEDIUM | Tombol Ports (ListChecks) di tiap node canvas + aksi "Ports" di sheet perangkat mobile. |
| A9 | `engines: show version` hardcode board ID | DIBIARKAN | LOW | Kosmetik, standar IOS; output vendor tetap konsisten. |

## 3. Fitur yang SUDAH benar (tidak diubah pada iterasi ini)

- Packet flow hop-by-hop nyata, drop reasons spesifik.
- Validasi koneksi kabel + error yang bermakna (toast).
- Executor facade transactional (parse → execute → commit).
- Config export/import round-trip + state versioning.
- Capability matrix jujur + diganjal test V4/V5 (no fake success).
- IP/NDP, DHCP DORA, NAT session, ACL, OSPF/BGP/STP/VRRP state machine (test scenario).
- `/test` lab otomatis, golden scenarios (basic/VLAN/BGP/OSPF/NAT/DHCP/STP).
- AI mentor rule-based + Gemini fallback, tidak fake.

## 4. Keterbatasan tersisa (jujur)

- Abbreviation tree untuk 8 vendor facade (Cisco IOS/NX-OS, MikroTik,
  Juniper, Huawei, Aruba, VyOS, EdgeOS, Fortinet); OpenWrt & Linux memakai
  shell/UCI sendiri (bukan klaim penuh — tidak ada tree).
- Ekspansi abbreviation hanya untuk perintah lengkap; input parsial
  (mis. `show ip i` untuk `show ip interface brief`) diteruskan ke engine
  yang menilai sendiri.
- Perintah yang TIDAK didukung engine sengaja tidak masuk tree (jujur):
  `router bgp` (Aruba), `show configuration`/`save`/`exit`/`router bgp`
  (VyOS — sesuai vendor adapter), `config system global`/`config router
  static` (Fortinet) — mengetiknya akan memunculkan error engine asli.
- Port Inspector menampilkan TRUNK vs access dari state trunk; ID VLAN access
  tampil via `show vlan` CLI (bukan di inspector); kecepatan & tipe media
  tampil dari state port (`speedMbps`/`type`), duplex tidak ditampilkan
  karena tidak ada state duplex di engine (tidak dibuatkan data palsu).
- Log input terminal menampilkan prompt mode saat ini (bukan prompt historis).

## 5. Cakupan test baru (section 24–25, 26–29 tambahan)

- commandTree.test.ts: abbreviation unik, ambiguitas (cisco & mikrotik),
  error vendor-autentik, tidak-mutasi saat ambigu, common-prefix TAB,
  kandidat per mode, transisi mode, treeVendor mapping. **Ditambah iterasi
  ini:** tree Juniper (N1–N11) & Huawei (P1–P14), mode context juniper/huawei
  (Q1–Q12), facade E2E abbreviation lewat runCliCommand (R1–R5), dan
  preservasi case nilai slot (`set sys h R1` → `set system host-name R1`).
- portInspector.test.ts: golden scenario (R1 ether1→SW1/ether24,
  ether2→R2/ether1), arah balik, disconnect/reconnect, rename/delete device,
  link type & down → status, ADMIN DOWN, dan lifecycle event paket
  (CREATED/QUEUED/TRANSMITTED/RECEIVED/FORWARDED/DELIVERED, drop ber-reason).

## 6. Laporan akhir iterasi ini (sesuai spec §54)

### Ringkasan eksekutif
Iterasi verifikasi (audit ulang penuh terhadap seluruh claim audit sebelumnya):
1110 test yang ada diverifikasi lulus; ditemukan & diperbaiki 3 bug nyata yang
melanggar invariant CLI=ENGINE=UI: (1) mode context yang salah saat paste
multi-baris, (2) status "ADMIN DOWN" di Port Inspector tidak pernah tersinkron
dari state engine (`shutdownIfaces` CLI tidak diteruskan ke UI), (3) default
port kedua+ dibuat `status:'down'` padahal admin-up (state palsu). Fix
menambahkan helper murni `sequenceModes()` + prop engine-driven
`shutdownPortsByNode` + default status jujur. **1129 test lulus**, typecheck &
build prod hijau, smoke test serve produksi (/, /canvas, asset JS) OK.

### Bugs ditemukan & diperbaiki iterasi ini
| File | Bug | Fix |
|------|-----|-----|
| `src/components/TerminalPanel.tsx` | `runPastedCommands()` mengirim mode SETELAH perintah ke engine (mis. `conf t` ikut dikirim sebagai mode `config`) → konteks abbreviation paste multi-baris salah | `sequenceModes()` di commandTree + kirim mode SEBELUM eksekusi, konsisten dgn `execute()` |
| `src/data/deviceModels.ts` | Port default `i===0 ? up : down` — sebagian port tampil "ADMIN DOWN" padahal admin-up (state palsu) | Semua port default `'up'` (status = admin state); status operasional diturunkan dari edges + CLI |
| `src/components/PortInspector.tsx` + `src/connection.ts` + `src/App.tsx` | `shutdown` / `no shutdown` via CLI tidak pernah mengubah status port di UI (Port Inspector tidak bisa menampilkan ADMIN DOWN hasil CLI) | Prop `shutdownPortsByNode` dari state engine (`mem.shutdownIfaces`, pola sama dgn trunkPortsByNode, di-sync `syncNodeToEngine`); `portHealth(port, conn, adminDownPorts)` prioritas engine: not-connected > admin-down > link-down > up |

### Engine changes
- Tidak ada perubahan ke inti NetworkSimulator selain event packet lifecycle
  yang sudah ada (PACKET_QUEUED/TRANSMITTED/FORWARDED/DELIVERED) — diterima
  apa adanya, diverifikasi test P18–P24.

### CLI changes
- `commandTree.ts`: tree Juniper (10 op + 35 config) & Huawei (13 user-view
  + 28 system-view + 21 interface-view), semua perintah terverifikasi
  didukung engine (JuniperVendorAdapter/HuaweiVendorAdapter/`juniperCommand`/
  `huaweiCommand`). Iterasi lanjutan: tree Aruba (14 exec + 15 config +
  13 config-if), VyOS/EdgeOS (5 op + 39 config — shared `vyosCommand`),
  Fortinet (11 exec, satu level). Semua kandidat divalidasi langsung ke
  `VendorDispatcher` sebelum masuk tree — perintah yang ditolak engine
  (`save`/`exit`/`show configuration` VyOS, `router bgp` Aruba,
  `config system global` Fortinet) TIDAK dimasukkan.
- `nextCliMode()`: transisi mode Juniper (`configure`/`edit`/`exit`/`quit`,
  `commit`/`rollback` stay config) & Huawei (`system-view`, `interface`,
  `quit` bertingkat, `return`) + Aruba (seperti Cisco) & VyOS/EdgeOS
  (`configure` → config, `exit` → exec).
- `abbreviationError()`: format error vendor-autentik Juniper
  (`error: '…' is ambiguous.`) & Huawei (`Error: Ambiguous command.`).
- `engine/index.ts` `treeVendor()`: juniper, huawei, aruba, vyos, ubiquiti,
  fortinet diregistrasi (openwrt/linux tetap null — jujur).
- `TerminalPanel.tsx`: prompt mode-aware Juniper/Huawei/Aruba/VyOS/EdgeOS +
  pelacakan interface aktif (`[Huawei-VRP-ether1]`), pasted-commands
  mengikuti mode & iface.

### Vendor changes
- Tidak ada perubahan adapter engine — hanya registry tree yang ekspansinya
  terbukti diterima engine (divalidasi perintah-perintah `VendorDispatcher`).

### Port Inspector changes
- Kolom **Speed** (`speedMbps` → `1G`/`100M`) + tipe media (`copper/fiber/
  serial/radio`) dari state port asli; tidak menampilkan duplex (tidak ada
  state duplex — prinsip no-fake).

### Desktop/Mobile
- TAB completion tetap desktop-only (fine pointer, bukan lebar layar);
  mobile memakai sheet penuh & tombol quick CLI. Tidak berubah iterasi ini.

### Tests added
- N1–N11 (juniper tree), P1–P14 (huawei tree), Q1–Q12 (mode context),
  R1–R5 (facade E2E abbreviation incl. no-dispatch pada ambigu & preservasi
  case), S1–S31 (aruba/vyos/edgeos/fortinet: tree, ambigu, mode, facade E2E
  — termasuk verifikasi perintah yang sengaja TIDAK masuk tree).
- **Iterasi verifikasi ini:** T1–T15 (`sequenceModes` — mode tiap perintah
  paste = mode sebelum eksekusi, untuk cisco/mikrotik/huawei/juniper) dan
  Q1–Q4 (Port Inspector: admin-down dari state engine, prioritas
  shutdown > link-down, nama tidak dikenal tidak berpengaruh). Total
  suite: **1129 passed, 0 failed**.

### Build verification
`npm run typecheck` (tsc --noEmit) ✓ · `npm run build` (vite) ✓ ·
`npm test` (tsx) 1109/1109 ✓ — dijalankan ulang utuh setelah semua perubahan.

---

## 7. Iterasi remediasi penuh (2026-08-15) — audit source P0/P1/P2

> Status: **COMPLETE**. Audit menyeluruh atas source (engine, vendor, UI,
> persistensi, keamanan) → 12 temuan diperbaiki + 27 test regresi baru.
> **1498 passed, 0 failed** · typecheck ✓ · build prod ✓ · push `main` ✓.
> Matriks kapabilitas terbaru: `docs/CAPABILITY_MATRIX.md`.

### Ringkasan eksekutif (Deliverable A)

Sumber kebenaran = kode; setiap klaim diverifikasi ke implementasi & test.
Ditemukan & diperbaiki: (1) `add_ip` tanpa validasi IP/mask/interface →
perangkat menerima alamat atau interface hantu secara diam-diam; (2)
`interface <hantu>` (Cisco/Aruba/Huawei) & `ip addr add dev <hantu>`
(Linux/OpenWrt) diterima diam-diam karena `resolveIfaceName` punya fallback
return nama (validasi yang tampak ada sebenarnya tidak pernah aktif); (3)
OpenWrt `uci show`/`uci show network` memfabrikasi loopback/lan/wan & baris
rute; `ip addr` memfabrikasi `br-lan`; `ifconfig` hardcode netmask/broadcast;
(4) export running-config Cisco tidak memuat blok BGP (round-trip rusak); (5)
`forgetNodeMemory` tidak menghapus startup-config; (6) OSPF tidak membentuk
adjacency lintas switch (R1–SW–R2); (7) DHCP relay mengirim balik ke segmen
klien saat server di subnet lain via router lain (egress salah); (8) impor
proyek (share/IndexedDB) tidak divalidasi → proyek rusak bisa masuk; (9) ping
UI memakai IP dari state UI, bukan engine (mismatch saat IP hanya di engine);
(10) hint CLI menawarkan `/import file=` yang tidak didukung; (11–12) klaim
kapabilitas berlebihan `openwrt.ospf` & `fortinet.vrrp` (partial → not-supported,
CLI kini jujur).

### Temuan lengkap (Deliverable B)

| # | Area | Temuan (sebelum) | Perbaikan (sesudah) | Test regresi |
|---|------|------------------|---------------------|--------------|
| B1 | `packages/vendors add_ip` | IP invalid (`999.999.999.999/24`), prefix >32, netmask non-kontigu (`255.0.255.0`), & interface hantu (`ghost0`) **diterima diam-diam** dan ditulis ke `configuredIps` | Validasi `isValidIpv4/isValidIpv6/isValidPrefix` + netmask kontigu (numerik 0–32 juga diterima — format engine `10.0.0.2 24`) + `isKnownInterface` (port nyata atau subinterface `port.N`) → error `% Error: …` tanpa efek samping | 30b (6 check) |
| B2 | `interface <x>` (cisco_ios/nxos, aruba, huawei) | `interface ghost0` sukses diam-diam — bug laten: `resolveIfaceName` mengembalikan `name` saat tidak ketemu, jadi `!resolved` tidak pernah true | Cek keanggotaan port langsung (`p.name/p.id === input`); hantu → `% Invalid input detected at '^' marker. (interface "ghost0" tidak ada di device ini)`; subinterface `ether1.10` tetap diterima | 30b (2 check) |
| B3 | linux/openwrt `ip addr add … dev X` | `dev ghost0` diterima diam-diam (bug `resolveIfaceName` yang sama) | `dev` harus port nyata atau `lo`; selain itu `% Cannot find device "X"` | 30b (1 check) |
| B4 | openwrt `uci show` / `uci show network` | Memfabrikasi `loopback`/`lan`/`wan` + baris rute palsu dari template default | Output **diturunkan dari state** (`uciNetworkLines`: configuredIps/dhcpClients/routes); kosong → "belum ada konfigurasi"; `uci show network` → tipe baru `uci_network_show` (sebelumnya salah rute ke `ip_route_print`) | 30c (6 check) |
| B5 | openwrt `ip addr` / `ifconfig` | `ip addr` memfabrikasi `br-lan`; `ifconfig` hardcode `netmask 255.255.255.0` + broadcast `192.168.1.255` | Port kosong → "(ip addr: tidak ada interface yang terdeteksi)"; netmask/broadcast dihitung dari prefix nyata (`bitsToMask`/`broadcastOf`) | 30c (ifconfig 1 check) |
| B6 | Cisco export running-config | Blok BGP tidak pernah diekspor → round-trip export→import kehilangan BGP | `router bgp <asn>` + `bgp router-id` + `neighbor <ip> remote-as <as>` + `network <ip> mask <mask>` (bitsToMask); re-dispatch pulih penuh | 30d (4 check) |
| B7 | `forgetNodeMemory` | Startup-config tidak dihapus → `reload` memuat config yang sudah dilupakan | `this.startupConfigs.delete(nodeId)` → reload jujur "No startup-configuration present" | 30e (1 check) |
| B8 | Engine OSPF lintas switch | `ospfRound`/`buildOspfViews` melewatkan pasangan di segmen cloud (switch) → R1–SW–R2 tidak pernah Full; session cloud dihapus ulang tiap round (prune sebelum pendaftaran) | Pairing pasangan per segmen `cloud:` (adjacency multi-access), state machine sama dengan p2p; prune dipindah **setelah** semua pairKey (p2p+cloud) terdaftar; view `buildOspfViews(…, part)` menyertakan pasangan cloud | 30a (4 check) |
| B9 | DHCP relay egress | Server di subnet lain via router lain → egress jatuh ke interface **masuk** (klien) → ARP salah segmen → `arp-unresolved`, lease gagal | Egress = `nh.iface` **atau** `resolveEgressIface(nh.gateway)` (rute tanpa iface), baru fallback subnet langsung/interface masuk; reply relayed (`BOOTPC` + `relayed.clientMac`) diteruskan ke klien | 30f (2 check) |
| B10 | Import/load proyek (App.tsx) | Share-import & IndexedDB load tidak divalidasi → payload rusak masuk ke engine | `validateProject` di jalur share-import (invalid → toast error + fallback proyek tersimpan) & jalur IndexedDB (`applySaved`) | — (validasi eksisting `validateProject` dipakai ulang) |
| B11 | Ping UI | `dstIp` diambil dari state UI → bisa mismatch dengan IP hanya di engine | dstIp di-resolve dari engine (`simEngineRef.getDevice` interfaces) dengan fallback port UI → nama node | — |
| B12 | Hint CLI | `/import file=<name>` ditampilkan padahal tidak didukung | Hint dihapus dari `cliHints.ts` | — |
| B13 | Klaim kapabilitas | `openwrt.ospf: partial`, `fortinet.vrrp: partial` (tidak diimplementasikan) | `not-supported` + note jujur; V4/V5 enforcement tetap aman (tidak ada feature case utk keduanya) | V0–V5 suite |

### Hasil pengujian (Deliverable D)

- `npm test` (tsx): **1498 passed, 0 failed** (sebelumnya 1469; +27 test
  regresi section 30; 2 test dipindahkan level-nya karena format mask numerik
  kini valid — total naik).
- Regresi section 30: 30a OSPF lintas switch (4), 30b validasi add_ip &
  interface (9), 30c OpenWrt jujur (6), 30d BGP export round-trip (4),
  30e forget memory (1), 30f DHCP relay lintas subnet (2) = 26 check + 1
  label section.
- Selama pengerjaan ditemukan 3 bug **tambahan** yang baru aktif setelah
  validasi dipasang (diperbaiki + dites): (i) `resolveIfaceName` fallback
  menutupi semua cek interface hantu (B2/B3), (ii) prune OSPF cloud sebelum
  registrasi pairKey → adjacency stuck Init (B8), (iii) DHCP relay tidak
  menangani rute statis tanpa `iface` (B9).
- `npm run typecheck` ✓ (strict, 0 error) · `npm run build` ✓ (Vite prod).

### Keterbatasan & risiko diterima (Deliverable E)

1. **`VITE_GEMINI_API_KEY` saat build produksi** (risiko diterima atas
   permintaan pemilik — "Api key jangan diganggu gugat"): `llmClient.ts`
   menggunakan `DIRECT_KEY = IS_DEV ? env.VITE_GEMINI_API_KEY : ''`.
   `import.meta.env.VITE_GEMINI_API_KEY` di-inline oleh Vite **saat build**;
   bila variabel ter-set saat `npm run build`, literal key muncul di bundle
   (cabang mati ternary `false ? <key> : ''` yang umumnya dibuang minifier,
   tapi tidak dijamin bila minify dimatikan). Produksi normal tidak
   men-setnya (proxy `server/index.mjs` memakai `GEMINI_API_KEY` server-side),
   sehingga praktis tidak bocor — tetapi klaim absolut "tidak pernah masuk
   bundle" di README **tidak benar** → dikoreksi (lihat §8). Rekomendasi:
   jangan pernah set `VITE_GEMINI_API_KEY` saat build produksi; pakai proxy.
2. OSPF/BGP/VRRP multi-vendor: adjacency lintas switch kini teruji (R1–SW–R2),
   tapi DR/BDR election pada segmen broadcast >2 router belum disimulasikan
   (adjacency dibentuk antar semua pasangan).
3. `uci show network` menampilkan jaringan yang dikonfigurasi (bukan semua
   file UCI); `uci show` lain (non-network) hanya untuk network/rute/firewall
   yang dipetakan ke state engine.
4. Netmask numerik (`ip address 10.0.0.2 24`) sah dan tersimpan apa adanya;
   parsing ke prefix dilakukan engine (`parseCidr`).
5. Firewall dstnat Cisco & ACL NX-OS/Aruba teruji level memori (partial),
   belum E2E paket.
6. Linux host tidak menjalankan OSPF/BGP (jujur `not-supported`).
7. ARP buffer timeout → deterministik `ARP_UNRESOLVED` (bukan menggantung).
8. Abbreviation CLI hanya untuk command tree vendor facade; input parsial
   diteruskan ke engine (jujur).

---

## 8. Audit penuh engine/CLI/vendor (2026-08-19) — probe 87 titik + regresi

> Status: **COMPLETE**. Audit fungsional menyeluruh via probe live
> (engine, CLI, vendor, AI agent, windows client, mlab, parser HTML) →
> 3 bug nyata diperbaiki + matriks kapabilitas windows dilengkapi.
> **1774 passed, 0 failed** · typecheck ✓ · build prod ✓.

### Metode (Deliverable A)

Probe sementara (`tests/audit_probe.mts`, dihapus setelah hijau) menjalankan
**87 pemeriksaan** lintas 9 area terhadap implementasi nyata (bukan klaim):
A. L2/L3 + VLAN trunk + router-on-a-stick inter-VLAN
B. OSPF converge/down/recover, eBGP, VRRP (via switch shared L2), STP loop
C. NAT (session persistensi jujur), ACL, DHCP, DNS, SNMP, web server, wireless, IPv6
D. Lifecycle paket + drop reason (consumed/arp-consumed/no-route)
E. Facade CLI: set-IP, memory, perintah baca, invalid → tidak mutasi
F. AI agent: create/connect/delete/config/verify/rollback/diagnose/lab generator
G. Windows client end-to-end: DHCP lease, DNS, self-host TCP, CLI, power off, memory round-trip
H. Mlab validasi + topology warnings · I. safeHtml parser

### Bugs ditemukan & diperbaiki

| # | File | Temuan (sebelum) | Perbaikan (sesudah) | Verifikasi |
|---|------|------------------|---------------------|------------|
| P1 | `src/engine/net/devices/RouterProcessor.ts` + `src/engine/net/core/SimulationFlows.ts` | **Self-connect TCP buntu**: perangkat membuka situs yang di-host sendiri (dst = IP sendiri) selalu `unreachable`. Tiga akar: (1) reply SYN-ACK/ACK/FIN-ACK dikirim ke kabel (via switch) alih-alih delivery lokal; (2) penyelesaian run (body/handshake) ditulis SETELAH kirim ACK — saat deliveri lokal sinkron, status run sudah berubah sebelum run body diisi; (3) `inject` meneruskan paket self-dst ke routing → next-hop = diri sendiri → ARP untuk IP sendiri → `arp-not-for-me` + l2-filter menolak dstMac kosong | (1) `isSelfSrc(pkt)` → reply self-dst via `localDelivery` di jalur SYN-ACK, ACK, FIN-ACK; blok penyelesaian run dipindah SEBELUM kirim ACK; (2) `inject`: jika `src.hasIp(dstIp)` → proses lokal langsung (`handlePacket` dengan dstMac = MAC interface sendiri), tanpa ARP loop | W3b.1–W3b.4 (4 test baru): handshake 3-way, status 200, body lengkap, close ok; jalur remote (via router) tidak berubah |
| P2 | `packages/vendors/src/mikrotik/commands.ts` (b92 nat add) | `/ip firewall nat add … out-interface=etherX` (interface tidak ada) **diterima diam-diam + memori termutasi** — RouterOS nyata menolak | Validasi `out-interface` terhadap `context.ports` → `% Error: no such interface X`, tanpa mutasi | Probe E5 + suite V/C (NAT valid tetap jalan) |
| P3 | `packages/vendors/src/capabilities.ts` + `tests/unit/vendorInterop.test.ts` + `src/components/VendorCapabilitiesModal.tsx` | **windows tidak ada di matriks kapabilitas** (registry + urutan UI) padahal fitur windows client sudah shipped — klaim terluput dari enforcement V0–V5 | Entri windows jujur: ipv4/dhcp/staticRoute/dns = partial (konfigurasi via GUI + lease, CLI read-only), sisanya not-supported; `VENDOR_ORDER` kedua list ditambah `'windows'` | V0–V5 loop memvalidasi windows konsisten (tanpa klaim supported tanpa bukti test) |

### Perilaku engine yang diverifikasi BENAR (bukan bug)

- **No-route dari sumber**: ping → `reason:'unreachable'`, hanya event
  `PACKET_CREATED` (tanpa `PACKET_DROPPED`); no-route di tengah jalur →
  `PACKET_DROPPED` dengan reason. Ping sukses menghasilkan drop benih
  `consumed`/`arp-consumed` (desain).
- **NAT**: sesi bertahan setelah aturan dihapus (persistensi realistis;
  aliran baru dengan 5-tuple baru gagal → sudah tidak ada aturan).
- **VRRP/FHRP**: grup dikunci per segmen L2 (harus berbagi switch);
  perubahan master mengosongkan seluruh ARP cache; `setNodePowered` memicu
  recompute protocol. Berperilaku seperti perangkat nyata, bukan bug.
- **AI agent**: rencana dengan perangkat yang tidak ada → error jujur
  `source-not-found` + rollback; "buat lab ospf 2 router" → template
  ospf-3-router (fallback wajar); konfigurasi OSPF via agent membentuk
  adjacency nyata di engine.
- **Facade CLI**: input ambigu → error vendor-autentik tanpa mutasi;
  IP duplikat/interface hantu → ditolak; set-IP → tersimpan di memory +
  diterapkan ke engine (sync dua arah).
- **Windows client**: lease DHCP → IP engine + rute via gateway;
  DNS resolve; self-host; power off → trafik berhenti (interfaces down);
  memory round-trip GUI → CLI → export utuh.

### Hasil pengujian (Deliverable D)

- Suite penuh: **1774 passed, 0 failed** (sebelumnya 1759; +4 W3b
  self-host + V0 windows checks; E5/P2/P3 regresi di section V/C).
- Probe audit: **87/87** sebelum file probe dihapus.
- `npm run typecheck` (tsc --noEmit strict) ✓ · `npm run build` (Vite prod) ✓.

### Keterbatasan tersisa (jujur)

1. Windows CLI read-only (ipconfig/nslookup/curl/hostname) — konfigurasi
   dilakukan via GUI Simulator; tidak ada `netsh` (tidak dibuatkan data palsu).
2. `configuredIps` (Map di NetworkDevice) adalah field mati — IP nyata
   tersimpan di interface; tidak dipakai, tidak dibersihkan (kosmetik).
3. BGP/OSPF adjacency pada segmen broadcast >2 router masih pairwise
   (tanpa DR/BDR election) — batas simulasi yang diterima.
4. Probe audit dihapus setelah hijau (file sementara); regresi permanen
   ada di suite (W3b, V0, section 30).

---

## Audit Ronda 2 — Vendor Hardening (Deliverable A–E)

> Status: **COMPLETE**. Suite penuh **2148 passed, 0 failed**; `tsc --noEmit` ✓; `npm run build` ✓.

### Metode (Deliverable A)

Audit menyasar kejujuran jalur vendor: registry kapabilitas → guard →
parser/chain → NodeMemory → cliSync → ConfigStore → Observation, dengan
deliverable:
A. **H1–H4**: status kapabilitas = satu-satunya sumber kebenaran; guard
   `isCapabilityBlocked` (not-supported/parser-only) menolak jujur tanpa
   mutasi; tanpa engine, ping/traceroute/http menjawab jujur.
B. **H5–H8**: Windows ipconfig dari kondisi link nyata; pool OpenWrt dari IP
   interface; regex BGP ASN/router-id tidak menelan group; export config
   tidak mengarang nilai.
C. **H9–H10**: hostname stateful (CLI → NodeMemory → engine device state,
   persist lintas syncTopology); prompt CLI dibangun dari identitas device
   (hostname + deviceType + mode) via modul murni `src/utils/prompt.ts`.
D. **H11 negative generator**: untuk SETIAP (vendor × cap) berstatus
   terblokir dari registry — probe command sintaks nyata vendor, assert
   jawaban jujur + state tidak berubah + tidak ada fake markers.
E. **Interop matrix**: V3 diperluas — pool DHCP tiap vendor muncul di
   `getDeviceStats().dhcpPools` (jalur Observation utuh), lease + ping
   lintas vendor tetap hijau.

### Bugs ditemukan & diperbaiki (ronda ini)

| # | File | Temuan (sebelum) | Perbaikan (sesudah) | Verifikasi |
|---|------|------------------|---------------------|------------|
| Q1 | `packages/vendors/src/common/generic.ts` (b141 set_config) | **Partial-apply**: `set interfaces ether1 unit 0 family inet address 192.168.9.1 vrrp-group 1` menerapkan IP dan diam-diam menelan `vrrp-group 1` (state bermutasi, output kosong) | Token di luar grammar `… address <ip/mask>` ditolak jujur (`% Unknown "set" path: '…'`) tanpa mutasi | H11 juniper.vrrp (2 checks) |
| Q2 | `packages/vendors/src/common/generic.ts` (b173 write_mem/save) | `write memory`/`save` sukses palsu `[OK]` walau registry menyatakan commit NS (snapshot tidak dijamin) | b173 diberi `cap: 'commit'` → guard jujur untuk vendor NS; registry dikoreksi: commit = **S** untuk cisco_ios/huawei/aruba (snapshot startup-config + reload TERBUKTI round-trip di 12f/14a), tetap NS untuk nxos/fortinet/mikrotik/linux/windows (tidak punya alur itu) | 12f, 14a, V0 commit cases baru (3), H11 |
| Q3 | `packages/vendors/src/huawei/commands.ts` (b86) | `dhcp enable` membuat pool dummy `global` (kosong) yang mencemari daftar pool | `dhcp enable` hanya no-op; pool dibuat oleh `ip pool <nama>` saja | V3 huawei (2 checks) |
| Q4 | `packages/vendors/src/mikrotik/commands.ts` (b79/b80) | `network` pool = **range start** (`192.168.9.100`), bukan subnet | network diturunkan dari IP interface NYATA saat dhcp-server di-ikat (networkOfMask); tanpa IP interface → kosong (jujur) | V3 mikrotik |
| Q5 | `packages/vendors/src/fortinet/commands.ts` | `finalizeFortiPool` menebak subnet dari range start + mask default `255.255.255.0` — salah untuk subnet non-/24 | network dari IP interface; mask default dihapus (tanpa IP interface → network kosong, jujur) | V3 fortinet |
| Q6 | `packages/vendors/src/aruba/adapter.ts` | `write memory` merender string **kosong** | `Configuration updated successfully.` (AOS-CX asli) | H11 + V0 aruba commit |

### Perilaku diverifikasi BENAR (bukan bug)

- H11: 189 pemeriksaan negatif (dari registry) — semua jawaban jujur
  (`not supported`, `not currently simulated`, `Unknown "set" path`,
  `command not found`, error vendor asli) tanpa mutasi state.
- V3: 11 vendor DHCP server — pool muncul di Observation dengan data nyata
  (network/gateway/range), lease ter-grant, ping gateway sukses.
- V0: setiap `supported` punya feature case (commit kini punya bukti
  round-trip snapshot→reload untuk 3 vendor baru).
- Audit grep: tidak ada fake markers (`Success rate`/`Reply from`/`200 OK`/
  `packets transmitted`), tidak ada IP hardcoded di output (hanya komentar),
  tidak ada `catch {}` yang menelan error.

### Hasil pengujian (Deliverable D)

- Suite penuh: **2148 passed, 0 failed** (sebelumnya 2040; +H11 generator,
  +V3 Observation, +V0 commit cases).
- `npm run typecheck` ✓ · `npm run build` ✓.

### Keterbatasan tersisa (jujur)

1. Commit NS tetap untuk cisco_nxos/fortinet/mikrotik/linux/windows:
   tidak ada command save nyata di adapter tersebut → CLI menjawab jujur
   (unknown/blocked), bukan data palsu.
2. `network` pool beberapa vendor hanya terisi bila IP interface dikonfigurasi
   SEBELUM pool di-ikat — urutan konfigurasi terbalik menghasilkan network
   kosong (jujur, bukan tebakan).
3. VRRP Junos/EdgeOS: penolakan baris `set` yang memuat token di luar
   grammar menghasilkan `% Unknown "set" path` generik (belum menyebut
   nama fitur), tetapi jujur dan tanpa mutasi.

---

## Audit Ronda 3 — VLAN Hardening (16 poin enforcement)

> Status: **COMPLETE**. Suite penuh **2162 passed, 0 failed**; `tsc --noEmit` ✓; `npm run build` ✓.

### Metode (Deliverable A)

Enforcement 802.1Q pada SwitchProcessor (sumber kebenaran = state switch:
`portVlans` / `trunkPorts` / `trunkAllowedVlans` / `trunkNativeVlans` /
`vlanTable`) + validasi id VLAN di CLI semua vendor + database VlanTable +
MAC learning per VLAN:

1. **Trunk ingress allowed-list**: frame (bertag/untagged) hanya diterima bila
   VLAN-nya terdaftar — tidak bocor ke access port VLAN lain di switch sama.
2. **Native VLAN TIDAK bypass allowed-list**: native harus terdaftar juga.
3. **Access port menolak frame BERTAG** (802.1Q nyata).
4. **`allowed vlan none`**: daftar kosong TETAP dibedakan dari "tanpa
   konfigurasi" (semua) di seluruh jalur CLI → NodeMemory → ConfigStore → engine.
5. **Egress tagging** trunk/native (native untagged, non-native tagged) —
   sudah benar, diverifikasi ulang.
6. **VLAN ID 1..4094** divalidasi di CLI (cisco/mikrotik/juniper/huawei/
   openwrt sudah; **fortinet `set vlanid` diperbaiki**) dan VlanTable.
7. **MAC learning VLAN-aware** (sudah per-VLAN dengan aging) — diverifikasi P13.
8. **Windows tetap not-supported** untuk vlan — registry NS.

### Bugs ditemukan & diperbaiki (ronda ini)

| # | File | Temuan (sebelum) | Perbaikan (sesudah) | Verifikasi |
|---|------|------------------|---------------------|------------|
| R1 | `packages/vendors/src/fortinet/commands.ts` | `set vlanid 0` / `4095` diterima diam-diam | `% Error: VLAN ID must be in range 1..4094.` tanpa mutasi | P18d |
| R2 | `src/engine/net/devices/SwitchProcessor.ts` | Trunk ingress TIDAK menegakkan allowed-list — frame VLAN terlarang diteruskan ke access port VLAN itu di switch yang sama | Ingress drop `reason:'vlan'` bila VLAN tidak terdaftar | P18a |
| R3 | `src/engine/net/devices/SwitchProcessor.ts` | Native VLAN selalu boleh keluar trunk walau tidak di allowed-list (bypass) | native harus terdaftar di allowed-list | P16c (dikoreksi) |
| R4 | `src/engine/net/devices/SwitchProcessor.ts` | Access port MENGABAIKAN tag frame bertag (tag asing di-merge) | Frame bertag di access port DITOLAK | P18c |
| R5 | `tests/unit/productionEngine.test.ts` P16c | Test lama meng-encode perilaku native-bypass yang melanggar 802.1Q | Dikoreksi: native TIDAK bypass; +P18b `allowed none` diblokir total | suite hijau |

### Perilaku diverifikasi BENAR (bukan bug)

- P18a: trunk allowed mengatur trunk SAJA — access port same-VLAN di switch
  yang sama tetap komunikasi (tidak over-block).
- P18b: `allowed vlan none` membawa nol VLAN; daftar kosong ≠ tanpa daftar.
- P18c: misconfig access-vs-trunk terputus total; perbaikan konfigurasi
  memulihkan komunikasi (behavior nyata, bukan drop permanen).
- P18d: id VLAN di luar 1..4094 ditolak jujur di 6 family CLI; setelan valid
  tetap diterima (regresi mikrotik v10).

### Hasil pengujian (Deliverable D)

- Suite penuh: **2162 passed, 0 failed** (sebelumnya 2149; +P18 engine 12
  checks + P16c 2 checks).
- `npm run typecheck` ✓ · `npm run build` ✓.

### Keterbatasan tersisa (jujur)

1. Router meng-echo tag ingress frame (reply memakai vlan frame masuk),
   bukan menandai ulang berdasar subinterface egress — wajar untuk simulasi,
   tetapi frame bertag hanya lahir dari trunk egress non-native / subinterface.
2. VlanTable memvalidasi 1..4094, tetapi `vlan batch` Huawei (multi-range)
   belum didukung — CLI menjawab jujur (unknown) untuk perintah itu.
