// ============================================================
// Automatic Router Config Generator
// Client-side template engine — menghasilkan script konfigurasi
// untuk 12 vendor NetLab secara murni di browser.
// Syntax mengikuti konvensi parser vendor (packages/vendors) supaya
// script hasil generator otomatis bisa dijalankan di terminal simulator.
// ============================================================

export type ConfigVendor =
  | 'mikrotik'
  | 'cisco_ios'
  | 'cisco_nxos'
  | 'juniper'
  | 'huawei'
  | 'ubiquiti'
  | 'vyos'
  | 'fortinet'
  | 'aruba'
  | 'openwrt'
  | 'linux'
  | 'windows';

export interface VlanInput {
  id: number;
  name: string;
}

export interface ConfigGeneratorParams {
  vendor: ConfigVendor;
  hostname: string;
  /** Interface WAN + IP gateway upstream (default gateway ISP). */
  wanIface: string;
  wanIp: string; // IP/prefix WAN, mis. "203.0.113.2/30"
  /** IP gateway untuk upstream (next-hop ISP). */
  wanGateway: string;
  /** Jaringan LAN + prefix, mis. "192.168.1.0/24". */
  lanSubnet: string; // network/prefix
  lanGatewayIp: string; // IP LAN yang dipasang di router
  /** Rentang pool DHCP, mis. "192.168.1.100-192.168.1.200". */
  dhcpPoolRange: string;
  dnsServers: string[]; // mis. ["8.8.8.8", "1.1.1.1"]
  vlans: VlanInput[];
  /** Tambahkan aturan NAT masquerade dasar. */
  enableNat: boolean;
  /** Blokir koneksi masuk dari WAN (stateful). */
  enableFirewall: boolean;
  /** Static route (default) atau OSPF single area. */
  routing: 'static' | 'ospf';
  /** Interface LAN yang dipakai untuk subinterface VLAN (router-on-a-stick). */
  lanIface: string;
}

/** Interface default per vendor (untuk reset form saat ganti vendor). */
export const VENDOR_DEFAULT_IFACES: Record<ConfigVendor, { wan: string; lan: string }> = {
  mikrotik: { wan: 'ether1', lan: 'ether2' },
  cisco_ios: { wan: 'Gi0/0/0', lan: 'Gi0/0/1' },
  cisco_nxos: { wan: 'Ethernet1/1', lan: 'Ethernet1/2' },
  juniper: { wan: 'ge-0/0/0', lan: 'ge-0/0/1' },
  huawei: { wan: 'GigabitEthernet0/0/1', lan: 'GigabitEthernet0/0/2' },
  ubiquiti: { wan: 'eth0', lan: 'eth1' },
  vyos: { wan: 'eth0', lan: 'eth1' },
  fortinet: { wan: 'wan1', lan: 'port1' },
  aruba: { wan: '1/1/1', lan: '1/1/2' },
  openwrt: { wan: 'eth1', lan: 'eth0' },
  linux: { wan: 'eth0', lan: 'eth1' },
  windows: { wan: 'Ethernet0', lan: 'Ethernet1' },
};

/** Label tampilan + hint pemuatan script per vendor. */
export const VENDOR_META: Record<ConfigVendor, { label: string; hint: string }> = {
  mikrotik: { label: 'MikroTik RouterOS', hint: 'muat via /import file-name=<file>.rsc' },
  cisco_ios: { label: 'Cisco IOS', hint: 'tempel setelah `configure terminal`' },
  cisco_nxos: { label: 'Cisco NX-OS', hint: 'tempel setelah `configure terminal`' },
  juniper: { label: 'Juniper Junos', hint: 'tempel setelah `configure` lalu `commit`' },
  huawei: { label: 'Huawei VRP', hint: 'tempel setelah `system-view`' },
  ubiquiti: { label: 'Ubiquiti EdgeOS', hint: 'tempel setelah `configure` lalu `commit`' },
  vyos: { label: 'VyOS', hint: 'tempel setelah `configure` lalu `commit`' },
  fortinet: { label: 'Fortinet FortiOS', hint: 'tempel di prompt `config`' },
  aruba: { label: 'Aruba AOS-CX', hint: 'tempel setelah `configure terminal`' },
  openwrt: { label: 'OpenWrt (UCI)', hint: 'tempel di shell, lalu `uci commit`' },
  linux: { label: 'Linux (iproute/iptables)', hint: 'tempel di shell (root)' },
  windows: { label: 'Windows (netsh/route)', hint: 'tempel di PowerShell/CMD (admin)' },
};

// ── helpers umum ─────────────────────────────────────────────────

function mkPoolName(subnet: string): string {
  const base = subnet.split('/')[0].split('.').slice(0, 3).join('-');
  return `pool-${base}`;
}

/** Ubah "192.168.1.100-192.168.1.200" → { first, last }. */
function parsePoolRange(range: string): { first: string; last: string } {
  const [first, last] = range.split('-').map((s) => s.trim());
  return { first: first || '', last: last || '' };
}

function slug(s: string): string {
  return (s || 'router').toLowerCase().replace(/[^a-z0-9_-]+/g, '_') || 'router';
}

function prefixToMask(prefix: string): string {
  const p = Math.max(0, Math.min(32, parseInt(prefix, 10) || 24));
  let mask = 0;
  for (let i = 0; i < 32; i++) mask = (mask << 1) | (i < p ? 1 : 0);
  return [24, 16, 8, 0]
    .map((s) => ((mask >>> s) & 255).toString())
    .join('.');
}

function wildcard(mask: string): string {
  return mask
    .split('.')
    .map((o) => (255 - parseInt(o, 10)).toString())
    .join('.');
}

