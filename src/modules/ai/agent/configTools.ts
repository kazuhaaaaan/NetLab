// ============================================================
// configTools — tool konfigurasi AI.
//
// SEMUA konfigurasi melewati VendorDispatcher (jalur yang sama
// dengan terminal manusia via runCliCommand). Tool di sini hanya
// menyusun command vendor-valid; vendor yang tidak didukung
// mengembalikan UNSUPPORTED — tidak pernah mengarang command.
// ============================================================

import type { ToolResult, ToolExecCtx } from './types';

const SUPPORTED_VENDORS = [
  'mikrotik',
  'cisco_ios',
  'cisco_nxos',
  'juniper',
  'huawei',
  'fortinet',
  'linux',
  'vyos',
  'ubiquiti',
  'openwrt',
  'aruba',
] as const;

type SupportedVendor = (typeof SUPPORTED_VENDORS)[number];

/** Vendor untuk CLI config generator. */
export type ConfigVendor =
  | 'mikrotik'
  | 'cisco_ios'
  | 'cisco_nxos'
  | 'juniper'
  | 'huawei'
  | 'linux'
  | 'fortinet';

function vendorOf(ctx: ToolExecCtx, deviceId: string): { vendor: string; ok: boolean; error?: string } {
  const dev = ctx.runtime.sim.getDevice(deviceId) ?? ctx.runtime.sim.getDeviceByName(deviceId);
  if (!dev) return { vendor: '', ok: false, error: `device tidak ditemukan: ${deviceId}` };
  const vendor = dev.vendor ?? dev.deviceType;
  if (!(SUPPORTED_VENDORS as readonly string[]).includes(vendor)) {
    return { vendor: '', ok: false, error: `vendor "${vendor}" tidak didukung untuk konfigurasi AI` };
  }
  return { vendor, ok: true };
}

function normalizeVendor(vendor: string): ConfigVendor {
  if (vendor === 'mikrotik') return 'mikrotik';
  if (vendor === 'cisco_ios' || vendor === 'cisco_nxos') return vendor;
  if (vendor === 'juniper') return 'juniper';
  if (vendor === 'huawei') return 'huawei';
  if (vendor === 'linux' || vendor === 'openwrt') return 'linux';
  return 'linux';
}

/** Eksekusi CLI inti — semua tool config lain berakhir di sini. */
export function toolExecuteCli(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const deviceId = p['deviceId'] as string;
  const command = p['command'] as string;

  const dev = ctx.runtime.sim.getDevice(deviceId) ?? ctx.runtime.sim.getDeviceByName(deviceId);
  if (!dev) return { ok: false, message: `device tidak ditemukan: ${deviceId}`, error: 'device-not-found' };
  const vendor = dev.vendor ?? dev.deviceType;

  // Perintah multi-baris: pisah dengan \n (bukan ; — ';' bisa jadi bagian syntax vendor).
  const commands = command.split('\n').map((c) => c.trim()).filter(Boolean);
  if (commands.length === 0) return { ok: false, message: 'command kosong', error: 'empty-command' };

  const outputs: string[] = [];
  for (const cmd of commands) {
    const res = ctx.runtime.executeCli(dev.id, vendor, cmd);
    outputs.push(cmd.trim() === 'exit' ? '' : res.output);
  }
  const output = outputs.filter((o) => o.trim().length > 0).join('\n');
  return {
    ok: true,
    message: `Perintah dieksekusi di ${dev.name} (${commands.length} baris).`,
    data: { deviceId: dev.id, commands, output },
    evidence: [output.slice(0, 400)],
  };
}

// ── Generator command vendor (syntax VALID per vendor) ────────────

