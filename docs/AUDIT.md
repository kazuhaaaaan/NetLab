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