function networkOf(ip: string, mask: string): string {
  const i = ip.split('.').map(Number);
  const m = mask.split('.').map(Number);
  return i.map((o, idx) => (o & m[idx]).toString()).join('.');
}

function cidrOf(ipCidr: string): string {
  const [ip, pref] = ipCidr.split('/');
  const mask = prefixToMask(pref ?? '24');
  return `${networkOf(ip, mask)}/${pref ?? '24'}`;
}

interface Derived {
  wanPrefix: string;
  lanPrefix: string;
  wanMask: string;
  lanMask: string;
  wanIpNoPrefix: string;
  lanNetwork: string;
  pool: { first: string; last: string };
  dns: string;
}

function derive(p: ConfigGeneratorParams): Derived {
  const [wanIpNoPrefix, wanPrefix = '24'] = p.wanIp.split('/');
  const [, lanPrefix = '24'] = p.lanSubnet.split('/');
  const wanMask = prefixToMask(wanPrefix);
  const lanMask = prefixToMask(lanPrefix);
  return {
    wanPrefix,
    lanPrefix,
    wanMask,
    lanMask,
    wanIpNoPrefix,
    lanNetwork: `${p.lanSubnet.split('/')[0]}/${lanPrefix}`,
    pool: parsePoolRange(p.dhcpPoolRange),
    dns: p.dnsServers.join(','),
  };
}

// ── MikroTik RouterOS ────────────────────────────────────────────

export function generateMikrotikConfig(p: ConfigGeneratorParams): string {
  const lines: string[] = [];
  const d = derive(p);

  lines.push('# ========================================================');
  lines.push('# NetLab Config Generator — MikroTik RouterOS 7');
  lines.push(`# Hostname : ${p.hostname}`);
  lines.push('# ========================================================');
  lines.push('');
  lines.push(`/system identity set name=${p.hostname}`);
  lines.push('');
  lines.push('# WAN Interface');
  lines.push(`/ip address add address=${p.wanIp} interface=${p.wanIface}`);
  lines.push(`/ip route add dst-address=0.0.0.0/0 gateway=${p.wanGateway} distance=1`);
  lines.push('');
  lines.push('# LAN');
  lines.push(`/ip address add address=${p.lanGatewayIp}/${d.lanPrefix} interface=${p.lanIface}`);
  lines.push('');
  const pool = mkPoolName(p.lanSubnet);
  if (d.pool.first && d.pool.last) {
    lines.push('# DHCP Server');
    lines.push(`/ip pool add name=${pool} ranges=${d.pool.first}-${d.pool.last}`);
    lines.push(`/ip dhcp-server add address-pool=${pool} interface=${p.lanIface} name=dhcp-${p.lanIface} lease-time=10m`);
    lines.push(`/ip dhcp-server network add address=${p.lanSubnet} gateway=${p.lanGatewayIp} dns-server=${d.dns}`);
    lines.push('');
  }
  if (p.vlans.length > 0) {
    lines.push('# VLAN (bridge per VLAN)');
    for (const v of p.vlans) {
      lines.push(`/interface vlan add name=vlan${v.id} vlan-id=${v.id} interface=${p.lanIface}`);
      lines.push(`/interface bridge add name=bridge-v${v.id}`);
      lines.push(`/interface bridge port add bridge=bridge-v${v.id} interface=vlan${v.id}`);
    }
    lines.push('');
  }
  if (p.enableFirewall) {
    lines.push('# Firewall Filter (stateful dasar)');
    lines.push('/ip firewall filter add chain=input action=accept connection-state=established,related comment="allow established"');
    lines.push(`/ip firewall filter add chain=input action=accept connection-state=new in-interface=${p.wanIface} protocol=icmp comment="allow ping dari WAN"`);
    lines.push(`/ip firewall filter add chain=input action=drop in-interface=${p.wanIface} connection-state=new comment="blokir baru dari WAN"`);
    lines.push('/ip firewall filter add chain=forward action=accept connection-state=established,related');
    lines.push(`/ip firewall filter add chain=forward action=drop in-interface=${p.wanIface} connection-state=new comment="blokir forward baru dari WAN"`);
    lines.push('');
  }
  if (p.enableNat) {
    lines.push('# NAT Masquerade');
    lines.push(`/ip firewall nat add chain=srcnat out-interface=${p.wanIface} action=masquerade comment="masquerade keluar WAN"`);
    lines.push('');
  }
  if (p.routing === 'ospf') {
    lines.push('# OSPF Single Area (area 0)');
    lines.push(`/routing ospf instance add name=ospf-instance router-id=${p.lanGatewayIp}`);
    lines.push('/routing ospf area add name=backbone instance=ospf-instance area-id=0.0.0.0');
    lines.push(`/routing ospf interface-template add interfaces=${p.wanIface} area=backbone`);
    lines.push(`/routing ospf interface-template add interfaces=${p.lanIface} area=backbone`);
    for (const v of p.vlans) {
      lines.push(`/routing ospf interface-template add interfaces=vlan${v.id} area=backbone`);
    }
    lines.push('');
  }
  lines.push('# DNS');
  lines.push(`/ip dns set servers=${d.dns} allow-remote-requests=yes`);
  lines.push('');
  lines.push('# ── selesai — load script: /import file-name=agen-config.rsc ──');
  return lines.join('\n');
}

// ── Cisco IOS (dipakai juga oleh NX-OS & Aruba dengan penyesuaian) ──