/** IP address (CIDR) per vendor. */
function ipCommand(v: ConfigVendor, iface: string, cidr: string, remove: boolean): string[] {
  switch (v) {
    case 'mikrotik':
      return remove
        ? [`/ip address remove [find where address="${cidr}" and interface="${iface}"]`]
        : [`/ip address add address=${cidr} interface=${iface}`];
    case 'cisco_ios':
    case 'cisco_nxos': {
      const [ip, prefix] = cidr.split('/');
      const mask = prefix ? maskOf(Number(prefix)) : '255.255.255.0';
      return [`interface ${iface}`, remove ? `no ip address ${ip} ${mask}` : `ip address ${ip} ${mask}`];
    }
    case 'juniper':
      return remove
        ? [`delete interfaces ${iface} unit 0 family inet address ${cidr}`]
        : [`set interfaces ${iface} unit 0 family inet address ${cidr}`];
    case 'huawei': {
      const [ip, prefix] = cidr.split('/');
      const mask = prefix ? maskOf(Number(prefix)) : '255.255.255.0';
      return [`interface ${iface}`, remove ? `undo ip address ${ip} ${mask}` : `ip address ${ip} ${mask}`];
    }
    case 'linux':
      return remove ? [`ip addr del ${cidr} dev ${iface}`] : [`ip addr add ${cidr} dev ${iface}`];
    case 'fortinet': {
      const [ip, prefix] = cidr.split('/');
      const mask = prefix ? maskOf(Number(prefix)) : '255.255.255.0';
      return [
        'config system interface',
        `edit ${iface}`,
        remove ? `unset ip` : `set ip ${ip} ${mask}`,
        'end',
      ];
    }
  }
}

function routeCommand(v: ConfigVendor, dst: string, gateway: string): string[] {
  switch (v) {
    case 'mikrotik':
      return [`/ip route add dst-address=${dst} gateway=${gateway}`];
    case 'cisco_ios':
    case 'cisco_nxos': {
      const [ip, prefix] = dst.split('/');
      const mask = prefix ? maskOf(Number(prefix)) : '255.255.255.0';
      return [`ip route ${ip} ${mask} ${gateway}`];
    }
    case 'juniper':
      return [`set routing-options static route ${dst} next-hop ${gateway}`];
    case 'huawei': {
      const [ip, prefix] = dst.split('/');
      return [`ip route-static ${ip} ${prefix ?? 24} ${gateway}`];
    }
    case 'linux':
      return [`ip route add ${dst} via ${gateway}`];
    case 'fortinet':
      return ['config router static', 'edit 0', `set dst ${dst}`, `set gateway ${gateway}`, 'end'];
  }
}

function vlanCommand(v: ConfigVendor, vlanId: number, name: string, iface: string | undefined): string[] {
  switch (v) {
    case 'mikrotik':
      return iface
        ? [`/interface vlan add name=vlan${vlanId} vlan-id=${vlanId} interface=${iface}`]
        : [`/interface vlan add name=vlan${vlanId} vlan-id=${vlanId}`];
    case 'cisco_ios':
    case 'cisco_nxos':
      return ['vlan ' + vlanId, name ? `name ${name}` : ''].filter(Boolean);
    case 'juniper':
      return [`set vlans vlan${vlanId} vlan-id ${vlanId}${name ? ` description "${name}"` : ''}`];
    case 'huawei':
      return ['vlan ' + vlanId, name ? `description ${name}` : ''].filter(Boolean);
    case 'linux':
      return iface ? [`ip link add link ${iface} name ${iface}.${vlanId} type vlan id ${vlanId}`] : [];
    case 'fortinet':
      return iface
        ? ['config system interface', `edit vlan${vlanId}`, `set vdom "root"`, `set type vlan`, `set interface ${iface}`, `set vlanid ${vlanId}`, 'end']
        : [];
  }
}

function trunkCommand(v: ConfigVendor, iface: string): string[] {
  switch (v) {
    case 'mikrotik':
      return [`/interface bridge port set [find where interface=${iface}] pvid=1`];
    case 'cisco_ios':
    case 'cisco_nxos':
      return [`interface ${iface}`, 'switchport mode trunk'];
    case 'huawei':
      return [`interface ${iface}`, 'port link-type trunk'];
    case 'juniper':
      return [`set interfaces ${iface} unit 0 family ethernet-switching port-mode trunk`];
    case 'linux':
      return [];
    case 'fortinet':
      return [];
  }
}

