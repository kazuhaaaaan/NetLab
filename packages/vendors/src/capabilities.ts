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
}

export const CAPABILITY_LABELS: Record<CapabilityKey, string> = {
  ipv4: 'IPv4',
  ipv6: 'IPv6',
  vlan: 'VLAN',
  dhcp: 'DHCP',
  nat: 'NAT',
  ospf: 'OSPF',
  bgp: 'BGP',
  vrrp: 'VRRP/FHRP',
  staticRoute: 'Static Route',
  firewall: 'Firewall/ACL',
  dns: 'DNS',
  commit: 'Commit/Rollback',
};

const S = 'supported' as const;
const P = 'partial' as const;
const PO = 'parser-only' as const;
const NS = 'not-supported' as const;

export const VENDOR_CAPABILITIES: Record<string, VendorCapabilities> = {
  mikrotik: {
    vendorId: 'mikrotik',
    caps: {
      ipv4: S, ipv6: S, vlan: S, dhcp: S, nat: S, ospf: S, bgp: S, vrrp: P,
      staticRoute: S, firewall: S, dns: S, commit: NS,
    },
    notes: 'RouterOS v7. Konfigurasi tereksekusi langsung tanpa mode commit. VRRP hanya print/parser — belum teruji konfigurasi.',
  },
  cisco_ios: {
    vendorId: 'cisco_ios',
    caps: {
      ipv4: S, ipv6: S, vlan: S, dhcp: S, nat: P, ospf: S, bgp: S, vrrp: S,
      staticRoute: S, firewall: P, dns: S, commit: NS,
    },
    notes:
      'NAT masquerade & VRRP teruji end-to-end; dstnat Cisco & ACL teruji di level memori (parser-only menuju engine).',
  },
  cisco_nxos: {
    vendorId: 'cisco_nxos',
    caps: {
      ipv4: S, ipv6: S, vlan: S, dhcp: S, nat: P, ospf: S, bgp: S, vrrp: P,
      staticRoute: S, firewall: P, dns: S, commit: NS,
    },
    notes:
      'NAT & ACL NX-OS teruji di level memori; integrasi engine mengikuti model Cisco. VRRP NX-OS belum teruji.',
  },
  juniper: {
    vendorId: 'juniper',
    caps: {
      ipv4: S, ipv6: P, vlan: S, dhcp: S, nat: S, ospf: S, bgp: S, vrrp: NS,
      staticRoute: S, firewall: S, dns: S, commit: S,
    },
    notes:
      'commit/rollback/rollback 0 nyata (snapshot state). VRRP Junos belum diimplementasikan.',
  },
  huawei: {
    vendorId: 'huawei',
    caps: {
      ipv4: S, ipv6: P, vlan: S, dhcp: S, nat: S, ospf: S, bgp: S, vrrp: NS,
      staticRoute: S, firewall: S, dns: S, commit: NS,
    },
    notes: 'VRP v8. VRRP dan IPv6-level-2 Huawei belum teruji end-to-end.',
  },
  ubiquiti: {
    vendorId: 'ubiquiti',
    caps: {
      ipv4: S, ipv6: P, vlan: S, dhcp: S, nat: S, ospf: S, bgp: S, vrrp: NS,
      staticRoute: S, firewall: S, dns: S, commit: P,
    },
    notes: 'EdgeOS: model set/commit sederhana tanpa snapshot rollback.',
  },
  vyos: {
    vendorId: 'vyos',
    caps: {
      ipv4: S, ipv6: P, vlan: S, dhcp: S, nat: S, ospf: S, bgp: S, vrrp: NS,
      staticRoute: S, firewall: S, dns: S, commit: P,
    },
    notes: 'VyOS: model set/commit sederhana tanpa snapshot rollback.',
  },
  fortinet: {
    vendorId: 'fortinet',
    caps: {
      ipv4: S, ipv6: P, vlan: S, dhcp: S, nat: S, ospf: S, bgp: S, vrrp: P,
      staticRoute: S, firewall: S, dns: S, commit: NS,
    },
    notes: 'FortiOS: NAT via policy & VIP teruji; VRRP FortiOS parser-level.',
  },
  aruba: {
    vendorId: 'aruba',
    caps: {
      ipv4: S, ipv6: P, vlan: S, dhcp: S, nat: NS, ospf: S, bgp: P, vrrp: NS,
      staticRoute: S, firewall: P, dns: S, commit: NS,
    },
    notes: 'AOS-CX: NAT & BGP belum diimplementasikan (tidak ada klaim sukses palsu).',
  },
  openwrt: {
    vendorId: 'openwrt',
    caps: {
      ipv4: S, ipv6: P, vlan: S, dhcp: S, nat: S, ospf: P, bgp: NS, vrrp: NS,
      staticRoute: S, firewall: S, dns: S, commit: S,
    },
    notes:
      'UCI commit nyata. OSPF OpenWrt (bird/zebra) belum disimulasikan; BGP tidak didukung.',
  },
  linux: {
    vendorId: 'linux',
    caps: {
      ipv4: S, ipv6: P, vlan: P, dhcp: S, nat: S, ospf: NS, bgp: NS, vrrp: NS,
      staticRoute: S, firewall: P, dns: S, commit: NS,
    },
    notes:
      'Linux host: tidak menjalankan protokol routing dinamis (OSPF/BGP) di simulator ini.',
  },
};

export function getVendorCapabilities(vendorId: string): VendorCapabilities | null {
  return VENDOR_CAPABILITIES[vendorId] ?? null;
}
