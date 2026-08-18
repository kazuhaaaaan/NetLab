// GENERATED — helper formatter output vendor (diekstraksi dari index.ts lama).

import { cidrOf, bitsToMask, wildcardToCidr, maskedPair, wildcardOf } from './ip';
import { mergeIps } from './state';
import type { NodeMemory, VendorContext, WirelessAp } from './types';

export function fakeDnsIp(domain: string): string {
  let h = 5381;
  for (let i = 0; i < domain.length; i++) {
    h = ((h << 5) + h + domain.charCodeAt(i)) >>> 0;
  }
  return `10.${String((h >>> 16) % 240 + 8)}.${String((h >>> 8) % 240 + 8)}.${String(h % 240 + 8)}`;
}

export function uciNetworkLines(mem: Partial<Pick<NodeMemory, 'configuredIps' | 'dhcpClients' | 'routes'>>): string[] {
  const lines: string[] = [];
  const keyOf = (name: string): string => name.replace(/[^A-Za-z0-9_]/g, '_') || 'iface';
  const seen = new Set<string>();
  const pushIface = (name: string): string => {
    const key = keyOf(name);
    if (seen.has(key)) return key;
    seen.add(key);
    lines.push(`network.${String(key)}=interface`);
    lines.push(`network.${String(key)}.ifname='${String(name)}'`);
    return key;
  };
  for (const [iface, raw] of Object.entries(mem.configuredIps || {})) {
    if (!iface || raw === undefined || raw === null || raw === '') continue;
    const c = cidrOf(String(raw));
    const [ip, pref] = c.split('/');
    if (!ip) continue;
    const key = pushIface(iface);
    lines.push(`network.${String(key)}.proto='static'`);
    lines.push(`network.${String(key)}.ipaddr='${String(ip)}'`);
    lines.push(`network.${String(key)}.netmask='${String(bitsToMask(Number(pref) || 24))}'`);
  }
  for (const c of mem.dhcpClients || []) {
    if (!c || !c.iface) continue;
    const key = pushIface(c.iface);
    lines.push(`network.${String(key)}.proto='dhcp'`);
  }
  (mem.routes || []).forEach((r, i: number) => {
    const dst = String(r.dst || '').trim().split(/\s+/)[0];
    if (!dst || !r.gateway) return;
    lines.push(`network.route${String(i)}=route`);
    lines.push(`network.route${String(i)}.target='${String(dst.split('/')[0])}'`);
    const pref = dst.includes('/') ? Number(dst.split('/')[1]) : NaN;
    if (!Number.isNaN(pref)) lines.push(`network.route${String(i)}.netmask='${String(bitsToMask(pref))}'`);
    lines.push(`network.route${String(i)}.gateway='${String(r.gateway)}'`);
  });
  return lines;
}