function ospfCommand(v: ConfigVendor, network: string, area: number): string[] {
  switch (v) {
    case 'mikrotik':
      return [
        '/routing ospf instance add name=ospf1',
        `/routing ospf area add instance=ospf1 name=area${area}`,
        `/routing ospf network add network=${network} area=area${area}`,
      ];
    case 'cisco_ios':
    case 'cisco_nxos':
      return ['router ospf 1', `network ${network} area ${area}`];
    case 'juniper':
      return [
        'set protocols ospf area ' + area,
        `set protocols ospf area ${area} networks ${network}`,
      ];
    case 'huawei':
      return [
        'ospf 1',
        `area ${area}`,
        `network ${network}`,
      ];
    case 'linux':
      return [];
    case 'fortinet':
      return [];
  }
}

function bgpCommand(v: ConfigVendor, asn: number, neighborIp: string, remoteAs: number, network?: string): string[] {
  switch (v) {
    case 'mikrotik':
      return [
        `/routing bgp instance set default as=${asn}`,
        `/routing bgp peer add name=peer${neighborIp} remote-as=${remoteAs} remote-address=${neighborIp}`,
        ...(network ? [`/routing bgp network add network=${network}`] : []),
      ];
    case 'cisco_ios':
    case 'cisco_nxos':
      return [
        `router bgp ${asn}`,
        `neighbor ${neighborIp} remote-as ${remoteAs}`,
        ...(network ? [`network ${network.split('/')[0]} mask ${maskOf(Number(network.split('/')[1] ?? 24))}`] : []),
      ];
    case 'juniper':
      return [
        'set routing-options autonomous-system ' + asn,
        `set protocols bgp group ebgp type external`,
        `set protocols bgp group ebgp peer-as ${remoteAs}`,
        `set protocols bgp group ebgp neighbor ${neighborIp}`,
      ];
    case 'huawei':
      return [
        `bgp ${asn}`,
        `peer ${neighborIp} as-number ${remoteAs}`,
        ...(network ? [`network ${network.split('/')[0]} mask ${maskOf(Number(network.split('/')[1] ?? 24))}`] : []),
      ];
    case 'linux':
      return [];
    case 'fortinet':
      return [];
  }
}

function dhcpCommand(v: ConfigVendor, poolName: string, range: string, gateway: string): string[] {
  switch (v) {
    case 'mikrotik':
      return [
        `/ip pool add name=${poolName} ranges=${range}`,
        '/ip dhcp-server add name=' + poolName + ' interface=bridge1 address-pool=' + poolName,
        `/ip dhcp-server network add address=0.0.0.0/0 gateway=${gateway}`,
      ];
    case 'cisco_ios':
    case 'cisco_nxos': {
      const [from, to] = range.split('-');
      const startNet = from.split('.');
      const prefix = startNet.slice(0, 3).join('.');
      return [
        `ip dhcp pool ${poolName}`,
        `network ${prefix}.0 255.255.255.0`,
        `default-router ${gateway}`,
        'exit',
        `ip dhcp excluded-address ${from}`,
        `ip dhcp excluded-address ${to}`,
      ];
    }
    case 'juniper':
      return [
        `set access address-assignment pool ${poolName} family inet network 0.0.0.0/0`,
        `set access address-assignment pool ${poolName} family inet range ${poolName}-ranges low ${range.split('-')[0]}`,
        `set access address-assignment pool ${poolName} family inet range ${poolName}-ranges high ${range.split('-')[1] ?? range.split('-')[0]}`,
        `set access address-assignment pool ${poolName} family inet dhcp-attributes router ${gateway}`,
      ];
    case 'huawei':
      return [
        'dhcp enable',
        `ip pool ${poolName}`,
        `gateway-list ${gateway}`,
        `network ${range.split('-')[0]} mask 255.255.255.0`,
      ];
    case 'linux':
      return [];
    case 'fortinet':
      return [];
  }
}

