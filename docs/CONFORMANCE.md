# NetLab — Laporan Konformansi Perilaku (Behavioral Fidelity)

> Digenerate otomatis oleh `scripts/conformance-score.mts` — **semua skor
> diturunkan dari eksekusi nyata** (matriks fitur, suite inti, suite interop,
> probe CLI & validasi per-vendor). Tidak ada angka yang di-hardcode.
>
> Regenerate: `npx tsx scripts/conformance-score.mts [--json=docs/conformance-report.json]`

## Formula

```
total = 0.20·cli + 0.20·config + 0.20·engine + 0.20·protocols
      + 0.10·validation + 0.10·testing
```

PASS ≥ 90 **hanya jika** total ≥ 90 dan semua floor sub-dimensi terpenuhi:
`cli ≥ 85, config ≥ 85, engine ≥ 90, protocols ≥ 85, validation ≥ 80, testing ≥ 90`.

**Renormalisasi**: vendor client-host (Windows) dan vendor dengan `protocolSet`
kosong di registry (OpenWrt/Linux dasar — tanpa daemon routing dinamis;
FRR/bird adalah paket opsional di luar profil dasar yang disimulasikan) tidak
mensimulasikan protokol routing → dimensi `protocols` dikeluarkan dan bobot
direnormalisasi atas 5 dimensi sisanya.

Sumber tiap dimensi:

| Dimensi | Sumber (dieksekusi saat scoring) |
|---|---|
| cli | Probe perilaku CLI per-vendor (`tests/unit/cliFidelity.test.ts`): mode/help/error gaya vendor, mutasi state, penolakan invalid, show reflektif, persistensi, abbreviasi |
| config | Matriks fitur per vendor (`scripts/verify-all-vendors.mts`, 105 kasus) |
| engine | Suite kebenaran inti (`tests/unit/phase1CoreCorrectness.test.ts`: determinisme, parseCidr ketat, penolakan CLI tanpa mutasi state) |
| protocols | 60% kasus OSPF/BGP/RIP pada matriks fitur + 40% share status kapabilitas protokol, dinormalisasi atas protocolSet vendor |
| validation | Probe input-tidak-valid per vendor — CLI wajib menolak dengan pesan error DAN state tidak berubah |
| testing | Rasio lulus suite interop+registry (`tests/unit/vendorInterop.test.ts`) |

## Skor terkini (commit terakhir lihat `conformance-report.json`)

| Vendor | cli | config | engine | proto | valid | testing | TOTAL | PASS |
|---|---|---|---|---|---|---|---|---|
| mikrotik | 100 | 100 | 100 | 96 | 100 | 100 | **99.2** | ✅ |
| cisco_ios | 100 | 100 | 100 | 100 | 100 | 100 | **100** | ✅ |
| cisco_nxos | 100 | 100 | 100 | 96.8 | 100 | 100 | **99.4** | ✅ |
| juniper | 100 | 100 | 100 | 90 | 100 | 100 | **98** | ✅ |
| huawei | 100 | 100 | 100 | 90 | 100 | 100 | **98** | ✅ |
| ubiquiti | 100 | 100 | 100 | 90 | 100 | 100 | **98** | ✅ |
| vyos | 100 | 100 | 100 | 90 | 100 | 100 | **98** | ✅ |
| fortinet | 100 | 100 | 100 | 100 | 100 | 100 | **100** | ✅ |
| aruba | 100 | 100 | 100 | 100 | 100 | 100 | **100** | ✅ |
| openwrt | 100 | 100 | 100 | n/a | 100 | 100 | **100** | ✅ |
| linux | 100 | 100 | 100 | n/a | 100 | 100 | **100** | ✅ |
| windows | 100 | 100 | 100 | n/a | 100 | 100 | **100** | ✅ |

Globals saat generate: engine 74/74 · interop 527/527 · matriks vendor 105/105.

## Cara membaca skor ini (jujur, bukan inflasi)

- **config = 100 untuk semua vendor bermatriks** karena setiap kasus matriks
  lulus; dimensi ini mengukur *config-plane* (state DHCP/NAT/VLAN/ACL/DNS/route
  tersimpan benar), bukan kedalaman protokol.
- **cli = 100** berasal dari probe perilaku nyata per-vendor (bukan status
  registry); featureBreadth registry dilaporkan terpisah sebagai detail.
- **openwrt/linux `protocols = n/a`**: image dasarnya memang tidak menjalankan
  routing dinamis (FRR/bird = paket opsional); dimensi dikeluarkan dengan
  renormalisasi bobot — klaim OSPF/BGP palsu justru menjadi sukses palsu.
- **windows**: client-host GUI; kini punya CLI konfiguratif autentik
  (`netsh interface ipv4 set address/dnsservers`, `route add/delete`) dengan
  validasi ketat — dinormalisasi tanpa dimensi protocols.
- Vendor mencapai PASS hanya lewat **implementasi fitur + bukti test**
  (mis. aruba VRRP blok AOS-CX & BGP CIDR), bukan dengan menaikkan status
  registry tanpa bukti — dijaga invariant V0/V4/V5/H2 (`supported` wajib
  punya feature case; `not-supported` wajib ditolak tanpa mutasi state).
- Sel level 0 **tidak pernah** menampilkan sukses palsu — dijamin invariant
  V4 (klaim `not-supported` tidak boleh mengeksekusi state).
- **Konvergensi state (audit R2)**: jalur sinkronisasi CLI→engine bersifat
  REPLACE (`replaceNodeIps/6`) — penghapusan IP (`no ip address`) kini nyata
  di engine; AI `update_interface_properties` dual-write tiga lapisan dengan
  validasi CIDR ketat; `ipconfig` windows membaca memori terkini; display
  canvas dicerminkan dari memori tiap sync dan IP preset di-seed ke memori
  saat load (`seedMemoryIpsFromProject`) — tampilan basi dua arah tertutup.
  Dua test lama (F9/F10) yang memasang IP langsung ke engine lalu sinkron
  dikoreksi: mereka mencerminkan IP ke NodeMemory lebih dulu, persis alur
  produksi.
