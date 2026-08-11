# Changelog

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
