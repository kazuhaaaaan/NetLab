// GENERATED — branch handler vendor fortinet (diekstraksi dari dispatch() lama).
import type { CommandResult, ChainEntry, ChainEnv, FortiPolicyDraft } from '../common/types';
import { registerEntries } from '../common/chain';

import { resolveIfaceName, cidrOf, networkOfMask, bitsToMask, isValidIpv4 } from '../common/ip';
import { grantDhcpClient, upsertSubinterface } from '../common/state';
import type { NodeMemory, VendorContext } from '../common/types';

export const fortinetEntries: ChainEntry[] = [
  {
    name: 'b5',
    order: 5,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (vendorId === 'fortinet'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;
cmdResult = fortinetCommand(rawInput, context, mem);
    
    // Fortinet: DHCP server, VLAN, OSPF, BGP, firewall policy (NAT), VIP port-forward,
    // firewall address, DNS — semuanya lewat mode "config ... / edit ... / set ... / end".
        
    return cmdResult;
  },
  },
  {
    name: 'b44',
    order: 44,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (vendorId === 'fortinet' && /^set\s+ip\s+\S+\s+\S+/i.test(rawInput.trim())),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const m = rawInput.trim().match(/^set\s+ip\s+(\S+)\s+(\S+)/i);
          if (m && mem.currentIface) {
            mem.configuredIps[mem.currentIface] = `${String(m[1])} ${String(m[2])}`;
            cmdResult = { raw: '' };
          } else {
            cmdResult = { raw: '% Error: enter interface config first (config system interface → edit <name>)' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b51',
    order: 51,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^set\s+hostname\s+"?(\S+)"?/i.test(rawInput.trim()) && vendorId === 'fortinet'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Fortinet: "set hostname <nama>" (dari config system global)
          const m = rawInput.trim().match(/^set\s+hostname\s+"?(\S+)"?/i);
          if (m) {
            mem.hostname = m[1].replace(/"/g, '');
            cmdResult = { raw: '' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b52',
    order: 52,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (vendorId === 'fortinet' && /^set\s+dst\s+\S+\s+\S+/i.test(rawInput.trim())),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Fortinet: "set dst <ip> <mask>" (dari config router static → edit <n>)
          const m = rawInput.trim().match(/^set\s+dst\s+(\S+)\s+(\S+)/i);
          if (m) {
            mem.currentStaticDst = `${String(m[1])} ${String(m[2])}`;
            cmdResult = { raw: '' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b53',
    order: 53,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (vendorId === 'fortinet' && /^set\s+gateway\s+\S+/i.test(rawInput.trim())),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Fortinet: "set gateway <ip>" — lengkapi rute statis
          const m = rawInput.trim().match(/^set\s+gateway\s+(\S+)/i);
          if (m && mem.currentStaticDst) {
            if (!isValidIpv4(String(m[1]))) {
              cmdResult = { raw: `% Error: invalid gateway IP "${String(m[1])}"` };
            } else {
              mem.routes.push({ dst: mem.currentStaticDst, gateway: m[1], distance: 1 });
              mem.currentStaticDst = '';
              cmdResult = { raw: '' };
            }
          } else {
            cmdResult = { raw: '% Usage: set dst <ip> <mask> dulu, lalu set gateway <ip>' };
          }
        
    return cmdResult;
  },
  },
];

registerEntries('fortinet', fortinetEntries);

export function fortinetCommand(raw: string, context: VendorContext, mem: NodeMemory): CommandResult | undefined {
  const t = raw.trim();
  const path = mem.fortiPath || (mem.fortiPath = []);

  // ── masuk mode config ──────────────────────────────────────────
  if (/^config\s+system\s+dhcp\s+server/i.test(t)) {
    path.splice(0, path.length, 'dhcp');
    mem.fortiInRange = false;
    return { raw: '' };
  }
  if (/^config\s+system\s+dhcp\s+client/i.test(t)) {
    path.splice(0, path.length, 'dhcpc');
    return { raw: '' };
  }
  if (/^config\s+system\s+interface/i.test(t)) {
    path.splice(0, path.length, 'iface');
    mem.fortiPendingVlan = 0;
    return { raw: '' };
  }
  if (/^config\s+system\s+dns/i.test(t)) {
    path.splice(0, path.length, 'dns');
    return { raw: '' };
  }
  if (/^config\s+router\s+ospf/i.test(t)) {
    path.splice(0, path.length, 'ospf');
    mem.routing.ospf.enabled = true;
    return { raw: '' };
  }
  if (/^config\s+router\s+bgp/i.test(t)) {
    path.splice(0, path.length, 'bgp');
    return { raw: '' };
  }
  if (/^config\s+firewall\s+policy/i.test(t)) {
    path.splice(0, path.length, 'policy');
    mem.fortiDraft = {};
    return { raw: '' };
  }
  if (/^config\s+firewall\s+vip/i.test(t)) {
    path.splice(0, path.length, 'vip');
    mem.fortiDraft = {};
    return { raw: '' };
  }
  if (/^config\s+firewall\s+address/i.test(t)) {
    path.splice(0, path.length, 'address');
    return { raw: '' };
  }
  if (/^config\s+firewall\s+addrgrp/i.test(t)) {
    path.splice(0, path.length, 'addrgrp');
    return { raw: '' };
  }

  const top = path[path.length - 1];

  // ── DHCP server: config ip-range / edit / set … ────────────────
  if (top === 'dhcp') {
    if (/^config\s+ip-range/i.test(t)) {
      mem.fortiInRange = true;
      return { raw: '' };
    }
    if (/^end|^quit$/i.test(t)) {
      if (mem.fortiInRange) mem.fortiInRange = false;
      else path.pop();
      return { raw: '' };
    }
    let m = t.match(/^edit\s+(\S+)/i);
    if (m) {
      const idx = Number(m[1]) || 1;
      if (mem.fortiInRange) mem.fortiRangeIdx = idx;
      else mem.fortiDhcpIdx = idx;
      return { raw: '' };
    }
    const pool = (() => {
      let p = mem.dhcpPools.find((x) => x.idx === mem.fortiDhcpIdx);
      if (!p) {
        p = { idx: mem.fortiDhcpIdx, name: `dhcp${String(mem.fortiDhcpIdx)}`, range: '', network: '', iface: '', gateway: '' };
        mem.dhcpPools.push(p);
      }
      return p;
    })();
    m = t.match(/^set\s+interface\s+(\S+)/i);
    if (m && !mem.fortiInRange) {
      pool.iface = resolveIfaceName(context?.ports, m[1]) || m[1];
      return { raw: '' };
    }
    m = t.match(/^set\s+netmask\s+(\S+)/i);
    if (m && !mem.fortiInRange) {
      pool.netmask = m[1];
      return { raw: '' };
    }
    m = t.match(/^set\s+default-gateway\s+(\S+)/i);
    if (m && !mem.fortiInRange) {
      pool.gateway = m[1];
      return { raw: '' };
    }
    m = t.match(/^set\s+dns-server\s+(\S+)/i);
    if (m && !mem.fortiInRange) {
      if (!mem.dnsServers.includes(m[1])) mem.dnsServers.push(m[1]);
      return { raw: '' };
    }
    if (mem.fortiInRange) {
      m = t.match(/^set\s+start-ip\s+(\S+)/i);
      if (m) {
        pool.startIp = m[1];
        finalizeFortiPool(pool, mem);
        return { raw: '' };
      }
      m = t.match(/^set\s+end-ip\s+(\S+)/i);
      if (m) {
        pool.endIp = m[1];
        finalizeFortiPool(pool, mem);
        return { raw: '' };
      }
    }
    m = t.match(/^set\s+lease-time\s+(\d+)/i);
    if (m && !mem.fortiInRange) {
      const seconds = parseInt(m[1], 10);
      if (seconds > 0) pool.leaseTimeMs = seconds * 1000;
      return { raw: '' };
    }
    m = t.match(/^set\s+(mode|ntp-sync|timezone-option)\s+/i);
    if (m) return { raw: '' };
    return undefined;
  }

  // ── DHCP client: config system dhcp client → edit <iface> → set mode dhcp ──
  if (top === 'dhcpc') {
    let m = t.match(/^edit\s+(\S+)/i);
    if (m) {
      mem.fortiDhcpClient = resolveIfaceName(context?.ports, m[1]) || m[1];
      return { raw: '' };
    }
    if (/^set\s+mode\s+dhcp/i.test(t)) {
      if (!mem.fortiDhcpClient) return { raw: '% Error: enter interface first (edit <name>)' };
      return { raw: grantDhcpClient(context, mem, mem.fortiDhcpClient, true) };
    }
    if (/^set\s+default-route\s+\S+/i.test(t)) return { raw: '' };
    if (/^(?:end|quit)$/i.test(t)) {
      path.pop();
      return { raw: '' };
    }
    return undefined;
  }

  // ── OSPF: set router-id / config network / edit / set prefix ──
  if (top === 'ospf') {
    if (/^config\s+network/i.test(t)) {
      path.push('ospfnet');
      return { raw: '' };
    }
    let m = t.match(/^set\s+router-id\s+(\S+)/i);
    if (m) {
      mem.routing.ospf.routerId = m[1];
      return { raw: '' };
    }
    if (/^(?:end|quit)$/i.test(t)) {
      path.pop();
      return { raw: '' };
    }
    return undefined;
  }
  if (top === 'ospfnet') {
    const m = t.match(/^set\s+prefix\s+(\S+)\s+(\S+)/i);
    if (m) {
      const net = `${String(m[1])} ${String(m[2])}`;
      if (!mem.routing.ospf.networks.includes(net)) mem.routing.ospf.networks.push(net);
      return { raw: '' };
    }
    if (/^(?:end|quit)$/i.test(t)) {
      path.pop();
      return { raw: '' };
    }
    return undefined;
  }

  // ── BGP: set as / router-id / config neighbor / edit / remote-as ──
  if (top === 'bgp') {
    if (/^config\s+neighbor/i.test(t)) {
      path.push('bgpnei');
      return { raw: '' };
    }
    let m = t.match(/^set\s+as\s+(\d+)/i);
    if (m) {
      const asn = parseInt(m[1], 10);
      if (!(asn >= 1 && asn <= 4294967295)) {
        return { raw: '% Error: invalid autonomous system number' };
      }
      mem.bgp.asn = asn;
      return { raw: '' };
    }
    m = t.match(/^set\s+router-id\s+(\S+)/i);
    if (m) {
      mem.bgp.routerId = m[1];
      return { raw: '' };
    }
    m = t.match(/^set\s+network\s+(\S+)/i);
    if (m) {
      if (!mem.bgp.networks) mem.bgp.networks = [];
      const cidr = cidrOf(m[1]);
      if (!mem.bgp.networks.includes(cidr)) mem.bgp.networks.push(cidr);
      return { raw: '' };
    }
    if (/^(?:end|quit)$/i.test(t)) {
      path.pop();
      return { raw: '' };
    }
    return undefined;
  }
  if (top === 'bgpnei') {
    let m = t.match(/^edit\s+(\S+)/i);
    if (m) {
      mem.fortiBgpPeer = m[1];
      return { raw: '' };
    }
    m = t.match(/^set\s+remote-as\s+(\d+)/i);
    if (m && mem.fortiBgpPeer) {
      mem.bgp.peers.push({ remoteAs: parseInt(m[1], 10), remoteAddr: mem.fortiBgpPeer, name: mem.fortiBgpPeer });
      return { raw: '' };
    }
    if (/^(?:end|quit)$/i.test(t)) {
      path.pop();
      return { raw: '' };
    }
    return undefined;
  }

  // ── firewall policy: edit / set srcintf dstintf action nat … / next ──
  if (top === 'policy') {
    const d = mem.fortiDraft || (mem.fortiDraft = {});
    let m = t.match(/^edit\s+(\S+)/i);
    if (m) {
      mem.fortiDraft = { id: m[1] };
      return { raw: '' };
    }
    if (/^next$/i.test(t)) {
      commitFortiPolicy(mem, d);
      mem.fortiDraft = {};
      return { raw: '' };
    }
    if (/^(?:end|quit)$/i.test(t)) {
      commitFortiPolicy(mem, d);
      mem.fortiDraft = {};
      path.pop();
      return { raw: '' };
    }
    m = t.match(/^set\s+srcintf\s+(\S+)/i);
    if (m) { d.srcIntf = m[1].replace(/"/g, ''); return { raw: '' }; }
    m = t.match(/^set\s+dstintf\s+(\S+)/i);
    if (m) { d.dstIntf = m[1].replace(/"/g, ''); return { raw: '' }; }
    m = t.match(/^set\s+action\s+(accept|deny|drop)/i);
    if (m) { d.action = m[1].toLowerCase(); return { raw: '' }; }
    m = t.match(/^set\s+nat\s+(enable|disable)/i);
    if (m) { d.nat = m[1].toLowerCase() === 'enable'; return { raw: '' }; }
    m = t.match(/^set\s+srcaddr\s+(\S+)/i);
    if (m) { d.srcAddr = m[1].replace(/"/g, ''); return { raw: '' }; }
    m = t.match(/^set\s+dstaddr\s+(\S+)/i);
    if (m) { d.dstAddr = m[1].replace(/"/g, ''); return { raw: '' }; }
    m = t.match(/^set\s+service\s+(\S+)/i);
    if (m) { d.service = m[1].toLowerCase().replace(/"/g, ''); return { raw: '' }; }
    return undefined;
  }

  // ── firewall vip: edit / extip / mappedip / extintf / portforward / end ──
  if (top === 'vip') {
    const d = mem.fortiDraft || (mem.fortiDraft = {});
    let m = t.match(/^edit\s+(\S+)/i);
    if (m) {
      mem.fortiDraft = { name: m[1] };
      return { raw: '' };
    }
    if (/^(?:end|quit)$/i.test(t)) {
      if (d.portforward && d.mappedip) {
        mem.natRules.push({
          chain: 'dstnat',
          action: 'dst-nat',
          protocol: d.protocol || 'tcp',
          dstAddress: d.extip || '',
          dstPort: d.extPort || '',
          toAddresses: d.mappedip,
          toPorts: d.mappedPort || '',
        });
      }
      mem.fortiDraft = {};
      path.pop();
      return { raw: '' };
    }
    m = t.match(/^set\s+extip\s+(\S+)/i);
    if (m) { d.extip = m[1].replace(/"/g, ''); return { raw: '' }; }
    m = t.match(/^set\s+mappedip\s+(\S+)/i);
    if (m) { d.mappedip = m[1].replace(/"/g, ''); return { raw: '' }; }
    m = t.match(/^set\s+extintf\s+(\S+)/i);
    if (m) { d.extIntf = m[1].replace(/"/g, ''); return { raw: '' }; }
    m = t.match(/^set\s+portforward\s+enable/i);
    if (m) { d.portforward = true; return { raw: '' }; }
    m = t.match(/^set\s+protocol\s+(\S+)/i);
    if (m) { d.protocol = m[1].toLowerCase().replace(/"/g, ''); return { raw: '' }; }
    m = t.match(/^set\s+extport\s+(\S+)/i);
    if (m) { d.extPort = m[1].replace(/"/g, ''); return { raw: '' }; }
    m = t.match(/^set\s+mappedport\s+(\S+)/i);
    if (m) { d.mappedPort = m[1].replace(/"/g, ''); return { raw: '' }; }
    return undefined;
  }

  // ── firewall address: edit / set subnet ──
  if (top === 'address' || top === 'addrgrp') {
    let m = t.match(/^edit\s+(\S+)/i);
    if (m) {
      mem.fortiAddrName = m[1];
      mem.fortiAddrGroup = [];
      return { raw: '' };
    }
    m = t.match(/^set\s+subnet\s+(\S+)\s+(\S+)/i);
    if (m && mem.fortiAddrName) {
      mem.fortiAddresses[mem.fortiAddrName] = `${String(m[1])} ${String(m[2])}`;
      return { raw: '' };
    }
    m = t.match(/^set\s+member\s+(.+)$/i);
    if (m && mem.fortiAddrName) {
      mem.fortiAddresses[mem.fortiAddrName] = m[1].trim().split(/\s+/)
        .map((n: string) => mem.fortiAddresses[n] || n)
        .join(' ');
      return { raw: '' };
    }
    if (/^(?:end|quit)$/i.test(t)) {
      path.pop();
      return { raw: '' };
    }
    return undefined;
  }

  // ── system dns: set primary / set secondary ──
  if (top === 'dns') {
    let m = t.match(/^set\s+primary\s+(\S+)/i);
    if (m) {
      if (!mem.dnsServers.includes(m[1])) mem.dnsServers.push(m[1]);
      return { raw: '' };
    }
    m = t.match(/^set\s+secondary\s+(\S+)/i);
    if (m) {
      if (!mem.dnsServers.includes(m[1])) mem.dnsServers.push(m[1]);
      return { raw: '' };
    }
    if (/^(?:end|quit)$/i.test(t)) {
      path.pop();
      return { raw: '' };
    }
    return undefined;
  }

  // ── system interface: set vlanid / set interface <parent> (VLAN trunk) ──
  if (top === 'iface') {
    let m = t.match(/^set\s+vlanid\s+(\d+)/i);
    if (m) {
      const v = parseInt(m[1], 10);
      if (!(v >= 1 && v <= 4094)) {
        return { raw: '% Error: VLAN ID must be in range 1..4094.' };
      }
      mem.fortiPendingVlan = v;
      return { raw: '' };
    }
    m = t.match(/^set\s+interface\s+(\S+)/i);
    if (m && mem.fortiPendingVlan) {
      const name = `${String(mem.currentIface)}.${String(mem.fortiPendingVlan)}`;
      upsertSubinterface(mem, name, mem.currentIface, mem.fortiPendingVlan);
      if (!mem.vlans.find((v) => v.id === String(mem.fortiPendingVlan))) {
        mem.vlans.push({ id: String(mem.fortiPendingVlan), name: name });
      }
      mem.fortiPendingVlan = 0;
      return { raw: '' };
    }
    if (/^(?:end|quit)$/i.test(t)) {
      mem.fortiPendingVlan = 0;
      path.pop();
      return { raw: '' };
    }
    return undefined;
  }

  // ── quit dari mode lain / tampilan status ──
  if (/^quit$/i.test(t)) {
    path.splice(0);
    return { raw: '' };
  }
  if (/^(?:get|show)\s+system\s+dhcp\s+server/i.test(t) || /^show\s+system\s+dhcp\s+server/i.test(t)) {
    return { type: 'dhcp_print', pools: mem.dhcpPools };
  }
  if (/^(?:get|show)\s+system\s+dhcp\s+client/i.test(t) || /^show\s+system\s+dhcp\s+client/i.test(t)) {
    return { type: 'dhcp_client_print', clients: mem.dhcpClients };
  }
  if (/^(?:get|show)\s+router\s+info\s+ospf/i.test(t) || /^show\s+router\s+ospf/i.test(t)) {
    return { type: 'proto_print', routing: mem.routing, bgp: mem.bgp };
  }
  if (/^(?:get|show)\s+router\s+info\s+bgp/i.test(t) || /^show\s+router\s+bgp/i.test(t)) {
    return { type: 'proto_print', routing: mem.routing, bgp: mem.bgp };
  }
  return undefined;
}

export function finalizeFortiPool(pool: NodeMemory['dhcpPools'][number], mem: NodeMemory): void {
  if (pool.startIp && pool.endIp) {
    pool.range = `${String(pool.startIp)}-${String(pool.endIp)}`;
    // network = subnet NYATA dari IP interface (bukan tebakan dari range
    // start — salah untuk subnet non-/24). Tanpa IP interface, network
    // dibiarkan kosong (jujur), tidak dikarang.
    const ifaceIp = pool.iface ? (mem.configuredIps || {})[pool.iface] : undefined;
    const parts = ifaceIp ? String(ifaceIp).split(/[\s/]+/) : [];
    if (parts.length >= 2) {
      const mask = parts[1].includes('.') ? parts[1] : bitsToMask(Number(parts[1]));
      const net = networkOfMask(parts[0], mask);
      if (net) pool.network = net;
    }
  }
}

export function commitFortiPolicy(mem: NodeMemory, d: FortiPolicyDraft | null | undefined): void {
  if (!d || !d.id) return;
  if (d.nat && d.dstIntf) {
    mem.natRules.push({
      chain: 'srcnat',
      action: 'masquerade',
      outInterface: d.dstIntf,
      srcAddress: resolveFortiAddress(mem, d.srcAddr) || '',
    });
  }
  if (d.action === 'deny') {
    mem.acls.push({
      action: 'deny',
      proto: String(d.service || 'any'),
      src: resolveFortiAddress(mem, d.srcAddr) || 'any',
      dst: resolveFortiAddress(mem, d.dstAddr) || 'any',
    });
  }
}

export function resolveFortiAddress(mem: NodeMemory, name: string | undefined): string {
  if (!name || name === 'all' || !mem.fortiAddresses) return name || '';
  const resolved = mem.fortiAddresses[name];
  return resolved || name;
}
