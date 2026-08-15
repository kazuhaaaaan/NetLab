# Changelog

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
