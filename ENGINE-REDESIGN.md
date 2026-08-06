# Engine Redesign — dari Logical Checking menuju Event-Driven Simulation

Dokumen ini menjelaskan analisis, kelemahan, roadmap migrasi, dan alasan setiap
keputusan arsitektur. **UI/UX tidak diubah.** Semua tampilan, layout, styling,
dan struktur component React dibiarkan apa adanya.

---

## 1. Analisis struktur saat ini

```
src/engine/
├── InteractionEngine.ts      Gesture/pointer engine (UI concern — TIDAK disentuh)
└── sim/
    ├── ip.ts                 Util IPv4 (parse CIDR, network, subnet)
    ├── packet.ts             Model paket minimal (5 tipe, tanpa event/time)
    ├── simdevice.ts          SimDevice: interfaces, IP, rute, ARP cache, MAC table
    ├── simulation.ts         SimulationEngine — 1573 baris, SATU CLASS (God Object)
    ├── formatPing.ts         Format output ping/traceroute per vendor
    └── index.ts

packages/vendors/src/index.ts   VendorDispatcher — 148KB SATU FILE (seluruh CLI)
packages/{core,cli,packet,...}  Hampir semuanya hanya stub/documentation.
```

UI (`App.tsx`) mengakses engine **secara langsung** lewat `simEngineRef.current`,
memanggil `simulatePing()`, `simulateTcpConnect()`, `getDeviceStats()` dsb.

## 2. Kelemahan engine saat ini

| # | Kelemahan | Konsekuensi |
|---|-----------|-------------|
| 1 | `SimulationEngine` = God Object (1573 baris, 40+ method, 20+ Map state) | Sulit diuji, sulit diperluas, rawan regresi |
| 2 | `findPath()` = DFS rekursif mencari *jalan*, bukan memproses paket | Switch flood, router route — tapi tidak ada paket yang benar-benar "mengalir", tidak ada event, tidak ada waktu |
| 3 | Tanpa virtual clock — pakai `Date.now()` / `Math.random()` | RTT & timestamps tidak deterministik, tidak bisa step/pause |
| 4 | Tanpa EventBus / EventScheduler / PacketQueue | Tidak ada simulasi bertahap (Discover→Offer→Request→Ack) |
| 5 | MAC learning & ARP "ditempel" lewat `learnHop()` saat path walk | Bukan proses switch sungguhan, tidak ada aging |
| 6 | ACL/NAT dievaluasi inline saat pencarian path | Firewall tidak "membaca paket" |
| 7 | Tidak ada debug mode / trace per-event | Tidak bisa melihat jalur ping langkah demi langkah |
| 8 | Engine tidak terpisah dari UI | Tidak bisa dipindah ke Web Worker/Electron/backend |
| 9 | `packets/vendors` monolitik | Menambah vendor = mengubah 148KB satu file |

## 3. Arsitektur target

```
src/engine/net/                        (ENGINE BARU — event-driven, modular)
├── core/
│   ├── types.ts                       SimEvent, Packet, Link, DeviceConfig
│   ├── EventBus.ts                    Publish/subscribe (debug, UI, plugin hooks)
│   ├── EventScheduler.ts              Binary-min-heap per (waktu virtual, seq)
│   ├── TimeManager.ts                 Virtual clock (bukan Date.now)
│   ├── PacketQueue.ts                 Antrian kedatangan paket
│   ├── Topology.ts                    LabProject → devices + links
│   └── NetworkSimulator.ts            Orkestrator event-driven
├── interfaces/NetworkInterface.ts     Ethernet / wireless / VLAN / bridge / loopback
├── devices/
│   ├── NetworkDevice.ts               Data device (iface, ARP, MAC, rute, services)
│   ├── DeviceFactory.ts               Factory Pattern
│   └── SwitchProcessor.ts             L2: learn, flood, broadcast, forward, aging
│       RouterProcessor.ts             L3: LPM, TTL, ICMP, fragmentation
│       HostProcessor.ts               PC/Laptop/Server (gateway-aware)
│       WirelessProcessor.ts           L2 wireless
├── layer2/ EthernetFrame.ts, MacTable.ts, ArpCache.ts
├── layer3/ RoutingTable.ts, IpPacket.ts
├── layer4/ Icmp.ts, Tcp.ts, Udp.ts, Nat.ts
├── services/ DhcpService.ts, DnsService.ts, FirewallService.ts, RoutingProtocolEngine.ts
├── cli/ CommandObject.ts, CommandParser.ts, CommandExecutor.ts
├── debug/ DebugSession.ts            pause / step / play + trace formatter
├── plugin/ PluginRegistry.ts         MikroTikPlugin / CiscoPlugin / JuniperPlugin / HuaweiPlugin
├── facade.ts                          Adapter API 100% kompatibel dengan engine lama
└── index.ts
```

