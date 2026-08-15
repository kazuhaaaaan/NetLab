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
      command: '/ip neighbor',
      description: 'Neighbor discovery',
      children: [
        { command: '/ip neighbor print', description: 'Show directly connected neighbors (LLDP/CDP)' },
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
      command: '/ip dhcp-client',
      description: 'DHCP client (minta IP otomatis)',
      children: [
        { command: '/ip dhcp-client add interface=<port> add-default-route=yes', description: 'Jadikan port ini DHCP client — minta IP dari server' },
        { command: '/ip dhcp-client print', description: 'Lihat status DHCP client (bound/unbound)' },
      ]
    },
    {
      command: '/ip firewall',
      description: 'Firewall (pengaman jaringan)',
      children: [
        { command: '/ip firewall nat add chain=srcnat out-interface=<port> action=masquerade', description: 'NAT: buat semua perangkat LAN bisa internet lewat 1 IP' },
        { command: '/ip firewall nat print', description: 'Lihat aturan NAT' },
        { command: '/ip firewall filter add chain=forward protocol=icmp action=drop', description: 'Blokir ping ICMP yang lewat router' },
        { command: '/ip firewall filter print', description: 'Lihat aturan filter' },
        { command: '/ip firewall mangle add chain=prerouting protocol=icmp action=mark-packet', description: 'Tandai paket (mangle)' },
        { command: '/ip firewall mangle print', description: 'Lihat aturan mangle' },
      ]
    },
    {
      command: '/routing',
      description: 'Routing dinamis (OSPF/RIP/BGP)',
      children: [
        { command: '/routing ospf instance add name=ospf1 router-id=1.1.1.1', description: 'Nyalakan OSPF' },
        { command: '/routing ospf network add network=192.168.88.0/24 area=0', description: 'Advertise subnet ke OSPF' },
        { command: '/routing rip instance add name=rip1', description: 'Nyalakan RIP' },
        { command: '/routing rip network add network=10.0.0.0/24', description: 'Advertise subnet ke RIP' },
        { command: '/routing bgp network add network=192.168.88.0/24', description: 'Advertise subnet ke BGP' },
      ]
    },
    { command: '/tool traceroute <host>', description: 'Telusuri jalur paket hop demi hop' },
    {
      command: '/interface vlan',
      description: 'VLAN (memecah satu switch jadi banyak jaringan)',
      children: [
        { command: '/interface vlan add name=vlan10 vlan-id=10 interface=<port>', description: 'Buat VLAN di atas sebuah port' },
        { command: '/interface vlan print', description: 'Lihat daftar VLAN' },
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
        { command: '/interface disable <port>', description: 'Matikan interface (administratively down)' },
        { command: '/interface enable <port>', description: 'Nyalakan kembali interface' },
        { command: '/interface wireless set wlan1 ssid=<nama> band=2ghz-b mode=ap-bridge', description: 'Konfigurasi SSID wireless' },
        { command: '/interface wireless print', description: 'Lihat status wireless' },
      ]
    },
    {
      command: '/queue simple',
      description: 'QoS queue (atur bandwidth)',
      children: [
        { command: '/queue simple add name=q1 target=<jaringan> max-limit=10M/10M', description: 'Buat antrian bandwidth' },
        { command: '/queue simple print', description: 'Lihat daftar queue' },
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
        { command: 'show lldp neighbors', description: 'Show LLDP neighbors' },
        { command: 'show tcp brief', description: 'Show TCP connection table' },
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
        { command: 'network <ip> <mask> area 0', description: 'Advertise subnet via routing protocol (setelah router ospf)' },
      ]
    },
    {
      command: 'access-list',
      description: 'Filter paket (ACL)',
      children: [
        { command: 'access-list 100 deny icmp any any', description: 'Blokir semua ping ICMP ke/dari device' },
        { command: 'access-list 100 permit ip any any', description: 'Izinkan semua lalu lintas' },
        { command: 'show access-lists', description: 'Lihat daftar ACL' },
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
    {
      command: 'interface',
      description: 'Konfigurasi port',
      children: [
        { command: 'interface Gi0/1', description: 'Masuk ke mode port (misal Gi0/1)' },
        { command: 'interface Gi0/0.10', description: 'Buat subinterface VLAN 10 (router-on-a-stick)' },
        { command: 'encapsulation dot1q 10', description: 'Tag VLAN subinterface (setelah interface X.Y)' },
        { command: 'ip address dhcp', description: 'Jadikan port ini DHCP client — minta IP dari server' },
        { command: 'switchport access vlan 10', description: 'Masukkan port ke VLAN 10 (khusus switch)' },
        { command: 'switchport mode trunk', description: 'Jadikan port trunk — lewat semua VLAN (khusus switch)' },
        { command: 'no shutdown', description: 'Nyalakan port (default Cisco: shutdown)' },
        { command: 'shutdown', description: 'Matikan port — putus koneksi secara logis' },
      ]
    },
    { command: 'network <ip> mask <mask>', description: 'Advertise subnet ke BGP (setelah router bgp <asn>)' },
    { command: 'traceroute <host>', description: 'Telusuri jalur paket hop demi hop' },
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
        { command: 'display lldp neighbor', description: 'Show LLDP neighbors' },
      ]
    },
    { command: 'system-view', description: 'Enter system view (config mode)' },
    { command: 'ping <host>', description: 'Ping a host' },
    { command: 'save', description: 'Save the configuration' },
    { command: 'sysname <nama>', description: 'Ganti nama perangkat (dari system-view)' },
    { command: 'dns server <ip>', description: 'Atur DNS server' },
    { command: 'vlan <id>', description: 'Buat VLAN (dari system-view)' },
    { command: 'dhcp enable', description: 'Nyalakan fitur DHCP' },
    {
      command: 'interface',
      description: 'Konfigurasi port',
      children: [
        { command: 'interface GigabitEthernet0/0/1', description: 'Masuk ke mode port (misal GigabitEthernet0/0/1)' },
        { command: 'interface GigabitEthernet0/0/1.10', description: 'Buat subinterface VLAN 10 (router-on-a-stick)' },
        { command: 'dot1q termination vid 10', description: 'Tag VLAN subinterface (setelah interface X.Y)' },
        { command: 'ip address dhcp', description: 'Jadikan port ini DHCP client — minta IP dari server' },
        { command: 'undo shutdown', description: 'Nyalakan port' },
        { command: 'shutdown', description: 'Matikan port — putus koneksi secara logis' },
        { command: 'port link-type trunk', description: 'Jadikan port trunk — lewat semua VLAN (khusus switch)' },
      ]
    },
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
        { command: 'dhclient <eth1>', description: 'Jadikan interface ini DHCP client — minta IP dari server' },
        { command: 'ip route', description: 'Lihat tabel routing' },
        { command: 'ip route add default via <gateway>', description: 'Tambah gateway default' },
        { command: 'ip link', description: 'Lihat status interface' },
        { command: 'ip link set <eth0> down', description: 'Matikan interface — putus koneksi secara logis' },
        { command: 'ip link set <eth0> up', description: 'Nyalakan kembali interface' },
        { command: 'ip neigh', description: 'Lihat cache ARP (siapa yang terhubung)' },
      ]
    },
    { command: 'ping <host>', description: 'Tes koneksi ke host lain' },
    { command: 'traceroute <host>', description: 'Telusuri jalur paket' },
    { command: 'ss -tn', description: 'Lihat koneksi TCP aktif (netstat modern)' },
    { command: 'netstat -tn', description: 'Lihat koneksi TCP aktif' },
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
 * Perintah global (semua vendor) — di-catat di hint tiap vendor oleh gabungan
 * flattenHints; /test dijalankan di level terminal, bukan per vendor CLI.
 */
