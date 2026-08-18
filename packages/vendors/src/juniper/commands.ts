// GENERATED — branch handler vendor juniper (diekstraksi dari dispatch() lama).
import type { CommandResult, ChainEntry, ChainEnv } from '../common/types';
import { registerEntries } from '../common/chain';
import { recordObject } from '../common/types';

import { resolveIfaceName, cidrOf } from '../common/ip';
import { grantDhcpClient } from '../common/state';
import { juniperSnapshot } from '../common/memory';
import type { NodeMemory, VendorContext } from '../common/types';

export const juniperEntries: ChainEntry[] = [
  {
    name: 'b6',
    order: 6,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (vendorId === 'juniper'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;
cmdResult = juniperCommand(rawInput, context, mem);
    
    // Juniper: address-assignment pool (DHCP), dhcp-local-server, BGP, firewall filter,
    // security nat, static-host-mapping DNS, DHCP client.
        
    return cmdResult;
  },
  },
  {
    name: 'b57',
    order: 57,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^set\s+system\s+host-name\s+(\S+)/i.test(rawInput.trim()) && (vendorId === 'juniper' || vendorId === 'ubiquiti' || vendorId === 'vyos')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Juniper / EdgeOS / VyOS: "set system host-name <name>"
          const m = rawInput.trim().match(/^set\s+system\s+host-name\s+(\S+)/i);
          if (m) {
            mem.hostname = m[1];
            cmdResult = { raw: '' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b64',
    order: 64,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^set\s+vlans\s+(\S+)\s+vlan-id\s+(\d+)/i.test(rawInput.trim()) && (vendorId === 'juniper' || vendorId === 'ubiquiti' || vendorId === 'vyos')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Juniper / EdgeOS / VyOS: "set vlans <name> vlan-id <id>"
          const m = rawInput.trim().match(/^set\s+vlans\s+(\S+)\s+vlan-id\s+(\d+)/i);
          if (m) {
            const idNum = parseInt(m[2], 10);
            if (!(idNum >= 1 && idNum <= 4094)) {
              cmdResult = { raw: 'error: vlan-id out of range (1..4094)' };
            } else {
    // Set semantics (last-wins) + tidak pernah membuat duplikat:
    // - nama sudah ada → perbarui id-nya.
    // - id sudah dipakai nama lain → konflik nyata, tolak (bukan fake success).
    // - baru → buat.
              const byName = mem.vlans.find((v) => v.name === m![1]);
              const byId = mem.vlans.find((v) => String(v.id) === m![2]);
              if (byId && byId.name !== m![1]) {
                cmdResult = { raw: `error: vlan-id ${String(m![2])} already in use by vlan '${String(byId.name)}'` };
              } else if (byName) {
                byName.id = m![2];
                cmdResult = { raw: '' };
              } else {
                mem.vlans.push({ id: m![2], name: m![1] });
                cmdResult = { raw: '' };
              }
            }
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b77',
    order: 77,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^set\s+system\s+name-server\s+(\S+)/i.test(rawInput.trim()) && (vendorId === 'juniper' || vendorId === 'ubiquiti' || vendorId === 'vyos')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const m = rawInput.trim().match(/^set\s+system\s+name-server\s+(\S+)/i);
          if (m) {
            mem.dnsServers = m[1].split(/\s+/).filter(Boolean);
            cmdResult = { raw: '' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b121',
    order: 121,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^set\s+protocols\s+rstp/i.test(rawInput.trim()) && (vendorId === 'juniper' || vendorId === 'vyos' || vendorId === 'ubiquiti')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Juniper/VyOS: "set protocols rstp" → aktifkan RSTP
          mem.stp = mem.stp || { enabled: true, priority: 32768, mode: 'rstp' };
          mem.stp.enabled = true;
          mem.stp.mode = 'rstp';
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b122',
    order: 122,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^delete\s+protocols\s+rstp/i.test(rawInput.trim()) && (vendorId === 'juniper' || vendorId === 'vyos' || vendorId === 'ubiquiti')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          mem.stp = mem.stp || { enabled: true, priority: 32768, mode: 'rstp' };
          mem.stp.enabled = false;
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b124',
    order: 124,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^set\s+protocols\s+(ospf|rip)\b/i.test(rawInput.trim()) && (vendorId === 'juniper' || vendorId === 'vyos' || vendorId === 'ubiquiti')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Juniper/VyOS/EdgeOS: "set protocols ospf area 0 interface eth0" / "set protocols ospf area 0 network 10.0.0.0/24"
          const proto = rawInput.trim().match(/^set\s+protocols\s+(ospf|rip)\b/i)?.[1]?.toLowerCase() as 'ospf' | 'rip';
          const m = rawInput.trim().match(/(?:interface|network)\s+(\S+)/i);
          mem.routing[proto].enabled = true;
          mem.currentDhcpPool = '';
          if (m && !mem.routing[proto].networks.includes(m[1])) {
            mem.routing[proto].networks.push(m[1]);
          }
    // OSPF lanjutan: "set protocols ospf area 0 interface eth0 passive" / "... interface eth0 cost 100"
          const pm = rawInput.trim().match(/interface\s+(\S+)\s+passive\b/i);
          if (pm && proto === 'ospf') {
            const iface = resolveIfaceName(context?.ports, pm[1]) || pm[1];
            if (!mem.routing.ospf.passiveInterfaces.includes(iface)) mem.routing.ospf.passiveInterfaces.push(iface);
          }
          const cm = rawInput.trim().match(/interface\s+(\S+)\s+cost\s+(\d+)/i);
          if (cm && proto === 'ospf') {
            const cost = parseInt(cm[2], 10);
            if (cost >= 1 && cost <= 65535) {
              mem.routing.ospf.interfaceCosts[resolveIfaceName(context?.ports, cm[1]) || cm[1]] = cost;
            } else {
              cmdResult = { raw: 'cost value must be in range 1..65535' };
            }
          }
          if (cmdResult === undefined) cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b169',
    order: 169,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (vendorId === 'juniper' && normalized.action === 'commit'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Junos "commit suggest"/"commit check" hanya validasi — tidak menyimpan snapshot.
          const checkOnly = /^commit\s+(?:check|suggest)/i.test(rawInput.trim());
          const current = juniperSnapshot(mem);
          const prev = mem.juniperCommitted;
          if (checkOnly) {
            cmdResult = { type: 'commit_check' };
          } else if (prev && JSON.stringify(prev) === JSON.stringify(current)) {
            cmdResult = { raw: 'warning: no configuration change, commit aborted' };
          } else {
            mem.juniperCommitted = current;
            cmdResult = { type: 'commit' };
          }
        
    return cmdResult;
  },
  },
];

registerEntries('juniper', juniperEntries);

export function juniperCommand(raw: string, context: VendorContext, mem: NodeMemory): CommandResult | undefined {
  const t = raw.trim();
  let m: RegExpMatchArray | null;

  const poolFor = (name: string) => {
    let p = mem.dhcpPools.find((x) => x.name === name);
    if (!p) {
      p = { name, range: '', network: '', iface: '', gateway: '' };
      mem.dhcpPools.push(p);
    }
    return p;
  };

  // DHCP server — address-assignment pool
  m = t.match(/^set\s+access\s+address-assignment\s+pool\s+(\S+)\s+family\s+inet\s+network\s+(\S+)/i);
  if (m) {
    const p = poolFor(m[1]);
    p.network = cidrOf(m[2]);
    return { raw: '' };
  }
  m = t.match(/^set\s+access\s+address-assignment\s+pool\s+(\S+)\s+family\s+inet\s+dhcp-attributes\s+router\s+(\S+)/i);
  if (m) {
    poolFor(m[1]).gateway = m[2];
    return { raw: '' };
  }
  m = t.match(/^set\s+access\s+address-assignment\s+pool\s+(\S+)\s+family\s+inet\s+range\s+(\S+)\s+low\s+(\S+)\s+high\s+(\S+)/i);
  if (m) {
    poolFor(m[1]).range = `${String(m[3])}-${String(m[4])}`;
    return { raw: '' };
  }
  // DHCP server — ikat pool ke interface (group → pool → interface)
  m = t.match(/^set\s+system\s+services\s+dhcp-local-server\s+group\s+(\S+)\s+pool\s+(\S+)/i);
  if (m) {
    mem.bgpGroups = mem.bgpGroups || {};
    mem.bgpGroups['pool_' + m[1]] = m[2];
    return { raw: '' };
  }
  m = t.match(/^set\s+system\s+services\s+dhcp-local-server\s+group\s+(\S+)\s+interface\s+(\S+)/i);
  if (m) {
    mem.bgpGroups = mem.bgpGroups || {};
    const poolName = String(mem.bgpGroups['pool_' + m[1]] || 'pool1');
    poolFor(poolName).iface = resolveIfaceName(context?.ports, m[2]) || m[2];
    return { raw: '' };
  }
  // DHCP client
  m = t.match(/^set\s+interfaces\s+(\S+)\s+unit\s+\d+\s+family\s+inet\s+dhcp-client/i);
  if (m) {
    return { raw: grantDhcpClient(context, mem, resolveIfaceName(context?.ports, m[1]) || m[1], true) };
  }

  // BGP
  m = t.match(/^set\s+routing-options\s+autonomous-system\s+(\d+)/i);
  if (m) {
    const asn = parseInt(m[1], 10);
    if (!(asn >= 1 && asn <= 4294967295)) {
      return { raw: 'error: invalid autonomous system number' };
    }
    mem.bgp.asn = asn;
    return { raw: '' };
  }
  m = t.match(/^set\s+routing-options\s+router-id\s+(\S+)/i);
  if (m) {
    mem.bgp.routerId = m[1];
    return { raw: '' };
  }
  m = t.match(/^set\s+protocols\s+bgp\s+group\s+(\S+)\s+peer-as\s+(\d+)/i);
  if (m) {
    mem.bgpGroups[m[1]] = parseInt(m[2], 10);
    return { raw: '' };
  }
  m = t.match(/^set\s+protocols\s+bgp\s+group\s+(\S+)\s+neighbor\s+(\S+)/i);
  if (m) {
    const peerAs = Number(mem.bgpGroups[m[1]]);
    if (peerAs && !mem.bgp.peers.some((p) => p.remoteAddr === m[2])) {
      mem.bgp.peers.push({ remoteAs: peerAs, remoteAddr: m[2], name: m[2] });
    }
    return { raw: '' };
  }
  m = t.match(/^set\s+protocols\s+bgp\s+group\s+(\S+)\s+network\s+(\S+)/i);
  if (m) {
    if (!mem.bgp.networks) mem.bgp.networks = [];
    const cidr = cidrOf(m[2]);
    if (!mem.bgp.networks.includes(cidr)) mem.bgp.networks.push(cidr);
    return { raw: '' };
  }

  // ACL — firewall family inet filter
  m = t.match(/^set\s+firewall\s+family\s+inet\s+filter\s+(\S+)\s+term\s+(\S+)\s+from\s+protocol\s+(\S+)/i);
  if (m) {
    const key = `${String(m[1])}:${String(m[2])}`;
    mem.juniperSrcNat = mem.juniperSrcNat || {};
    mem.juniperFilters = mem.juniperFilters || {};
    mem.juniperFilters[key] = { proto: m[3].toLowerCase() };
    return { raw: '' };
  }
  m = t.match(/^set\s+firewall\s+family\s+inet\s+filter\s+(\S+)\s+term\s+(\S+)\s+from\s+(source-address|destination-address)\s+(\S+)/i);
  if (m) {
    const key = `${String(m[1])}:${String(m[2])}`;
    mem.juniperFilters = mem.juniperFilters || {};
    const f = recordObject(mem.juniperFilters[key]) || { proto: 'any' };
    mem.juniperFilters[key] = m[3].toLowerCase().startsWith('source') ? { ...f, src: m[4] } : { ...f, dst: m[4] };
    return { raw: '' };
  }
  m = t.match(/^set\s+firewall\s+family\s+inet\s+filter\s+(\S+)\s+term\s+(\S+)\s+then\s+(accept|reject|discard)/i);
  if (m) {
    const key = `${String(m[1])}:${String(m[2])}`;
    mem.juniperFilters = mem.juniperFilters || {};
    const f = recordObject(mem.juniperFilters[key]) || { proto: 'any' };
    const deny = m[3].toLowerCase() !== 'accept';
    mem.acls.push({ action: deny ? 'deny' : 'permit', proto: String(f.proto || 'any'), src: String(f.src || 'any'), dst: String(f.dst || 'any') });
    return { raw: '' };
  }

  // NAT — security nat source
  m = t.match(/^set\s+security\s+nat\s+source\s+rule-set\s+(\S+)\s+rule\s+(\S+)\s+match\s+source-address\s+(\S+)/i);
  if (m) {
    const key = `${String(m[1])}:${String(m[2])}`;
    mem.juniperSrcNat = mem.juniperSrcNat || {};
    mem.juniperSrcNat[key] = { src: m[3] };
    return { raw: '' };
  }
  m = t.match(/^set\s+security\s+nat\s+source\s+rule-set\s+(\S+)\s+rule\s+(\S+)\s+then\s+source-nat\s+interface/i);
  if (m) {
    const key = `${String(m[1])}:${String(m[2])}`;
    mem.juniperSrcNat = mem.juniperSrcNat || {};
    const d = recordObject(mem.juniperSrcNat[key]) || { src: '' };
    mem.natRules.push({ chain: 'srcnat', action: 'masquerade', srcAddress: String(d.src || '') });
    return { raw: '' };
  }
  // NAT — security nat destination (pool + rule)
  m = t.match(/^set\s+security\s+nat\s+destination\s+pool\s+(\S+)\s+address\s+(\S+)/i);
  if (m) {
    mem.juniperDstPool = mem.juniperDstPool || {};
    mem.juniperDstPool[m[1]] = { address: m[2], port: '' };
    return { raw: '' };
  }
  m = t.match(/^set\s+security\s+nat\s+destination\s+pool\s+(\S+)\s+port\s+(\d+)/i);
  if (m) {
    mem.juniperDstPool = mem.juniperDstPool || {};
    if (!mem.juniperDstPool[m[1]]) mem.juniperDstPool[m[1]] = { address: '', port: '' };
    const dp = mem.juniperDstPool[m[1]] as Record<string, unknown>;
    dp.port = m[2];
    return { raw: '' };
  }
  m = t.match(/^set\s+security\s+nat\s+destination\s+rule-set\s+(\S+)\s+rule\s+(\S+)\s+match\s+destination-address\s+(\S+)/i);
  if (m) {
    const key = `${String(m[1])}:${String(m[2])}`;
    mem.juniperSrcNat = mem.juniperSrcNat || {};
    mem.juniperSrcNat['dst_' + key] = { dstAddress: m[3], dstPort: '' };
    return { raw: '' };
  }
  m = t.match(/^set\s+security\s+nat\s+destination\s+rule-set\s+(\S+)\s+rule\s+(\S+)\s+match\s+destination-port\s+(\d+)/i);
  if (m) {
    const key = `${String(m[1])}:${String(m[2])}`;
    mem.juniperSrcNat = mem.juniperSrcNat || {};
    const d = recordObject(mem.juniperSrcNat['dst_' + key]) || (mem.juniperSrcNat['dst_' + key] = { dstAddress: '', dstPort: '' });
    d.dstPort = m[2];
    return { raw: '' };
  }
  m = t.match(/^set\s+security\s+nat\s+destination\s+rule-set\s+(\S+)\s+rule\s+(\S+)\s+then\s+destination-nat\s+pool\s+(\S+)/i);
  if (m) {
    const key = `${String(m[1])}:${String(m[2])}`;
    mem.juniperSrcNat = mem.juniperSrcNat || {};
    const d = recordObject(mem.juniperSrcNat['dst_' + key]) || { dstAddress: '', dstPort: '' };
    const pool = recordObject((mem.juniperDstPool || {})[m[3]]) || { address: '', port: '' };
    if (pool.address) {
      mem.natRules.push({
        chain: 'dstnat',
        action: 'dst-nat',
        protocol: 'tcp',
        dstAddress: String(d.dstAddress || ''),
        dstPort: String(d.dstPort || ''),
        toAddresses: String(pool.address),
        toPorts: String(pool.port || ''),
      });
    }
    return { raw: '' };
  }

  // DNS static
  m = t.match(/^set\s+system\s+static-host-mapping\s+host-name\s+(\S+)\s+inet\s+(\S+)/i);
  if (m) {
    mem.dnsRecords.push({ name: m[1].toLowerCase(), address: m[2] });
    return { raw: '' };
  }

  // Tampilan
  if (/^show\s+system\s+services\s+dhcp/i.test(t) || /^show\s+access\s+address-assignment/i.test(t)) {
    return { type: 'dhcp_print', pools: mem.dhcpPools };
  }
  if (/^show\s+configuration\s+system\s+services\s+dhcp/i.test(t)) {
    return { type: 'dhcp_print', pools: mem.dhcpPools };
  }
  return undefined;
}
