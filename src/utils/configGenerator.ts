// ============================================================
// Automatic Router Config Generator (Tugas 3)
// Client-side template engine — menghasilkan script konfigurasi
// MikroTik RouterOS (.rsc) dan Cisco IOS (.txt) murni di browser.
// ============================================================

export type ConfigVendor = 'mikrotik' | 'cisco';

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

// ── helpers MikroTik ────────────────────────────────────────────

function mkPoolName(subnet: string): string {
  const base = subnet.split('/')[0].split('.').slice(0, 3).join('-');
  return `pool-${base}`;
}

/** Ubah "192.168.1.100-192.168.1.200" → { first, last }. */
function parsePoolRange(range: string): { first: string; last: string } {
  const [first, last] = range.split('-').map((s) => s.trim());
  return { first: first || '', last: last || '' };
}

// ── generator MikroTik RouterOS ──────────────────────────────────

export function generateMikrotikConfig(p: ConfigGeneratorParams): string {
  const lines: string[] = [];
  const pad = (s: string) => s;

  lines.push('# ========================================================');
  lines.push('# NetLab Config Generator — MikroTik RouterOS 7');
  lines.push(`# Hostname : ${p.hostname}`);
  lines.push('# ========================================================');
  lines.push('');

  // Identity
  lines.push(`/system identity set name=${p.hostname}`);
  lines.push('');

  const wanPrefix = p.wanIp.split('/')[1] ?? '24';
  lines.push('# WAN Interface');
  lines.push(`/ip address add address=${p.wanIp} interface=${p.wanIface}`);
  lines.push(`/ip route add dst-address=0.0.0.0/0 gateway=${p.wanGateway} distance=1`);
  lines.push('');

  // Default route dipasang di atas; route static tambahan via /ip route
  lines.push('# LAN');
  const lanPrefix = p.lanSubnet.split('/')[1] ?? '24';
  lines.push(`/ip address add address=${p.lanGatewayIp}/${lanPrefix} interface=${p.lanIface}`);
  lines.push('');

  // DAN — RouterOS memakai pool via /ip pool
  const pool = mkPoolName(p.lanSubnet);
  const { first, last } = parsePoolRange(p.dhcpPoolRange);
  if (first && last) {
    lines.push('# DHCP Server');
    lines.push(`/ip pool add name=${pool} ranges=${first}-${last}`);
    lines.push(`/ip dhcp-server add address-pool=${pool} interface=${p.lanIface} name=dhcp-${p.lanIface} lease-time=10m`);
    lines.push(`/ip dhcp-server network add address=${p.lanSubnet} gateway=${p.lanGatewayIp} dns-server=${p.dnsServers.join(',')}`);
    lines.push('');
  }

  // VLAN
  if (p.vlans.length > 0) {
    lines.push('# VLAN (bridge per VLAN — access port via /interface vlan + bridge)');
    for (const v of p.vlans) {
      lines.push(`/interface vlan add name=vlan${v.id} vlan-id=${v.id} interface=${p.lanIface}`);
      lines.push(`/interface bridge add name=bridge-v${v.id}`);
      lines.push(`/interface bridge port add bridge=bridge-v${v.id} interface=vlan${v.id}`);
    }
    lines.push('');
  }

  // Firewall — stateful: allow established/related + ICMP, drop new dari WAN
  if (p.enableFirewall) {
    lines.push('# Firewall Filter (stateful dasar)');
    lines.push(`/ip firewall filter add chain=input action=accept connection-state=established,related comment="allow established"`);
    lines.push(`/ip firewall filter add chain=input action=accept connection-state=new in-interface=${p.wanIface} protocol=icmp comment="allow ping dari WAN"`);
    lines.push(`/ip firewall filter add chain=input action=drop in-interface=${p.wanIface} connection-state=new comment="blokir baru dari WAN"`);
    lines.push(`/ip firewall filter add chain=forward action=accept connection-state=established,related`);
    lines.push(`/ip firewall filter add chain=forward action=drop in-interface=${p.wanIface} connection-state=new comment="blokir forward baru dari WAN"`);
    lines.push('');
  }

  // NAT
  if (p.enableNat) {
    lines.push('# NAT Masquerade');
    lines.push(`/ip firewall nat add chain=srcnat out-interface=${p.wanIface} action=masquerade comment="masquerade keluar WAN"`);
    lines.push('');
  }

  // OSPF single area
  if (p.routing === 'ospf') {
    lines.push('# OSPF Single Area (area 0)');
    lines.push(`/routing ospf instance add name=ospf-instance router-id=${p.lanGatewayIp}`);
    lines.push(`/routing ospf area add name=backbone instance=ospf-instance area-id=0.0.0.0`);
    lines.push(`/routing ospf interface-template add interfaces=${p.wanIface} area=backbone`);
    lines.push(`/routing ospf interface-template add interfaces=${p.lanIface} area=backbone`);
    // Tambahkan semua interface VLAN ke OSPF
    for (const v of p.vlans) {
      lines.push(`/routing ospf interface-template add interfaces=vlan${v.id} area=backbone`);
    }
    lines.push('');
  }

  // DNS
  lines.push('# DNS');
  lines.push(`/ip dns set servers=${p.dnsServers.join(',')} allow-remote-requests=yes`);
  lines.push('');

  lines.push('# ── selesai — load script: /import file-name=agen-config.rsc ──');
  return pad(lines.join('\n'));
}

