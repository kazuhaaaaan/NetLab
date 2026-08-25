// ============================================================
// configTools — tool konfigurasi AI.
//
// SEMUA konfigurasi melewati VendorDispatcher (jalur yang sama
// dengan terminal manusia via runCliCommand). Tool di sini hanya
// menyusun command vendor-valid; vendor yang tidak didukung
// mengembalikan UNSUPPORTED — tidak pernah mengarang command.
//
// Aturan integritas:
//   1. Kapabilitas dicek dari REGISTRY (packages/vendors
//      capabilities.ts) — satu sumber kebenaran, bukan daftar
//      hardcoded di sini.
//   2. Generator command hanya ada untuk vendor yang syntax-nya
//      benar-benar diproses adapter. Tidak ada koersi diam-diam
//      ke syntax vendor lain.
//   3. Hasil CLI yang gagal (isCliFailure) TIDAK boleh dilaporkan
//      sukses — ok:false dengan output error sebagai bukti.
// ============================================================

import type { ToolResult, ToolExecCtx } from './types';
import { getVendorCapabilities } from '../../../../packages/vendors/src/index';
import type { CapabilityKey, CapabilityStatus } from '../../../../packages/vendors/src/index';

/**
 * Vendor yang PUNYA generator command autentik di modul ini.
 * Windows tidak termasuk: CLI-nya read-only (lihat notes registry).
 */
const GENERATOR_VENDORS = [
  'mikrotik',
  'cisco_ios',
  'cisco_nxos',
  'juniper',
  'huawei',
  'linux',
  'fortinet',
  'vyos',
  'ubiquiti',
  'aruba',
  'openwrt',
] as const;

/** Vendor untuk CLI config generator. */
export type ConfigVendor =
  | 'mikrotik'
  | 'cisco_ios'
  | 'cisco_nxos'
  | 'juniper'
  | 'huawei'
  | 'linux'
  | 'fortinet'
  | 'vyos'
  | 'ubiquiti'
  | 'aruba'
  | 'openwrt';

/**
 * Fitur tool → CapabilityKey registry. Dipakai untuk gate SEBELUM
 * command dibangun: fitur not-supported/parser-only pada vendor
 * ditolak jujur tanpa menyentuh state.
 */
const FEATURE_CAPS: Record<string, CapabilityKey> = {
  ip: 'ipv4',
  route: 'staticRoute',
  vlan: 'vlan',
  trunk: 'vlan',
  ospf: 'ospf',
  bgp: 'bgp',
  dhcp: 'dhcp',
  nat: 'nat',
  firewall: 'firewall',
};

function vendorOf(ctx: ToolExecCtx, deviceId: string): { vendor: string; ok: boolean; error?: string } {
  const dev = ctx.runtime.sim.getDevice(deviceId) ?? ctx.runtime.sim.getDeviceByName(deviceId);
  if (!dev) return { vendor: '', ok: false, error: `device tidak ditemukan: ${deviceId}` };
  const vendor = dev.vendor ?? dev.deviceType;
  // Registry = sumber kebenaran; vendor tak dikenal registry → tolak jujur.
  if (!getVendorCapabilities(vendor)) {
    return { vendor: '', ok: false, error: `vendor "${vendor}" tidak didukung untuk konfigurasi AI` };
  }
  return { vendor, ok: true };
}

function normalizeVendor(vendor: string): ConfigVendor | null {
  return (GENERATOR_VENDORS as readonly string[]).includes(vendor) ? (vendor as ConfigVendor) : null;
}

/**
 * Gate kapabilitas dari registry (konsisten dengan isCapabilityBlocked
 * di chain guard): 'not-supported' & 'parser-only' ditolak sebelum
 * ada mutasi state; 'partial' diizinkan sesuai perilaku yang memang ada.
 */
function capabilityGate(
  vendor: string,
  feature: keyof typeof FEATURE_CAPS
): { blocked: boolean; status?: CapabilityStatus; label: string } {
  const cap = FEATURE_CAPS[feature];
  const reg = getVendorCapabilities(vendor);
  if (!reg || !cap) return { blocked: true, label: `vendor "${vendor}" tidak dikenal registry kapabilitas` };
  const status: CapabilityStatus | undefined = reg.caps[cap];
  if (status === 'not-supported' || status === 'parser-only') {
    return {
      blocked: true,
      status,
      label: `fitur ${feature} (${cap}) berstatus '${status}' pada ${vendor} menurut capability registry`,
    };
  }
  return { blocked: false, status, label: '' };
}

