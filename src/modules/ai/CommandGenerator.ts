// ============================================================
// CommandGenerator — perbaikan → command sesuai vendor.
// Vendor: mikrotik, cisco, huawei, juniper, linux, fortinet.
// Mudah diperluas: tambahkan key baru pada FIX_COMMANDS.
// ============================================================

import { AnalyzerIssue, CommandSuggestion, VendorId } from './types';

type Fn = (p: Record<string, string>) => string[];

const FIX_COMMANDS: Record<string, Partial<Record<VendorId, Fn>>> = {
  'default-route': {
    mikrotik: (p) => [`/ip route add dst-address=${p.dst || '0.0.0.0/0'} gateway=${p.gateway || '<gateway-ip>'}`],
    cisco: (p) => [p.dst && p.dst !== '0.0.0.0/0' ? `ip route ${p.dst} ${p.gateway || '<next-hop>'}` : `ip route 0.0.0.0 0.0.0.0 ${p.gateway || '<next-hop>'}`],
    huawei: (p) => [`ip route-static ${(p.dst || '0.0.0.0 0.0.0.0').replace('/', ' ')} ${p.gateway || '<next-hop>'}`],
    juniper: (p) => [`set routing-options static route ${p.dst || '0.0.0.0/0'} next-hop ${p.gateway || '<next-hop>'}`],
    linux: (p) => [`ip route add ${p.dst && p.dst !== '0.0.0.0/0' ? p.dst : 'default'} via ${p.gateway || '<gateway-ip>'}`],
    fortinet: (p) => [`config router static\n    edit 0\n        set dst ${p.dst || '0.0.0.0 0.0.0.0'}\n        set gateway ${p.gateway || '<gateway-ip>'}\n    next\nend`],
  },
  'wrong-gateway': {
    mikrotik: (p) => [`/ip route remove [find dst-address=${p.dst}]`, `/ip route add dst-address=${p.dst} gateway=<gateway-correct>`],
    cisco: (p) => [`no ip route ${p.dst || ''}`, `ip route ${p.dst || ''} <next-hop-correct>`],
    linux: (p) => [`ip route replace ${p.dst || 'default'} via <gateway-correct>`],
    huawei: (p) => [`undo ip route-static ${p.dst || ''}`, `ip route-static ${p.dst || ''} <next-hop-correct>`],
  },
  loop: {
    mikrotik: () => ['/ip route print detail', '/ip route remove [find dst-address=0.0.0.0/0]'],
    cisco: () => ['show ip route', 'clear ip route *'],
    linux: () => ['ip route show', 'ip route del default'],
  },
  'dhcp-pool': {
    mikrotik: (p) => [
      `/ip pool add name=dhcp_pool ranges=<start-end>`,
      `/ip dhcp-server network add address=<network>/<prefix> gateway=<gateway-ip>`,
      `/ip dhcp-server add name=dhcp1 interface=${p.iface || 'ether1'} address-pool=dhcp_pool disabled=no`,
    ],
    cisco: (p) => [
      `ip dhcp excluded-address <first> <last>`,
      `ip dhcp pool DHCP\n network <network> <mask>\n default-router <gateway-ip>`,
    ],
    huawei: (p) => [`interface ${p.iface || 'GigabitEthernet0/0/0'}\n dhcp select global`, `ip pool dhcp\n network <network> mask <mask>\n gateway-list <gateway-ip>`],
    juniper: () => [`set access address-assignment pool dhcp family inet network <network>`],
    linux: () => [`# edit /etc/dnsmasq.conf lalu jalankan:\nsystemctl restart dnsmasq`],
    fortinet: () => [`config system dhcp server\n    edit 1\n        set default-gateway <gateway-ip>\n        config ip-range\n            edit 1\n                set start-ip <start>\n                set end-ip <end>\n            next\n        end\n    next\nend`],
  },
  'dhcp-client': {
    mikrotik: () => ['/ip dhcp-client add interface=ether1 disabled=no'],
    cisco: () => ['interface <iface>\n ip address dhcp'],
    linux: () => ['dhclient <iface>'],
    juniper: () => ['set interfaces <iface> unit 0 family inet dhcp'],
    fortinet: () => ['config system interface\n    edit "<iface>"\n        set mode dhcp\n    next\nend'],
  },
  'nat-masquerade': {
    mikrotik: (p) => ['/ip firewall nat', `add chain=srcnat out-interface=${p.iface || 'ether1'} action=masquerade`],
    cisco: (p) => [`ip nat inside source list 1 interface ${p.iface || '<wan-iface>'} overload`, `access-list 1 permit any`],
    huawei: (p) => [`interface ${p.iface || 'GigabitEthernet0/0/0'}\n nat outbound 2000`, `acl number 2000\n rule 5 permit source any`],
    juniper: () => [`set security nat source rule-set snat from zone trust\nset security nat source rule-set snat to zone untrust\nset security nat source rule-set snat rule r1 match source-address 0.0.0.0/0\nset security nat source rule-set snat rule r1 then source-nat interface`],
    linux: (p) => [`iptables -t nat -A POSTROUTING -o ${p.iface || '<wan-iface>'} -j MASQUERADE`],
    fortinet: (p) => [`config system interface\n    edit ${p.iface || '<wan-iface>'}\n        set ip <wan-ip> <mask>\n        set role wan\n    next\nend`],
  },
  'nat-dstnat': {
    mikrotik: () => ['/ip firewall nat', `add chain=dstnat dst-address=<wan-ip> protocol=tcp dst-port=<port> action=dst-nat to-addresses=<server-ip> to-ports=<port>`],
    cisco: () => [`ip nat inside source static tcp <server-ip> <port> interface <wan-iface> <port>`],
    fortinet: () => ['config firewall vip\n    edit "vip1"\n        set extip <wan-ip>\n        set mappedip <server-ip>\n        set extintf "<wan-iface>"\n    next\nend'],
  },
  'acl-allow': {
    mikrotik: () => ['/ip firewall filter', 'add chain=input action=accept', 'add chain=forward action=accept'],
    cisco: () => ['interface <iface>\n ip access-group <ACL> out', 'access-list <ACL> permit ip any any'],
    huawei: () => ['traffic-filter inbound', 'rule permit source any'],
    linux: () => ['iptables -I INPUT -j ACCEPT', 'iptables -I FORWARD -j ACCEPT'],
    fortinet: () => ['config firewall policy\n    edit 1\n        set srcintf "trust"\n        set dstintf "wan"\n        set srcaddr "all"\n        set dstaddr "all"\n        set action accept\n    next\nend'],
  },
  'dns-record': {
    mikrotik: (p) => [`/ip dns set servers=${p.ip || '<dns-ip>'}`],
    cisco: () => [`ip name-server <dns-ip>`],
    linux: (p) => [`echo "nameserver ${p.ip || '<dns-ip>'}" > /etc/resolv.conf`],
    juniper: () => [`set system name-server <dns-ip>`],
    fortinet: () => [`config system dns\n    set primary <dns-ip>\nend`],
  },
  'vlan-trunk': {
    mikrotik: () => ['/interface vlan add name=vlan<id> vlan-id=<id> interface=<parent>', '/interface bridge port add bridge=bridge1 interface=<parent>'],
    cisco: () => ['interface <iface>\n switchport mode trunk\n switchport trunk allowed vlan all'],
    huawei: () => ['interface <iface>\n port link-type trunk\n port trunk allow-pass vlan all'],
    juniper: () => ['set interfaces <iface> unit 0 family ethernet-switching port-mode trunk'],
    fortinet: () => ['config system switch-interface\n    edit "<trunk>"\n        config member\n            edit "<port>"\n            next\n        end\n    next\nend'],
  },
  'vlan-access': {
    mikrotik: (p) => ['/interface bridge port', `set [find interface=${p.iface || '<iface>'}]+ pvid=${p.vlanId || 1}`],
    cisco: (p) => [`interface ${p.iface || '<iface>'}\n switchport access vlan ${p.vlanId || 1}`],
    huawei: (p) => [`interface ${p.iface || '<iface>'}\n port link-type access\n port default vlan ${p.vlanId || 1}`],
    juniper: (p) => [`set interfaces ${p.iface || '<iface>'} unit 0 family ethernet-switching vlan members vlan${p.vlanId || 1}`],
  },
  subinterface: {
    mikrotik: (p) => [`/interface vlan add name=${p.iface || 'vlan<id>'} vlan-id=${p.vlanId || 1} interface=<parent>`, `/ip address add address=<ip>/<prefix> interface=${p.iface || 'vlan<id>'}`],
    cisco: (p) => [`interface ${p.iface || '<parent>.<vlan>'}\n encapsulation dot1Q ${p.vlanId || 1}\n ip address <ip> <mask>`],
    huawei: (p) => [`interface ${p.iface || '<parent>.<vlan>'}\n dot1q termination vid ${p.vlanId || 1}\n ip address <ip> <mask>`],
  },
  'iface-up': {
    mikrotik: () => ['/interface set ether1 disabled=no', '/interface enable ether1'],
    cisco: () => ['interface <iface>\n no shutdown'],
    huawei: () => ['interface <iface>\n undo shutdown'],
    juniper: () => ['set interfaces <iface> unit 0 family inet'],
    linux: () => ['ip link set <iface> up'],
    fortinet: () => ['config system interface\n    edit "<iface>"\n        set status up\n    next\nend'],
  },
};