export function formatExtended(cmdResult): string {
  if (!cmdResult) return '';
  if (cmdResult.type === 'vlan_print' || cmdResult.type === 'show_vlan') {
    const vlans = (cmdResult.vlans || []) as Array<Record<string, unknown>>;
    if (vlans.length === 0) return 'Flags: X - disabled, R - running\n # NAME      VLAN-ID   INTERFACE\n -- no entries --';
    const rows = vlans.map((v, i: number) =>
      ` ${String(i)} ${String(String(v.name || 'vlan' + v.id).padEnd(10))} ${String(String(v.id).padEnd(10))} ${String(v.iface || '')}`
    ).join('\n');
    return 'Flags: X - disabled, R - running\n # NAME      VLAN-ID   INTERFACE\n' + rows;
  }
  if (cmdResult.type === 'dhcp_print') {
    const pools = (cmdResult.pools || []) as Array<Record<string, unknown>>;
    if (pools.length === 0) return ' -- no DHCP servers --';
    const rows = pools.map((p, i: number) =>
      ` ${String(i)} ${String(String(p.name || 'pool' + i).padEnd(12))} ${String(String(p.network || p.range || '-').padEnd(22))} ${String(String(p.iface || '-').padEnd(12))} ${String(p.gateway || '-')}`
    ).join('\n');
    return ' # NAME         NETWORK/RANGE           INTERFACE    GATEWAY\n' + rows;
  }
  if (cmdResult.type === 'dhcp_client_print') {
    const clients = (cmdResult.clients || []) as Array<Record<string, unknown>>;
    if (clients.length === 0) return 'Flags: X - disabled, I - invalid, B - bound\n #    INTERFACE    ADD-DEFAULT-ROUTE    STATUS\n -- no entries --';
    const rows = clients.map((c, i: number) =>
      ` ${String(i)} ${String(String(c.iface || '-').padEnd(12))} ${String(String(c.addDefaultRoute ? 'yes' : 'no').padEnd(19))} ${String(c.status === 'bound' ? 'B bound (address ' + c.ip + (c.gateway ? ', gw ' + c.gateway : '') + ')' : (c.status || 'searching'))}`
    ).join('\n');
    return 'Flags: X - disabled, I - invalid, B - bound\n #    INTERFACE    ADD-DEFAULT-ROUTE    STATUS\n' + rows;
  }
  if (cmdResult.type === 'dns_print') {
    const servers = (cmdResult.servers || []) as Array<Record<string, unknown>>;
    if (servers.length === 0) return 'servers: (none)';
    return 'servers: ' + servers.join(', ');
  }
  if (cmdResult.type === 'acl_print') {
    const rules = (cmdResult.rules || []) as Array<Record<string, unknown>>;
    if (rules.length === 0) return 'Flags: X - disabled, P - permit, D - deny\n #    ACTION    PROTOCOL    SOURCE            DESTINATION\n -- no entries --';
    const rows = rules.map((r, i: number) =>
      ` ${String(i)} ${String((r.action === 'deny' ? 'D' : 'P'))}   ${String(String(r.action).padEnd(6))} ${String(String(r.proto || 'any').padEnd(10))} ${String(String(r.src || 'any').padEnd(17))} ${String(r.dst || 'any')}`
    ).join('\n');
    return 'Flags: X - disabled, P - permit, D - deny\n #    ACTION    PROTOCOL    SOURCE            DESTINATION\n' + rows;
  }
  if (cmdResult.type === 'proto_print') {
    const lines: string[] = [];
    const routing = cmdResult.routing || {};
    const bgp = cmdResult.bgp || {};
    for (const proto of ['ospf', 'rip', 'eigrp']) {
      const p = routing[proto];
      if (!p || !p.enabled) continue;
      const asn = proto === 'eigrp' ? ` as=${String(p.asn || '')}` : '';
      lines.push(`Routing Protocol is "${String(proto.toUpperCase())}"${String(asn)}`);
      lines.push(`  Networks: ${String((p.networks && p.networks.length > 0) ? p.networks.join(', ') : 'none')}`);
    }
    if (bgp.asn) {
      lines.push(`Routing Protocol is "BGP" (as=${String(bgp.asn)})`);
      lines.push(`  Networks: ${String((bgp.networks && bgp.networks.length > 0) ? bgp.networks.join(', ') : 'connected only')}`);
      lines.push(`  Peers: ${(bgp.peers || []).map((x) => `${String(x.remoteAddr)} (as${String(x.remoteAs)})`).join(', ') || 'none'}`);
    }
    if (lines.length === 0) return 'Routing Protocol is "none"';
    return lines.join('\n');
  }
  if (cmdResult.type === 'nat_print') {
    const rules = (cmdResult.rules || []) as Array<Record<string, unknown>>;
    const header = 'Flags: X - disabled, I - invalid, D - dynamic\n #    CHAIN      ACTION      OUT-INTERFACE   SRC-ADDRESS     DST-ADDRESS    DST-PORT  TO-ADDRESSES   TO-PORTS';
    if (rules.length === 0) return header + '\n -- no entries --';
    const rows = rules.map((r, i: number) =>
      ` ${String(i)} ${String(String(r.chain).padEnd(11))} ${String(String(r.action).padEnd(12))} ${String(String(r.outInterface || '-').padEnd(15))} ${String(String(r.srcAddress || '-').padEnd(15))} ${String(String(r.dstAddress || '-').padEnd(14))} ${String(String(r.dstPort || '-').padEnd(9))} ${String(String(r.toAddresses || '-').padEnd(14))} ${String(r.toPorts || '-')}`
    ).join('\n');
    return header + '\n' + rows;
  }
  if (cmdResult.type === 'identity_print') {
    return `name: ${String(cmdResult.name || 'device')}`;
  }
  if (cmdResult.type === 'nslookup') {
    if (cmdResult.timedOut || !cmdResult.resolved) {
      return cmdResult.nxdomain
        ? `;; server can't find ${String(cmdResult.host)}: NXDOMAIN`
        : `;; connection timed out; no servers could be reached`;
    }
    return `Server:         ${String(cmdResult.server)}\nAddress:        ${String(cmdResult.server)}#53\n\nNon-authoritative answer:\nName:    ${String(cmdResult.host)}\nAddress: ${String(cmdResult.resolved)}`;
  }
  if (cmdResult.type === 'dns_static_print') {
    const records = (cmdResult.records || []) as Array<Record<string, unknown>>;
    const header = 'Flags: X - disabled, D - dynamic\n #   NAME            ADDRESS\n';
    if (records.length === 0) return header + ' -- no entries --';
    const rows = records.map((r, i: number) => ` ${String(i)}   ${String(String(r.name).padEnd(16))} ${String(r.address)}`).join('\n');
    return header + rows;
  }
  if (cmdResult.type === 'service_print') {
    const web = cmdResult.web || {};
    const wwwState = web.enabled === false ? 'disabled' : 'enabled';
    const rows = [
      ' 0   winbox        8291    -                -                        -',
      ` 1   www           ${String(String(web.port || 80).padEnd(6))}  -                -                        ${String(wwwState)}`,
      ' 2   ssh           22      -                -                        -',
      ' 3   telnet        23      -                -                        -',
    ].join('\n');
    return 'Flags: X - disabled, R - running\n #   NAME      PORT    ADDRESS         CERTIFICATE   VRF\n' + rows;
  }
  if (cmdResult.type === 'queue_print') {
    const queues = (cmdResult.queues || []) as Array<Record<string, unknown>>;
    const live = (cmdResult.live || []) as Array<Record<string, unknown>>;
    if (queues.length === 0) return 'Flags: X - disabled, I - invalid\n #    NAME       TARGET            MAX-LIMIT\n -- no entries --';
    const rows = queues.map((q, i: number) => {
      const s = live.find((l) => l.name === q.name);
      const tx = s ? `${String(s.packets)} pkt, ${String(s.bytes)} B` : 'idle';
      const dr = s && Number(s.dropped) > 0 ? `, ${String(s.dropped)} dropped` : '';
      return ` ${String(i)} ${String(String(q.name || '').padEnd(10))} ${String(String(q.target || '').padEnd(17))} ${String(String(q.maxLimit || '').padEnd(12))} ${String(tx)}${String(dr)}`;
    }).join('\n');
    return 'Flags: X - disabled, I - invalid\n #    NAME       TARGET            MAX-LIMIT      RATE\n' + rows;
  }
  if (cmdResult.type === 'mangle_print') {
    const rules = (cmdResult.rules || []) as Array<Record<string, unknown>>;
    if (rules.length === 0) return 'Flags: X - disabled, I - invalid\n #    CHAIN         ACTION       PROTOCOL   SRC-ADDRESS\n -- no entries --';
    const rows = rules.map((r, i: number) =>
      ` ${String(i)} ${String(String(r.chain || '').padEnd(14))} ${String(String(r.action || '').padEnd(12))} ${String(String(r.protocol || '').padEnd(10))} ${String((r.newPacketMark ? 'mark=' + r.newPacketMark : ''))} ${String(r.srcAddress || '')}`
    ).join('\n');
    return 'Flags: X - disabled, I - invalid\n #    CHAIN         ACTION       PROTOCOL   MARK       SRC-ADDRESS\n' + rows;
  }
  if (cmdResult.type === 'wireless_print') {
    const wireless = cmdResult.wireless || {};
    const entries = Object.entries(wireless);
    if (entries.length === 0) return 'Flags: X - disabled, R - running\n #    NAME       SSID               BAND         MODE\n -- no entries --';
    const rows = entries.map(([name, w]: [string, Record<string, unknown>], i: number) =>
      ` ${String(i)} R ${String(name.padEnd(11))} ${String(String(w.ssid || '').padEnd(18))} ${String(String(w.band || '2ghz-G').padEnd(13))} ${String(w.mode || 'ap-bridge')}`
    ).join('\n');
    return 'Flags: X - disabled, R - running\n #    NAME       SSID               BAND         MODE\n' + rows;
  }
  if (cmdResult.type === 'bridge_print') {
    const stp = cmdResult.stp || {};
    const rows = [
      ` 0   bridge1            enabled                ${String(stp.mode || 'rstp')}`,
    ];
    return 'Flags: X - disabled, R - running\n #    NAME               STP                    PROTOCOL-MODE\n' + rows;
  }
  if (cmdResult.type === 'wireless_reg_print') {
    const entries = (cmdResult.entries || []) as Array<Record<string, unknown>>;
    if (entries.length === 0) return 'Flags: A - active, B - blocked\n #    MAC-ADDRESS       SSID               SIGNAL   INTERFACE\n -- no registered stations --';
    const rows = entries.map((e, i: number) =>
      ` ${String(i)} A ${String(String(e.mac || '-').padEnd(18))} ${String(String(e.ssid || '').padEnd(18))} ${String(String(e.signal ?? -100).padEnd(7))} ${String(e.iface || 'wlan1')}`
    ).join('\n');
    return 'Flags: A - active, B - blocked\n #    MAC-ADDRESS       SSID               SIGNAL   INTERFACE\n' + rows;
  }
  if (cmdResult.type === 'wireless_monitor') {
    return [
      `status: running`,
      `mode: ${String(cmdResult.mode || 'ap-bridge')}`,
      `ssid: ${String(cmdResult.ssid || '(none)')}`,
      `registered-stations: ${String(cmdResult.stationCount ?? 0)}`,
      `signal-strength: ${String(cmdResult.signal ?? -100)}dBm`,
    ].join('\n');
  }
  if (cmdResult.type === 'neighbor_print') {
    const neighbors = (cmdResult.neighbors || []) as Array<Record<string, unknown>>;
    if (neighbors.length === 0) return ' -- no neighbors discovered --';
    const rows = neighbors.map((n, i: number) =>
      ` ${String(i)} ${String(String(n.localPort || '-').padEnd(14))} ${String(String(n.peerName || '?').padEnd(18))} ${String(String(n.peerDeviceType || '').padEnd(12))} ${String(n.peerPort || '-')}`
    ).join('\n');
    return ' #    LOCAL-PORT     PEER               PLATFORM      PEER-PORT\n' + rows;
  }
  if (cmdResult.type === 'ospf_neighbor_print') {
    const neighbors = (cmdResult.neighbors || []) as Array<Record<string, unknown>>;
    const header = 'Neighbor ID     Pri   State           Dead Time   Address         Interface\n';
    const rows = neighbors.map((n) =>
      `${String(String(n.routerId || '0.0.0.0').padEnd(16))}   1   ${String((String(n.state) === 'Full' ? 'FULL/  -' : (String(n.state || 'Down'))).padEnd(14))} 00:00:31    ${String(String(n.ip || '').padEnd(16))} ${String(n.iface || '')}`
    ).join('\n');
    return header + (rows || '(no OSPF neighbors)');
  }
  if (cmdResult.type === 'tcp_print') {
    const conns = (cmdResult.connections || []) as Array<Record<string, unknown>>;
    if (conns.length === 0) return 'Local Address         Foreign Address         State\n(no active connections)';
    const rows = conns.map((c) =>
      `${String(String(String(c.localIp) + ':' + String(c.localPort)).padEnd(21))} ${String(String(String(c.remoteIp) + ':' + String(c.remotePort)).padEnd(23))} ${String(c.state)}`
    ).join('\n');
    return 'Local Address         Foreign Address         State\n' + rows;
  }
  if (cmdResult.type === 'ip_neigh') {
    const entries = (cmdResult.entries || []) as Array<Record<string, unknown>>;
    if (entries.length === 0) return '(ARP cache empty — kirim ping dulu untuk belajar MAC)';
    return entries.map((e) => `${String(e.ip)} dev eth0 lladdr ${String(e.mac)} REACHABLE`).join('\n');
  }
  if (cmdResult.type === 'snmp_print') {
    const s = cmdResult.snmp || {};
    if (!s.enabled) return 'SNMP agent: disabled';
    const lines = [
      'SNMP agent: enabled',
      `Community (read-only):  ${String(s.community || 'public')}`,
      `Community (read-write): ${String(s.communityRW || 'private')}`,
      `Contact:   ${String(s.sysContact || '(not set)')}`,
      `Location:  ${String(s.sysLocation || '(not set)')}`,
    ];
    return lines.join('\n');
  }
  if (cmdResult.type === 'snmp_query') {
    return formatSnmpQuery(cmdResult);
  }
  return '';
}