interface CliOutcome {
  ok: boolean;
  outputs: string[];
  failedCommand?: string;
  failureOutput?: string;
}

/** Eksekusi serangkaian command + deteksi kegagalan JUJUR via res.ok (isCliFailure). */
function runCommands(ctx: ToolExecCtx, deviceId: string, vendor: string, commands: string[]): CliOutcome {
  const outputs: string[] = [];
  for (const cmd of commands) {
    const res = ctx.runtime.executeCli(deviceId, vendor, cmd);
    if (cmd.trim() !== 'exit') outputs.push(res.output);
    if (!res.ok) {
      return { ok: false, outputs, failedCommand: cmd, failureOutput: res.output };
    }
  }
  return { ok: true, outputs };
}

/** Bentuk ToolResult dari outcome CLI — sukses hanya bila semua command diterima vendor. */
function cliResult(
  devName: string,
  commands: string[],
  outcome: CliOutcome,
  successMessage: string,
  data: Record<string, unknown>
): ToolResult {
  const output = outcome.outputs.filter((o) => o.trim().length > 0).join('\n');
  if (!outcome.ok) {
    return {
      ok: false,
      message: `Perintah "${outcome.failedCommand}" DITOLAK oleh ${devName}: ${(outcome.failureOutput ?? '').trim().slice(0, 200)}`,
      error: 'cli-error',
      data: { ...data, commands, output },
      evidence: [output.slice(0, 400)],
    };
  }
  return {
    ok: true,
    message: successMessage,
    data: { ...data, commands, output },
    evidence: [output.slice(0, 400)].filter((e) => e.trim().length > 0),
  };
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

  const outcome = runCommands(ctx, dev.id, vendor, commands);
  return cliResult(dev.name, commands, outcome, `Perintah dieksekusi di ${dev.name} (${commands.length} baris).`, {
    deviceId: dev.id,
  });
}

// ── Generator command vendor (syntax VALID per vendor) ────────────

