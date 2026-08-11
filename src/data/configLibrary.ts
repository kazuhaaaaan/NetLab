// ============================================================
// Config Library (Tugas 5) — pustaka skrip template lokal.
// Struktur data JSON murni: kategori → snippet dengan vendor,
// tag, dan isi perintah. Dipakai modal Config Library di UI.
// ============================================================

export interface ConfigSnippet {
  id: string;
  vendor: 'mikrotik' | 'cisco';
  category: string;
  title: string;
  description: string;
  tags: string[];
  content: string;
}

export interface ConfigLibraryCategory {
  id: string;
  label: string;
  description: string;
}

export const CONFIG_LIBRARY_CATEGORIES: ConfigLibraryCategory[] = [
  { id: 'interface', label: 'Interface', description: 'Konfigurasi & status interface' },
  { id: 'ip-addressing', label: 'IP Addressing', description: 'Alamat IP, CIDR & subnet' },
  { id: 'routing', label: 'Routing', description: 'Static, default, OSPF' },
  { id: 'dhcp', label: 'DHCP', description: 'Pool, server & lease' },
  { id: 'nat', label: 'NAT', description: 'Masquerade & port forwarding' },
  { id: 'firewall', label: 'Firewall / ACL', description: 'Filter rules & access-list' },
  { id: 'vlan', label: 'VLAN', description: 'Access, trunk & subinterface' },
  { id: 'wireless', label: 'Wireless', description: 'SSID, AP & security' },
  { id: 'service', label: 'Service / Lainnya', description: 'DNS, SNMP, remote access' },
];