export function formatSnmpQuery(cmdResult): string {
  const { result, host, community, tool, numeric } = cmdResult;
  const oid = cmdResult.oid || '.1.3.6.1.2.1.1.1.0';
  if (!result || result.ok === false) {
    const reason = result?.reason;
    if (reason === 'auth') return `${String(tool)}: Error in packet. Reason: Bad community name used with community string: ${String(community)}`;
    if (reason === 'readonly') return `${String(tool)}: Error in packet. Reason: notWritable`;
    if (reason === 'no-agent' || reason === 'timeout' || reason === 'unreachable') {
      return `${String(tool)}: Timeout: No Response from ${String(host)}`;
    }
    if (reason === 'not-found-oid' || (result && Array.isArray(result.oids) && result.oids.length === 0)) {
      return `No Such Object available on this agent at this OID ${String(oid)}`;
    }
    return `${String(tool)}: ${String(result?.error || 'Error in packet')}`;
  }
  const oids = result.oids || [];
  if (oids.length === 0) return `No Such Instance currently exists at this OID ${String(oid)}`;
  const prefix = numeric ? '' : 'SNMPv2-MIB::';
  const lines = oids.map((o) => `${String(prefix)}${String(o.oid)} = ${String(o.type || 'STRING')}: ${String(o.value)}`);
  return lines.join('\n');
}