export function generateCiscoConfig(p: ConfigGeneratorParams): string {
  const lines: string[] = [];
  const d = derive(p);
  const isNxos = p.vendor === 'cisco_nxos';
  const isAruba = p.vendor === 'aruba';

  const banner = isNxos ? 'Cisco NX-OS' : isAruba ? 'Aruba AOS-CX' : 'Cisco IOS';
  lines.push(`! ==========================================================`);
  lines.push(`! NetLab Config Generator — ${banner}`);
  lines.push(`! Hostname : ${p.hostname}`);
  lines.push(`! ==========================================================`);
  lines.push('');
  if (isAruba) {
    lines.push('configure terminal');
  } else {
    lines.push('enable');
    lines.push('configure terminal');
  }
  lines.push(`hostname ${p.hostname}`);
  lines.push('');
  if (isNxos) {
    lines.push('! Fitur wajib aktif di NX-OS');
    lines.push('feature interface-vlan');
    if (p.routing === 'ospf') lines.push('feature ospf');
    lines.push('');
  }
  lines.push('! WAN Interface');
  lines.push(`interface ${p.wanIface}`);
  lines.push(' no shutdown');
  lines.push(` ip address ${d.wanIpNoPrefix} ${d.wanMask}`);
  lines.push(' description Uplink to ISP');
  lines.push('exit');
  lines.push('');
  lines.push('! LAN Interface');
  lines.push(`interface ${p.lanIface}`);
  lines.push(' no shutdown');
  lines.push(` ip address ${p.lanGatewayIp} ${d.lanMask}`);
  lines.push('exit');
  lines.push('');
  lines.push('! Default route via ISP');
  lines.push(`ip route 0.0.0.0 0.0.0.0 ${p.wanGateway}`);
  lines.push('');

  if (p.vlans.length > 0) {
    lines.push('! VLAN subinterfaces (router-on-a-stick)');
    for (const v of p.vlans) {
      lines.push(`interface ${p.lanIface}.${v.id}`);
      lines.push(` encapsulation dot1Q ${v.id}`);
      lines.push(` description ${v.name}`);
      lines.push(` ip address 10.${v.id}.0.1 255.255.255.0`);
      lines.push('exit');
    }
    lines.push('');
  }

  if (p.enableFirewall) {
    lines.push('! ACL dasar proteksi WAN');
    if (isAruba) {
      lines.push('ip access-list extended WAN-IN');
      lines.push(' permit icmp any any');
      lines.push(' permit tcp any any established');
      lines.push(' deny ip any any log');
      lines.push('exit');
      lines.push(`interface ${p.wanIface}`);
      lines.push(' apply access-list ip WAN-IN in');
      lines.push('exit');
    } else {
      lines.push('ip access-list extended WAN-IN');
      lines.push(' permit icmp any any echo-reply');
      lines.push(' permit tcp any any established');
      lines.push(' deny ip any any log');
      lines.push('exit');
      lines.push(`interface ${p.wanIface}`);
      lines.push(' ip access-group WAN-IN in');
      lines.push('exit');
    }
    lines.push('');
  }

  if (p.enableNat) {
    lines.push('! NAT overload (PAT) — inside/outside');
    lines.push(`interface ${p.lanIface}`);
    lines.push(' ip nat inside');
    lines.push('exit');
    lines.push(`interface ${p.wanIface}`);
    lines.push(' ip nat outside');
    lines.push('exit');
    if (p.vlans.length > 0) {
      for (const v of p.vlans) {
        lines.push(`interface ${p.lanIface}.${v.id}`);
        lines.push(' ip nat inside');
        lines.push('exit');
      }
    }
    lines.push('ip access-list standard NAT-ACL');
    lines.push(` permit ${p.lanGatewayIp} ${wildcard(d.lanMask)}`);
    lines.push('exit');
    lines.push(`ip nat inside source list NAT-ACL interface ${p.wanIface} overload`);
    lines.push('');
  }

  if (p.routing === 'ospf') {
    lines.push('! OSPF Single Area 0');
    lines.push('router ospf 1');
    lines.push(` router-id ${p.lanGatewayIp}`);
    lines.push(` network ${networkOf(p.lanGatewayIp, d.lanMask)} ${wildcard(d.lanMask)} area 0`);
    if (d.wanIpNoPrefix) {
      lines.push(` network ${networkOf(d.wanIpNoPrefix, d.wanMask)} ${wildcard(d.wanMask)} area 0`);
    }
    for (const v of p.vlans) {
      lines.push(` network 10.${v.id}.0.0 0.0.0.255 area 0`);
    }
    lines.push('exit');
    lines.push('');
  }

  if (isNxos) {
    // NX-OS tidak menyediakan DHCP server pada kelas ini — jujur:
    lines.push('! NX-OS: DHCP server eksternal (fitur DHCP server tidak tersedia)');
    lines.push('');
  } else {
    lines.push('! DHCP Pool');
    if (d.pool.first && d.pool.last) {
      lines.push(`ip dhcp excluded-address ${p.lanGatewayIp}`);
      if (p.vlans.length > 0) {
        lines.push('! DHCP per subnet VLAN via ip dhcp pool');
        for (const v of p.vlans) {
          lines.push(`ip dhcp pool VLAN${v.id}`);
          lines.push(` network 10.${v.id}.0.0 255.255.255.0`);
          lines.push(` default-router 10.${v.id}.0.1`);
          lines.push(` dns-server ${p.dnsServers.join(' ')}`);
          lines.push('exit');
        }
      }
      lines.push('ip dhcp pool LAN');
      lines.push(` network ${p.lanSubnet}`);
      lines.push(` default-router ${p.lanGatewayIp}`);
      lines.push(` dns-server ${p.dnsServers.join(' ')}`);
      lines.push('exit');
      lines.push('');
    }
  }

  lines.push('! DNS');
  lines.push(`ip name-server ${p.dnsServers.join(' ')}`);
  lines.push('ip domain-lookup');
  lines.push('');
  lines.push('end');
  if (!isNxos && !isAruba) lines.push('write memory');
  lines.push('! ── selesai ──');
  return lines.join('\n');
}

