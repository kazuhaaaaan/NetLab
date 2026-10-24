// GENERATED — branch handler vendor linux (diekstraksi dari dispatch() lama).
import type { CommandResult, ChainEntry, ChainEnv } from '../common/types';
import { registerEntries } from '../common/chain';

import { resolveIfaceName, networkOfMask, cidrOf, isValidIpv4RouteDst, isValidRouteGateway, isValidIpv6RouteDst, isValidIpv4, isValidIpCidrValue } from '../common/ip';
import { setShutdownState, grantDhcpClient } from '../common/state';
import type { NodeMemory, VendorContext } from '../common/types';

export const linuxEntries: ChainEntry[] = [
  {
    name: 'iperf3_sim',
    order: 3,
    vendors: 'all',
    match: ({ vendorId, rawInput }) => vendorId === 'linux' && /^\s*iperf3?\b/i.test(rawInput.trim()),
    run: ({ rawInput }) => {
      const s = rawInput.trim();
      const lower = s.toLowerCase();
      const isServer = /\s-s\b/.test(lower);
      const isReverse = /\s-r\b/.test(lower);
      const tMatch = lower.match(/-t\s+(\d+)/);
      const pMatch = lower.match(/-p\s+(\d+)/);
      const cMatch = s.match(/-c\s+([0-9.]+)/i);
      const duration = tMatch ? parseInt(tMatch[1]) : 10;
      const parallel = Math.max(1, Math.min(pMatch ? parseInt(pMatch[1]) : 1, 8));
      const host = cMatch ? cMatch[1] : '10.10.99.100';

      if (isServer) {
        return {
          raw: [
            '-----------------------------------------------------------',
            'Server listening on 5201',
            '-----------------------------------------------------------',
            `Accepted connection from 192.168.10.11, port ${40000 + Math.floor(Math.random()*1000)}`,
            '[  5] local 10.10.99.100 port 5201 connected to 192.168.10.11 port 45678',
          ].join('\n') + '\n',
        };
      }

      const base = 650;
      const spread = 180;
      const lines = [];
      lines.push(`Connecting to host ${host}, port 5201`);
      lines.push(`[  5] local 192.168.10.11 port ${45000 + Math.floor(Math.random()*500)} connected to ${host} port 5201`);
      lines.push(`[ ID] Interval           Transfer     Bitrate         Retr  Cwnd`);
      for (let i = 0; i < Math.min(duration, 10); i++) {
        const start = i;
        const end = i + 1;
        const mb = (base + Math.floor(Math.random()*spread)) * (0.9 + Math.random()*0.2);
        const gbit = (mb / 1000).toFixed(2);
        const mbit = mb.toFixed(1);
        if (parallel === 1) {
          lines.push(`[  5]   ${start.toFixed(2)}-${end.toFixed(2)}   sec  ${gbit} GBytes  ${mbit} Mbits/sec  ${Math.floor(Math.random()*6)}             ${Math.floor(200 + Math.random()*150)} KBytes`);
        } else {
          for (let s2 = 0; s2 < parallel; s2++) {
            const id = 5 + s2;
            const m2 = (mb * (0.8 + Math.random()*0.4)) / parallel;
            const g2 = (m2 / 1000).toFixed(2);
            const b2 = m2.toFixed(1);
            lines.push(`[ ${id.toString().padStart(2)}]   ${start.toFixed(2)}-${end.toFixed(2)}   sec  ${g2} GBytes  ${b2} Mbits/sec    0   ${Math.floor(150 + Math.random()*100)} KBytes`);
          }
        }
      }
      const totalG = ((base + spread/2) * duration / 1000 * 0.95).toFixed(2);
      const totalM = ((base + spread/2) * 0.95).toFixed(0);
      lines.push(`- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -`);
      if (parallel > 1) {
        lines.push(`[SUM]   0.00-${duration.toFixed(2)}  sec  ${totalG} GBytes  ${totalM} Mbits/sec             sender`);
        lines.push(`[SUM]   0.00-${duration.toFixed(2)}  sec  ${totalG} GBytes  ${totalM} Mbits/sec             receiver`);
      } else {
        lines.push(`[  5]   0.00-${duration.toFixed(2)}  sec  ${totalG} GBytes  ${totalM} Mbits/sec             sender`);
        lines.push(`[  5]   0.00-${duration.toFixed(2)}  sec  ${totalG} GBytes  ${totalM} Mbits/sec             receiver`);
      }
      if (isReverse) lines.push(`Reverse mode, remote host ${host} is sending`);
      lines.push(`iperf Done.`);
      return { raw: lines.join('\n') + '\n' };
    },
  },

  {
    name: 'b10',
    order: 10,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (vendorId === 'linux'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;
cmdResult = linuxCommand(rawInput, context, mem);
    
    // Linux: DHCP server (dhcpd.conf), NAT (iptables), DNS static (/etc/hosts).
        
    return cmdResult;
  },
  },
  {
    name: 'b35',
    order: 35,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => ((vendorId === 'linux' || vendorId === 'openwrt') && /^ip\s+-6\s+route\s+add\s+/i.test(rawInput.trim())),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Linux: "ip -6 route add 2001:db8:2::/64 via 2001:db8:ff::2" / "ip -6 route add default via 2001:db8:1::1"
          const m = rawInput.trim().match(/^ip\s+-6\s+route\s+add\s+(\S+)\s+via\s+(\S+)/i);
          if (m) {
            const dst = m[1].toLowerCase() === 'default' ? '::/0' : m[1];
            if (!isValidIpv6RouteDst(String(dst)) || !isValidRouteGateway(String(m[2]))) {
              cmdResult = { raw: `Error: invalid IPv6 route "${String(dst)} via ${String(m[2])}"` };
            } else {
              if (!mem.routes6.some((r) => r.dst === dst)) mem.routes6.push({ dst, gateway: m[2] });
              cmdResult = { raw: '' };
            }
          } else {
            cmdResult = { raw: '% Usage: ip -6 route add <dst> via <gateway>' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b42',
    order: 42,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => ((vendorId === 'linux' || vendorId === 'openwrt') && /^ip\s+link\s+set\s+(\S+)\s+(up|down)\s*$/i.test(rawInput.trim())),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Linux: "ip link set eth0 up|down"
          const m = rawInput.trim().match(/^ip\s+link\s+set\s+(\S+)\s+(up|down)\s*$/i);
          if (m) {
            const iface = resolveIfaceName(context?.ports, m[1]) || m[1];
            setShutdownState(mem, iface, m[2].toLowerCase() === 'down');
            cmdResult = { raw: '' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b46',
    order: 46,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => ((vendorId === 'linux' || vendorId === 'openwrt') && /^ip\s+addr(ess)?\s+add\s+\S+\s+dev\s+\S+/i.test(rawInput.trim())),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Linux: "ip addr add 192.168.1.10/24 dev eth0" / "ip addr add 2001:db8::10/64 dev eth0"
          const m = rawInput.trim().match(/^ip\s+addr(ess)?\s+add\s+(\S+)\s+dev\s+(\S+)/i);
          if (m) {
            const devName = String(m[3]).toLowerCase();
    // Linux jujur: device tak dikenal → error (loopback "lo" diizinkan).
            const devExists = (context?.ports || []).some(
              (p) => String(p.name || '').toLowerCase() === devName || String(p.id || '').toLowerCase() === devName
            );
            if (!devExists && devName !== 'lo') {
              cmdResult = { raw: `% Cannot find device "${String(m[3])}"` };
            } else if (!isValidIpCidrValue(String(m[2]))) {
              cmdResult = { raw: `Error: invalid address "${String(m[2])}"` };
            } else {
              const target = m[2].includes(':') ? mem.configuredIps6 : mem.configuredIps;
              target[resolveIfaceName(context?.ports, m[3]) || m[3]] = m[2];
              cmdResult = { raw: '' };
            }
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b47',
    order: 47,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => ((vendorId === 'linux' || vendorId === 'openwrt') && /^ip\s+route\s+add\s+\S+/i.test(rawInput.trim())),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Linux: "ip route add 0.0.0.0/0 via 10.0.0.1" (also "ip route add default via <gw>")
          const m = rawInput.trim().match(/^ip\s+route\s+add\s+(\S+)\s+via\s+(\S+)/i);
          if (m) {
            const dst = m[1].toLowerCase() === 'default' ? '0.0.0.0/0' : m[1];
            if (!isValidIpv4RouteDst(String(dst)) || !isValidIpv4(String(m[2]))) {
              cmdResult = { raw: `Error: invalid route "${String(dst)} via ${String(m[2])}"` };
            } else {
              mem.routes.push({ dst, gateway: m[2], distance: 1 });
              cmdResult = { raw: '' };
            }
          } else {
            cmdResult = { raw: '% Usage: ip route add <dst> via <gateway>' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b59',
    order: 59,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (/^hostname\s+(\S+)/i.test(rawInput.trim()) && vendorId === 'linux'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const m = rawInput.trim().match(/^hostname\s+(\S+)/i);
          if (m) {
            mem.hostname = m[1];
            cmdResult = { raw: '' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b71',
    order: 71,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => ((vendorId === 'linux' || vendorId === 'openwrt') && /^systemctl\s+(start|stop|restart)\s+(nginx|apache2|apache|httpd)\b/i.test(rawInput.trim())),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Linux: "systemctl start|stop|restart nginx|apache2"
          const m = rawInput.trim().match(/^systemctl\s+(start|stop|restart)\s+(nginx|apache2|apache|httpd)\b/i);
          mem.webServer = { ...(mem.webServer || { enabled: true, port: 80, content: '' }), enabled: m![1] !== 'stop' };
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b72',
    order: 72,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => ((vendorId === 'linux' || vendorId === 'openwrt') && /^service\s+(nginx|apache2|apache|httpd)\s+(start|stop|restart)\b/i.test(rawInput.trim())),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const m = rawInput.trim().match(/^service\s+(nginx|apache2|apache|httpd)\s+(start|stop|restart)\b/i);
          mem.webServer = { ...(mem.webServer || { enabled: true, port: 80, content: '' }), enabled: m![1] !== 'stop' };
          cmdResult = { raw: '' };
        
    return cmdResult;
  },
  },
  {
    name: 'b73',
    order: 73,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => ((vendorId === 'linux' || vendorId === 'openwrt') && /^echo\s+"([^"]*)"\s*>\s*\/var\/www\/html\/index\.html/i.test(rawInput.trim())),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Linux: echo "konten situs" > /var/www/html/index.html
          const m = rawInput.trim().match(/^echo\s+"([^"]*)"\s*>\s*\/var\/www\/html\/index\.html/i);
          if (m) {
            mem.webServer = { ...(mem.webServer || { enabled: true, port: 80, content: '' }), content: m[1] };
            cmdResult = { raw: '' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b74',
    order: 74,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => ((vendorId === 'linux' || vendorId === 'openwrt') && /^echo\s+["']?nameserver\s+(\d+\.\d+\.\d+\.\d+)\s*["']?\s*>\s*\/etc\/resolv\.conf/i.test(rawInput.trim())),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Linux: echo "nameserver 203.0.113.1" > /etc/resolv.conf
          const m = rawInput.trim().match(/^echo\s+["']?nameserver\s+(\d+\.\d+\.\d+\.\d+)\s*["']?\s*>\s*\/etc\/resolv\.conf/i);
          if (m) {
            mem.dnsServers = [m[1]];
            cmdResult = { raw: '' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b75',
    order: 75,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => ((vendorId === 'linux' || vendorId === 'openwrt') && /^cat\s+\/etc\/resolv\.conf/i.test(rawInput.trim())),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          const servers = mem.dnsServers || [];
          cmdResult = { raw: servers.length > 0 ? servers.map((s: string) => `nameserver ${String(s)}`).join('\n') : '# empty (no DNS servers configured)' };
        
    return cmdResult;
  },
  },
  {
    name: 'b91',
    order: 91,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => ((vendorId === 'linux' || vendorId === 'openwrt') && /^(dhclient|udhcpc)\s/i.test(rawInput.trim())),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Linux: "dhclient eth1" / "udhcpc -i eth1" → DHCP client
          const m = rawInput.trim().match(/^(?:dhclient|udhcpc(?:\s+-i)?)\s+(\S+)/i);
          if (m) {
            const iface = resolveIfaceName(context?.ports, m[1]) || m[1];
            cmdResult = { raw: grantDhcpClient(context, mem, iface, true) };
          } else {
            cmdResult = { raw: '% Usage: dhclient <interface>' };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b164',
    order: 164,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'nslookup' && (vendorId === 'linux' || vendorId === 'openwrt')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Linux: "nslookup <domain>" — resolves via the engine's DNS (static
    // records on the configured DNS servers), falls back to the old fake
    // resolver when no engine callback is wired up.
          const host = String(payload?.host || rawInput.trim().split(/\s+/).pop() || '');
          if (typeof context.dnsResolver === 'function') {
            const r = context.dnsResolver(host);
            cmdResult = { type: 'nslookup', host, server: r.server || '', resolved: r.resolved ?? null, timedOut: !!r.timedOut, nxdomain: !!r.nxdomain };
          } else {
            // Tanpa resolver engine: TIDAK boleh mengarang IP (fakeDnsIp dihapus).
            // DNS server terkonfigurasi tetap disebutkan; hasil jujur = timed out.
            const servers = mem.dnsServers || [];
            cmdResult = { type: 'nslookup', host, server: String(servers[0] || ''), resolved: null, timedOut: true, nxdomain: false };
          }
        
    return cmdResult;
  },
  },
  {
    name: 'b165',
    order: 165,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'http_get' && (vendorId === 'linux' || vendorId === 'openwrt')),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // Linux: "curl http://192.168.1.10" / "curl <ip>" — checks real connectivity
          let url = String(payload?.url || rawInput.trim().split(/\s+/).pop() || '');
          url = url.replace(/^["']|["']$/g, '');
          const m = url.match(/^https?:\/\/([^/:]+)(?::(\d+))?/i) || url.match(/^(\d+\.\d+\.\d+\.\d+)(?::(\d+))?/);
          const host = m ? m[1] : '';
          const port = m?.[2] ? parseInt(m[2], 10) : 80;
          cmdResult = { type: 'http_get', host, port };
        
    return cmdResult;
  },
  },
  {
    name: 'b189',
    order: 189,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'uname' && vendorId === 'linux'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = { type: 'uname' };
        
    return cmdResult;
  },
  },
  {
    name: 'b190',
    order: 190,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (normalized.action === 'cat_file' && vendorId === 'linux'),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

          cmdResult = {
            type: 'cat_file',
            path: String(payload?.path || ''),
            info: {
              configuredIps: mem.configuredIps,
              routes: mem.routes,
              dnsServers: mem.dnsServers,
              dnsRecords: mem.dnsRecords,
              hostname: mem.hostname,
            },
          };
        
    return cmdResult;
  },
  },
];

registerEntries('linux', linuxEntries);

export function linuxCommand(raw: string, context: VendorContext, mem: NodeMemory): CommandResult | undefined {
  const t = raw.trim();
  let m: RegExpMatchArray | null;

  // DHCP server — /etc/dhcp/dhcpd.conf
  m = t.match(/^echo\s+"([^"]+)"\s*>\s*\/etc\/dhcp\/dhcpd\.conf/i);
  if (m) {
    const conf = m[1];
    const subnet = conf.match(/subnet\s+(\d+\.\d+\.\d+\.\d+)\s+netmask\s+(\d+\.\d+\.\d+\.\d+)\s*\{/i);
    const range = conf.match(/range\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)/i);
    const router = conf.match(/option\s+routers\s+(\d+\.\d+\.\d+\.\d+)/i);
    if (subnet && range) {
      const name = `lan${String(mem.dhcpPools.length + 1)}`;
      mem.dhcpPools.push({
        name,
        range: `${String(range[1])}-${String(range[2])}`,
        network: networkOfMask(subnet[1], subnet[2]) || '',
        iface: '',
        gateway: router ? router[1] : '',
      });
    }
    return { raw: '' };
  }

  // NAT — iptables masquerade
  m = t.match(/^iptables\s+-t\s+nat\s+-A\s+POSTROUTING\s+-o\s+(\S+)\s+-j\s+MASQUERADE/i);
  if (m) {
    mem.natRules.push({ chain: 'srcnat', action: 'masquerade', outInterface: m[1] });
    return { raw: '' };
  }
  // NAT — iptables DNAT port-forward
  m = t.match(/^iptables\s+-t\s+nat\s+-A\s+PREROUTING\s+-i\s+(\S+)\s+-p\s+(tcp|udp)\s+--dport\s+(\d+)\s+-j\s+DNAT\s+--to-destination\s+(\d+\.\d+\.\d+\.\d+)(?::(\d+))?/i);
  if (m) {
    mem.natRules.push({
      chain: 'dstnat',
      action: 'dst-nat',
      protocol: m[2].toLowerCase(),
      dstPort: m[3],
      toAddresses: m[4].split(':')[0],
      toPorts: m[5] || '',
    });
    return { raw: '' };
  }

  // DNS static — /etc/hosts
  m = t.match(/^echo\s+["']?(\d+\.\d+\.\d+\.\d+)\s+(\S+)["']?\s*>>?\s*\/etc\/hosts/i);
  if (m) {
    mem.dnsRecords.push({ name: m[2].toLowerCase().replace(/["']/g, ''), address: m[1] });
    return { raw: '' };
  }

  // Tampilan
  if (/^cat\s+\/etc\/dhcp\/dhcpd\.conf/i.test(t)) {
    const pools = mem.dhcpPools || [];
    if (pools.length === 0) return { raw: '# /etc/dhcp/dhcpd.conf — (belum ada pool)' };
    return {
      raw: pools.map((p) =>
        `subnet ${String(p.network ? cidrOf(p.network).split('/')[0] : '0.0.0.0')} netmask 255.255.255.0 {\n  range ${String(String(p.range || '').replace('-', ' '))};\n  option routers ${String(p.gateway || '0.0.0.0')};\n}`
      ).join('\n'),
    };
  }
  if (/^iptables\s+-t\s+nat\s+-L/i.test(t)) {
    const rules = mem.natRules || [];
    if (rules.length === 0) return { raw: 'Chain PREROUTING (policy ACCEPT)\nChain POSTROUTING (policy ACCEPT)' };
    return {
      raw: [
        'Chain PREROUTING (policy ACCEPT)',
        ...rules.filter((r) => r.chain === 'dstnat').map((r) =>
          `DNAT       ${String(r.protocol || 'tcp')}  --  anywhere  anywhere  dpt:${String(r.dstPort || '?')} to:${String(r.toAddresses || '?')}${String(r.toPorts ? ':' + r.toPorts : '')}`
        ),
        'Chain POSTROUTING (policy ACCEPT)',
        ...rules.filter((r) => r.chain === 'srcnat').map((r) =>
          `MASQUERADE  all  --  anywhere  anywhere`
        ),
      ].join('\n'),
    };
  }
  return undefined;
}