export function generateRunningConfig(context: VendorContext, mem: NodeMemory, vendor: string): string {
  const ports = mergeIps(context?.ports || [], mem.configuredIps);
  const lines: string[] = [];
  const hostname = mem.hostname || context?.name || 'Device';
  const withIp = ports.filter((p) => p.ipAddress);
  if (vendor === 'mikrotik') {
    lines.push('# RouterOS configuration export');
    lines.push(`/system identity set name=${String(hostname)}`);
    if (mem.vlans.length > 0) {
      mem.vlans.forEach((v) => {
        lines.push(`/interface vlan add name=vlan${String(v.id)} vlan-id=${String(v.id)} interface=${String(v.iface || 'ether1')}`);
      });
    }
    withIp.forEach((p) => {
      lines.push(`/ip address add address=${String(p.ipAddress)} interface=${String(p.name)}`);
    });
    mem.routes.forEach((r) => {
      lines.push(`/ip route add dst-address=${String(r.dst)} gateway=${String(r.gateway)}`);
    });
    if (mem.routing?.ospf?.enabled) {
      lines.push(`/routing ospf instance add name=ospf1 router-id=${String(mem.routing.ospf.routerId || '1.1.1.1')}`);
      lines.push('/routing ospf area add name=backbone area-id=0.0.0.0 instance=ospf1');
      const nets = mem.routing.ospf.networks || [];
      if (nets.length > 0) {
        nets.forEach((n: string) => lines.push(`/routing ospf interface-template add networks=${String(n)} area=backbone`));
      } else {
        lines.push('/routing ospf interface-template add networks=0.0.0.0/0 area=backbone');
      }
    }
    if (mem.bgp?.asn) {
      lines.push(`/routing bgp instance add name=bgp1 as=${String(mem.bgp.asn)} router-id=${String(mem.bgp.routerId || '1.1.1.1')}`);
      (mem.bgp.peers || []).forEach((p) => {
        lines.push(`/routing bgp connection add name=conn-${String(p.remoteAddr)} remote.address=${String(p.remoteAddr)} remote.as=${String(p.remoteAs)}`);
      });
      (mem.bgp.networks || []).forEach((n: string) => lines.push(`/routing bgp network add network=${String(n)}`));
    }
    Object.entries(mem.configuredIps6 || {}).forEach(([name, addr]: [string, string]) => {
      lines.push(`/ipv6 address add address=${String(addr)} interface=${String(name)}`);
    });
    (mem.routes6 || []).forEach((r) => {
      lines.push(`/ipv6 route add dst-address=${String(r.dst)} gateway=${String(r.gateway)}`);
    });
    (mem.fhrpGroups || []).forEach((g) => {
      lines.push(`/routing vrrp instance add name=vrrp${String(g.vrid || 1)} interface=${String(g.interface || '')} vrid=${String(g.vrid || 1)} priority=${String(g.priority ?? 100)} address=${String(g.virtualAddress)}`);
    });
    (mem.shutdownIfaces || []).forEach((name: string) => {
      lines.push(`/interface disable ${String(name)}`);
    });
    (mem.subinterfaces || []).forEach((s) => {
      // Subinterface yang sumbernya `/interface vlan add` sudah diekspor lewat
      // blok vlans — hindari duplikasi saat re-import.
      if (mem.vlans.some((v) => String(v.id) === String(s.vlanId) && (v.name === s.name || v.iface === s.parentPort))) return;
      lines.push(`/interface vlan add name=${String(s.name)} vlan-id=${String(s.vlanId)} interface=${String(s.parentPort)}`);
    });
    (mem.trunkPorts || []).forEach((name: string) => {
      lines.push(`/interface bridge port add bridge=bridge1 interface=${String(name)}`);
    });
    (mem.queues || []).forEach((q) => {
      lines.push(`/queue simple add name=${String(q.name)} target=${String(q.target || '')} max-limit=${String(q.maxLimit || '')}`);
    });
    Object.entries(mem.wireless || {}).forEach(([name, w]: [string, WirelessAp]) => {
      lines.push(`/interface wireless set ${String(name)} ssid=${String(w.ssid || '')} band=${String(w.band || '2ghz-G')} mode=${String(w.mode || 'ap-bridge')}`);
    });
    mem.dhcpPools.forEach((p) => {
      if (p.range) lines.push(`/ip pool add name=${String(p.name)} ranges=${String(p.range)}`);
      if (p.iface) lines.push(`/ip dhcp-server add name=${String(p.name)} interface=${String(p.iface)} address-pool=${String(p.name)}`);
    });
    if (mem.dnsServers.length > 0) lines.push(`/ip dns set servers=${String(mem.dnsServers.join(','))}`);
    mem.dnsRecords.forEach((r) => lines.push(`/ip dns static add name=${String(r.name)} address=${String(r.address)}`));
    if (mem.webServer && mem.webServer.enabled === false) lines.push('/ip service set www disabled=yes');
    mem.natRules.forEach((r) => {
      let line = `/ip firewall nat add chain=${String(r.chain)}${r.outInterface ? ` out-interface=${String(r.outInterface)}` : ''} action=${String(r.action)}`;
      if (r.protocol) line += ` protocol=${String(r.protocol)}`;
      if (r.dstAddress) line += ` dst-address=${String(r.dstAddress)}`;
      if (r.dstPort) line += ` dst-port=${String(r.dstPort)}`;
      if (r.toAddresses) line += ` to-addresses=${String(r.toAddresses)}`;
      if (r.toPorts) line += ` to-ports=${String(r.toPorts)}`;
      lines.push(line);
    });
  } else if (vendor === 'juniper') {
    lines.push(`set system host-name ${String(hostname)}`);
    withIp.forEach((p) => lines.push(`set interfaces ${String(p.name)} unit 0 family inet address ${String(cidrOf(p.ipAddress))}`));
    if (mem.dnsServers.length > 0) lines.push(`set system name-server ${String(mem.dnsServers.join(' '))}`);
    mem.dnsRecords.forEach((r) => lines.push(`set system static-host-mapping host-name ${String(r.name)} inet ${String(r.address)}`));
    mem.vlans.forEach((v) => lines.push(`set vlans ${String(v.name || 'VLAN' + v.id)} vlan-id ${String(v.id)}`));
    mem.routes.forEach((r) => lines.push(`set routing-options static route ${String(r.dst)} next-hop ${String(r.gateway)}`));
    if (mem.routing.ospf.enabled) {
      (mem.routing.ospf.networks || []).forEach((n: string) => lines.push(`set protocols ospf area 0 network ${String(n)}`));
      if (mem.routing.ospf.routerId) lines.push(`set protocols ospf parameters router-id ${String(mem.routing.ospf.routerId)}`);
    }
    mem.dhcpPools.forEach((p) => {
      if (p.network) lines.push(`set access address-assignment pool ${String(p.name)} family inet network ${String(cidrOf(p.network))}`);
      const rm = String(p.range || '').match(/(\d+\.\d+\.\d+\.\d+)\s*-\s*(\d+\.\d+\.\d+\.\d+)/);
      if (rm) lines.push(`set access address-assignment pool ${String(p.name)} family inet range R1 low ${String(rm[1])} high ${String(rm[2])}`);
      if (p.gateway) lines.push(`set access address-assignment pool ${String(p.name)} family inet dhcp-attributes router ${String(p.gateway)}`);
      if (p.iface) lines.push(`set system services dhcp-local-server group G1 pool ${String(p.name)}`);
      if (p.iface) lines.push(`set system services dhcp-local-server group G1 interface ${String(p.iface)}`);
    });
    if (mem.bgp.asn) {
      lines.push(`set routing-options autonomous-system ${String(mem.bgp.asn)}`);
      if (mem.bgp.routerId) lines.push(`set routing-options router-id ${String(mem.bgp.routerId)}`);
      mem.bgp.peers.forEach((p, i: number) => {
        lines.push(`set protocols bgp group EXT${String(i)} type external`);
        lines.push(`set protocols bgp group EXT${String(i)} peer-as ${String(p.remoteAs)}`);
        lines.push(`set protocols bgp group EXT${String(i)} neighbor ${String(p.remoteAddr)}`);
      });
      (mem.bgp.networks || []).forEach((n: string) => lines.push(`set protocols bgp group EXT0 network ${String(n)}`));
    }
    mem.acls.forEach((a, i: number) => {
      lines.push(`set firewall family inet filter FILTER${String(i)} term t1 from protocol ${String(a.proto || 'any')}`);
      if (a.src && a.src !== 'any') lines.push(`set firewall family inet filter FILTER${String(i)} term t1 from source-address ${String(wildcardToCidr(a.src))}`);
      if (a.dst && a.dst !== 'any') lines.push(`set firewall family inet filter FILTER${String(i)} term t1 from destination-address ${String(wildcardToCidr(a.dst))}`);
      lines.push(`set firewall family inet filter FILTER${String(i)} term t1 then ${String(a.action === 'deny' ? 'reject' : 'accept')}`);
    });
    mem.natRules.forEach((r, i: number) => {
      if (r.chain === 'srcnat') {
        lines.push(`set security nat source rule-set RS${String(i)} rule 10 match source-address ${String(r.srcAddress || '0.0.0.0/0')}`);
        lines.push(`set security nat source rule-set RS${String(i)} rule 10 then source-nat interface`);
      }
    });
  } else if (vendor === 'huawei') {
    lines.push(`sysname ${String(hostname)}`);
    mem.vlans.forEach((v) => lines.push(`vlan ${String(v.id)}`));
    withIp.forEach((p) => {
      lines.push(`interface ${String(p.name)}`);
      lines.push(` ip address ${String(maskedPair(p.ipAddress))}`);
    });
    mem.routes.forEach((r) => lines.push(`ip route-static ${String(r.dst)} ${String(r.gateway)}`));
    mem.dhcpPools.forEach((p) => {
      lines.push('dhcp enable');
      lines.push(`ip pool ${String(p.name)}`);
      if (p.network) lines.push(` network ${String(cidrOf(p.network).split('/')[0])} mask ${String(maskedPair(p.network).split(' ')[1])}`);
      if (p.gateway) lines.push(` gateway-list ${String(p.gateway)}`);
    });
    mem.dnsRecords.forEach((r) => lines.push(`ip host ${String(r.name)} ${String(r.address)}`));
    if (mem.routing.ospf.enabled) {
      lines.push('ospf 1');
      const areas: Record<string, string[]> = {};
      (mem.routing.ospf.networks || []).forEach((n: string) => {
        const m = String(n).match(/^(.*?)\s+area\s+(\d+)$/i);
        const area = m ? m[2] : '0';
        const net = m ? m[1].trim() : n;
        (areas[area] = areas[area] || []).push(net);
      });
      Object.keys(areas).sort((a, b) => Number(a) - Number(b)).forEach((area) => {
        lines.push(` area ${String(area)}`);
        areas[area].forEach((n: string) => lines.push(`  network ${String(wildcardToCidr(n))}`));
      });
    }
    if (mem.bgp.asn) {
      lines.push(`bgp ${String(mem.bgp.asn)}`);
      mem.bgp.peers.forEach((p) => lines.push(` peer ${String(p.remoteAddr)} as-number ${String(p.remoteAs)}`));
      (mem.bgp.networks || []).forEach((n: string) => lines.push(` network ${String(cidrOf(n).split('/')[0])} mask ${String(maskedPair(n).split(' ')[1])}`));
      lines.push('quit');
    }
    mem.acls.forEach((a, i: number) => {
      if (a.aclId) {
        lines.push(`acl ${String(a.aclId)}`);
        const parts = [`rule ${String(i + 1)} ${String(a.action)} ${String(a.proto || 'ip')}`];
        if (a.src && a.src !== 'any') parts.push(`source ${String(wildcardOf(a.src))}`);
        if (a.dst && a.dst !== 'any') parts.push(`destination ${String(wildcardOf(a.dst))}`);
        lines.push(` ${String(parts.join(' '))}`);
        lines.push('quit');
      }
    });
    mem.natRules.forEach((r) => {
      if (r.chain === 'srcnat' && mem.acls.length > 0 && mem.acls[0].aclId) lines.push(`nat outbound ${String(mem.acls[0].aclId)}`);
      if (r.chain === 'dstnat') lines.push(`nat server protocol ${String(r.protocol || 'tcp')} global ${String(r.dstAddress || 'current-interface')} ${String(r.dstPort)} inside ${String(r.toAddresses)} ${String(r.toPorts)}`);
    });
  } else if (vendor === 'fortinet') {
    lines.push('config system global');
    lines.push(` set hostname "${String(hostname)}"`);
    lines.push('end');
    mem.vlans.forEach((v) => {
      const parentDot = String(v.name || '').replace(new RegExp(`\\.${String(v.id)}$`), '') || 'ether1';
      lines.push('config system interface');
      lines.push(` edit ${String(parentDot)}`);
      lines.push(` set vlanid ${String(v.id)}`);
      lines.push(` set interface ${String(parentDot)}`);
      lines.push('end');
    });
    withIp.forEach((p) => {
      lines.push('config system interface');
      lines.push(` edit ${String(p.name)}`);
      lines.push(` set ip ${String(maskedPair(p.ipAddress))}`);
      lines.push('end');
    });
    mem.routes.forEach((r, i: number) => {
      lines.push('config router static');
      lines.push(` edit ${String(i + 1)}`);
      lines.push(` set dst ${String(r.dst)}`);
      lines.push(` set gateway ${String(r.gateway)}`);
      lines.push('end');
    });
    mem.dhcpPools.forEach((p) => {
      lines.push('config system dhcp server');
      lines.push(` edit ${String(p.idx || 1)}`);
      if (p.iface) lines.push(` set interface ${String(p.iface)}`);
      const rm = String(p.range || '').match(/(\d+\.\d+\.\d+\.\d+)\s*-\s*(\d+\.\d+\.\d+\.\d+)/);
      if (rm) {
        lines.push(' config ip-range');
        lines.push('  edit 1');
        lines.push(`  set start-ip ${String(rm[1])}`);
        lines.push(`  set end-ip ${String(rm[2])}`);
        lines.push('  end');
      }
      if (p.gateway) lines.push(` set default-gateway ${String(p.gateway)}`);
      lines.push('end');
    });
    if (mem.dnsServers.length > 0) {
      lines.push('config system dns');
      lines.push(` set primary ${String(mem.dnsServers[0])}`);
      if (mem.dnsServers[1]) lines.push(` set secondary ${String(mem.dnsServers[1])}`);
      lines.push('end');
    }
    if (mem.routing.ospf.enabled) {
      lines.push('config router ospf');
      if (mem.routing.ospf.routerId) lines.push(` set router-id ${String(mem.routing.ospf.routerId)}`);
      mem.routing.ospf.networks.forEach((n: string, i: number) => {
        lines.push(' config network');
        lines.push(`  edit ${String(i + 1)}`);
        lines.push(`  set prefix ${String(n)}`);
        lines.push('  end');
      });
      lines.push('end');
    }
    if (mem.bgp.asn) {
      lines.push('config router bgp');
      lines.push(` set as ${String(mem.bgp.asn)}`);
      if (mem.bgp.routerId) lines.push(` set router-id ${String(mem.bgp.routerId)}`);
      if (mem.bgp.peers.length > 0) {
        lines.push(' config neighbor');
        mem.bgp.peers.forEach((p) => {
          lines.push(`  edit ${String(p.remoteAddr)}`);
          lines.push(`  set remote-as ${String(p.remoteAs)}`);
          lines.push('  end');
        });
        lines.push(' end');
      }
      lines.push('end');
    }
    mem.natRules.forEach((r, i: number) => {
      if (r.chain === 'srcnat' && r.outInterface) {
        lines.push('config firewall policy');
        lines.push(` edit ${String(i + 1)}`);
        lines.push(' set srcintf "internal"');
        lines.push(` set dstintf "${String(r.outInterface)}"`);
        lines.push(' set srcaddr "all"');
        lines.push(' set dstaddr "all"');
        lines.push(' set action accept');
        lines.push(' set nat enable');
        lines.push('next');
        lines.push('end');
      }
      if (r.chain === 'dstnat' && r.toAddresses) {
        lines.push('config firewall vip');
        lines.push(` edit "web${String(i)}"`);
        if (r.dstAddress) lines.push(` set extip ${String(r.dstAddress)}`);
        lines.push(` set mappedip ${String(r.toAddresses)}`);
        lines.push(` set extintf "${String(r.outInterface || 'wan1')}"`);
        lines.push(' set portforward enable');
        lines.push(` set protocol ${String(r.protocol || 'tcp')}`);
        if (r.dstPort) lines.push(` set extport ${String(r.dstPort)}`);
        if (r.toPorts) lines.push(` set mappedport ${String(r.toPorts)}`);
        lines.push('end');
      }
    });
  } else if (vendor === 'ubiquiti' || vendor === 'vyos') {
    lines.push(`set system host-name ${String(hostname)}`);
    withIp.forEach((p) => lines.push(`set interfaces ethernet ${String(p.name)} address ${String(cidrOf(p.ipAddress))}`));
    mem.vlans.forEach((v) => lines.push(`set vlans ${String(v.name || 'VLAN' + v.id)} vlan-id ${String(v.id)}`));
    mem.routes.forEach((r) => lines.push(`set protocols static route ${String(r.dst)} next-hop ${String(r.gateway)}`));
    mem.dhcpPools.forEach((p) => {
      lines.push(`set service dhcp-server shared-network-name ${String(p.name)} subnet ${String(cidrOf(p.network || '192.168.1.0/24'))}`);
      const rm = String(p.range || '').match(/(\d+\.\d+\.\d+\.\d+)\s*-\s*(\d+\.\d+\.\d+\.\d+)/);
      if (rm) lines.push(`set service dhcp-server shared-network-name ${String(p.name)} subnet ${String(cidrOf(p.network || '192.168.1.0/24'))} start ${String(rm[1])} stop ${String(rm[2])}`);
      if (p.gateway) lines.push(`set service dhcp-server shared-network-name ${String(p.name)} subnet ${String(cidrOf(p.network || '192.168.1.0/24'))} default-router ${String(p.gateway)}`);
    });
    mem.dnsRecords.forEach((r) => lines.push(`set system static-host-mapping host-name ${String(r.name)} inet ${String(r.address)}`));
    if (mem.routing.ospf.enabled) {
      (mem.routing.ospf.networks || []).forEach((n: string) => lines.push(`set protocols ospf area 0 network ${String(n)}`));
      if (mem.routing.ospf.routerId) lines.push(`set protocols ospf parameters router-id ${String(mem.routing.ospf.routerId)}`);
    }
    mem.natRules.forEach((r, i: number) => {
      if (r.chain === 'srcnat') {
        lines.push(`set nat source rule ${String(i + 10)} outbound-interface ${String(r.outInterface || 'eth0')}`);
        if (r.srcAddress) lines.push(`set nat source rule ${String(i + 10)} source address ${String(r.srcAddress)}`);
        lines.push(`set nat source rule ${String(i + 10)} translation address masquerade`);
      }
      if (r.chain === 'dstnat') {
        lines.push(`set nat destination rule ${String(i + 100)} inbound-interface ${String(r.outInterface || 'eth0')}`);
        lines.push(`set nat destination rule ${String(i + 100)} protocol ${String(r.protocol || 'tcp')}`);
        if (r.dstPort) lines.push(`set nat destination rule ${String(i + 100)} destination port ${String(r.dstPort)}`);
        lines.push(`set nat destination rule ${String(i + 100)} translation address ${String(r.toAddresses)}`);
        if (r.toPorts) lines.push(`set nat destination rule ${String(i + 100)} translation port ${String(r.toPorts)}`);
      }
    });
    if (mem.bgp.asn) {
      lines.push(`set protocols bgp ${String(mem.bgp.asn)} parameters router-id ${String(mem.bgp.routerId || '0.0.0.0')}`);
      mem.bgp.peers.forEach((p) => lines.push(`set protocols bgp ${String(mem.bgp.asn)} neighbor ${String(p.remoteAddr)} remote-as ${String(p.remoteAs)}`));
      (mem.bgp.networks || []).forEach((n: string) => lines.push(`set protocols bgp ${String(mem.bgp.asn)} network ${String(n)}`));
    }
    mem.acls.forEach((a, i: number) => {
      lines.push(`set firewall name FW${String(i)} rule ${String(i + 10)} action ${String(a.action === 'deny' ? 'drop' : 'accept')}`);
      if (a.proto && a.proto !== 'any') lines.push(`set firewall name FW${String(i)} rule ${String(i + 10)} protocol ${String(a.proto)}`);
      if (a.src && a.src !== 'any') lines.push(`set firewall name FW${String(i)} rule ${String(i + 10)} source address ${String(wildcardToCidr(a.src))}`);
      if (a.dst && a.dst !== 'any') lines.push(`set firewall name FW${String(i)} rule ${String(i + 10)} destination address ${String(wildcardToCidr(a.dst))}`);
    });
  } else if (vendor === 'openwrt') {
    lines.push(`uci set system.@system[0].hostname=${String(hostname)}`);
    withIp.forEach((p) => {
      lines.push(`uci set network.${String(p.name)}.ipaddr=${String(cidrOf(p.ipAddress).split('/')[0])}`);
      lines.push(`uci set network.${String(p.name)}.netmask=${String(maskedPair(p.ipAddress).split(' ')[1])}`);
      lines.push(`uci set network.${String(p.name)}.proto=static`);
    });
    if (mem.dnsServers.length > 0) lines.push(`uci set network.wan.dns=${String(mem.dnsServers.join(' '))}`);
    mem.vlans.forEach((v) => {
      lines.push(`uci set network.vlan${String(v.id)}.vlan=${String(v.id)}`);
    });
    mem.routes.forEach((r, i: number) => {
      lines.push(`uci set network.route${String(i + 1)}=route`);
      lines.push(`uci set network.route${String(i + 1)}.target=${String(r.dst)}`);
      lines.push(`uci set network.route${String(i + 1)}.gateway=${String(r.gateway)}`);
    });
    mem.dhcpPools.forEach((p) => {
      const rm = String(p.range || '').match(/(\d+\.\d+\.\d+\.\d+)\s*-\s*(\d+\.\d+\.\d+\.\d+)/);
      lines.push('uci set dhcp.lan=dhcp');
      if (p.iface) lines.push(`uci set dhcp.lan.interface=${String(p.iface)}`);
      if (rm) {
        const startOct = rm[1].split('.')[3];
        const endOct = rm[2].split('.')[3];
        lines.push(`uci set dhcp.lan.start=${String(startOct)}`);
        lines.push(`uci set dhcp.lan.limit=${String(Number(endOct) - Number(startOct) + 1)}`);
      }
      lines.push('uci commit dhcp');
    });
    mem.natRules.forEach((r, i: number) => {
      if (r.chain === 'srcnat') {
        lines.push('uci set firewall.@zone[1].masq=1');
        lines.push('uci commit firewall');
      }
      if (r.chain === 'dstnat' && r.dstPort && r.toAddresses) {
        lines.push('uci add firewall redirect');
        lines.push(`uci set firewall.@redirect[0].dest_ip=${String(r.toAddresses)}`);
        if (r.toPorts) lines.push(`uci set firewall.@redirect[0].dest_port=${String(r.toPorts)}`);
        lines.push(`uci set firewall.@redirect[0].src_dport=${String(r.dstPort)}`);
        lines.push('uci set firewall.@redirect[0].target=DNAT');
        lines.push('uci commit firewall');
      }
    });
    lines.push('uci commit');
  } else if (vendor === 'linux') {
    lines.push(`hostname ${String(hostname)}`);
    withIp.forEach((p) => lines.push(`ip addr add ${String(cidrOf(p.ipAddress))} dev ${String(p.name)}`));
    mem.routes.forEach((r) => lines.push(`ip route add ${String(r.dst)} via ${String(r.gateway)}`));
    (mem.dnsServers || []).forEach((s: string) => lines.push(`echo "nameserver ${String(s)}" > /etc/resolv.conf`));
    mem.dnsRecords.forEach((r) => lines.push(`echo "${String(r.address)} ${String(r.name)}" >> /etc/hosts`));
    mem.dhcpPools.forEach((p) => {
      const rm = String(p.range || '').match(/(\d+\.\d+\.\d+\.\d+)\s*-\s*(\d+\.\d+\.\d+\.\d+)/);
      if (rm) {
        const net = p.network ? cidrOf(p.network).split('/')[0] : '0.0.0.0';
        lines.push(`echo "subnet ${String(net)} netmask 255.255.255.0 { range ${String(rm[1])} ${String(rm[2])}; option routers ${String(p.gateway || '0.0.0.0')}; }" > /etc/dhcp/dhcpd.conf`);
        lines.push('systemctl start isc-dhcp-server');
      }
    });
    mem.natRules.forEach((r) => {
      if (r.chain === 'srcnat') lines.push(`iptables -t nat -A POSTROUTING -o ${String(r.outInterface || 'eth0')} -j MASQUERADE`);
      if (r.chain === 'dstnat') {
        const line = `iptables -t nat -A PREROUTING -i ${String(r.outInterface || 'eth0')} -p ${String(r.protocol || 'tcp')} --dport ${String(r.dstPort)} -j DNAT --to-destination ${String(r.toAddresses)}${String(r.toPorts ? ':' + r.toPorts : '')}`;
        lines.push(line);
      }
    });
    if (mem.webServer) {
      if (mem.webServer.content) lines.push(`echo "${String(mem.webServer.content)}" > /var/www/html/index.html`);
      if (mem.webServer.enabled === false) lines.push('systemctl stop nginx');
    }
  } else {
    lines.push(`! Running configuration`);
    lines.push(`hostname ${String(hostname)}`);
    if (vendor === 'cisco_ios' || vendor === 'cisco_nxos' || vendor === 'aruba') {
      if (mem.dnsServers.length > 0) lines.push(`ip name-server ${String(mem.dnsServers.join(' '))}`);
      if (mem.vlans.length > 0) {
        mem.vlans.forEach((v) => {
          lines.push(`vlan ${String(v.id)}`);
          lines.push(` name ${String(v.name || 'VLAN' + v.id)}`);
        });
      }
      mem.dhcpPools.forEach((p) => {
        lines.push(`ip dhcp pool ${String(p.name)}`);
        if (p.network) lines.push(` network ${String(p.network)}`);
        if (p.gateway) lines.push(` default-router ${String(p.gateway)}`);
      });
    }
    withIp.forEach((p) => {
      lines.push(`interface ${String(p.name)}`);
      lines.push(` ip address ${String(maskedPair(p.ipAddress))}`);
      lines.push(` ${String((mem.shutdownIfaces || []).includes(p.name) ? 'shutdown' : 'no shutdown')}`);
    });
    // Port yang di-shutdown tapi belum punya IP tetap muncul di config.
    (mem.shutdownIfaces || []).forEach((name: string) => {
      if (withIp.some((p) => p.name === name)) return;
      lines.push(`interface ${String(name)}`);
      lines.push(` shutdown`);
    });
    (mem.subinterfaces || []).forEach((s) => {
      lines.push(`interface ${String(s.name)}`);
      lines.push(` encapsulation dot1q ${String(s.vlanId)}`);
      lines.push(` no shutdown`);
    });
    (mem.trunkPorts || []).forEach((name: string) => {
      lines.push(`interface ${String(name)}`);
      lines.push(` switchport mode trunk`);
      if (mem.trunkAllowed && mem.trunkAllowed[name] !== undefined) {
        const ids = mem.trunkAllowed[name] as number[];
        lines.push(` switchport trunk allowed vlan ${String(ids.length > 0 ? ids.join(',') : 'none')}`);
      }
      if (mem.trunkNative && mem.trunkNative[name] !== undefined) {
        lines.push(` switchport trunk native vlan ${String(mem.trunkNative[name])}`);
      }
    });
    // Access VLAN (switchport access vlan) — port non-trunk
    const trunkSet = new Set(mem.trunkPorts || []);
    Object.entries(mem.portVlans || {}).forEach(([name, vlan]: [string, number]) => {
      if (trunkSet.has(name)) return;
      lines.push(`interface ${String(name)}`);
      lines.push(` switchport access vlan ${String(vlan)}`);
    });
    mem.routes.forEach((r) => {
      lines.push(`ip route ${String(maskedPair(r.dst))} ${String(r.gateway)}`);
    });
    // Route protocol: OSPF / RIP / EIGRP wajib ikut di ekspor (Cisco IOS/NX-OS/Aruba).
    if (mem.routing?.ospf?.enabled) {
      lines.push('router ospf 1');
      if (mem.routing.ospf.routerId) lines.push(` router-id ${String(mem.routing.ospf.routerId)}`);
      (mem.routing.ospf.networks || []).forEach((n: string) => lines.push(` network ${String(wildcardToCidr(n))} area 0`));
      (mem.routing.ospf.passiveInterfaces || []).forEach((name: string) => lines.push(` passive-interface ${String(name)}`));
    }
    if (mem.routing?.rip?.enabled) {
      lines.push('router rip');
      lines.push(' version 2');
      (mem.routing.rip.networks || []).forEach((n: string) => lines.push(` network ${String(cidrOf(n))}`));
    }
    if (mem.routing?.eigrp?.enabled) {
      lines.push(`router eigrp ${String(mem.routing.eigrp.asn || 1)}`);
      (mem.routing.eigrp.networks || []).forEach((n: string) => lines.push(` network ${String(cidrOf(n))}`));
    }
    if (mem.bgp?.asn) {
      lines.push(`router bgp ${String(mem.bgp.asn)}`);
      if (mem.bgp.routerId) lines.push(` bgp router-id ${String(mem.bgp.routerId)}`);
      (mem.bgp.peers || []).forEach((p) => lines.push(` neighbor ${String(p.remoteAddr)} remote-as ${String(p.remoteAs)}`));
      (mem.bgp.networks || []).forEach((n: string) => {
        const c = cidrOf(n);
        const [ip, pref] = c.split('/');
        if (ip && pref) lines.push(` network ${String(ip)} mask ${String(bitsToMask(Number(pref)))}`);
      });
    }
    // IPv6: alamat per interface + rute statis
    Object.entries(mem.configuredIps6 || {}).forEach(([name, addr]: [string, string]) => {
      lines.push(`interface ${String(name)}`);
      lines.push(` ipv6 address ${String(addr)}`);
    });
    (mem.routes6 || []).forEach((r) => {
      lines.push(`ipv6 route ${String(r.dst)} ${String(r.gateway)}`);
    });
    // VRRP/HSRP: virtual IP di interface
    (mem.fhrpGroups || []).forEach((g) => {
      lines.push(`interface ${String(g.interface || 'ether1')}`);
      const ipOnly = String(g.virtualAddress || '').split('/')[0];
      if (ipOnly && ipOnly !== '0.0.0.0') lines.push(` vrrp ${String(g.vrid || 1)} ip ${String(ipOnly)}`);
      lines.push(` vrrp ${String(g.vrid || 1)} priority ${String(g.priority ?? 100)}`);
    });
  }
  return lines.join('\n');
}