// ── NX-OS & Aruba alias ──────────────────────────────────────────

export function generateNxosConfig(p: ConfigGeneratorParams): string {
  return generateCiscoConfig({ ...p, vendor: 'cisco_nxos' });
}

export function generateArubaConfig(p: ConfigGeneratorParams): string {
  return generateCiscoConfig({ ...p, vendor: 'aruba' });
}

// ── Juniper Junos ────────────────────────────────────────────────

export function generateJuniperConfig(p: ConfigGeneratorParams): string {
  const lines: string[] = [];
  const d = derive(p);
  lines.push('# ========================================================');
  lines.push('# NetLab Config Generator — Juniper Junos (SRX / MX)');
  lines.push(`# Hostname : ${p.hostname}`);
  lines.push('# ========================================================');
  lines.push('');
  lines.push(`set system host-name ${p.hostname}`);
  lines.push(`set interfaces ${p.wanIface} unit 0 family inet address ${d.wanIpNoPrefix}/${d.wanPrefix}`);
  lines.push(`set interfaces ${p.lanIface} unit 0 family inet address ${p.lanGatewayIp}/${d.lanPrefix}`);
  lines.push(`set routing-options static route 0.0.0.0/0 next-hop ${p.wanGateway}`);
  lines.push('');
  if (p.vlans.length > 0) {
    lines.push('# VLAN (unit per VLAN)');
    for (const v of p.vlans) {
      lines.push(`set interfaces ${p.lanIface} vlan-tagging`);
      lines.push(`set interfaces ${p.lanIface} unit ${v.id} vlan-id ${v.id}`);
      lines.push(`set interfaces ${p.lanIface} unit ${v.id} family inet address 10.${v.id}.0.1/24`);
    }
    lines.push('');
  }
  if (p.enableFirewall) {
    lines.push('# Firewall filter proteksi WAN');
    lines.push('set firewall family inet filter WAN-IN term established from tcp-established');
    lines.push('set firewall family inet filter WAN-IN term established then accept');
    lines.push('set firewall family inet filter WAN-IN term icmp from protocol icmp');
    lines.push('set firewall family inet filter WAN-IN term icmp then accept');
    lines.push('set firewall family inet filter WAN-IN term default then discard');
    lines.push(`set interfaces ${p.wanIface} unit 0 family inet filter input WAN-IN`);
    lines.push('');
  }
  if (p.enableNat) {
    lines.push('# Source NAT (masquerade)');
    lines.push(`set security nat source rule-set RS1 from zone untrust`);
    lines.push(`set security nat source rule-set RS1 to zone trust`);
    lines.push('set security nat source rule-set RS1 rule 10 match source-address 0.0.0.0/0');
    lines.push(`set security nat source rule-set RS1 rule 10 then source-nat interface`);
    lines.push('');
  }
  if (d.pool.first && d.pool.last) {
    lines.push('# DHCP server — address-assignment pool');
    const pool = mkPoolName(p.lanSubnet);
    lines.push(`set access address-assignment pool ${pool} family inet network ${d.lanNetwork}`);
    lines.push(`set access address-assignment pool ${pool} family inet range R1 low ${d.pool.first} high ${d.pool.last}`);
    lines.push(`set access address-assignment pool ${pool} family inet dhcp-attributes router ${p.lanGatewayIp}`);
    for (const s of p.dnsServers) {
      lines.push(`set access address-assignment pool ${pool} family inet dhcp-attributes name-server ${s}`);
    }
    lines.push(`set system services dhcp-local-server group G1 interface ${p.lanIface}`);
    lines.push('');
  }
  lines.push('# DNS');
  for (const s of p.dnsServers) lines.push(`set system name-server ${s}`);
  lines.push('');
  if (p.routing === 'ospf') {
    lines.push('# OSPF area 0');
    lines.push(`set protocols ospf area 0.0.0.0 interface ${p.wanIface}.0`);
    lines.push(`set protocols ospf area 0.0.0.0 interface ${p.lanIface}.0`);
    for (const v of p.vlans) lines.push(`set protocols ospf area 0.0.0.0 interface ${p.lanIface}.${v.id}`);
    lines.push(`set protocols ospf area 0.0.0.0 interface lo0.0`);
    lines.push('');
  }
  lines.push('commit');
  return lines.join('\n');
}

// ── Huawei VRP ───────────────────────────────────────────────────

