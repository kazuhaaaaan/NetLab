// GENERATED — branch handler vendor vyos (diekstraksi dari dispatch() lama).
import type { CommandResult, ChainEntry, ChainEnv } from '../common/types';
import { registerEntries } from '../common/chain';

import { cidrOf, resolveIfaceName } from '../common/ip';
import { grantDhcpClient } from '../common/state';
import { juniperSnapshot, restoreJuniper } from '../common/memory';
import type { NodeMemory, VendorContext } from '../common/types';

export const vyosEntries: ChainEntry[] = [
  {
    name: 'b7',
    order: 7,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => ((vendorId === 'vyos' || vendorId === 'ubiquiti')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;
cmdResult = vyosCommand(rawInput, context, mem);
    
    // VyOS / EdgeOS: dhcp-server shared-network, nat source/destination, bgp,
    // firewall name (ACL), static-host-mapping DNS, DHCP client.
        
    return cmdResult;
  },
  },
  {
    name: 'b170',
    order: 170,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (vendorId === 'vyos' || vendorId === 'ubiquiti'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          if (normalized.action === 'commit') {
    // VyOS/EdgeOS "commit" — aktifkan kandidat (snapshot untuk rollback).
            const current = juniperSnapshot(mem);
            mem.juniperCommitted = current;
            cmdResult = { type: 'commit' };
          } else if (normalized.action === 'rollback') {
            const snap = mem.juniperCommitted;
            cmdResult = snap
              ? { raw: 'configuration rolled back' }
              : { raw: 'error: no configuration to roll back' };
            if (snap) restoreJuniper(mem, snap);
          } else {
    // Command VyOS yang tidak dikenali: JANGAN pura-pura sukses.
            cmdResult = { raw: '% Command not supported by NetLab simulator (vyos)' };
          }
        
    return cmdResult;
  },
  },
];

registerEntries('vyos', vyosEntries);

