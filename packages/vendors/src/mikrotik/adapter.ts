// GENERATED — adapter vendor mikrotik (diekstraksi dari index.ts lama).
import { CLIParser } from '../../../cli/src/index';
import type { NormalizedCommand } from '../../../cli/src/index';
import type { CommandResult, VendorAdapter as _IV } from '../common/types';
import { recordArray, recordObject } from '../common/types';

import { isPrefix } from '../common/ip';
import { portOperational } from '../common/state';
import { formatExtended } from '../common/format';

export class MikroTikVendorAdapter implements _IV {
  vendorId = 'mikrotik';
  vendorName = 'MikroTik RouterOS';
  promptTemplate = '[admin@MikroTik] > ';
  private parser = new CLIParser();

  parseSyntax(rawInput: string): NormalizedCommand {
    const ast = this.parser.parse(rawInput);
    let target = 'routeros';
    let action = String(ast.command).toLowerCase();

    if (String(ast.command).startsWith('/')) {
      const parts = String(ast.command).split('/').filter(Boolean);
      action = (parts.pop() || '').toLowerCase();
      if (parts.length > 0) target = parts.join('_').toLowerCase();
    }

    if (ast.subCommands.length > 0) {
      const s0 = ast.subCommands[0].toLowerCase();
      const s1 = String(ast.subCommands[1] || '').toLowerCase();
      if (isPrefix(action, 'ip') && isPrefix(s0, 'address')) {
        target = 'ip_address';
        action = s1 || 'print';
      }
      if (isPrefix(action, 'ip') && isPrefix(s0, 'route')) {
        target = 'ip_route';
        action = s1 || 'print';
      }
      if (isPrefix(action, 'ip') && isPrefix(s0, 'dns')) {
        target = 'ip_dns';
        action = s1 || 'print';
      }
      if (isPrefix(action, 'ip') && isPrefix(s0, 'neighbor')) {
        target = 'ip_neighbor';
        action = s1 || 'print';
      }
      if (isPrefix(action, 'ip') && isPrefix(s0, 'dhcp-server')) {
        target = 'ip_dhcp-server';
        action = s1 || 'print';
      }
      if (isPrefix(action, 'ip') && isPrefix(s0, 'firewall') && isPrefix(s1, 'nat')) {
        target = 'ip_firewall_nat';
        action = String(ast.subCommands[2] || 'print').toLowerCase();
      }
      if (isPrefix(action, 'interface') && isPrefix(s0, 'vlan')) {
        target = 'interface_vlan';
        action = s1 || 'print';
      }
      if (isPrefix(action, 'system') && isPrefix(s0, 'identity')) {
        target = 'system_identity';
        action = s1 || 'print';
      }
      if (isPrefix(action, 'system') && isPrefix(s0, 'resource')) {
        target = 'system_resource';
        action = s1 || 'print';
      }
      if (isPrefix(action, 'routing')) {
        // "/routing bgp|ospf|rip instance|peer|network add|print ..."
        const verb = String(ast.subCommands[2] || s1 || 'print').toLowerCase();
        if (isPrefix(s0, 'bgp')) {
          target = isPrefix(s1, 'instance') || isPrefix(s1, 'peer') || isPrefix(s1, 'network')
            ? `routing_bgp_${String(s1)}`
            : 'routing_bgp';
          action = isPrefix(s1, 'instance') || isPrefix(s1, 'peer') || isPrefix(s1, 'network') ? verb : s1 || 'print';
        } else if (isPrefix(s0, 'ospf') || isPrefix(s0, 'rip')) {
          target = isPrefix(s1, 'instance') || isPrefix(s1, 'network')
            ? `routing_${String(s0)}_${String(s1)}`
            : `routing_${String(s0)}`;
          action = isPrefix(s1, 'instance') || isPrefix(s1, 'network') ? verb : s1 || 'print';
        } else if (isPrefix(s0, 'vrrp')) {
          target = `routing_vrrp_${String(s1 || 'instance')}`;
          action = (ast.subCommands[2] || (s1 || 'print')).toLowerCase();
        }
      }
      if (isPrefix(action, 'interface') && isPrefix(s0, 'wireless')) {
        target = 'interface_wireless';
        action = String(ast.subCommands[2] || s1 || 'print').toLowerCase();
      }
      if (isPrefix(action, 'static') && target === 'ip_dns') {
        // "/ip dns static <verb>" — verb adalah sub-command ke-2 (['dns','static','print'])
        target = 'ip_dns_static';
        action = s1 || 'print';
      }
      if (isPrefix(action, 'service') && target === 'ip') {
        // "/ip service <verb>" — verb adalah sub-command ke-2 (['service','print'])
        target = 'ip_service';
        action = s1 || 'print';
      }
      if (isPrefix(action, 'interface')) {
        // "/interface print|set|disable|enable <name>" langsung di level interface;
        // selain itu (bridge/wireless/vlan) → sub-target tersendiri.
        if (!s0 || isPrefix(s0, 'print') || isPrefix(s0, 'set') || isPrefix(s0, 'disable') || isPrefix(s0, 'enable') || isPrefix(s0, 'monitor')) {
          target = 'interface';
          action = s0 || 'print';
          return { action, target, payload: { raw: rawInput, ast, iface: ast.kwargs['interface'] || '' } };
        }
        target = `interface_${String(s0)}`;
        action = s1 || 'print';
      }
    }

    if (action === 'add' && target === 'ip_address') {
      return { action: 'add_ip', target, payload: { raw: rawInput, ast, ip: ast.kwargs['address'], iface: ast.kwargs['interface'] } };
    }
    if (action === 'add' && target === 'ip_route') {
      return { action: 'add_route', target, payload: { raw: rawInput, ast, dst: ast.kwargs['dst-address'], gw: ast.kwargs['gateway'], distance: ast.kwargs['distance'] } };
    }
    if (action === 'add' && target === 'routing_bgp_instance') {
      return { action: 'bgp_instance_add', target, payload: { raw: rawInput, ast, as: ast.kwargs['as'], routerId: ast.kwargs['router-id'] } };
    }
    if (action === 'add' && target === 'routing_bgp_peer') {
      return { action: 'bgp_peer_add', target, payload: { raw: rawInput, ast, remoteAs: ast.kwargs['remote-as'], remoteAddr: ast.kwargs['remote-address'], name: ast.kwargs['name'] } };
    }
    if (action === 'print' && target === 'routing_bgp_peer') {
      return { action: 'bgp_peer_print', target, payload: { raw: rawInput, ast } };
    }
    if (isPrefix(action, 'ping')) {
      const host = ast.subCommands[0];
      return { action: 'ping', target, payload: { raw: rawInput, ast, host } };
    }
    // RouterOS "/tool ping <host>" — action = 'tool' (bagian terakhir setelah split).
    if (isPrefix(action, 'tool') && isPrefix(ast.subCommands[0], 'ping')) {
      return { action: 'ping', target: 'tool', payload: { raw: rawInput, ast, host: ast.subCommands[1] || ast.subCommands[0] } };
    }
    if (isPrefix(action, 'tool') && isPrefix(ast.subCommands[0], 'traceroute')) {
      return { action: 'traceroute', target: 'tool', payload: { raw: rawInput, ast, host: ast.subCommands[1] || ast.subCommands[0] } };
    }

    if (action === 'interface' && !ast.subCommands.length) {
      return { action: 'interface_print', target, payload: { raw: rawInput, ast } };
    }
    return { action: action || 'EXEC_COMMAND', target, payload: { raw: rawInput, ast } };
  }