// ── generator Cisco IOS ──────────────────────────────────────────

export function generateCiscoConfig(p: ConfigGeneratorParams): string {
  const lines: string[] = [];
  const wanPrefix = p.wanIp.split('/')[1] ?? '24';
  const lanPrefix = p.lanSubnet.split('/')[1] ?? '24';
  const wanMask = prefixToMask(wanPrefix);
  const lanMask = prefixToMask(lanPrefix);
  const lanGatewayIp = p.lanGatewayIp;
  const wanIpNoPrefix = p.wanIp.split('/')[0];

  lines.push('! ==========================================================');
  lines.push('! NetLab Config Generator — Cisco IOS');
  lines.push(`! Hostname : ${p.hostname}`);
  lines.push('! ==========================================================');
  lines.push('');
  lines.push('enable');
  lines.push('configure terminal');
  lines.push(`hostname ${p.hostname}`);
  lines.push('');
  lines.push('! WAN Interface');
  lines.push(`interface ${p.wanIface}`);
  lines.push(' no shutdown');
  lines.push(` ip address ${wanIpNoPrefix} ${wanMask}`);
  lines.push(' description Uplink to ISP');
  lines.push('exit');
  lines.push('');
  lines.push('! LAN Interface');
  lines.push(`interface ${p.lanIface}`);
  lines.push(' no shutdown');
  lines.push(` ip address ${lanGatewayIp} ${lanMask}`);
  lines.push('exit');
  lines.push('');
  lines.push('! Default route via ISP');
  lines.push(`ip route 0.0.0.0 0.0.0.0 ${p.wanGateway}`);
  lines.push('');

  // VLAN + subinterface (router-on-a-stick) — hanya bila ada VLAN input
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
    lines.push('! Access-list dasar (stateful via ' +
      'established/reflexive disederhanakan ke ACL statis)');
    lines.push('ip access-list extended WAN-IN');
    lines.push(' permit icmp any any echo-reply');
    lines.push(' permit tcp any any established');
    lines.push(' deny ip any any log');
    lines.push('exit');
    lines.push(`interface ${p.wanIface}`);
    lines.push(' ip access-group WAN-IN in');
    lines.push('exit');
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
    lines.push(` permit ${lanGatewayIp} ${wildcard(lanMask)}`);
    lines.push('exit');
    lines.push(`ip nat inside source list NAT-ACL interface ${p.wanIface} overload`);
    lines.push('');
  }

  if (p.routing === 'ospf') {
    lines.push('! OSPF Single Area 0');
    lines.push('router ospf 1');
    lines.push(` router-id ${lanGatewayIp}`);
    lines.push(` network ${networkOf(lanGatewayIp, lanMask)} ${wildcard(lanMask)} area 0`);
    if (wanIpNoPrefix) {
      lines.push(` network ${networkOf(wanIpNoPrefix, wanMask)} ${wildcard(wanMask)} area 0`);
    }
    for (const v of p.vlans) {
      lines.push(` network 10.${v.id}.0.0 0.0.0.255 area 0`);
    }
    lines.push('exit');
    lines.push('');
  }

  lines.push('! DHCP Pool');
  const { first, last } = parsePoolRange(p.dhcpPoolRange);
  if (first && last) {
    lines.push('ip dhcp excluded-address ' + lanGatewayIp);
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
    lines.push(`ip dhcp pool LAN`);
    lines.push(` network ${p.lanSubnet}`);
    lines.push(` default-router ${lanGatewayIp}`);
    lines.push(` dns-server ${p.dnsServers.join(' ')}`);
    lines.push('exit');
    lines.push('');
  }

  lines.push('! DNS');
  lines.push(`ip name-server ${p.dnsServers.join(' ')}`);
  lines.push(`ip domain-lookup`);
  lines.push('');
  lines.push('end');
  lines.push('write memory');
  lines.push('! ── selesai — running-config tersimpan ke startup-config ──');
  return lines.join('\n');
}

export function generateConfig(p: ConfigGeneratorParams): { filename: string; content: string } {
  if (p.vendor === 'mikrotik') {
    return { filename: `${slug(p.hostname)}.rsc`, content: generateMikrotikConfig(p) };
  }
  return { filename: `${slug(p.hostname)}.txt`, content: generateCiscoConfig(p) };
}

// ── helpers umum ─────────────────────────────────────────────────

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