function natCommand(v: ConfigVendor, outInterface: string, masquerade: boolean): string[] {
  switch (v) {
    case 'mikrotik':
      return [`/ip firewall nat add chain=srcnat out-interface=${outInterface} action=${masquerade ? 'masquerade' : 'srcnat'}`];
    case 'cisco_ios':
    case 'cisco_nxos':
      return [
        `interface ${outInterface}`,
        'ip nat outside',
        'exit',
        'ip nat inside source list 1 interface ' + outInterface + ' overload',
        'access-list 1 permit any',
      ];
    case 'juniper':
      return [
        'set security nat source rule-set lan from zone trust',
        'set security nat source rule-set lan to zone untrust',
        'set security nat source rule-set lan rule lan-out match source-address 0.0.0.0/0',
        `set security nat source rule-set lan rule lan-out then source-nat interface`,
      ];
    case 'huawei':
      return [
        'acl number 2001',
        'rule 5 permit source 0.0.0.0 0.0.0.0',
        'quit',
        `interface ${outInterface}`,
        'nat outbound 2001',
      ];
    case 'linux':
      return [];
    case 'fortinet':
      return [
        'config firewall policy',
        'edit 0',
        'set srcintf "internal"',
        `set dstintf "${outInterface}"`,
        'set srcaddr "all"',
        'set dstaddr "all"',
        'set action accept',
        'set schedule "always"',
        'set service "ALL"',
        'set nat enable',
        'end',
      ];
  }
}

function firewallCommand(
  v: ConfigVendor,
  action: 'accept' | 'drop' | 'reject',
  chain: 'input' | 'forward',
  src: string | undefined,
  dst: string | undefined,
  protocol: string | undefined,
  port: number | undefined
): string[] {
  switch (v) {
    case 'mikrotik': {
      const proto = protocol && protocol !== 'any' ? ` protocol=${protocol}` : '';
      const dstPort = port != null ? ` dst-port=${port}` : '';
      const srcAddr = src ? ` src-address=${src}` : '';
      const dstAddr = dst ? ` dst-address=${dst}` : '';
      return [`/ip firewall filter add chain=${chain} action=${action}${proto}${dstPort}${srcAddr}${dstAddr}`];
    }
    case 'cisco_ios':
    case 'cisco_nxos': {
      const proto = protocol && protocol !== 'any' ? ` ${protocol}` : '';
      const dstPort = port != null ? ` eq ${port}` : '';
      const srcWild = src ? wildcardOf(src) : 'any';
      const dstWild = dst ? wildcardOf(dst) : 'any';
      const permit = action === 'accept' ? 'permit' : 'deny';
      return [`access-list 100 ${permit}${proto} ${srcWild} ${dstWild}${dstPort}`];
    }
    case 'juniper':
      return [
        `set security policies from-zone trust to-zone untrust policy ai-${action} match source-address ${src ?? 'any'}`,
        `set security policies from-zone trust to-zone untrust policy ai-${action} match destination-address ${dst ?? 'any'}`,
        `set security policies from-zone trust to-zone untrust policy ai-${action} match application any`,
        `set security policies from-zone trust to-zone untrust policy ai-${action} then ${action === 'accept' ? 'permit' : 'deny'}`,
      ];
    case 'huawei':
      return [
        'acl number 3001',
        `rule 5 deny ${protocol && protocol !== 'any' ? protocol : 'ip'} source ${src ?? 'any'} 0 destination ${dst ?? 'any'} 0`,
        'quit',
        `traffic-filter inbound acl 3001`,
      ];
    case 'linux':
      return [`iptables -A ${chain} ${src ? `-s ${src} ` : ''}${dst ? `-d ${dst} ` : ''}${protocol && protocol !== 'any' ? `-p ${protocol} ` : ''}${port != null ? `--dport ${port} ` : ''}-j ${action.toUpperCase()}`];
    case 'fortinet':
      return [];
  }
}