  formatResponse(cmdResult: CommandResult | undefined): string {
    if (!cmdResult) return '';
    if (cmdResult.type === 'help') {
      return [
        'Available menu paths:',
        '  /interface              -- interface management',
        '  /interface wireless     -- wireless interface config',
        '  /interface bridge       -- bridge config',
        '  /ip address             -- IP address assignment',
        '  /ip route               -- routing table',
        '  /ip firewall filter     -- firewall filter rules',
        '  /ip firewall nat        -- NAT rules',
        '  /ip firewall mangle     -- mangle rules',
        '  /ip dhcp-server         -- DHCP server',
        '  /ip dhcp-client         -- DHCP client',
        '  /ip dns                 -- DNS configuration',
        '  /ip pool                -- IP pool configuration',
        '  /ip service             -- enabled services',
        '  /routing ospf instance  -- OSPF instances',
        '  /routing ospf area      -- OSPF areas',
        '  /routing bgp instance   -- BGP instances',
        '  /routing bgp peer       -- BGP peers',
        '  /queue simple           -- simple queue',
        '  /queue tree             -- queue tree',
        '  /system identity        -- hostname',
        '  /system resource        -- system resource info',
        '  /system clock           -- system clock',
        '  /system reboot          -- reboot system',
        '  /tool ping <host>       -- send ICMP echo',
        '  /tool traceroute <host> -- trace route',
        '  ping <host>             -- send ICMP echo (shorthand)',
        '  export                  -- export config',
        '  import                  -- import config',
      ].join('\n');
    }
    if (cmdResult.type === 'ip_address_print') {
      const ports = (cmdResult.ports || []) as Array<Record<string, unknown>>;
      const header = 'Flags: X - disabled\n # ADDRESS            NETWORK         INTERFACE\n';
      const rows = ports.map((p, i: number) =>
        ` ${String(i)} ${String(String(p.ipAddress || 'unassigned').padEnd(20))} ${String((p.ipAddress ? String(p.ipAddress).split('/')[0].replace(/\.\d+$/, '.0') + '/' + String(p.ipAddress).split('/')[1] : '').padEnd(16))} ${String(p.name)}`
      ).join('\n');
      return header + (rows || ' -- no entries --');
    }
    if (cmdResult.type === 'ip_route_print') {
      const routes = (cmdResult.routes || []) as Array<Record<string, unknown>>;
      const header = 'Flags: X - disabled, A - active, D - dynamic, C - connect, S - static\n # DST-ADDRESS        PREF-SRC        GATEWAY         DISTANCE\n';
      const rows = routes.map((r, i: number) =>
        ` ${String(i)} ${String(String(r.dst || '0.0.0.0/0').padEnd(20))} ${String(String(r.prefSrc || '').padEnd(16))} ${String(String(r.gateway || '').padEnd(16))} ${String(r.distance || 1)}`
      ).join('\n');
      return header + (rows || ' -- no entries --');
    }
    if (cmdResult.type === 'interface_print') {
      const ifaces = (cmdResult.ifaces || []) as Array<Record<string, unknown>>;
      const shutdown = (cmdResult.shutdownIfaces || []) as string[];
      const header = 'Flags: D - dynamic, X - disabled, R - running, S - slave\n #    NAME                TYPE       ACTUAL-MTU L2MTU MAC-ADDRESS       IP-ADDRESS\n';
      const rows = ifaces.map((p, i: number) => {
        const op = portOperational(p, shutdown);
        const flag = op.label === 'up' ? 'R' : op.label === 'administratively down' ? 'X' : ' ';
        return ` ${String(i)} ${String(flag)} ${String(String(p.name || '').padEnd(20))} ether      1500       1598   ${String(String(p.macAddress || '00:00:00:00:00:00').padEnd(18))} ${String(p.ipAddress || '--')}`;
      }).join('\n');
      return header + (rows || ' -- no entries --');
    }
    if (cmdResult.type === 'ping') {
      // Tanpa engine simulator, jangan pura-pura sukses (no fake success).
      // Host app selalu menyuplai context.pingSimulator; fallback ini jujur.
      const host = cmdResult.target || '192.168.88.1';
      return [
        `  SEQ HOST                                     SIZE TTL TIME  STATUS`,
        `    ping to ${String(host)}: simulation engine not available in this context — use NetLab ping panel.`,
      ].join('\n');
    }
    if (cmdResult.type === 'bgp_peer_print') {
      const peers = (cmdResult.peers || []) as Array<Record<string, unknown>>;
      const header = 'Flags: X - disabled, E - established, C - connected, P - peer in AS\n #   NAME                                  REMOTE-ADDRESS                                  REMOTE-AS\n';
      const rows = peers.map((p, i: number) => {
        const established = p.state === 'Established';
        return ` ${String(i)} ${String(established ? 'E' : 'X')} ${String(String(p.name || 'peer' + i).padEnd(37))} ${String(String(p.remoteAddr || '0.0.0.0').padEnd(47))} ${String(p.remoteAs || '0')}`;
      }).join('\n');
      return header + (rows || ' -- no entries --');
    }
    if (cmdResult.type === 'version' || cmdResult.type === 'show_version') {
      const model = cmdResult.model || 'MikroTik RouterBOARD 3011UiAS-RM';
      const hostname = cmdResult.hostname || 'MikroTik';
      return [
        `              uptime: 2d14h22m7s`,
        '                 version: 7.12.1 (stable)',
        '              build-time: Dec/06/2023 09:35:38',
        '              free-memory: 912.0MiB',
        '             total-memory: 1024.0MiB',
        '                      cpu: ARM64',
        '                cpu-count: 4',
        '          cpu-frequency: 1800MHz',
        '               cpu-load: 2%',
        `                    name: ${String(hostname)}`,
        `             router-board: ${String(model)}`,
        '              model: ' + model,
        '  serial-number: 4C3005F6E0CE',
        '   firmware-type: arm64',
        '       factory-software: 6.49.6',
        '  current-firmware: 7.12.1',
        '  upgrade-firmware: 7.12.1',
      ].join('\n');
    }
    if (cmdResult.type === 'identity_print') {
      return `name: ${String(cmdResult.name || 'MikroTik')}`;
    }
    if (cmdResult.type === 'fhrp_print') {
      const groups = (cmdResult.groups || []) as Array<Record<string, unknown>>;
      const header = 'Flags: R - running, M - master\nColumns: NAME, INTERFACE, VRID, STATE, IP-ADDRESS, PRIORITY\n';
      const rows = groups.map((g, i: number) => {
        const isMaster = g.isMaster === true;
        const addr = g.virtualAddress || g.vip || '0.0.0.0/24';
        const name = g.masterName || `vrrp${String(i + 1)}`;
        return ` R ${String(isMaster ? 'M' : 'B')} name=${String(name)} interface=${String(g.interface || '')} vrid=${String(g.vrid || 1)} state=${String(isMaster ? 'MASTER' : 'BACKUP')} address=${String(addr)} priority=${String(g.priority ?? 100)}`;
      });
      return header + (rows.join('\n') || ' -- no entries --');
    }
    if (cmdResult.type === 'ipv6_print') {
      const info = recordObject(cmdResult.info);
      if (!info) return ' -- no IPv6 configuration --';
      const addrs = recordArray(info.addresses);
      const routes = recordArray(info.routes);
      const neighs = recordArray(info.neighbors);
      const addrRows = addrs.map((a) => ` ${String(String(a.iface || '').padEnd(9))} ${String(a.address)}/${String(a.prefix)}`);
      const routeRows = routes.map((r) => ` ${String(String(r.dst || '').padEnd(24))} ${String(r.gateway ? 'via ' + String(r.gateway) : '---')}`);
      const neighRows = neighs.map((n) => ` ${String(String(n.ip || '').padEnd(24))} ${String(String(n.mac || '').padEnd(18))} ${String(n.iface || '')}`);
      return [
        'Columns: INTERFACE, ADDRESS',
        ...(addrRows.length ? addrRows : [' -- no IPv6 addresses --']),
        '',
        'Columns: DST-ADDRESS, GATEWAY',
        ...(routeRows.length ? routeRows : [' -- no IPv6 routes --']),
        '',
        'Columns: ADDRESS, MAC-ADDRESS, INTERFACE',
        ...(neighRows.length ? neighRows : [' -- no IPv6 neighbors --']),
      ].join('\n');
    }
    if (cmdResult.type === 'ipv6_dhcp_print') {
      const info = recordObject(cmdResult.info);
      const addrs = recordArray(info ? info.addresses : null);
      const rows = (cmdResult.clients || []).map((rawIface) => {
        const iface = String((rawIface as Record<string, unknown>).iface ?? rawIface);
        const addr = addrs.find((a) => a.iface === iface);
        return ` ${String(iface.padEnd(9))} state=BOUND address=${addr ? `${String(addr.address)}/${String(addr.prefix)}` : 'slaac-pending'} prefix-len=64`;
      });
      const header = 'Columns: INTERFACE, STATE, ADDRESS\nFlags: X - disabled, R - running\n';
      return header + (rows.join('\n') || ' -- no entries --');
    }
    return String(cmdResult.raw ?? formatExtended(cmdResult) ?? '');
  }
}
