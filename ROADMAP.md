# NetLab Project Roadmap

> Status: **v1.6** — seluruh inti engine & CLI selesai. Fase berikutnya adalah
> penyempurnaan realisme protokol, pustaka skenario lab, dan performa canvas.

## Phase 1: Architecture & Foundation (Version 1.0)
- [x] Complete Monorepo folder hierarchy & package structure
- [x] Documentation Suite across all 11 core packages
- [x] Unified Pointer Interaction Engine (Tap, Double Tap, Long Press, Pinch, Pan)
- [x] Responsive IDE Canvas UI with VS Code / Figma inspired aesthetic
- [x] Vendor CLI Terminal Viewport Foundation
- [x] Project Export & Import (`.mlab` schema) with IndexedDB storage
- [x] First-Time Experience Gesture & Mouse Tutorials
- [x] Foundation ZIP Package Export (`NetLab-Foundation-v1.zip`)

## Phase 2: CLI Grammar & Lexer Engines (v1.1 - v1.3) — SELESAI
- [x] AST parser di `@mikrolab/cli` (lexer → parser → AST → NormalizedCommand)
- [x] MikroTik RouterOS grammar adapter (`/ip/address`, `/interface`, `/ping`,
      `/ip route`, `/ip firewall`, `/routing bgp`, `/ipv6`, `/queue`, dll.)
- [x] Cisco IOS/NX-OS, Juniper, Huawei, VyOS, Fortinet, Aruba, OpenWrt, Linux
      adapters (`enable`, `configure terminal`, `interface`, `show …`, `uci …`)
- [x] Autocompletion Tab & bantuan `?` per vendor (engine di `src/data/cliHints`)
  - Catatan: validasi parameter ad-hoc per perintah di `packages/vendors`
    (bukan skema deklaratif penuh) — kandidat penyempurnaan ke depan.

## Phase 3: Core Simulation & Device State Engine (v1.4 - v1.6) — SELESAI
- [x] Device hardware state (interfaces, MAC, ARP, power, routing table, DHCP,
      DNS, NAT, ACL, firewall, STP, FHRP/VRRP, wireless, QoS, SNMP, web server)
- [x] CLI AST → device memory mutators (VendorDispatcher → NetworkSimulator)
- [x] VLAN, Bridge, trunk/access, ROAS sub-interface virtual state engine
- [x] Validasi host-IP (network/broadcast ditolak), duplicate-IP ditolak,
      rute statis inactive bila gateway off-link (distance/administrative)
- [x] Automated lab testing engine `/test` — 20 skenario (basic, switching,
      routing, security, ipv6, troubleshooting) dengan assertion & laporan

## Phase 4: Packet & Protocol Stack Engine (v1.7 - v2.0) — SELESAI
- [x] Frame encapsulation pipeline (Ethernet II, ARP, MAC table, VLAN tag)
- [x] IPv4/IPv6 packet router engine & ICMP echo handler (TTL, fragmentation
      path, traceroute)
- [x] OSPF & BGP dynamic routing protocol state machines (deterministic dari
      kondisi topologi: reachability, ASN, network advertisement)
- [x] Live animated packet trace playback on topology canvas (warna kabel per
      jenis, paket hijau sukses / merah gagal, badge status node)

## Phase 5: Penyempurnaan — SELESAI (v2.2.0)
- [x] Realisme protokol: BGP/OSPF timer & event-driven state transitions,
      EIGRP, RIPng (event log `getProtocolEvents`, timer/hello/dead OSPF &
      hold-time BGP, RIPng distance-vector IPv6)
- [x] Pustaka skenario lab resmi (20 skenario `/test` dengan assertion/grading
      + 4 preset topologi siap pakai)
- [x] Performance: virtualisasi canvas & code-splitting chunk (`>500 kB` →
      semua chunk < 500 kB: manualChunks + lazy `WinDesktopModal` + dynamic
      import `jszip`)
- [x] Lint/typecheck CI + coverage test engine publik (gate c8:
      lines/statements 75, functions 72, branches 68)
- [x] Dokumentasi API publik per package (typedoc → `docs/api/`)

## Phase 6: Template & Tooling — SELESAI (v2.3.0)
- [x] Template topologi tambahan + registry `TEMPLATES` (Basic, Kantor Kecil,
      Wireless, Routing lintas vendor, Enterprise) terpakai di Navbar & mobile
- [x] Config Generator untuk **semua 12 vendor** (MikroTik, Cisco IOS/NX-OS,
      Juniper, Huawei, Ubiquiti, VyOS, FortiOS, Aruba, OpenWrt, Linux, Windows)
      dengan interface default per vendor + hint pemuatan
- [x] Auto-placement perangkat di canvas (`autoPlace.ts`, deterministik,
      anti tumpang-tindih) untuk template, preset, dan tambah-device
- [x] Perbaikan preset labs (model katalog + port konsisten)
- [x] Tes: 2688 passed, 0 failed; conformance semua vendor lulus floor

## Phase 7: Preset Labs, Bandwidth Testing & Windows GUI (v2.3.1) — SELESAI
- [x] Perluasan pustaka Preset Labs (Lab 6–11)
- [x] Simulasi iperf3/iperf di Linux node (adapter + commands)
- [x] Aplikasi NetSpeedTest GUI di Windows (WinSpeedtest + integrasi desktop)
- [x] Template siap demo load balancing + bandwidth (CLI & GUI)