export function generateHuaweiConfig(p: ConfigGeneratorParams): string {
  const lines: string[] = [];
  const d = derive(p);
  lines.push('# ========================================================');
  lines.push('# NetLab Config Generator — Huawei VRP');
  lines.push(`# Hostname : ${p.hostname}`);
  lines.push('# ========================================================');
  lines.push('');
  lines.push('system-view');
  lines.push(`sysname ${p.hostname}`);
  lines.push('');
  lines.push('! WAN Interface');
  lines.push(`interface ${p.wanIface}`);
  lines.push(` ip address ${d.wanIpNoPrefix} ${d.wanMask}`);
  lines.push(` description Uplink to ISP`);
  lines.push('quit');
  lines.push('');
  lines.push('! LAN Interface');
  lines.push(`interface ${p.lanIface}`);
  lines.push(` ip address ${p.lanGatewayIp} ${d.lanMask}`);
  lines.push('quit');
  lines.push('');
  lines.push('! Default route via ISP');
  lines.push(`ip route-static 0.0.0.0 0.0.0.0 ${p.wanGateway}`);
  lines.push('');
  if (p.vlans.length > 0) {
    lines.push('! VLAN + subinterface (router-on-a-stick)');
    for (const v of p.vlans) {
      lines.push(`vlan ${v.id}`);
      lines.push('quit');
      lines.push(`interface ${p.lanIface}.${v.id}`);
      lines.push(` dot1q termination vid ${v.id}`);
      lines.push(` ip address 10.${v.id}.0.1 255.255.255.0`);
      lines.push('quit');
    }
    lines.push('');
  }
  if (d.pool.first && d.pool.last) {
    lines.push('! DHCP');
    lines.push('dhcp enable');
    lines.push(`ip pool ${mkPoolName(p.lanSubnet)}`);
    lines.push(` network ${p.lanSubnet.split('/')[0]} mask ${d.lanMask}`);
    lines.push(` gateway-list ${p.lanGatewayIp}`);
    lines.push(` dns-list ${p.dnsServers.join(' ')}`);
    lines.push('quit');
    lines.push(`interface ${p.lanIface}`);
    lines.push(' dhcp select global');
    lines.push('quit');
    lines.push('');
  }
  if (p.enableFirewall) {
    lines.push('! ACL proteksi WAN (deny dari WAN, permit sisanya)');
    lines.push('acl number 3000');
    lines.push(' rule 5 deny tcp source any destination any destination-port eq 3389');
    lines.push(' rule 10 permit ip');
    lines.push('quit');
    lines.push(`interface ${p.wanIface}`);
    lines.push(' traffic-filter inbound acl 3000');
    lines.push('quit');
    lines.push('');
  }
  if (p.enableNat) {
    lines.push('! NAT (outbound)');
    if (p.enableFirewall) {
      lines.push('nat address-group GROUP1');
      lines.push(' mode pat');
      lines.push('quit');
      lines.push(`nat outbound 3000 address-group GROUP1`);
    } else {
      lines.push('acl number 2000');
      lines.push(` rule 5 permit source ${p.lanSubnet.split('/')[0]} ${wildcard(d.lanMask)}`);
      lines.push('quit');
      lines.push('nat outbound 2000');
    }
    lines.push('');
  }
  if (p.routing === 'ospf') {
    lines.push('! OSPF single area 0');
    lines.push('ospf 1');
    lines.push(` router-id ${p.lanGatewayIp}`);
    lines.push(' area 0.0.0.0');
    lines.push(`  network ${networkOf(p.lanGatewayIp, d.lanMask)} ${wildcard(d.lanMask)}`);
    if (d.wanIpNoPrefix) {
      lines.push(`  network ${networkOf(d.wanIpNoPrefix, d.wanMask)} ${wildcard(d.wanMask)}`);
    }
    for (const v of p.vlans) lines.push(`  network 10.${v.id}.0.0 0.0.0.255`);
    lines.push(' quit');
    lines.push('quit');
    lines.push('');
  }
  lines.push('! DNS');
  for (const s of p.dnsServers) lines.push(`dns server ${s}`);
  lines.push('quit');
  lines.push('save');
  return lines.join('\n');
}

// ── Fortinet FortiOS ─────────────────────────────────────────────

export function generateFortinetConfig(p: ConfigGeneratorParams): string {
  const lines: string[] = [];
  const d = derive(p);
  const iface = `${d.wanIpNoPrefix} ${d.wanMask}`;
  lines.push('# ========================================================');
  lines.push('# NetLab Config Generator — Fortinet FortiOS');
  lines.push(`# Hostname : ${p.hostname}`);
  lines.push('# ========================================================');
  lines.push('');
  lines.push('config system global');
  lines.push(` set hostname "${p.hostname}"`);
  lines.push('end');
  lines.push('');
  lines.push('config system interface');
  lines.push(` edit ${p.wanIface}`);
  lines.push(`  set ip ${iface}`);
  lines.push('  set allowaccess ping');
  lines.push(`  set alias "WAN-to-ISP"`);
  lines.push(' next');
  lines.push(` edit ${p.lanIface}`);
  lines.push(`  set ip ${p.lanGatewayIp} ${d.lanMask}`);
  lines.push('  set allowaccess ping https ssh');
  lines.push(' next');
  for (const v of p.vlans) {
    lines.push(` edit ${p.lanIface}.${v.id}`);
    lines.push(`  set vlanid ${v.id}`);
    lines.push(`  set interface ${p.lanIface}`);
    lines.push(`  set ip 10.${v.id}.0.1 255.255.255.0`);
    lines.push(' next');
  }
  lines.push('end');
  lines.push('');
  lines.push('config router static');
  lines.push(' edit 1');
  lines.push(`  set device ${p.wanIface}`);
  lines.push(`  set gateway ${p.wanGateway}`);
  lines.push(' next');
  lines.push('end');
  lines.push('');
  if (d.pool.first && d.pool.last) {
    lines.push('config system dhcp server');
    lines.push(' edit 1');
    lines.push(`  set interface ${p.lanIface}`);
    lines.push(`  set default-gateway ${p.lanGatewayIp}`);
    lines.push(`  set netmask ${d.lanMask}`);
    for (const s of p.dnsServers) lines.push(`  set dns-server ${s}`);
    lines.push('  config ip-range');
    lines.push('   edit 1');
    lines.push(`    set start-ip ${d.pool.first}`);
    lines.push(`    set end-ip ${d.pool.last}`);
    lines.push('   next');
    lines.push('  end');
    lines.push(' next');
    lines.push('end');
    lines.push('');
  }
  lines.push('config system dns');
  if (p.dnsServers[0]) lines.push(` set primary ${p.dnsServers[0]}`);
  if (p.dnsServers[1]) lines.push(` set secondary ${p.dnsServers[1]}`);
  lines.push('end');
  lines.push('');
  if (p.enableFirewall || p.enableNat) {
    lines.push('config firewall policy');
    lines.push(' edit 1');
    lines.push(`  set srcintf "${p.lanIface}"`);
    lines.push(`  set dstintf "${p.wanIface}"`);
    lines.push('  set srcaddr "all"');
    lines.push('  set dstaddr "all"');
    lines.push('  set action accept');
    lines.push('  set schedule "always"');
    lines.push('  set service "ALL"');
    if (p.enableNat) lines.push('  set nat enable');
    lines.push(' next');
    lines.push('end');
    lines.push('');
  }
  if (p.routing === 'ospf') {
    lines.push('config router ospf');
    lines.push(` set router-id ${p.lanGatewayIp}`);
    lines.push(' config network');
    lines.push('  edit 1');
    lines.push(`   set prefix ${d.lanNetwork}`);
    lines.push('  next');
    if (d.wanIpNoPrefix) {
      lines.push('  edit 2');
      lines.push(`   set prefix ${networkOf(d.wanIpNoPrefix, d.wanMask)}/${d.wanPrefix}`);
      lines.push('  next');
    }
    lines.push(' end');
    lines.push('end');
    lines.push('');
  }
  lines.push('end');
  return lines.join('\n');
}