## 4. Alasan setiap keputusan

- **Event-driven, bukan path-walking** → setiap komunikasi membuat `Packet`
  (id, timestamp, src/dst MAC & IP, protocol, ttl, vlan, flags, payload), yang
  benar-benar dikirim dari device ke device lewat EventScheduler. Router
  menurunkan TTL, switch membaca MAC, firewall membaca rule, NAT menulis ulang
  address — persis seperti jaringan nyata.
- **Virtual clock (TimeManager)** → seluruh event punya timestamp deterministik
  (`00:00.000 DHCP Discover`), mendukung step/pause dan pengujian ulang yang
  identik. `Date.now()` hanya untuk keperluan UI luar, bukan logika simulasi.
- **Fasade API-kompatibel** → `App.tsx` hanya mengganti 1 baris import + 1 baris
  konstruktor. Tidak ada perubahan UI. Semua method lama (`simulatePing`,
  `getDeviceStats`, dst.) tetap ada dengan signature yang sama. Ini menghindari
  rewrite total yang dilarang, dan memberi "landing zone" untuk migrasi bertahap.
- **Plugin Registry + Command Object** → CLI vendor dipisah dari engine. Menambah
  vendor cukup menambah plugin parser; engine inti vendor-agnostik.
- **Processor (Strategy Pattern) + Factory** → satu device = data (NetworkDevice)
  + perilaku (SwitchProcessor/RouterProcessor/HostProcessor). Tidak ada class
  raksasa; tiap perilaku bisa diuji terpisah.
- **Engine terisolasi dari React** → UI hanya memanggil method fasade dan membaca
  hasilnya. Engine tidak memicu re-render sendiri; di masa depan bisa dibungkus
  Web Worker / Electron / backend tanpa mengubah UI.

## 5. Roadmap migrasi (bertahap, tanpa merusak fitur)

- **Fase 0 (sudah)** Analisis + roadmap ini.
- **Fase 1 — Fondasi Core**: `EventBus`, `EventScheduler`, `TimeManager`,
  `PacketQueue`, tipe `Packet` & `SimEvent`, `NetworkInterface`, `NetworkDevice`,
  `DeviceFactory`, `Topology`.
- **Fase 2 — Perilaku**: `SwitchProcessor` (MAC learning, flood, aging),
  `RouterProcessor` (LPM, TTL, ICMP error, NAT, firewall), `HostProcessor`,
  `RoutingTable`, `MacTable`, `ArpCache`, framing L2/L3/L4.
- **Fase 3 — Services**: `DhcpService` (DORA + lease/renew/release),
  `DnsService`, `FirewallService`, `RoutingProtocolEngine` (OSPF/RIP/EIGRP/BGP
  — diport agar CLI lama tetap bekerja), `Nat`.
- **Fase 4 — Integrasi**: `NetworkSimulationEngine` (fasade API-kompatibel),
  sambungkan ke `App.tsx` & `GradingModal` (hanya type import), `tsc --noEmit`.
- **Fase 5 — Debug & CLI plugin**: `DebugSession` (pause/step/play, trace per
  event), `CommandParser/Executor`, `PluginRegistry` + plugin vendor contoh.
- **Fase 6 — Penguatan**: aging timer aktif, STP, fragmentasi, event cap &
  benchmark 500 device / 5000 paket, pemindahan ke Web Worker.

**Kebijakan**: engine lama (`src/engine/sim`) tetap ada sebagai legacy selama
fasade belum menutupi 100% kebutuhan; setiap fungsi baru dulu membuktikan diri
di engine baru sebelum engine lama dihapus.
