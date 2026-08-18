// GENERATED — dispatcher penghapusan config lintas vendor (diekstraksi dari index.ts lama).
import type { NormalizedCommand } from '../../../cli/src/index';

import { resolveIfaceName } from './ip';
import { mergeIps } from './state';
import { restoreJuniper } from './memory';
import type { NodeMemory, VendorContext, CommandResult } from './types';

export function handleDeletion(rawInput: string, normalized: NormalizedCommand, vendorId: string, mem: NodeMemory, context: VendorContext): CommandResult | undefined {

    const input = rawInput.trim();
    const lower = input.toLowerCase();
    const isCisco = vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba';
    const isVyosLike = vendorId === 'vyos' || vendorId === 'ubiquiti';
    const err = (msg: string) => ({ raw: msg });

    // ── IP address normalization: "x y" (mask) or "x/y" (cidr) → CIDR string ──
    const toCidr = (s: string): string => {
      const m = s.trim().match(/^(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)$/);
      if (!m) return s.trim();
      const octets = m[2].split('.').map(Number);
      const bits = octets.reduce((acc, o) => acc + (o.toString(2).match(/1/g) || []).length, 0);
      return `${m[1]}/${bits}`;
    };

    // ── Valid netmask? (contiguous 1-bits, e.g. 255.255.255.0, 0.0.0.0) ──
    const isNetmask = (s: string): boolean => {
      const m = s.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
      if (!m) return false;
      const octets = m.slice(1).map(Number);
      if (octets.some((o) => o < 0 || o > 255)) return false;
      const bits = octets.reduce((acc, o) => acc + (o.toString(2).match(/1/g) || []).length, 0);
      // netmask = bits pertama bernilai 1, sisanya 0
      const expected = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      const value = octets.reduce((acc, o) => (acc << 8) + o, 0) >>> 0;
      return value === expected;
    };

    // ── Cisco IOS / NX-OS / Aruba "no <config>" ─────────────────────────────
    if (isCisco && /^no\s+/i.test(input)) {
      // no ip address (interface view) — removes the IPv4 address from the interface
      if (/^no\s+ip\s+(?:address|addr)\s*$/i.test(input)) {
        if (!mem.currentIface) return err('% Error: no interface selected (enter interface config first)');
        const removed = mem.configuredIps[mem.currentIface];
        if (!removed) return err(`% No address configured on ${mem.currentIface}`);
        delete mem.configuredIps[mem.currentIface];
        mem.dhcpClients = (mem.dhcpClients || []).filter((c) => c.iface !== mem.currentIface);
        return { raw: '' };
      }
      // no ip address <ip> <mask> (interface view)
      if (/^no\s+ip\s+(?:address|addr)\s+\d+\.\d+\.\d+\.\d+\s+\d+\.\d+\.\d+\.\d+\s*$/i.test(input) || /^no\s+ip\s+(?:address|addr)\s+[0-9a-fA-F:.]+\/\d+\s*$/i.test(input)) {
        if (!mem.currentIface) return err('% Error: no interface selected (enter interface config first)');
        const target = toCidr(input.replace(/^no\s+ip\s+(?:address|addr)\s+/i, ''));
        const cur = mem.configuredIps[mem.currentIface];
        if (!cur) return err(`% No address configured on ${mem.currentIface}`);
        const curCidr = toCidr(cur);
        if (curCidr !== target && cur !== input.replace(/^no\s+ip\s+(?:address|addr)\s+/i, '')) {
          return err(`% Address ${target} not configured on ${mem.currentIface}`);
        }
        delete mem.configuredIps[mem.currentIface];
        mem.dhcpClients = (mem.dhcpClients || []).filter((c) => c.iface !== mem.currentIface);
        return { raw: '' };
      }
      // no ipv6 address <addr> — only when a link-local/global actually exists
      if (/^no\s+ipv6\s+address\b/i.test(input)) {
        if (!mem.currentIface) return err('% Error: no interface selected (enter interface config first)');
        const target = input.replace(/^no\s+ipv6\s+address\s*/i, '').trim() || null;
        if (target) {
          const cur = mem.configuredIps6?.[mem.currentIface];
          if (!cur) return err(`% No IPv6 address configured on ${mem.currentIface}`);
          if (cur !== target) return err(`% IPv6 address ${target} not configured on ${mem.currentIface}`);
          if (mem.configuredIps6) delete mem.configuredIps6[mem.currentIface];
          return { raw: '' };
        }
        return err('% Incomplete command');
      }
      // no ip route <dst> [mask] [gw]  /  no ip route default <gw>
      if (/^no\s+ip\s+route\s+/i.test(input) || /^no\s+ip\s+route-static\s+/i.test(input)) {
        const rest = input.replace(/^(?:no\s+ip\s+route|no\s+ip\s+route-static)\s+/i, '');
        const parts = rest.split(/\s+/).filter(Boolean);
        let dst: string | null = null;
        let gw: string | null = null;
        if (parts.length >= 2) {
          dst = parts[0].toLowerCase() === 'default' ? '0.0.0.0/0' : toCidr(parts[0]);
          // parts[1] adalah netmask HANYA jika memang bentuk mask (mis. 255.255.255.0 / 0.0.0.0),
          // bukan sebuah gateway — sehingga "no ip route 0.0.0.0 0.0.0.0 10.0.0.1" terhapus dengan benar.
          if (parts.length >= 3 && isNetmask(parts[1])) {
            // secondary prefix form "no ip route 10.0.0.0 255.255.255.0 10.0.0.1"
            dst = toCidr(`${parts[0]} ${parts[1]}`);
            gw = parts[2] || null;
          } else if (parts.length === 2 && isNetmask(parts[1])) {
            dst = toCidr(`${parts[0]} ${parts[1]}`);
          } else {
            // two-part form "no ip route 10.0.0.0 10.0.0.1" — argumen kedua adalah gateway
            gw = parts[1];
          }
        } else {
          return err('% Incomplete command: no ip route <destination> <mask> <next-hop>');
        }
        const before = mem.routes.length;
        mem.routes = mem.routes.filter((r) => {
          if (gw && r.gateway !== gw) return true;
          return toCidr(String(r.dst)) !== dst;
        });
        if (mem.routes.length === before) return err(`% No matching route to ${dst}${gw ? ` via ${gw}` : ''}`);
        return { raw: '' };
      }
      // no vlan <id> / no interface vlan <id> — remove VLAN + SVI + port mappings
      const vlanIdMatch = input.match(/^no\s+(?:interface\s+)?vlan\s+(\d+)\s*$/i);
      if (vlanIdMatch) {
        const id = vlanIdMatch[1];
        const before = mem.vlans.length;
        mem.vlans = mem.vlans.filter((v) => String(v.id) !== String(id));
        for (const [iface, v] of Object.entries(mem.portVlans || {})) {
          if (String(v) === String(id)) delete mem.portVlans[iface];
        }
        mem.subinterfaces = (mem.subinterfaces || []).filter((s) => String(s.vlanId) !== String(id));
        if (mem.vlans.length === before) return err(`% VLAN ${id} does not exist`);
        if (String(mem.currentVlan) === String(id)) mem.currentVlan = '';
        return { raw: '' };
      }
      // no ip dhcp pool <name>
      const poolMatch = input.match(/^no\s+ip\s+dhcp\s+pool\s+(\S+)\s*$/i);
      if (poolMatch) {
        const before = mem.dhcpPools.length;
        mem.dhcpPools = mem.dhcpPools.filter((p) => p.name !== poolMatch[1]);
        if (mem.dhcpPools.length === before) return err(`% DHCP pool ${poolMatch[1]} does not exist`);
        if (mem.currentDhcpPool === poolMatch[1]) mem.currentDhcpPool = '';
        return { raw: '' };
      }
      // no ip host <name>
      const hostMatch = input.match(/^no\s+ip\s+host\s+(\S+)\s*$/i);
      if (hostMatch) {
        const before = mem.dnsRecords.length;
        mem.dnsRecords = mem.dnsRecords.filter((d) => d.name !== hostMatch[1].toLowerCase());
        if (mem.dnsRecords.length === before) return err(`% Host ${hostMatch[1]} does not exist`);
        return { raw: '' };
      }
      // no ip ospf cost <n> — hapus cost interface OSPF
      if (/^no\s+(?:ip\s+)?ospf\s+cost\s*$/i.test(input)) {
        if (!mem.currentIface) return err('% Error: no interface selected');
        if (!mem.routing.ospf.interfaceCosts[mem.currentIface]) return err(`% No OSPF cost configured on ${mem.currentIface}`);
        delete mem.routing.ospf.interfaceCosts[mem.currentIface];
        return { raw: '' };
      }
      // no passive-interface <iface> — aktifkan adjacency kembali
      const noPassive = input.match(/^no\s+passive-interface\s+(\S+)\s*$/i);
      if (noPassive) {
        const iface = resolveIfaceName(context?.ports, noPassive[1]) || noPassive[1];
        const before = (mem.routing.ospf.passiveInterfaces || []).length;
        mem.routing.ospf.passiveInterfaces = (mem.routing.ospf.passiveInterfaces || []).filter((i: string) => i !== iface);
        if (mem.routing.ospf.passiveInterfaces.length === before) return err(`% Interface ${iface} is not passive`);
        return { raw: '' };
      }
      // no ip helper-address — hapus DHCP relay
      if (/^no\s+ip\s+helper-address\s*$/i.test(input)) {
        if (!mem.currentIface) return err('% Error: no interface selected');
        if (!mem.dhcpRelays[mem.currentIface]) return err(`% No helper-address configured on ${mem.currentIface}`);
        delete mem.dhcpRelays[mem.currentIface];
        return { raw: '' };
      }
      // no switchport port-security — matikan port security
      if (/^no\s+switchport\s+port-security\s*$/i.test(input)) {
        if (!mem.currentIface) return err('% Error: no interface selected');
        if (!mem.portSecurity[mem.currentIface]) return err(`% Port security not configured on ${mem.currentIface}`);
        delete mem.portSecurity[mem.currentIface];
        return { raw: '' };
      }
      // no ipv6 address autoconfig — hentikan SLAAC pada interface
      if (/^no\s+ipv6\s+address\s+(?:autoconfig|dhcp)\s*$/i.test(input)) {
        if (!mem.currentIface) return err('% Error: no interface selected');
        mem.ipv6DhcpClients = (mem.ipv6DhcpClients || []).filter((i: string) => i !== mem.currentIface);
        return { raw: '' };
      }
      // no ip name-server [<ip>]
      if (/^no\s+ip\s+name-server\s*$/i.test(input)) {
        mem.dnsServers = [];
        return { raw: '' };
      }
      // no switchport access vlan — kembalikan port ke mode access tanpa VLAN
      if (/^no\s+switchport\s+access\s+vlan\s*$/i.test(input)) {
        if (!mem.currentIface) return err('% Error: no interface selected (enter interface config first)');
        if (!(mem.portVlans || {})[mem.currentIface]) return err(`% No access VLAN configured on ${mem.currentIface}`);
        delete mem.portVlans[mem.currentIface];
        return { raw: '' };
      }
      // no switchport trunk allowed vlan — trunk kembali membawa SEMUA VLAN
      if (/^no\s+switchport\s+trunk\s+allowed\s+vlan\s*$/i.test(input)) {
        if (!mem.currentIface) return err('% Error: no interface selected (enter interface config first)');
        if (!(mem.trunkAllowed || {})[mem.currentIface]) return err(`% No trunk allowed list configured on ${mem.currentIface}`);
        delete mem.trunkAllowed[mem.currentIface];
        return { raw: '' };
      }
      // no switchport trunk native vlan — hapus VLAN native trunk
      if (/^no\s+switchport\s+trunk\s+native\s+vlan\s*$/i.test(input)) {
        if (!mem.currentIface) return err('% Error: no interface selected (enter interface config first)');
        if (!(mem.trunkNative || {})[mem.currentIface]) return err(`% No trunk native VLAN configured on ${mem.currentIface}`);
        delete mem.trunkNative[mem.currentIface];
        return { raw: '' };
      }
      const nsMatch = input.match(/^no\s+ip\s+name-server\s+(\S+)\s*$/i);
      if (nsMatch) {
        const before = mem.dnsServers.length;
        mem.dnsServers = (mem.dnsServers || []).filter((s: string) => s !== nsMatch[1]);
        if (mem.dnsServers.length === before) return err(`% Name-server ${nsMatch[1]} not configured`);
        return { raw: '' };
      }
      // no access-list <id> — hapus ACL firewall (extended) DAN natAcls (standard)
      const aclMatch = input.match(/^no\s+(?:ip\s+)?access-list\s+\d+\s*$/i);
      if (aclMatch) {
        const id = parseInt(input.match(/\d+/)?.[0] || '0', 10);
        const beforeAcl = mem.acls.length;
        mem.acls = mem.acls.filter((r) => r.aclId !== id);
        const hadNat = mem.natAcls?.[String(id)] !== undefined;
        if (mem.natAcls) delete mem.natAcls[String(id)];
        if (beforeAcl === mem.acls.length && !hadNat) return err(`% Access-list ${id} does not exist`);
        return { raw: '' };
      }
      // no ip nat inside source static tcp <in-ip> <in-port> <pub-ip> <pub-port>
      const natMatch = input.match(/^no\s+ip\s+nat\s+inside\s+source\s+static\s+tcp\s+(\S+)\s+(\d+)\s+(\S+)\s+(\d+)\s*$/i);
      if (natMatch) {
        const before = mem.natRules.length;
        mem.natRules = mem.natRules.filter((r) =>
          !(r.chain === 'dstnat' && r.protocol === 'tcp' && r.dstAddress === natMatch[3] && r.dstPort === natMatch[4] && r.toAddresses === natMatch[1] && r.toPorts === natMatch[2])
        );
        if (mem.natRules.length === before) return err('% No matching NAT translation');
        return { raw: '' };
      }
      // no router ospf <pid> | no router bgp <asn> | no router rip | no router eigrp <as>
      const routerMatch = input.match(/^no\s+router\s+(ospf|bgp|rip|eigrp)(?:\s+\d+)?\s*$/i);
      if (routerMatch) {
        const proto = routerMatch[1].toLowerCase() as 'ospf' | 'bgp' | 'rip' | 'eigrp';
        if (proto === 'ospf' || proto === 'rip' || proto === 'eigrp') {
          mem.routing[proto] = { enabled: false, networks: [], ...(proto === 'eigrp' ? { asn: 0 } : {}) };
          if (mem.currentProto === proto) mem.currentProto = '';
        } else {
          mem.bgp = { asn: '', routerId: '', peers: [], networks: [] };
          if (mem.currentProto === 'bgp') mem.currentProto = '';
        }
        return { raw: '' };
      }
      // no ipv6 route <…> handled by engine-side config reset below only if present
      return undefined; // let existing chain handle remaining "no …" (shutdown, spanning-tree …)
    }

    // ── MikroTik "/ip … remove" / "numbers=" ────────────────────────────────
    if (vendorId === 'mikrotik' && /\bremove\b/i.test(input)) {
      const nums = (input.match(/numbers=(\d[\d,.-]*)/i)?.[1] || '').split(',').map((s: string) => parseInt(s, 10)).filter((n: number) => !isNaN(n) && n >= 0);
      const findAddr = (input.match(/find\s+.*address=([^\s\]]+)/i)?.[1] || input.match(/address=([^\s\]]+)/i)?.[1] || '').replace(/[",]/g, '');
      const findIface = (input.match(/find\s+.*interface=([^\s\]]+)/i)?.[1] || input.match(/interface=([^\s\]]+)/i)?.[1] || '').replace(/[",]/g, '');
      const findName = (input.match(/find\s+.*name=([^\s\]]+)/i)?.[1] || input.match(/name=([^\s\]]+)/i)?.[1] || '').replace(/[",]/g, '');
      const findDst = (input.match(/find\s+.*dst-address=([^\s\]]+)/i)?.[1] || '').replace(/[",]/g, '');
      const findDstPort = (input.match(/find\s+.*dst-port=([^\s\]]+)/i)?.[1] || '').replace(/[",]/g, '');
      const findChain = (input.match(/find\s+.*chain=([^\s\]]+)/i)?.[1] || '').replace(/[",]/g, '');
      const idx = <T,>(arr: T[], n: number): T | undefined => (n < 0 || n >= arr.length ? undefined : arr[n]);

      const fail = (msg: string) => err(`% ${msg}`);

      // /ip address remove [find address=…] / [find interface=…] / numbers=N
      if (/^\/ip\s+address\s+remove\b/i.test(input)) {
        // Urutan tampilan "/ip address print" mengikuti urutan port (mergeIps),
        // jadi index numbers= harus merujuk urutan port — bukan insertion order.
        const portOrder: string[] = [];
        for (const p of context?.ports || []) if (mem.configuredIps[String(p.name)]) portOrder.push(String(p.name));
        for (const k of Object.keys(mem.configuredIps)) if (!portOrder.includes(k)) portOrder.push(k);
        const keys = portOrder;
        let removed = false;
        if (nums.length > 0) {
          const k = idx(keys, nums[0]);
          if (k === undefined) return fail('no such item');
          delete mem.configuredIps[k];
          mem.dhcpClients = (mem.dhcpClients || []).filter((c) => c.iface !== k);
          removed = true;
        } else if (findAddr) {
          for (const k of keys) {
            if (toCidr(mem.configuredIps[k]) === toCidr(findAddr.replace(/^\/\d+$/, '')) || mem.configuredIps[k] === findAddr) {
              delete mem.configuredIps[k];
              mem.dhcpClients = (mem.dhcpClients || []).filter((c) => c.iface !== k);
              removed = true;
            }
          }
          if (!removed) {
            const addrOnly = findAddr.split('/')[0];
            for (const k of keys) {
              if (mem.configuredIps[k].startsWith(addrOnly)) {
                delete mem.configuredIps[k];
                mem.dhcpClients = (mem.dhcpClients || []).filter((c) => c.iface !== k);
                removed = true;
              }
            }
          }
          if (!removed) return fail(`no such address ${findAddr}`);
        } else if (findIface) {
          const k = resolveIfaceName(context?.ports, findIface) || findIface;
          if (!mem.configuredIps[k]) return fail(`no such interface ${findIface}`);
          delete mem.configuredIps[k];
          mem.dhcpClients = (mem.dhcpClients || []).filter((c) => c.iface !== k);
          removed = true;
        } else {
          return err('% Usage: /ip address remove [find address=<ip/mask>] | [find interface=<iface>] | numbers=<n>');
        }
        return removed ? { raw: '' } : fail('no such item');
      }
      // /ip route remove
      if (/^\/ip\s+route\s+remove\b/i.test(input)) {
        if (nums.length > 0) {
          const r = idx(mem.routes, nums[0]);
          if (!r) return fail('no such item');
          mem.routes.splice(nums[0], 1);
          return { raw: '' };
        }
        if (findDst) {
          const before = mem.routes.length;
          mem.routes = mem.routes.filter((r) => toCidr(String(r.dst)) !== toCidr(findDst));
          if (mem.routes.length === before) return fail(`no such route to ${findDst}`);
          return { raw: '' };
        }
        return err('% Usage: /ip route remove [find dst-address=<dst>] | numbers=<n>');
      }
      // /ip firewall nat remove
      if (/^\/ip\s+firewall\s+nat\s+remove\b/i.test(input)) {
        if (nums.length > 0) {
          const r = idx(mem.natRules, nums[0]);
          if (!r) return fail('no such item');
          mem.natRules.splice(nums[0], 1);
          return { raw: '' };
        }
        const before = mem.natRules.length;
        mem.natRules = mem.natRules.filter((r) =>
          (!findChain || r.chain === findChain) &&
          (!findDstPort || String(r.dstPort) === findDstPort) &&
          (!findAddr || (r.dstAddress || '') === findAddr || (r.srcAddress || '') === findAddr)
        );
        if (mem.natRules.length === before) return fail('no such nat rule found');
        return { raw: '' };
      }
      // /ip firewall filter remove
      if (/^\/ip\s+firewall\s+filter\s+remove\b/i.test(input)) {
        if (nums.length > 0) {
          const r = idx(mem.acls, nums[0]);
          if (!r) return fail('no such item');
          mem.acls.splice(nums[0], 1);
          return { raw: '' };
        }
        const before = mem.acls.length;
        mem.acls = mem.acls.filter((r) =>
          (!findChain || r.chain === findChain) &&
          (!findAddr || r.src === findAddr || r.dst === findAddr)
        );
        if (mem.acls.length === before) return fail('no such filter rule found');
        return { raw: '' };
      }
      // /ip firewall mangle remove
      if (/^\/ip\s+firewall\s+mangle\s+remove\b/i.test(input)) {
        if (nums.length > 0) {
          const r = idx(mem.mangleRules, nums[0]);
          if (!r) return fail('no such item');
          mem.mangleRules.splice(nums[0], 1);
          return { raw: '' };
        }
        return err('% Usage: /ip firewall mangle remove numbers=<n>');
      }
      // /ip pool remove [find name=…]  /  /ip dhcp-server remove [find name=…]
      if (/^\/ip\s+(?:pool|dhcp-server)\s+remove\b/i.test(input)) {
        if (!findName) return err(`% Usage: /ip ${input.match(/\/ip\s+(\S+)/i)?.[1]} remove [find name=<nama>]`);
        const before = mem.dhcpPools.length;
        mem.dhcpPools = mem.dhcpPools.filter((p) => p.name !== findName);
        if (mem.dhcpPools.length === before) return fail(`no such item (${findName})`);
        return { raw: '' };
      }
      // /ip dhcp-client remove [find interface=…]
      if (/^\/ip\s+dhcp-client\s+remove\b/i.test(input)) {
        const iface = findIface || (input.match(/interface=([^\s\]]+)/i)?.[1] || '').replace(/[",]/g, '');
        if (!iface) return err('% Usage: /ip dhcp-client remove [find interface=<iface>]');
        const before = mem.dhcpClients.length;
        mem.dhcpClients = (mem.dhcpClients || []).filter((c) => c.iface !== iface);
        if (mem.dhcpClients.length === before) return fail('no such dhcp client');
        return { raw: '' };
      }
      // /ip dhcp-relay remove [find interface=…] — hapus DHCP relay
      if (/^\/ip\s+dhcp-relay\s+remove\b/i.test(input)) {
        const ifaceRaw = findIface || (input.match(/interface=([^\s\]]+)/i)?.[1] || '').replace(/[",]/g, '');
        const iface = resolveIfaceName(context?.ports, ifaceRaw) || ifaceRaw;
        if (!iface) return err('% Usage: /ip dhcp-relay remove [find interface=<iface>]');
        if (!mem.dhcpRelays[iface]) return fail('no such dhcp relay');
        delete mem.dhcpRelays[iface];
        return { raw: '' };
      }
      // /ipv6 dhcp-client remove [find interface=…] — hentikan SLAAC/DHCPv6 client
      if (/^\/ipv6\s+dhcp-client\s+remove\b/i.test(input)) {
        const ifaceRaw = findIface || (input.match(/interface=([^\s\]]+)/i)?.[1] || '').replace(/[",]/g, '');
        const iface = resolveIfaceName(context?.ports, ifaceRaw) || ifaceRaw;
        if (!iface) return err('% Usage: /ipv6 dhcp-client remove [find interface=<iface>]');
        const before = (mem.ipv6DhcpClients || []).length;
        mem.ipv6DhcpClients = (mem.ipv6DhcpClients || []).filter((i: string) => i !== iface);
        if (mem.ipv6DhcpClients.length === before) return fail('no such ipv6 dhcp client');
        return { raw: '' };
      }
      // /routing ospf interface remove [find interface=…] — hapus cost/passive OSPF
      if (/^\/routing\s+ospf\s+interface\s+remove\b/i.test(input)) {
        const ifaceRaw = findIface || (input.match(/interface=([^\s\]]+)/i)?.[1] || '').replace(/[",]/g, '');
        const iface = resolveIfaceName(context?.ports, ifaceRaw) || ifaceRaw;
        if (!iface) return err('% Usage: /routing ospf interface remove [find interface=<iface>]');
        delete mem.routing.ospf.interfaceCosts[iface];
        mem.routing.ospf.passiveInterfaces = (mem.routing.ospf.passiveInterfaces || []).filter((i: string) => i !== iface);
        return { raw: '' };
      }
      // /ip dns static remove [find name=…]
      if (/^\/ip\s+dns\s+static\s+remove\b/i.test(input)) {
        if (!findName) return err('% Usage: /ip dns static remove [find name=<hostname>]');
        const before = mem.dnsRecords.length;
        mem.dnsRecords = mem.dnsRecords.filter((d) => d.name !== findName.toLowerCase());
        if (mem.dnsRecords.length === before) return fail(`no such dns record (${findName})`);
        return { raw: '' };
      }
      // /interface vlan remove [find name=…]
      if (/^\/interface\s+vlan\s+remove\b/i.test(input)) {
        if (!findName) return err('% Usage: /interface vlan remove [find name=<nama>]');
        const vlan = mem.vlans.find((v) => v.name === findName);
        if (!vlan) return fail(`no such vlan (${findName})`);
        mem.vlans = mem.vlans.filter((v) => v.name !== findName);
        mem.subinterfaces = (mem.subinterfaces || []).filter((s) => s.name !== findName && String(s.vlanId) !== String(vlan.id));
        return { raw: '' };
      }
      return undefined;
    }

    // ── Juniper "delete <path>" ─────────────────────────────────────────────
    if (vendorId === 'juniper' && /^delete\s+/i.test(input)) {
      // delete interfaces <iface> unit 0 family inet address <ip/mask>
      const ifaceMatch = input.match(/^delete\s+interfaces\s+(\S+)\s+unit\s+\d+\s+family\s+(?:inet6?\s+)?address\s+(\S+)\s*$/i);
      if (ifaceMatch) {
        const iface = resolveIfaceName(context?.ports, ifaceMatch[1]) || ifaceMatch[1];
        const addr = ifaceMatch[2].replace(/\/\d+$/, '');
        const cur = mem.configuredIps[iface];
        if (!cur) return err('error: address not found');
        if (!cur.startsWith(addr) && toCidr(cur) !== toCidr(ifaceMatch[2])) return err(`error: address ${ifaceMatch[2]} does not exist on ${iface}`);
        delete mem.configuredIps[iface];
        return { raw: '' };
      }
      // delete interfaces <iface> unit 0 — remove all addresses
      const ifaceAll = input.match(/^delete\s+interfaces\s+(\S+)\s+unit\s+\d+\s*$/i) || input.match(/^delete\s+interfaces\s+(\S+)\s*$/i);
      if (ifaceAll) {
        const iface = resolveIfaceName(context?.ports, ifaceAll[1]) || ifaceAll[1];
        if (!mem.configuredIps[iface]) return err(`error: no address configured on ${iface}`);
        delete mem.configuredIps[iface];
        return { raw: '' };
      }
      // delete routing-options static route <dst>
      const staticMatch = input.match(/^delete\s+routing-options\s+static\s+route\s+(\S+)\s*$/i);
      if (staticMatch) {
        const before = mem.routes.length;
        mem.routes = mem.routes.filter((r) => toCidr(String(r.dst)) !== toCidr(staticMatch[1]));
        if (mem.routes.length === before) return err(`error: route ${staticMatch[1]} does not exist`);
        return { raw: '' };
      }
      // delete system host-name
      if (/^delete\s+system\s+host-name\s*$/i.test(input)) {
        if (!mem.hostname) return err('error: host-name is not configured');
        mem.hostname = '';
        return { raw: '' };
      }
      // delete system name-server [<ip>]
      if (/^delete\s+system\s+name-server\s*$/i.test(input)) {
        const server = input.replace(/^delete\s+system\s+name-server\s*/i, '').trim();
        if (server) {
          const before = mem.dnsServers.length;
          mem.dnsServers = (mem.dnsServers || []).filter((s: string) => s !== server);
          if (mem.dnsServers.length === before) return err(`error: name-server ${server} does not exist`);
        } else {
          mem.dnsServers = [];
        }
        return { raw: '' };
      }
      // delete vlans <name>
      const vlanJ = input.match(/^delete\s+vlans\s+(\S+)\s*$/i);
      if (vlanJ) {
        const before = mem.vlans.length;
        mem.vlans = mem.vlans.filter((v) => v.name !== vlanJ[1]);
        if (mem.vlans.length === before) return err(`error: vlan ${vlanJ[1]} does not exist`);
        return { raw: '' };
      }
      // delete routing-options static — remove all static routes
      if (/^delete\s+routing-options\s+static\s*$/i.test(input)) {
        if (mem.routes.length === 0) return err('error: no static routes configured');
        mem.routes = [];
        return { raw: '' };
      }
      return undefined;
    }

    // ── VyOS / EdgeOS "delete <path>" (and normalized delete_config action) ─
    if (isVyosLike && (/^delete\s+/i.test(input) || normalized.action === 'delete_config')) {
      // delete interfaces ethernet <iface> address <ip/mask>
      const vIface = input.match(/^delete\s+interfaces\s+\S+\s+(\S+)\s+address\s+(\S+)\s*$/i);
      if (vIface) {
        const iface = resolveIfaceName(context?.ports, vIface[1]) || vIface[1];
        const cur = mem.configuredIps[iface];
        if (!cur) return err('Configuration path: interfaces ethernet ' + vIface[1] + ' address\\n\\n is not a valid command or cannot be deleted.\\nDelete failed');
        if (toCidr(cur) !== toCidr(vIface[2])) return err(`Configuration path: interfaces ethernet ${vIface[1]} address ${vIface[2]}\\n\nDelete failed`);
        delete mem.configuredIps[iface];
        return { raw: '' };
      }
      // delete interfaces ethernet <iface>
      const vIfaceAll = input.match(/^delete\s+interfaces\s+\S+\s+(\S+)\s*$/i);
      if (vIfaceAll) {
        const iface = resolveIfaceName(context?.ports, vIfaceAll[1]) || vIfaceAll[1];
        if (!mem.configuredIps[iface] && mem.currentIface !== iface) return err(`Configuration path: interfaces ethernet ${vIfaceAll[1]}\\n\nDelete failed`);
        delete mem.configuredIps[iface];
        return { raw: '' };
      }
      // delete protocols static route <dst>
      const vStatic = input.match(/^delete\s+protocols\s+static\s+route\s+(\S+)\s*$/i);
      if (vStatic) {
        const before = mem.routes.length;
        mem.routes = mem.routes.filter((r) => toCidr(String(r.dst)) !== toCidr(vStatic[1]));
        if (mem.routes.length === before) return err(`Configuration path: protocols static route ${vStatic[1]}\\n\nDelete failed`);
        return { raw: '' };
      }
      // delete system host-name
      if (/^delete\s+system\s+host-name\s*$/i.test(input)) {
        mem.hostname = '';
        return { raw: '' };
      }
      // delete system name-server
      if (/^delete\s+system\s+name-server\s*$/i.test(input)) {
        mem.dnsServers = [];
        return { raw: '' };
      }
      return undefined;
    }

    // ── Huawei "undo <config>" ──────────────────────────────────────────────
    if (vendorId === 'huawei' && /^undo\s+/i.test(input)) {
      // undo ip address [<ip> <mask>] (interface view)
      if (/^undo\s+ip\s+(?:address|addr)\b/i.test(input)) {
        if (!mem.currentIface) return err('% Error: enter interface view first (interface <name>)');
        const rest = input.replace(/^undo\s+ip\s+(?:address|addr)\s*/i, '').trim();
        const cur = mem.configuredIps[mem.currentIface];
        if (!cur) return err(`% No IP address configured on interface ${mem.currentIface}`);
        if (rest) {
          const target = toCidr(rest);
          if (toCidr(cur) !== target && cur !== rest) return err(`% The IP address does not exist on interface ${mem.currentIface}`);
        }
        delete mem.configuredIps[mem.currentIface];
        mem.dhcpClients = (mem.dhcpClients || []).filter((c) => c.iface !== mem.currentIface);
        return { raw: '' };
      }
      // undo ip route-static <dst> [mask] <gw>
      if (/^undo\s+ip\s+route-static\s+/i.test(input)) {
        const rest = input.replace(/^undo\s+ip\s+route-static\s+/i, '');
        const parts = rest.split(/\s+/).filter(Boolean);
        let dst: string;
        let gw = parts[1] || null;
        if (parts.length >= 2 && /^\d+\.\d+\.\d+\.\d+$/.test(parts[1])) {
          dst = toCidr(`${parts[0]} ${parts[1]}`);
          gw = parts[2] || null;
        } else {
          dst = toCidr(parts[0]);
          gw = parts[1] || null;
        }
        const before = mem.routes.length;
        mem.routes = mem.routes.filter((r) => {
          if (gw && r.gateway !== gw) return true;
          return toCidr(String(r.dst)) !== dst;
        });
        if (mem.routes.length === before) return err(`% Error: The route (${dst}) does not exist`);
        return { raw: '' };
      }
      // undo vlan <id>
      const hVlan = input.match(/^undo\s+vlan\s+(\d+)\s*$/i);
      if (hVlan) {
        const id = hVlan[1];
        const before = mem.vlans.length;
        mem.vlans = mem.vlans.filter((v) => String(v.id) !== String(id));
        for (const [iface, v] of Object.entries(mem.portVlans || {})) {
          if (String(v) === String(id)) delete mem.portVlans[iface];
        }
        mem.subinterfaces = (mem.subinterfaces || []).filter((s) => String(s.vlanId) !== String(id));
        if (mem.vlans.length === before) return err(`% Error: The VLAN does not exist`);
        return { raw: '' };
      }
      // undo ip host <name>
      const hHost = input.match(/^undo\s+ip\s+host\s+(\S+)\s*$/i);
      if (hHost) {
        const before = mem.dnsRecords.length;
        mem.dnsRecords = mem.dnsRecords.filter((d) => d.name !== hHost[1].toLowerCase());
        if (mem.dnsRecords.length === before) return err(`% Error: The host does not exist`);
        return { raw: '' };
      }
      return undefined;
    }

    // ── OpenWrt "uci delete …" ──────────────────────────────────────────────
    if (vendorId === 'openwrt' && /^uci\s+delete\s+/i.test(input)) {
      const path = input.replace(/^uci\s+delete\s+/i, '').trim();
      // uci delete network.<iface>.ipaddr  / network.<iface>.ip6addr
      const netIface = path.match(/^network\.(\S+?)\.ip(?:6)?addr\s*$/i);
      if (netIface) {
        let iface = netIface[1];
        if (iface === 'lan' || iface === 'wan' || iface === 'wan6') iface = 'ether' + (iface === 'lan' ? 1 : 0);
        const k = resolveIfaceName(context?.ports, iface) || iface;
        if (!mem.configuredIps[k]) return err(`uci: Entry not found: ${path}`);
        delete mem.configuredIps[k];
        return { raw: '' };
      }
      // uci delete system.@system[0].hostname
      if (/^system\.@system\[0\]\.hostname\s*$/i.test(path)) {
        if (!mem.hostname) return err(`uci: Entry not found: ${path}`);
        mem.hostname = '';
        return { raw: '' };
      }
      // uci delete network.<iface> — remove whole interface config (and its IP)
      const netWipe = path.match(/^network\.(\S+)\s*$/i);
      if (netWipe) {
        let iface = netWipe[1];
        if (iface === 'lan' || iface === 'wan' || iface === 'wan6') iface = 'ether' + (iface === 'lan' ? 1 : 0);
        const k = resolveIfaceName(context?.ports, iface) || iface;
        const had = mem.configuredIps[k] !== undefined;
        delete mem.configuredIps[k];
        if (!had) return err(`uci: Entry not found: ${path}`);
        return { raw: '' };
      }
      return undefined;
    }

    // ── Linux "ip addr del" / "ip route del" ────────────────────────────────
    if (vendorId === 'linux' && (/^ip\s+addr(?:ess)?\s+del\s+/i.test(input) || /^ip\s+route\s+(?:del|delete)\s+/i.test(input))) {
      if (/^ip\s+addr(?:ess)?\s+del\s+/i.test(input)) {
        const m = input.match(/^ip\s+addr(?:ess)?\s+del\s+(\S+)\s+dev\s+(\S+)\s*$/i);
        if (!m) return err('% Usage: ip addr del <ip/prefix> dev <iface>');
        const iface = resolveIfaceName(context?.ports, m[2]) || m[2];
        const cur = mem.configuredIps[iface];
        if (!cur) return err(`RTNETLINK answers: No such process`);
        if (toCidr(cur) !== toCidr(m[1])) return err(`RTNETLINK answers: Cannot assign requested address`);
        delete mem.configuredIps[iface];
        return { raw: '' };
      }
      const m = input.match(/^ip\s+route\s+(?:del|delete)\s+(\S+)(?:\s+via\s+(\S+))?\s*$/i);
      if (!m) return err('% Usage: ip route del <dst> via <gw>');
      const dst = toCidr(m[1].toLowerCase() === 'default' ? '0.0.0.0/0' : m[1]);
      const gw = m[2] || null;
      const before = mem.routes.length;
      mem.routes = mem.routes.filter((r) => {
        if (gw && r.gateway !== gw) return true;
        return toCidr(String(r.dst)) !== dst;
      });
      if (mem.routes.length === before) return err('RTNETLINK answers: No such process');
      return { raw: '' };
    }

    // ── Juniper / VyOS "rollback" — kembalikan konfigurasi ke snapshot commit terakhir ──
    if ((vendorId === 'juniper' || isVyosLike) && /^rollback(?:\s+0)?\s*$/i.test(input)) {
      const snap = mem.juniperCommitted;
      if (!snap) return err('error: no configuration to roll back');
      restoreJuniper(mem, snap);
      return { raw: 'configuration rolled back' };
    }

    return undefined;
  
}
