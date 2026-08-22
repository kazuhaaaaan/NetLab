# NetLab — Matriks Kapabilitas Protokol × Vendor (Level 0–5)

> Sumber kebenaran: `packages/vendors/src/capabilities.ts` (registry status) +
> `tests/unit/vendorInterop.test.ts` (feature case per klaim, V0/V1 enforcement).
> Matriks ini digenerate dari source (bukan klaim naratif) — setiap sel bisa
> dilacak ke registry & test.

## Definisi level

| Level | Status registry | Makna |
|-------|-----------------|-------|
| **0** | not-supported | Tanpa implementasi. CLI **menjawab jujur** (error vendor-autentik), tidak pernah sukses palsu. |
| **1** | parser-only | Syntax dikenali; state minimal / tidak memengaruhi simulasi. |
| **2** | partial | Parser + memori bekerja; integrasi engine terbatas atau belum diuji end-to-end. |
| **3** | supported | Syntax benar + state tersimpan + integrasi engine (klaim registry). |
| **4** | supported + teruji | Level 3 + ≥1 test otomatis lulus (aturan V0/V1: klaim `supported` **wajib** punya feature case). |
| **5** | — | Level 4 + bukti E2E paket **lintas vendor** (V2 interop pair) dan/atau round-trip export/import config. |

Catatan: level 5 tidak dicantumkan per-sel di tabel karena enforcement
otomatis hanya membuktikan level ≤4; bukti E2E lintas vendor (V2: pasangan
mikrotik↔{cisco_ios, cisco_nxos, juniper, huawei, ubiquiti, vyos, fortinet,
aruba, openwrt, linux} dan cisco_ios↔sisanya; V3: scenario engine penuh)
menaikkan sel-sel IPv4/Static Route/DHCP/OSPF/BGP vendor inti menjadi 5 —
semua pasangan V2 lulus di suite (2240 test).

## Matriks

| Protokol | **mikrotik** | **cisco_ios** | **cisco_nxos** | **juniper** | **huawei** | **ubiquiti** | **vyos** | **fortinet** | **aruba** | **openwrt** | **linux** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| IPv4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 |
| IPv6 | 4 | 4 | 4 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 |
| VLAN | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 2 |
| DHCP | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 |
| NAT | 4 | 2 | 2 | 4 | 4 | 4 | 4 | 4 | 0 | 4 | 4 |
| OSPF | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 0 | 0 |
| BGP | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 2 | 0 | 0 |
| VRRP/FHRP | 2 | 4 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Static Route | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 |
| Firewall/ACL | 4 | 2 | 2 | 4 | 4 | 4 | 4 | 4 | 2 | 4 | 2 |
| DNS | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 |
| Commit/Rollback | 0 | 0 | 0 | 4 | 0 | 4 | 4 | 0 | 0 | 4 | 0 |

## Perubahan iterasi audit terakhir

- **upgrade fidelity 90%-drive (iterasi ini)**:
  - **vyos/ubiquiti commit: 2 → 4** — rollback snapshot terbukti nyata
    (round-trip test), catatan registry yang stale dikoreksi.
  - **huawei**: `dhcp enable` kini menyimpan state nyata (`dhcpEnabled`),
    `nat server ... current-interface` diresolv ke IP interface (bukan string kosong).
  - **validasi ketat lintas vendor** — rute & alamat invalid ditolak TANPA
    mutasi state: mask tak kontigu, prefix sampah (`/33`, `24x`), gateway bukan
    IP, oktet > 255 (juniper/vyos/ubiquiti/generic, cisco-ios/nxos, huawei,
    fortinet, linux, openwrt/uci, mikrotik-ipv6).
  - **determinisme** — xid DHCP host & RTT pesan error ping kini deterministik
    (FNV-1a); event log dibatasi `MAX_EVENT_LOG=5000`.
  - **openwrt** — rute UCI tak lengkap/tak valid tidak lagi dimaterialkan
    diam-diam; `network.routeN.*` tidak diterjemahkan sebagai interface.
- **openwrt.ospf: 4 → 0** — OSPF OpenWrt (bird/zebra) tidak disimulasikan;
  sebelumnya `partial` (klaim berlebihan). CLI kini menjawab jujur.
- **fortinet.vrrp: 0 (tetap 0)** — VRRP FortiOS tidak diimplementasikan;
  sebelumnya `partial` (klaim berlebihan). CLI kini menjawab jujur.
- Sel-sel level 0 **tidak pernah** menampilkan sukses palsu — dijamin
  invariant V4 (klaim `not-supported` tidak boleh mengeksekusi state).

## Catatan per vendor (dari registry)

- **mikrotik** (RouterOS v7): konfigurasi tereksekusi langsung tanpa commit;
  VRRP hanya print/parser (belum teruji konfigurasi).
- **cisco_ios**: NAT masquerade & VRRP teruji E2E; dstnat & ACL teruji level
  memori (menuju engine).
- **cisco_nxos**: NAT & ACL teruji level memori; VRRP belum teruji.
- **juniper**: commit/rollback nyata (snapshot state); VRRP belum ada.
- **huawei** (VRP v8): VRRP & IPv6 level-2 belum teruji E2E.
- **ubiquiti/vyos** (EdgeOS/VyOS): set diterapkan seketika; `commit` menyimpan
  snapshot & `rollback [0-9]` mengembalikan ke commit terakhir — teruji
  round-trip (set→commit→set→rollback). VRRP belum ada.
- **fortinet** (FortiOS): NAT via policy & VIP teruji; VRRP tidak ada (jujur).
- **aruba** (AOS-CX): NAT (0) & BGP (2) belum diimplementasikan — tidak ada
  klaim sukses palsu.
- **openwrt**: UCI commit nyata; OSPF/BGP tidak disimulasikan (jujur).
- **linux**: host tidak menjalankan protokol routing dinamis (OSPF/BGP).