# Changelog

## v2.3.0 (template · config generator · auto-placement)
- **Template topologi baru + registry**: 3 template baru (Kantor Kecil:
  FortiGate+switch+server+Windows 11; Wireless: MikroTik hAP ac2+2 klien;
  Routing lintas vendor: Cisco+Juniper+Huawei) di samping Basic & Enterprise.
  Registry `TEMPLATES`/`getTemplate()` dipakai Navbar & MobileHeader (menu
  template dinamis, bukan hardcode 2 item).
- **Config Generator 12 vendor**: `configGenerator.ts` kini menghasilkan script
  autentik untuk mikrotik, cisco_ios, cisco_nxos, juniper, huawei, ubiquiti,
  vyos, fortinet, aruba, openwrt, linux, windows (sebelumnya hanya MikroTik &
  Cisco). Syntax mengikuti konvensi parser vendor (verified oleh test), ada
  `VENDOR_DEFAULT_IFACES` (interface default per vendor) + `VENDOR_META` (label
  & hint pemuatan). Modal punya picker 12 vendor; NX-OS jujur menyatakan DHCP
  server eksternal (no fake config).
- **Auto-placement perangkat di canvas**: util `autoPlace.ts`
  (`nextFreePosition`, `autoPlaceProject`, `hasValidLayout`) — template/preset
  yang dimuat selalu punya posisi rapi (grid deterministik, anti tumpang-tindih)
  dan `handleAddNode` kini menaruh device di slot bebas terdekat.
- **Perbaikan preset labs**: model perangkat disinkronkan ke katalog
  (`ISR 4321`→`ISR 4331`, `RB4011iGS+`/CCR2004→model katalog valid, `Debian 11`
  →`Debian 12`) sehingga semua edge merujuk port yang benar-benar ada.
- Tes: **2688 passed, 0 failed** (termasuk suite template registry, preset,
  autoPlace deterministik, dan config generator 12 vendor); typecheck, build
  prod, dan conformance (semua vendor lulus floor) hijau.

## v2.2.0 (Phase 5 — penyempurnaan)
- **RIPng (IPv6 distance-vector)**: engine baru (`computeRipngRoutes`) —
  flooding hop-count antar perangkat ripng-enabled pada segmen fisik yang
  sama, metric 16 = infinity, rute dipasang lewat `addDynamicRoute6` (tanpa
  tabel tersembunyi). CLI autentik: IOS `ipv6 router rip`/`ipv6 rip <n> enable`,
  RouterOS `/routing ripng instance|network add`, Junos/EdgeOS/VyOS
  `set protocols ripng …`, VRP `ripng <n>`/`ripng <n> enable`; `no ipv6 router
  rip` mencabut. Kapabilitas `ripng` ditambahkan (cisco_ios/mikrotik/juniper/
  huawei supported; vyos/ubiquiti partial; nxos/fortinet/aruba/openwrt/linux/
  windows not-supported) + skenario `/test` `routing-ripng`.
- **Event log protokol**: `NetworkSimulator.getProtocolEvents()` — adjacency
  OSPF up/down, session BGP up/down, `ospf.timer-mismatch`,
  `bgp.hold-time-mismatch`, `ripng.route-installed` (bounded, deterministik).
- **OSPF timer mismatch**: hello/dead tak kompatibel → adjacency dipin di
  `2-Way` + event (sekali per sesi, reset saat timer sehat).
- **BGP hold-time mismatch**: holdTime beda / `< 3s` → stuck `OpenConfirm`
  + event (RFC 4271 §6.5).
- **Performance/bundle**: code-splitting (`manualChunks` untuk react/icons/
  jszip/motion/vendors/engine/AI, lazy `WinDesktopModal`, dynamic import
  `jszip`) — semua chunk `< 500 kB` (index turun 1531 kB → 435 kB).
- **Coverage gate CI**: `c8` + `.c8rc.json` (lines/statements 75, functions
  72, branches 68); `npm run test:coverage` di workflow.
- **Dokumentasi API**: `typedoc` (`npm run docs:api` → `docs/api/`, 11 paket).
- Tes: **2470 passed, 0 failed**; typecheck, build prod, dan conformance
  (semua vendor lulus floor) hijau.

## v2.1.1 (audit remediasi)
- **CLI vendor jujur**: `add_ip` memvalidasi IP/prefix/netmask (kontigu) &
  interface — IP invalid, prefix >32, netmask non-kontigu, dan interface
  hantu ditolak dengan error vendor-autentik; mask numerik (`ip address
  10.0.0.2 24`) tetap didukung (format engine).
- **Interface hantu ditolak**: `interface ghost0` (Cisco/NX-OS/Aruba/Huawei) →
  `% Invalid input detected…`; `ip addr add … dev ghost0` (Linux/OpenWrt) →
  `% Cannot find device…`; `lo` tetap diizinkan.
- **OpenWrt jujur**: `uci show network` / `uci show` diturunkan dari state
  (tanpa fabricasi loopback/lan/wan/rute palsu); `ip addr` tidak lagi
  memfabrikasi `br-lan`; `ifconfig` menghitung netmask & broadcast asli.
- **Export Cisco** kini memuat blok BGP (`router bgp`/`neighbor`/
  `network … mask`) — round-trip export→import pulih penuh.
- **`forgetNodeMemory`** menghapus startup-config → `reload` jujur.
- **OSPF lintas switch**: adjacency R1–SW–R2 (segmen cloud) terbentuk sampai
  Full + rute dipelajari (sebelumnya tidak pernah adjacency).
- **DHCP relay lintas subnet**: egress relay memakai routing lookup
  (termasuk rute statis tanpa iface) — server di subnet lain via router lain
  kini berhasil memberi lease.
- **Import/load proyek divalidasi** (`validateProject`): payload share-import
  rusak ditolak (toast + fallback), load IndexedDB aman; ping UI memakai IP
  dari engine (bukan state UI).
- **Kapabilitas dikoreksi**: `openwrt.ospf` & `fortinet.vrrp` kini
  `not-supported` (CLI menjawab jujur, tanpa klaim berlebihan).
- Hint `/import file=` yang tidak didukung dihapus.
- Tes: +27 regresi (section 30) — total **1498 passed, 0 failed**;
  typecheck & build prod hijau. Audit lengkap: `docs/AUDIT.md` §7;
  matriks kapabilitas: `docs/CAPABILITY_MATRIX.md`.

## v2.1.0
- **Export Running Config** (right-click device): config per vendor (RouterOS `.rsc`,
  IOS/NX-OS, Junos, VRP, EdgeOS, ArubaOS-CX, OpenWrt, Linux) termasuk hasil konfigurasi
  via CLI, preview + download per file / seluruh lab sebagai ZIP.
- **Evaluasi topologi**: deteksi duplicate IP, subnet sama prefix beda, netmask mismatch
  antar ujung kabel, VLAN tanpa switch, dan port belum dikonfigurasi.
- **Status link fisik**: kabel dihapus → interface `not connected` di semua `show`
  interface per vendor (konfigurasi tetap utuh & tetap di-export); `shutdown` →
  `administratively down`. STP kini menonaktifkan port tanpa kabel.
- **Running-config lebih akurat**: `ip route` Cisco memakai netmask, OSPF (Cisco &
  MikroTik) serta RIP/EIGRP Cisco ikut di-export.
- Tes E2E baru (section 21) — total 461 check lulus.

## v1.0.0
- Initial release