const FIX_ALIASES: Record<string, string> = {
  'missing-route': 'default-route',
  'no-route': 'default-route',
  'route-missing': 'default-route',
};

function resolveKey(key: string): string {
  return FIX_ALIASES[key] ?? key;
}

export class CommandGenerator {
  /** Semua command untuk satu temuan (vendor device + alternatif). */
  generate(issue: AnalyzerIssue, deviceVendor: string): CommandSuggestion[] {
    const key = resolveKey(issue.fixKey);
    if (!issue.fixKey) return [];
    const tpl = FIX_COMMANDS[key];
    if (!tpl) return [];

    const primary: VendorId = normalizeVendor(deviceVendor);
    const out: CommandSuggestion[] = [];
    const push = (v: VendorId) => {
      const fn = tpl[v];
      if (!fn) return;
      const cmds = fn(issue.params ?? {});
      if (cmds.length > 0) out.push({ vendor: v, commands: cmds });
    };
    push(primary);
    if (primary !== 'mikrotik') push('mikrotik');
    if (primary !== 'linux') push('linux');
    return out;
  }

  /** Command untuk satu fixKey + vendor tertentu. */
  byKey(key: string, vendor: VendorId = 'mikrotik'): string[] {
    const tpl = FIX_COMMANDS[resolveKey(key)];
    if (!tpl) return [];
    const fn = tpl[vendor];
    return fn ? fn({}) : [];
  }
}

export function normalizeVendor(vendor: string): VendorId {
  const v = (vendor || '').toLowerCase();
  if (v.includes('cisco') || v === 'ios' || v === 'nxos') return 'cisco';
  if (v.includes('huawei')) return 'huawei';
  if (v.includes('juniper') || v === 'junos') return 'juniper';
  if (v.includes('forti')) return 'fortinet';
  if (v === 'linux' || v.includes('debian') || v.includes('ubuntu')) return 'linux';
  return 'mikrotik';
}