export const CONFIG_LIBRARY: ConfigSnippet[] = [
  // ── MikroTik ─────────────────────────────────────────────────
  {
    id: 'mt-identity',
    vendor: 'mikrotik',
    category: 'interface',
    title: 'Identity & renaming interface',
    description: 'Ubah nama device dan interface',
    tags: ['hostname', 'identity', 'rename'],
    content: `/system identity set name=Router-Utama\n/interface ethernet set ether1 name=wan1\n/interface ethernet set ether2 name=lan1\n/interface print`,
  },
  {
    id: 'mt-ip',
    vendor: 'mikrotik',
    category: 'ip-addressing',
    title: 'IP Address + default route',
    description: 'Pasang IP di interface + route default',
    tags: ['ip', 'address', 'route', 'default'],
    content: `/ip address add address=192.168.88.1/24 interface=lan1\n/ip address add address=203.0.113.2/30 interface=wan1\n/ip route add dst-address=0.0.0.0/0 gateway=203.0.113.1\n/ip address print`,
  },
  {
    id: 'mt-route',
    vendor: 'mikrotik',
    category: 'routing',
    title: 'Static route via gateway',
    description: 'Rute statis ke network tujuan',
    tags: ['static', 'route'],
    content: `/ip route add dst-address=10.10.20.0/24 gateway=192.168.88.254 distance=1\n/ip route add dst-address=172.16.0.0/16 gateway=192.168.88.254 distance=2\n/ip route print detail`,
  },
  {
    id: 'mt-ospf',
    vendor: 'mikrotik',
    category: 'routing',
    title: 'OSPF single area',
    description: 'OSPF area 0 dengan router-id',
    tags: ['ospf', 'dynamic', 'routing'],
    content: `/routing ospf instance add name=ospf1 router-id=192.168.88.1\n/routing ospf area add name=backbone instance=ospf1 area-id=0.0.0.0\n/routing ospf interface-template add interfaces=lan1 area=backbone\n/routing ospf interface-template add interfaces=wan1 area=backbone\n/routing ospf neighbor print`,
  },
  {
    id: 'mt-dhcp',
    vendor: 'mikrotik',
    category: 'dhcp',
    title: 'DHCP Server + pool',
    description: 'Pool DHCP untuk LAN',
    tags: ['dhcp', 'pool', 'server', 'network'],
    content: `/ip pool add name=pool-lan ranges=192.168.88.100-192.168.88.200\n/ip dhcp-server add name=dhcp-lan interface=lan1 address-pool=pool-lan lease-time=10m\n/ip dhcp-server network add address=192.168.88.0/24 gateway=192.168.88.1 dns-server=8.8.8.8,1.1.1.1\n/ip dhcp-server lease print`,
  },
  {
    id: 'mt-nat',
    vendor: 'mikrotik',
    category: 'nat',
    title: 'NAT masquerade keluar WAN',
    description: 'SNAT overload ke interface WAN',
    tags: ['nat', 'masquerade', 'snat'],
    content: `/ip firewall nat add chain=srcnat out-interface=wan1 action=masquerade comment="internet"\n/ip firewall nat add chain=dstnat dst-address=203.0.113.2 dst-port=80 protocol=tcp action=dst-nat to-addresses=192.168.88.10 to-ports=80\n/ip firewall nat print`,
  },
  {
    id: 'mt-firewall',
    vendor: 'mikrotik',
    category: 'firewall',
    title: 'Filter: stateful + ICMP WAN',
    description: 'Rule dasar input/forward',
    tags: ['firewall', 'filter', 'security'],
    content: `/ip firewall filter add chain=input action=accept connection-state=established,related\n/ip firewall filter add chain=input action=accept connection-state=new in-interface=lan1\n/ip firewall filter add chain=input action=accept protocol=icmp\n/ip firewall filter add chain=input action=drop in-interface=wan1\n/ip firewall filter add chain=forward action=accept connection-state=established,related\n/ip firewall filter add chain=forward action=drop in-interface=wan1 connection-state=new\n/ip firewall filter print`,
  },
  {
    id: 'mt-vlan',
    vendor: 'mikrotik',
    category: 'vlan',
    title: 'VLAN + bridge access port',
    description: 'VLAN 10/20 di interface, bridge per VLAN',
    tags: ['vlan', 'bridge', 'trunk'],
    content: `/interface vlan add name=vlan10 vlan-id=10 interface=lan1\n/interface vlan add name=vlan20 vlan-id=20 interface=lan1\n/interface bridge add name=br10\n/interface bridge add name=br20\n/interface bridge port add bridge=br10 interface=vlan10\n/interface bridge port add bridge=br20 interface=vlan20\n/interface bridge vlan print`,
  },
  {
    id: 'mt-wireless',
    vendor: 'mikrotik',
    category: 'wireless',
    title: 'Wireless AP + security',
    description: 'SSID dengan WPA2 + DHCP',
    tags: ['wireless', 'wifi', 'wpa2', 'ssid'],
    content: `/interface wireless set wlan1 mode=ap-bridge ssid=NetLab-Wifi band=2ghz-b/g/n frequency=2437 channel-width=20mhz\n/interface wireless security-profiles add name=wpa2 mode=dynamic-keys authentication-types=wpa2-psk wpa2-pre-shared-key=NetLab2026!\n/interface wireless set wlan1 security-profile=wpa2\n/interface wireless enable wlan1`,
  },
  {
    id: 'mt-dns',
    vendor: 'mikrotik',
    category: 'service',
    title: 'DNS forwarder + static record',
    description: 'DNS server dengan A record lokal',
    tags: ['dns', 'record', 'resolver'],
    content: `/ip dns set servers=8.8.8.8,1.1.1.1 allow-remote-requests=yes\n/ip dns static add name=server.local address=192.168.88.10\n/ip dns static print\n/tool dns-lookup server.local`,
  },

  // ── Cisco IOS ─────────────────────────────────────────────────
  {
    id: 'cisco-hostname',
    vendor: 'cisco',
    category: 'interface',
    title: 'Hostname & banner',
    description: 'Dasar konfigurasi device',
    tags: ['hostname', 'banner', 'basic'],
    content: `enable\nconfigure terminal\nhostname R1\nbanner motd ^C Authorized access only ^C\nline console 0\nlogging synchronous\nexit`,
  },
  {
    id: 'cisco-ip',
    vendor: 'cisco',
    category: 'ip-addressing',
    title: 'Interface + IP + no shutdown',
    description: 'Aktifkan interface dengan alamat IP',
    tags: ['interface', 'ip', 'shutdown'],
    content: `configure terminal\ninterface GigabitEthernet0/0\n description LAN\n ip address 192.168.1.1 255.255.255.0\n no shutdown\nexit\ninterface GigabitEthernet0/1\n description WAN\n ip address 203.0.113.2 255.255.255.252\n no shutdown\nexit\nshow ip interface brief`,
  },
  {
    id: 'cisco-static',
    vendor: 'cisco',
    category: 'routing',
    title: 'Static & default route',
    description: 'Route statis + route default',
    tags: ['static', 'route', 'default'],
    content: `configure terminal\nip route 192.168.20.0 255.255.255.0 192.168.1.254\nip route 0.0.0.0 0.0.0.0 203.0.113.1\nip route 10.0.0.0 255.0.0.0 192.168.1.254 10\nend\nshow ip route`,
  },
  {
    id: 'cisco-ospf',
    vendor: 'cisco',
    category: 'routing',
    title: 'OSPF area 0',
    description: 'OSPF dengan network statement',
    tags: ['ospf', 'dynamic', 'area'],
    content: `configure terminal\nrouter ospf 1\n router-id 1.1.1.1\n network 192.168.1.0 0.0.0.255 area 0\n network 10.0.0.0 0.0.0.3 area 0\nend\nshow ip ospf neighbor\nshow ip route ospf`,
  },
  {
    id: 'cisco-dhcp',
    vendor: 'cisco',
    category: 'dhcp',
    title: 'DHCP pool + excluded',
    description: 'Pool DHCP Cisco IOS',
    tags: ['dhcp', 'pool', 'excluded'],
    content: `configure terminal\nip dhcp excluded-address 192.168.1.1 192.168.1.10\nip dhcp pool LAN\n network 192.168.1.0 255.255.255.0\n default-router 192.168.1.1\n dns-server 8.8.8.8 1.1.1.1\n lease 0 0 10\nexit\nshow ip dhcp binding`,
  },
  {
    id: 'cisco-nat',
    vendor: 'cisco',
    category: 'nat',
    title: 'NAT overload (PAT)',
    description: 'PAT + port forwarding',
    tags: ['nat', 'pat', 'overload', 'forwarding'],
    content: `configure terminal\ninterface GigabitEthernet0/0\n ip nat inside\nexit\ninterface GigabitEthernet0/1\n ip nat outside\nexit\naccess-list 1 permit 192.168.1.0 0.0.0.255\nip nat inside source list 1 interface GigabitEthernet0/1 overload\nip nat inside source static tcp 192.168.1.10 80 203.0.113.2 8080\nexit\nshow ip nat translations`,
  },
  {
    id: 'cisco-acl',
    vendor: 'cisco',
    category: 'firewall',
    title: 'Named ACL + apply',
    description: 'Access-list di interface',
    tags: ['acl', 'access-list', 'security'],
    content: `configure terminal\nip access-list extended WAN-IN\n permit icmp any any echo-reply\n permit tcp any any established\n deny ip any any log\nexit\ninterface GigabitEthernet0/1\n ip access-group WAN-IN in\nexit\nshow access-lists WAN-IN`,
  },
  {
    id: 'cisco-vlan',
    vendor: 'cisco',
    category: 'vlan',
    title: 'VLAN + trunk + access',
    description: 'VLAN database, trunk dan access port',
    tags: ['vlan', 'trunk', 'access', 'dot1q'],
    content: `configure terminal\nvlan 10\n name Marketing\nexit\nvlan 20\n name Engineering\nexit\ninterface GigabitEthernet0/24\n switchport mode trunk\n switchport trunk allowed vlan 10,20\n exit\ninterface GigabitEthernet0/1\n switchport mode access\n switchport access vlan 10\n exit\nshow vlan brief`,
  },
  {
    id: 'cisco-subif',
    vendor: 'cisco',
    category: 'vlan',
    title: 'Router-on-a-stick subinterface',
    description: 'Subinterface dot1Q untuk inter-VLAN',
    tags: ['subinterface', 'dot1q', 'vlan', 'router'],
    content: `configure terminal\ninterface GigabitEthernet0/0\n no shutdown\ninterface GigabitEthernet0/0.10\n encapsulation dot1Q 10\n ip address 10.1.10.1 255.255.255.0\ninterface GigabitEthernet0/0.20\n encapsulation dot1Q 20\n ip address 10.1.20.1 255.255.255.0\nexit\nshow ip interface brief`,
  },
  {
    id: 'cisco-save',
    vendor: 'cisco',
    category: 'service',
    title: 'Save & verify',
    description: 'Simpan konfigurasi + verifikasi',
    tags: ['save', 'copy', 'verify'],
    content: `copy running-config startup-config\nshow startup-config\nshow version | include uptime\nshow interfaces summary\nshow running-config | section interface`,
  },
];

/** Ambil snippet per kategori (mengembalikan salinan baru agar aman dimutasi). */
export function getSnippetsByCategory(categoryId: string): ConfigSnippet[] {
  return CONFIG_LIBRARY.filter((s) => s.category === categoryId);
}

export function searchSnippets(query: string): ConfigSnippet[] {
  const q = query.trim().toLowerCase();
  if (!q) return CONFIG_LIBRARY;
  return CONFIG_LIBRARY.filter(
    (s) =>
      s.title.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.tags.some((t) => t.toLowerCase().includes(q)) ||
      s.content.toLowerCase().includes(q)
  );
}