// ── VyOS / Ubiquiti EdgeOS ───────────────────────────────────────

export function generateVyosConfig(p: ConfigGeneratorParams, vendor: 'vyos' | 'ubiquiti' = 'vyos'): string {
  const lines: string[] = [];
  const d = derive(p);
  const banner = vendor === 'ubiquiti' ? 'Ubiquiti EdgeOS' : 'VyOS';
  lines.push('# ========================================================');
  lines.push(`# NetLab Config Generator — ${banner}`);
  lines.push(`# Hostname : ${p.hostname}`);
  lines.push('# ========================================================');
  lines.push('');
  lines.push('configure');
  lines.push(`set system host-name ${p.hostname}`);
  lines.push(`set interfaces ethernet ${p.wanIface} address ${d.wanIpNoPrefix}/${d.wanPrefix}`);
  lines.push(`set interfaces ethernet ${p.lanIface} address ${p.lanGatewayIp}/${d.lanPrefix}`);
  lines.push(`set protocols static route 0.0.0.0/0 next-hop ${p.wanGateway}`);
  lines.push('');
  if (p.vlans.length > 0) {
    lines.push('# VLAN subinterface (vif)');
    for (const v of p.vlans) {
      lines.push(`set interfaces ethernet ${p.lanIface} vif ${v.id} address 10.${v.id}.0.1/24`);
      lines.push(`set interfaces ethernet ${p.lanIface} vif ${v.id} description "${v.name}"`);
    }
    lines.push('');
  }
  if (d.pool.first && d.pool.last) {
    const net = mkPoolName(p.lanSubnet);
    lines.push('# DHCP server');
    lines.push(`set service dhcp-server shared-network-name ${net} subnet ${d.lanNetwork} start ${d.pool.first} stop ${d.pool.last}`);
    lines.push(`set service dhcp-server shared-network-name ${net} subnet ${d.lanNetwork} default-router ${p.lanGatewayIp}`);
    for (const s of p.dnsServers) {
      lines.push(`set service dhcp-server shared-network-name ${net} subnet ${d.lanNetwork} name-server ${s}`);
    }
    lines.push('');
  }
  if (p.enableNat) {
    lines.push('# Source NAT masquerade');
    lines.push(`set nat source rule 100 outbound-interface ${p.wanIface}`);
    lines.push(`set nat source rule 100 source address ${d.lanNetwork}`);
    lines.push('set nat source rule 100 translation address masquerade');
    lines.push('');
  }
  if (p.enableFirewall) {
    lines.push('# Firewall filter WAN');
    lines.push('set firewall name WAN-IN default-action drop');
    lines.push('set firewall name WAN-IN rule 10 action accept');
    lines.push('set firewall name WAN-IN rule 10 state established enable');
    lines.push('set firewall name WAN-IN rule 20 action accept');
    lines.push('set firewall name WAN-IN rule 20 protocol icmp');
    lines.push('');
  }
  if (p.routing === 'ospf') {
    lines.push('# OSPF area 0');
    lines.push(`set protocols ospf area 0 network ${d.lanNetwork}`);
    if (d.wanIpNoPrefix) lines.push(`set protocols ospf area 0 network ${networkOf(d.wanIpNoPrefix, d.wanMask)}/${d.wanPrefix}`);
    for (const v of p.vlans) lines.push(`set protocols ospf area 0 network 10.${v.id}.0.0/24`);
    lines.push(`set protocols ospf parameters router-id ${p.lanGatewayIp}`);
    lines.push('');
  }
  lines.push('commit');
  lines.push('save');
  return lines.join('\n');
}

export function generateUbiquitiConfig(p: ConfigGeneratorParams): string {
  return generateVyosConfig(p, 'ubiquiti');
}

// ── Aruba sudah via generateCiscoConfig (blok 673 format.ts) ─────

// ── OpenWrt (UCI) ────────────────────────────────────────────────

