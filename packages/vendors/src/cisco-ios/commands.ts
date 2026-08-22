// GENERATED — branch handler vendor cisco-ios (diekstraksi dari dispatch() lama).
import type { CommandResult, ChainEntry, ChainEnv } from '../common/types';
import { registerEntries } from '../common/chain';
import { recordArray, recordObject } from '../common/types';

import { upsertSubinterface, setShutdownState, grantDhcpClient, pushTrunk } from '../common/state';
import { resolveIfaceName, wildcardToCidr, isContiguousMask, isValidIpv4, isValidIpv6RouteDst, isValidRouteGateway } from '../common/ip';

export const ciscoiosEntries: ChainEntry[] = [
  {
    name: 'b12',
    order: 12,
    vendors: 'all',
    cap: 'vlan',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^encapsulation\s+dot1q\s+(\d+)/i.test(rawInput.trim()) && mem.currentIface && /\.\d+$/.test(mem.currentIface) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco subinterface: "encapsulation dot1q 10"
          const vlanId = parseInt(rawInput.trim().match(/^encapsulation\s+dot1q\s+(\d+)/i)?.[1] || '1', 10);
          upsertSubinterface(mem, mem.currentIface, String(mem.currentIface).replace(/\.\d+$/, ''), vlanId);
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b14',
    order: 14,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^(no\s+)?shut(down)?$/i.test(rawInput.trim()) && mem.currentIface && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba' || vendorId === 'huawei')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco/Huawei: "shutdown"/"shut" / "no shutdown"/"no shut" (interface view) — administratively down/up
          const down = !/^no\s+/i.test(rawInput.trim());
          setShutdownState(mem, mem.currentIface, down);
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b15',
    order: 15,
    vendors: 'all',
    cap: 'ospf',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^(?:ip\s+)?ospf\s+cost\s+(\d+)/i.test(rawInput.trim()) && mem.currentIface && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba' || vendorId === 'huawei')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco/Huawei: "ip ospf cost <n>" (interface view) — cost interface OSPF
          const cost = parseInt(rawInput.trim().match(/^(?:ip\s+)?ospf\s+cost\s+(\d+)/i)?.[1] || '0', 10);
          if (cost >= 1 && cost <= 65535) {
            mem.routing.ospf.interfaceCosts[mem.currentIface] = cost;
            cmdResult = { raw: '' };
          } else {
            cmdResult = { raw: '% Range of values is 1 to 65535' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b16',
    order: 16,
    vendors: 'all',
    cap: 'ospf',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^passive-interface\s+(\S+)/i.test(rawInput.trim()) && mem.currentProto === 'ospf' && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco: "passive-interface <iface>" (router ospf view) — tidak membentuk adjacency
          const iface = resolveIfaceName(context?.ports, rawInput.trim().match(/^passive-interface\s+(\S+)/i)?.[1] || '') || '';
          if (iface && !mem.routing.ospf.passiveInterfaces.includes(iface)) {
            mem.routing.ospf.passiveInterfaces.push(iface);
          }
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b21',
    order: 21,
    vendors: 'all',
    cap: 'dhcp',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^ip\s+helper-address\s+(\d+\.\d+\.\d+\.\d+)/i.test(rawInput.trim()) && mem.currentIface && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco: "ip helper-address <ip>" (interface view) — DHCP relay
          mem.dhcpRelays[mem.currentIface] = rawInput.trim().match(/^ip\s+helper-address\s+(\d+\.\d+\.\d+\.\d+)/i)?.[1] || '';
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b23',
    order: 23,
    vendors: 'all',
    cap: 'ipv6',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^ipv6\s+address\s+(?:autoconfig|dhcp)/i.test(rawInput.trim()) && mem.currentIface && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba' || vendorId === 'huawei')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco/Huawei: "ipv6 address autoconfig" (interface view) — SLAAC
          if (!mem.ipv6DhcpClients.includes(mem.currentIface)) mem.ipv6DhcpClients.push(mem.currentIface);
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b24',
    order: 24,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^switchport\s+port-security$/i.test(rawInput.trim()) && mem.currentIface && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco: "switchport port-security" (interface view) — aktifkan port security (max default 1)
          const cur = mem.portSecurity[mem.currentIface] || {};
          mem.portSecurity[mem.currentIface] = { ...cur, limit: cur.limit || 1, sticky: !!cur.sticky };
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b25',
    order: 25,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^switchport\s+port-security\s+maximum\s+(\d+)/i.test(rawInput.trim()) && mem.currentIface && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const m = rawInput.trim().match(/^switchport\s+port-security\s+maximum\s+(\d+)/i);
          const limit = parseInt(m?.[1] || '1', 10);
          if (limit >= 1 && limit <= 132) {
            const cur = mem.portSecurity[mem.currentIface] || {};
            mem.portSecurity[mem.currentIface] = { ...cur, limit, sticky: !!cur.sticky };
            cmdResult = { raw: '' };
          } else {
            cmdResult = { raw: '% Error: the number of secure MAC addresses is out of range (1-132)' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b26',
    order: 26,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^switchport\s+port-security\s+mac-address\s+sticky/i.test(rawInput.trim()) && mem.currentIface && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const cur = mem.portSecurity[mem.currentIface] || {};
          mem.portSecurity[mem.currentIface] = { ...cur, sticky: true, limit: cur.limit || 1 };
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b27',
    order: 27,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^switchport\s+port-security\s+mac-address\s+(\S+)/i.test(rawInput.trim()) && mem.currentIface && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco: "switchport port-security mac-address aaaa.bbbb.cccc" — secure MAC statis
    // 6-byte (format Cisco aaaa.bbbb.cccc / xx:xx:xx:xx:xx:xx / xx-xx-xx-xx-xx-xx).
          const raw = rawInput.trim();
          const mac = raw.match(/mac-address\s+(\S+)/i)?.[1] || '';
          const clean = mac.replace(/[.:-]/g, '');
          if (!/^[0-9a-fA-F]{12}$/.test(clean)) {
            cmdResult = { raw: '% Error: invalid MAC address format, gunakan aaaa.bbbb.cccc' };
          } else {
            const cur = mem.portSecurity[mem.currentIface] || {};
            const secureMacs = cur.secureMacs || [];
            const normalized = clean.toLowerCase().match(/.{4}/g)!.join('.');
            if (!secureMacs.includes(normalized)) secureMacs.push(normalized);
            mem.portSecurity[mem.currentIface] = { ...cur, secureMacs, limit: cur.limit || 1, sticky: !!cur.sticky };
            cmdResult = { raw: '' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b28',
    order: 28,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^no\s+switchport\s+port-security\s+mac-address\s+(\S+)/i.test(rawInput.trim()) && mem.currentIface && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco: "no switchport port-security mac-address aaaa.bbbb.cccc" — hapus secure MAC
          const raw = rawInput.trim();
          const mac = raw.match(/mac-address\s+(\S+)/i)?.[1] || '';
          const clean = mac.replace(/[.:-]/g, '');
          if (!/^[0-9a-fA-F]{12}$/.test(clean)) {
            cmdResult = { raw: '% Error: invalid MAC address format, gunakan aaaa.bbbb.cccc' };
          } else {
            const cur = mem.portSecurity[mem.currentIface] || {};
            const secureMacs = (cur.secureMacs || []).filter((x: string) => x !== clean.toLowerCase().match(/.{4}/g)!.join('.'));
            mem.portSecurity[mem.currentIface] = { ...cur, secureMacs };
            cmdResult = { raw: '' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b29',
    order: 29,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^switchport\s+port-security\s+violation\s+(\S+)/i.test(rawInput.trim()) && mem.currentIface && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const mode = rawInput.trim().match(/^switchport\s+port-security\s+violation\s+(\S+)/i)?.[1]?.toLowerCase() || 'restrict';
          const cur = mem.portSecurity[mem.currentIface] || {};
          mem.portSecurity[mem.currentIface] = { ...cur, violation: mode, limit: cur.limit || 1, sticky: !!cur.sticky };
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b33',
    order: 33,
    vendors: 'all',
    cap: 'ipv6',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/(?:^ipv6\s+address\s+)(\S+)/i.test(rawInput.trim()) && mem.currentIface && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba' || vendorId === 'huawei')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco/Huawei: "ipv6 address 2001:db8::1/64" (interface view)
          const addr = rawInput.trim().match(/^ipv6\s+address\s+(\S+)/i)?.[1];
          if (addr) {
            mem.configuredIps6[mem.currentIface] = addr;
            cmdResult = { raw: '' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b34',
    order: 34,
    vendors: 'all',
    cap: 'ipv6',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^ipv6\s+route\s+(\S+)\s+(\S+)/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco: "ipv6 route 2001:db8:2::/64 2001:db8:ff::2"
          const m = rawInput.trim().match(/^ipv6\s+route\s+(\S+)\s+(\S+)/i);
          if (m) {
            if (!isValidIpv6RouteDst(String(m[1])) || !isValidRouteGateway(String(m[2]))) {
              cmdResult = { raw: `% Invalid input detected at '^' marker.\n% Error: invalid IPv6 route "${String(m[1])} ${String(m[2])}"` };
            } else {
              if (!mem.routes6.some((r) => r.dst === m![1] && r.gateway === m![2])) mem.routes6.push({ dst: m[1], gateway: m[2] });
              cmdResult = { raw: '' };
            }
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b37',
    order: 37,
    vendors: 'all',
    cap: 'vrrp',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^(vrrp|standby)\s+(\d+)\s+ip\s+(\S+)/i.test(rawInput.trim()) && mem.currentIface && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco: "vrrp 1 ip 192.168.1.254" / "standby 1 ip 192.168.1.254" (interface view)
          const m = rawInput.trim().match(/^(vrrp|standby)\s+(\d+)\s+ip\s+(\S+)/i);
          if (m) {
            const addr = m[3];
            const vrid = parseInt(m[2], 10);
            const existing = mem.fhrpGroups.findIndex((g) => g.virtualAddress === addr || (g.vrid === vrid && g.interface === mem.currentIface));
            const group = { virtualAddress: `${String(addr)}/24`, interface: mem.currentIface, vrid, priority: 100 };
            if (existing >= 0) mem.fhrpGroups[existing] = { ...mem.fhrpGroups[existing], virtualAddress: `${String(addr)}/24` };
            else mem.fhrpGroups.push(group);
            cmdResult = { raw: '' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b38',
    order: 38,
    vendors: 'all',
    cap: 'vrrp',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^(vrrp|standby)\s+(\d+)\s+priority\s+(\d+)/i.test(rawInput.trim()) && mem.currentIface && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco: "vrrp 1 priority 120" / "standby 1 priority 120" (interface view)
          const m = rawInput.trim().match(/^(vrrp|standby)\s+(\d+)\s+priority\s+(\d+)/i);
          if (m) {
            const vrid = parseInt(m[2], 10);
            const priority = parseInt(m[3], 10);
            const g = mem.fhrpGroups.find((x) => x.vrid === vrid && x.interface === mem.currentIface);
            if (g) g.priority = priority;
            else mem.fhrpGroups.push({ virtualAddress: '0.0.0.0/24', interface: mem.currentIface, vrid, priority });
            cmdResult = { raw: '' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b48',
    order: 48,
    vendors: 'all',
    cap: 'staticRoute',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => ((vendorId === 'cisco_ios' || vendorId === 'aruba' || vendorId === 'cisco_nxos') && /^ip\s+route\s+\S+\s+\S+\s+\S+/i.test(rawInput.trim())),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // IOS-style: "ip route 0.0.0.0 0.0.0.0 <gateway>"
          const m = rawInput.trim().match(/^ip\s+route\s+(\S+)\s+(\S+)\s+(\S+)/i);
          if (m) {
            const dstOk = isValidIpv4(String(m[1])) && isContiguousMask(String(m[2]));
            const gwOk = isValidIpv4(String(m[3]));
            if (!dstOk) {
              cmdResult = { raw: `% Invalid input detected at '^' marker.\n% Error: invalid route destination "${String(m[1])} ${String(m[2])}"` };
            } else if (!gwOk) {
              cmdResult = { raw: `% Invalid input detected at '^' marker.\n% Error: invalid gateway "${String(m[3])}"` };
            } else {
              mem.routes.push({ dst: `${String(m[1])} ${String(m[2])}`, gateway: m[3], distance: 1 });
              cmdResult = { raw: '' };
            }
          } else {
            cmdResult = { raw: '% Usage: ip route <dst> <mask> <gateway>' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b54',
    order: 54,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^hostname\s+(\S+)/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'aruba' || vendorId === 'cisco_nxos')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // IOS-style: "hostname <name>" (Cisco IOS, NX-OS, Aruba)
          const m = rawInput.trim().match(/^hostname\s+(\S+)/i);
          if (m) {
            mem.hostname = m[1];
            cmdResult = { raw: '' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b61',
    order: 61,
    vendors: 'all',
    cap: 'vlan',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^vlan\s+(\d+)/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco IOS / NX-OS / Aruba: "vlan <id>" (+ optional "name <x>")
    // Masuk ke VLAN config view: `name <x>` berikutnya mengubah VLAN ini.
          const m = rawInput.trim().match(/^vlan\s+(\d+)/i);
          if (m) {
            const idRaw = m[1];
            const idNum = parseInt(idRaw, 10);
            if (!(idNum >= 1 && idNum <= 4094)) {
              cmdResult = { raw: `% Invalid input detected at '^' marker.\n% VLAN ID must be in range 1..4094` };
            } else {
              const id = idRaw;
              const nameMatch = rawInput.trim().match(/name\s+(\S+)/i);
              const existing = mem.vlans.find((v) => v.id === id);
              if (existing) existing.name = nameMatch?.[1] || existing.name;
              else mem.vlans.push({ id, name: nameMatch?.[1] || `VLAN${String(id)}` });
              mem.currentVlan = id;
              cmdResult = { raw: '' };
            }
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b63',
    order: 63,
    vendors: 'all',
    cap: 'vlan',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^name\s+(\S+)/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba' || vendorId === 'huawei')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco / Huawei: "name <x>" — nama VLAN dalam VLAN config view
    // (`vlan <id>` dulu). Tanpa view → error jujur (name bukan perintah
    // global config). Tidak pernah membuat VLAN baru / menyentuh interface.
          const m = rawInput.trim().match(/^name\s+(\S+)/i);
          if (m) {
            if (!mem.currentVlan) {
              cmdResult = {
                raw: vendorId === 'huawei'
                  ? '% Error: Unrecognized command found at \'^\' position.'
                  : `% Invalid input detected at '^' marker.\n% name is valid only inside a VLAN configuration view (vlan <id> first)`,
              };
            } else {
              const v = mem.vlans.find((v) => String(v.id) === String(mem.currentVlan));
              if (!v) {
                mem.currentVlan = '';
                cmdResult = { raw: '% Error: VLAN no longer exists (vlan <id> again to recreate it)' };
              } else {
                v.name = m[1];
                cmdResult = { raw: '' };
              }
            }
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b76',
    order: 76,
    vendors: 'all',
    cap: 'dns',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^ip\s+name-server\s+(\S+)/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const m = rawInput.trim().match(/^ip\s+name-server\s+(\S+)/i);
          if (m) {
            mem.dnsServers = m[1].split(/\s+/).filter(Boolean);
            cmdResult = { raw: '' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b82',
    order: 82,
    vendors: 'all',
    cap: 'dhcp',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^ip\s+dhcp\s+excluded-address\s+(\d+\.\d+\.\d+\.\d+)/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco: "ip dhcp excluded-address 10.0.0.50 [10.0.0.60]" — alamat tidak dilease ke siapa pun
          const m = rawInput.trim().match(/^ip\s+dhcp\s+excluded-address\s+(\d+\.\d+\.\d+\.\d+)(?:\s+(\d+\.\d+\.\d+\.\d+))?/i);
          if (m) {
            const excl = mem.dhcpExcluded || (mem.dhcpExcluded = []);
            excl.push(m[1]);
            if (m[2]) excl.push(m[2]);
            cmdResult = { raw: '' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b83',
    order: 83,
    vendors: 'all',
    cap: 'dhcp',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^ip\s+dhcp\s+pool\s+(\S+)/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco: "ip dhcp pool <nama>" — selanjutnya "network" & "default-router"
          const m = rawInput.trim().match(/^ip\s+dhcp\s+pool\s+(\S+)/i);
          if (m) {
            const name = m[1];
            mem.dhcpPools.push({ name, range: '', network: '', iface: '', gateway: '' });
            mem.currentDhcpPool = name;
            cmdResult = { raw: '' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b84',
    order: 84,
    vendors: 'all',
    cap: 'dhcp',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^network\s+(\S+)\s+(\S+)/i.test(rawInput.trim()) && mem.currentDhcpPool && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const m = rawInput.trim().match(/^network\s+(\S+)\s+(\S+)/i);
          const pool = mem.dhcpPools.find((p) => p.name === mem.currentDhcpPool);
          if (m && pool) {
            pool.network = `${String(m[1])} ${String(m[2])}`;
            cmdResult = { raw: '' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b85',
    order: 85,
    vendors: 'all',
    cap: 'dhcp',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^default-router\s+(\S+)/i.test(rawInput.trim()) && mem.currentDhcpPool && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const m = rawInput.trim().match(/^default-router\s+(\S+)/i);
          const pool = mem.dhcpPools.find((p) => p.name === mem.currentDhcpPool);
          if (m && pool) {
            pool.gateway = m[1];
            cmdResult = { raw: '' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b85r',
    order: 85,
    vendors: 'all',
    cap: 'dhcp',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^host\s+(\S+)\s+(\S+)/i.test(rawInput.trim()) && mem.currentDhcpPool && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco: reservasi statis — "host <ip> <mask>" (fixed-address) +
    // "hardware-address <mac>" di dalam pool → IP itu selalu untuk MAC itu.
          const m = rawInput.trim().match(/^host\s+(\S+)\s+(\S+)/i);
          const pool = mem.dhcpPools.find((p) => p.name === mem.currentDhcpPool);
          if (m && pool) {
            pool.host = m[1];
            pool.reservations = pool.reservations || [];
            cmdResult = { raw: '' };
          } else {
            cmdResult = { raw: '% Usage: host <ip> <netmask>' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b85s',
    order: 85,
    vendors: 'all',
    cap: 'dhcp',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^hardware-address\s+(\S+)/i.test(rawInput.trim()) && mem.currentDhcpPool && mem.dhcpPools.some((p) => p.name === mem.currentDhcpPool && p.host) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const m = rawInput.trim().match(/^hardware-address\s+(\S+)/i);
          const pool = mem.dhcpPools.find((p) => p.name === mem.currentDhcpPool);
          if (m && pool && pool.host) {
            const resv = (pool.reservations as { mac: string; ip: string }[] | undefined) || [];
            resv.push({ mac: m[1], ip: String(pool.host) });
            pool.reservations = resv;
            cmdResult = { raw: '' };
          } else {
            cmdResult = { raw: '% Usage: hardware-address <mac> (butuhkan "host <ip> <mask>" dulu)' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b87',
    order: 87,
    vendors: 'all',
    cap: 'dns',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^ip\s+host\s+(\S+)\s+(\d+\.\d+\.\d+\.\d+)/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba' || vendorId === 'huawei')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco/Aruba/Huawei: "ip host <nama> <ip>" — DNS static record
          const m = rawInput.trim().match(/^ip\s+host\s+(\S+)\s+(\d+\.\d+\.\d+\.\d+)/i);
          if (m) {
            mem.dnsRecords.push({ name: m[1].toLowerCase(), address: m[2] });
            cmdResult = { raw: '' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b90',
    order: 90,
    vendors: 'all',
    cap: 'dhcp',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => ((vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba' || vendorId === 'huawei') && /^ip\s+address\s+dhcp/i.test(rawInput.trim())),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco/Huawei: "ip address dhcp" di dalam interface view → DHCP client
          if (mem.currentIface) {
            cmdResult = { raw: grantDhcpClient(context, mem, mem.currentIface, true) };
          } else {
            cmdResult = { raw: '% Error: enter interface view first (interface <name>)' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b96',
    order: 96,
    vendors: 'all',
    cap: 'firewall',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^access-list\s+\d+\s+(permit|deny)\b/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco: "access-list <id> permit|deny <proto> <src> [src-wildcard] [src-port] <dst> [dst-wildcard] [dst-port]"
    // Wildcard 0.0.0.255 dst → CIDR (192.168.1.0/24) agar engine bisa mencocokkan subnet.
          const m = rawInput.trim().match(/^access-list\s+(\d+)\s+(permit|deny)\s+(.*)$/i);
          if (m) {
            const id = parseInt(m[1], 10);
            const tokens = m[3].trim().split(/\s+/).filter(Boolean);
            let proto = 'ip';
            if (tokens.length > 0 && /^(ip|icmp|tcp|udp|any)$/i.test(tokens[0])) proto = tokens.shift()!.toLowerCase();
    
    // Wildcard valid: 0.0.0.0 (host), 0.0.0.255 (CANONICAL /24!),
    // 0.0.x.255, 0.x.255.255, x.255.255.255, serta pola parsial
    // 2^n-1 / 256-2^n (mis. 0.0.0.1, 0.0.0.127, 0.0.0.254).
            const isWildcard = (s: string): boolean => {
              if (!/^\d+\.\d+\.\d+\.\d+$/.test(s)) return false;
              const os = s.split('.').map(Number);
              if (os.some((o) => o < 0 || o > 255)) return false;
              if (s === '0.0.0.0' || s === '255.255.255.255') return true;
              const octetOk = (o: number): boolean => {
                if (o === 0 || o === 255) return true;
                // 2^n - 1 (1,3,7,15,31,63,127)
                if ((o & (o + 1)) === 0) return true;
                // 256 - 2^n (128,192,224,240,248,252,254)
                if ((o | (o - 1)) === 255) return true;
                return false;
              };
              return os.every(octetOk) && os.some((o) => o !== 0);
            };
            const wildcardToCidr = (ip: string, wc: string): string => {
              if (!wc || wc === '0.0.0.0' || wc === '255.255.255.255' || ip === 'any') return ip;
              const bits = wc.split('.').map(Number).reduce((acc, o) => acc + (o.toString(2).match(/1/g) || []).length, 0);
              return `${String(ip)}/${String(32 - bits)}`;
            };
            const readEndpoint = (): { ip: string; port: string } => {
              let ip = 'any';
              if (tokens[0]?.toLowerCase() === 'any') {
                tokens.shift();
              } else if (tokens[0]?.toLowerCase() === 'host') {
                tokens.shift();
                ip = tokens.shift() || 'any';
              } else if (tokens.length > 0) {
                ip = tokens.shift()!;
              }
              if (tokens[0] && isWildcard(tokens[0])) ip = wildcardToCidr(ip, tokens.shift()!);
              let port = '';
              if (tokens[0] && /^(eq|gt|lt|ne)\s*$/i.test(tokens[0])) {
                tokens.shift();
                port = tokens.shift() || '';
              } else if (tokens[0] && /^\d+$/.test(tokens[0])) {
                port = tokens.shift()!;
              } else if (tokens[0]?.toLowerCase() === 'range') {
                tokens.shift();
                const a = tokens.shift() || '';
                const b = tokens.shift() || '';
                port = `${String(a)}-${String(b)}`;
              }
              return { ip, port };
            };
    
            const srcEp = readEndpoint();
            const dstEp = readEndpoint();
    // sisa token (mis. "log") diabaikan.
            if (id < 100 && proto === 'ip') {
              if (!mem.natAcls) mem.natAcls = {};
              mem.natAcls[String(id)] = { action: m[2].toLowerCase(), src: srcEp.ip, dst: dstEp.ip, wildcard: '0.0.0.0' };
            } else {
              const rule: Record<string, string | number | boolean> = {
                aclId: id,
                action: m[2].toLowerCase() as 'permit' | 'deny',
                proto,
                src: srcEp.ip,
                dst: dstEp.ip,
              };
              if (srcEp.port) rule.srcPort = srcEp.port;
              if (dstEp.port) rule.dstPort = dstEp.port;
              mem.acls.push(rule);
            }
            cmdResult = { raw: '' };
          } else {
            cmdResult = { raw: '% Usage: access-list <id> permit|deny <proto> <src> <dst>' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b97',
    order: 97,
    vendors: 'all',
    cap: 'nat',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^ip\s+nat\s+(inside|outside)$/i.test(rawInput.trim()) && mem.currentIface && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco: "ip nat inside|outside" (interface view) — tandai arah NAT
          const dir = rawInput.trim().match(/^ip\s+nat\s+(inside|outside)$/i)?.[1]?.toLowerCase();
          if (!mem.natInsideIfaces) mem.natInsideIfaces = [];
          if (!mem.natOutsideIfaces) mem.natOutsideIfaces = [];
          if (dir === 'inside' && !mem.natInsideIfaces.includes(mem.currentIface)) mem.natInsideIfaces.push(mem.currentIface);
          if (dir === 'outside' && !mem.natOutsideIfaces.includes(mem.currentIface)) mem.natOutsideIfaces.push(mem.currentIface);
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b98',
    order: 98,
    vendors: 'all',
    cap: 'nat',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^ip\s+nat\s+inside\s+source\s+list\s+\d+\s+interface\s+\S+\s+overload/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco: "ip nat inside source list <acl> interface <out-iface> overload" → masquerade
          const m = rawInput.trim().match(/^ip\s+nat\s+inside\s+source\s+list\s+(\d+)\s+interface\s+(\S+)\s+overload/i);
          if (m) {
            const outIface = resolveIfaceName(context?.ports, m[2]) || m[2];
            const acl = recordObject((mem.natAcls || {})[m[1]]);
            if (!mem.natOutsideIfaces) mem.natOutsideIfaces = [];
            if (!mem.natOutsideIfaces.includes(outIface)) mem.natOutsideIfaces.push(outIface);
            mem.natRules.push({
              chain: 'srcnat',
              action: 'masquerade',
              outInterface: outIface,
              srcAddress: acl?.src && acl.src !== 'any' ? String(acl.src) : '',
            });
            cmdResult = { raw: '' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b99',
    order: 99,
    vendors: 'all',
    cap: 'nat',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^ip\s+nat\s+inside\s+source\s+static\s+tcp\s+\S+\s+\d+\s+\S+\s+\d+/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco: "ip nat inside source static tcp <inside-ip> <inside-port> <public-ip> <public-port>" → dstnat
          const m = rawInput.trim().match(/^ip\s+nat\s+inside\s+source\s+static\s+tcp\s+(\S+)\s+(\d+)\s+(\S+)\s+(\d+)/i);
          if (m) {
            mem.natRules.push({
              chain: 'dstnat',
              action: 'dst-nat',
              protocol: 'tcp',
              dstAddress: m[3],
              dstPort: m[4],
              toAddresses: m[1],
              toPorts: m[2],
            });
            cmdResult = { raw: '' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b101',
    order: 101,
    vendors: 'all',
    cap: 'ospf',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^router\s+ospf\b/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco: "router ospf 1" — process id, BUKAN router-id (router-id diatur
    // lewat perintah "router-id x.x.x.x"). Tidak boleh menimpa router-id dari
    // nomor proses.
          const proto = 'ospf' as const;
          mem.routing[proto].enabled = true;
          mem.currentProto = proto;
          mem.currentDhcpPool = '';
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b101b',
    order: 101,
    vendors: 'all',
    cap: 'rip',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^router\s+rip\b/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco: "router rip"
          const proto = 'rip' as const;
          mem.routing[proto].enabled = true;
          mem.currentProto = proto;
          mem.currentDhcpPool = '';
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b101c',
    order: 101,
    vendors: 'all',
    cap: 'eigrp',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^router\s+eigrp\b/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco: "router eigrp 100"
          const proto = 'eigrp' as const;
          const asn = rawInput.trim().match(/\beigrp\s+(\d+)/i)?.[1];
          mem.routing[proto].enabled = true;
          if (asn) mem.routing.eigrp.asn = parseInt(asn, 10);
          mem.currentProto = proto;
          mem.currentDhcpPool = '';
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b102',
    order: 102,
    vendors: 'all',
    cap: 'bgp',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^network\s+(\d+\.\d+\.\d+\.\d+)\s+mask\s+(\d+\.\d+\.\d+\.\d+)$/i.test(rawInput.trim()) && mem.currentProto === 'bgp' && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco BGP: "network 10.0.0.0 mask 255.255.255.0" (router bgp <asn> mode)
          const m = rawInput.trim().match(/^network\s+(\d+\.\d+\.\d+\.\d+)\s+mask\s+(\d+\.\d+\.\d+\.\d+)$/i);
          if (m) {
            if (!mem.bgp.networks) mem.bgp.networks = [];
            const entry = `${String(m[1])} ${String(m[2])}`;
            if (!mem.bgp.networks.includes(entry)) mem.bgp.networks.push(entry);
            cmdResult = { raw: '' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b103',
    order: 103,
    vendors: 'all',
    cap: 'ospf',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^network\s+\d+\.\d+\.\d+\.\d+(?:\/\d{1,2})?(?:\s+\d+\.\d+\.\d+\.\d+)?(?:\s+area\s+\S+)?$/i.test(rawInput.trim()) && mem.currentProto && mem.currentProto !== 'bgp' && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba' || vendorId === 'huawei')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco/Huawei: "network 10.0.0.0 0.0.0.255 area 0" / "network 10.0.0.0/24" / "network 192.168.0.0" (RIP)
          const m = rawInput.trim().match(/^network\s+(\d+\.\d+\.\d+\.\d+(?:\/\d{1,2})?)(?:\s+(\d+\.\d+\.\d+\.\d+))?(?:\s+area\s+(\S+))?/i);
          if (m) {
            const net = m[2] ? `${String(m[1])} ${String(m[2])}` : m[1];
            const areaRaw = m[3] || (vendorId === 'huawei' && mem.currentOspfArea >= 0 && mem.currentProto === 'ospf' ? String(mem.currentOspfArea) : null);
            const entry = (vendorId === 'huawei' && mem.currentOspfArea >= 0 && mem.currentProto === 'ospf')
              ? `${String(net)} area ${String(mem.currentOspfArea)}`
              : net;
            if (!mem.routing[mem.currentProto].networks.includes(entry)) {
              mem.routing[mem.currentProto].networks.push(entry);
            }
    // Area per-network (Cisco/Huawei "area N"): dipakai engine untuk
    // kompatibilitas adjacency (area berbeda → tidak pernah Full).
            if (areaRaw !== null && mem.currentProto === 'ospf') {
              const areaId = /^\d+$/.test(areaRaw) ? parseInt(areaRaw, 10) : areaRaw;
              if (!mem.routing.ospf.areas) mem.routing.ospf.areas = {};
              mem.routing.ospf.areas[net] = typeof areaId === 'number' ? areaId : (mem.routing.ospf.areas[net] ?? 0);
            }
            cmdResult = { raw: '' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b107',
    order: 107,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^(?:exit|end)\b/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco: "exit" / "end" — keluar dari interface/protocol/vlan view; konfigurasi sudah tersimpan
          mem.currentProto = '';
          mem.currentDhcpSection = '';
          mem.currentAclId = '';
          mem.currentVlan = '';
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b114',
    order: 114,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^spanning-tree\s+mode\s+(\S+)/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco: "spanning-tree mode rstp|pvst|rapid-pvst|mst"
          const mode = (rawInput.trim().match(/^spanning-tree\s+mode\s+(\S+)/i)?.[1] || 'rstp').toLowerCase();
          mem.stp = mem.stp || { enabled: true, priority: 32768, mode: 'rstp' };
          mem.stp.enabled = true;
          mem.stp.mode = ['pvst', 'rapid-pvst', 'mst', 'stp', 'rstp'].includes(mode) ? mode : 'rstp';
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b115',
    order: 115,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^no\s+spanning-tree/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco: "no spanning-tree" → matikan STP
          mem.stp = mem.stp || { enabled: true, priority: 32768, mode: 'rstp' };
          mem.stp.enabled = false;
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b116',
    order: 116,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^spanning-tree\s+vlan\s+\d+\s+priority\s+\d+/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco: "spanning-tree vlan 1 priority 4096"
          const m = rawInput.trim().match(/^spanning-tree\s+vlan\s+\d+\s+priority\s+(\d+)/i);
          const p = m ? parseInt(m[1], 10) : NaN;
          if (p >= 0 && p <= 61440 && p % 4096 === 0) {
            mem.stp = mem.stp || { enabled: true, priority: 32768, mode: 'rstp' };
            mem.stp.priority = p;
            mem.stp.enabled = true;
            cmdResult = { raw: '' };
          } else {
            cmdResult = { raw: '% Error: Priority must be a multiple of 4096 in range 0..61440' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b118',
    order: 118,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^spanning-tree\b/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco: "spanning-tree portfast"/"spanning-tree uplinkfast" → diterima (simplifikasi)
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b125',
    order: 125,
    vendors: 'all',
    cap: 'vlan',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^switchport\s+(mode\s+access|access\s+vlan\s+\d+)$/i.test(rawInput.trim()) && mem.currentIface && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco switch: "switchport mode access" / "switchport access vlan 10"
          const vlan = rawInput.trim().match(/access\s+vlan\s+(\d+)/i)?.[1];
          if (vlan) {
            const v = parseInt(vlan, 10);
            if (!(v >= 1 && v <= 4094)) {
              cmdResult = { raw: `% Invalid input detected at '^' marker.\n% VLAN ID must be in range 1..4094` };
            } else {
              mem.portVlans[mem.currentIface] = v;
              if (rawInput.trim().match(/mode\s+access/i)) {
                mem.trunkPorts = (mem.trunkPorts || []).filter((t: string) => t !== mem.currentIface);
              }
              cmdResult = { raw: '' };
            }
          } else {
            mem.trunkPorts = (mem.trunkPorts || []).filter((t: string) => t !== mem.currentIface);
            cmdResult = { raw: '' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b126',
    order: 126,
    vendors: 'all',
    cap: 'vlan',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^switchport\s+trunk\s+(allowed\s+vlan|native\s+vlan)/i.test(rawInput.trim()) && mem.currentIface && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco switch: "switchport trunk allowed vlan <list>" / "switchport trunk native vlan <id>"
    // List: "10,20-25", "all", "none" (IOS). Nilai disimpan ke mem.trunkAllowed /
    // mem.trunkNative dan disinkronkan ke engine (setTrunkAllowed/setTrunkNative)
    // sehingga SwitchProcessor benar-benar menegakkannya (bukan fake success).
          const raw = rawInput.trim();
          const allowed = raw.match(/^switchport\s+trunk\s+allowed\s+vlan\s+(.+)/i)?.[1];
          if (allowed !== undefined) {
    // Validasi DAHULU, mutasi setelahnya — perintah gagal tidak boleh
    // mengubah state (port tidak jadi trunk, memori tidak tercemar).
            if (/^all$/i.test(allowed.trim()) || /^none$/i.test(allowed.trim())) {
              pushTrunk(mem, mem.currentIface);
              if (/^all$/i.test(allowed.trim())) {
                delete (mem.trunkAllowed || {})[mem.currentIface];
              } else {
                mem.trunkAllowed = mem.trunkAllowed || {};
                mem.trunkAllowed[mem.currentIface] = [];
              }
              cmdResult = { raw: '' };
            } else {
              const ids: number[] = [];
              let invalid = false;
              for (const part of allowed.split(',')) {
                const range = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
                if (!range) {
                  invalid = true;
                  break;
                }
                const lo = parseInt(range[1], 10);
                const hi = range[2] !== undefined ? parseInt(range[2], 10) : lo;
                if (lo < 1 || hi > 4094 || lo > hi) {
                  invalid = true;
                  break;
                }
                for (let v = lo; v <= hi; v++) if (!ids.includes(v)) ids.push(v);
              }
              if (invalid || ids.some((v) => v < 1 || v > 4094)) {
                cmdResult = { raw: `% Invalid input detected at '^' marker.\n% VLAN IDs must be in range 1..4094` };
              } else {
                pushTrunk(mem, mem.currentIface);
                mem.trunkAllowed = mem.trunkAllowed || {};
                mem.trunkAllowed[mem.currentIface] = ids;
                cmdResult = { raw: '' };
              }
            }
          } else {
            const native = raw.match(/^switchport\s+trunk\s+native\s+vlan\s+(\d+)/i)?.[1];
            if (native) {
              const v = parseInt(native, 10);
              if (!(v >= 1 && v <= 4094)) {
                cmdResult = { raw: `% Invalid input detected at '^' marker.\n% VLAN ID must be in range 1..4094` };
              } else {
                if (!mem.trunkPorts || !mem.trunkPorts.includes(mem.currentIface)) pushTrunk(mem, mem.currentIface);
                mem.trunkNative = mem.trunkNative || {};
                mem.trunkNative[mem.currentIface] = v;
                cmdResult = { raw: '' };
              }
            } else {
              cmdResult = { raw: '% Usage: switchport trunk allowed vlan <list> | switchport trunk native vlan <id>' };
            }
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b127',
    order: 127,
    vendors: 'all',
    cap: 'vlan',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^switchport\s+(mode\s+trunk|trunk\s+allowed\s+vlan)/i.test(rawInput.trim()) && mem.currentIface && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco switch: "switchport mode trunk" — port carries every VLAN
          pushTrunk(mem, mem.currentIface);
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b132',
    order: 132,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^dot11\s+ssid\s+(\S+)/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco: "dot11 ssid NetLab" → AP SSID (dot11radio0 dipetakan ke wlan1)
          const ssid = rawInput.trim().match(/^dot11\s+ssid\s+(\S+)/i)?.[1];
          if (!mem.wireless) mem.wireless = {};
          mem.wireless['wlan1'] = { ...(mem.wireless['wlan1'] || {}), ssid, mode: 'ap-bridge' };
          mem.currentSsid = ssid;
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b133',
    order: 133,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^wpa-psk\s+ascii\s+\d+\s+(\S+)/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos') && !!mem.currentSsid),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Cisco: "wpa-psk ascii 0 <kunci>" (dalam mode konfigurasi SSID)
          const key = rawInput.trim().match(/^wpa-psk\s+ascii\s+\d+\s+(\S+)/i)?.[1];
          if (!mem.wirelessSecurityProfiles) mem.wirelessSecurityProfiles = {};
          mem.wirelessSecurityProfiles['default'] = { authenticationTypes: 'wpa2-psk', key };
          const w = mem.wireless['wlan1'] || {};
          mem.wireless['wlan1'] = { ...w, securityProfile: 'default' };
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b134',
    order: 134,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^show\s+dot11\s+associations/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const info = recordObject(typeof context.wirelessProvider === 'function' ? context.wirelessProvider() : null);
          cmdResult = { type: 'wireless_reg_print', entries: recordArray(info ? info.associations : null) };
        
    return cmdResult;
  },
  },
];

registerEntries('cisco_ios', ciscoiosEntries);


