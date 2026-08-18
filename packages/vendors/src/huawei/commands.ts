// GENERATED — branch handler vendor huawei (diekstraksi dari dispatch() lama).
import type { CommandResult, ChainEntry, ChainEnv } from '../common/types';
import { registerEntries } from '../common/chain';
import { recordArray } from '../common/types';

import { upsertSubinterface, pushTrunk } from '../common/state';
import { resolveIfaceName } from '../common/ip';
import type { NodeMemory, VendorContext } from '../common/types';

export const huaweiEntries: ChainEntry[] = [
  {
    name: 'b8',
    order: 8,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (vendorId === 'huawei'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;
cmdResult = huaweiCommand(rawInput, context, mem);
    
    // Huawei: BGP (bgp/peer/network), ACL (acl/rule), NAT (nat outbound / nat server),
    // DNS static (ip host).
        
    return cmdResult;
  },
  },
  {
    name: 'b13',
    order: 13,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^dot1q\s+termination\s+vid\s+(\d+)/i.test(rawInput.trim()) && mem.currentIface && /\.\d+$/.test(mem.currentIface) && vendorId === 'huawei'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Huawei subinterface: "dot1q termination vid 10"
          const vlanId = parseInt(rawInput.trim().match(/^dot1q\s+termination\s+vid\s+(\d+)/i)?.[1] || '1', 10);
          upsertSubinterface(mem, mem.currentIface, String(mem.currentIface).replace(/\.\d+$/, ''), vlanId);
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b17',
    order: 17,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^silent-interface\s+(\S+)/i.test(rawInput.trim()) && mem.currentProto === 'ospf' && vendorId === 'huawei'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Huawei: "silent-interface <iface>" di router ospf — padanan passive-interface
          const iface = resolveIfaceName(context?.ports, rawInput.trim().match(/^silent-interface\s+(\S+)/i)?.[1] || '') || '';
          if (iface && !mem.routing.ospf.passiveInterfaces.includes(iface)) {
            mem.routing.ospf.passiveInterfaces.push(iface);
          }
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b45',
    order: 45,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (vendorId === 'huawei' && /^ip\s+(address|add)\s+\S+\s+\S+/i.test(rawInput.trim())),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Huawei: "ip address <ip> <mask>" / "ip add ..." inside an interface view
          const m = rawInput.trim().match(/^ip\s+(?:address|add)\s+(\S+)\s+(\S+)/i);
          if (m && mem.currentIface) {
            mem.configuredIps[mem.currentIface] = `${String(m[1])} ${String(m[2])}`;
            cmdResult = { raw: '' };
          } else {
            cmdResult = { raw: '% Error: enter interface view first (interface <name>)' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b50',
    order: 50,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (vendorId === 'huawei' && /^ip\s+route-static\s+\S+\s+\S+\s+\S+/i.test(rawInput.trim())),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Huawei: "ip route-static 0.0.0.0 0.0.0.0 <gateway>"
          const m = rawInput.trim().match(/^ip\s+route-static\s+(\S+)\s+(\S+)\s+(\S+)/i);
          if (m) {
            mem.routes.push({ dst: `${String(m[1])} ${String(m[2])}`, gateway: m[3], distance: 1 });
            cmdResult = { raw: '' };
          } else {
            cmdResult = { raw: '% Usage: ip route-static <dst> <mask> <gateway>' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b55',
    order: 55,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^sysname\s+(\S+)/i.test(rawInput.trim()) && vendorId === 'huawei'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Huawei: "sysname <name>" (dari system view)
          const m = rawInput.trim().match(/^sysname\s+(\S+)/i);
          if (m) {
            mem.hostname = m[1];
            cmdResult = { raw: '' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b62',
    order: 62,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^vlan\s+(\d+)/i.test(rawInput.trim()) && vendorId === 'huawei'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Huawei: "vlan <id>" (dari system view)
          const m = rawInput.trim().match(/^vlan\s+(\d+)/i);
          if (m) {
            const idRaw = m[1];
            const idNum = parseInt(idRaw, 10);
            if (!(idNum >= 1 && idNum <= 4094)) {
              cmdResult = { raw: '% Error: Invalid VLAN ID, it should be 1 to 4094.' };
            } else if (!mem.vlans.find((v) => v.id === idRaw)) {
              mem.vlans.push({ id: idRaw, name: `VLAN${String(idRaw)}` });
              mem.currentVlan = idRaw;
              cmdResult = { raw: '' };
            } else {
              mem.currentVlan = idRaw;
              cmdResult = { raw: '' };
            }
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b78',
    order: 78,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^dns\s+server\s+(\S+)/i.test(rawInput.trim()) && vendorId === 'huawei'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const m = rawInput.trim().match(/^dns\s+server\s+(\S+)/i);
          if (m) {
            mem.dnsServers = m[1].split(/\s+/).filter(Boolean);
            cmdResult = { raw: '' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b86',
    order: 86,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^dhcp\s+enable/i.test(rawInput.trim()) && vendorId === 'huawei'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          mem.dhcpPools.push({ name: 'global', range: '', network: '', iface: '', gateway: '' });
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b104',
    order: 104,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^(ospf|rip)\b/i.test(rawInput.trim()) && vendorId === 'huawei'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Huawei: "ospf 1" / "rip" (system view) → masuk mode protocol
          const proto = rawInput.trim().match(/^(ospf|rip)\b/i)?.[1]?.toLowerCase() as 'ospf' | 'rip';
          mem.routing[proto].enabled = true;
          mem.currentProto = proto;
          mem.currentDhcpPool = '';
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b105',
    order: 105,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^area\s+\d+/i.test(rawInput.trim()) && mem.currentProto === 'ospf' && vendorId === 'huawei'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Huawei VRP: "area 0" — masuk view area OSPF (sub-view)
          const areaId = parseInt(rawInput.trim().match(/^area\s+(\d+)/i)?.[1] || '0', 10);
          mem.currentOspfArea = areaId;
          mem.currentOspfAreaView = true;
          mem.currentDhcpSection = '';
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b106',
    order: 106,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^(?:quit|return)\b/i.test(rawInput.trim()) && vendorId === 'huawei'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Huawei: "quit" / "return" — keluar dari view; dari area OSPF kembali ke view OSPF
          mem.currentVlan = '';
          if (mem.currentOspfAreaView) {
            mem.currentOspfAreaView = false;
            mem.currentOspfArea = -1;
          } else {
            mem.currentProto = '';
            mem.currentDhcpSection = '';
            mem.currentAclId = '';
            mem.currentOspfArea = -1;
          }
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b117',
    order: 117,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^stp\s+priority\s+(\d+)/i.test(rawInput.trim()) && vendorId === 'huawei' && mem.currentIface === ''),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Huawei: "stp priority <0-61440>" (system view)
          const p = parseInt(rawInput.trim().match(/^stp\s+priority\s+(\d+)/i)?.[1] || '32768', 10);
          if (p >= 0 && p <= 61440 && p % 4096 === 0) {
            mem.stp = mem.stp || { enabled: true, priority: 32768, mode: 'rstp' };
            mem.stp.priority = p;
            mem.stp.enabled = true;
            cmdResult = { raw: '' };
          } else {
            cmdResult = { raw: '% Error: The bridge priority should be a multiple of 4096 in range 0-61440.' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b123',
    order: 123,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^stp\s+mode\s+(\S+)/i.test(rawInput.trim()) && vendorId === 'huawei'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Huawei: "stp mode rstp" (system view)
          const mode = (rawInput.trim().match(/^stp\s+mode\s+(\S+)/i)?.[1] || 'rstp').toLowerCase();
          mem.stp = mem.stp || { enabled: true, priority: 32768, mode: 'rstp' };
          mem.stp.enabled = true;
          mem.stp.mode = ['stp', 'mst', 'rstp'].includes(mode) ? mode : 'rstp';
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b128',
    order: 128,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^port\s+(link-type\s+access|default\s+vlan\s+\d+)$/i.test(rawInput.trim()) && mem.currentIface && vendorId === 'huawei'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Huawei switch: "port link-type access" / "port default vlan 10"
          const vlan = rawInput.trim().match(/default\s+vlan\s+(\d+)/i)?.[1];
          if (vlan) {
            const v = parseInt(vlan, 10);
            if (!(v >= 1 && v <= 4094)) {
              cmdResult = { raw: '% Error: Invalid VLAN ID, it should be 1 to 4094.' };
            } else {
              mem.portVlans[mem.currentIface] = v;
              if (rawInput.trim().match(/link-type\s+access/i)) {
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
    name: 'b129',
    order: 129,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^port\s+(link-type\s+trunk|trunk\s+allow-pass\s+vlan)/i.test(rawInput.trim()) && mem.currentIface && vendorId === 'huawei'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Huawei switch: "port link-type trunk" / "port trunk allow-pass vlan 10 20"
          pushTrunk(mem, mem.currentIface);
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
];

registerEntries('huawei', huaweiEntries);

export function huaweiCommand(raw: string, context: VendorContext, mem: NodeMemory): CommandResult | undefined {
  const t = raw.trim();
  let m: RegExpMatchArray | null;

  // DHCP pool
  m = t.match(/^ip\s+pool\s+(\S+)\s+network\s+(\S+)\s+(?:mask\s+(\S+))?/i);
  if (m) {
    const net = m[3] ? `${String(m[2])} ${String(m[3])}` : m[2];
    const pool = mem.dhcpPools.find((x) => x.name === m[1]);
    if (pool) pool.network = net;
    else mem.dhcpPools.push({ name: m[1], range: '', network: net, iface: '', gateway: '' });
    return { raw: '' };
  }
  m = t.match(/^gateway-list\s+(\S+)/i);
  if (m && mem.currentDhcpSection) {
    const pool = mem.dhcpPools.find((x) => x.name === mem.currentDhcpSection);
    if (pool) pool.gateway = m[1];
    return { raw: '' };
  }
  m = t.match(/^ip\s+pool\s+(\S+)/i);
  if (m) {
    mem.currentDhcpSection = m[1];
    if (!mem.dhcpPools.find((x) => x.name === m[1])) {
      mem.dhcpPools.push({ name: m[1], range: '', network: '', iface: '', gateway: '' });
    }
    return { raw: '' };
  }
  m = t.match(/^network\s+(\d+\.\d+\.\d+\.\d+)\s+(?:mask\s+)?(\S+)/i);
  if (m && mem.currentDhcpSection && mem.currentProto !== 'bgp') {
    const pool = mem.dhcpPools.find((x) => x.name === mem.currentDhcpSection);
    if (pool) pool.network = `${String(m[1])} ${String(m[2])}`;
    return { raw: '' };
  }
  // Huawei: "dhcp select global" (interface view) — ikat pool ke interface aktif
  m = t.match(/^dhcp\s+select\s+global/i);
  if (m && mem.currentIface) {
    const pool = mem.dhcpPools.find((x) => x.iface === mem.currentIface);
    if (!pool && mem.dhcpPools.length > 0) mem.dhcpPools[mem.dhcpPools.length - 1].iface = mem.currentIface;
    return { raw: '' };
  }

  // BGP
  m = t.match(/^bgp\s+(\d+)/i);
  if (m) {
    mem.bgp.asn = parseInt(m[1], 10);
    mem.currentProto = 'bgp';
    mem.currentDhcpSection = '';
    mem.currentAclId = '';
    return { raw: '' };
  }
  m = t.match(/^peer\s+(\S+)\s+as-number\s+(\d+)/i);
  if (m && mem.currentProto === 'bgp') {
    if (!mem.bgp.peers.some((p) => p.remoteAddr === m[1])) {
      mem.bgp.peers.push({ remoteAs: parseInt(m[2], 10), remoteAddr: m[1], name: m[1] });
    }
    return { raw: '' };
  }
  m = t.match(/^network\s+(\d+\.\d+\.\d+\.\d+)\s+mask\s+(\S+)/i);
  if (m && mem.currentProto === 'bgp') {
    if (!mem.bgp.networks) mem.bgp.networks = [];
    const net = `${String(m[1])} ${String(m[2])}`;
    if (!mem.bgp.networks.includes(net)) mem.bgp.networks.push(net);
    return { raw: '' };
  }

  // ACL
  m = t.match(/^acl\s+(\d+)/i);
  if (m) {
    mem.currentAclId = m[1];
    mem.currentProto = '';
    return { raw: '' };
  }
  m = t.match(/^rule\s+\d+\s+(permit|deny)\s+(ip|icmp|tcp|udp)(?:\s+source\s+(\S+)\s+(\S+))?(?:\s+destination\s+(\S+)\s+(\S+))?/i);
  if (m && mem.currentAclId) {
    mem.acls.push({
      action: m[1].toLowerCase(),
      proto: m[2].toLowerCase(),
      src: m[3] ? `${String(m[3])} ${String(m[4])}` : 'any',
      dst: m[5] ? `${String(m[5])} ${String(m[6])}` : 'any',
      aclId: mem.currentAclId,
    });
    return { raw: '' };
  }

  // NAT outbound (masquerade via ACL)
  m = t.match(/^nat\s+outbound\s+(\d+)/i);
  if (m && mem.currentIface) {
    const acl = mem.acls.find((a) => a.aclId === m[1]);
    mem.natRules.push({
      chain: 'srcnat',
      action: 'masquerade',
      outInterface: mem.currentIface,
      srcAddress: acl && acl.src !== 'any' ? acl.src : '',
    });
    return { raw: '' };
  }
  // NAT server (port-forward)
  m = t.match(/^nat\s+server\s+protocol\s+(\S+)\s+global\s+(current-interface|\S+)\s+(\d+)\s+inside\s+(\S+)\s+(\d+)/i);
  if (m && mem.currentIface) {
    mem.natRules.push({
      chain: 'dstnat',
      action: 'dst-nat',
      protocol: m[1].toLowerCase(),
      dstAddress: m[2] === 'current-interface' ? '' : m[2],
      dstPort: m[3],
      toAddresses: m[4],
      toPorts: m[5],
    });
    return { raw: '' };
  }
  m = t.match(/^undo\s+nat\s+server/i);
  if (m && mem.currentIface) {
    mem.natRules = mem.natRules.filter((r) => r.chain !== 'dstnat');
    return { raw: '' };
  }

  // DNS static
  m = t.match(/^ip\s+host\s+(\S+)\s+(\d+\.\d+\.\d+\.\d+)/i);
  if (m) {
    mem.dnsRecords.push({ name: m[1].toLowerCase(), address: m[2] });
    return { raw: '' };
  }

  // Tampilan
  if (/^display\s+ip\s+pool/i.test(t) || /^display\s+dhcp\s+server/i.test(t)) {
    return { type: 'dhcp_print', pools: mem.dhcpPools };
  }
  if (/^display\s+acl/i.test(t)) {
    return { type: 'acl_print', rules: mem.acls };
  }
  if (/^display\s+nat/i.test(t) || /^display\s+current-configuration\s+nat/i.test(t)) {
    return { type: 'nat_print', rules: mem.natRules };
  }
  if (/^display\s+bgp\s+peer/i.test(t)) {
    const states = recordArray(typeof context.bgpNeighborProvider === 'function' ? context.bgpNeighborProvider() : []);
    const peers = mem.bgp.peers.map((p) => {
      const s = states.find((x) => x.remoteAddr === p.remoteAddr);
      return { ...p, state: s?.state || 'Idle', prefixes: s?.prefixes ?? 0, uptime: s?.uptime || 'never' };
    });
    return { type: 'bgp_peer_print', peers, asn: mem.bgp.asn, routerId: mem.bgp.routerId };
  }
  return undefined;
}