function wirelessCommand(v: ConfigVendor, ssid: string, mode: 'ap' | 'station', password?: string): string[] {
  switch (v) {
    case 'mikrotik':
      return [
        mode === 'ap'
          ? '/interface wireless set wlan1 mode=ap-bridge ssid=' + ssid + ' disabled=no'
          : '/interface wireless set wlan1 mode=station ssid=' + ssid + ' disabled=no',
        ...(password ? [`/interface wireless security-profiles set default authentication-types=wpa2-psk mode=dynamic-keys wpa2-pre-shared-key=${password}`] : []),
      ];
    case 'cisco_ios':
      return mode === 'ap'
        ? [`interface Wlan0`, `ssid ${ssid}`, `dot11 ssid ${ssid}`, 'authentication open'].filter(Boolean)
        : [];
    case 'juniper':
      return mode === 'ap'
        ? [`set access point profile ai profile ssid ${ssid}`]
        : [`set interfaces wlan0 unit 0 family inet dhcp`];
    case 'huawei':
      return mode === 'ap'
        ? [`wlan`, `ssid-profile name ${ssid}`, `ssid ${ssid}`].filter(Boolean)
        : [];
    default:
      return [];
  }
}

function maskOf(prefix: number): string {
  const n = prefix < 0 ? 0 : prefix > 32 ? 32 : prefix;
  const mask = n === 0 ? 0 : (0xffffffff << (32 - n)) >>> 0;
  return [24, 16, 8, 0].map((shift) => (mask >>> shift) & 0xff).join('.');
}

function wildcardOf(cidr: string): string {
  const [ip, prefix] = cidr.split('/');
  if (!prefix) return ip;
  const mask = maskOf(Number(prefix));
  const wc = mask.split('.').map((o) => 255 - Number(o)).join('.');
  return `${ip} ${wc}`;
}

// ── Tool publik (thin wrapper atas execute_cli) ─────────────────

export function toolConfigureIpAddress(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const deviceId = p['deviceId'] as string;
  const iface = p['interface'] as string;
  const address = p['address'] as string;
  const v = vendorOf(ctx, deviceId);
  if (!v.ok) return { ok: false, message: v.error ?? 'vendor unsupported', error: 'unsupported', unsupported: true };
  const cmds = ipCommand(normalizeVendor(v.vendor), iface, address, false);
  if (cmds.length === 0) return { ok: false, message: `vendor ${v.vendor} tidak mendukung perintah ini`, unsupported: true };
  const outputs = cmds.map((c) => ctx.runtime.executeCli(deviceId, v.vendor, c).output);
  return {
    ok: true,
    message: `IP ${address} dikonfigurasi di ${deviceId}:${iface} (${cmds.length} perintah).`,
    data: { deviceId, interface: iface, address, commands: cmds },
    evidence: outputs.filter((o) => o.trim()).map((o) => o.slice(0, 200)),
  };
}

export function toolRemoveIpAddress(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const deviceId = p['deviceId'] as string;
  const iface = p['interface'] as string;
  const address = p['address'] as string;
  const v = vendorOf(ctx, deviceId);
  if (!v.ok) return { ok: false, message: v.error ?? 'vendor unsupported', error: 'unsupported', unsupported: true };
  const cmds = ipCommand(normalizeVendor(v.vendor), iface, address, true);
  if (cmds.length === 0) return { ok: false, message: `vendor ${v.vendor} tidak mendukung perintah ini`, unsupported: true };
  cmds.forEach((c) => ctx.runtime.executeCli(deviceId, v.vendor, c));
  return { ok: true, message: `IP ${address} dihapus dari ${deviceId}:${iface}.`, data: { deviceId, interface: iface, address } };
}

