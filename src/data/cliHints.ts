// CLI Hints Database — per-vendor command tree for ? help and Tab completion
export interface CliHint {
  command: string;
  description: string;
  children?: CliHint[];
}

export const CLI_HINTS: Record<string, CliHint[]> = {
  mikrotik: [
    {
      command: '/ip',
      description: 'IP networking menu',
      children: [
        {
          command: '/ip address',
          description: 'IP address management',
          children: [
            { command: '/ip address print', description: 'Show all IP addresses' },
            { command: '/ip address add address=<ip/mask> interface=<if>', description: 'Add IP address to interface' },
            { command: '/ip address remove numbers=<num>', description: 'Remove IP address entry' },
          ]
        },
        {
          command: '/ip route',
          description: 'Routing table',
          children: [
            { command: '/ip route print', description: 'Show routing table' },
            { command: '/ip route add dst-address=0.0.0.0/0 gateway=<gw>', description: 'Add static route' },
          ]
        },
        {
          command: '/ip firewall',
          description: 'Firewall rules',
          children: [
            { command: '/ip firewall filter print', description: 'Show firewall filter rules' },
            { command: '/ip firewall nat print', description: 'Show NAT rules' },
          ]
        },
        {
          command: '/ip dns',
          description: 'DNS configuration',
          children: [
            { command: '/ip dns print', description: 'Show DNS settings' },
            { command: '/ip dns set servers=<ip>', description: 'Set DNS servers' },
          ]
        },
      ]
    },
    {
      command: '/interface',
      description: 'Interface management',
      children: [
        { command: '/interface print', description: 'Show all interfaces' },
        { command: '/interface ethernet print', description: 'Show ethernet interfaces' },
        { command: '/interface vlan print', description: 'Show VLAN interfaces' },
        { command: '/interface bridge print', description: 'Show bridge interfaces' },
      ]
    },
    {
      command: '/routing',
      description: 'Routing protocols',
      children: [
        {
          command: '/routing bgp',
          description: 'BGP protocol',
          children: [
            { command: '/routing bgp instance print', description: 'Show BGP instances' },
            { command: '/routing bgp instance add as=<asn> router-id=<ip>', description: 'Add BGP instance with AS number' },
            { command: '/routing bgp peer print', description: 'Show BGP peers/neighbors' },
            { command: '/routing bgp peer add remote-address=<ip> remote-as=<asn> name=<name>', description: 'Add BGP peer' },
          ]
        },
        {
          command: '/routing ospf',
          description: 'OSPF protocol',
          children: [
            { command: '/routing ospf instance print', description: 'Show OSPF instances' },
            { command: '/routing ospf instance add name=default router-id=<ip>', description: 'Add OSPF instance' },
            { command: '/routing ospf network print', description: 'Show OSPF networks' },
            { command: '/routing ospf network add network=<net/mask> area=backbone', description: 'Add OSPF network area' },
            { command: '/routing ospf neighbor print', description: 'Show OSPF neighbors' },
          ]
        },
        { command: '/routing rip print', description: 'Show RIP configuration' },
      ]
    },
    {
      command: '/system',
      description: 'System settings',
      children: [
        { command: '/system resource print', description: 'Show system resources (CPU, RAM, uptime)' },
        { command: '/system identity print', description: 'Show device identity/hostname' },
        { command: '/system identity set name=<name>', description: 'Set device hostname' },
        { command: '/system reboot', description: 'Reboot the device' },
        { command: '/system routerboard print', description: 'Show hardware info' },
      ]
    },
    { command: 'ping <host>', description: 'Ping a remote host' },
    { command: 'export', description: 'Export running configuration' },
    { command: 'import file=<name>', description: 'Import configuration from file' },
    {
      command: '/ip dhcp-server',
      description: 'DHCP server (bagikan IP otomatis)',
      children: [
        { command: '/ip pool add name=<nama> ranges=<ip-awal>-<ip-akhir>', description: 'Buat kumpulan IP yang boleh dibagikan' },
        { command: '/ip dhcp-server add name=<nama> interface=<port> address-pool=<pool>', description: 'Nyalakan server DHCP di sebuah port' },
        { command: '/ip dhcp-server print', description: 'Lihat daftar DHCP server' },
      ]
    },
    {
      command: '/ip firewall',
      description: 'Firewall (pengaman jaringan)',
      children: [
        { command: '/ip firewall nat add chain=srcnat out-interface=<port> action=masquerade', description: 'NAT: buat semua perangkat LAN bisa internet lewat 1 IP' },
        { command: '/ip firewall nat print', description: 'Lihat aturan NAT' },
      ]
    },
    {
      command: '/interface vlan',
      description: 'VLAN (memecah satu switch jadi banyak jaringan)',
      children: [
        { command: '/interface vlan add name=vlan10 vlan-id=10 interface=<port>', description: 'Buat VLAN di atas sebuah port' },
        { command: '/interface vlan print', description: 'Lihat daftar VLAN' },
      ]
    },
  ],

  cisco_ios: [
    {
      command: 'show',
      description: 'Show running system information',
      children: [
        { command: 'show ip interface brief', description: 'Summary of all IP interfaces' },
        { command: 'show ip route', description: 'Show IP routing table' },
        { command: 'show ip bgp summary', description: 'BGP neighbor summary' },
        { command: 'show ip ospf neighbor', description: 'OSPF neighbor adjacencies' },
        { command: 'show running-config', description: 'Show running configuration' },
        { command: 'show version', description: 'Show software version and hardware info' },
        { command: 'show interfaces', description: 'Show all interface details' },
        { command: 'show vlan brief', description: 'Show VLAN database summary' },
        { command: 'show mac address-table', description: 'Show MAC address table (switches)' },
        { command: 'show spanning-tree', description: 'Show STP topology' },
        { command: 'show cdp neighbors', description: 'Show directly connected Cisco devices' },
        { command: 'show access-lists', description: 'Show all access lists' },
        { command: 'show crypto isakmp sa', description: 'Show ISAKMP/IKE SAs' },
      ]
    },
    {
      command: 'configure',
      description: 'Enter configuration mode',
      children: [
        { command: 'configure terminal', description: 'Enter global configuration mode' },
      ]
    },
    {
      command: 'router',
      description: 'Configure routing protocol',
      children: [
        { command: 'router bgp <asn>', description: 'Configure BGP routing process' },
        { command: 'router ospf 1', description: 'Configure OSPF routing process' },
        { command: 'router rip', description: 'Configure RIP routing process' },
        { command: 'router eigrp <asn>', description: 'Configure EIGRP routing process' },
      ]
    },
    {
      command: 'neighbor',
      description: 'Configure BGP neighbor',
      children: [
        { command: 'neighbor <ip> remote-as <asn>', description: 'Define a BGP neighbor' },
        { command: 'neighbor <ip> description <text>', description: 'Add neighbor description' },
        { command: 'neighbor <ip> update-source Loopback0', description: 'Set BGP update source' },
        { command: 'neighbor <ip> next-hop-self', description: 'Set self as next-hop' },
      ]
    },
    { command: 'ping <host>', description: 'Ping a remote host' },
    { command: 'traceroute <host>', description: 'Traceroute to a remote host' },
    { command: 'copy running-config startup-config', description: 'Save configuration' },
    { command: 'write memory', description: 'Save running config to NVRAM' },
    { command: 'enable', description: 'Enter privileged EXEC mode' },
    { command: 'disable', description: 'Exit privileged EXEC mode' },
    { command: 'reload', description: 'Reload/reboot the device' },
    { command: 'hostname <nama>', description: 'Ganti nama perangkat (misal: hostname R1)' },
    { command: 'ip name-server <ip>', description: 'Atur DNS server (misal: ip name-server 8.8.8.8)' },
    {
      command: 'vlan',
      description: 'Buat VLAN di switch',
      children: [
        { command: 'vlan 10', description: 'Buat VLAN nomor 10' },
        { command: 'name <nama>', description: 'Beri nama VLAN (di dalam mode vlan)' },
      ]
    },
    {
      command: 'ip dhcp pool',
      description: 'DHCP server (bagikan IP otomatis)',
      children: [
        { command: 'ip dhcp pool LAN', description: 'Buat pool DHCP bernama LAN' },
        { command: 'network 192.168.88.0 255.255.255.0', description: 'Tentukan jaringan yang dibagikan' },
        { command: 'default-router 192.168.88.1', description: 'Tentukan gateway untuk klien DHCP' },
        { command: 'show ip dhcp pool', description: 'Lihat daftar pool DHCP' },
      ]
    },
    { command: 'show hosts', description: 'Lihat DNS server yang dipakai' },
  ],

  cisco_nxos: [
    {
      command: 'show',
      description: 'Show commands',
      children: [
        { command: 'show interface status', description: 'Show interface status' },
        { command: 'show ip interface brief', description: 'Show IP interface brief' },
        { command: 'show vlan', description: 'Show VLANs' },
        { command: 'show version', description: 'Show NX-OS version' },
        { command: 'show running-config', description: 'Show running configuration' },
      ]
    },
    { command: 'configure terminal', description: 'Enter configuration mode' },
    { command: 'ping <host>', description: 'Ping a remote host' },
    { command: 'copy running-config startup-config', description: 'Save configuration' },
    { command: 'hostname <nama>', description: 'Ganti nama perangkat' },
    { command: 'ip name-server <ip>', description: 'Atur DNS server' },
    { command: 'vlan <id>', description: 'Buat VLAN' },
    { command: 'ip dhcp pool <nama>', description: 'Buat pool DHCP' },
  ],

  juniper: [
    {
      command: 'show',
      description: 'Show operational data',
      children: [
        { command: 'show interfaces terse', description: 'Show all interfaces (compact)' },
        { command: 'show route', description: 'Show routing table' },
        { command: 'show bgp summary', description: 'BGP session summary' },
        { command: 'show ospf neighbor', description: 'OSPF neighbors' },
        { command: 'show version', description: 'JunOS version information' },
        { command: 'show security policies', description: 'Security policy table (SRX)' },
      ]
    },
    {
      command: 'configure',
      description: 'Enter configuration mode',
      children: [
        { command: 'configure exclusive', description: 'Lock configuration and edit' },
        { command: 'configure private', description: 'Edit private configuration' },
      ]
    },
    {
      command: 'set',
      description: 'Apply configuration statements',
      children: [
        { command: 'set interfaces ge-0/0/0 unit 0 family inet address <ip/mask>', description: 'Set IP on interface' },
        { command: 'set routing-options static route 0.0.0.0/0 next-hop <gw>', description: 'Add static default route' },
      ]
    },
    { command: 'commit', description: 'Commit the current configuration' },
    { command: 'commit check', description: 'Verify configuration without committing' },
    { command: 'rollback 0', description: 'Rollback to last committed configuration' },
    { command: 'ping <host>', description: 'Ping a remote host' },
    { command: 'set system host-name <nama>', description: 'Ganti nama perangkat' },
    { command: 'set system name-server <ip>', description: 'Atur DNS server' },
    { command: 'set vlans <nama> vlan-id <id>', description: 'Buat VLAN' },
  ],

  huawei: [
    {
      command: 'display',
      description: 'Display commands',
      children: [
        { command: 'display ip interface brief', description: 'Show IP interface brief' },
        { command: 'display ip routing-table', description: 'Show IP routing table' },
        { command: 'display current-configuration', description: 'Show current configuration' },
        { command: 'display version', description: 'Show software version' },
        { command: 'display ospf peer', description: 'Show OSPF peers' },
      ]
    },
    { command: 'system-view', description: 'Enter system view (config mode)' },
    { command: 'ping <host>', description: 'Ping a host' },
    { command: 'save', description: 'Save the configuration' },
    { command: 'sysname <nama>', description: 'Ganti nama perangkat (dari system-view)' },
    { command: 'dns server <ip>', description: 'Atur DNS server' },
    { command: 'vlan <id>', description: 'Buat VLAN (dari system-view)' },
    { command: 'dhcp enable', description: 'Nyalakan fitur DHCP' },
  ],

  ubiquiti: [
    {
      command: 'show',
      description: 'Show commands',
      children: [
        { command: 'show interfaces', description: 'Show network interfaces' },
        { command: 'show ip route', description: 'Show routing table' },
        { command: 'show configuration', description: 'Show configuration' },
        { command: 'show version', description: 'Show EdgeOS version' },
      ]
    },
    { command: 'configure', description: 'Enter configuration mode' },
    { command: 'commit', description: 'Commit the configuration' },
    { command: 'set', description: 'Set configuration parameters' },
    { command: 'ping <host>', description: 'Ping a host' },
    { command: 'set system host-name <nama>', description: 'Ganti nama perangkat' },
    { command: 'set system name-server <ip>', description: 'Atur DNS server' },
    { command: 'set vlans <nama> vlan-id <id>', description: 'Buat VLAN' },
  ],

  vyos: [
    {
      command: 'show',
      description: 'Show commands',
      children: [
        { command: 'show interfaces', description: 'Show network interfaces' },
        { command: 'show ip route', description: 'Show routing table' },
        { command: 'show configuration', description: 'Show configuration' },
      ]
    },
    { command: 'configure', description: 'Enter configuration mode' },
    { command: 'commit', description: 'Commit the configuration' },
    { command: 'ping <host>', description: 'Ping a host' },
    { command: 'set system host-name <nama>', description: 'Ganti nama perangkat' },
    { command: 'set system name-server <ip>', description: 'Atur DNS server' },
    { command: 'set vlans <nama> vlan-id <id>', description: 'Buat VLAN' },
  ],

  fortinet: [
    {
      command: 'get',
      description: 'Get commands',
      children: [
        { command: 'get system status', description: 'Show system status' },
        { command: 'get system interface', description: 'Show interface properties' },
      ]
    },
    {
      command: 'show',
      description: 'Show commands',
      children: [
        { command: 'show firewall policy', description: 'Show firewall policies' },
      ]
    },
    { command: 'config system interface', description: 'Configure interface' },
    { command: 'diagnose sys top', description: 'Show system resources' },
    { command: 'execute ping <host>', description: 'Ping a host' },
    { command: 'config system global', description: 'Pengaturan umum perangkat' },
    { command: 'set hostname <nama>', description: 'Ganti nama perangkat (setelah config system global)' },
  ],

  aruba: [
    {
      command: 'show',
      description: 'Show commands',
      children: [
        { command: 'show interface brief', description: 'Show interfaces' },
        { command: 'show running-config', description: 'Show running configuration' },
        { command: 'show vlan', description: 'Show VLANs' },
        { command: 'show version', description: 'Show OS version' },
      ]
    },
    { command: 'configure terminal', description: 'Enter configuration mode' },
    { command: 'ping <host>', description: 'Ping a host' },
    { command: 'write memory', description: 'Save configuration' },
    { command: 'hostname <nama>', description: 'Ganti nama perangkat' },
    { command: 'ip name-server <ip>', description: 'Atur DNS server' },
    { command: 'vlan <id>', description: 'Buat VLAN' },
    { command: 'ip dhcp pool <nama>', description: 'Buat pool DHCP' },
  ],

  openwrt: [
    { command: 'uci show network', description: 'Show network configuration' },
    { command: 'ifconfig', description: 'Show interface status' },
    { command: 'ip addr', description: 'Show IP addresses' },
    { command: 'ip route', description: 'Show routing table' },
    { command: 'ping <host>', description: 'Ping a host' },
    { command: 'logread', description: 'Show system logs' },
    { command: 'cat /etc/config/network', description: 'Read network config file' },
    { command: 'uci set system.@system[0].hostname=<nama>', description: 'Ganti nama perangkat' },
    { command: 'uci set network.<vlan>.vlan=<id>', description: 'Buat VLAN di file network' },
    { command: 'uci commit', description: 'Simpan semua perubahan UCI' },
  ],

  linux: [
    {
      command: 'ip',
      description: 'Perintah jaringan Linux',
      children: [
        { command: 'ip addr', description: 'Lihat alamat IP semua interface' },
        { command: 'ip addr add <ip/mask> dev <eth0>', description: 'Beri IP ke sebuah interface' },
        { command: 'ip route', description: 'Lihat tabel routing' },
        { command: 'ip route add default via <gateway>', description: 'Tambah gateway default' },
        { command: 'ip link', description: 'Lihat status interface' },
        { command: 'ip neigh', description: 'Lihat cache ARP (siapa yang terhubung)' },
      ]
    },
    { command: 'ping <host>', description: 'Tes koneksi ke host lain' },
    { command: 'traceroute <host>', description: 'Telusuri jalur paket' },
    { command: 'ss -tulnp', description: 'Lihat port yang terbuka (listening)' },
    { command: 'netstat -tulnp', description: 'Lihat port yang terbuka (versi lama)' },
    { command: 'nslookup <domain>', description: 'Cari IP dari nama domain' },
    { command: 'curl <url>', description: 'Tes akses HTTP ke sebuah URL' },
    { command: 'systemctl status <service>', description: 'Lihat status layanan (misal nginx)' },
    { command: 'hostname <nama>', description: 'Ganti nama server' },
    { command: 'cat /etc/network/interfaces', description: 'Lihat konfigurasi jaringan' },
    { command: 'cat /etc/resolv.conf', description: 'Lihat DNS server yang dipakai' },
    { command: 'uptime', description: 'Lihat berapa lama server menyala' },
    { command: 'df -h', description: 'Lihat kapasitas disk' },
    { command: 'free -h', description: 'Lihat pemakaian RAM' },
    { command: 'ps aux', description: 'Lihat proses yang berjalan' },
  ]
};

/**
 * Get hint suggestions for a given input prefix and vendor.
 * Flattens command tree into a list of candidates that start with the prefix.
 */
export function getHints(vendor: string, prefix: string): CliHint[] {
  const tree = CLI_HINTS[vendor] || CLI_HINTS['cisco_ios'];
  const flat = flattenHints(tree);
  const query = prefix.replace(/\?$/, '').toLowerCase().trim();
  if (!query) return flat.slice(0, 12);
  return flat.filter((h) => h.command.toLowerCase().startsWith(query)).slice(0, 12);
}

function flattenHints(hints: CliHint[]): CliHint[] {
  const result: CliHint[] = [];
  for (const h of hints) {
    result.push(h);
    if (h.children) result.push(...flattenHints(h.children));
  }
  return result;
}

/**
 * Get the best Tab autocomplete match for a given partial input.
 */
export function getTabCompletion(vendor: string, partial: string): string | null {
  const tree = CLI_HINTS[vendor] || CLI_HINTS['cisco_ios'];
  const flat = flattenHints(tree);
  const query = partial.toLowerCase().trim();
  if (!query) return null;
  const match = flat.find((h) => h.command.toLowerCase().startsWith(query));
  return match ? match.command : null;
}