const GLOBAL_HINTS: CliHint[] = [
  { command: '/test', description: 'Jalankan Automated Network Testing Laboratory (semua skenario)' },
  { command: '/test <category>', description: 'Jalankan skenario per kategori: basic, switching, services, routing, security, ipv6, troubleshooting' },
  { command: '/test <id-prefix>', description: 'Jalankan skenario spesifik (mis. /test dhcp, /test bgp)' },
];

for (const vendor of Object.keys(CLI_HINTS)) {
  CLI_HINTS[vendor] = [...GLOBAL_HINTS, ...CLI_HINTS[vendor]];
}

/**
 * Get hint suggestions for a given input prefix and vendor.
 * Flattens command tree into a list of candidates that start with the prefix.
 */
export function getHints(vendor: string, prefix: string): CliHint[] {
  const tree = CLI_HINTS[vendor] || CLI_HINTS['cisco_ios'];
  const flat = flattenHints(tree);
  const query = prefix.replace(/\?$/, '').toLowerCase().trim();
  if (!query) return flat.slice(0, 12);
  const tokens = query.split(/\s+/);
  return flat
    .filter((h) => {
      const words = h.command.toLowerCase().split(/\s+/);
      if (words.length < tokens.length) return false;
      // tiap kata boleh disingkat (prefix), mis. "sh ip r" → "show ip route"
      return tokens.every((t, i) => words[i].startsWith(t));
    })
    .slice(0, 12);
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
 * Completes the whole command path: "sh ip r" → "show ip route".
 * Each typed word may be an unambiguous abbreviation of the hint word.
 */
export function getTabCompletion(vendor: string, partial: string): string | null {
  const tree = CLI_HINTS[vendor] || CLI_HINTS['cisco_ios'];
  const flat = flattenHints(tree);
  const query = partial.toLowerCase().trim();
  if (!query) return null;
  const tokens = query.split(/\s+/);
  if (tokens.length === 1) {
    const match = flat.find((h) => h.command.toLowerCase().startsWith(query));
    return match ? match.command : null;
  }
  const head = tokens.slice(0, -1);
  const last = tokens[tokens.length - 1];
  const match = flat.find((h) => {
    const words = h.command.toLowerCase().split(/\s+/);
    if (words.length < tokens.length) return false;
    for (let i = 0; i < head.length; i++) {
      if (!words[i].startsWith(head[i])) return false;
    }
    return words[tokens.length - 1].startsWith(last);
  });
  return match ? match.command : null;
}