export function generateOpenwrtConfig(p: ConfigGeneratorParams): string {
  const lines: string[] = [];
  const d = derive(p);
  lines.push('# ========================================================');
  lines.push('# NetLab Config Generator — OpenWrt (UCI)');
  lines.push(`# Hostname : ${p.hostname}`);
  lines.push('# ========================================================');
  lines.push('');
  lines.push(`uci set system.@system[0].hostname=${p.hostname}`);
  lines.push(`uci set network.wan=interface`);
  lines.push(`uci set network.wan.proto=static`);
  lines.push(`uci set network.wan.ifname=${p.wanIface}`);
  lines.push(`uci set network.wan.ipaddr=${d.wanIpNoPrefix}`);
  lines.push(`uci set network.wan.netmask=${d.wanMask}`);
  lines.push(`uci set network.wan.gateway=${p.wanGateway}`);
  if (p.dnsServers.length > 0) lines.push(`uci set network.wan.dns='${p.dnsServers.join(' ')}'`);
  lines.push(`uci set network.lan=interface`);
  lines.push(`uci set network.lan.proto=static`);
  lines.push(`uci set network.lan.ifname=${p.lanIface}`);
  lines.push(`uci set network.lan.ipaddr=${p.lanGatewayIp}`);
  lines.push(`uci set network.lan.netmask=${d.lanMask}`);
  lines.push('uci commit network');
  lines.push('');
  if (p.vlans.length > 0) {
    lines.push('# VLAN');
    for (const v of p.vlans) {
      lines.push(`uci set network.vlan${v.id}=interface`);
      lines.push(`uci set network.vlan${v.id}.ifname=${p.lanIface}.${v.id}`);
      lines.push(`uci set network.vlan${v.id}.proto=static`);
      lines.push(`uci set network.vlan${v.id}.ipaddr=10.${v.id}.0.1`);
      lines.push(`uci set network.vlan${v.id}.netmask=255.255.255.0`);
    }
    lines.push('uci commit network');
    lines.push('');
  }
  if (d.pool.first && d.pool.last) {
    const startOct = d.pool.first.split('.')[3];
    const endOct = d.pool.last.split('.')[3];
    lines.push('# DHCP server (dnsmasq)');
    lines.push(`# Range: ${d.pool.first} - ${d.pool.last} pada subnet ${p.lanSubnet}`);
    lines.push('uci set dhcp.lan=dhcp');
    lines.push(`uci set dhcp.lan.interface=${p.lanIface}`);
    lines.push(`uci set dhcp.lan.start=${startOct}`);
    lines.push(`uci set dhcp.lan.limit=${Number(endOct) - Number(startOct) + 1}`);
    lines.push(`uci set dhcp.lan.leasetime=12h`);
    for (let i = 0; i < p.dnsServers.length; i++) {
      lines.push(`uci add_list dhcp.lan.dhcp_option='6,${p.dnsServers[i]}'`);
    }
    lines.push('uci commit dhcp');
    lines.push('');
  }
  if (p.enableNat) {
    lines.push('# NAT masquerade (zone wan)');
    lines.push('uci set firewall.@zone[1].masq=1');
    lines.push('uci commit firewall');
    lines.push('');
  }
  if (p.enableFirewall) {
    lines.push('# Firewall: izinkan input LAN, drop input WAN baru');
    lines.push('uci set firewall.@defaults[0].input=REJECT');
    lines.push('uci set firewall.@defaults[0].output=ACCEPT');
    lines.push('uci set firewall.@defaults[0].forward=REJECT');
    lines.push('uci commit firewall');
    lines.push('');
  }
  lines.push('uci commit');
  lines.push('/etc/init.d/network reload');
  lines.push('return 0');
  return lines.join('\n');
}

// ── Linux (iproute2 / iptables / isc-dhcp) ───────────────────────

export function generateLinuxConfig(p: ConfigGeneratorParams): string {
  const lines: string[] = [];
  const d = derive(p);
  lines.push('#!/bin/bash');
  lines.push('# ========================================================');
  lines.push('# NetLab Config Generator — Linux (iproute2 / iptables)');
  lines.push(`# Hostname : ${p.hostname}`);
  lines.push('# ========================================================');
  lines.push('');
  lines.push(`hostnamectl set-hostname ${p.hostname}`);
  lines.push(`ip link set dev ${p.wanIface} up`);
  lines.push(`ip addr add ${d.wanIpNoPrefix}/${d.wanPrefix} dev ${p.wanIface}`);
  lines.push(`ip link set dev ${p.lanIface} up`);
  lines.push(`ip addr add ${p.lanGatewayIp}/${d.lanPrefix} dev ${p.lanIface}`);
  lines.push(`ip route add default via ${p.wanGateway}`);
  lines.push('sysctl -w net.ipv4.ip_forward=1');
  lines.push('');
  if (p.vlans.length > 0) {
    lines.push('# VLAN subinterface (802.1Q)');
    for (const v of p.vlans) {
      lines.push(`ip link add link ${p.lanIface} name ${p.lanIface}.${v.id} type vlan id ${v.id}`);
      lines.push(`ip addr add 10.${v.id}.0.1/24 dev ${p.lanIface}.${v.id}`);
      lines.push(`ip link set dev ${p.lanIface}.${v.id} up`);
    }
    lines.push('');
  }
  if (p.dnsServers.length > 0) {
    lines.push('# DNS');
    for (const s of p.dnsServers) lines.push(`echo "nameserver ${s}" >> /etc/resolv.conf`);
    lines.push('');
  }
  if (d.pool.first && d.pool.last) {
    lines.push('# DHCP server (isc-dhcp-server)');
    lines.push(
      `echo "subnet ${p.lanSubnet.split('/')[0]} netmask ${d.lanMask} { range ${d.pool.first} ${d.pool.last}; option routers ${p.lanGatewayIp}; option domain-name-servers ${p.dnsServers.join(', ')}; }" > /etc/dhcp/dhcpd.conf`
    );
    lines.push('systemctl restart isc-dhcp-server');
    lines.push('');
  }
  if (p.enableNat) {
    lines.push('# NAT masquerade');
    lines.push(`iptables -t nat -A POSTROUTING -o ${p.wanIface} -j MASQUERADE`);
    lines.push('');
  }
  if (p.enableFirewall) {
    lines.push('# Firewall (stateful)');
    lines.push('iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT');
    lines.push(`iptables -A FORWARD -i ${p.lanIface} -o ${p.wanIface} -j ACCEPT`);
    lines.push('');
  }
  if (p.routing === 'ospf') {
    lines.push('# OSPF (frr/zebra)');
    lines.push('apt-get install -y frr');
    lines.push('sed -i "s/^ospfd=no/ospfd=yes/" /etc/frr/daemons');
    lines.push('vtysh -c "configure terminal" \\');
    lines.push(`  -c "router ospf" \\`);
    lines.push(`  -c " network ${d.lanNetwork} area 0"`);
    lines.push('');
  }
  lines.push('# ── selesai ──');
  return lines.join('\n');
}

