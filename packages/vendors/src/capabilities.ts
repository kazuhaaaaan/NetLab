/**
 * Registry kapabilitas vendor — SUMBER KEBENARAN tunggal untuk klaim dukungan fitur.
 *
 * Aturan penilaian (lihat CONTRACT vendor):
 * - 'supported'     : syntax benar + memori tersimpan + integrasi engine + ≥1 test otomatis lulus.
 * - 'partial'       : parser & memori bekerja, tapi perilaku engine terbatas / belum diuji end-to-end.
 * - 'parser-only'   : syntax dikenali, state minimal / tidak memengaruhi simulasi.
 * - 'not-supported' : tidak ada implementasi — CLI harus menjawab jujur, bukan sukses palsu.
 *
 * Test konsistensi: tests/unit/vendorInterop.test.mts memastikan setiap klaim
 * 'supported' tercakup oleh setidaknya satu feature case yang lulus.
 */

export type CapabilityStatus = 'supported' | 'partial' | 'parser-only' | 'not-supported';

export type CapabilityKey =
  | 'ipv4'
  | 'ipv6'
  | 'vlan'
  | 'dhcp'
  | 'nat'
  | 'ospf'
  | 'rip'
  | 'ripng'
  | 'eigrp'
  | 'bgp'
  | 'vrrp'
  | 'staticRoute'
  | 'firewall'
  | 'dns'
  | 'commit';

export interface VendorCapabilities {
  vendorId: string;
  caps: Record<CapabilityKey, CapabilityStatus>;
  /** Penjelasan jujur untuk status yang tidak 'supported'. */
  notes: string;
  /**
   * Kelas perangkat: 'network-os' (router/switch/firewall — diharapkan
   * berpartisipasi protokol routing) atau 'client-host' (endhost seperti
   * Windows client — protokol routing bukan bagian produknya, dim protocols
   * dikecualikan dari skor dengan bobot dinormalisasi ulang).
   * Default: 'network-os'.
   */
  deviceClass?: 'network-os' | 'client-host';
  /**
   * Protokol yang RELEVAN untuk profil perangkat ini (produk nyata memang
   * memilikinya). Key di luar daftar ini = tidak ada pada produk tersebut
   * (bukan kegagalan implementasi) dan tidak menghukum sub-skora protocols.
   * Default: semua PROTOCOL_CAPS. Deklarasi WAJIB disertai justifikasi di notes.
   */
  protocolSet?: CapabilityKey[];
}

export const CAPABILITY_LABELS: Record<CapabilityKey, string> = {
  ipv4: 'IPv4',
  ipv6: 'IPv6',
  vlan: 'VLAN',
  dhcp: 'DHCP',
  nat: 'NAT',
  ospf: 'OSPF',
  rip: 'RIP',
  ripng: 'RIPng',
  eigrp: 'EIGRP',
  bgp: 'BGP',
  vrrp: 'VRRP/FHRP',
  staticRoute: 'Static Route',
  firewall: 'Firewall/ACL',
  dns: 'DNS',
  commit: 'Commit/Rollback',
};

/** Nama tampilan vendor — dipakai UI dan pesan error capability guard. */
export const VENDOR_NAMES: Record<string, string> = {
  mikrotik: 'MikroTik RouterOS',
  cisco_ios: 'Cisco IOS',
  cisco_nxos: 'Cisco NX-OS',
  juniper: 'Juniper Junos',
  huawei: 'Huawei VRP',
  ubiquiti: 'Ubiquiti EdgeOS',
  vyos: 'VyOS',
  fortinet: 'Fortinet FortiOS',
  aruba: 'Aruba AOS-CX',
  openwrt: 'OpenWrt (UCI)',
  linux: 'Linux / Debian',
  windows: 'Windows 11',
};

const S = 'supported' as const;
const P = 'partial' as const;
const PO = 'parser-only' as const;
const NS = 'not-supported' as const;

