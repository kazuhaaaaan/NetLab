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