// ── Windows (netsh / route) ──────────────────────────────────────

export function generateWindowsConfig(p: ConfigGeneratorParams): string {
  const lines: string[] = [];
  const d = derive(p);
  lines.push('REM ========================================================');
  lines.push('REM NetLab Config Generator — Windows (netsh / route)');
  lines.push(`REM Hostname : ${p.hostname}`);
  lines.push('REM ========================================================');
  lines.push('');
  lines.push(`netsh interface ipv4 set address name="${p.wanIface}" static ${d.wanIpNoPrefix} ${d.wanMask} ${p.wanGateway}`);
  lines.push(`netsh interface ipv4 set address name="${p.lanIface}" static ${p.lanGatewayIp} ${d.lanMask}`);
  lines.push(`netsh interface ipv4 set interface "${p.wanIface}" forwarding=enabled`);
  lines.push(`netsh interface ipv4 set interface "${p.lanIface}" forwarding=enabled`);
  lines.push(`route add 0.0.0.0 mask 0.0.0.0 ${p.wanGateway} -p`);
  lines.push('');
  if (p.dnsServers.length > 0) {
    lines.push('REM DNS');
    lines.push(`netsh interface ipv4 set dnsservers name="${p.lanIface}" static ${p.dnsServers[0]} primary`);
    if (p.dnsServers[1]) lines.push(`netsh interface ipv4 add dnsservers name="${p.lanIface}" ${p.dnsServers[1]} index=2`);
    lines.push('');
  }
  if (p.enableNat) {
    lines.push('REM NAT / ICS-style forwarding (RRAS)');
    lines.push(`netsh routing ip nat install`);
    lines.push(`netsh routing ip nat add interface "${p.wanIface}" full`);
    lines.push(`netsh routing ip nat add interface "${p.lanIface}" private`);
    lines.push('');
  }
  if (p.enableFirewall) {
    lines.push('REM Firewall');
    lines.push('netsh advfirewall firewall set currentprofile state on');
    lines.push(`netsh advfirewall firewall add rule name="NetLab-Allow-LAN" dir=in action=allow remoteip=localsubnet`);
    lines.push('');
  }
  if (p.vlans.length > 0) {
    lines.push('REM VLAN (via NIC advanced property — contoh)');
    for (const v of p.vlans) {
      lines.push(`netsh interface ipv4 add address name="${p.lanIface}" 10.${v.id}.0.1 ${d.lanMask}`);
    }
    lines.push('');
  }
  lines.push('REM ── selesai ──');
  return lines.join('\n');
}

// ── dispatcher ───────────────────────────────────────────────────

export function generateConfig(p: ConfigGeneratorParams): { filename: string; content: string } {
  switch (p.vendor) {
    case 'mikrotik':
      return { filename: `${slug(p.hostname)}.rsc`, content: generateMikrotikConfig(p) };
    case 'cisco_nxos':
      return { filename: `${slug(p.hostname)}.vwv`, content: generateNxosConfig(p) };
    case 'aruba':
      return { filename: `${slug(p.hostname)}.txt`, content: generateArubaConfig(p) };
    case 'juniper':
      return { filename: `${slug(p.hostname)}.set`, content: generateJuniperConfig(p) };
    case 'huawei':
      return { filename: `${slug(p.hostname)}.vrp`, content: generateHuaweiConfig(p) };
    case 'fortinet':
      return { filename: `${slug(p.hostname)}.conf`, content: generateFortinetConfig(p) };
    case 'vyos':
      return { filename: `${slug(p.hostname)}.vyos`, content: generateVyosConfig(p, 'vyos') };
    case 'ubiquiti':
      return { filename: `${slug(p.hostname)}.edgeos`, content: generateUbiquitiConfig(p) };
    case 'openwrt':
      return { filename: `${slug(p.hostname)}.sh`, content: generateOpenwrtConfig(p) };
    case 'linux':
      return { filename: `${slug(p.hostname)}.sh`, content: generateLinuxConfig(p) };
    case 'windows':
      return { filename: `${slug(p.hostname)}.bat`, content: generateWindowsConfig(p) };
    case 'cisco_ios':
    default:
      return { filename: `${slug(p.hostname)}.txt`, content: generateCiscoConfig(p) };
  }
}