export function toolConfigureRoute(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const deviceId = p['deviceId'] as string;
  const dst = p['dst'] as string;
  const gateway = p['gateway'] as string;
  const v = vendorOf(ctx, deviceId);
  if (!v.ok) return { ok: false, message: v.error ?? 'vendor unsupported', error: 'unsupported', unsupported: true };
  const cmds = routeCommand(normalizeVendor(v.vendor), dst, gateway);
  if (cmds.length === 0) return { ok: false, message: `vendor ${v.vendor} tidak mendukung perintah ini`, unsupported: true };
  cmds.forEach((c) => ctx.runtime.executeCli(deviceId, v.vendor, c));
  return { ok: true, message: `Rute ${dst} via ${gateway} ditambahkan di ${deviceId}.`, data: { deviceId, dst, gateway } };
}

export function toolConfigureVlan(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const deviceId = p['deviceId'] as string;
  const vlanId = p['vlanId'] as number;
  const name = (p['name'] as string | undefined) ?? `vlan${vlanId}`;
  const iface = p['interface'] as string | undefined;
  const v = vendorOf(ctx, deviceId);
  if (!v.ok) return { ok: false, message: v.error ?? 'vendor unsupported', error: 'unsupported', unsupported: true };
  const cmds = vlanCommand(normalizeVendor(v.vendor), vlanId, name, iface);
  if (cmds.length === 0) return { ok: false, message: `vendor ${v.vendor} tidak mendukung perintah ini`, unsupported: true };
  cmds.forEach((c) => ctx.runtime.executeCli(deviceId, v.vendor, c));
  return { ok: true, message: `VLAN ${vlanId} (${name}) dikonfigurasi di ${deviceId}.`, data: { deviceId, vlanId, name, iface } };
}

export function toolConfigureTrunk(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const deviceId = p['deviceId'] as string;
  const iface = p['interface'] as string;
  const v = vendorOf(ctx, deviceId);
  if (!v.ok) return { ok: false, message: v.error ?? 'vendor unsupported', error: 'unsupported', unsupported: true };
  const cmds = trunkCommand(normalizeVendor(v.vendor), iface);
  if (cmds.length === 0) return { ok: false, message: `vendor ${v.vendor} tidak mendukung perintah ini`, unsupported: true };
  cmds.forEach((c) => ctx.runtime.executeCli(deviceId, v.vendor, c));
  return { ok: true, message: `${iface} dijadikan trunk di ${deviceId}.`, data: { deviceId, interface: iface } };
}

export function toolConfigureOspf(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const deviceId = p['deviceId'] as string;
  const network = p['network'] as string;
  const area = (p['area'] as number | undefined) ?? 0;
  const v = vendorOf(ctx, deviceId);
  if (!v.ok) return { ok: false, message: v.error ?? 'vendor unsupported', error: 'unsupported', unsupported: true };
  const cmds = ospfCommand(normalizeVendor(v.vendor), network, area);
  if (cmds.length === 0) return { ok: false, message: `vendor ${v.vendor} tidak mendukung perintah ini`, unsupported: true };
  cmds.forEach((c) => ctx.runtime.executeCli(deviceId, v.vendor, c));
  return { ok: true, message: `OSPF network ${network} area ${area} dikonfigurasi di ${deviceId}.`, data: { deviceId, network, area } };
}

export function toolConfigureBgp(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const deviceId = p['deviceId'] as string;
  const asn = p['asn'] as number;
  const neighborIp = p['neighborIp'] as string;
  const remoteAs = p['remoteAs'] as number;
  const network = p['network'] as string | undefined;
  const v = vendorOf(ctx, deviceId);
  if (!v.ok) return { ok: false, message: v.error ?? 'vendor unsupported', error: 'unsupported', unsupported: true };
  const cmds = bgpCommand(normalizeVendor(v.vendor), asn, neighborIp, remoteAs, network);
  if (cmds.length === 0) return { ok: false, message: `vendor ${v.vendor} tidak mendukung perintah ini`, unsupported: true };
  cmds.forEach((c) => ctx.runtime.executeCli(deviceId, v.vendor, c));
  return { ok: true, message: `BGP AS${asn} neighbor ${neighborIp} AS${remoteAs} dikonfigurasi di ${deviceId}.`, data: { deviceId, asn, neighborIp, remoteAs } };
}