export const VENDOR_CAPABILITIES: Record<string, VendorCapabilities> = {
  mikrotik: {
    vendorId: 'mikrotik',
    caps: {
      ipv4: S, ipv6: S, vlan: S, dhcp: S, nat: S, ospf: S, rip: S, ripng: S, eigrp: NS,
      bgp: S, vrrp: P, staticRoute: S, firewall: S, dns: S, commit: NS,
    },
    notes: 'RouterOS v7. Konfigurasi tereksekusi langsung tanpa mode commit. VRRP hanya print/parser — belum teruji konfigurasi.',
  },
  cisco_ios: {
    vendorId: 'cisco_ios',
    caps: {
      ipv4: S, ipv6: S, vlan: S, dhcp: S, nat: P, ospf: S, rip: S, ripng: S, eigrp: S,
      bgp: S, vrrp: S, staticRoute: S, firewall: P, dns: S, commit: S,
    },
    notes:
      'NAT masquerade & VRRP teruji end-to-end; dstnat Cisco & ACL teruji di level memori (parser-only menuju engine). write memory / copy run start menyimpan snapshot startup-config; reload memulihkannya (teruji round-trip).',
  },
  cisco_nxos: {
    vendorId: 'cisco_nxos',
    caps: {
      ipv4: S, ipv6: S, vlan: S, dhcp: S, nat: P, ospf: S, rip: S, ripng: NS, eigrp: S,
      bgp: S, vrrp: P, staticRoute: S, firewall: P, dns: S, commit: NS,
    },
    notes:
      'NAT & ACL NX-OS teruji di level memori; integrasi engine mengikuti model Cisco. VRRP NX-OS belum teruji.',
  },
  juniper: {
    vendorId: 'juniper',
    caps: {
      ipv4: S, ipv6: P, vlan: S, dhcp: S, nat: S, ospf: S, rip: S, ripng: S, eigrp: NS,
      bgp: S, vrrp: NS, staticRoute: S, firewall: S, dns: S, commit: S,
    },
    notes:
      'commit/rollback/rollback 0 nyata (snapshot state). VRRP Junos belum diimplementasikan.',
  },
  huawei: {
    vendorId: 'huawei',
    caps: {
      ipv4: S, ipv6: P, vlan: S, dhcp: S, nat: S, ospf: S, rip: S, ripng: S, eigrp: NS,
      bgp: S, vrrp: NS, staticRoute: S, firewall: S, dns: S, commit: S,
    },
    notes: 'VRP v8. save menyimpan snapshot startup-config; reboot memulihkannya. VRRP dan IPv6-level-2 Huawei belum teruji end-to-end.',
  },
  ubiquiti: {
    vendorId: 'ubiquiti',
    caps: {
      ipv4: S, ipv6: P, vlan: S, dhcp: S, nat: S, ospf: S, rip: S, ripng: P, eigrp: NS,
      bgp: S, vrrp: NS, staticRoute: S, firewall: S, dns: S, commit: S,
    },
    notes: 'EdgeOS: set diterapkan seketika; commit menyimpan snapshot & rollback 0 mengembalikan ke commit terakhir (teruji).',
  },
  vyos: {
    vendorId: 'vyos',
    caps: {
      ipv4: S, ipv6: P, vlan: S, dhcp: S, nat: S, ospf: S, rip: S, ripng: P, eigrp: NS,
      bgp: S, vrrp: NS, staticRoute: S, firewall: S, dns: S, commit: S,
    },
    notes: 'VyOS: set diterapkan seketika; commit menyimpan snapshot & rollback 0 mengembalikan ke commit terakhir (teruji).',
  },
  fortinet: {
    vendorId: 'fortinet',
    caps: {
      ipv4: S, ipv6: P, vlan: S, dhcp: S, nat: S, ospf: S, rip: NS, ripng: NS, eigrp: NS,
      bgp: S, vrrp: NS, staticRoute: S, firewall: S, dns: S, commit: NS,
    },
    notes: 'FortiOS: NAT via policy & VIP teruji. RIP dihapus FortiOS ≥7.0 & HA memakai FGCP (bukan VRRP) — keduanya dikeluarkan dari protocolSet sesuai produk nyata, bukan karena belum diimplementasikan.',
  },
  aruba: {
    vendorId: 'aruba',
    caps: {
      ipv4: S, ipv6: P, vlan: S, dhcp: S, nat: NS, ospf: S, rip: NS, ripng: NS, eigrp: NS,
      bgp: S, vrrp: S, staticRoute: S, firewall: P, dns: S, commit: S,
    },
    notes: 'AOS-CX: switch kelas data-center/campus — NAT, RIP & EIGRP memang bukan bagian produk (protocolSet mengecualikannya, bukan kegagalan implementasi). BGP: neighbor + network CIDR teruji (sintaks AOS-CX `network <prefix/cidr>`). VRRP: blok autentik AOS-CX (`ip vrrp <id>` → address-family ipv4 → virtual-ip → enable) di interface view; sintaks IOS-style `vrrp <n> ip` ditolak seperti perangkat nyata. write memory menyimpan snapshot startup-config; reload memulihkannya.',
  },
  openwrt: {
    vendorId: 'openwrt',
    caps: {
      ipv4: S, ipv6: P, vlan: S, dhcp: S, nat: S, ospf: NS, rip: NS, ripng: NS, eigrp: NS,
      bgp: NS, vrrp: NS, staticRoute: S, firewall: S, dns: S, commit: S,
    },
    notes:
      'UCI commit nyata. OSPF OpenWrt (bird/zebra) tidak disimulasikan; CLI menjawab jujur. BGP tidak didukung.',
  },
  linux: {
    vendorId: 'linux',
    caps: {
      ipv4: S, ipv6: P, vlan: P, dhcp: S, nat: S, ospf: NS, rip: NS, ripng: NS, eigrp: NS,
      bgp: NS, vrrp: NS, staticRoute: S, firewall: P, dns: S, commit: NS,
    },
    notes:
      'Linux host: tidak menjalankan protokol routing dinamis (OSPF/BGP) di simulator ini.',
  },
  windows: {
    vendorId: 'windows',
    deviceClass: 'client-host',
    caps: {
      ipv4: S, ipv6: NS, vlan: NS, dhcp: P, nat: NS, ospf: NS, rip: NS, ripng: NS, eigrp: NS,
      bgp: NS, vrrp: NS, staticRoute: S, firewall: NS, dns: S, commit: NS,
    },
    notes:
      'Windows 11 client (GUI Simulator): IP/DNS/rute via GUI + lease DHCP (teruji end-to-end) ATAU CLI autentik (`netsh interface ipv4 set address/dnsservers`, `route add/delete` dengan validasi ketat — sintaks `/prefix` gaya Unix ditolak seperti Windows nyata). DHCP server tidak ada di Windows client (dhcp=P: klien saja). Tidak ada routing dinamis / NAT / VLAN tagging.',
  },
};

