// GENERATED — branch handler vendor mikrotik (diekstraksi dari dispatch() lama).
import type { CommandResult, ChainEntry, ChainEnv } from '../common/types';
import { registerEntries } from '../common/chain';
import { recordArray, recordObject } from '../common/types';

import { resolveIfaceName } from '../common/ip';
import { setShutdownState, upsertSubinterface, grantDhcpClient, pushTrunk } from '../common/state';

export const mikrotikEntries: ChainEntry[] = [
  {
    name: 'b18',
    order: 18,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/routing\s+ospf\s+interface-template\s+add\s+interface=/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // RouterOS v7: "/routing ospf interface-template add interface=ether1 cost=10 passive=yes"
          const raw = rawInput.trim();
          const ifaceRaw = raw.match(/interface=(\S+)/i)?.[1];
          if (ifaceRaw) {
            const iface = resolveIfaceName(context?.ports, ifaceRaw) || ifaceRaw;
            mem.routing.ospf.enabled = true;
            const cost = parseInt(raw.match(/cost=(\d+)/i)?.[1] || '0', 10);
            if (cost >= 1 && cost <= 65535) mem.routing.ospf.interfaceCosts[iface] = cost;
            if (/passive=(?:yes|true)/i.test(raw) && !mem.routing.ospf.passiveInterfaces.includes(iface)) {
              mem.routing.ospf.passiveInterfaces.push(iface);
            }
            cmdResult = { raw: '' };
          } else {
            cmdResult = { raw: '% Usage: /routing ospf interface-template add interface=<port> cost=<1-65535> passive=yes' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b19',
    order: 19,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/routing\s+ospf\s+interface\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // RouterOS v6 (kompatibilitas): "/routing ospf interface add interface=ether1 cost=10 passive=yes"
          const raw = rawInput.trim();
          const ifaceRaw = raw.match(/interface=(\S+)/i)?.[1];
          if (ifaceRaw) {
            const iface = resolveIfaceName(context?.ports, ifaceRaw) || ifaceRaw;
            const cost = parseInt(raw.match(/cost=(\d+)/i)?.[1] || '0', 10);
            if (cost >= 1 && cost <= 65535) mem.routing.ospf.interfaceCosts[iface] = cost;
            else cmdResult = { raw: '% failure: cost must be in range 1..65535' };
            if (/passive=(?:yes|true)/i.test(raw) && !mem.routing.ospf.passiveInterfaces.includes(iface)) {
              mem.routing.ospf.passiveInterfaces.push(iface);
            }
            cmdResult = { raw: '' };
          } else {
            cmdResult = { raw: '% Usage: /routing ospf interface add interface=<port> cost=<1-65535> passive=yes' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b20',
    order: 20,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/ip\s+dhcp-relay\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // MikroTik: "/ip dhcp-relay add name=relay1 interface=ether1 dhcp-server=10.0.2.1"
          const raw = rawInput.trim();
          const ifaceRaw = raw.match(/interface=(\S+)/i)?.[1];
          const server = raw.match(/dhcp-server=(\S+)/i)?.[1];
          if (ifaceRaw && server) {
            mem.dhcpRelays[resolveIfaceName(context?.ports, ifaceRaw) || ifaceRaw] = server;
            cmdResult = { raw: '' };
          } else {
            cmdResult = { raw: '% Usage: /ip dhcp-relay add interface=<port> dhcp-server=<ip>' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b22',
    order: 22,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/ipv6\s+dhcp-client\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // MikroTik: "/ipv6 dhcp-client add interface=ether1" — SLAAC/PD pada interface
          const ifaceRaw = rawInput.trim().match(/interface=(\S+)/i)?.[1];
          if (ifaceRaw) {
            const iface = resolveIfaceName(context?.ports, ifaceRaw) || ifaceRaw;
            if (!mem.ipv6DhcpClients.includes(iface)) mem.ipv6DhcpClients.push(iface);
            cmdResult = { raw: '' };
          } else {
            cmdResult = { raw: '% Usage: /ipv6 dhcp-client add interface=<port>' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b30',
    order: 30,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/interface\s+(disable|enable)\s+(\S+)/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // MikroTik: "/interface disable ether1" / "/interface enable ether1"
          const down = /^\/interface\s+disable\s+/i.test(rawInput.trim());
          const iface = resolveIfaceName(context?.ports, rawInput.trim().split(/\s+/).pop()) || '';
          setShutdownState(mem, iface, down);
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b31',
    order: 31,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/ipv6\s+address\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // MikroTik: "/ipv6 address add address=2001:db8::1/64 interface=ether1"
          const addr = rawInput.trim().match(/address=(\S+)/i)?.[1];
          const ifaceRaw = rawInput.trim().match(/interface=(\S+)/i)?.[1];
          if (addr && ifaceRaw) {
            const iface = resolveIfaceName(context?.ports, ifaceRaw) || ifaceRaw;
            mem.configuredIps6[iface] = addr;
            cmdResult = { raw: '' };
          } else {
            cmdResult = { raw: '% Usage: /ipv6 address add address=<ip/prefix> interface=<port>' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b32',
    order: 32,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/ipv6\s+route\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // MikroTik: "/ipv6 route add dst-address=2001:db8::/64 gateway=2001:db8:ff::1"
          const dst = rawInput.trim().match(/dst-address=(\S+)/i)?.[1];
          const gw = rawInput.trim().match(/gateway=(\S+)/i)?.[1];
          if (dst && gw) {
            if (!mem.routes6.some((r) => r.dst === dst)) mem.routes6.push({ dst, gateway: gw });
            cmdResult = { raw: '' };
          } else {
            cmdResult = { raw: '% Usage: /ipv6 route add dst-address=<jaringan/prefix> gateway=<gw>' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b36',
    order: 36,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/routing\s+vrrp\s+instance\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // MikroTik: "/routing vrrp instance add name=vrrp1 interface=ether1 vrid=1 priority=120 address=192.168.1.254/24"
          const raw = rawInput.trim();
          const addr = raw.match(/address=(\S+)/i)?.[1];
          const ifaceRaw = raw.match(/interface=(\S+)/i)?.[1];
          const vrid = parseInt(raw.match(/vrid=(\d+)/i)?.[1] || '1', 10);
          const priority = parseInt(raw.match(/priority=(\d+)/i)?.[1] || '100', 10);
          if (addr && ifaceRaw) {
            const iface = resolveIfaceName(context?.ports, ifaceRaw) || ifaceRaw;
            const existing = mem.fhrpGroups.findIndex((g) => g.virtualAddress === addr);
            const group = { virtualAddress: addr, interface: iface, vrid, priority };
            if (existing >= 0) mem.fhrpGroups[existing] = { ...mem.fhrpGroups[existing], ...group };
            else mem.fhrpGroups.push(group);
            cmdResult = { raw: '' };
          } else {
            cmdResult = { raw: '% Usage: /routing vrrp instance add name=<nama> interface=<port> vrid=<1-255> priority=<1-255> address=<ip/prefix>' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b56',
    order: 56,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/?(system|sys)\s+(identity|id)\s+set\s+name=(\S+)/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // MikroTik: "/system identity set name=<hostname>" / "/sys id set name=..."
          const m = rawInput.trim().match(/^\/?(?:system|sys)\s+(?:identity|id)\s+set\s+name=(\S+)/i);
          if (m) {
            mem.hostname = m[1];
            cmdResult = { raw: '' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b60',
    order: 60,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/interface\s+vlan\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // MikroTik: "/interface vlan add name=vlan10 vlan-id=10 interface=ether2"
          const raw = rawInput.trim();
          const name = raw.match(/name=(\S+)/i)?.[1];
          const idRaw = raw.match(/vlan-id=(\d+)/i)?.[1];
          const iface = raw.match(/interface=(\S+)/i)?.[1];
          const id = idRaw ? parseInt(idRaw, 10) : NaN;
          if (name && idRaw) {
            if (!(id >= 1 && id <= 4094)) {
              cmdResult = { raw: `% failure: vlan-id must be in range 1..4094 (got ${String(idRaw)})` };
            } else {
              const resolvedIface = resolveIfaceName(context?.ports, iface) || iface;
    // VLAN yang sama tidak boleh dibuat dua kali (id = identitas).
    // Pengulangan /interface vlan add dengan vlan-id sama hanya
    // memperbarui nama/interface, tidak membuat entri duplikat.
              const existing = mem.vlans.find((v) => String(v.id) === String(id));
              if (existing) {
                existing.name = name;
                existing.iface = resolvedIface;
              } else {
                mem.vlans.push({ id: String(id), name, iface: resolvedIface });
              }
    // VLAN interfaces act as subinterfaces on their parent port (router-on-a-stick)
              upsertSubinterface(mem, name, resolvedIface, id);
              cmdResult = { raw: '' };
            }
          } else {
            cmdResult = { raw: '% Usage: /interface vlan add name=<nama> vlan-id=<id> interface=<port>' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b66',
    order: 66,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/ip\s+dns\s+set\s+servers=(\S+)/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const m = rawInput.trim().match(/^\/ip\s+dns\s+set\s+servers=(\S+)/i);
          if (m) {
            mem.dnsServers = m[1].split(',').map((s: string) => s.trim()).filter(Boolean);
            cmdResult = { raw: '' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b67',
    order: 67,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/ip\s+dns\s+static\s+add\s+name=(\S+)\s+address=(\S+)/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // MikroTik: "/ip dns static add name=site.com address=203.0.113.1"
          const m = rawInput.trim().match(/^\/ip\s+dns\s+static\s+add\s+name=(\S+)\s+address=(\S+)/i);
          if (m) {
            mem.dnsRecords.push({ name: m[1].toLowerCase(), address: m[2] });
            cmdResult = { raw: '' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b68',
    order: 68,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/ip\s+dns\s+static\s+print/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'dns_static_print', records: mem.dnsRecords };
        
    return cmdResult;
  },
  },
  {
    name: 'b69',
    order: 69,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/ip\s+service\s+print/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'service_print', web: mem.webServer };
        
    return cmdResult;
  },
  },
  {
    name: 'b70',
    order: 70,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/ip\s+service\s+set\s+www\b/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // MikroTik: "/ip service set www disabled=no|yes"
          const raw = rawInput.trim();
          const disabled = /disabled=yes/i.test(raw) ? true : /disabled=no/i.test(raw) ? false : undefined;
          const enabled = /enabled=no/i.test(raw) ? false : /enabled=yes/i.test(raw) ? true : disabled === undefined ? undefined : !disabled;
          if (enabled !== undefined) {
            mem.webServer = { ...(mem.webServer || { enabled: true, port: 80, content: '' }), enabled };
            cmdResult = { raw: '' };
          } else {
            cmdResult = { raw: '% Usage: /ip service set www disabled=no|yes' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b79',
    order: 79,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/ip\s+pool\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // MikroTik: "/ip pool add name=pool1 ranges=192.168.88.100-192.168.88.200"
          const raw = rawInput.trim();
          const name = raw.match(/name=(\S+)/i)?.[1];
          const ranges = raw.match(/ranges=(\S+)/i)?.[1];
          if (name && ranges) {
            mem.dhcpPools.push({ name, range: ranges, network: ranges.split('-')[0], iface: '', gateway: '' });
            cmdResult = { raw: '' };
          } else {
            cmdResult = { raw: '% Usage: /ip pool add name=<nama> ranges=<awal>-<akhir>' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b80',
    order: 80,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/ip\s+dhcp-server\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // MikroTik: "/ip dhcp-server add name=dhcp1 interface=ether1 address-pool=pool1"
          const raw = rawInput.trim();
          const name = raw.match(/name=(\S+)/i)?.[1];
          const iface = raw.match(/interface=(\S+)/i)?.[1];
          const pool = raw.match(/address-pool=(\S+)/i)?.[1];
          const entry = mem.dhcpPools.find((p) => p.name === pool);
          if (name && iface) {
          if (entry) {
            entry.iface = resolveIfaceName(context?.ports, iface) || iface;
          } else {
              mem.dhcpPools.push({ name, range: '', network: '', iface: resolveIfaceName(context?.ports, iface) || iface, gateway: '' });
            }
            cmdResult = { raw: '' };
          } else {
            cmdResult = { raw: '% Usage: /ip dhcp-server add name=<nama> interface=<port> address-pool=<pool>' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b81',
    order: 81,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/ip\s+dhcp-server\s+set\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // MikroTik: "/ip dhcp-server set dhcp1 disabled=yes" — nonaktifkan server → tidak melayani lease
          const raw = rawInput.trim();
          const name = raw.match(/^\/ip\s+dhcp-server\s+set\s+(\S+)/i)?.[1];
          const disabled = /disabled=yes/i.test(raw) ? true : /disabled=no/i.test(raw) ? false : undefined;
          if (name && disabled !== undefined) {
            const pool = mem.dhcpPools.find((p) => p.name === name);
            if (pool) {
              pool.disabled = disabled;
              cmdResult = { raw: '' };
            } else {
              cmdResult = { raw: `% Error: dhcp-server '${String(name)}' tidak ditemukan (lihat /ip dhcp-server print)` };
            }
          } else {
            cmdResult = { raw: '% Usage: /ip dhcp-server set <nama> disabled=yes|no' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b88',
    order: 88,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/ip\s+dhcp-client\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // MikroTik: "/ip dhcp-client add interface=ether2 add-default-route=yes"
          const raw = rawInput.trim();
          const ifaceRaw = raw.match(/interface=(\S+)/i)?.[1];
          if (ifaceRaw) {
            const iface = resolveIfaceName(context?.ports, ifaceRaw) || ifaceRaw;
            const addDefaultRoute = !/add-default-route=no/i.test(raw);
            cmdResult = { raw: grantDhcpClient(context, mem, iface, addDefaultRoute) };
          } else {
            cmdResult = { raw: '% Usage: /ip dhcp-client add interface=<port> add-default-route=yes' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b92',
    order: 92,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/ip\s+firewall\s+nat\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // MikroTik:
    //   srcnat: "/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade"
    //   dstnat/port-forward: "/ip firewall nat add chain=dstnat protocol=tcp dst-port=8080 action=dst-nat to-addresses=192.168.1.10 to-ports=80"
          const raw = rawInput.trim();
          const chain = raw.match(/chain=(\S+)/i)?.[1] || 'srcnat';
          const outIface = raw.match(/out-interface=(\S+)/i)?.[1];
          const action = raw.match(/action=(\S+)/i)?.[1];
          if (action) {
            const toAddresses = raw.match(/to-addresses=(\S+)/i)?.[1];
            const toPorts = raw.match(/to-ports=(\S+)/i)?.[1];
            // RouterOS: to-addresses/to-ports hanya valid untuk aksi dst-nat (chain=dstnat)
            if (chain !== 'dstnat' && (toAddresses || toPorts)) {
              cmdResult = { raw: '% Error: to-addresses/to-ports hanya berlaku pada chain=dstnat' };
            } else if (action === 'dst-nat' && chain !== 'dstnat') {
              cmdResult = { raw: '% Error: action=dst-nat hanya berlaku pada chain=dstnat' };
            } else if (outIface && !((context?.ports ?? []).some((p: any) => String(p.name ?? '').toLowerCase() === outIface.toLowerCase()))) {
              // RouterOS: out-interface harus interface nyata pada perangkat.
              cmdResult = { raw: `% Error: no such interface ${outIface}` };
            } else {
              const rule: Record<string, string | number | boolean> = {
                chain,
                outInterface: outIface,
                action,
                srcAddress: raw.match(/src-address=(\S+)/i)?.[1] || '',
              };
              const protocol = raw.match(/protocol=(\S+)/i)?.[1];
              if (protocol) rule.protocol = protocol.toLowerCase();
              const dstAddress = raw.match(/dst-address=(\S+)/i)?.[1];
              if (dstAddress) rule.dstAddress = dstAddress;
              const dstPort = raw.match(/dst-port=(\S+)/i)?.[1];
              if (dstPort) rule.dstPort = dstPort;
              if (toAddresses) rule.toAddresses = toAddresses;
              if (toPorts) rule.toPorts = toPorts;
              mem.natRules.push(rule);
              cmdResult = { raw: '' };
            }
          } else {
            cmdResult = { raw: '% Usage: /ip firewall nat add chain=<srcnat|dstnat> out-interface=<port> action=<masquerade|dst-nat> [protocol=<tcp|udp>] [dst-port=<port>] [to-addresses=<ip>] [to-ports=<port>]' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b93',
    order: 93,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/ip\s+firewall\s+filter\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // MikroTik: "/ip firewall filter add chain=input protocol=icmp action=drop"
          const raw = rawInput.trim();
          const action = raw.match(/action=(\S+)/i)?.[1];
          if (action) {
            mem.acls.push({
              // drop → deny senyap; reject → deny + balas RST/ICMP oleh engine.
              action: action === 'drop' ? 'deny' : action === 'reject' ? 'reject' : 'permit',
              proto: raw.match(/protocol=(\S+)/i)?.[1] || 'any',
              src: raw.match(/src-address=(\S+)/i)?.[1] || 'any',
              dst: raw.match(/dst-address=(\S+)/i)?.[1] || 'any',
            });
            cmdResult = { raw: '' };
          } else {
            cmdResult = { raw: '% Usage: /ip firewall filter add chain=<chain> protocol=<proto> action=drop|accept|reject' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b108',
    order: 108,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^quit\b/i.test(rawInput.trim()) && (vendorId === 'mikrotik')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b109',
    order: 109,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/routing\s+(ospf|rip)\s+(instance|network)\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // MikroTik: "/routing ospf instance add name=x router-id=1.1.1.1" / "/routing ospf network add network=10.0.0.0/24 area=0"
          const raw = rawInput.trim();
          const m = raw.match(/^\/routing\s+(ospf|rip)\s+(instance|network)\s+add\s+/i);
          const proto = m![1].toLowerCase() as 'ospf' | 'rip';
          const kind = m![2].toLowerCase();
          if (kind === 'instance') {
            mem.routing[proto].enabled = true;
            mem.currentDhcpPool = '';
            cmdResult = { raw: '' };
          } else {
            const net = raw.match(/network=(\S+)/i)?.[1];
            if (net) {
              if (!mem.routing[proto].networks.includes(net)) mem.routing[proto].networks.push(net);
    // MikroTik: "area=<area>" pada network add — dipakai engine untuk
    // kompatibilitas adjacency OSPF (area berbeda → tidak Full).
              if (proto === 'ospf') {
                const areaRaw = raw.match(/area=(\S+)/i)?.[1];
                if (areaRaw && /^\d+$/.test(areaRaw)) {
                  if (!mem.routing.ospf.areas) mem.routing.ospf.areas = {};
                  mem.routing.ospf.areas[net] = parseInt(areaRaw, 10);
                }
              }
              cmdResult = { raw: '' };
            } else {
              cmdResult = { raw: `% Usage: /routing ${String(proto)} network add network=<jaringan/prefix>` };
            }
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b110',
    order: 110,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/routing\s+(ospf|rip)\s+(area|interface-template)\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // RouterOS v7: "/routing ospf area add name=backbone area-id=0.0.0.0" /
    // "/routing ospf interface-template add networks=10.0.0.0/30 area=backbone"
          const raw = rawInput.trim();
          const m = raw.match(/^\/routing\s+(ospf|rip)\s+(area|interface-template)\s+add\s+/i);
          const proto = m![1].toLowerCase() as 'ospf' | 'rip';
          if (!mem.routing[proto].enabled) mem.routing[proto].enabled = true;
          mem.currentDhcpPool = '';
          if (m![2] === 'interface-template') {
            const net = raw.match(/networks=(\S+)/i)?.[1];
            if (net) {
              if (!mem.routing[proto].networks.includes(net)) mem.routing[proto].networks.push(net);
            } else {
              cmdResult = { raw: '% Usage: /routing ospf interface-template add networks=<jaringan/prefix> area=<area>' };
            }
          }
          if (!cmdResult) cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b111',
    order: 111,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/routing\s+bgp\s+(?:instance|template)\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // RouterOS v6 "/routing bgp instance add as=65001 router-id=..." /
    // v7 "/routing bgp template add name=t1 as=65001 router-id=..." — ASN lokal router
          const raw = rawInput.trim();
          const as = raw.match(/\bas=(\d+)/i)?.[1];
          if (as) {
            const asn = parseInt(as, 10);
            if (asn >= 1 && asn <= 4294967295) {
              mem.bgp.asn = asn;
              const routerId = raw.match(/router-id=(\S+)/i)?.[1];
              if (routerId) mem.bgp.routerId = routerId;
              cmdResult = { raw: '' };
            } else {
              cmdResult = { raw: '% failure: invalid autonomous system number' };
            }
          } else {
            cmdResult = { raw: '% Usage: /routing bgp template add name=<nama> as=<ASN> router-id=<ip>' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b112',
    order: 112,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/routing\s+bgp\s+connection\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // RouterOS v7: "/routing bgp connection add name=conn1 remote.address=10.0.9.2 remote.as=65002"
          const raw = rawInput.trim();
          const remoteAs = raw.match(/remote\.as=(\d+)/i)?.[1];
          const remoteAddr = raw.match(/remote\.address=(\S+)/i)?.[1];
          if (remoteAs && remoteAddr) {
            const asn = parseInt(remoteAs, 10);
            if (!(asn >= 1 && asn <= 4294967295)) {
              cmdResult = { raw: '% failure: invalid autonomous system number' };
            } else {
              if (!mem.bgp.peers.some((p) => p.remoteAddr === remoteAddr)) {
                mem.bgp.peers.push({ remoteAs: asn, remoteAddr, name: remoteAddr });
              }
              cmdResult = { raw: '' };
            }
          } else {
            cmdResult = { raw: '% Usage: /routing bgp connection add name=<nama> remote.address=<ip> remote.as=<ASN>' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b113',
    order: 113,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/routing\s+bgp\s+network\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const net = rawInput.trim().match(/network=(\S+)/i)?.[1];
          if (net) {
            if (!mem.bgp.networks) mem.bgp.networks = [];
            if (!mem.bgp.networks.includes(net)) mem.bgp.networks.push(net);
            cmdResult = { raw: '' };
          } else {
            cmdResult = { raw: '% Usage: /routing bgp network add network=<jaringan/prefix>' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b119',
    order: 119,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/interface\s+bridge\s+set\s+\S+\s+protocol-mode=(\S+)/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // MikroTik: "/interface bridge set bridge1 protocol-mode=rstp|stp|none"
          const pm = (rawInput.trim().match(/protocol-mode=(\S+)/i)?.[1] || 'rstp').toLowerCase();
          mem.stp = mem.stp || { enabled: true, priority: 32768, mode: 'rstp' };
          mem.stp.enabled = pm !== 'none';
          mem.stp.mode = pm === 'stp' ? 'stp' : pm === 'mstp' ? 'mst' : 'rstp';
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b120',
    order: 120,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/interface\s+bridge\s+print/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'bridge_print', stp: mem.stp };
        
    return cmdResult;
  },
  },
  {
    name: 'b130',
    order: 130,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/interface\s+bridge\s+port\s+add\s+.*interface=(\S+)/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // MikroTik: "/interface bridge port add bridge=bridge1 interface=etherX" — bridge port is trunk-like
          const iface = rawInput.trim().match(/interface=(\S+)/i)?.[1];
          if (iface) pushTrunk(mem, resolveIfaceName(context?.ports, iface) || iface);
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b131',
    order: 131,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/interface\s+wireless\s+(print|set\s+|security-profiles|registration-table|monitor)/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // MikroTik: "/interface wireless set wlan1 ssid=NetLab band=2ghz-b mode=ap-bridge"
    //           "/interface wireless security-profiles add name=p1 wpa2-pre-shared-key=rahasia"
    //           "/interface wireless registration-table print" / monitor
          const raw = rawInput.trim();
          if (/^\/interface\s+wireless\s+security-profiles\s+add\s+/i.test(raw)) {
            const name = raw.match(/name=(\S+)/i)?.[1];
            if (name) {
              if (!mem.wirelessSecurityProfiles) mem.wirelessSecurityProfiles = {};
              mem.wirelessSecurityProfiles[name] = {
                authenticationTypes: raw.match(/authentication-types=(\S+)/i)?.[1] || 'wpa2-psk',
                key: raw.match(/wpa2-pre-shared-key=(\S+)/i)?.[1] || raw.match(/pre-shared-key=(\S+)/i)?.[1] || '',
              };
              cmdResult = { raw: '' };
            } else {
              cmdResult = { raw: '% Usage: /interface wireless security-profiles add name=<profil> authentication-types=wpa2-psk wpa2-pre-shared-key=<kunci>' };
            }
          } else if (/^\/interface\s+wireless\s+registration-table\s+print/i.test(raw)) {
            const info = recordObject(typeof context.wirelessProvider === 'function' ? context.wirelessProvider() : null);
            cmdResult = { type: 'wireless_reg_print', entries: recordArray(info ? info.associations : null) };
          } else if (/^\/interface\s+wireless\s+monitor\s+/i.test(raw)) {
            const info = recordObject(typeof context.wirelessProvider === 'function' ? context.wirelessProvider() : null);
            const assoc = recordArray(info ? info.associations : null);
            cmdResult = {
              type: 'wireless_monitor',
              mode: String(info?.mode || 'ap-bridge'),
              ssid: String(info?.ssid || '(none)'),
              signal: assoc.length > 0 ? Number(assoc[0].signal ?? -100) : -100,
              stationCount: assoc.length,
            };
          } else if (/^\/interface\s+wireless\s+set\s+/i.test(raw)) {
            const iface = raw.match(/set\s+(\S+)/i)?.[1];
            if (iface) {
              if (!mem.wireless) mem.wireless = {};
              const w = { ...(mem.wireless[iface] || {}) };
              const ssid = raw.match(/ssid=(\S+)/i)?.[1];
              const band = raw.match(/band=(\S+)/i)?.[1];
              const mode = raw.match(/mode=(\S+)/i)?.[1];
              const secProf = raw.match(/security-profile=(\S+)/i)?.[1];
              const security = raw.match(/security=(\S+)/i)?.[1];
              const key = raw.match(/key=(\S+)/i)?.[1];
              if (ssid) w.ssid = ssid;
              if (band) w.band = band;
              if (mode) w.mode = mode;
              if (secProf) w.securityProfile = secProf;
              if (security) w.security = security;
              if (key) w.key = key;
              mem.wireless[iface] = w;
              cmdResult = { raw: '' };
            } else {
              cmdResult = { raw: '% Usage: /interface wireless set <interface> ssid=<nama>' };
            }
          } else {
            cmdResult = { type: 'wireless_print', wireless: mem.wireless };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b135',
    order: 135,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/queue\s+simple\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // MikroTik: "/queue simple add name=q1 target=192.168.1.0/24 max-limit=10M/10M"
          const raw = rawInput.trim();
          const name = raw.match(/name=(\S+)/i)?.[1];
          if (name) {
            if (!mem.queues) mem.queues = [];
            mem.queues.push({
              name,
              target: raw.match(/target=(\S+)/i)?.[1] || '',
              maxLimit: raw.match(/max-limit=(\S+)/i)?.[1] || '',
            });
            cmdResult = { raw: '' };
          } else {
            cmdResult = { raw: '% Usage: /queue simple add name=<nama> target=<jaringan> max-limit=<limit>' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b137',
    order: 137,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/ip\s+firewall\s+mangle\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // MikroTik: "/ip firewall mangle add chain=prerouting protocol=icmp action=mark-packet new-packet-mark=voice"
          const raw = rawInput.trim();
          if (!mem.mangleRules) mem.mangleRules = [];
          mem.mangleRules.push({
            chain: raw.match(/chain=(\S+)/i)?.[1] || 'prerouting',
            protocol: raw.match(/protocol=(\S+)/i)?.[1] || '',
            srcAddress: raw.match(/src-address=(\S+)/i)?.[1] || '',
            dstAddress: raw.match(/dst-address=(\S+)/i)?.[1] || '',
            action: raw.match(/action=(\S+)/i)?.[1] || 'mark-packet',
            newPacketMark: raw.match(/new-packet-mark=(\S+)/i)?.[1] || '',
            packetMark: raw.match(/packet-mark=(\S+)/i)?.[1] || '',
            newMss: raw.match(/new-mss=(\S+)/i)?.[1] || '',
          });
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b139',
    order: 139,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^\/routing\s+(ospf|rip|bgp)\s+(?:instance|network)?\s*print/i.test(rawInput.trim()) && !/peer/i.test(rawInput.trim()) && vendorId === 'mikrotik'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'proto_print', routing: mem.routing, bgp: mem.bgp };
        
    return cmdResult;
  },
  },
];

registerEntries('mikrotik', mikrotikEntries);