export function vyosCommand(raw: string, context: VendorContext, mem: NodeMemory): CommandResult | undefined {
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

  // DHCP server
  m = t.match(/^set\s+service\s+dhcp-server\s+shared-network-name\s+(\S+)\s+subnet\s+(\S+)\s+(?:start\s+(\S+)\s+stop\s+(\S+))/i);
  if (m) {
    const p = poolFor(m[1]);
    p.network = cidrOf(m[2]);
    if (m[3] && m[4]) p.range = `${String(m[3])}-${String(m[4])}`;
    return { raw: '' };
  }
  m = t.match(/^set\s+service\s+dhcp-server\s+shared-network-name\s+(\S+)\s+subnet\s+(\S+)\s+default-router\s+(\S+)/i);
  if (m) {
    poolFor(m[1]).gateway = m[3];
    return { raw: '' };
  }
  m = t.match(/^set\s+service\s+dhcp-server\s+shared-network-name\s+(\S+)\s+subnet\s+(\S+)\s+name-server\s+(\S+)/i);
  if (m) {
    const servers = m[3].split(/\s+/).filter(Boolean);
    for (const s of servers) if (!mem.dnsServers.includes(s)) mem.dnsServers.push(s);
    return { raw: '' };
  }
  m = t.match(/^set\s+service\s+dhcp-server\s+shared-network-name\s+(\S+)\s+subnet\s+(\S+)/i);
  if (m) {
    const p = poolFor(m[1]);
    p.network = cidrOf(m[2]);
    return { raw: '' };
  }
  // DHCP client
  m = t.match(/^set\s+interfaces\s+ethernet\s+(\S+)\s+address\s+dhcp/i);
  if (m) {
    return { raw: grantDhcpClient(context, mem, resolveIfaceName(context?.ports, m[1]) || m[1], true) };
  }
  m = t.match(/^set\s+interfaces\s+(\S+)\s+address\s+dhcp/i);
  if (m) {
    return { raw: grantDhcpClient(context, mem, resolveIfaceName(context?.ports, m[1]) || m[1], true) };
  }

  // NAT source
  m = t.match(/^set\s+nat\s+source\s+rule\s+(\d+)\s+outbound-interface\s+(\S+)/i);
  if (m) {
    mem.natSrcDraft = mem.natSrcDraft || {};
    const d = mem.natSrcDraft[m[1]] || (mem.natSrcDraft[m[1]] = {});
    d.out = resolveIfaceName(context?.ports, m[2]) || m[2];
    return { raw: '' };
  }
  m = t.match(/^set\s+nat\s+source\s+rule\s+(\d+)\s+source\s+address\s+(\S+)/i);
  if (m) {
    mem.natSrcDraft = mem.natSrcDraft || {};
    const d = mem.natSrcDraft[m[1]] || (mem.natSrcDraft[m[1]] = {});
    d.src = m[2];
    return { raw: '' };
  }
  m = t.match(/^set\s+nat\s+source\s+rule\s+(\d+)\s+translation\s+address\s+masquerade/i);
  if (m) {
    mem.natSrcDraft = mem.natSrcDraft || {};
    const d = mem.natSrcDraft[m[1]] || {};
    mem.natRules.push({ chain: 'srcnat', action: 'masquerade', outInterface: d.out || '', srcAddress: d.src || '' });
    return { raw: '' };
  }
  // NAT destination
  m = t.match(/^set\s+nat\s+destination\s+rule\s+(\d+)\s+inbound-interface\s+(\S+)/i);
  if (m) {
    mem.natDstDraft = mem.natDstDraft || {};
    const d = mem.natDstDraft[m[1]] || (mem.natDstDraft[m[1]] = {});
    d.in = m[2];
    return { raw: '' };
  }
  m = t.match(/^set\s+nat\s+destination\s+rule\s+(\d+)\s+protocol\s+(\S+)/i);
  if (m) {
    mem.natDstDraft = mem.natDstDraft || {};
    const d = mem.natDstDraft[m[1]] || (mem.natDstDraft[m[1]] = {});
    d.proto = m[2].toLowerCase();
    return { raw: '' };
  }
  m = t.match(/^set\s+nat\s+destination\s+rule\s+(\d+)\s+destination\s+port\s+(\d+)/i);
  if (m) {
    mem.natDstDraft = mem.natDstDraft || {};
    const d = mem.natDstDraft[m[1]] || (mem.natDstDraft[m[1]] = {});
    d.dstPort = m[2];
    return { raw: '' };
  }
  m = t.match(/^set\s+nat\s+destination\s+rule\s+(\d+)\s+translation\s+address\s+(\S+)/i);
  if (m) {
    mem.natDstDraft = mem.natDstDraft || {};
    const d = mem.natDstDraft[m[1]] || (mem.natDstDraft[m[1]] = {});
    d.toAddr = m[2];
    return { raw: '' };
  }
  m = t.match(/^set\s+nat\s+destination\s+rule\s+(\d+)\s+translation\s+port\s+(\d+)/i);
  if (m) {
    mem.natDstDraft = mem.natDstDraft || {};
    const d = mem.natDstDraft[m[1]] || (mem.natDstDraft[m[1]] = {});
    d.toPort = m[2];
    if (d.toAddr) {
      mem.natRules.push({
        chain: 'dstnat',
        action: 'dst-nat',
        protocol: d.proto || 'tcp',
        dstAddress: '',
        dstPort: d.dstPort || '',
        toAddresses: d.toAddr,
        toPorts: d.toPort,
      });
    }
    return { raw: '' };
  }

  // BGP
  m = t.match(/^set\s+protocols\s+bgp\s+(\d+)\s+parameters\s+router-id\s+(\S+)/i);
  if (m) {
    if (!(parseInt(m[1], 10) >= 1 && parseInt(m[1], 10) <= 4294967295)) {
      return { raw: 'set failed: invalid ASN' };
    }
    mem.bgp.asn = parseInt(m[1], 10);
    mem.bgp.routerId = m[2];
    return { raw: '' };
  }
  m = t.match(/^set\s+protocols\s+bgp\s+(\d+)\s+neighbor\s+(\S+)\s+remote-as\s+(\d+)/i);
  if (m) {
    mem.bgp.asn = parseInt(m[1], 10);
    if (!mem.bgp.peers.some((p) => p.remoteAddr === m[2])) {
      mem.bgp.peers.push({ remoteAs: parseInt(m[3], 10), remoteAddr: m[2], name: m[2] });
    }
    return { raw: '' };
  }
  m = t.match(/^set\s+protocols\s+bgp\s+(\d+)\s+address-family\s+ipv4-unicast\s+network\s+(\S+)/i);
  if (m) {
    mem.bgp.asn = parseInt(m[1], 10);
    if (!mem.bgp.networks) mem.bgp.networks = [];
    const cidr = cidrOf(m[2]);
    if (!mem.bgp.networks.includes(cidr)) mem.bgp.networks.push(cidr);
    return { raw: '' };
  }
  m = t.match(/^set\s+protocols\s+bgp\s+(\d+)\s+network\s+(\S+)/i);
  if (m) {
    mem.bgp.asn = parseInt(m[1], 10);
    if (!mem.bgp.networks) mem.bgp.networks = [];
    const cidr = cidrOf(m[2]);
    if (!mem.bgp.networks.includes(cidr)) mem.bgp.networks.push(cidr);
    return { raw: '' };
  }

  // ACL — firewall name
  m = t.match(/^set\s+firewall\s+name\s+(\S+)\s+rule\s+(\d+)\s+action\s+(accept|drop|reject)/i);
  if (m) {
    mem.natSrcDraft = mem.natSrcDraft || {};
    const key = `${String(m[1])}:${String(m[2])}`;
    const d = mem.natSrcDraft['fw_' + key] || (mem.natSrcDraft['fw_' + key] = {});
    d.action = m[3].toLowerCase() === 'accept' ? 'permit' : 'deny';
    return { raw: '' };
  }
  m = t.match(/^set\s+firewall\s+name\s+(\S+)\s+rule\s+(\d+)\s+protocol\s+(\S+)/i);
  if (m) {
    mem.natSrcDraft = mem.natSrcDraft || {};
    const key = `${String(m[1])}:${String(m[2])}`;
    const d = mem.natSrcDraft['fw_' + key] || (mem.natSrcDraft['fw_' + key] = {});
    d.proto = m[3].toLowerCase();
    return { raw: '' };
  }
  m = t.match(/^set\s+firewall\s+name\s+(\S+)\s+rule\s+(\d+)\s+(?:source|destination)\s+address\s+(\S+)/i);
  if (m) {
    mem.natSrcDraft = mem.natSrcDraft || {};
    const key = `${String(m[1])}:${String(m[2])}`;
    const d = mem.natSrcDraft['fw_' + key] || (mem.natSrcDraft['fw_' + key] = {});
    const isSrc = /^set\s+firewall\s+name\s+\S+\s+rule\s+\d+\s+source\s+address/i.test(t);
    if (isSrc) d.src = m[3];
    else d.dst = m[3];
    if (d.action) {
      mem.acls.push({ action: d.action, proto: d.proto || 'any', src: d.src || 'any', dst: d.dst || 'any' });
      delete mem.natSrcDraft['fw_' + key];
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
  if (/^show\s+service\s+dhcp-server/i.test(t) || /^show\s+dhcp-server/i.test(t)) {
    return { type: 'dhcp_print', pools: mem.dhcpPools };
  }
  if (/^show\s+nat/i.test(t)) {
    return { type: 'nat_print', rules: mem.natRules };
  }
  return undefined;
}
