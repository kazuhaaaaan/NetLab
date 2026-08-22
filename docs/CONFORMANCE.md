# NetLab — Laporan Konformansi Perilaku (Behavioral Fidelity)

> Digenerate otomatis oleh `scripts/conformance-score.mts` — **semua skor
> diturunkan dari eksekusi nyata** (matriks fitur, suite inti, suite interop,
> probe validasi per-vendor). Tidak ada angka yang di-hardcode.
>
> Regenerate: `npx tsx scripts/conformance-score.mts [--json=docs/conformance-report.json]`

## Formula

```
total = 0.20·cli + 0.20·config + 0.20·engine + 0.20·protocols
      + 0.10·validation + 0.10·testing
```

PASS ≥ 90 **hanya jika** total ≥ 90 dan semua floor sub-dimensi terpenuhi:
`cli ≥ 85, config ≥ 85, engine ≥ 90, protocols ≥ 85, validation ≥ 80, testing ≥ 90`.

Sumber tiap dimensi:

| Dimensi | Sumber (dieksekusi saat scoring) |
|---|---|
| cli | Registry kapabilitas (`capabilities.ts`): supported=100, partial=60, parser-only=25, not-supported=0 |
| config | Matriks fitur per vendor (`scripts/verify-all-vendors.mts`, 98 kasus) |
| engine | Suite kebenaran inti (`tests/unit/phase1CoreCorrectness.test.ts`: determinisme, parseCidr ketat, penolakan CLI tanpa mutasi state) |
| protocols | 60% kasus OSPF/BGP/RIP pada matriks fitur + 40% share status kapabilitas protokol |
| validation | Probe input-tidak-valid per vendor — CLI wajib menolak dengan pesan error DAN state tidak berubah |
| testing | Rasio lulus suite interop+registry (`tests/unit/vendorInterop.test.ts`) |

## Skor terkini (commit terakhir lihat `conformance-report.json`)

| Vendor | cli | config | engine | proto | valid | testing | TOTAL | PASS |
|---|---|---|---|---|---|---|---|---|
| cisco_ios | 94.3 | 100 | 100 | 100 | 100 | 100 | **98.9** | ✅ |
| cisco_nxos | 84.3 | 100 | 100 | 96.8 | 100 | 100 | 96.2 | — |
| mikrotik | 82.9 | 100 | 100 | 88.8 | 100 | 100 | 94.3 | — |
| juniper | 82.9 | 100 | 100 | 84.0 | 100 | 100 | 93.4 | — |
| huawei | 82.9 | 100 | 100 | 84.0 | 100 | 100 | 93.4 | — |
| ubiquiti | 82.9 | 100 | 100 | 84.0 | 100 | 100 | 93.4 | — |
| vyos | 82.9 | 100 | 100 | 84.0 | 100 | 100 | 93.4 | — |
| fortinet | 68.6 | 100 | 100 | 76.0 | 100 | 100 | 88.9 | — |
| aruba | 62.9 | 100 | 100 | 72.8 | 100 | 100 | 87.1 | — |
| openwrt | 61.4 | 100 | 100 | 0 | 100 | 100 | 72.3 | — |
| linux | 48.6 | 100 | 100 | 0 | 100 | 100 | 69.7 | — |
| windows | 17.1 | n/a | 100 | n/a | n/a | 100 | n/a | host-only |

Globals saat generate: engine 74/74 · interop 517/517 · matriks vendor 98/98.

## Cara membaca skor ini (jujur, bukan inflasi)

- **config = 100 untuk semua vendor bermatriks** karena setiap kasus matriks
  lulus; dimensi ini mengukur *config-plane* (state DHCP/NAT/VLAN/ACL/DNS/route
  tersimpan benar), bukan kedalaman protokol.
- Vendor dengan total tinggi tapi PASS "—" gagal **floor**, bukan total:
  biasanya `cli < 85` akibat status jujur `partial`/`not-supported` pada
  IPv6/VRRP/EIGRP (lihat `docs/CAPABILITY_MATRIX.md`). Satu-satunya cara naik
  adalah **mengimplementasikan fiturnya** — bukan menaikkan status.
- openwrt/linux sengaja `protocols = 0`: host/UCI tidak menjalankan routing
  dinamis; klaim sebaliknya akan menjadi sukses palsu.
- windows dinilai registry-only (perangkat client GUI; tanpa matriks CLI).

## Roadmap menuju ≥90 PASS semua vendor

1. `cli` floor: implementasi kapabilitas `partial` → `supported` satu per satu
   dengan feature case (aturan V0: klaim wajib punya bukti).
2. `protocols` floor: tambah kasus RIP/OSPF/BGP pada matriks untuk vendor yang
   handler-nya nyata (fortinet, aruba).
3. Setiap kenaikan status HARUS disertai test; scorer akan menolak regresi
   secara otomatis (angka turun bila test hilang).