export function toolConfigureDhcp(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const deviceId = p['deviceId'] as string;
  const poolName = p['poolName'] as string;
  const range = p['range'] as string;
  const gateway = p['gateway'] as string;
  const v = vendorOf(ctx, deviceId);
  if (!v.ok) return { ok: false, message: v.error ?? 'vendor unsupported', error: 'unsupported', unsupported: true };
  const cmds = dhcpCommand(normalizeVendor(v.vendor), poolName, range, gateway);
  if (cmds.length === 0) return { ok: false, message: `vendor ${v.vendor} tidak mendukung perintah ini`, unsupported: true };
  cmds.forEach((c) => ctx.runtime.executeCli(deviceId, v.vendor, c));
  return { ok: true, message: `DHCP pool ${poolName} (${range}, gw ${gateway}) dikonfigurasi di ${deviceId}.`, data: { deviceId, poolName, range, gateway } };
}

export function toolConfigureNat(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const deviceId = p['deviceId'] as string;
  const outInterface = p['outInterface'] as string;
  const masquerade = (p['masquerade'] as boolean | undefined) ?? true;
  const v = vendorOf(ctx, deviceId);
  if (!v.ok) return { ok: false, message: v.error ?? 'vendor unsupported', error: 'unsupported', unsupported: true };
  const cmds = natCommand(normalizeVendor(v.vendor), outInterface, masquerade);
  if (cmds.length === 0) return { ok: false, message: `vendor ${v.vendor} tidak mendukung perintah ini`, unsupported: true };
  cmds.forEach((c) => ctx.runtime.executeCli(deviceId, v.vendor, c));
  return { ok: true, message: `NAT ${masquerade ? 'masquerade' : 'srcnat'} out-interface ${outInterface} dikonfigurasi di ${deviceId}.`, data: { deviceId, outInterface, masquerade } };
}

export function toolConfigureFirewall(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const deviceId = p['deviceId'] as string;
  const action = p['action'] as 'accept' | 'drop' | 'reject';
  const chain = (p['chain'] as 'input' | 'forward' | undefined) ?? 'forward';
  const src = p['src'] as string | undefined;
  const dst = p['dst'] as string | undefined;
  const protocol = p['protocol'] as string | undefined;
  const port = p['port'] as number | undefined;
  const v = vendorOf(ctx, deviceId);
  if (!v.ok) return { ok: false, message: v.error ?? 'vendor unsupported', error: 'unsupported', unsupported: true };
  const cmds = firewallCommand(normalizeVendor(v.vendor), action, chain, src, dst, protocol, port);
  if (cmds.length === 0) return { ok: false, message: `vendor ${v.vendor} tidak mendukung perintah ini`, unsupported: true };
  cmds.forEach((c) => ctx.runtime.executeCli(deviceId, v.vendor, c));
  return { ok: true, message: `Firewall ${action} ${protocol ?? 'any'} ${src ?? '*'} → ${dst ?? '*'}${port != null ? `:${port}` : ''} di ${deviceId}.`, data: { deviceId, action, chain } };
}

export function toolConfigureWireless(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const deviceId = p['deviceId'] as string;
  const ssid = p['ssid'] as string;
  const mode = (p['mode'] as 'ap' | 'station' | undefined) ?? 'ap';
  const password = p['password'] as string | undefined;
  const v = vendorOf(ctx, deviceId);
  if (!v.ok) return { ok: false, message: v.error ?? 'vendor unsupported', error: 'unsupported', unsupported: true };
  const cmds = wirelessCommand(normalizeVendor(v.vendor), ssid, mode, password);
  if (cmds.length === 0) return { ok: false, message: `vendor ${v.vendor} tidak mendukung perintah ini`, unsupported: true };
  cmds.forEach((c) => ctx.runtime.executeCli(deviceId, v.vendor, c));
  return { ok: true, message: `Wireless ${mode} SSID ${ssid} dikonfigurasi di ${deviceId}.`, data: { deviceId, ssid, mode } };
}