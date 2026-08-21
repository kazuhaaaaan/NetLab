// GENERATED — branch handler vendor openwrt (diekstraksi dari dispatch() lama).
import type { CommandResult, ChainEntry, ChainEnv } from '../common/types';
import { registerEntries } from '../common/chain';

import { resolveIfaceName, maskToBits, cidrOf, networkOfMask, bitsToMask } from '../common/ip';
import type { NodeMemory, VendorContext } from '../common/types';

export const openwrtEntries: ChainEntry[] = [
  {
    name: 'b9',
    order: 9,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (vendorId === 'openwrt'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;
cmdResult = openwrtCommand(rawInput, context, mem);
    
    // OpenWrt: dnsmasq (uci dhcp), static route & NAT (uci network/firewall), DNS hosts.
        
    return cmdResult;
  },
  },
  {
    name: 'b58',
    order: 58,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^uci\s+set\s+system\.@system\[0\]\.hostname=(\S+)/i.test(rawInput.trim()) && vendorId === 'openwrt'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const m = rawInput.trim().match(/^uci\s+set\s+system\.@system\[0\]\.hostname=(\S+)/i);
          if (m) {
            mem.hostname = m[1];
            cmdResult = { raw: '' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b65',
    order: 65,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^uci\s+set\s+network\.(\S+)\.vlan=(\d+)/i.test(rawInput.trim()) && vendorId === 'openwrt'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // OpenWrt: "uci set network.vlan10.vlan=10"
          const m = rawInput.trim().match(/^uci\s+set\s+network\.(\S+)\.vlan=(\d+)/i);
          if (m) {
            const idNum = parseInt(m[2], 10);
            if (!(idNum >= 1 && idNum <= 4094)) {
              cmdResult = { raw: 'error: vlan-id out of range (1..4094)' };
            } else {
              const existing = mem.vlans.find((v) => String(v.id) === m![2]);
              if (existing) existing.name = m![1];
              else mem.vlans.push({ id: m![2], name: m![1] });
              cmdResult = { raw: '' };
            }
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b191',
    order: 191,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'cat_file' && vendorId === 'openwrt'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const path = String(payload?.path || '');
          if (/openwrt_release|os-release|version/i.test(path)) {
            cmdResult = {
              raw: [
                'DISTRIB_ID="OpenWrt"',
                'DISTRIB_RELEASE="23.05.3"',
                'DISTRIB_REVISION="r23809-234f1a2efa"',
                'DISTRIB_TARGET="x86/64"',
                'DISTRIB_ARCH="x86_64"',
                'DISTRIB_DESCRIPTION="OpenWrt 23.05.3 x86/64"',
                'DISTRIB_TAINTS=""',
              ].join('\n'),
            };
          } else {
            cmdResult = { type: 'cat_file', path };
          }
        
    return cmdResult;
  },
  },
];

registerEntries('openwrt', openwrtEntries);

export function openwrtCommand(raw: string, context: VendorContext, mem: NodeMemory): CommandResult | undefined {
  const t = raw.trim();
  let m: RegExpMatchArray | null;

  // uci set — tampung semua, kecuali yang sudah ditangani engine generik
  m = t.match(/^uci\s+set\s+(\S+)=(\S*)/i);
  if (m) {
    const key = m[1].toLowerCase();
    // biarkan branch generik menangani hostname & network.X.vlan
    if (/^system\.@system\[0\]\.hostname$/i.test(key)) return undefined;
    if (/^network\.\S+\.vlan$/i.test(key)) return undefined;
    mem.uciPending = mem.uciPending || {};
    mem.uciPending[key] = m[2];
    return { raw: '' };
  }

  // uci add firewall redirect → buat slot baru
  m = t.match(/^uci\s+add\s+firewall\s+redirect/i);
  if (m) {
    mem.uciRedirects = mem.uciRedirects || {};
    const idx = Object.keys(mem.uciRedirects).length;
    mem.uciRedirects[String(idx)] = {};
    return { raw: '' };
  }

  // uci commit → terapkan semua yang tertunda
  m = t.match(/^uci\s+commit\s*(?:(\S+))?/i);
  if (m) {
    commitUci(mem, context);
    return { raw: '' };
  }

  // DNS static — /etc/hosts
  m = t.match(/^echo\s+["']?(\d+\.\d+\.\d+\.\d+)\s+(\S+)["']?\s*>>?\s*\/etc\/hosts/i);
  if (m) {
    mem.dnsRecords.push({ name: m[2].toLowerCase().replace(/["']/g, ''), address: m[1] });
    return { raw: '' };
  }

  // Tampilan
  if (/^uci\s+show\s+dhcp/i.test(t)) {
    return { type: 'dhcp_print', pools: mem.dhcpPools };
  }
  if (/^uci\s+show\s+firewall/i.test(t)) {
    return { type: 'nat_print', rules: mem.natRules };
  }
  if (/^uci\s+show\s+network/i.test(t)) {
    return {
      type: 'uci_network_show',
      mem: { configuredIps: mem.configuredIps, dhcpClients: mem.dhcpClients, routes: mem.routes },
    };
  }
  return undefined;
}

export function commitUci(mem: NodeMemory, context: VendorContext): void {
  const pending = mem.uciPending || {};
  const keys = Object.keys(pending);
  for (const key of keys) {
    const value = pending[key];
    // dnsmasq DHCP: uci set dhcp.<section>.<opt>=<val>
    const dhcpMatch = key.match(/^dhcp\.(\S+?)\.(start|limit|interface|leasetime|dhcpv4|enable)$/i);
    if (dhcpMatch) {
      const section = dhcpMatch[1];
      const opt = dhcpMatch[2].toLowerCase();
      let pool = mem.dhcpPools.find((x) => x.name === section);
      if (!pool) {
        pool = { name: section, range: '', network: '', iface: '', gateway: '' };
        mem.dhcpPools.push(pool);
      }
      if (opt === 'start') pool.start = value;
      else if (opt === 'limit') pool.limit = value;
      else if (opt === 'interface') pool.iface = resolveIfaceName(context?.ports, value) || value;
      else if (opt === 'enable' && value.toLowerCase() === '0') pool.disabled = true;
      continue;
    }
    if (key.match(/^dhcp\.([^.\s]+)$/i)) {
      // dnsmasq host: uci set dhcp.host1=host → blok reservasi statis
      // (hanya SECTION murni; dhcp.host1.mac/.ip ditangani branch berikut).
      if (value.toLowerCase() === 'host') {
        mem.uciHosts = mem.uciHosts || {};
        mem.uciHosts[key.match(/^dhcp\.([^.\s]+)$/i)?.[1] || ''] = mem.uciHosts[key.match(/^dhcp\.([^.\s]+)$/i)?.[1] || ''] || {};
        mem.uciHosts[key.match(/^dhcp\.([^.\s]+)$/i)?.[1] || ''].type = 'host';
      }
      continue;
    }
    // dnsmasq host options: uci set dhcp.host1.mac=... / dhcp.host1.ip=...
    const hostOptMatch = key.match(/^dhcp\.(\S+?)\.(mac|ip)$/i);
    if (hostOptMatch) {
      mem.uciHosts = mem.uciHosts || {};
      const section = hostOptMatch[1];
      mem.uciHosts[section] = mem.uciHosts[section] || {};
      mem.uciHosts[section][hostOptMatch[2].toLowerCase()] = value;
      continue;
    }
    // static route: uci set network.routeN.target / .gateway / .netmask
    const routeMatch = key.match(/^network\.(route\d+)\.(target|gateway|netmask)$/i);
    if (routeMatch) {
      const section = routeMatch[1];
      const opt = routeMatch[2].toLowerCase();
      let route = mem.routes.find((r) => r.section === section);
      if (!route) {
        route = { section, dst: '', gateway: '', distance: 1 };
        mem.routes.push(route);
      }
      if (opt === 'target') route.dst = value;
      else if (opt === 'gateway') route.gateway = value;
      else route.rawMask = value;
      continue;
    }
    if (key.match(/^network\.route\d+$/i)) continue;
    // firewall masquerade: uci set firewall.@zone[n].masq=1
    if (key.match(/^firewall\.@zone\[\d+\]\.masq$/i) && value === '1') {
      mem.natRules.push({ chain: 'srcnat', action: 'masquerade', outInterface: '' });
      continue;
    }
    // firewall redirect: uci set firewall.@redirect[n].<opt>=<val>
    const redirMatch = key.match(/^firewall\.@redirect\[(\d+)\]\.(\S+)$/i);
    if (redirMatch) {
      mem.uciRedirects = mem.uciRedirects || {};
      const idx = redirMatch[1];
      if (!mem.uciRedirects[idx]) mem.uciRedirects[idx] = {};
      mem.uciRedirects[idx][redirMatch[2].toLowerCase()] = value;
      continue;
    }
  }
  // netmask terpisah (OpenWrt) → dst berformat CIDR
  for (const r of mem.routes) {
    if (r.rawMask && !String(r.dst || '').includes('/')) r.dst = `${String(r.dst)}/${String(maskToBits(String(r.rawMask)))}`;
    delete r.rawMask;
  }
  // host dnsmasq (mac+ip) → reservasi DHCP statis
  if (mem.uciHosts) {
    mem.dhcpReservations = mem.dhcpReservations || [];
    for (const section of Object.values(mem.uciHosts)) {
      if (section.type === 'host' && section.mac && section.ip) {
        mem.dhcpReservations.push({ mac: section.mac, ip: section.ip });
      }
    }
  }
  // flush redirect → dstnat (port-forward).
  // Catatan: dest_ip adalah IP INTERNAL tujuan; paket datang ke IP publik
  // router (mana saja), jadi dstAddress dibiarkan kosong agar cocok dengan
  // port yang diminta — bukan di-translate ke dirinya sendiri.
  const redirects = mem.uciRedirects || {};
  for (const idx of Object.keys(redirects)) {
    const r = redirects[idx];
    if (r && r.src_dport && r.dest_ip) {
      mem.natRules.push({
        chain: 'dstnat',
        action: 'dst-nat',
        protocol: String(r.proto || 'tcp').toLowerCase(),
        dstPort: r.src_dport,
        dstAddress: '',
        toAddresses: r.dest_ip,
        toPorts: r.dest_port || r.src_dport,
      });
      delete mem.uciRedirects[idx];
    }
  }
  // network.<iface>.ipaddr/netmask/gateway/proto → IP interface + DHCP client
  for (const key of keys) {
    const value = pending[key];
    const lanMatch = key.match(/^network\.(\S+?)\.(ipaddr|netmask|gateway|proto)$/i);
    if (lanMatch) {
      const ifaceRaw = lanMatch[1];
      const opt = lanMatch[2].toLowerCase();
      // "lan" = interface ether1 (sesuai uci delete network.lan → ether1)
      const iface = resolveIfaceName(context?.ports, ifaceRaw === 'loopback' ? 'lo' : ifaceRaw) || ifaceRaw;
      if (opt === 'ipaddr') {
        const mask = pending[`network.${String(ifaceRaw)}.netmask`] || '255.255.255.0';
        mem.configuredIps[iface] = `${String(value)}/${String(maskToBits(mask))}`;
        if (!mem.ifaceSettings) mem.ifaceSettings = {};
      } else if (opt === 'proto' && value.toLowerCase() === 'dhcp') {
        if (!mem.dhcpClients) mem.dhcpClients = [];
        if (!mem.dhcpClients.some((c) => c.iface === iface)) {
          mem.dhcpClients.push({ iface, addDefaultRoute: true, status: 'searching' });
        }
      } else if (opt === 'gateway') {
        if (!mem.routes.some((r2) => r2.gateway === value)) {
          mem.routes.push({ dst: '0.0.0.0/0', gateway: value, distance: 1 });
        }
      }
    }
  }
  // selesaikan pool DHCP yang punya start/limit tapi belum range absolut —
  // diturunkan dari IP interface NYATA; tanpa IP interface, range tidak
  // dikarang (jujur: network DHCP tidak bisa diturunkan).
  for (const pool of mem.dhcpPools) {
    if (pool.start && !pool.range) {
      const baseIp = pool.iface ? ((mem.configuredIps || {})[pool.iface] || '') : '';
      if (!baseIp) continue;
      const c = cidrOf(baseIp);
      const [netIp, prefix] = c.split('/');
      // network = alamat SUBNET nyata (bukan IP host) dari IP interface.
      const netAddr = networkOfMask(netIp, bitsToMask(Number(prefix))) || `${String(netIp)}/${String(prefix)}`;
      const octets = netAddr.split('/')[0].split('.');
      octets[3] = String(Number(pool.start));
      const startIp = octets.join('.');
      octets[3] = String(Number(pool.start) + (Number(pool.limit) || 100) - 1);
      pool.range = `${String(startIp)}-${String(octets.join('.'))}`;
      pool.network = netAddr;
      delete pool.start;
      delete pool.limit;
    }
  }
  mem.uciPending = {};
}