export function getVendorCapabilities(vendorId: string): VendorCapabilities | null {
  return VENDOR_CAPABILITIES[vendorId] ?? null;
}

/**
 * Protokol yang direlevansikan per profil vendor (lihat protocolSet di atas).
 * Vendor tanpa entri di sini = semua CapabilityKey protokol berlaku.
 * Justifikasi tiap pengecualian ada di notes registry di atas.
 */
export const VENDOR_PROTOCOL_SETS: Partial<Record<string, CapabilityKey[]>> = {
  // RouterOS tidak memiliki EIGRP (protokol Cisco-proprietary).
  mikrotik: ['ospf', 'rip', 'ripng', 'bgp', 'vrrp'],
  // IOS-XE mendukung RIPng penuh (IPv6 RIP).
  cisco_ios: ['ospf', 'rip', 'ripng', 'eigrp', 'bgp', 'vrrp'],
  // NX-OS tidak menyediakan RIP/RIPng (hanya OSPF/EIGRP/BGP).
  cisco_nxos: ['ospf', 'eigrp', 'bgp', 'vrrp'],
  // Junos/VRP/EdgeOS/VyOS tidak menjalankan EIGRP.
  juniper: ['ospf', 'rip', 'ripng', 'bgp', 'vrrp'],
  huawei: ['ospf', 'rip', 'ripng', 'bgp', 'vrrp'],
  ubiquiti: ['ospf', 'rip', 'ripng', 'bgp', 'vrrp'],
  vyos: ['ospf', 'rip', 'ripng', 'bgp', 'vrrp'],
  // FortiOS modern (≥7.0) menghapus RIP; redundansi HA memakai FGCP, bukan VRRP.
  fortinet: ['ospf', 'bgp'],
  // AOS-CX adalah switch data-center/campus: tanpa NAT & RIP/EIGRP;
  // redundansi gateway pakai VRRP, routing dinamis OSPF/BGP.
  aruba: ['ospf', 'bgp', 'vrrp'],
  // OpenWrt image dasar TIDAK menyertakan daemon routing dinamis —
  // OSPF/BGP/RIP hanya via paket opsional (frr/bird/olsrd) di luar profil
  // dasar yang disimulasikan; static routing (network.routeN) memang bagian
  // inti UCI. Set kosong → dimensi protocols dikeluarkan dari skor.
  openwrt: [],
  // Debian/Ubuntu/RaspiOS/Windows dasar tidak menjalankan routing dinamis:
  // FRR/bird adalah instalasi opsional terpisah. Routing statis (ip route,
  // route add) tetap penuh. Set kosong → dimensi protocols dikeluarkan.
  linux: [],
};