/** IP address (CIDR) per vendor — hanya syntax yang diproses adapter (bukti: adapter + conformance test). */
function ipCommand(v: ConfigVendor, iface: string, cidr: string, remove: boolean): string[] {
  switch (v) {
    case 'mikrotik':
      return remove
        ? [`/ip address remove [find where address="${cidr}" and interface="${iface}"]`]
        : [`/ip address add address=${cidr} interface=${iface}`];
    case 'cisco_ios':
    case 'cisco_nxos':
    case 'aruba': {
      const [ip, prefix] = cidr.split('/');
      const mask = prefix ? maskOf(Number(prefix)) : '255.255.255.0';
      return [`interface ${iface}`, remove ? `no ip address ${ip} ${mask}` : `ip address ${ip} ${mask}`, 'exit'];
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
    case 'vyos':
    case 'ubiquiti':
      // EdgeOS/VyOS: set interfaces ethernet <if> address <ip/prefix> (dihapus via delete … address)
      return remove
        ? [`delete interfaces ethernet ${iface} address ${cidr}`]
        : [`set interfaces ethernet ${iface} address ${cidr}`];
    case 'openwrt': {
      // UCI buffered → atomic di `uci commit` (commitUci). Section pakai
      // NAMA INTERFACE fisik agar resolveIfaceName memetakan langsung ke
      // port engine (network.<iface>.ipaddr).
      if (remove) return [`uci delete network.${iface}.ipaddr`, `uci commit`];
      const [ip, prefix] = cidr.split('/');
      const mask = prefix ? maskOf(Number(prefix)) : '255.255.255.0';
      return [
        `uci set network.${iface}.proto=static`,
        `uci set network.${iface}.ipaddr=${ip}`,
        `uci set network.${iface}.netmask=${mask}`,
        `uci commit`,
      ];
    }
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
    case 'cisco_nxos':
    case 'aruba': {
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
    case 'vyos':
    case 'ubiquiti':
      // VyOS/EdgeOS: set protocols static route <dst> next-hop <gw> (generic.ts b141)
      return [`set protocols static route ${dst} next-hop ${gateway}`];
    case 'openwrt': {
      // UCI route section: network.routeN.target/.gateway/.netmask (commitUci)
      const [ip, prefix] = dst.split('/');
      return [
        `uci set network.route1.target=${ip}`,
        `uci set network.route1.netmask=${prefix ? maskOf(Number(prefix)) : '255.255.255.0'}`,
        `uci set network.route1.gateway=${gateway}`,
        `uci commit`,
      ];
    }
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
    case 'aruba':
      return ['vlan ' + vlanId, name ? `name ${name}` : '', 'exit'].filter(Boolean);
    case 'juniper':
      return [`set vlans vlan${vlanId} vlan-id ${vlanId}${name ? ` description "${name}"` : ''}`];
    case 'huawei':
      return ['vlan ' + vlanId, name ? `description ${name}` : ''].filter(Boolean);
    case 'linux':
      return iface ? [`ip link add link ${iface} name ${iface}.${vlanId} type vlan id ${vlanId}`] : [];
    // vyos/ubiquiti/openwrt/fortinet: belum ada generator AI terverifikasi —
    // wrapper melaporkan 'no-generator' (bukan mengarang syntax).
    default:
      return [];
  }
}

function trunkCommand(v: ConfigVendor, iface: string): string[] {
  switch (v) {
    case 'mikrotik':
      return [`/interface bridge port set [find where interface=${iface}] pvid=1`];
    case 'cisco_ios':
    case 'cisco_nxos':
    case 'aruba': // switchport mode trunk juga diproses untuk AOS-CX (cisco-ios b131, cap vlan)
      return [`interface ${iface}`, 'switchport mode trunk'];
    case 'huawei':
      return [`interface ${iface}`, 'port link-type trunk'];
    case 'juniper':
      return [`set interfaces ${iface} unit 0 family ethernet-switching port-mode trunk`];
    default:
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
    // vyos/ubiquiti/aruba/openwrt/fortinet: belum ada generator AI terverifikasi.
    default:
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
    // vyos/ubiquiti/aruba/openwrt/fortinet: belum ada generator AI terverifikasi.
    default:
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
    // vyos/ubiquiti/aruba/openwrt/fortinet: belum ada generator AI terverifikasi.
    default:
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
    // vyos/ubiquiti/aruba/openwrt/fortinet: belum ada generator AI terverifikasi.
    default:
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
//
// Pola setiap tool:
//   1. vendorOf — device ada + vendor dikenal registry.
//   2. capabilityGate(feature) — tolak jujur bila registry bilang
//      not-supported/parser-only (konsisten dengan chain guard).
//   3. Generator syntax autentik; tanpa generator → 'no-generator'
//      (tool AI belum punya syntax terverifikasi, BUKAN klaim vendor).
//   4. runCommands + cliResult — kegagalan CLI = ok:false dengan bukti.

/** Resolusi vendor + gate kapabilitas bersama untuk semua tool config. */
function prepare(
  ctx: ToolExecCtx,
  deviceId: string,
  feature: keyof typeof FEATURE_CAPS
): { vendor: string; gen: ConfigVendor } | { fail: ToolResult } {
  const v = vendorOf(ctx, deviceId);
  if (!v.ok) return { fail: { ok: false, message: v.error ?? 'vendor unsupported', error: 'unsupported', unsupported: true } };
  const gate = capabilityGate(v.vendor, feature);
  if (gate.blocked) {
    return { fail: { ok: false, message: `${gate.label} — konfigurasi AI ditolak`, error: 'unsupported', unsupported: true } };
  }
  const gen = normalizeVendor(v.vendor);
  if (!gen) return { fail: { ok: false, message: `Tool AI belum menyediakan generator syntax ${feature} untuk ${v.vendor}. Gunakan execute_cli dengan syntax ${v.vendor} yang valid.`, error: 'no-generator', unsupported: true } };
  return { vendor: v.vendor, gen };
}

function noGenerator(vendor: string): ToolResult {
  return { ok: false, message: `Tool AI belum menyediakan generator command ${vendor} untuk fitur ini. Gunakan execute_cli dengan syntax vendor yang valid.`, error: 'no-generator', unsupported: true };
}

export function toolConfigureIpAddress(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const deviceId = p['deviceId'] as string;
  const iface = p['interface'] as string;
  const address = p['address'] as string;
  const prep = prepare(ctx, deviceId, 'ip');
  if ('fail' in prep) return prep.fail;
  const cmds = ipCommand(prep.gen, iface, address, false);
  if (cmds.length === 0) return noGenerator(prep.vendor);
  const outcome = runCommands(ctx, deviceId, prep.vendor, cmds);
  return cliResult(deviceId, cmds, outcome, `IP ${address} dikonfigurasi di ${deviceId}:${iface} (${cmds.length} perintah).`, {
    deviceId,
    interface: iface,
    address,
  });
}

export function toolRemoveIpAddress(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const deviceId = p['deviceId'] as string;
  const iface = p['interface'] as string;
  const address = p['address'] as string;
  const prep = prepare(ctx, deviceId, 'ip');
  if ('fail' in prep) return prep.fail;
  const cmds = ipCommand(prep.gen, iface, address, true);
  if (cmds.length === 0) return noGenerator(prep.vendor);
  const outcome = runCommands(ctx, deviceId, prep.vendor, cmds);
  return cliResult(deviceId, cmds, outcome, `IP ${address} dihapus dari ${deviceId}:${iface}.`, {
    deviceId,
    interface: iface,
    address,
  });
}

export function toolConfigureRoute(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const deviceId = p['deviceId'] as string;
  const dst = p['dst'] as string;
  const gateway = p['gateway'] as string;
  const prep = prepare(ctx, deviceId, 'route');
  if ('fail' in prep) return prep.fail;
  const cmds = routeCommand(prep.gen, dst, gateway);
  if (cmds.length === 0) return noGenerator(prep.vendor);
  const outcome = runCommands(ctx, deviceId, prep.vendor, cmds);
  return cliResult(deviceId, cmds, outcome, `Rute ${dst} via ${gateway} ditambahkan di ${deviceId}.`, {
    deviceId,
    dst,
    gateway,
  });
}

export function toolConfigureVlan(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const deviceId = p['deviceId'] as string;
  const vlanId = p['vlanId'] as number;
  const name = (p['name'] as string | undefined) ?? `vlan${vlanId}`;
  const iface = p['interface'] as string | undefined;
  const prep = prepare(ctx, deviceId, 'vlan');
  if ('fail' in prep) return prep.fail;
  const cmds = vlanCommand(prep.gen, vlanId, name, iface);
  if (cmds.length === 0) return noGenerator(prep.vendor);
  const outcome = runCommands(ctx, deviceId, prep.vendor, cmds);
  return cliResult(deviceId, cmds, outcome, `VLAN ${vlanId} (${name}) dikonfigurasi di ${deviceId}.`, {
    deviceId,
    vlanId,
    name,
    iface,
  });
}

export function toolConfigureTrunk(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const deviceId = p['deviceId'] as string;
  const iface = p['interface'] as string;
  const prep = prepare(ctx, deviceId, 'trunk');
  if ('fail' in prep) return prep.fail;
  const cmds = trunkCommand(prep.gen, iface);
  if (cmds.length === 0) return noGenerator(prep.vendor);
  const outcome = runCommands(ctx, deviceId, prep.vendor, cmds);
  return cliResult(deviceId, cmds, outcome, `${iface} dijadikan trunk di ${deviceId}.`, {
    deviceId,
    interface: iface,
  });
}

export function toolConfigureOspf(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const deviceId = p['deviceId'] as string;
  const network = p['network'] as string;
  const area = (p['area'] as number | undefined) ?? 0;
  const prep = prepare(ctx, deviceId, 'ospf');
  if ('fail' in prep) return prep.fail;
  const cmds = ospfCommand(prep.gen, network, area);
  if (cmds.length === 0) return noGenerator(prep.vendor);
  const outcome = runCommands(ctx, deviceId, prep.vendor, cmds);
  return cliResult(deviceId, cmds, outcome, `OSPF network ${network} area ${area} dikonfigurasi di ${deviceId}.`, {
    deviceId,
    network,
    area,
  });
}

export function toolConfigureBgp(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const deviceId = p['deviceId'] as string;
  const asn = p['asn'] as number;
  const neighborIp = p['neighborIp'] as string;
  const remoteAs = p['remoteAs'] as number;
  const network = p['network'] as string | undefined;
  const prep = prepare(ctx, deviceId, 'bgp');
  if ('fail' in prep) return prep.fail;
  const cmds = bgpCommand(prep.gen, asn, neighborIp, remoteAs, network);
  if (cmds.length === 0) return noGenerator(prep.vendor);
  const outcome = runCommands(ctx, deviceId, prep.vendor, cmds);
  return cliResult(deviceId, cmds, outcome, `BGP AS${asn} neighbor ${neighborIp} AS${remoteAs} dikonfigurasi di ${deviceId}.`, {
    deviceId,
    asn,
    neighborIp,
    remoteAs,
  });
}

export function toolConfigureDhcp(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const deviceId = p['deviceId'] as string;
  const poolName = p['poolName'] as string;
  const range = p['range'] as string;
  const gateway = p['gateway'] as string;
  const prep = prepare(ctx, deviceId, 'dhcp');
  if ('fail' in prep) return prep.fail;
  const cmds = dhcpCommand(prep.gen, poolName, range, gateway);
  if (cmds.length === 0) return noGenerator(prep.vendor);
  const outcome = runCommands(ctx, deviceId, prep.vendor, cmds);
  return cliResult(deviceId, cmds, outcome, `DHCP pool ${poolName} (${range}, gw ${gateway}) dikonfigurasi di ${deviceId}.`, {
    deviceId,
    poolName,
    range,
    gateway,
  });
}

export function toolConfigureNat(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const deviceId = p['deviceId'] as string;
  const outInterface = p['outInterface'] as string;
  const masquerade = (p['masquerade'] as boolean | undefined) ?? true;
  const prep = prepare(ctx, deviceId, 'nat');
  if ('fail' in prep) return prep.fail;
  const cmds = natCommand(prep.gen, outInterface, masquerade);
  if (cmds.length === 0) return noGenerator(prep.vendor);
  const outcome = runCommands(ctx, deviceId, prep.vendor, cmds);
  return cliResult(deviceId, cmds, outcome, `NAT ${masquerade ? 'masquerade' : 'srcnat'} out-interface ${outInterface} dikonfigurasi di ${deviceId}.`, {
    deviceId,
    outInterface,
    masquerade,
  });
}

export function toolConfigureFirewall(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const deviceId = p['deviceId'] as string;
  const action = p['action'] as 'accept' | 'drop' | 'reject';
  const chain = (p['chain'] as 'input' | 'forward' | undefined) ?? 'forward';
  const src = p['src'] as string | undefined;
  const dst = p['dst'] as string | undefined;
  const protocol = p['protocol'] as string | undefined;
  const port = p['port'] as number | undefined;
  const prep = prepare(ctx, deviceId, 'firewall');
  if ('fail' in prep) return prep.fail;
  const cmds = firewallCommand(prep.gen, action, chain, src, dst, protocol, port);
  if (cmds.length === 0) return noGenerator(prep.vendor);
  const outcome = runCommands(ctx, deviceId, prep.vendor, cmds);
  return cliResult(
    deviceId,
    cmds,
    outcome,
    `Firewall ${action} ${protocol ?? 'any'} ${src ?? '*'} → ${dst ?? '*'}${port != null ? `:${port}` : ''} di ${deviceId}.`,
    { deviceId, action, chain }
  );
}

export function toolConfigureWireless(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const deviceId = p['deviceId'] as string;
  const ssid = p['ssid'] as string;
  const mode = (p['mode'] as 'ap' | 'station' | undefined) ?? 'ap';
  const password = p['password'] as string | undefined;
  const v = vendorOf(ctx, deviceId);
  if (!v.ok) return { ok: false, message: v.error ?? 'vendor unsupported', error: 'unsupported', unsupported: true };
  const gen = normalizeVendor(v.vendor);
  if (!gen) return noGenerator(v.vendor);
  const cmds = wirelessCommand(gen, ssid, mode, password);
  if (cmds.length === 0) return noGenerator(v.vendor);
  const outcome = runCommands(ctx, deviceId, v.vendor, cmds);
  return cliResult(deviceId, cmds, outcome, `Wireless ${mode} SSID ${ssid} dikonfigurasi di ${deviceId}.`, {
    deviceId,
    ssid,
    mode,
  });
}