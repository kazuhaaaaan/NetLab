// GENERATED — branch handlers untuk SEMUA vendor (no vendor guard).
// Disunting oleh script ekstraksi dari dispatch() lama. JANGAN ditulis tangan.
import type { CommandResult, ChainEnv, ChainEntry } from './types';
import { juniperSnapshot, restoreJuniper } from './memory';
import { registerEntries } from './chain';

import { handleDeletion } from './deletion';
import { snmpCommand } from './snmp';
import { upsertSubinterface, mergeIps } from './state';
import { resolveIfaceName, isKnownInterface, isValidIpv6, isValidIpv4, isValidPrefix } from './ip';
import { generateRunningConfig } from './format';
import { payloadStr, recordArray, recordObject } from './types';
import type { ASTNode } from './types';

export const genericEntries: ChainEntry[] = [
  {
    name: 'b1',
    order: 1,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === '?' || normalized.action === 'help' || rawInput.trim() === '?'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'help' };
        
    return cmdResult;
  },
  },
  {
    name: 'b2',
    order: 2,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (true),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;
cmdResult = handleDeletion(rawInput, normalized, vendorId, mem, context);
    
    // Configuration deletion (no …, /ip … remove, delete …, undo …, uci delete …)
    // mutates real state instead of returning fake success.
        
    return cmdResult;
  },
  },
  {
    name: 'b3',
    order: 3,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^(?:reload|reboot)\s*$|^\/system\s+reboot\s*$/i.test(rawInput.trim())),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Reload: restore node dari startup-config (write memory / copy run start).
          const hadStartup = registry.reloadFromStartupConfig(nodeId);
          cmdResult = { type: 'reload', hadStartup };
        
    return cmdResult;
  },
  },
  {
    name: 'b4',
    order: 4,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (true),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;
cmdResult = snmpCommand(rawInput, vendorId, mem, context);
    
    // SNMP: konfigurasi agent per vendor + query snmpget/snmpwalk/snmpset.
    // Selalu dicek duluan agar perintah agent tidak tabrakan dengan parser bawaan.
        
    return cmdResult;
  },
  },
  {
    name: 'b11',
    order: 11,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^(?:interface|int)\s+\S+/i.test(rawInput.trim())),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // IOS-style: "interface Gi0/0" / "int Gi0/0" (Cisco, Aruba, Huawei) — sets the config context
          const ifaceRaw = rawInput.trim().replace(/^(?:interface|int)\s+/i, '').split(/\s+/)[0];
          const isSubinterface =
            ifaceRaw.includes('.') &&
            !(context?.ports || []).some((p) => String(p.name).toLowerCase() === ifaceRaw.toLowerCase()) &&
            (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba' || vendorId === 'huawei');
    // Keluar dari VLAN config view — `name <x>` tidak boleh lagi menyentuh VLAN.
          mem.currentVlan = '';
          if (isSubinterface) {
    // VLAN subinterface (router-on-a-stick): "interface Gi0/0.10"
            const dot = ifaceRaw.lastIndexOf('.');
            const parent = ifaceRaw.slice(0, dot);
            const vlanId = parseInt(ifaceRaw.slice(dot + 1), 10) || 1;
            upsertSubinterface(mem, ifaceRaw, parent, vlanId);
            mem.currentIface = ifaceRaw;
            mem.currentDhcpPool = '';
            cmdResult = { raw: '' };
          } else {
    // Interface hantu (tidak ada di device, bukan subinterface) → error
    // jujur ala IOS ("Invalid input detected"), bukan sukses palsu.
            const ifaceLower = ifaceRaw.toLowerCase();
            const exists = (context?.ports || []).some(
              (p) => String(p.name || '').toLowerCase() === ifaceLower || String(p.id || '').toLowerCase() === ifaceLower
            );
            if (!exists && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba' || vendorId === 'huawei')) {
              cmdResult = { raw: `% Invalid input detected at '^' marker. (interface "${String(ifaceRaw)}" tidak ada di device ini)` };
            } else {
              mem.currentIface = resolveIfaceName(context?.ports, ifaceRaw);
              mem.currentDhcpPool = '';
              cmdResult = { raw: '' };
            }
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b39',
    order: 39,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/routing\s+vrrp\s+instance\s+print/i.test(rawInput.trim()) || (normalized.target === 'routing_vrrp_instance' && normalized.action === 'print')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // MikroTik: "/routing vrrp instance print" — snapshot dari engine
          const states = typeof context.fhrpProvider === 'function' ? recordArray(context.fhrpProvider()) : mem.fhrpGroups as unknown[];
          cmdResult = { type: 'fhrp_print', groups: states || [] };
        
    return cmdResult;
  },
  },
  {
    name: 'b40',
    order: 40,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/ipv6\s+(?:address|route)\s+print/i.test(rawInput.trim()) || normalized.target === 'ipv6_address' || normalized.target === 'ipv6_route'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // MikroTik: "/ipv6 address print" / "/ipv6 route print" — snapshot engine
          const info = typeof context.ipv6Provider === 'function' ? context.ipv6Provider() : null;
          cmdResult = { type: 'ipv6_print', info };
        
    return cmdResult;
  },
  },
  {
    name: 'b41',
    order: 41,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/ipv6\s+dhcp-client\s+print/i.test(rawInput.trim()) || (normalized.target === 'ipv6_dhcp-client' && normalized.action === 'print')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // MikroTik: "/ipv6 dhcp-client print" — slider SLAAC/DHCPv6 client
          const info = typeof context.ipv6Provider === 'function' ? context.ipv6Provider() : null;
          cmdResult = { type: 'ipv6_dhcp_print', clients: mem.ipv6DhcpClients || [], info };
        
    return cmdResult;
  },
  },
  {
    name: 'b43',
    order: 43,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^edit\s+\S+/i.test(rawInput.trim())),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Fortinet: "edit port1" — sets the config context
          const ifaceRaw = rawInput.trim().replace(/^edit\s+/i, '').split(/\s+/)[0];
          mem.currentIface = resolveIfaceName(context?.ports, ifaceRaw);
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b89',
    order: 89,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/ip\s+dhcp-client\s+print/i.test(rawInput.trim()) || (normalized.target === 'ip_dhcp-client' && normalized.action === 'print')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'dhcp_client_print', clients: mem.dhcpClients };
        
    return cmdResult;
  },
  },
  {
    name: 'b94',
    order: 94,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/ip\s+firewall\s+filter\s+print/i.test(rawInput.trim()) || (normalized.target === 'ip_firewall_filter' && normalized.action === 'print')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'acl_print', rules: mem.acls };
        
    return cmdResult;
  },
  },
  {
    name: 'b95',
    order: 95,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^show\s+access-lists/i.test(rawInput.trim())),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'acl_print', rules: mem.acls };
        
    return cmdResult;
  },
  },
  {
    name: 'b100',
    order: 100,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^show\s+ip\s+nat\s+translations/i.test(rawInput.trim()) || /^show\s+ip\s+nat\s+statistics/i.test(rawInput.trim())),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'nat_print', rules: mem.natRules };
        
    return cmdResult;
  },
  },
  {
    name: 'b136',
    order: 136,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/queue\s+simple\s+print/i.test(rawInput.trim()) || (normalized.target === 'queue_simple' && normalized.action === 'print')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const live = typeof context.qosProvider === 'function' ? recordArray(context.qosProvider()) : [];
          cmdResult = { type: 'queue_print', queues: mem.queues, live };
        
    return cmdResult;
  },
  },
  {
    name: 'b138',
    order: 138,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/ip\s+firewall\s+mangle\s+print/i.test(rawInput.trim()) || (normalized.target === 'ip_firewall_mangle' && normalized.action === 'print')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'mangle_print', rules: mem.mangleRules };
        
    return cmdResult;
  },
  },
  {
    name: 'b140',
    order: 140,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^show\s+ip\s+protocols/i.test(rawInput.trim())),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'proto_print', routing: mem.routing, bgp: mem.bgp };
        
    return cmdResult;
  },
  },
  {
    name: 'b141',
    order: 141,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'set_config'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Juniper / EdgeOS / VyOS: "set interfaces <if> ... address <ip/mask>" or static routes
          const path = Array.isArray(payload?.path) ? (payload.path as string[]).map(s => s.toLowerCase()) : [];
          const intIdx = path.indexOf('interfaces');
          if (intIdx >= 0 && path.length > intIdx + 1) {
            let iface = path[intIdx + 1];
            if (iface === 'ethernet') iface = path[intIdx + 2]; // vyos/edgeos: set interfaces ethernet eth0 address ...
            const addrIdx = path.lastIndexOf('address');
            const ip = addrIdx >= 0 ? path[addrIdx + 1] : undefined;
            if (ip) {
              mem.configuredIps[resolveIfaceName(context?.ports, iface)] = ip;
              cmdResult = { raw: '' };
            } else {
              cmdResult = { raw: '% Usage: set interfaces <iface> unit 0 family inet address <ip/mask>' };
            }
          } else if (path.includes('routing-options') && path.includes('static')) {
    // Juniper: set routing-options static route <dst> next-hop <gw>
            const ri = path.indexOf('route');
            const ni = path.indexOf('next-hop');
            const dst = ri >= 0 ? path[ri + 1] : undefined;
            const gw = ni >= 0 ? path[ni + 1] : undefined;
            if (dst && gw) {
              mem.routes.push({ dst, gateway: gw, distance: 1 });
              cmdResult = { raw: '' };
            } else {
              cmdResult = { raw: '% Usage: set routing-options static route <dst> next-hop <gw>' };
            }
          } else if (path.includes('protocols') && path.includes('static')) {
    // VyOS: set protocols static route <dst> next-hop <gw>
            const ri = path.indexOf('route');
            const ni = path.indexOf('next-hop');
            const dst = ri >= 0 ? path[ri + 1] : undefined;
            const gw = ni >= 0 ? path[ni + 1] : undefined;
            if (dst && gw) {
              mem.routes.push({ dst, gateway: gw, distance: 1 });
              cmdResult = { raw: '' };
            } else {
              cmdResult = { raw: '% Usage: set protocols static route <dst> next-hop <gw>' };
            }
          } else {
            cmdResult = { raw: '% Unknown "set" path' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b142',
    order: 142,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'add_ip'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const ip = payloadStr(normalized.payload, 'ip');
              const iface = payloadStr(normalized.payload, 'iface');
              const mask = payloadStr(normalized.payload, 'mask');
          const ifaceName = resolveIfaceName(context?.ports, iface || mem.currentIface);
          if (!ip || !ifaceName) {
            cmdResult = { raw: '% Error: missing address or interface parameter' };
          } else if (!isKnownInterface(context?.ports, ifaceName)) {
            cmdResult = { raw: `% Error: unknown interface "${String(ifaceName)}" (tidak ada di device ini)` };
          } else {
    // Validasi IP: IPv4 atau IPv6; prefix / mask wajib sah.
            const rawIp = String(ip).trim();
            const v6 = rawIp.includes(':');
            const ipPart = rawIp.split('/')[0];
            const ipOk = v6 ? isValidIpv6(ipPart) : isValidIpv4(ipPart);
            const prefixOk = rawIp.includes('/') ? isValidPrefix(rawIp.split('/')[1], v6) : true;
            const maskOk = !mask
              ? true
              : v6
                ? false
                : (() => {
    // Mask numerik "24" (didukung engine) atau dotted-quad kontigu "255.255.255.0".
                    if (/^\d{1,2}$/.test(String(mask))) {
                      const n = Number(mask);
                      return Number.isInteger(n) && n >= 0 && n <= 32;
                    }
                    const m = String(mask).match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
                    if (!m) return false;
                    const octets = m.slice(1).map(Number);
                    if (octets.some((o) => o < 0 || o > 255)) return false;
                    const bits = octets.reduce((acc, o) => acc + (o.toString(2).match(/1/g) || []).length, 0);
                    const expected = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
                    const value = octets.reduce((acc, o) => (acc << 8) + o, 0) >>> 0;
                    return value === expected;
                  })();
            if (!ipOk) {
              cmdResult = { raw: `% Error: invalid IP address "${String(ip)}"` };
            } else if (!prefixOk) {
              cmdResult = { raw: `% Error: invalid prefix length "${String(rawIp.split('/')[1])}"` };
            } else if (mask && !maskOk) {
              cmdResult = { raw: `% Error: invalid netmask "${String(mask)}"` };
            } else {
              mem.configuredIps[ifaceName] = mask ? `${String(ip)} ${String(mask)}` : ip;
              cmdResult = { raw: '' };
            }
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b143',
    order: 143,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'add_route'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const dst = payloadStr(normalized.payload, 'dst');
              const gw = payloadStr(normalized.payload, 'gw');
          if (dst && gw) {
            const rawDist = parseInt(String(payload?.distance ?? 1), 10);
            const distance = Number.isFinite(rawDist) && rawDist >= 1 ? Math.floor(rawDist) : 1;
            mem.routes.push({ dst, gateway: gw, distance });
            cmdResult = { raw: '' };
          } else {
            cmdResult = { raw: '% Error: missing dst-address or gateway' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b144',
    order: 144,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'bgp_instance_add' || normalized.action === 'bgp_router'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const as = payloadStr(normalized.payload, 'as');
              const routerId = payloadStr(normalized.payload, 'routerId');
          if (as) {
            const asn = parseInt(String(as), 10);
            if (!(asn >= 1 && asn <= 4294967295)) {
              cmdResult = { raw: `% Error: invalid autonomous system number ${String(as)}` };
            } else {
              mem.bgp.asn = asn;
              if (routerId) mem.bgp.routerId = routerId;
              mem.currentProto = 'bgp';
              mem.currentDhcpPool = '';
              cmdResult = { raw: '' };
            }
          } else {
            mem.currentProto = 'bgp';
            mem.currentDhcpPool = '';
            cmdResult = { raw: '' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b145',
    order: 145,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'bgp_peer_add'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const remoteAs = payloadStr(normalized.payload, 'remoteAs');
              const remoteAddr = payloadStr(normalized.payload, 'remoteAddr');
              const name = payloadStr(normalized.payload, 'name');
          if (remoteAs && remoteAddr) {
            mem.bgp.peers.push({ remoteAs: parseInt(String(remoteAs), 10), remoteAddr, name: name || remoteAddr });
            cmdResult = { raw: '' };
          } else {
            cmdResult = { raw: '% Error: missing remote-as or remote-address' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b146',
    order: 146,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'bgp_neighbor'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const remoteAs = payloadStr(normalized.payload, 'remoteAs');
              const ip = payloadStr(normalized.payload, 'ip');
          if (remoteAs && ip) {
            mem.bgp.peers.push({ remoteAs: parseInt(String(remoteAs), 10), remoteAddr: ip, name: ip });
            cmdResult = { raw: '' };
          } else {
            cmdResult = { raw: '% Incomplete command' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b147',
    order: 147,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'bgp_peer_print'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const states = recordArray(typeof context.bgpNeighborProvider === 'function' ? context.bgpNeighborProvider() : []);
          const peers = mem.bgp.peers.map((p) => {
            const s = states.find((x) => x.remoteAddr === p.remoteAddr);
            return { ...p, state: s?.state || 'Idle', prefixes: s?.prefixes ?? 0, uptime: s?.uptime || 'never' };
          });
          cmdResult = { type: 'bgp_peer_print', peers, asn: mem.bgp.asn, routerId: mem.bgp.routerId };
        
    return cmdResult;
  },
  },
  {
    name: 'b148',
    order: 148,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'show_bgp_summary'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const states = recordArray(typeof context.bgpNeighborProvider === 'function' ? context.bgpNeighborProvider() : []);
          const peers = mem.bgp.peers.map((p) => {
            const s = states.find((x) => x.remoteAddr === p.remoteAddr);
            return { ...p, state: s?.state || 'Idle', prefixes: s?.prefixes ?? 0, uptime: s?.uptime || 'never' };
          });
          cmdResult = { type: 'show_bgp_summary', peers, asn: mem.bgp.asn, routerId: mem.bgp.routerId || mem.configuredIps[Object.keys(mem.configuredIps)[0]] };
        
    return cmdResult;
  },
  },
  {
    name: 'b149',
    order: 149,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'show_cdp_neighbors' || normalized.action === 'show_lldp_neighbors'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const proto = normalized.action === 'show_cdp_neighbors' ? 'cdp' : 'lldp';
          cmdResult = { type: 'neighbor_print', proto, neighbors: typeof context.neighborProvider === 'function' ? context.neighborProvider(proto) : [] };
        
    return cmdResult;
  },
  },
  {
    name: 'b150',
    order: 150,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'show_ospf_neighbor' || normalized.action === 'display_ospf_peer'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'ospf_neighbor_print', neighbors: typeof context.ospfNeighborProvider === 'function' ? context.ospfNeighborProvider() : [] };
        
    return cmdResult;
  },
  },
  {
    name: 'b151',
    order: 151,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'ip_neighbor_print' || (normalized.target === 'ip_neighbor' && normalized.action === 'print')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'neighbor_print', proto: 'lldp', neighbors: typeof context.neighborProvider === 'function' ? context.neighborProvider('lldp') : [] };
        
    return cmdResult;
  },
  },
  {
    name: 'b152',
    order: 152,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'netstat' || normalized.action === 'ss' || normalized.action === 'show_tcp_brief'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'tcp_print', connections: typeof context.tcpProvider === 'function' ? context.tcpProvider() : [] };
        
    return cmdResult;
  },
  },
  {
    name: 'b153',
    order: 153,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'ip_neigh'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'ip_neigh', entries: typeof context.arpProvider === 'function' ? context.arpProvider() : [] };
        
    return cmdResult;
  },
  },
  {
    name: 'b154',
    order: 154,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'show_mac_table' || normalized.action === 'display_mac'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'mac_table', entries: typeof context.macTableProvider === 'function' ? context.macTableProvider() : [] };
        
    return cmdResult;
  },
  },
  {
    name: 'b155',
    order: 155,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'show_arp_table' || normalized.action === 'display_arp'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'arp_table', entries: typeof context.arpProvider === 'function' ? context.arpProvider() : [] };
        
    return cmdResult;
  },
  },
  {
    name: 'b156',
    order: 156,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'show_ip_arp'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'arp_table', entries: typeof context.arpProvider === 'function' ? context.arpProvider() : [] };
        
    return cmdResult;
  },
  },
  {
    name: 'b157',
    order: 157,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'ip_address_print' ||
      (normalized.target === 'ip_address' && normalized.action === 'print')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const ports = mergeIps(context?.ports, mem.configuredIps);
          cmdResult = { type: 'ip_address_print', ports };
        
    return cmdResult;
  },
  },
  {
    name: 'b158',
    order: 158,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'interface_print' ||
      (normalized.action === 'print' && normalized.target === 'interface')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // MikroTik "/interface print" — daftar interface dengan status & IP.
          const ports = mergeIps(context?.ports, mem.configuredIps);
          cmdResult = { type: 'interface_print', ifaces: ports, shutdownIfaces: mem.shutdownIfaces || [] };
        
    return cmdResult;
  },
  },
  {
    name: 'b159',
    order: 159,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'show_int_status'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // NX-OS "show interface status" — kolom status per port.
          const ports = mergeIps(context?.ports, mem.configuredIps);
          cmdResult = {
            type: 'int_status',
            ifaces: ports,
            shutdownIfaces: mem.shutdownIfaces || [],
          };
        
    return cmdResult;
  },
  },
  {
    name: 'b160',
    order: 160,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'show_ip_int_brief' || normalized.action === 'show_int_brief' || normalized.action === 'show_ip_int' || normalized.action === 'display_ip_int' || normalized.action === 'get_system_interface' || normalized.action === 'show_interfaces_terse' || normalized.action === 'show_interfaces' || normalized.action === 'ifconfig' || normalized.action === 'ip_addr'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const ports = mergeIps(context?.ports, mem.configuredIps);
          cmdResult = { type: normalized.action, ports, shutdownIfaces: mem.shutdownIfaces || [] };
        
    return cmdResult;
  },
  },
  {
    name: 'b161',
    order: 161,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'show_ip_route' || normalized.action === 'show_route' || normalized.action === 'display_routing' || normalized.action === 'ip_route' || (normalized.target === 'ip_route' && normalized.action === 'print')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const dynamicRoutes = recordArray(typeof context.routeProvider === 'function' ? context.routeProvider() : []);
          const connectedRoutes = (mergeIps(context?.ports, mem.configuredIps) || [])
            .filter((p) => p.ipAddress)
            .map((p) => ({ dst: p.ipAddress, iface: String(p.name), gateway: '', prefSrc: String(p.ipAddress).split('/')[0], kind: 'connected' }));
          const staticRoutes = mem.routes.map((r) => ({ dst: r.dst, iface: '', gateway: r.gateway || '', prefSrc: '', kind: 'static', distance: r.distance }));
          const dynamic = dynamicRoutes
            .filter((r) => r.kind === 'dynamic')
            .map((r) => ({ dst: r.dst, iface: r.iface || '', gateway: r.gateway || '', prefSrc: '', kind: 'dynamic' }));
          cmdResult = { type: normalized.target === 'ip_route' && normalized.action === 'print' ? 'ip_route_print' : normalized.action, routes: [...connectedRoutes, ...staticRoutes, ...dynamic] };
        
    return cmdResult;
  },
  },
  {
    name: 'b162',
    order: 162,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'ping' || (normalized.target === 'tool' && (typeof normalized.payload?.ast === 'object' && normalized.payload.ast !== null && (normalized.payload.ast as ASTNode)?.subCommands?.[0]?.toLowerCase() === 'ping'))),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const ast = (typeof payload?.ast === 'object' && payload.ast !== null) ? (payload.ast as ASTNode) : undefined;
          const host = String(payload.host || ast?.subCommands?.[1] || ast?.subCommands?.[0] || '');
          cmdResult = { type: 'ping', host, target: host };
        
    return cmdResult;
  },
  },
  {
    name: 'b163',
    order: 163,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'traceroute' || normalized.action === 'tracert' || (normalized.target === 'tool' && (typeof normalized.payload?.ast === 'object' && normalized.payload.ast !== null && (normalized.payload.ast as ASTNode)?.subCommands?.[0]?.toLowerCase() === 'traceroute'))),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const host = rawInput.trim().split(/\s+/).pop() || '';
          cmdResult = { type: 'traceroute', host, target: host };
        
    return cmdResult;
  },
  },
  {
    name: 'b166',
    order: 166,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'show_version' || normalized.action === 'display_version' || normalized.action === 'resource' || normalized.action === 'version' || (normalized.target === 'system_resource' && normalized.action === 'print')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'show_version', model: mem.modelLabel, hostname: mem.hostname || context?.name };
        
    return cmdResult;
  },
  },
  {
    name: 'b167',
    order: 167,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'configure_terminal' || normalized.action === 'configure' || normalized.action === 'system_view'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: normalized.action };
        
    return cmdResult;
  },
  },
  {
    name: 'b168',
    order: 168,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'enable'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'enable' };
        
    return cmdResult;
  },
  },
  {
    name: 'b171',
    order: 171,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'commit'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'commit' };
        
    return cmdResult;
  },
  },
  {
    name: 'b172',
    order: 172,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'rollback'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Vendor lain tidak punya snapshot — jangan pernah pura-pura sukses.
          cmdResult = { raw: 'error: no configuration to roll back' };
        
    return cmdResult;
  },
  },
  {
    name: 'b173',
    order: 173,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'write_mem' || normalized.action === 'save'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          registry.saveStartupConfig(nodeId);
          cmdResult = { type: normalized.action };
        
    return cmdResult;
  },
  },
  {
    name: 'b174',
    order: 174,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'show_vlan' || (normalized.target === 'interface_vlan' && normalized.action === 'print')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // show vlan — dari state OTORITATIF (mem.vlans), nama asli. Port per VLAN
    // diturunkan dari konfigurasi nyata (access + trunk allowed/native),
    // bukan hardcode "Gi0/1, Gi0/2, Gi0/3".
          const accessByVlan: Record<string, string[]> = {};
          for (const [iface, v] of Object.entries(mem.portVlans || {})) {
            const key = String(v);
            (accessByVlan[key] = accessByVlan[key] || []).push(iface);
          }
          const trunkList = mem.trunkPorts || [];
          const withPorts = (mem.vlans || []).map((v) => {
            const id = String(v.id);
            const ports = [...(accessByVlan[id] || [])];
            for (const t of trunkList) {
              const allowed = mem.trunkAllowed && mem.trunkAllowed[t] !== undefined ? mem.trunkAllowed[t] as number[] : undefined;
              const native = mem.trunkNative && mem.trunkNative[t] !== undefined ? String(mem.trunkNative[t]) : undefined;
              if (native === id || allowed === undefined || allowed.map(String).includes(id)) ports.push(`${String(t)}*`);
            }
            return { ...v, ports };
          });
          cmdResult = { type: 'show_vlan', vlans: withPorts };
        
    return cmdResult;
  },
  },
  {
    name: 'b175',
    order: 175,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'show_stp'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const info = recordObject(typeof context.stpProvider === 'function' ? context.stpProvider() : null);
          const stpPorts = recordArray(info ? info.ports : null);
          cmdResult = info && info.enabled !== undefined
            ? { type: 'show_stp', enabled: info.enabled, mode: String(info.mode || 'rstp'), priority: Number(info.priority ?? 32768), rootId: String(info.rootId || ''), rootName: String(info.rootName || ''), bridgeId: String(info.bridgeId || ''), rootPort: String(info.rootPort || ''), ports: stpPorts }
            : { type: 'show_stp' };
        
    return cmdResult;
  },
  },
  {
    name: 'b176',
    order: 176,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'get_system_status'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'get_system_status', model: mem.modelLabel, hostname: mem.hostname || context?.name };
        
    return cmdResult;
  },
  },
  {
    name: 'b177',
    order: 177,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'show_firewall_policy'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'show_firewall_policy' };
        
    return cmdResult;
  },
  },
  {
    name: 'b178',
    order: 178,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'dhcp_print' || normalized.action === 'show_ip_dhcp_pool' || (normalized.target === 'ip_dhcp-server' && normalized.action === 'print')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'dhcp_print', pools: mem.dhcpPools };
        
    return cmdResult;
  },
  },
  {
    name: 'b179',
    order: 179,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'dns_print' || normalized.action === 'show_hosts' || (normalized.target === 'ip_dns' && normalized.action === 'print')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'dns_print', servers: mem.dnsServers };
        
    return cmdResult;
  },
  },
  {
    name: 'b180',
    order: 180,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'nat_print' || (normalized.target === 'ip_firewall_nat' && normalized.action === 'print')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'nat_print', rules: mem.natRules };
        
    return cmdResult;
  },
  },
  {
    name: 'b181',
    order: 181,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => ((normalized.target === 'ip_dns_static' && normalized.action === 'print') || normalized.action === 'dns_static_print'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'dns_static_print', records: mem.dnsRecords };
        
    return cmdResult;
  },
  },
  {
    name: 'b182',
    order: 182,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.target === 'ip_service' && normalized.action === 'print'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'service_print', web: mem.webServer };
        
    return cmdResult;
  },
  },
  {
    name: 'b183',
    order: 183,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'vlan_print' || normalized.action === 'interface_vlan_print' || (normalized.action === 'print' && normalized.target === 'vlan')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'vlan_print', vlans: mem.vlans };
        
    return cmdResult;
  },
  },
  {
    name: 'b184',
    order: 184,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'identity_print' || normalized.action === 'hostname_print' || normalized.action === 'show_hostname' || normalized.action === 'hostname' || (normalized.target === 'system_identity' && normalized.action === 'print')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'identity_print', name: mem.hostname || context?.name || vendorId };
        
    return cmdResult;
  },
  },
  {
    name: 'b185',
    order: 185,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'uci_show'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = {
            type: 'uci_show',
            mem: {
              configuredIps: mem.configuredIps,
              dhcpClients: mem.dhcpClients,
              routes: mem.routes,
            },
            pools: mem.dhcpPools,
            natRules: mem.natRules,
            hostname: mem.hostname,
          };
        
    return cmdResult;
  },
  },
  {
    name: 'b186',
    order: 186,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'logread'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'logread' };
        
    return cmdResult;
  },
  },
  {
    name: 'b187',
    order: 187,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'show_running' || normalized.action === 'display_current' || normalized.action === 'export'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { raw: generateRunningConfig(context, mem, vendorId) };
        
    return cmdResult;
  },
  },
  {
    name: 'b188',
    order: 188,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'identity_print'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'identity_print', name: context?.name || vendorId };
        
    return cmdResult;
  },
  },
];

registerEntries('generic', genericEntries);
