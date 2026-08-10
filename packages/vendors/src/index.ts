import { NormalizedCommand, CLIParser } from '../../cli/src/index';

const isPrefix = (input: string | undefined, target: string) => !!input && target.startsWith(input.toLowerCase());

// ============================================================
// Interface
// ============================================================
export interface IVendorAdapter {
  vendorId: string;
  vendorName: string;
  promptTemplate: string;
  parseSyntax(rawInput: string): NormalizedCommand;
  formatResponse(cmdResult: unknown): string;
}

// ============================================================
// MikroTik RouterOS Adapter
// ============================================================
export class MikroTikVendorAdapter implements IVendorAdapter {
  vendorId = 'mikrotik';
  vendorName = 'MikroTik RouterOS';
  promptTemplate = '[admin@MikroTik] > ';
  private parser = new CLIParser();

  parseSyntax(rawInput: string): NormalizedCommand {
    const ast = this.parser.parse(rawInput);
    let target = 'routeros';
    let action = ast.command.toLowerCase();

    if (ast.command.startsWith('/')) {
      const parts = ast.command.split('/').filter(Boolean);
      action = (parts.pop() || '').toLowerCase();
      if (parts.length > 0) target = parts.join('_').toLowerCase();
    }

    if (ast.subCommands.length > 0) {
      const s0 = ast.subCommands[0].toLowerCase();
      const s1 = (ast.subCommands[1] || '').toLowerCase();
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
        action = (ast.subCommands[2] || 'print').toLowerCase();
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
        const verb = (ast.subCommands[2] || s1 || 'print').toLowerCase();
        if (isPrefix(s0, 'bgp')) {
          target = isPrefix(s1, 'instance') || isPrefix(s1, 'peer') || isPrefix(s1, 'network')
            ? `routing_bgp_${s1}`
            : 'routing_bgp';
          action = isPrefix(s1, 'instance') || isPrefix(s1, 'peer') || isPrefix(s1, 'network') ? verb : s1 || 'print';
        } else if (isPrefix(s0, 'ospf') || isPrefix(s0, 'rip')) {
          target = isPrefix(s1, 'instance') || isPrefix(s1, 'network')
            ? `routing_${s0}_${s1}`
            : `routing_${s0}`;
          action = isPrefix(s1, 'instance') || isPrefix(s1, 'network') ? verb : s1 || 'print';
        } else if (isPrefix(s0, 'vrrp')) {
          target = `routing_vrrp_${s1 || 'instance'}`;
          action = (ast.subCommands[2] || (s1 || 'print')).toLowerCase();
        }
      }
      if (isPrefix(action, 'interface') && isPrefix(s0, 'wireless')) {
        target = 'interface_wireless';
        action = (ast.subCommands[2] || s1 || 'print').toLowerCase();
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
        target = `interface_${s0}`;
        action = s1 || 'print';
      }
    }

    if (action === 'add' && target === 'ip_address') {
      return { action: 'add_ip', target, payload: { raw: rawInput, ast, ip: ast.kwargs['address'], iface: ast.kwargs['interface'] } };
    }
    if (action === 'add' && target === 'ip_route') {
      return { action: 'add_route', target, payload: { raw: rawInput, ast, dst: ast.kwargs['dst-address'], gw: ast.kwargs['gateway'] } };
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

    if (action === 'interface' && !ast.subCommands.length) {
      return { action: 'interface_print', target, payload: { raw: rawInput, ast } };
    }
    return { action: action || 'EXEC_COMMAND', target, payload: { raw: rawInput, ast } };
  }

  formatResponse(cmdResult: any): string {
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
      const ports = cmdResult.ports || [];
      const header = 'Flags: X - disabled\n # ADDRESS            NETWORK         INTERFACE\n';
      const rows = ports.map((p: any, i: number) =>
        ` ${i} ${(p.ipAddress || 'unassigned').padEnd(20)} ${(p.ipAddress ? p.ipAddress.split('/')[0].replace(/\.\d+$/, '.0') + '/' + p.ipAddress.split('/')[1] : '').padEnd(16)} ${p.name}`
      ).join('\n');
      return header + (rows || ' -- no entries --');
    }
    if (cmdResult.type === 'ip_route_print') {
      const routes = cmdResult.routes || [];
      const header = 'Flags: X - disabled, A - active, D - dynamic, C - connect, S - static\n # DST-ADDRESS        PREF-SRC        GATEWAY         DISTANCE\n';
      const rows = routes.map((r: any, i: number) =>
        ` ${i} ${(r.dst || '0.0.0.0/0').padEnd(20)} ${(r.prefSrc || '').padEnd(16)} ${(r.gateway || '').padEnd(16)} ${r.distance || 1}`
      ).join('\n');
      return header + (rows || ' -- no entries --');
    }
    if (cmdResult.type === 'interface_print') {
      const ifaces = cmdResult.ifaces || [];
      const shutdown = (cmdResult.shutdownIfaces || []) as string[];
      const header = 'Flags: D - dynamic, X - disabled, R - running, S - slave\n #    NAME                TYPE       ACTUAL-MTU L2MTU MAC-ADDRESS       IP-ADDRESS\n';
      const rows = ifaces.map((p: any, i: number) => {
        const disabled = shutdown.includes(p.name) ? 'X' : 'R';
        return ` ${i} ${disabled} ${(p.name || '').padEnd(20)} ether      1500       1598   ${(p.macAddress || '00:00:00:00:00:00').padEnd(18)} ${p.ipAddress || '--'}`;
      }).join('\n');
      return header + (rows || ' -- no entries --');
    }
    if (cmdResult.type === 'ping') {
      const host = cmdResult.target || '192.168.88.1';
      return [
        `  SEQ HOST                                     SIZE TTL TIME  STATUS`,
        `    0 ${host.padEnd(40)} 56  64  0ms  echo reply`,
        `    1 ${host.padEnd(40)} 56  64  1ms  echo reply`,
        `    2 ${host.padEnd(40)} 56  64  0ms  echo reply`,
        `    sent=3 received=3 packet-loss=0% min-rtt=0ms avg-rtt=0ms max-rtt=1ms`,
      ].join('\n');
    }
    if (cmdResult.type === 'bgp_peer_print') {
      const peers = cmdResult.peers || [];
      const header = 'Flags: X - disabled, E - established, C - connected, P - peer in AS\n #   NAME                                  REMOTE-ADDRESS                                  REMOTE-AS\n';
      const rows = peers.map((p: any, i: number) =>
        ` ${i} E ${(p.name || 'peer'+i).padEnd(37)} ${(p.remoteAddr || '0.0.0.0').padEnd(47)} ${p.remoteAs || '0'}`
      ).join('\n');
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
        `                    name: ${hostname}`,
        `             router-board: ${model}`,
        '              model: ' + model,
        '  serial-number: 4C3005F6E0CE',
        '   firmware-type: arm64',
        '       factory-software: 6.49.6',
        '  current-firmware: 7.12.1',
        '  upgrade-firmware: 7.12.1',
      ].join('\n');
    }
    if (cmdResult.type === 'identity_print') {
      return `name: ${cmdResult.name || 'MikroTik'}`;
    }
    if (cmdResult.type === 'fhrp_print') {
      const groups = cmdResult.groups || [];
      const header = 'Flags: R - running, M - master\nColumns: NAME, INTERFACE, VRID, STATE, IP-ADDRESS, PRIORITY\n';
      const rows = groups.map((g: any, i: number) => {
        const isMaster = g.isMaster === true;
        const addr = g.virtualAddress || g.vip || '0.0.0.0/24';
        const name = g.masterName || `vrrp${i + 1}`;
        return ` R ${isMaster ? 'M' : 'B'} name=${name} interface=${g.interface || ''} vrid=${g.vrid || 1} state=${isMaster ? 'MASTER' : 'BACKUP'} address=${addr} priority=${g.priority ?? 100}`;
      });
      return header + (rows.join('\n') || ' -- no entries --');
    }
    if (cmdResult.type === 'ipv6_print') {
      const info = cmdResult.info;
      if (!info) return ' -- no IPv6 configuration --';
      const addrRows = (info.addresses || []).map((a: any) => ` ${String(a.iface || '').padEnd(9)} ${a.address}/${a.prefix}`);
      const routeRows = (info.routes || []).map((r: any) => ` ${(r.dst || '').padEnd(24)} ${r.gateway ? 'via ' + r.gateway : '---'}`);
      const neighRows = (info.neighbors || []).map((n: any) => ` ${String(n.ip || '').padEnd(24)} ${String(n.mac || '').padEnd(18)} ${n.iface || ''}`);
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
      const clients = cmdResult.clients || [];
      const info = cmdResult.info || {};
      const rows = clients.map((iface: string) => {
        const addr = (info.addresses || []).find((a: any) => a.iface === iface);
        return ` ${iface.padEnd(9)} state=BOUND address=${addr ? `${addr.address}/${addr.prefix}` : 'slaac-pending'} prefix-len=64`;
      });
      const header = 'Columns: INTERFACE, STATE, ADDRESS\nFlags: X - disabled, R - running\n';
      return header + (rows.join('\n') || ' -- no entries --');
    }
    return String(cmdResult.raw ?? formatExtended(cmdResult) ?? '');
  }
}

// ============================================================
// Cisco IOS Adapter
// ============================================================
export class CiscoVendorAdapter implements IVendorAdapter {
  vendorId = 'cisco_ios';
  vendorName = 'Cisco IOS';
  promptTemplate = 'Router#';
  private parser = new CLIParser();
  private configMode = false;

  parseSyntax(rawInput: string): NormalizedCommand {
    const ast = this.parser.parse(rawInput);
    let action = ast.command.toLowerCase();
    const subs = ast.subCommands.map(s => s.toLowerCase());

    if (isPrefix(action, 'show')) {
      if (isPrefix(subs[0], 'ip') && isPrefix(subs[1], 'interface')) return { action: 'show_ip_int_brief', target: 'ios', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'ip') && isPrefix(subs[1], 'route')) return { action: 'show_ip_route', target: 'ios', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'ip') && isPrefix(subs[1], 'bgp')) return { action: 'show_bgp_summary', target: 'ios', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'ip') && isPrefix(subs[1], 'dhcp') && isPrefix(subs[2], 'pool')) return { action: 'show_ip_dhcp_pool', target: 'ios', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'hosts')) return { action: 'show_hosts', target: 'ios', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'version')) return { action: 'show_version', target: 'ios', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'running-config') || isPrefix(subs[0], 'run')) return { action: 'show_running', target: 'ios', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'interfaces')) return { action: 'show_interfaces', target: 'ios', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'vlan')) return { action: 'show_vlan', target: 'ios', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'spanning-tree')) return { action: 'show_stp', target: 'ios', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'cdp') && isPrefix(subs[1], 'neighbors')) return { action: 'show_cdp_neighbors', target: 'ios', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'lldp') && isPrefix(subs[1], 'neighbors')) return { action: 'show_lldp_neighbors', target: 'ios', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'ip') && isPrefix(subs[1], 'ospf') && isPrefix(subs[2], 'neighbor')) return { action: 'show_ospf_neighbor', target: 'ios', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'tcp') && isPrefix(subs[1], 'brief')) return { action: 'show_tcp_brief', target: 'ios', payload: { raw: rawInput, ast } };
    }
    if (isPrefix(action, 'configure') || isPrefix(action, 'conf')) return { action: 'configure_terminal', target: 'ios', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'enable') || isPrefix(action, 'en')) return { action: 'enable', target: 'ios', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'ping')) return { action: 'ping', target: 'ios', payload: { raw: rawInput, ast, host: subs[0] } };
    if (isPrefix(action, 'ip') && isPrefix(subs[0], 'address')) return { action: 'add_ip', target: 'ios', payload: { raw: rawInput, ast, ip: subs[1], mask: subs[2] } };
    if (isPrefix(action, 'router') && isPrefix(subs[0], 'bgp')) return { action: 'bgp_router', target: 'ios', payload: { raw: rawInput, ast, as: subs[1] } };
    if (isPrefix(action, 'neighbor') && isPrefix(subs[1], 'remote-as')) return { action: 'bgp_neighbor', target: 'ios', payload: { raw: rawInput, ast, ip: subs[0], remoteAs: subs[2] } };
    if (isPrefix(action, 'write') || (isPrefix(action, 'copy') && isPrefix(subs[0], 'running-config') && isPrefix(subs[1], 'startup-config'))) return { action: 'write_mem', target: 'ios', payload: { raw: rawInput, ast } };

    return { action: action || 'EXEC_COMMAND', target: 'ios', payload: { raw: rawInput, ast } };
  }

  formatResponse(cmdResult: any): string {
    if (!cmdResult) return '';
    if (cmdResult.type === 'show_ip_int_brief') {
      const ports = cmdResult.ports || [];
      const header = 'Interface              IP-Address      OK? Method Status                Protocol\n';
      const rows = ports.map((p: any) =>
        `${p.name.padEnd(23)}${(p.ipAddress ? p.ipAddress.split('/')[0] : 'unassigned').padEnd(16)}YES unset  ${p.status === 'up' ? 'up                    up' : 'down                  down'}`
      ).join('\n');
      return header + rows;
    }
    if (cmdResult.type === 'int_status') {
      const ports = cmdResult.ifaces || [];
      const shutdown = (cmdResult.shutdownIfaces || []) as string[];
      const header = 'Port          Name    Status       Vlan     Duplex  Speed Type\n';
      const rows = ports.map((p: any) => {
        const down = shutdown.includes(p.name);
        const status = down ? 'down' : p.status === 'up' ? 'up' : 'down';
        const speed = down || p.status !== 'up' ? '-' : p.speedMbps && p.speedMbps <= 100 ? `${p.speedMbps}Mb/s` : p.speedMbps >= 10000 ? '10G' : '1G';
        return `${(p.name || '').padEnd(12)} ${' '.padEnd(7)} ${status.padEnd(12)} ${(p.vlan || (down ? '--' : '1')).toString().padEnd(8)} ${p.status === 'up' && !down ? 'full' : '  '}   ${speed}`;
      });
      return header + (rows.join('\n') || '-- no interfaces --');
    }
    if (cmdResult.type === 'show_interfaces') {
      const ports = cmdResult.ports || [];
      const shutdown = (cmdResult.shutdownIfaces || []) as string[];
      const macOf = (p: any) => fmtMac(p.macAddress || '005079666800').toUpperCase();
      const lines: string[] = [];
      for (const p of ports) {
        const down = shutdown.includes(p.name);
        const up = p.status === 'up' && !down;
        lines.push(
          `${p.name} is ${down ? 'administratively down' : up ? 'up' : 'down'}, line protocol is ${up ? 'up' : 'down'}${up ? ' (connected)' : ''}`,
          `  Hardware is GbE, address is ${macOf(p)} (bia ${macOf(p)})`,
          `  Internet address is ${p.ipAddress ? p.ipAddress.split('/')[0] + '/' + (p.ipAddress.split('/')[1] || 24) : 'unassigned'}`,
          `  MTU 1500 bytes, BW ${(p.speedMbps || 1000) * 1000} Kbit/sec, DLY 10 usec,`,
          ''
        );
      }
      return lines.join('\n') || '-- no interfaces --';
    }
    if (cmdResult.type === 'show_ip_route') {
      const routes = cmdResult.routes || [];
      const header = 'Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP\n       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area\n\nGateway of last resort is not set\n';
      const rows = routes.map((r: any) => {
        const code = r.kind === 'static' ? 'S' : r.kind === 'dynamic' ? 'O' : 'C';
        if (r.kind === 'connected') {
          return `${code}    ${r.dst || '0.0.0.0/0'} is directly connected, ${r.iface || 'GigabitEthernet0/0'}`;
        }
        return `${code}    ${r.dst || '0.0.0.0/0'} [1/0] via ${r.gateway || '0.0.0.0'}${r.iface ? `, ${r.iface}` : ''}`;
      }).join('\n');
      return header + (rows || '      -- no routes --');
    }
    if (cmdResult.type === 'show_version') {
      const model = cmdResult.model || 'Cisco C1111-4P';
      const hostname = cmdResult.hostname || 'Router';
      return [
        'Cisco IOS XE Software, Version 17.09.04a',
        'Copyright (c) 1986-2024 by Cisco Systems, Inc.',
        '',
        `${model} (ARM64) processor (revision 1.0) with 1048576K/6147K bytes of memory.`,
        `Processor board ID FGL2217L0FN`,
        `Hostname: ${hostname}`,
        '1 Virtual Ethernet interface',
        '4 Gigabit Ethernet interfaces',
        '32768K bytes of non-volatile configuration memory.',
        '4194304K bytes of physical memory.',
        '',
        'Configuration register is 0x2102',
      ].join('\n');
    }
    if (cmdResult.type === 'configure_terminal') {
      return 'Enter configuration commands, one per line. End with CNTL/Z.\nRouter(config)#';
    }
    if (cmdResult.type === 'enable') {
      return 'Router#';
    }
    if (cmdResult.type === 'write_mem') {
      return 'Building configuration...\n[OK]';
    }
    if (cmdResult.type === 'reload') {
      return cmdResult.hadStartup
        ? 'System configuration has been modified. Save? [yes/no]: yes\nProceed with reload? [confirm]\n\n*Mar  1 00:00:05.999: %SYS-5-RELOAD: Reload requested by console.\nReloading...\n[OK]\nDevice restarted. Startup-configuration loaded.'
        : '*Mar  1 00:00:05.999: %SYS-5-RELOAD: Reload requested by console.\nReloading...\n[OK]\nNo startup-configuration present. Device started with default configuration.';
    }
    if (cmdResult.type === 'ping') {
      const host = cmdResult.host || '10.0.0.1';
      return [
        `Type escape sequence to abort.`,
        `Sending 5, 100-byte ICMP Echos to ${host}, timeout is 2 seconds:`,
        `!!!!!`,
        `Success rate is 100 percent (5/5), round-trip min/avg/max = 1/1/2 ms`,
      ].join('\n');
    }
    if (cmdResult.type === 'show_bgp_summary') {
      const peers = cmdResult.peers || [];
      const header = 'BGP router identifier ' + (cmdResult.routerId || '0.0.0.0') + ', local AS number ' + (cmdResult.asn || '0') + '\n\nNeighbor        V           AS MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  State/PfxRcd\n';
      const rows = peers.map((p: any) => {
        const pfx = p.state === 'Established' ? (p.prefixes ?? 0) : p.state;
        return `${(p.remoteAddr || '0.0.0.0').padEnd(15)} 4        ${String(p.remoteAs || 0).padEnd(5)}    1255    1255       0    0    0  ${String(p.uptime || 'never').padEnd(8)} ${pfx}`;
      });
      return header + (rows.join('\n') || 'No BGP neighbors configured.');
    }
    if (cmdResult.type === 'neighbor_print') {
      const neighbors = cmdResult.neighbors || [];
      if (cmdResult.proto === 'cdp') {
        const header = 'Capability Codes: R - Router, T - Trans Bridge, B - Source Route Bridge\n                  S - Switch, H - Host, I - IGMP, r - Repeater, P - Phone\n\nDevice ID        Local Intrfce   Holdtme  Capability  Platform  Port ID\n';
        const rows = neighbors.map((n: any) =>
          `${(n.peerName || '?').padEnd(16)} ${(n.localPort || '').padEnd(15)} 145    R S I       ${(n.peerDeviceType || '').padEnd(9)} ${n.peerPort || ''}`
        );
        return header + (rows.join('\n') || 'Total cdp entries displayed : 0');
      }
      const header = 'Local Intf   Chassis-id      Port id   System Name\n';
      const rows = neighbors.map((n: any) =>
        `${(n.localPort || '').padEnd(12)} ${(n.peerName || '?').padEnd(15)} ${(n.peerPort || '').padEnd(10)} ${n.peerName || ''}`
      );
      return header + (rows.join('\n') || 'Total entries displayed: 0');
    }
    if (cmdResult.type === 'ospf_neighbor_print') {
      const neighbors = cmdResult.neighbors || [];
      const header = 'Neighbor ID     Pri   State           Dead Time   Address         Interface\n';
      const rows = neighbors.map((n: any) =>
        `${(n.routerId || '0.0.0.0').padEnd(15)}   1   FULL/  -        00:00:31    ${(n.ip || '').padEnd(16)} ${n.iface || ''}`
      );
      return header + (rows.join('\n') || '(no OSPF neighbors)');
    }
    if (cmdResult.type === 'tcp_print') {
      const conns = cmdResult.connections || [];
      const header = 'TCB          Local Address               Foreign Address             (state)\n';
      const rows = conns.map((c: any, i: number) =>
        `${('0x' + (1000000 + i).toString(16)).padEnd(12)} ${(c.localIp + '.' + c.localPort).padEnd(26)} ${(c.remoteIp + '.' + c.remotePort).padEnd(28)} ${c.state}`
      );
      return header + (rows.join('\n') || '(no active connections)');
    }
    if (cmdResult.type === 'show_vlan') {
      const vlans = cmdResult.vlans || [];
      const rows = vlans.length > 0
        ? vlans.map((v: any) => `${String(v.id).padEnd(4)} ${(v.name || `VLAN${v.id}`).padEnd(33)}active    Gi0/1, Gi0/2, Gi0/3`).join('\n')
        : '1    default                          active    Gi0/1, Gi0/2, Gi0/3';
      return ['VLAN Name                             Status    Ports',
        '---- -------------------------------- --------- -------------------------------',
        rows,
      ].join('\n');
    }
    if (cmdResult.type === 'show_stp') {
      if (cmdResult.ports && cmdResult.ports.length > 0) {
        const modeLabel = cmdResult.mode === 'rapid-pvst' ? 'rapid-pvst' : cmdResult.mode === 'pvst' ? 'ieee (pvst)' : 'ieee';
        const isRoot = cmdResult.rootId === cmdResult.bridgeId;
        const lines = [
          'VLAN0001',
          `  Spanning tree enabled protocol ${modeLabel}`,
          `  Root ID    Priority    ${String(cmdResult.priority + 1)}`,
          `             Address     ${fmtMac(rootIdStr(cmdResult.rootId))}`,
          `             ${isRoot ? 'This bridge is the root' : `Cost        4`}`,
          `             ${isRoot ? '' : 'Port        ' + (cmdResult.rootPort || '')}`,
          `  Bridge ID  Priority    ${String(cmdResult.priority)}`,
          `             Address     ${fmtMac(rootIdStr(cmdResult.bridgeId))}`,
          'Interface           Role Sts Cost      Prio.Nbr Type',
          '------------------- ---- --- --------- -------- --------',
        ];
        for (const p of cmdResult.ports) {
          const role = p.role === 'root' ? 'Root' : p.role === 'designated' ? 'Desg' : p.role === 'alternate' ? 'Altn' : 'Disa';
          const sts = p.state === 'forwarding' ? 'FWD' : p.state === 'blocking' ? 'BLK' : 'DIS';
          lines.push(`${(p.port || 'Port').padEnd(20)} ${role.padEnd(4)} ${sts.padEnd(3)} ${String(p.cost ?? 4).padEnd(9)} 128.1    P2p${p.state === 'blocking' ? ' *' : ''}`);
        }
        return lines.join('\n');
      }
      return ['VLAN0001',
        '  Spanning tree enabled protocol ieee',
        '  Root ID    Priority    32769',
        '             Address     0011.2233.4455',
        '             This bridge is the root',
        '  Bridge ID  Priority    32769',
        '             Address     0011.2233.4455',
        'Interface           Role Sts Cost      Prio.Nbr Type',
        '------------------- ---- --- --------- -------- --------',
        'Gi0/1               Desg FWD 4         128.1    P2p',
      ].join('\n');
    }
    if (cmdResult.type === 'help') {
      return ['Exec commands:',
        '  clear            Reset functions',
        '  configure        Enter configuration mode',
        '  copy             Copy from one file to another',
        '  dir              List files on a filesystem',
        '  ping             Send echo messages',
        '  reload           Reboots the entire device',
        '  show             Show running system information',
        '  traceroute       Trace route to destination',
        '  where            Show active CLI sessions',
      ].join('\n');
    }
    return String(cmdResult.raw ?? formatExtended(cmdResult) ?? '');
  }
}

// ============================================================
// Cisco NX-OS Adapter
// ============================================================
export class CiscoNxosVendorAdapter implements IVendorAdapter {
  vendorId = 'cisco_nxos';
  vendorName = 'Cisco NX-OS';
  promptTemplate = 'nexus-sw#';
  private parser = new CLIParser();

  parseSyntax(rawInput: string): NormalizedCommand {
    const ast = this.parser.parse(rawInput);
    const action = ast.command.toLowerCase();
    const subs = ast.subCommands.map(s => s.toLowerCase());

    if (isPrefix(action, 'show')) {
      if (isPrefix(subs[0], 'ip') && isPrefix(subs[1], 'interface')) return { action: 'show_ip_int_brief', target: 'nxos', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'vlan')) return { action: 'show_vlan', target: 'nxos', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'interface') && isPrefix(subs[1], 'status')) return { action: 'show_int_status', target: 'nxos', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'version')) return { action: 'show_version', target: 'nxos', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'cdp') && isPrefix(subs[1], 'neighbors')) return { action: 'show_cdp_neighbors', target: 'nxos', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'lldp') && isPrefix(subs[1], 'neighbors')) return { action: 'show_lldp_neighbors', target: 'nxos', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'ip') && isPrefix(subs[1], 'ospf') && isPrefix(subs[2], 'neighbor')) return { action: 'show_ospf_neighbor', target: 'nxos', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'tcp') && isPrefix(subs[1], 'brief')) return { action: 'show_tcp_brief', target: 'nxos', payload: { raw: rawInput, ast } };
    }
    if (isPrefix(action, 'configure') || isPrefix(action, 'conf')) return { action: 'configure_terminal', target: 'nxos', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'ping')) return { action: 'ping', target: 'nxos', payload: { raw: rawInput, ast, host: subs[0] } };
    if (isPrefix(action, 'ip') && isPrefix(subs[0], 'address')) return { action: 'add_ip', target: 'nxos', payload: { raw: rawInput, ast, ip: subs[1], mask: subs[2] } };
    if (isPrefix(action, 'ip') && isPrefix(subs[0], 'route')) return { action: 'add_route', target: 'nxos', payload: { raw: rawInput, ast, dst: `${subs[1]} ${subs[2]}`, gw: subs[3] } };
    if (isPrefix(action, 'router') && isPrefix(subs[0], 'bgp')) return { action: 'bgp_router', target: 'nxos', payload: { raw: rawInput, ast, as: subs[1] } };
    if (isPrefix(action, 'neighbor') && isPrefix(subs[1], 'remote-as')) return { action: 'bgp_neighbor', target: 'nxos', payload: { raw: rawInput, ast, ip: subs[0], remoteAs: subs[2] } };
    return { action: action || 'EXEC_COMMAND', target: 'nxos', payload: { raw: rawInput, ast } };
  }

  formatResponse(cmdResult: any): string {
    if (!cmdResult) return '';
    if (cmdResult.type === 'show_ip_int_brief') {
      const ports = cmdResult.ports || [];
      const header = 'IP Interface Status for VRF "default"(1)\nInterface              IP Address      Interface Status\n';
      const rows = ports.map((p: any) =>
        `${p.name.padEnd(23)}${(p.ipAddress ? p.ipAddress.split('/')[0] : 'unassigned').padEnd(16)}protocol-${p.status === 'up' ? 'up/link-up' : 'down/link-down'}`
      ).join('\n');
      return header + rows;
    }
    if (cmdResult.type === 'show_vlan') {
      const vlans = cmdResult.vlans || [];
      const rows = vlans.length > 0
        ? vlans.map((v: any) => `${String(v.id).padEnd(4)} ${(v.name || `VLAN${v.id}`).padEnd(33)}active    Eth1/1, Eth1/2, Eth1/3`).join('\n')
        : '1    default                          active    Eth1/1, Eth1/2, Eth1/3';
      return ['VLAN Name                             Status    Ports',
        '---- -------------------------------- --------- -------------------------------',
        rows,
      ].join('\n');
    }
    if (cmdResult.type === 'show_version') {
      return 'Cisco Nexus Operating System (NX-OS) Software\nTAC support: http://www.cisco.com/tac\nNX-OS version: 9.3(8)\n';
    }
    if (cmdResult.type === 'int_status') {
      const ports = cmdResult.ifaces || [];
      const shutdown = (cmdResult.shutdownIfaces || []) as string[];
      const header = 'Port          Status    Vlan      Duplex  Speed Type\n';
      const rows = ports.map((p: any) => {
        const down = shutdown.includes(p.name);
        const status = down ? 'down' : p.status === 'up' ? 'connected' : 'notconnected';
        const speed = down || p.status !== 'up' ? '-' : p.speedMbps && p.speedMbps <= 100 ? `${p.speedMbps}Mb/s` : p.speedMbps >= 10000 ? '10G' : '1G';
        return `${(p.name || '').padEnd(13)} ${status.padEnd(10)} ${(p.vlan || (down ? '--' : '1')).toString().padEnd(9)} ${p.status === 'up' && !down ? 'full    ' : ''}${speed}`;
      });
      return header + (rows.join('\n') || '-- no interfaces --');
    }
    if (cmdResult.type === 'show_interfaces') {
      const ports = cmdResult.ports || [];
      const shutdown = (cmdResult.shutdownIfaces || []) as string[];
      const lines: string[] = [];
      for (const p of ports) {
        const down = shutdown.includes(p.name);
        lines.push(
          `${p.name} is ${down ? 'administratively down' : p.status === 'up' ? 'up' : 'down'}, line protocol is ${down || p.status !== 'up' ? 'down' : 'up'}${p.status === 'up' && !down ? ' (connected)' : ''}`,
          `  Hardware is GbE, address is ${fmtMac(p.macAddress || '005079666800').replace(/\./g, '').toUpperCase()} (bia ${fmtMac(p.macAddress || '005079666800').replace(/\./g, '').toUpperCase()})`,
          `  Internet address is ${p.ipAddress ? p.ipAddress.split('/')[0] + '/' + (p.ipAddress.split('/')[1] || 24) : 'unassigned'}`,
          `  MTU 1500 bytes, BW ${(p.speedMbps || 1000) * 1000} Kbit/sec, DLY 10 usec,`,
          ''
        );
      }
      return lines.join('\n') || '-- no interfaces --';
    }
    if (cmdResult.type === 'ping') {
      return `PING ${cmdResult.host}: 56 data bytes\n64 bytes from ${cmdResult.host}: icmp_seq=0 time=0.931 ms\n64 bytes from ${cmdResult.host}: icmp_seq=1 time=0.712 ms\n--- ${cmdResult.host} ping statistics ---\n2 packets transmitted, 2 packets received, 0.00% packet loss`;
    }
    if (cmdResult.type === 'help') return 'show, configure terminal, ping, copy run start';
    return String(cmdResult.raw ?? formatExtended(cmdResult) ?? '');
  }
}

// ============================================================
// Juniper JunOS Adapter
// ============================================================
export class JuniperVendorAdapter implements IVendorAdapter {
  vendorId = 'juniper';
  vendorName = 'Juniper JunOS';
  promptTemplate = 'admin@JunOS> ';
  private parser = new CLIParser();

  parseSyntax(rawInput: string): NormalizedCommand {
    const ast = this.parser.parse(rawInput);
    const action = ast.command.toLowerCase();
    const subs = ast.subCommands.map(s => s.toLowerCase());
    if (isPrefix(action, 'show')) {
      if (isPrefix(subs[0], 'interfaces') && isPrefix(subs[1], 'terse')) return { action: 'show_interfaces_terse', target: 'junos', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'interfaces')) return { action: 'show_interfaces', target: 'junos', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'route')) return { action: 'show_route', target: 'junos', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'bgp') && isPrefix(subs[1], 'summary')) return { action: 'show_bgp_summary', target: 'junos', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'ospf') && isPrefix(subs[1], 'neighbor')) return { action: 'show_ospf_neighbor', target: 'junos', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'version')) return { action: 'show_version', target: 'junos', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'configuration') || isPrefix(subs[0], 'config')) return { action: 'show_running', target: 'junos', payload: { raw: rawInput, ast } };
    }
    if (isPrefix(action, 'ping')) return { action: 'ping', target: 'junos', payload: { raw: rawInput, ast, host: subs[0] } };
    if (isPrefix(action, 'configure') || isPrefix(action, 'edit')) return { action: 'configure', target: 'junos', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'commit')) return { action: 'commit', target: 'junos', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'rollback')) return { action: 'rollback', target: 'junos', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'set')) return { action: 'set_config', target: 'junos', payload: { raw: rawInput, ast, path: subs } };
    return { action: action || 'EXEC_COMMAND', target: 'junos', payload: { raw: rawInput, ast } };
  }

  formatResponse(cmdResult: any): string {
    if (!cmdResult) return '';
    if (cmdResult.type === 'show_interfaces_terse') {
      const ports = cmdResult.ports || [];
      const header = 'Interface               Admin Link Proto    Local                 Remote\n';
      const rows = ports.map((p: any) =>
        `${p.name.padEnd(24)}up    ${p.status === 'up' ? 'up   ' : 'down '} inet     ${p.ipAddress || ''}`.padEnd(70)
      ).join('\n');
      return header + rows;
    }
    if (cmdResult.type === 'show_route') {
      const routes = cmdResult.routes || [];
      if (routes.length === 0) return 'inet.0: 0 destinations, 0 routes (0 active, 0 holddown, 0 hidden)';
      const rows = routes.map((r: any, i: number) => {
        const via = r.gateway ? `> to ${r.gateway} via ${r.iface || 'ge-0/0/0.0'}` : `> directly connected via ${r.iface || 'ge-0/0/0.0'}`;
        const proto = r.kind === 'static' ? 'Static' : r.kind === 'dynamic' ? 'OSPF' : 'Direct';
        return [r.dst, `          *[${proto}/5] 00:12:34, metric 0`, '            ' + via].join(' ');
      });
      return `inet.0: ${routes.length} destinations, ${routes.length} routes (${routes.length} active, 0 holddown, 0 hidden)\n\n` + rows.join('\n');
    }
    if (cmdResult.type === 'show_version') {
      const model = cmdResult.model || 'mx240';
      const hostname = cmdResult.hostname || 'router';
      return [
        'Junos: 22.2R1.9',
        'JUNOS OS Kernel 64-bit [20240115.050253_builder_stable_12]',
        `Hostname: ${hostname}`,
        `Model: ${model}`,
      ].join('\n');
    }
    if (cmdResult.type === 'configure') {
      return 'Entering configuration mode\n\n[edit]\nadmin@JunOS#';
    }
    if (cmdResult.type === 'commit') {
      return 'commit complete';
    }
    if (cmdResult.type === 'commit_check') {
      return 'configuration check succeeds';
    }
    if (cmdResult.type === 'rollback') {
      return 'load complete\n\n[edit]';
    }
    if (cmdResult.type === 'ping') {
      const host = cmdResult.host || '10.0.0.1';
      return [`PING ${host}: 56 data bytes`,
        `64 bytes from ${host}: icmp_seq=0 ttl=255 time=0.412 ms`,
        `64 bytes from ${host}: icmp_seq=1 ttl=255 time=0.389 ms`,
        ``,
        `--- ${host} ping statistics ---`,
        `2 packets transmitted, 2 packets received, 0% packet loss`,
        `round-trip min/avg/max/stddev = 0.389/0.400/0.412/0.011 ms`,
      ].join('\n');
    }
    if (cmdResult.type === 'help') {
      return ['Available commands:',
        '  clear            Clear information in the system',
        '  commit           Commit current set of changes',
        '  configure        Manipulate software configuration information',
        '  edit             Edit configuration',
        '  file             Perform file operations',
        '  help             Provide help information',
        '  monitor          Show real-time debugging information',
        '  ping             Ping remote target',
        '  quit             Exit the management session',
        '  request          Make system-level requests',
        '  restart          Restart software process',
        '  rollback         Roll back to previous commit',
        '  set              Set CLI properties, or variables',
        '  show             Show system information',
        '  start            Start software process',
        '  test             Perform diagnostic tests',
        '  traceroute       Trace route to destination'
      ].join('\n');
    }
    return String(cmdResult.raw ?? formatExtended(cmdResult) ?? '');
  }
}

// ============================================================
// Huawei VRP Adapter
// ============================================================
export class HuaweiVendorAdapter implements IVendorAdapter {
  vendorId = 'huawei';
  vendorName = 'Huawei VRP';
  promptTemplate = '<Huawei>';
  private parser = new CLIParser();

  parseSyntax(rawInput: string): NormalizedCommand {
    const ast = this.parser.parse(rawInput);
    const action = ast.command.toLowerCase();
    const subs = ast.subCommands.map(s => s.toLowerCase());
    if (isPrefix(action, 'display') || isPrefix(action, 'dis')) {
      if (isPrefix(subs[0], 'ip') && isPrefix(subs[1], 'interface')) return { action: 'display_ip_int', target: 'vrp', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'ip') && isPrefix(subs[1], 'routing-table')) return { action: 'display_routing', target: 'vrp', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'current-configuration') || isPrefix(subs[0], 'cu')) return { action: 'display_current', target: 'vrp', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'vlan')) return { action: 'vlan_print', target: 'vrp', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'version')) return { action: 'display_version', target: 'vrp', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'ospf') && isPrefix(subs[1], 'peer')) return { action: 'display_ospf_peer', target: 'vrp', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'lldp') && isPrefix(subs[1], 'neighbor')) return { action: 'show_lldp_neighbors', target: 'vrp', payload: { raw: rawInput, ast } };
    }
    if (isPrefix(action, 'system-view') || isPrefix(action, 'sys')) return { action: 'system_view', target: 'vrp', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'ping')) return { action: 'ping', target: 'vrp', payload: { raw: rawInput, ast, host: subs[0] } };
    if (isPrefix(action, 'save')) return { action: 'save', target: 'vrp', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'quit')) return { action: 'quit', target: 'vrp', payload: { raw: rawInput, ast } };
    return { action: action || 'EXEC_COMMAND', target: 'vrp', payload: { raw: rawInput, ast } };
  }

  formatResponse(cmdResult: any): string {
    if (!cmdResult) return '';
    if (cmdResult.type === 'display_ip_int') {
      const ports = cmdResult.ports || [];
      const rows = ports.map((p: any) =>
        `${p.name}\n  Internet Address is ${p.ipAddress || 'unassigned'}\n  Physical is ${p.status === 'up' ? 'up, line protocol is up' : 'down, line protocol is down'}`
      ).join('\n\n');
      return rows || '-- No interfaces --';
    }
    if (cmdResult.type === 'display_version' || cmdResult.type === 'show_version') {
      const model = cmdResult.model || 'Huawei AR6120';
      const hostname = cmdResult.hostname || 'Huawei';
      return ['Huawei Versatile Routing Platform Software',
        'VRP (R) software, Version 8.230 (AR6120 V300R023C10SPC300)',
        'Copyright (C) 2000-2024 Huawei Technologies Co., Ltd.',
        `${model} uptime is 2 days, 14 hours, 22 minutes`,
        `Sysname: ${hostname}`,
        'DRAM Memory Size    : 1024 M bytes',
        'Flash Memory Size   : 256 M bytes',
      ].join('\n');
    }
    if (cmdResult.type === 'system_view') return '[Huawei]';
    if (cmdResult.type === 'save') return 'The current configuration will be written to the device.\nAre you sure to continue?[Y/N]y\nInfo: Please input the file name ( *.cfg, *.zip ) [vrpcfg.zip]:\nNow saving the current configuration to the slot 0.\nSave the configuration successfully.';
    if (cmdResult.type === 'ping') {
      const host = cmdResult.host || '192.168.1.1';
      return [`PING ${host}: 56  data bytes, press CTRL_C to break`,
        `  Reply from ${host}: bytes=56 Sequence=1 ttl=254 time=1 ms`,
        `  Reply from ${host}: bytes=56 Sequence=2 ttl=254 time=1 ms`,
        ``,
        `--- ${host} ping statistics ---`,
        `  2 packet(s) transmitted, 2 packet(s) received, 0.00% packet loss`,
        `  round-trip min/avg/max = 1/1/1 ms`,
      ].join('\n');
    }
    if (cmdResult.type === 'help') {
      return ['User view commands:',
        '  cd               Change current directory',
        '  clear            Clear information',
        '  clock            Specify the system clock',
        '  debugging        Enable system debugging functions',
        '  dir              List files',
        '  display          Display information',
        '  format           Format the device',
        '  free             Free user terminal interface',
        '  ftp              Establish FTP connection',
        '  language-mode    Specify the language environment',
        '  mkdir            Create a new directory',
        '  more             Display the contents of a file',
        '  ping             Send echo messages',
        '  pwd              Display current working directory',
        '  quit             Exit from current command view',
        '  reboot           Reboot system',
        '  rename           Rename a file or directory',
        '  reset            Reset operation',
        '  rmdir            Remove an existing directory',
        '  save             Save current configuration',
        '  startup          Specify system startup parameters',
        '  system-view      Enter the System View',
        '  telnet           Establish Telnet connection',
        '  terminal         Set the terminal line characteristics',
        '  tracert          Trace route to destination',
        '  undo             Cancel current setting'
      ].join('\n');
    }
    return String(cmdResult.raw ?? formatExtended(cmdResult) ?? '');
  }
}

// ============================================================
// Ubiquiti EdgeOS / VyOS Adapter (shared base)
// ============================================================
export class UbiquitiVendorAdapter implements IVendorAdapter {
  vendorId = 'ubiquiti';
  vendorName = 'Ubiquiti EdgeOS';
  promptTemplate = 'ubnt@EdgeRouter:~$';
  private parser = new CLIParser();

  parseSyntax(rawInput: string): NormalizedCommand {
    const ast = this.parser.parse(rawInput);
    const action = ast.command.toLowerCase();
    const subs = ast.subCommands.map(s => s.toLowerCase());
    if (isPrefix(action, 'show')) {
      if (isPrefix(subs[0], 'interfaces')) return { action: 'show_interfaces', target: 'edgeos', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'ip') && isPrefix(subs[1], 'route')) return { action: 'show_ip_route', target: 'edgeos', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'version')) return { action: 'show_version', target: 'edgeos', payload: { raw: rawInput, ast } };
    }
    if (isPrefix(action, 'ping')) return { action: 'ping', target: 'edgeos', payload: { raw: rawInput, ast, host: subs[0] } };
    if (isPrefix(action, 'configure') || isPrefix(action, 'conf')) return { action: 'configure', target: 'edgeos', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'commit')) return { action: 'commit', target: 'edgeos', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'set')) return { action: 'set_config', target: 'edgeos', payload: { raw: rawInput, ast, path: subs } };
    if (isPrefix(action, 'delete') || isPrefix(action, 'del')) return { action: 'delete_config', target: 'edgeos', payload: { raw: rawInput, ast, path: subs } };
    return { action: action || 'EXEC_COMMAND', target: 'edgeos', payload: { raw: rawInput, ast } };
  }

  formatResponse(cmdResult: any): string {
    if (!cmdResult) return '';
    if (cmdResult.type === 'show_interfaces') {
      const ports = cmdResult.ports || [];
      const rows = ports.map((p: any) =>
        `${p.name}      Link encap:Ethernet  HWaddr ${p.macAddress || '00:00:00:00:00:00'}\n          inet addr:${p.ipAddress || 'unassigned'}  Bcast:0.0.0.0  Mask:255.255.255.0\n          ${p.status === 'up' ? 'UP BROADCAST RUNNING MULTICAST' : 'DOWN'}  MTU:1500  Metric:1`
      ).join('\n\n');
      return rows || '-- no interfaces --';
    }
    if (cmdResult.type === 'show_version') return 'EdgeOS v2.0.9.5247762.221128.1601\nBuild ID: 5247762\nBuild date: 2024-01-01';
    if (cmdResult.type === 'configure') return '[edit]\nubnt@EdgeRouter#';
    if (cmdResult.type === 'commit') return 'Commit complete.';
    if (cmdResult.type === 'ping') {
      const host = cmdResult.host || '192.168.1.1';
      return `PING ${host} (${host}) 56(84) bytes of data.\n64 bytes from ${host}: icmp_seq=1 ttl=64 time=0.412 ms\n64 bytes from ${host}: icmp_seq=2 ttl=64 time=0.389 ms\n\n--- ${host} ping statistics ---\n2 packets transmitted, 2 received, 0% packet loss`;
    }
    if (cmdResult.type === 'help') {
      return ['Operational commands:',
        '  commit           Commit current set of changes',
        '  compare          Compare configuration versions',
        '  configure        Enter configuration mode',
        '  copy             Copy a file',
        '  delete           Delete a configuration element',
        '  discard          Discard uncommitted changes',
        '  exit             Exit from current level',
        '  load             Load a configuration',
        '  merge            Merge a configuration',
        '  ping             Ping an IP address or hostname',
        '  reboot           Reboot the system',
        '  reset            Reset a service',
        '  run              Run an operational command',
        '  save             Save current configuration',
        '  set              Set a parameter in the current configuration',
        '  show             Show current system information',
        '  telnet           Telnet to a remote host',
        '  traceroute       Trace the route to a destination'
      ].join('\n');
    }
    return String(cmdResult.raw ?? formatExtended(cmdResult) ?? '');
  }
}

export class VyosVendorAdapter extends UbiquitiVendorAdapter {
  vendorId = 'vyos';
  vendorName = 'VyOS';
  promptTemplate = 'vyos@router:~$';
}

// ============================================================
// Fortinet FortiOS Adapter
// ============================================================
export class FortinetVendorAdapter implements IVendorAdapter {
  vendorId = 'fortinet';
  vendorName = 'Fortinet FortiOS';
  promptTemplate = 'FortiGate-60E #';
  private parser = new CLIParser();

  parseSyntax(rawInput: string): NormalizedCommand {
    const ast = this.parser.parse(rawInput);
    const action = ast.command.toLowerCase();
    const subs = ast.subCommands.map(s => s.toLowerCase());
    if (isPrefix(action, 'get')) {
      if (isPrefix(subs[0], 'system') && isPrefix(subs[1], 'status')) return { action: 'get_system_status', target: 'fortios', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'system') && isPrefix(subs[1], 'interface')) return { action: 'get_system_interface', target: 'fortios', payload: { raw: rawInput, ast } };
    }
    if (isPrefix(action, 'show')) {
      if (isPrefix(subs[0], 'firewall') && isPrefix(subs[1], 'policy')) return { action: 'show_firewall_policy', target: 'fortios', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'system') && isPrefix(subs[1], 'status')) return { action: 'get_system_status', target: 'fortios', payload: { raw: rawInput, ast } };
    }
    if (isPrefix(action, 'config') || isPrefix(action, 'con')) return { action: 'config_mode', target: 'fortios', payload: { raw: rawInput, ast, section: subs.join(' ') } };
    if (isPrefix(action, 'execute') || isPrefix(action, 'exe') || isPrefix(action, 'exec')) {
      if (isPrefix(subs[0], 'ping')) return { action: 'ping', target: 'fortios', payload: { raw: rawInput, ast, host: subs[1] } };
    }
    if (isPrefix(action, 'diagnose') || isPrefix(action, 'diag')) return { action: 'diagnose', target: 'fortios', payload: { raw: rawInput, ast, cmd: subs.join(' ') } };
    if (isPrefix(action, 'ping')) return { action: 'ping', target: 'fortios', payload: { raw: rawInput, ast, host: subs[0] } };
    return { action: action || 'EXEC_COMMAND', target: 'fortios', payload: { raw: rawInput, ast } };
  }

  formatResponse(cmdResult: any): string {
    if (!cmdResult) return '';
    if (cmdResult.type === 'get_system_status') {
      const model = cmdResult.model || 'FortiGate-60E';
      const hostname = cmdResult.hostname || 'FortiGate-60E';
      return [`Version: ${model} v7.2.8,build1561,240307`,
        'Virus-DB: 1.00000(2024-03-07 15:48)',
        'IPS-DB: 6.00741(2015-12-01 02:30)',
        'Serial-Number: FGT60ETK17008187',
        'BIOS version: 05000007',
        `Hostname: ${hostname}`,
        'System time: Tue Mar  7 15:48:00 2024',
      ].join('\n');
    }
    if (cmdResult.type === 'get_system_interface') {
      const ports = cmdResult.ports || [];
      return ports.map((p: any) =>
        `== [${p.name}]\n\t\tmode: static\n\t\tip: ${p.ipAddress || '0.0.0.0 0.0.0.0'}\n\t\tstatus: ${p.status}`
      ).join('\n');
    }
    if (cmdResult.type === 'show_firewall_policy') {
      return ['config firewall policy',
        '    edit 1',
        '        set name "LAN_to_WAN"',
        '        set srcintf "internal"',
        '        set dstintf "wan1"',
        '        set srcaddr "all"',
        '        set dstaddr "all"',
        '        set action accept',
        '        set nat enable',
        '    next',
        'end',
      ].join('\n');
    }
    if (cmdResult.type === 'ping') {
      const host = cmdResult.host || '8.8.8.8';
      return `PING ${host} (${host}): 56 data bytes\n64 bytes from ${host}: icmp_seq=1 ttl=116 time=1.415 ms\n\n--- ${host} ping statistics ---\n1 packets transmitted, 1 packets received, 0% packet loss\nround-trip min/avg/max = 1.415/1.415/1.415 ms`;
    }
    if (cmdResult.type === 'help') {
      return ['Global commands:',
        '  config           Modify a configuration object',
        '  delete           Delete a configuration object',
        '  diagnose         Diagnose operations',
        '  edit             Modify a list object',
        '  end              Exit configuration mode',
        '  execute          Execute a command',
        '  get              Get the configuration of an object',
        '  next             Move to the next element in a list',
        '  ping             Send echo messages',
        '  quit             Return to the root',
        '  set              Set configuration values',
        '  show             Show the configuration',
        '  unset            Unset a configuration value',
      ].join('\n');
    }
    return String(cmdResult.raw ?? formatExtended(cmdResult) ?? '');
  }
}

// ============================================================
// Aruba ArubaOS-CX Adapter
// ============================================================
export class ArubaVendorAdapter implements IVendorAdapter {
  vendorId = 'aruba';
  vendorName = 'Aruba ArubaOS-CX';
  promptTemplate = 'Aruba-CX-6300#';
  private parser = new CLIParser();

  parseSyntax(rawInput: string): NormalizedCommand {
    const ast = this.parser.parse(rawInput);
    const action = ast.command.toLowerCase();
    const subs = ast.subCommands.map(s => s.toLowerCase());
    if (isPrefix(action, 'show')) {
      if (isPrefix(subs[0], 'interface') && isPrefix(subs[1], 'brief')) return { action: 'show_int_brief', target: 'cx', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'ip') && isPrefix(subs[1], 'interface')) return { action: 'show_ip_int', target: 'cx', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'running-config') || isPrefix(subs[0], 'run')) return { action: 'show_running', target: 'cx', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'vlan')) return { action: 'show_vlan', target: 'cx', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'version')) return { action: 'show_version', target: 'cx', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'cdp') && isPrefix(subs[1], 'neighbors')) return { action: 'show_cdp_neighbors', target: 'cx', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'lldp') && isPrefix(subs[1], 'neighbors')) return { action: 'show_lldp_neighbors', target: 'cx', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'ip') && isPrefix(subs[1], 'ospf') && isPrefix(subs[2], 'neighbor')) return { action: 'show_ospf_neighbor', target: 'cx', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'tcp') && isPrefix(subs[1], 'brief')) return { action: 'show_tcp_brief', target: 'cx', payload: { raw: rawInput, ast } };
    }
    if (isPrefix(action, 'configure') || isPrefix(action, 'conf')) return { action: 'configure_terminal', target: 'cx', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'ping')) return { action: 'ping', target: 'cx', payload: { raw: rawInput, ast, host: subs[0] } };
    if (isPrefix(action, 'write')) return { action: 'write_mem', target: 'cx', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'ip') && isPrefix(subs[0], 'address')) return { action: 'add_ip', target: 'cx', payload: { raw: rawInput, ast, ip: subs[1], mask: subs[2] } };
    return { action: action || 'EXEC_COMMAND', target: 'cx', payload: { raw: rawInput, ast } };
  }

  formatResponse(cmdResult: any): string {
    if (!cmdResult) return '';
    if (cmdResult.type === 'show_int_brief') {
      const ports = cmdResult.ports || [];
      const header = 'Interface     Admin  Link   Speed  Description\n------------- ------ ------ ------  -----------\n';
      const rows = ports.map((p: any) =>
        `${p.name.padEnd(14)}up     ${p.status === 'up' ? 'up   ' : 'down '}  1000M  `
      ).join('\n');
      return header + rows;
    }
    if (cmdResult.type === 'show_version') {
      return 'ArubaOS-CX 10.13.1000\nArubaOS-CX (build 2024010101)\nCopyright (C) 2024 Hewlett Packard Enterprise Development LP\nModel: 6300M-48G4X\nSerial Number: SG11KKQ001';
    }
    if (cmdResult.type === 'ping') {
      const host = cmdResult.host || '192.168.1.1';
      return `Sending 5, 100-byte ICMP Echos to ${host}\n!!!!!\nSuccess rate is 100 percent (5/5), round-trip min/avg/max = 0/0/1 ms`;
    }
    if (cmdResult.type === 'help') {
      return ['Exec commands:',
        '  boot             Boot system',
        '  clear            Reset functions',
        '  configure        Configure the system',
        '  copy             Copy from one file to another',
        '  delete           Delete a file',
        '  dir              List files on filesystem',
        '  disable          Turn off privileged commands',
        '  enable           Turn on privileged commands',
        '  erase            Erase a file',
        '  exit             Exit from current command mode',
        '  install          Install firmware packages',
        '  no               Negate a command or set its defaults',
        '  ping             Send echo messages',
        '  reboot           Halt and perform a cold restart',
        '  show             Show running system information',
        '  traceroute       Trace route to destination',
        '  write            Write running configuration to memory',
      ].join('\n');
    }
    return String(cmdResult.raw ?? formatExtended(cmdResult) ?? '');
  }
}

// ============================================================
// OpenWrt Adapter
// ============================================================
export class OpenwrtVendorAdapter implements IVendorAdapter {
  vendorId = 'openwrt';
  vendorName = 'OpenWrt';
  promptTemplate = 'root@OpenWrt:~#';
  private parser = new CLIParser();

  parseSyntax(rawInput: string): NormalizedCommand {
    const ast = this.parser.parse(rawInput);
    const action = ast.command.toLowerCase();
    const subs = ast.subCommands.map(s => s.toLowerCase());
    if (isPrefix(action, 'uci') && isPrefix(subs[0], 'show')) return { action: 'uci_show', target: 'openwrt', payload: { raw: rawInput, ast, section: subs[1] } };
    if (isPrefix(action, 'uci') && isPrefix(subs[0], 'commit')) return { action: 'uci_commit', target: 'openwrt', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'ip') && isPrefix(subs[0], 'addr')) return { action: 'ip_addr', target: 'openwrt', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'ip') && isPrefix(subs[0], 'route')) return { action: 'ip_route', target: 'openwrt', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'ifconfig') || isPrefix(action, 'ifc')) return { action: 'ifconfig', target: 'openwrt', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'ping')) return { action: 'ping', target: 'openwrt', payload: { raw: rawInput, ast, host: subs[0] } };
    if (isPrefix(action, 'logread')) return { action: 'logread', target: 'openwrt', payload: { raw: rawInput, ast } };
    if (isPrefix(action.replace(/^\//, ''), 'export')) return { action: 'export', target: 'openwrt', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'cat')) return { action: 'cat_file', target: 'openwrt', payload: { raw: rawInput, ast, path: subs.join(' ') } };
    if (isPrefix(action, 'reboot')) return { action: 'reboot', target: 'openwrt', payload: { raw: rawInput, ast } };
    return { action: action || 'EXEC_COMMAND', target: 'openwrt', payload: { raw: rawInput, ast } };
  }

  formatResponse(cmdResult: any): string {
    if (!cmdResult) return '';
    if (cmdResult.type === 'uci_show') {
      return ["network.loopback=interface",
        "network.loopback.ifname='lo'",
        "network.loopback.proto='static'",
        "network.loopback.ipaddr='127.0.0.1'",
        "network.loopback.netmask='255.0.0.0'",
        "network.lan=interface",
        "network.lan.type='bridge'",
        "network.lan.ifname='eth0.1'",
        "network.lan.proto='static'",
        "network.lan.ipaddr='192.168.1.1'",
        "network.lan.netmask='255.255.255.0'",
        "network.wan=interface",
        "network.wan.ifname='eth0.2'",
        "network.wan.proto='dhcp'",
      ].join('\n');
    }
    if (cmdResult.type === 'ip_addr') {
      const ports = cmdResult.ports || [];
      if (ports.length === 0) {
        return '1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN\n    inet 127.0.0.1/8 scope host lo\n2: br-lan: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UP\n    inet 192.168.1.1/24 brd 192.168.1.255 scope global br-lan';
      }
      return ports.map((p: any, i: number) => {
        const ip = p.ipAddress ? p.ipAddress.split('/')[0] : undefined;
        const prefix = p.ipAddress ? (p.ipAddress.split('/')[1] || '24') : undefined;
        const up = p.status === 'up' && !(cmdResult.shutdownIfaces || []).includes(p.name);
        return [
          `${i + 2}: ${p.name}: <BROADCAST,MULTICAST,${up ? 'UP,LOWER_UP' : 'DOWN'}> mtu 1500 qdisc noqueue state ${up ? 'UP' : 'DOWN'}`,
          `    link/ether ${p.macAddress || '00:00:00:00:00:00'} brd ff:ff:ff:ff:ff:ff`,
          ...(ip ? [`    inet ${ip}/${prefix} brd ${ip.replace(/\.\d+$/, '.255')} scope global ${p.name}`] : []),
        ].join('\n');
      }).join('\n\n');
    }
    if (cmdResult.type === 'ip_route') {
      const routes = cmdResult.routes || [];
      if (routes.length === 0) return 'default via 192.168.1.1 dev br-lan';
      return routes.map((r: any) => {
        const dst = r.dst === '0.0.0.0/0' || r.dst === 'default' ? 'default' : r.dst;
        return `${dst}${r.gateway ? ` via ${r.gateway}` : ''} dev ${r.iface || 'br-lan'}`;
      }).join('\n');
    }
    if (cmdResult.type === 'ifconfig') {
      const ports = cmdResult.ports || [];
      return ports.map((p: any) =>
        `${p.name}: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500\n        inet ${p.ipAddress ? p.ipAddress.split('/')[0] : '0.0.0.0'}  netmask 255.255.255.0  broadcast 192.168.1.255\n        ether ${p.macAddress || '00:00:00:00:00:00'}  txqueuelen 1000  (Ethernet)`
      ).join('\n\n');
    }
    if (cmdResult.type === 'logread') {
      return `Mar  7 00:00:01 OpenWrt kernel: [    0.000000] Linux version 5.15.137\nMar  7 00:00:02 OpenWrt netifd: lo: set_interface_up\nMar  7 00:00:03 OpenWrt netifd: br-lan: set_interface_up`;
    }
    if (cmdResult.type === 'ping') {
      const host = cmdResult.host || '8.8.8.8';
      return `PING ${host} (${host}): 56 data bytes\n64 bytes from ${host}: seq=0 ttl=116 time=2.412 ms\n64 bytes from ${host}: seq=1 ttl=116 time=1.891 ms\n\n--- ${host} ping statistics ---\n2 packets transmitted, 2 packets received, 0% packet loss`;
    }
    if (cmdResult.type === 'help') {
      return ['BusyBox shell commands:',
        '  cat              Concatenate files and print to stdout',
        '  cat /etc/config/network   Show network configuration',
        '  ifconfig         Configure network interfaces',
        '  ip addr          Show IP addresses',
        '  ip route         Show routing table',
        '  logread          Read kernel log',
        '  ping             Send echo messages',
        '  ps               Report process status',
        '  reboot           Reboot the system',
        '  uci show         Show UCI configuration',
        '  uci set          Set a UCI option',
        '  uci commit       Apply UCI changes',
        '  uci get          Get a UCI option value',
        '  /etc/init.d/<svc> restart  Restart a service',
      ].join('\n');
    }
    return String(cmdResult.raw ?? formatExtended(cmdResult) ?? '');
  }
}

// ============================================================
// Linux Debian Server Adapter
// ============================================================
export class LinuxDebianVendorAdapter implements IVendorAdapter {
  vendorId = 'linux';
  vendorName = 'Debian GNU/Linux';
  promptTemplate = 'root@server:~#';
  private parser = new CLIParser();

  parseSyntax(rawInput: string): NormalizedCommand {
    const ast = this.parser.parse(rawInput);
    const action = ast.command.toLowerCase();
    const subs = ast.subCommands.map(s => s.toLowerCase());

    if (isPrefix(action, 'ip')) {
      if (isPrefix(subs[0], 'addr') || isPrefix(subs[0], 'address')) return { action: 'ip_addr', target: 'linux', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'route')) return { action: 'ip_route', target: 'linux', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'link')) return { action: 'ip_link', target: 'linux', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'neigh')) return { action: 'ip_neigh', target: 'linux', payload: { raw: rawInput, ast } };
    }
    if (isPrefix(action, 'ifconfig')) return { action: 'ifconfig', target: 'linux', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'ping')) return { action: 'ping', target: 'linux', payload: { raw: rawInput, ast, host: subs[0] } };
    if (isPrefix(action, 'traceroute') || isPrefix(action, 'tracert')) return { action: 'traceroute', target: 'linux', payload: { raw: rawInput, ast, host: subs[0] } };
    if (isPrefix(action, 'ss')) return { action: 'ss', target: 'linux', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'netstat')) return { action: 'netstat', target: 'linux', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'nslookup') || isPrefix(action, 'dig')) return { action: 'nslookup', target: 'linux', payload: { raw: rawInput, ast, host: subs[0] } };
    if (isPrefix(action, 'curl') || isPrefix(action, 'wget')) return { action: 'http_get', target: 'linux', payload: { raw: rawInput, ast, url: subs[0] } };
    if (isPrefix(action, 'systemctl')) return { action: 'systemctl', target: 'linux', payload: { raw: rawInput, ast, cmd: subs.join(' ') } };
    if (isPrefix(action, 'apt') || isPrefix(action, 'apt-get')) return { action: 'apt', target: 'linux', payload: { raw: rawInput, ast, cmd: subs.join(' ') } };
    if (isPrefix(action, 'cat')) return { action: 'cat_file', target: 'linux', payload: { raw: rawInput, ast, path: subs.join(' ') } };
    if (isPrefix(action, 'hostname')) return { action: 'hostname', target: 'linux', payload: { raw: rawInput, ast } };
    if (isPrefix(action.replace(/^\//, ''), 'export')) return { action: 'export', target: 'linux', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'uname')) return { action: 'uname', target: 'linux', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'uptime')) return { action: 'uptime', target: 'linux', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'df')) return { action: 'df', target: 'linux', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'free')) return { action: 'free_mem', target: 'linux', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'ps')) return { action: 'ps', target: 'linux', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'top') || isPrefix(action, 'htop')) return { action: 'top', target: 'linux', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'reboot') || isPrefix(action, 'shutdown')) return { action: 'reboot', target: 'linux', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'whoami')) return { action: 'whoami', target: 'linux', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'ls')) return { action: 'ls', target: 'linux', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'pwd')) return { action: 'pwd', target: 'linux', payload: { raw: rawInput, ast } };
    return { action: action || 'EXEC_COMMAND', target: 'linux', payload: { raw: rawInput, ast } };
  }

  formatResponse(cmdResult: any): string {
    if (!cmdResult) return '';
    const ports = cmdResult.ports || [];

    if (cmdResult.type === 'ip_addr') {
      const rows = ports.map((p: any, i: number) => {
        const ip = p.ipAddress ? p.ipAddress.split('/')[0] : undefined;
        const prefix = p.ipAddress ? (p.ipAddress.split('/')[1] || '24') : undefined;
        return [
          `${i + 1}: ${p.name}: <BROADCAST,MULTICAST,${p.status === 'up' ? 'UP,LOWER_UP' : 'DOWN'}> mtu 1500 qdisc mq state ${p.status.toUpperCase()} group default qlen 1000`,
          `    link/ether ${p.macAddress || '00:00:00:00:00:00'} brd ff:ff:ff:ff:ff:ff`,
          ...(ip ? [
            `    inet ${ip}/${prefix} brd ${ip.replace(/\.\d+$/, '.255')} scope global ${p.name}`,
            `       valid_lft forever preferred_lft forever`,
          ] : []),
        ].join('\n');
      });
      return rows.join('\n') || '-- no interfaces --';
    }
    if (cmdResult.type === 'ifconfig' || cmdResult.type === 'show_ip_int_brief') {
      const rows = ports.map((p: any) => {
        const ip = p.ipAddress ? p.ipAddress.split('/')[0] : '0.0.0.0';
        return [
          `${p.name}: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500`,
          `        inet ${ip}  netmask 255.255.255.0  broadcast ${ip.replace(/\.\d+$/, '.255')}`,
          `        ether ${p.macAddress || '00:00:00:00:00:00'}  txqueuelen 1000  (Ethernet)`,
          `        RX packets 42312  bytes 38924521 (37.1 MiB)`,
          `        TX packets 35891  bytes 21042311 (20.0 MiB)`,
        ].join('\n');
      });
      return rows.join('\n\n') || '-- no interfaces --';
    }
    if (cmdResult.type === 'ip_link') {
      const rows = ports.map((p: any, i: number) =>
        `${i + 1}: ${p.name}: <BROADCAST,MULTICAST,${p.status === 'up' ? 'UP,LOWER_UP' : 'DOWN'}> mtu 1500 qdisc mq state ${p.status.toUpperCase()} mode DEFAULT group default qlen 1000\n    link/ether ${p.macAddress || '00:00:00:00:00:00'} brd ff:ff:ff:ff:ff:ff`
      );
      return rows.join('\n') || '';
    }
    if (cmdResult.type === 'ip_neigh') {
      const entries = cmdResult.entries || [];
      if (entries.length === 0) return 'arp cache empty — kirim ping dulu untuk belajar MAC';
      return entries.map((e: any) => `${e.ip} dev eth0 lladdr ${e.mac} REACHABLE`).join('\n');
    }
    if (cmdResult.type === 'ip_route' || cmdResult.type === 'show_ip_route') {
      return 'default via 192.168.1.1 dev eth0 proto static metric 100\n192.168.1.0/24 dev eth0 proto kernel scope link src 192.168.1.10';
    }
    if (cmdResult.type === 'tcp_print') {
      const conns = cmdResult.connections || [];
      const header = 'Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name\n';
      if (conns.length === 0) return header + '(no active connections)';
      const rows = conns.map((c: any) =>
        `tcp        0      0 ${(c.localIp + ':' + c.localPort).padEnd(20)} ${(c.remoteIp + ':' + c.remotePort).padEnd(22)} ${c.state}      1234/app`
      );
      return header + rows.join('\n');
    }
    if (cmdResult.type === 'ss') {
      const conns = cmdResult.connections || [];
      const header = 'Netid  State   Recv-Q  Send-Q   Local Address:Port      Peer Address:Port  Process';
      if (conns.length === 0) return header + '\n(no active connections)';
      const rows = conns.map((c: any) =>
        `tcp    ${c.state === 'LISTEN' ? 'LISTEN' : 'ESTAB'} 0       0        ${(c.localIp + ':' + c.localPort).padEnd(21)} ${(c.remoteIp + ':' + c.remotePort).padEnd(20)}  users:(("app",pid=1234,fd=3))`
      );
      return header + '\n' + rows.join('\n');
    }
    if (cmdResult.type === 'netstat') {
      const conns = cmdResult.connections || [];
      const header = 'Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name';
      if (conns.length === 0) return header + '\n(no active connections)';
      const rows = conns.map((c: any) =>
        `tcp        0      0 ${(c.localIp + ':' + c.localPort).padEnd(20)} ${(c.remoteIp + ':' + c.remotePort).padEnd(22)} ${c.state}      1234/app`
      );
      return header + '\n' + rows.join('\n');
    }
    if (cmdResult.type === 'traceroute') {
      const host = cmdResult.host || '8.8.8.8';
      return [
        `traceroute to ${host} (${host}), 30 hops max, 60 byte packets`,
        ` 1  192.168.1.1 (192.168.1.1)  0.312 ms  0.289 ms  0.301 ms`,
        ` 2  10.0.0.1 (10.0.0.1)  1.412 ms  1.389 ms  1.401 ms`,
        ` 3  ${host} (${host})  2.001 ms  1.998 ms  2.012 ms`,
      ].join('\n');
    }
    if (cmdResult.type === 'nslookup') {
      if (cmdResult.timedOut || !cmdResult.resolved) {
        return cmdResult.nxdomain
          ? `;; server can't find ${cmdResult.host}: NXDOMAIN`
          : ';; connection timed out; no servers could be reached';
      }
      const host = cmdResult.host || 'google.com';
      return `Server:\t\t${cmdResult.server || '8.8.8.8'}\nAddress:\t${cmdResult.server || '8.8.8.8'}#53\n\nNon-authoritative answer:\nName:\t${host}\nAddress: ${cmdResult.resolved}`;
    }
    if (cmdResult.type === 'http_get') {
      return 'HTTP/1.1 200 OK\nContent-Type: text/html; charset=utf-8\nServer: nginx/1.22.1\n\n<!DOCTYPE html><html><head><title>OK</title></head><body>Connection OK</body></html>';
    }
    if (cmdResult.type === 'systemctl') {
      return `\u25CF nginx.service - A high performance web server\n   Loaded: loaded (/lib/systemd/system/nginx.service; enabled; vendor preset: enabled)\n   Active: active (running) since Tue 2024-03-07 10:00:00 UTC; 14 days ago\n Main PID: 890 (nginx)\n   Memory: 4.0M\n   CGroup: /system.slice/nginx.service\n           \u251C\u2500890 nginx: master process /usr/sbin/nginx\n           \u2514\u2500891 nginx: worker process`;
    }
    if (cmdResult.type === 'apt') {
      return 'Reading package lists... Done\nBuilding dependency tree... Done\nReading state information... Done\nAll packages are up to date.';
    }
    if (cmdResult.type === 'ping') {
      const host = cmdResult.host || '8.8.8.8';
      return [
        `PING ${host} (${host}) 56(84) bytes of data.`,
        `64 bytes from ${host}: icmp_seq=1 ttl=64 time=0.412 ms`,
        `64 bytes from ${host}: icmp_seq=2 ttl=64 time=0.389 ms`,
        `64 bytes from ${host}: icmp_seq=3 ttl=64 time=0.401 ms`,
        ``,
        `--- ${host} ping statistics ---`,
        `3 packets transmitted, 3 received, 0% packet loss, time 2003ms`,
        `rtt min/avg/max/mdev = 0.389/0.400/0.412/0.010 ms`,
      ].join('\n');
    }
    if (cmdResult.type === 'hostname') return 'debian-server';
    if (cmdResult.type === 'uname') return 'Linux debian-server 6.1.0-21-amd64 #1 SMP PREEMPT_DYNAMIC Debian 6.1.90-1 (2024-05-03) x86_64 GNU/Linux';
    if (cmdResult.type === 'uptime') return ' 23:30:01 up 14 days,  5:22,  1 user,  load average: 0.12, 0.08, 0.05';
    if (cmdResult.type === 'df') {
      return [
        'Filesystem      Size  Used Avail Use% Mounted on',
        '/dev/sda1        50G  8.2G   39G  18% /',
        'tmpfs           2.0G     0  2.0G   0% /dev/shm',
        '/dev/sdb1       500G  210G  265G  44% /data',
      ].join('\n');
    }
    if (cmdResult.type === 'free_mem') {
      return [
        '              total        used        free      shared  buff/cache   available',
        'Mem:        8192000     2134528     4521984      184320     1535488     5692416',
        'Swap:       2097152           0     2097152',
      ].join('\n');
    }
    if (cmdResult.type === 'ps') {
      return [
        '  PID TTY          TIME CMD',
        '    1 ?        00:00:02 systemd',
        '  890 ?        00:00:00 nginx',
        ' 1234 ?        00:00:00 sshd',
        ' 5678 pts/0    00:00:00 bash',
        ' 5679 pts/0    00:00:00 ps',
      ].join('\n');
    }
    if (cmdResult.type === 'top') {
      return [
        'top - 23:30:01 up 14 days,  5:22,  1 user,  load average: 0.12, 0.08, 0.05',
        'Tasks:  98 total,   1 running,  97 sleeping,   0 stopped,   0 zombie',
        '%Cpu(s):  1.2 us,  0.5 sy,  0.0 ni, 97.8 id,  0.3 wa,  0.0 hi,  0.2 si',
        'MiB Mem :   8000.0 total,   4416.0 free,   2084.5 used,   1499.5 buff/cache',
        '',
        '  PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND',
        '    1 root      20   0  167952  13488   8124 S   0.0   0.2   0:02.41 systemd',
        '  890 www-data  20   0  201028  12032   9216 S   0.3   0.2   0:00.45 nginx',
        ' 1234 root      20   0  143844  10240   7680 S   0.0   0.1   0:00.12 sshd',
      ].join('\n');
    }
    if (cmdResult.type === 'reboot') return 'Broadcast message from root@debian-server:\nThe system will reboot now!';
    if (cmdResult.type === 'whoami') return 'root';
    if (cmdResult.type === 'pwd') return '/root';
    if (cmdResult.type === 'ls') return 'bin  boot  dev  etc  home  lib  lib64  media  mnt  opt  proc  root  run  sbin  srv  sys  tmp  usr  var';
    if (cmdResult.type === 'cat_file') {
      const path = String(cmdResult.path || '').trim();
      if (path.includes('/etc/hostname')) return 'debian-server';
      if (path.includes('/etc/resolv.conf')) return 'nameserver 8.8.8.8\nnameserver 1.1.1.1\nsearch localdomain';
      if (path.includes('/etc/hosts')) return '127.0.0.1\tlocalhost\n127.0.1.1\tdebian-server\n::1\t\tlocalhost ip6-localhost ip6-loopback';
      if (path.includes('/etc/network/interfaces')) return '# /etc/network/interfaces\nauto lo\niface lo inet loopback\n\nauto eth0\niface eth0 inet static\n\taddress 192.168.1.10\n\tnetmask 255.255.255.0\n\tgateway 192.168.1.1\n\tdns-nameservers 8.8.8.8 1.1.1.1';
      if (path.includes('/etc/debian_version')) return 'bookworm/sid';
      return `cat: ${path}: No such file or directory`;
    }
    if (cmdResult.type === 'help') {
      return [
        'Debian GNU/Linux common commands:',
        '  ip addr              Show IP address information',
        '  ip route             Show routing table',
        '  ip link              Show network interface state',
        '  ip neigh             Show ARP/neighbor cache',
        '  ifconfig             Show interfaces (legacy)',
        '  ping <host>          Send ICMP echo request',
        '  traceroute <host>    Trace route to destination',
        '  ss -tulnp            Show listening ports',
        '  netstat -tulnp       Show listening ports (legacy)',
        '  nslookup <host>      DNS lookup',
        '  dig <host>           DNS lookup (detailed)',
        '  curl <url>           Transfer data from/to URL',
        '  wget <url>           Download files',
        '  systemctl status     Show systemd services',
        '  apt update           Update package lists',
        '  apt install <pkg>    Install a package',
        '  cat /etc/hostname    Show hostname',
        '  cat /etc/network/interfaces  Show network config',
        '  cat /etc/resolv.conf Show DNS config',
        '  uname -a             Show kernel info',
        '  uptime               Show system uptime',
        '  df -h                Show disk usage',
        '  free -h              Show memory usage',
        '  ps aux               Show running processes',
        '  top                  Interactive process viewer',
      ].join('\n');
    }
    return String(cmdResult.raw || formatExtended(cmdResult) || '');
  }
}

// ============================================================
// Vendor Dispatcher — central routing + in-memory state
// ============================================================
export class VendorDispatcher {
  private adapters: Map<string, IVendorAdapter> = new Map();
  private nodeMemory: Map<string, any> = new Map();

  constructor() {
    this.register(new MikroTikVendorAdapter());
    this.register(new CiscoVendorAdapter());
    this.register(new CiscoNxosVendorAdapter());
    this.register(new JuniperVendorAdapter());
    this.register(new HuaweiVendorAdapter());
    this.register(new UbiquitiVendorAdapter());
    this.register(new VyosVendorAdapter());
    this.register(new FortinetVendorAdapter());
    this.register(new ArubaVendorAdapter());
    this.register(new OpenwrtVendorAdapter());
    this.register(new LinuxDebianVendorAdapter());
  }

  register(adapter: IVendorAdapter) {
    this.adapters.set(adapter.vendorId, adapter);
  }

  getAdapter(vendorId: string): IVendorAdapter | undefined {
    return this.adapters.get(vendorId);
  }

  /** Public accessor for per-node in-memory config (IPs, routes, BGP, services). */
  getNodeMemory(nodeId: string): any {
    if (!this.nodeMemory.has(nodeId)) {
      this.nodeMemory.set(nodeId, this.blankNodeMemory());
    }
    return this.nodeMemory.get(nodeId);
  }

  /** Snapshot per-node yang disimpan "startup-config" (write memory / save). */
  private startupConfigs = new Map<string, any>();

  /** State mentah default sebuah node (running-config kosong). */
  private blankNodeMemory(): any {
    return {
      configuredIps: {},
      routes: [],
      bgp: { asn: '', routerId: '', peers: [] },
      snmp: { enabled: false, community: 'public', communityRW: 'private', sysContact: '', sysLocation: '' },
      hostname: '',
      modelLabel: '',
      vlans: [],
      dnsServers: [],
      dnsRecords: [],
      webServer: { enabled: true, port: 80, content: '' },
      dhcpPools: [],
      dhcpClients: [],
      natRules: [],
      acls: [],
      portVlans: {},
      routing: {
        ospf: { enabled: false, networks: [], interfaceCosts: {}, passiveInterfaces: [] },
        rip: { enabled: false, networks: [] },
        eigrp: { enabled: false, asn: 0, networks: [] },
      },
      shutdownIfaces: [],
      subinterfaces: [],
      trunkPorts: [],
      queues: [],
      mangleRules: [],
      wireless: {},
      wirelessSecurityProfiles: {},
      stp: { enabled: true, priority: 32768, mode: 'rstp' },
      currentSsid: '',
      currentStaticDst: '',
      currentDhcpPool: '',
      currentProto: '',
      natInsideIfaces: [],
      natOutsideIfaces: [],
      natAcls: {},
      currentDhcpSection: '',
      currentDhcpRange: false,
      bgpGroups: {},
      // — IPv6 & FHRP (VRRP) —
      configuredIps6: {},
      routes6: [],
      fhrpGroups: [],
      // — DHCP relay (ip helper-address) & port-security & DHCPv6/SLAAC —
      dhcpRelays: {},
      portSecurity: {},
      ipv6DhcpClients: [],
      // — state internal per-vendor (Fortinet, Juniper, VyOS, Huawei, OpenWrt, Linux) —
      fortiPath: [] as string[],
      fortiInRange: false,
      fortiDhcpIdx: 0,
      fortiRangeIdx: 0,
      fortiPendingVlan: 0,
      fortiAddresses: {} as Record<string, string>,
      fortiDraft: {} as Record<string, any>,
      fortiBgpPeer: '',
      fortiDhcpClient: '',
      currentAclId: '',
      natSrcDraft: {} as Record<string, any>,
      natDstDraft: {} as Record<string, any>,
      juniperSrcNat: {} as Record<string, any>,
      juniperDstPool: {} as Record<string, any>,
      uciPending: {} as Record<string, string>,
      uciRedirects: {} as Record<string, Record<string, string>>,
      juniperFilters: {} as Record<string, any>,
      fortiAddrName: '',
      // Snapshot konfigurasi ter-commit (Junos commit/rollback) — null jika
      // belum pernah commit. Restore memakai deep-copy penuh seperti
      // saveStartupConfig, sehingga rollback benar-benar memulihkan state.
      juniperCommitted: null as any,
    };
  }

  /** Snapshot running-config node menjadi startup-config (write memory / save). */
  private saveStartupConfig(nodeId: string): void {
    const mem = this.nodeMemory.get(nodeId);
    if (mem) this.startupConfigs.set(nodeId, JSON.parse(JSON.stringify(mem)));
  }

  /** Restore node dari startup-config (reload) — tanpa snapshot → default bersih. */
  private reloadFromStartupConfig(nodeId: string): boolean {
    const saved = this.startupConfigs.get(nodeId);
    if (saved) this.nodeMemory.set(nodeId, JSON.parse(JSON.stringify(saved)));
    else this.nodeMemory.set(nodeId, this.blankNodeMemory());
    return !!saved;
  }

  /** Snapshot konfigurasi Junos (tanpa field snapshot itu sendiri). */
  private juniperSnapshot(mem: any): any {
    const copy = JSON.parse(JSON.stringify(mem));
    delete copy.juniperCommitted;
    return copy;
  }

  /** Restore konfigurasi Junos dari snapshot commit terakhir. */
  private restoreJuniper(mem: any, snap: any): void {
    const restored = JSON.parse(JSON.stringify(snap));
    delete restored.juniperCommitted;
    Object.assign(mem, restored);
  }

  /** Set the hardware model label for a node (used in show version output). */
  setNodeModelLabel(nodeId: string, label: string): void {
    const mem = this.getNodeMemory(nodeId);
    mem.modelLabel = label;
  }

  /** Snapshot of all node configs — used to persist CLI state across refreshes. */
  serializeMemory(): Record<string, any> {
    const out: Record<string, any> = {};
    this.nodeMemory.forEach((mem, nodeId) => {
      out[nodeId] = JSON.parse(JSON.stringify(mem));
    });
    return out;
  }

  /** Restore previously saved node configs (merges into existing memory). */
  restoreMemory(data: Record<string, any> | null | undefined): void {
    if (!data) return;
    for (const [nodeId, mem] of Object.entries(data)) {
      if (!mem || typeof mem !== 'object') continue;
      const target = this.getNodeMemory(nodeId);
      target.configuredIps = { ...target.configuredIps, ...(mem.configuredIps || {}) };
      target.routes = [...(mem.routes || [])];
      target.bgp = { asn: '', routerId: '', peers: [], ...(mem.bgp || {}) };
      target.snmp = { enabled: false, community: 'public', communityRW: 'private', sysContact: '', sysLocation: '', ...(mem.snmp || {}) };
      if (typeof mem.hostname === 'string') target.hostname = mem.hostname;
      if (typeof mem.modelLabel === 'string') target.modelLabel = mem.modelLabel;
      if (Array.isArray(mem.vlans)) target.vlans = mem.vlans;
      if (Array.isArray(mem.dnsServers)) target.dnsServers = mem.dnsServers;
      if (Array.isArray(mem.dnsRecords)) target.dnsRecords = mem.dnsRecords;
      if (mem.webServer && typeof mem.webServer === 'object') target.webServer = { ...target.webServer, ...mem.webServer };
      if (Array.isArray(mem.dhcpPools)) target.dhcpPools = mem.dhcpPools;
      if (Array.isArray(mem.dhcpClients)) target.dhcpClients = mem.dhcpClients;
      if (Array.isArray(mem.natRules)) target.natRules = mem.natRules;
      if (Array.isArray(mem.acls)) target.acls = mem.acls;
      if (mem.portVlans && typeof mem.portVlans === 'object') target.portVlans = { ...target.portVlans, ...mem.portVlans };
      if (mem.routing && typeof mem.routing === 'object') {
        target.routing = {
          ospf: { enabled: false, networks: [], interfaceCosts: {}, passiveInterfaces: [], ...(mem.routing.ospf || {}) },
          rip: { enabled: false, networks: [], ...(mem.routing.rip || {}) },
          eigrp: { enabled: false, asn: 0, networks: [], ...(mem.routing.eigrp || {}) },
        };
      }
      if (typeof mem.currentStaticDst === 'string') target.currentStaticDst = mem.currentStaticDst;
      if (typeof mem.currentDhcpPool === 'string') target.currentDhcpPool = mem.currentDhcpPool;
      if (typeof mem.currentIface === 'string') target.currentIface = mem.currentIface;
      if (typeof mem.currentProto === 'string') target.currentProto = mem.currentProto;
      if (Array.isArray(mem.shutdownIfaces)) target.shutdownIfaces = mem.shutdownIfaces;
      if (Array.isArray(mem.subinterfaces)) target.subinterfaces = mem.subinterfaces;
      if (Array.isArray(mem.trunkPorts)) target.trunkPorts = mem.trunkPorts;
      if (Array.isArray(mem.queues)) target.queues = mem.queues;
      if (Array.isArray(mem.mangleRules)) target.mangleRules = mem.mangleRules;
      if (mem.wireless && typeof mem.wireless === 'object') target.wireless = { ...target.wireless, ...mem.wireless };
      if (mem.wirelessSecurityProfiles && typeof mem.wirelessSecurityProfiles === 'object') target.wirelessSecurityProfiles = { ...mem.wirelessSecurityProfiles };
      if (typeof mem.currentSsid === 'string') target.currentSsid = mem.currentSsid;
      if (mem.stp && typeof mem.stp === 'object') target.stp = { enabled: true, priority: 32768, mode: 'rstp', ...mem.stp };
      if (mem.configuredIps6 && typeof mem.configuredIps6 === 'object') target.configuredIps6 = { ...target.configuredIps6, ...mem.configuredIps6 };
      if (Array.isArray(mem.routes6)) target.routes6 = mem.routes6;
      if (Array.isArray(mem.fhrpGroups)) target.fhrpGroups = mem.fhrpGroups;
      if (mem.dhcpRelays && typeof mem.dhcpRelays === 'object') target.dhcpRelays = { ...target.dhcpRelays, ...mem.dhcpRelays };
      if (mem.portSecurity && typeof mem.portSecurity === 'object') target.portSecurity = { ...mem.portSecurity };
      if (Array.isArray(mem.ipv6DhcpClients)) target.ipv6DhcpClients = mem.ipv6DhcpClients;
      if (Array.isArray(mem.natInsideIfaces)) target.natInsideIfaces = mem.natInsideIfaces;
      if (Array.isArray(mem.natOutsideIfaces)) target.natOutsideIfaces = mem.natOutsideIfaces;
      if (mem.natAcls && typeof mem.natAcls === 'object') target.natAcls = { ...target.natAcls, ...mem.natAcls };
      if (typeof mem.currentDhcpSection === 'string') target.currentDhcpSection = mem.currentDhcpSection;
      if (typeof mem.currentDhcpRange === 'boolean') target.currentDhcpRange = mem.currentDhcpRange;
      if (mem.bgpGroups && typeof mem.bgpGroups === 'object') target.bgpGroups = { ...target.bgpGroups, ...mem.bgpGroups };
      if (Array.isArray(mem.fortiPath)) target.fortiPath = mem.fortiPath;
      if (typeof mem.fortiInRange === 'boolean') target.fortiInRange = mem.fortiInRange;
      if (typeof mem.fortiDhcpIdx === 'number') target.fortiDhcpIdx = mem.fortiDhcpIdx;
      if (typeof mem.fortiRangeIdx === 'number') target.fortiRangeIdx = mem.fortiRangeIdx;
      if (typeof mem.fortiPendingVlan === 'number') target.fortiPendingVlan = mem.fortiPendingVlan;
      if (mem.fortiAddresses && typeof mem.fortiAddresses === 'object') target.fortiAddresses = { ...mem.fortiAddresses };
      if (mem.fortiDraft && typeof mem.fortiDraft === 'object') target.fortiDraft = { ...mem.fortiDraft };
      if (typeof mem.fortiBgpPeer === 'string') target.fortiBgpPeer = mem.fortiBgpPeer;
      if (typeof mem.fortiDhcpClient === 'string') target.fortiDhcpClient = mem.fortiDhcpClient;
      if (typeof mem.currentAclId === 'string') target.currentAclId = mem.currentAclId;
      if (mem.natSrcDraft && typeof mem.natSrcDraft === 'object') target.natSrcDraft = { ...mem.natSrcDraft };
      if (mem.natDstDraft && typeof mem.natDstDraft === 'object') target.natDstDraft = { ...mem.natDstDraft };
      if (mem.juniperSrcNat && typeof mem.juniperSrcNat === 'object') target.juniperSrcNat = { ...mem.juniperSrcNat };
      if (mem.juniperDstPool && typeof mem.juniperDstPool === 'object') target.juniperDstPool = { ...mem.juniperDstPool };
      if (mem.uciPending && typeof mem.uciPending === 'object') target.uciPending = { ...mem.uciPending };
      if (mem.uciRedirects && typeof mem.uciRedirects === 'object') target.uciRedirects = { ...mem.uciRedirects };
      if (mem.juniperFilters && typeof mem.juniperFilters === 'object') target.juniperFilters = { ...mem.juniperFilters };
      if (typeof mem.fortiAddrName === 'string') target.fortiAddrName = mem.fortiAddrName;
      // Snapshot Junos commit — wajib dipulihkan agar "rollback" berfungsi setelah reload.
      if (mem.juniperCommitted && typeof mem.juniperCommitted === 'object') {
        target.juniperCommitted = JSON.parse(JSON.stringify(mem.juniperCommitted));
      }
    }
  }

  /** Remove persisted config for a node id (called when a device is deleted). */
  forgetNodeMemory(nodeId: string): void {
    this.nodeMemory.delete(nodeId);
  }

  /**
   * Configuration deletion dispatcher — turns "no …", "/ip … remove", "delete …",
   * "undo …", "rollback" and "uci delete …" into real state mutations instead of
   * printing a fake "Success".
   *
   * Returns a cmdResult when the command was handled, or undefined to let the
   * generic dispatch chain continue.
   */
  private handleDeletion(rawInput: string, normalized: any, vendorId: string, mem: any, context: any): any {
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
        mem.dhcpClients = (mem.dhcpClients || []).filter((c: any) => c.iface !== mem.currentIface);
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
        mem.dhcpClients = (mem.dhcpClients || []).filter((c: any) => c.iface !== mem.currentIface);
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
        mem.routes = mem.routes.filter((r: any) => {
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
        mem.vlans = mem.vlans.filter((v: any) => String(v.id) !== String(id));
        for (const [iface, v] of Object.entries(mem.portVlans || {})) {
          if (String(v) === String(id)) delete mem.portVlans[iface];
        }
        mem.subinterfaces = (mem.subinterfaces || []).filter((s: any) => String(s.vlanId) !== String(id));
        if (mem.vlans.length === before) return err(`% VLAN ${id} does not exist`);
        return { raw: '' };
      }
      // no ip dhcp pool <name>
      const poolMatch = input.match(/^no\s+ip\s+dhcp\s+pool\s+(\S+)\s*$/i);
      if (poolMatch) {
        const before = mem.dhcpPools.length;
        mem.dhcpPools = mem.dhcpPools.filter((p: any) => p.name !== poolMatch[1]);
        if (mem.dhcpPools.length === before) return err(`% DHCP pool ${poolMatch[1]} does not exist`);
        if (mem.currentDhcpPool === poolMatch[1]) mem.currentDhcpPool = '';
        return { raw: '' };
      }
      // no ip host <name>
      const hostMatch = input.match(/^no\s+ip\s+host\s+(\S+)\s*$/i);
      if (hostMatch) {
        const before = mem.dnsRecords.length;
        mem.dnsRecords = mem.dnsRecords.filter((d: any) => d.name !== hostMatch[1].toLowerCase());
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
        mem.acls = mem.acls.filter((r: any) => r.aclId !== id);
        const hadNat = mem.natAcls?.[String(id)] !== undefined;
        if (mem.natAcls) delete mem.natAcls[String(id)];
        if (beforeAcl === mem.acls.length && !hadNat) return err(`% Access-list ${id} does not exist`);
        return { raw: '' };
      }
      // no ip nat inside source static tcp <in-ip> <in-port> <pub-ip> <pub-port>
      const natMatch = input.match(/^no\s+ip\s+nat\s+inside\s+source\s+static\s+tcp\s+(\S+)\s+(\d+)\s+(\S+)\s+(\d+)\s*$/i);
      if (natMatch) {
        const before = mem.natRules.length;
        mem.natRules = mem.natRules.filter((r: any) =>
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
      const idx = (arr: any[], n: number) => (n < 0 || n >= arr.length ? undefined : arr[n]);

      const fail = (msg: string) => err(`% ${msg}`);

      // /ip address remove [find address=…] / [find interface=…] / numbers=N
      if (/^\/ip\s+address\s+remove\b/i.test(input)) {
        // Urutan tampilan "/ip address print" mengikuti urutan port (mergeIps),
        // jadi index numbers= harus merujuk urutan port — bukan insertion order.
        const portOrder: string[] = [];
        for (const p of context?.ports || []) if (mem.configuredIps[p.name]) portOrder.push(p.name);
        for (const k of Object.keys(mem.configuredIps)) if (!portOrder.includes(k)) portOrder.push(k);
        const keys = portOrder;
        let removed = false;
        if (nums.length > 0) {
          const k = idx(keys, nums[0]);
          if (k === undefined) return fail('no such item');
          delete mem.configuredIps[k];
          mem.dhcpClients = (mem.dhcpClients || []).filter((c: any) => c.iface !== k);
          removed = true;
        } else if (findAddr) {
          for (const k of keys) {
            if (toCidr(mem.configuredIps[k]) === toCidr(findAddr.replace(/^\/\d+$/, '')) || mem.configuredIps[k] === findAddr) {
              delete mem.configuredIps[k];
              mem.dhcpClients = (mem.dhcpClients || []).filter((c: any) => c.iface !== k);
              removed = true;
            }
          }
          if (!removed) {
            const addrOnly = findAddr.split('/')[0];
            for (const k of keys) {
              if (mem.configuredIps[k].startsWith(addrOnly)) {
                delete mem.configuredIps[k];
                mem.dhcpClients = (mem.dhcpClients || []).filter((c: any) => c.iface !== k);
                removed = true;
              }
            }
          }
          if (!removed) return fail(`no such address ${findAddr}`);
        } else if (findIface) {
          const k = resolveIfaceName(context?.ports, findIface) || findIface;
          if (!mem.configuredIps[k]) return fail(`no such interface ${findIface}`);
          delete mem.configuredIps[k];
          mem.dhcpClients = (mem.dhcpClients || []).filter((c: any) => c.iface !== k);
          removed = true;
        } else {
          return err('% Usage: /ip address remove [find address=<ip/mask>] | [find interface=<iface>] | numbers=<n>');
        }
        return { raw: removed ? '' : fail('no such item') };
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
          mem.routes = mem.routes.filter((r: any) => toCidr(String(r.dst)) !== toCidr(findDst));
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
        mem.natRules = mem.natRules.filter((r: any) =>
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
        mem.acls = mem.acls.filter((r: any) =>
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
        mem.dhcpPools = mem.dhcpPools.filter((p: any) => p.name !== findName);
        if (mem.dhcpPools.length === before) return fail(`no such item (${findName})`);
        return { raw: '' };
      }
      // /ip dhcp-client remove [find interface=…]
      if (/^\/ip\s+dhcp-client\s+remove\b/i.test(input)) {
        const iface = findIface || (input.match(/interface=([^\s\]]+)/i)?.[1] || '').replace(/[",]/g, '');
        if (!iface) return err('% Usage: /ip dhcp-client remove [find interface=<iface>]');
        const before = mem.dhcpClients.length;
        mem.dhcpClients = (mem.dhcpClients || []).filter((c: any) => c.iface !== iface);
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
        mem.dnsRecords = mem.dnsRecords.filter((d: any) => d.name !== findName.toLowerCase());
        if (mem.dnsRecords.length === before) return fail(`no such dns record (${findName})`);
        return { raw: '' };
      }
      // /interface vlan remove [find name=…]
      if (/^\/interface\s+vlan\s+remove\b/i.test(input)) {
        if (!findName) return err('% Usage: /interface vlan remove [find name=<nama>]');
        const vlan = mem.vlans.find((v: any) => v.name === findName);
        if (!vlan) return fail(`no such vlan (${findName})`);
        mem.vlans = mem.vlans.filter((v: any) => v.name !== findName);
        mem.subinterfaces = (mem.subinterfaces || []).filter((s: any) => s.name !== findName && String(s.vlanId) !== String(vlan.id));
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
        mem.routes = mem.routes.filter((r: any) => toCidr(String(r.dst)) !== toCidr(staticMatch[1]));
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
        mem.vlans = mem.vlans.filter((v: any) => v.name !== vlanJ[1]);
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
        mem.routes = mem.routes.filter((r: any) => toCidr(String(r.dst)) !== toCidr(vStatic[1]));
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
        mem.dhcpClients = (mem.dhcpClients || []).filter((c: any) => c.iface !== mem.currentIface);
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
        mem.routes = mem.routes.filter((r: any) => {
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
        mem.vlans = mem.vlans.filter((v: any) => String(v.id) !== String(id));
        for (const [iface, v] of Object.entries(mem.portVlans || {})) {
          if (String(v) === String(id)) delete mem.portVlans[iface];
        }
        mem.subinterfaces = (mem.subinterfaces || []).filter((s: any) => String(s.vlanId) !== String(id));
        if (mem.vlans.length === before) return err(`% Error: The VLAN does not exist`);
        return { raw: '' };
      }
      // undo ip host <name>
      const hHost = input.match(/^undo\s+ip\s+host\s+(\S+)\s*$/i);
      if (hHost) {
        const before = mem.dnsRecords.length;
        mem.dnsRecords = mem.dnsRecords.filter((d: any) => d.name !== hHost[1].toLowerCase());
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
      mem.routes = mem.routes.filter((r: any) => {
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
      this.restoreJuniper(mem, snap);
      return { raw: 'configuration rolled back' };
    }

    return undefined;
  }

  /** Pesan error jujur untuk perintah yang tidak dikenali (no fake success). */
  private unknownCommand(vendorId: string, rawInput: string): string {
    const first = (rawInput.trim().split(/\s+/)[0] || '').replace(/^\//, '');
    switch (vendorId) {
      case 'mikrotik':
        return `bad command name ${first || '""'} (line 1 column 1)`;
      case 'juniper':
        return 'syntax error, expecting <command>';
      case 'huawei':
        return `% Unrecognized command found at '^' position.`;
      case 'linux':
      case 'openwrt':
        return `bash: ${first || '""'}: command not found`;
      default:
        return `% Invalid input detected at '^' marker.`;
    }
  }

  dispatch(vendorId: string, rawInput: string, context: any): string {
    const adapter = this.getAdapter(vendorId);
    if (!adapter) return `% Error: Unknown vendor "${vendorId}". Supported: ${Array.from(this.adapters.keys()).join(', ')}`;

    const nodeId = context.nodeId;
    const mem = this.getNodeMemory(nodeId);

    // Baris kosong: perangkat sungguhan hanya mengulang prompt, tidak ada output.
    if (!rawInput || !rawInput.trim()) return '';

    const normalized = adapter.parseSyntax(rawInput);

    // Execution environment — resolve command to result object.
    // undefined = tidak ada handler yang menangani → error "unknown command" di bawah.
    let cmdResult: any = undefined;

    if (normalized.action === '?' || normalized.action === 'help' || rawInput.trim() === '?') {
      cmdResult = { type: 'help' };
    } else if ((cmdResult = this.handleDeletion(rawInput, normalized, vendorId, mem, context)) !== undefined) {
      // Configuration deletion (no …, /ip … remove, delete …, undo …, uci delete …)
      // mutates real state instead of returning fake success.
    } else if (/^(?:reload|reboot)\s*$|^\/system\s+reboot\s*$/i.test(rawInput.trim())) {
      // Reload: restore node dari startup-config (write memory / copy run start).
      const hadStartup = this.reloadFromStartupConfig(nodeId);
      cmdResult = { type: 'reload', hadStartup };
    } else if ((cmdResult = snmpCommand(rawInput, vendorId, mem, context)) !== undefined) {
      // SNMP: konfigurasi agent per vendor + query snmpget/snmpwalk/snmpset.
      // Selalu dicek duluan agar perintah agent tidak tabrakan dengan parser bawaan.
    } else if (vendorId === 'fortinet' && (cmdResult = fortinetCommand(rawInput, context, mem)) !== undefined) {
      // Fortinet: DHCP server, VLAN, OSPF, BGP, firewall policy (NAT), VIP port-forward,
      // firewall address, DNS — semuanya lewat mode "config ... / edit ... / set ... / end".
    } else if (vendorId === 'juniper' && (cmdResult = juniperCommand(rawInput, context, mem)) !== undefined) {
      // Juniper: address-assignment pool (DHCP), dhcp-local-server, BGP, firewall filter,
      // security nat, static-host-mapping DNS, DHCP client.
    } else if ((vendorId === 'vyos' || vendorId === 'ubiquiti') && (cmdResult = vyosCommand(rawInput, context, mem)) !== undefined) {
      // VyOS / EdgeOS: dhcp-server shared-network, nat source/destination, bgp,
      // firewall name (ACL), static-host-mapping DNS, DHCP client.
    } else if (vendorId === 'huawei' && (cmdResult = huaweiCommand(rawInput, context, mem)) !== undefined) {
      // Huawei: BGP (bgp/peer/network), ACL (acl/rule), NAT (nat outbound / nat server),
      // DNS static (ip host).
    } else if (vendorId === 'openwrt' && (cmdResult = openwrtCommand(rawInput, context, mem)) !== undefined) {
      // OpenWrt: dnsmasq (uci dhcp), static route & NAT (uci network/firewall), DNS hosts.
    } else if (vendorId === 'linux' && (cmdResult = linuxCommand(rawInput, context, mem)) !== undefined) {
      // Linux: DHCP server (dhcpd.conf), NAT (iptables), DNS static (/etc/hosts).
    } else if (/^(?:interface|int)\s+\S+/i.test(rawInput.trim())) {
      // IOS-style: "interface Gi0/0" / "int Gi0/0" (Cisco, Aruba, Huawei) — sets the config context
      const ifaceRaw = rawInput.trim().replace(/^(?:interface|int)\s+/i, '').split(/\s+/)[0];
      const isSubinterface =
        ifaceRaw.includes('.') &&
        !(context?.ports || []).some((p: any) => p.name.toLowerCase() === ifaceRaw.toLowerCase()) &&
        (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba' || vendorId === 'huawei');
      if (isSubinterface) {
        // VLAN subinterface (router-on-a-stick): "interface Gi0/0.10"
        const dot = ifaceRaw.lastIndexOf('.');
        const parent = ifaceRaw.slice(0, dot);
        const vlanId = parseInt(ifaceRaw.slice(dot + 1), 10) || 1;
        upsertSubinterface(mem, ifaceRaw, parent, vlanId);
        mem.currentIface = ifaceRaw;
        mem.currentDhcpPool = '';
        cmdResult = { raw: '' };
      } else {
        mem.currentIface = resolveIfaceName(context?.ports, ifaceRaw);
        mem.currentDhcpPool = '';
        cmdResult = { raw: '' };
      }
    } else if (/^encapsulation\s+dot1q\s+(\d+)/i.test(rawInput.trim()) && mem.currentIface && /\.\d+$/.test(mem.currentIface) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')) {
      // Cisco subinterface: "encapsulation dot1q 10"
      const vlanId = parseInt(rawInput.trim().match(/^encapsulation\s+dot1q\s+(\d+)/i)?.[1] || '1', 10);
      upsertSubinterface(mem, mem.currentIface, mem.currentIface.replace(/\.\d+$/, ''), vlanId);
      cmdResult = { raw: '' };
    } else if (/^dot1q\s+termination\s+vid\s+(\d+)/i.test(rawInput.trim()) && mem.currentIface && /\.\d+$/.test(mem.currentIface) && vendorId === 'huawei') {
      // Huawei subinterface: "dot1q termination vid 10"
      const vlanId = parseInt(rawInput.trim().match(/^dot1q\s+termination\s+vid\s+(\d+)/i)?.[1] || '1', 10);
      upsertSubinterface(mem, mem.currentIface, mem.currentIface.replace(/\.\d+$/, ''), vlanId);
      cmdResult = { raw: '' };
    } else if (/^(no\s+)?shut(down)?$/i.test(rawInput.trim()) && mem.currentIface && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba' || vendorId === 'huawei')) {
      // Cisco/Huawei: "shutdown"/"shut" / "no shutdown"/"no shut" (interface view) — administratively down/up
      const down = !/^no\s+/i.test(rawInput.trim());
      setShutdownState(mem, mem.currentIface, down);
      cmdResult = { raw: '' };
    } else if (/^(?:ip\s+)?ospf\s+cost\s+(\d+)/i.test(rawInput.trim()) && mem.currentIface && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba' || vendorId === 'huawei')) {
      // Cisco/Huawei: "ip ospf cost <n>" (interface view) — cost interface OSPF
      const cost = parseInt(rawInput.trim().match(/^(?:ip\s+)?ospf\s+cost\s+(\d+)/i)?.[1] || '0', 10);
      if (cost >= 1 && cost <= 65535) {
        mem.routing.ospf.interfaceCosts[mem.currentIface] = cost;
        cmdResult = { raw: '' };
      } else {
        cmdResult = { raw: '% Range of values is 1 to 65535' };
      }
    } else if (/^passive-interface\s+(\S+)/i.test(rawInput.trim()) && mem.currentProto === 'ospf' && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')) {
      // Cisco: "passive-interface <iface>" (router ospf view) — tidak membentuk adjacency
      const iface = resolveIfaceName(context?.ports, rawInput.trim().match(/^passive-interface\s+(\S+)/i)?.[1] || '') || '';
      if (iface && !mem.routing.ospf.passiveInterfaces.includes(iface)) {
        mem.routing.ospf.passiveInterfaces.push(iface);
      }
      cmdResult = { raw: '' };
    } else if (/^silent-interface\s+(\S+)/i.test(rawInput.trim()) && mem.currentProto === 'ospf' && vendorId === 'huawei') {
      // Huawei: "silent-interface <iface>" di router ospf — padanan passive-interface
      const iface = resolveIfaceName(context?.ports, rawInput.trim().match(/^silent-interface\s+(\S+)/i)?.[1] || '') || '';
      if (iface && !mem.routing.ospf.passiveInterfaces.includes(iface)) {
        mem.routing.ospf.passiveInterfaces.push(iface);
      }
      cmdResult = { raw: '' };
    } else if (/^\/routing\s+ospf\s+interface\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik') {
      // MikroTik: "/routing ospf interface add interface=ether1 cost=10 passive=yes"
      const raw = rawInput.trim();
      const ifaceRaw = raw.match(/interface=(\S+)/i)?.[1];
      if (ifaceRaw) {
        const iface = resolveIfaceName(context?.ports, ifaceRaw) || ifaceRaw;
        const cost = parseInt(raw.match(/cost=(\d+)/i)?.[1] || '0', 10);
        if (cost >= 1) mem.routing.ospf.interfaceCosts[iface] = cost;
        if (/passive=(?:yes|true)/i.test(raw) && !mem.routing.ospf.passiveInterfaces.includes(iface)) {
          mem.routing.ospf.passiveInterfaces.push(iface);
        }
        cmdResult = { raw: '' };
      } else {
        cmdResult = { raw: '% Usage: /routing ospf interface add interface=<port> cost=<1-65535> passive=yes' };
      }
    } else if (/^\/ip\s+dhcp-relay\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik') {
      // MikroTik: "/ip dhcp-relay add name=relay1 interface=ether1 dhcp-server=10.0.2.1"
      const raw = rawInput.trim();
      const ifaceRaw = raw.match(/interface=(\S+)/i)?.[1];
      const server = raw.match(/dhcp-server=(\S+)/i)?.[1];
      if (ifaceRaw && server) {
        mem.dhcpRelays[resolveIfaceName(context?.ports, ifaceRaw) || ifaceRaw] = server;
        cmdResult = { raw: '' };
      } else {
        cmdResult = { raw: '% Usage: /ip dhcp-relay add interface=<port> dhcp-server=<ip>' };
      }
    } else if (/^ip\s+helper-address\s+(\d+\.\d+\.\d+\.\d+)/i.test(rawInput.trim()) && mem.currentIface && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')) {
      // Cisco: "ip helper-address <ip>" (interface view) — DHCP relay
      mem.dhcpRelays[mem.currentIface] = rawInput.trim().match(/^ip\s+helper-address\s+(\d+\.\d+\.\d+\.\d+)/i)?.[1] || '';
      cmdResult = { raw: '' };
    } else if (/^\/ipv6\s+dhcp-client\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik') {
      // MikroTik: "/ipv6 dhcp-client add interface=ether1" — SLAAC/PD pada interface
      const ifaceRaw = rawInput.trim().match(/interface=(\S+)/i)?.[1];
      if (ifaceRaw) {
        const iface = resolveIfaceName(context?.ports, ifaceRaw) || ifaceRaw;
        if (!mem.ipv6DhcpClients.includes(iface)) mem.ipv6DhcpClients.push(iface);
        cmdResult = { raw: '' };
      } else {
        cmdResult = { raw: '% Usage: /ipv6 dhcp-client add interface=<port>' };
      }
    } else if (/^ipv6\s+address\s+(?:autoconfig|dhcp)/i.test(rawInput.trim()) && mem.currentIface && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba' || vendorId === 'huawei')) {
      // Cisco/Huawei: "ipv6 address autoconfig" (interface view) — SLAAC
      if (!mem.ipv6DhcpClients.includes(mem.currentIface)) mem.ipv6DhcpClients.push(mem.currentIface);
      cmdResult = { raw: '' };
    } else if (/^switchport\s+port-security$/i.test(rawInput.trim()) && mem.currentIface && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')) {
      // Cisco: "switchport port-security" (interface view) — aktifkan port security (max default 1)
      const cur = mem.portSecurity[mem.currentIface] || {};
      mem.portSecurity[mem.currentIface] = { ...cur, limit: cur.limit || 1, sticky: !!cur.sticky };
      cmdResult = { raw: '' };
    } else if (/^switchport\s+port-security\s+maximum\s+(\d+)/i.test(rawInput.trim()) && mem.currentIface && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')) {
      const m = rawInput.trim().match(/^switchport\s+port-security\s+maximum\s+(\d+)/i);
      const limit = parseInt(m?.[1] || '1', 10);
      if (limit >= 1 && limit <= 132) {
        const cur = mem.portSecurity[mem.currentIface] || {};
        mem.portSecurity[mem.currentIface] = { ...cur, limit, sticky: !!cur.sticky };
        cmdResult = { raw: '' };
      }
    } else if (/^switchport\s+port-security\s+mac-address\s+sticky/i.test(rawInput.trim()) && mem.currentIface && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')) {
      const cur = mem.portSecurity[mem.currentIface] || {};
      mem.portSecurity[mem.currentIface] = { ...cur, sticky: true, limit: cur.limit || 1 };
      cmdResult = { raw: '' };
    } else if (/^switchport\s+port-security\s+violation\s+(\S+)/i.test(rawInput.trim()) && mem.currentIface && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')) {
      const mode = rawInput.trim().match(/^switchport\s+port-security\s+violation\s+(\S+)/i)?.[1]?.toLowerCase() || 'restrict';
      const cur = mem.portSecurity[mem.currentIface] || {};
      mem.portSecurity[mem.currentIface] = { ...cur, violation: mode, limit: cur.limit || 1, sticky: !!cur.sticky };
      cmdResult = { raw: '' };
    } else if (/^\/interface\s+(disable|enable)\s+(\S+)/i.test(rawInput.trim()) && vendorId === 'mikrotik') {
      // MikroTik: "/interface disable ether1" / "/interface enable ether1"
      const down = /^\/interface\s+disable\s+/i.test(rawInput.trim());
      const iface = resolveIfaceName(context?.ports, rawInput.trim().split(/\s+/).pop()) || '';
      setShutdownState(mem, iface, down);
      cmdResult = { raw: '' };
    } else if (/^\/ipv6\s+address\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik') {
      // MikroTik: "/ipv6 address add address=2001:db8::1/64 interface=ether1"
      const addr = rawInput.trim().match(/address=(\S+)/i)?.[1];
      const ifaceRaw = rawInput.trim().match(/interface=(\S+)/i)?.[1];
      if (addr && ifaceRaw) {
        const iface = resolveIfaceName(context?.ports, ifaceRaw) || ifaceRaw;
        mem.configuredIps6[iface] = addr;
        cmdResult = { raw: '' };
      } else {
        cmdResult = { raw: '% Usage: /ipv6 address add address=<ip/prefix> interface=<port>' };
      }
    } else if (/^\/ipv6\s+route\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik') {
      // MikroTik: "/ipv6 route add dst-address=2001:db8::/64 gateway=2001:db8:ff::1"
      const dst = rawInput.trim().match(/dst-address=(\S+)/i)?.[1];
      const gw = rawInput.trim().match(/gateway=(\S+)/i)?.[1];
      if (dst && gw) {
        if (!mem.routes6.some((r: any) => r.dst === dst)) mem.routes6.push({ dst, gateway: gw });
        cmdResult = { raw: '' };
      } else {
        cmdResult = { raw: '% Usage: /ipv6 route add dst-address=<jaringan/prefix> gateway=<gw>' };
      }
    } else if (/(?:^ipv6\s+address\s+)(\S+)/i.test(rawInput.trim()) && mem.currentIface && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba' || vendorId === 'huawei')) {
      // Cisco/Huawei: "ipv6 address 2001:db8::1/64" (interface view)
      const addr = rawInput.trim().match(/^ipv6\s+address\s+(\S+)/i)?.[1];
      if (addr) {
        mem.configuredIps6[mem.currentIface] = addr;
        cmdResult = { raw: '' };
      }
    } else if (/^ipv6\s+route\s+(\S+)\s+(\S+)/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')) {
      // Cisco: "ipv6 route 2001:db8:2::/64 2001:db8:ff::2"
      const m = rawInput.trim().match(/^ipv6\s+route\s+(\S+)\s+(\S+)/i);
      if (m) {
        if (!mem.routes6.some((r: any) => r.dst === m![1] && r.gateway === m![2])) mem.routes6.push({ dst: m[1], gateway: m[2] });
        cmdResult = { raw: '' };
      }
    } else if ((vendorId === 'linux' || vendorId === 'openwrt') && /^ip\s+-6\s+route\s+add\s+/i.test(rawInput.trim())) {
      // Linux: "ip -6 route add 2001:db8:2::/64 via 2001:db8:ff::2" / "ip -6 route add default via 2001:db8:1::1"
      const m = rawInput.trim().match(/^ip\s+-6\s+route\s+add\s+(\S+)\s+via\s+(\S+)/i);
      if (m) {
        const dst = m[1].toLowerCase() === 'default' ? '::/0' : m[1];
        if (!mem.routes6.some((r: any) => r.dst === dst)) mem.routes6.push({ dst, gateway: m[2] });
        cmdResult = { raw: '' };
      } else {
        cmdResult = { raw: '% Usage: ip -6 route add <dst> via <gateway>' };
      }
    } else if (/^\/routing\s+vrrp\s+instance\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik') {
      // MikroTik: "/routing vrrp instance add name=vrrp1 interface=ether1 vrid=1 priority=120 address=192.168.1.254/24"
      const raw = rawInput.trim();
      const addr = raw.match(/address=(\S+)/i)?.[1];
      const ifaceRaw = raw.match(/interface=(\S+)/i)?.[1];
      const vrid = parseInt(raw.match(/vrid=(\d+)/i)?.[1] || '1', 10);
      const priority = parseInt(raw.match(/priority=(\d+)/i)?.[1] || '100', 10);
      if (addr && ifaceRaw) {
        const iface = resolveIfaceName(context?.ports, ifaceRaw) || ifaceRaw;
        const existing = mem.fhrpGroups.findIndex((g: any) => g.virtualAddress === addr);
        const group = { virtualAddress: addr, interface: iface, vrid, priority };
        if (existing >= 0) mem.fhrpGroups[existing] = { ...mem.fhrpGroups[existing], ...group };
        else mem.fhrpGroups.push(group);
        cmdResult = { raw: '' };
      } else {
        cmdResult = { raw: '% Usage: /routing vrrp instance add name=<nama> interface=<port> vrid=<1-255> priority=<1-255> address=<ip/prefix>' };
      }
    } else if (/^(vrrp|standby)\s+(\d+)\s+ip\s+(\S+)/i.test(rawInput.trim()) && mem.currentIface && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')) {
      // Cisco: "vrrp 1 ip 192.168.1.254" / "standby 1 ip 192.168.1.254" (interface view)
      const m = rawInput.trim().match(/^(vrrp|standby)\s+(\d+)\s+ip\s+(\S+)/i);
      if (m) {
        const addr = m[3];
        const vrid = parseInt(m[2], 10);
        const existing = mem.fhrpGroups.findIndex((g: any) => g.virtualAddress === addr || (g.vrid === vrid && g.interface === mem.currentIface));
        const group = { virtualAddress: `${addr}/24`, interface: mem.currentIface, vrid, priority: 100 };
        if (existing >= 0) mem.fhrpGroups[existing] = { ...mem.fhrpGroups[existing], virtualAddress: `${addr}/24` };
        else mem.fhrpGroups.push(group);
        cmdResult = { raw: '' };
      }
    } else if (/^(vrrp|standby)\s+(\d+)\s+priority\s+(\d+)/i.test(rawInput.trim()) && mem.currentIface && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')) {
      // Cisco: "vrrp 1 priority 120" / "standby 1 priority 120" (interface view)
      const m = rawInput.trim().match(/^(vrrp|standby)\s+(\d+)\s+priority\s+(\d+)/i);
      if (m) {
        const vrid = parseInt(m[2], 10);
        const priority = parseInt(m[3], 10);
        const g = mem.fhrpGroups.find((x: any) => x.vrid === vrid && x.interface === mem.currentIface);
        if (g) g.priority = priority;
        else mem.fhrpGroups.push({ virtualAddress: '0.0.0.0/24', interface: mem.currentIface, vrid, priority });
        cmdResult = { raw: '' };
      }
    } else if (/^\/routing\s+vrrp\s+instance\s+print/i.test(rawInput.trim()) || (normalized.target === 'routing_vrrp_instance' && normalized.action === 'print')) {
      // MikroTik: "/routing vrrp instance print" — snapshot dari engine
      const states = typeof context.fhrpProvider === 'function' ? context.fhrpProvider() : mem.fhrpGroups;
      cmdResult = { type: 'fhrp_print', groups: states || [] };
    } else if (/^\/ipv6\s+(?:address|route)\s+print/i.test(rawInput.trim()) || normalized.target === 'ipv6_address' || normalized.target === 'ipv6_route') {
      // MikroTik: "/ipv6 address print" / "/ipv6 route print" — snapshot engine
      const info = typeof context.ipv6Provider === 'function' ? context.ipv6Provider() : null;
      cmdResult = { type: 'ipv6_print', info };
    } else if (/^\/ipv6\s+dhcp-client\s+print/i.test(rawInput.trim()) || (normalized.target === 'ipv6_dhcp-client' && normalized.action === 'print')) {
      // MikroTik: "/ipv6 dhcp-client print" — slider SLAAC/DHCPv6 client
      const info = typeof context.ipv6Provider === 'function' ? context.ipv6Provider() : null;
      cmdResult = { type: 'ipv6_dhcp_print', clients: mem.ipv6DhcpClients || [], info };
    } else if ((vendorId === 'linux' || vendorId === 'openwrt') && /^ip\s+link\s+set\s+(\S+)\s+(up|down)\s*$/i.test(rawInput.trim())) {
      // Linux: "ip link set eth0 up|down"
      const m = rawInput.trim().match(/^ip\s+link\s+set\s+(\S+)\s+(up|down)\s*$/i);
      if (m) {
        const iface = resolveIfaceName(context?.ports, m[1]) || m[1];
        setShutdownState(mem, iface, m[2].toLowerCase() === 'down');
        cmdResult = { raw: '' };
      }
    } else if (/^edit\s+\S+/i.test(rawInput.trim())) {
      // Fortinet: "edit port1" — sets the config context
      const ifaceRaw = rawInput.trim().replace(/^edit\s+/i, '').split(/\s+/)[0];
      mem.currentIface = resolveIfaceName(context?.ports, ifaceRaw);
      cmdResult = { raw: '' };
    } else if (vendorId === 'fortinet' && /^set\s+ip\s+\S+\s+\S+/i.test(rawInput.trim())) {
      const m = rawInput.trim().match(/^set\s+ip\s+(\S+)\s+(\S+)/i);
      if (m && mem.currentIface) {
        mem.configuredIps[mem.currentIface] = `${m[1]} ${m[2]}`;
        cmdResult = { raw: '' };
      } else {
        cmdResult = { raw: '% Error: enter interface config first (config system interface → edit <name>)' };
      }
    } else if (vendorId === 'huawei' && /^ip\s+(address|add)\s+\S+\s+\S+/i.test(rawInput.trim())) {
      // Huawei: "ip address <ip> <mask>" / "ip add ..." inside an interface view
      const m = rawInput.trim().match(/^ip\s+(?:address|add)\s+(\S+)\s+(\S+)/i);
      if (m && mem.currentIface) {
        mem.configuredIps[mem.currentIface] = `${m[1]} ${m[2]}`;
        cmdResult = { raw: '' };
      } else {
        cmdResult = { raw: '% Error: enter interface view first (interface <name>)' };
      }
    } else if ((vendorId === 'linux' || vendorId === 'openwrt') && /^ip\s+addr(ess)?\s+add\s+\S+\s+dev\s+\S+/i.test(rawInput.trim())) {
      // Linux: "ip addr add 192.168.1.10/24 dev eth0" / "ip addr add 2001:db8::10/64 dev eth0"
      const m = rawInput.trim().match(/^ip\s+addr(ess)?\s+add\s+(\S+)\s+dev\s+(\S+)/i);
      if (m) {
        const target = m[2].includes(':') ? mem.configuredIps6 : mem.configuredIps;
        target[resolveIfaceName(context?.ports, m[3])] = m[2];
        cmdResult = { raw: '' };
      }
    } else if ((vendorId === 'linux' || vendorId === 'openwrt') && /^ip\s+route\s+add\s+\S+/i.test(rawInput.trim())) {
      // Linux: "ip route add 0.0.0.0/0 via 10.0.0.1" (also "ip route add default via <gw>")
      const m = rawInput.trim().match(/^ip\s+route\s+add\s+(\S+)\s+via\s+(\S+)/i);
      if (m) {
        const dst = m[1].toLowerCase() === 'default' ? '0.0.0.0/0' : m[1];
        mem.routes.push({ dst, gateway: m[2], distance: 1 });
        cmdResult = { raw: '' };
      } else {
        cmdResult = { raw: '% Usage: ip route add <dst> via <gateway>' };
      }
    } else if ((vendorId === 'cisco_ios' || vendorId === 'aruba' || vendorId === 'cisco_nxos') && /^ip\s+route\s+\S+\s+\S+\s+\S+/i.test(rawInput.trim())) {
      // IOS-style: "ip route 0.0.0.0 0.0.0.0 <gateway>"
      const m = rawInput.trim().match(/^ip\s+route\s+(\S+)\s+(\S+)\s+(\S+)/i);
      if (m) {
        mem.routes.push({ dst: `${m[1]} ${m[2]}`, gateway: m[3], distance: 1 });
        cmdResult = { raw: '' };
      } else {
        cmdResult = { raw: '% Usage: ip route <dst> <mask> <gateway>' };
      }
    } else if (vendorId === 'huawei' && /^ip\s+route-static\s+\S+\s+\S+\s+\S+/i.test(rawInput.trim())) {
      // Huawei: "ip route-static 0.0.0.0 0.0.0.0 <gateway>"
      const m = rawInput.trim().match(/^ip\s+route-static\s+(\S+)\s+(\S+)\s+(\S+)/i);
      if (m) {
        mem.routes.push({ dst: `${m[1]} ${m[2]}`, gateway: m[3], distance: 1 });
        cmdResult = { raw: '' };
      } else {
        cmdResult = { raw: '% Usage: ip route-static <dst> <mask> <gateway>' };
      }
    } else if (/^set\s+hostname\s+"?(\S+)"?/i.test(rawInput.trim()) && vendorId === 'fortinet') {
      // Fortinet: "set hostname <nama>" (dari config system global)
      const m = rawInput.trim().match(/^set\s+hostname\s+"?(\S+)"?/i);
      if (m) {
        mem.hostname = m[1].replace(/"/g, '');
        cmdResult = { raw: '' };
      }
    } else if (vendorId === 'fortinet' && /^set\s+dst\s+\S+\s+\S+/i.test(rawInput.trim())) {
      // Fortinet: "set dst <ip> <mask>" (dari config router static → edit <n>)
      const m = rawInput.trim().match(/^set\s+dst\s+(\S+)\s+(\S+)/i);
      if (m) {
        mem.currentStaticDst = `${m[1]} ${m[2]}`;
        cmdResult = { raw: '' };
      }
    } else if (vendorId === 'fortinet' && /^set\s+gateway\s+\S+/i.test(rawInput.trim())) {
      // Fortinet: "set gateway <ip>" — lengkapi rute statis
      const m = rawInput.trim().match(/^set\s+gateway\s+(\S+)/i);
      if (m && mem.currentStaticDst) {
        mem.routes.push({ dst: mem.currentStaticDst, gateway: m[1], distance: 1 });
        mem.currentStaticDst = '';
        cmdResult = { raw: '' };
      } else {
        cmdResult = { raw: '% Usage: set dst <ip> <mask> dulu, lalu set gateway <ip>' };
      }
    } else if (/^hostname\s+(\S+)/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'aruba' || vendorId === 'cisco_nxos')) {
      // IOS-style: "hostname <name>" (Cisco IOS, NX-OS, Aruba)
      const m = rawInput.trim().match(/^hostname\s+(\S+)/i);
      if (m) {
        mem.hostname = m[1];
        cmdResult = { raw: '' };
      }
    } else if (/^sysname\s+(\S+)/i.test(rawInput.trim()) && vendorId === 'huawei') {
      // Huawei: "sysname <name>" (dari system view)
      const m = rawInput.trim().match(/^sysname\s+(\S+)/i);
      if (m) {
        mem.hostname = m[1];
        cmdResult = { raw: '' };
      }
    } else if (/^\/?(system|sys)\s+(identity|id)\s+set\s+name=(\S+)/i.test(rawInput.trim()) && vendorId === 'mikrotik') {
      // MikroTik: "/system identity set name=<hostname>" / "/sys id set name=..."
      const m = rawInput.trim().match(/^\/?(?:system|sys)\s+(?:identity|id)\s+set\s+name=(\S+)/i);
      if (m) {
        mem.hostname = m[1];
        cmdResult = { raw: '' };
      }
    } else if (/^set\s+system\s+host-name\s+(\S+)/i.test(rawInput.trim()) && (vendorId === 'juniper' || vendorId === 'ubiquiti' || vendorId === 'vyos')) {
      // Juniper / EdgeOS / VyOS: "set system host-name <name>"
      const m = rawInput.trim().match(/^set\s+system\s+host-name\s+(\S+)/i);
      if (m) {
        mem.hostname = m[1];
        cmdResult = { raw: '' };
      }
    } else if (/^uci\s+set\s+system\.@system\[0\]\.hostname=(\S+)/i.test(rawInput.trim()) && vendorId === 'openwrt') {
      const m = rawInput.trim().match(/^uci\s+set\s+system\.@system\[0\]\.hostname=(\S+)/i);
      if (m) {
        mem.hostname = m[1];
        cmdResult = { raw: '' };
      }
    } else if (/^hostname\s+(\S+)/i.test(rawInput.trim()) && vendorId === 'linux') {
      const m = rawInput.trim().match(/^hostname\s+(\S+)/i);
      if (m) {
        mem.hostname = m[1];
        cmdResult = { raw: '' };
      }
    } else if (/^\/interface\s+vlan\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik') {
      // MikroTik: "/interface vlan add name=vlan10 vlan-id=10 interface=ether2"
      const raw = rawInput.trim();
      const name = raw.match(/name=(\S+)/i)?.[1];
      const id = raw.match(/vlan-id=(\d+)/i)?.[1];
      const iface = raw.match(/interface=(\S+)/i)?.[1];
      if (name && id) {
        mem.vlans.push({ id, name, iface: resolveIfaceName(context?.ports, iface) || iface });
        // VLAN interfaces act as subinterfaces on their parent port (router-on-a-stick)
        upsertSubinterface(mem, name, resolveIfaceName(context?.ports, iface) || iface, parseInt(id, 10));
        cmdResult = { raw: '' };
      } else {
        cmdResult = { raw: '% Usage: /interface vlan add name=<nama> vlan-id=<id> interface=<port>' };
      }
    } else if (/^vlan\s+(\d+)/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')) {
      // Cisco IOS / NX-OS / Aruba: "vlan <id>" (+ optional "name <x>")
      const m = rawInput.trim().match(/^vlan\s+(\d+)/i);
      if (m) {
        const id = m[1];
        const nameMatch = rawInput.trim().match(/name\s+(\S+)/i);
        const existing = mem.vlans.find((v: any) => v.id === id);
        if (existing) existing.name = nameMatch?.[1] || existing.name;
        else mem.vlans.push({ id, name: nameMatch?.[1] || `VLAN${id}` });
        cmdResult = { raw: '' };
      }
    } else if (/^vlan\s+(\d+)/i.test(rawInput.trim()) && vendorId === 'huawei') {
      // Huawei: "vlan <id>" (dari system view)
      const m = rawInput.trim().match(/^vlan\s+(\d+)/i);
      if (m) {
        const id = m[1];
        if (!mem.vlans.find((v: any) => v.id === id)) mem.vlans.push({ id, name: `VLAN${id}` });
        cmdResult = { raw: '' };
      }
    } else if (/^set\s+vlans\s+(\S+)\s+vlan-id\s+(\d+)/i.test(rawInput.trim()) && (vendorId === 'juniper' || vendorId === 'ubiquiti' || vendorId === 'vyos')) {
      // Juniper / EdgeOS / VyOS: "set vlans <name> vlan-id <id>"
      const m = rawInput.trim().match(/^set\s+vlans\s+(\S+)\s+vlan-id\s+(\d+)/i);
      if (m) {
        mem.vlans.push({ id: m[2], name: m[1] });
        cmdResult = { raw: '' };
      }
    } else if (/^uci\s+set\s+network\.(\S+)\.vlan=(\d+)/i.test(rawInput.trim()) && vendorId === 'openwrt') {
      // OpenWrt: "uci set network.vlan10.vlan=10"
      const m = rawInput.trim().match(/^uci\s+set\s+network\.(\S+)\.vlan=(\d+)/i);
      if (m) {
        mem.vlans.push({ id: m[2], name: m[1] });
        cmdResult = { raw: '' };
      }
    } else if (/^\/ip\s+dns\s+set\s+servers=(\S+)/i.test(rawInput.trim()) && vendorId === 'mikrotik') {
      const m = rawInput.trim().match(/^\/ip\s+dns\s+set\s+servers=(\S+)/i);
      if (m) {
        mem.dnsServers = m[1].split(',').map((s: string) => s.trim()).filter(Boolean);
        cmdResult = { raw: '' };
      }
    } else if (/^\/ip\s+dns\s+static\s+add\s+name=(\S+)\s+address=(\S+)/i.test(rawInput.trim()) && vendorId === 'mikrotik') {
      // MikroTik: "/ip dns static add name=site.com address=203.0.113.1"
      const m = rawInput.trim().match(/^\/ip\s+dns\s+static\s+add\s+name=(\S+)\s+address=(\S+)/i);
      if (m) {
        mem.dnsRecords.push({ name: m[1].toLowerCase(), address: m[2] });
        cmdResult = { raw: '' };
      }
    } else if (/^\/ip\s+dns\s+static\s+print/i.test(rawInput.trim()) && vendorId === 'mikrotik') {
      cmdResult = { type: 'dns_static_print', records: mem.dnsRecords };
    } else if (/^\/ip\s+service\s+print/i.test(rawInput.trim()) && vendorId === 'mikrotik') {
      cmdResult = { type: 'service_print', web: mem.webServer };
    } else if (/^\/ip\s+service\s+set\s+www\b/i.test(rawInput.trim()) && vendorId === 'mikrotik') {
      // MikroTik: "/ip service set www disabled=no|yes"
      const raw = rawInput.trim();
      const disabled = /disabled=yes/i.test(raw) ? true : /disabled=no/i.test(raw) ? false : undefined;
      const enabled = /enabled=no/i.test(raw) ? false : /enabled=yes/i.test(raw) ? true : disabled === undefined ? undefined : !disabled;
      if (enabled !== undefined) {
        mem.webServer = { ...(mem.webServer || { enabled: true, port: 80, content: '' }), enabled };
        cmdResult = { raw: '' };
      } else {
        cmdResult = { raw: '% Usage: /ip service set www disabled=no|yes' };
      }
    } else if ((vendorId === 'linux' || vendorId === 'openwrt') && /^systemctl\s+(start|stop|restart)\s+(nginx|apache2|apache|httpd)\b/i.test(rawInput.trim())) {
      // Linux: "systemctl start|stop|restart nginx|apache2"
      const m = rawInput.trim().match(/^systemctl\s+(start|stop|restart)\s+(nginx|apache2|apache|httpd)\b/i);
      mem.webServer = { ...(mem.webServer || { enabled: true, port: 80, content: '' }), enabled: m![1] !== 'stop' };
      cmdResult = { raw: '' };
    } else if ((vendorId === 'linux' || vendorId === 'openwrt') && /^service\s+(nginx|apache2|apache|httpd)\s+(start|stop|restart)\b/i.test(rawInput.trim())) {
      const m = rawInput.trim().match(/^service\s+(nginx|apache2|apache|httpd)\s+(start|stop|restart)\b/i);
      mem.webServer = { ...(mem.webServer || { enabled: true, port: 80, content: '' }), enabled: m![1] !== 'stop' };
      cmdResult = { raw: '' };
    } else if ((vendorId === 'linux' || vendorId === 'openwrt') && /^echo\s+"([^"]*)"\s*>\s*\/var\/www\/html\/index\.html/i.test(rawInput.trim())) {
      // Linux: echo "konten situs" > /var/www/html/index.html
      const m = rawInput.trim().match(/^echo\s+"([^"]*)"\s*>\s*\/var\/www\/html\/index\.html/i);
      if (m) {
        mem.webServer = { ...(mem.webServer || { enabled: true, port: 80, content: '' }), content: m[1] };
        cmdResult = { raw: '' };
      }
    } else if ((vendorId === 'linux' || vendorId === 'openwrt') && /^echo\s+["']?nameserver\s+(\d+\.\d+\.\d+\.\d+)\s*["']?\s*>\s*\/etc\/resolv\.conf/i.test(rawInput.trim())) {
      // Linux: echo "nameserver 203.0.113.1" > /etc/resolv.conf
      const m = rawInput.trim().match(/^echo\s+["']?nameserver\s+(\d+\.\d+\.\d+\.\d+)\s*["']?\s*>\s*\/etc\/resolv\.conf/i);
      if (m) {
        mem.dnsServers = [m[1]];
        cmdResult = { raw: '' };
      }
    } else if ((vendorId === 'linux' || vendorId === 'openwrt') && /^cat\s+\/etc\/resolv\.conf/i.test(rawInput.trim())) {
      const servers = mem.dnsServers || [];
      cmdResult = { raw: servers.length > 0 ? servers.map((s: string) => `nameserver ${s}`).join('\n') : '# empty (no DNS servers configured)' };
    } else if (/^ip\s+name-server\s+(\S+)/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')) {
      const m = rawInput.trim().match(/^ip\s+name-server\s+(\S+)/i);
      if (m) {
        mem.dnsServers = m[1].split(/\s+/).filter(Boolean);
        cmdResult = { raw: '' };
      }
    } else if (/^set\s+system\s+name-server\s+(\S+)/i.test(rawInput.trim()) && (vendorId === 'juniper' || vendorId === 'ubiquiti' || vendorId === 'vyos')) {
      const m = rawInput.trim().match(/^set\s+system\s+name-server\s+(\S+)/i);
      if (m) {
        mem.dnsServers = m[1].split(/\s+/).filter(Boolean);
        cmdResult = { raw: '' };
      }
    } else if (/^dns\s+server\s+(\S+)/i.test(rawInput.trim()) && vendorId === 'huawei') {
      const m = rawInput.trim().match(/^dns\s+server\s+(\S+)/i);
      if (m) {
        mem.dnsServers = m[1].split(/\s+/).filter(Boolean);
        cmdResult = { raw: '' };
      }
    } else if (/^\/ip\s+pool\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik') {
      // MikroTik: "/ip pool add name=pool1 ranges=192.168.88.100-192.168.88.200"
      const raw = rawInput.trim();
      const name = raw.match(/name=(\S+)/i)?.[1];
      const ranges = raw.match(/ranges=(\S+)/i)?.[1];
      if (name && ranges) {
        mem.dhcpPools.push({ name, range: ranges, network: ranges.split('-')[0], iface: '', gateway: '' });
        cmdResult = { raw: '' };
      } else {
        cmdResult = { raw: '% Usage: /ip pool add name=<nama> ranges=<awal>-<akhir>' };
      }
    } else if (/^\/ip\s+dhcp-server\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik') {
      // MikroTik: "/ip dhcp-server add name=dhcp1 interface=ether1 address-pool=pool1"
      const raw = rawInput.trim();
      const name = raw.match(/name=(\S+)/i)?.[1];
      const iface = raw.match(/interface=(\S+)/i)?.[1];
      const pool = raw.match(/address-pool=(\S+)/i)?.[1];
      const entry = mem.dhcpPools.find((p: any) => p.name === pool);
      if (name && iface) {
      if (entry) {
        entry.iface = resolveIfaceName(context?.ports, iface) || iface;
      } else {
          mem.dhcpPools.push({ name, range: '', network: '', iface: resolveIfaceName(context?.ports, iface) || iface, gateway: '' });
        }
        cmdResult = { raw: '' };
      } else {
        cmdResult = { raw: '% Usage: /ip dhcp-server add name=<nama> interface=<port> address-pool=<pool>' };
      }
    } else if (/^ip\s+dhcp\s+pool\s+(\S+)/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')) {
      // Cisco: "ip dhcp pool <nama>" — selanjutnya "network" & "default-router"
      const m = rawInput.trim().match(/^ip\s+dhcp\s+pool\s+(\S+)/i);
      if (m) {
        const name = m[1];
        mem.dhcpPools.push({ name, range: '', network: '', iface: '', gateway: '' });
        mem.currentDhcpPool = name;
        cmdResult = { raw: '' };
      }
    } else if (/^network\s+(\S+)\s+(\S+)/i.test(rawInput.trim()) && mem.currentDhcpPool && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')) {
      const m = rawInput.trim().match(/^network\s+(\S+)\s+(\S+)/i);
      const pool = mem.dhcpPools.find((p: any) => p.name === mem.currentDhcpPool);
      if (m && pool) {
        pool.network = `${m[1]} ${m[2]}`;
        cmdResult = { raw: '' };
      }
    } else if (/^default-router\s+(\S+)/i.test(rawInput.trim()) && mem.currentDhcpPool && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')) {
      const m = rawInput.trim().match(/^default-router\s+(\S+)/i);
      const pool = mem.dhcpPools.find((p: any) => p.name === mem.currentDhcpPool);
      if (m && pool) {
        pool.gateway = m[1];
        cmdResult = { raw: '' };
      }
    } else if (/^dhcp\s+enable/i.test(rawInput.trim()) && vendorId === 'huawei') {
      mem.dhcpPools.push({ name: 'global', range: '', network: '', iface: '', gateway: '' });
      cmdResult = { raw: '' };
    } else if (/^ip\s+host\s+(\S+)\s+(\d+\.\d+\.\d+\.\d+)/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba' || vendorId === 'huawei')) {
      // Cisco/Aruba/Huawei: "ip host <nama> <ip>" — DNS static record
      const m = rawInput.trim().match(/^ip\s+host\s+(\S+)\s+(\d+\.\d+\.\d+\.\d+)/i);
      if (m) {
        mem.dnsRecords.push({ name: m[1].toLowerCase(), address: m[2] });
        cmdResult = { raw: '' };
      }
    } else if (/^\/ip\s+dhcp-client\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik') {
      // MikroTik: "/ip dhcp-client add interface=ether2 add-default-route=yes"
      const raw = rawInput.trim();
      const ifaceRaw = raw.match(/interface=(\S+)/i)?.[1];
      if (ifaceRaw) {
        const iface = resolveIfaceName(context?.ports, ifaceRaw) || ifaceRaw;
        const addDefaultRoute = !/add-default-route=no/i.test(raw);
        cmdResult = { raw: grantDhcpClient(context, mem, iface, addDefaultRoute) };
      } else {
        cmdResult = { raw: '% Usage: /ip dhcp-client add interface=<port> add-default-route=yes' };
      }
    } else if (/^\/ip\s+dhcp-client\s+print/i.test(rawInput.trim()) || (normalized.target === 'ip_dhcp-client' && normalized.action === 'print')) {
      cmdResult = { type: 'dhcp_client_print', clients: mem.dhcpClients };
    } else if ((vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba' || vendorId === 'huawei') && /^ip\s+address\s+dhcp/i.test(rawInput.trim())) {
      // Cisco/Huawei: "ip address dhcp" di dalam interface view → DHCP client
      if (mem.currentIface) {
        cmdResult = { raw: grantDhcpClient(context, mem, mem.currentIface, true) };
      } else {
        cmdResult = { raw: '% Error: enter interface view first (interface <name>)' };
      }
    } else if ((vendorId === 'linux' || vendorId === 'openwrt') && /^(dhclient|udhcpc)\s/i.test(rawInput.trim())) {
      // Linux: "dhclient eth1" / "udhcpc -i eth1" → DHCP client
      const m = rawInput.trim().match(/^(?:dhclient|udhcpc(?:\s+-i)?)\s+(\S+)/i);
      if (m) {
        const iface = resolveIfaceName(context?.ports, m[1]) || m[1];
        cmdResult = { raw: grantDhcpClient(context, mem, iface, true) };
      } else {
        cmdResult = { raw: '% Usage: dhclient <interface>' };
      }
    } else if (/^\/ip\s+firewall\s+nat\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik') {
      // MikroTik:
      //   srcnat: "/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade"
      //   dstnat/port-forward: "/ip firewall nat add chain=dstnat protocol=tcp dst-port=8080 action=dst-nat to-addresses=192.168.1.10 to-ports=80"
      const raw = rawInput.trim();
      const chain = raw.match(/chain=(\S+)/i)?.[1] || 'srcnat';
      const outIface = raw.match(/out-interface=(\S+)/i)?.[1];
      const action = raw.match(/action=(\S+)/i)?.[1];
      if (action) {
        const rule: any = {
          chain,
          outInterface: outIface,
          action,
          srcAddress: raw.match(/src-address=(\S+)/i)?.[1] || '',
        };
        const protocol = raw.match(/protocol=(\S+)/i)?.[1];
        if (protocol) rule.protocol = protocol.toLowerCase();
        const dstAddress = raw.match(/dst-address=(\S+)/i)?.[1];
        if (dstAddress) rule.dstAddress = dstAddress;
        const dstPort = raw.match(/dst-port=(\S+)/i)?.[1];
        if (dstPort) rule.dstPort = dstPort;
        const toAddresses = raw.match(/to-addresses=(\S+)/i)?.[1];
        if (toAddresses) rule.toAddresses = toAddresses;
        const toPorts = raw.match(/to-ports=(\S+)/i)?.[1];
        if (toPorts) rule.toPorts = toPorts;
        mem.natRules.push(rule);
        cmdResult = { raw: '' };
      } else {
        cmdResult = { raw: '% Usage: /ip firewall nat add chain=<srcnat|dstnat> out-interface=<port> action=<masquerade|dst-nat> [protocol=<tcp|udp>] [dst-port=<port>] [to-addresses=<ip>] [to-ports=<port>]' };
      }
    } else if (/^\/ip\s+firewall\s+filter\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik') {
      // MikroTik: "/ip firewall filter add chain=input protocol=icmp action=drop"
      const raw = rawInput.trim();
      const action = raw.match(/action=(\S+)/i)?.[1];
      if (action) {
        mem.acls.push({
          action: action === 'drop' || action === 'reject' ? 'deny' : 'permit',
          proto: raw.match(/protocol=(\S+)/i)?.[1] || 'any',
          src: raw.match(/src-address=(\S+)/i)?.[1] || 'any',
          dst: raw.match(/dst-address=(\S+)/i)?.[1] || 'any',
        });
        cmdResult = { raw: '' };
      } else {
        cmdResult = { raw: '% Usage: /ip firewall filter add chain=<chain> protocol=<proto> action=drop|accept' };
      }
    } else if (/^\/ip\s+firewall\s+filter\s+print/i.test(rawInput.trim()) || (normalized.target === 'ip_firewall_filter' && normalized.action === 'print')) {
      cmdResult = { type: 'acl_print', rules: mem.acls };
    } else if (/^show\s+access-lists/i.test(rawInput.trim())) {
      cmdResult = { type: 'acl_print', rules: mem.acls };
    } else if (/^access-list\s+\d+\s+(permit|deny)\b/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')) {
      // Cisco: "access-list <id> permit|deny <proto> <src> [src-wildcard] [src-port] <dst> [dst-wildcard] [dst-port]"
      // Wildcard 0.0.0.255 dst → CIDR (192.168.1.0/24) agar engine bisa mencocokkan subnet.
      const m = rawInput.trim().match(/^access-list\s+(\d+)\s+(permit|deny)\s+(.*)$/i);
      if (m) {
        const id = parseInt(m[1], 10);
        const tokens = m[3].trim().split(/\s+/).filter(Boolean);
        let proto = 'ip';
        if (tokens.length > 0 && /^(ip|icmp|tcp|udp|any)$/i.test(tokens[0])) proto = tokens.shift()!.toLowerCase();

        // Wildcard valid: 0.0.0.0 (host), 0.0.0.x, 0.0.x.255, 0.x.255.255, x.255.255.255
        const isWildcard = (s: string): boolean => {
          if (!/^\d+\.\d+\.\d+\.\d+$/.test(s)) return false;
          const os = s.split('.').map(Number);
          if (os.some((o) => o < 0 || o > 255)) return false;
          if (s === '0.0.0.0' || s === '255.255.255.255') return true;
          if (os[0] === 0 && os[1] === 0 && os[2] === 0 && os[3] !== 0 && os[3] !== 255) return true;
          if (os[0] === 0 && os[1] === 0 && os[2] !== 0 && os[3] === 255) return true;
          if (os[0] === 0 && os[1] !== 0 && os[2] === 255 && os[3] === 255) return true;
          if (os[0] !== 0 && os[0] !== 255 && os[1] === 255 && os[2] === 255 && os[3] === 255) return true;
          return false;
        };
        const wildcardToCidr = (ip: string, wc: string): string => {
          if (!wc || wc === '0.0.0.0' || wc === '255.255.255.255' || ip === 'any') return ip;
          const bits = wc.split('.').map(Number).reduce((acc, o) => acc + (o.toString(2).match(/1/g) || []).length, 0);
          return `${ip}/${32 - bits}`;
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
            port = `${a}-${b}`;
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
          const rule: any = {
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
    } else if (/^ip\s+nat\s+(inside|outside)$/i.test(rawInput.trim()) && mem.currentIface && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')) {
      // Cisco: "ip nat inside|outside" (interface view) — tandai arah NAT
      const dir = rawInput.trim().match(/^ip\s+nat\s+(inside|outside)$/i)?.[1]?.toLowerCase();
      if (!mem.natInsideIfaces) mem.natInsideIfaces = [];
      if (!mem.natOutsideIfaces) mem.natOutsideIfaces = [];
      if (dir === 'inside' && !mem.natInsideIfaces.includes(mem.currentIface)) mem.natInsideIfaces.push(mem.currentIface);
      if (dir === 'outside' && !mem.natOutsideIfaces.includes(mem.currentIface)) mem.natOutsideIfaces.push(mem.currentIface);
      cmdResult = { raw: '' };
    } else if (/^ip\s+nat\s+inside\s+source\s+list\s+\d+\s+interface\s+\S+\s+overload/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')) {
      // Cisco: "ip nat inside source list <acl> interface <out-iface> overload" → masquerade
      const m = rawInput.trim().match(/^ip\s+nat\s+inside\s+source\s+list\s+(\d+)\s+interface\s+(\S+)\s+overload/i);
      if (m) {
        const outIface = resolveIfaceName(context?.ports, m[2]) || m[2];
        const acl = (mem.natAcls || {})[m[1]];
        if (!mem.natOutsideIfaces) mem.natOutsideIfaces = [];
        if (!mem.natOutsideIfaces.includes(outIface)) mem.natOutsideIfaces.push(outIface);
        mem.natRules.push({
          chain: 'srcnat',
          action: 'masquerade',
          outInterface: outIface,
          srcAddress: acl?.src && acl.src !== 'any' ? acl.src : '',
        });
        cmdResult = { raw: '' };
      }
    } else if (/^ip\s+nat\s+inside\s+source\s+static\s+tcp\s+\S+\s+\d+\s+\S+\s+\d+/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')) {
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
    } else if (/^show\s+ip\s+nat\s+translations/i.test(rawInput.trim()) || /^show\s+ip\s+nat\s+statistics/i.test(rawInput.trim())) {
      cmdResult = { type: 'nat_print', rules: mem.natRules };
    } else if (/^router\s+(ospf|rip|eigrp)\b/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')) {
      // Cisco: "router ospf 1" / "router rip" / "router eigrp 100"
      const proto = rawInput.trim().match(/^router\s+(ospf|rip|eigrp)\b/i)?.[1]?.toLowerCase() as 'ospf' | 'rip' | 'eigrp';
      const asn = rawInput.trim().match(/\b(eigrp|ospf)\s+(\d+)/i)?.[2];
      mem.routing[proto].enabled = true;
      if (proto === 'eigrp' && asn) mem.routing.eigrp.asn = parseInt(asn, 10);
      mem.currentProto = proto;
      mem.currentDhcpPool = '';
      cmdResult = { raw: '' };
    } else if (/^network\s+(\d+\.\d+\.\d+\.\d+)\s+mask\s+(\d+\.\d+\.\d+\.\d+)$/i.test(rawInput.trim()) && mem.currentProto === 'bgp' && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')) {
      // Cisco BGP: "network 10.0.0.0 mask 255.255.255.0" (router bgp <asn> mode)
      const m = rawInput.trim().match(/^network\s+(\d+\.\d+\.\d+\.\d+)\s+mask\s+(\d+\.\d+\.\d+\.\d+)$/i);
      if (m) {
        if (!mem.bgp.networks) mem.bgp.networks = [];
        const entry = `${m[1]} ${m[2]}`;
        if (!mem.bgp.networks.includes(entry)) mem.bgp.networks.push(entry);
        cmdResult = { raw: '' };
      }
    } else if (/^network\s+(\d+\.\d+\.\d+\.\d+)(?:\s+(\d+\.\d+\.\d+\.\d+))?(?:\s+area\s+\S+)?$/i.test(rawInput.trim()) && mem.currentProto && mem.currentProto !== 'bgp' && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba' || vendorId === 'huawei')) {
      // Cisco/Huawei: "network 10.0.0.0 0.0.0.255 area 0" / "network 192.168.0.0" (RIP)
      const m = rawInput.trim().match(/^network\s+(\d+\.\d+\.\d+\.\d+)(?:\s+(\d+\.\d+\.\d+\.\d+))?/i);
      if (m) {
        const net = m[2] ? `${m[1]} ${m[2]}` : m[1];
        if (!mem.routing[mem.currentProto].networks.includes(net)) {
          mem.routing[mem.currentProto].networks.push(net);
        }
        cmdResult = { raw: '' };
      }
    } else if (/^(ospf|rip)\b/i.test(rawInput.trim()) && vendorId === 'huawei') {
      // Huawei: "ospf 1" / "rip" (system view) → masuk mode protocol
      const proto = rawInput.trim().match(/^(ospf|rip)\b/i)?.[1]?.toLowerCase() as 'ospf' | 'rip';
      mem.routing[proto].enabled = true;
      mem.currentProto = proto;
      mem.currentDhcpPool = '';
      cmdResult = { raw: '' };
    } else if (/^\/routing\s+(ospf|rip)\s+(instance|network)\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik') {
      // MikroTik: "/routing ospf instance add name=x router-id=1.1.1.1" / "/routing ospf network add network=10.0.0.0/24 area=0"
      const raw = rawInput.trim();
      const m = raw.match(/^\/routing\s+(ospf|rip)\s+(instance|network)\s+add\s+/i);
      const proto = m![1].toLowerCase() as 'ospf' | 'rip';
      const kind = m![2].toLowerCase();
      if (kind === 'instance') {
        mem.routing[proto].enabled = true;
        mem.currentDhcpPool = '';
        cmdResult = { raw: '' };
      } else {
        const net = raw.match(/network=(\S+)/i)?.[1];
        if (net) {
          if (!mem.routing[proto].networks.includes(net)) mem.routing[proto].networks.push(net);
          cmdResult = { raw: '' };
        } else {
          cmdResult = { raw: `% Usage: /routing ${proto} network add network=<jaringan/prefix>` };
        }
      }
    } else if (/^\/routing\s+bgp\s+network\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik') {
      const net = rawInput.trim().match(/network=(\S+)/i)?.[1];
      if (net) {
        if (!mem.bgp.networks) mem.bgp.networks = [];
        if (!mem.bgp.networks.includes(net)) mem.bgp.networks.push(net);
        cmdResult = { raw: '' };
      } else {
        cmdResult = { raw: '% Usage: /routing bgp network add network=<jaringan/prefix>' };
      }
    } else if (/^spanning-tree\s+mode\s+(\S+)/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')) {
      // Cisco: "spanning-tree mode rstp|pvst|rapid-pvst|mst"
      const mode = (rawInput.trim().match(/^spanning-tree\s+mode\s+(\S+)/i)?.[1] || 'rstp').toLowerCase();
      mem.stp = mem.stp || { enabled: true, priority: 32768, mode: 'rstp' };
      mem.stp.enabled = true;
      mem.stp.mode = ['pvst', 'rapid-pvst', 'mst', 'stp', 'rstp'].includes(mode) ? mode : 'rstp';
      cmdResult = { raw: '' };
    } else if (/^no\s+spanning-tree/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')) {
      // Cisco: "no spanning-tree" → matikan STP
      mem.stp = mem.stp || { enabled: true, priority: 32768, mode: 'rstp' };
      mem.stp.enabled = false;
      cmdResult = { raw: '' };
    } else if (/^spanning-tree\s+vlan\s+\d+\s+priority\s+\d+/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')) {
      // Cisco: "spanning-tree vlan 1 priority 4096"
      const m = rawInput.trim().match(/^spanning-tree\s+vlan\s+\d+\s+priority\s+(\d+)/i);
      mem.stp = mem.stp || { enabled: true, priority: 32768, mode: 'rstp' };
      mem.stp.priority = m ? parseInt(m[1], 10) : 32768;
      mem.stp.enabled = true;
      cmdResult = { raw: '' };
    } else if (/^spanning-tree\b/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')) {
      // Cisco: "spanning-tree portfast"/"spanning-tree uplinkfast" → diterima (simplifikasi)
      cmdResult = { raw: '' };
    } else if (/^\/interface\s+bridge\s+set\s+\S+\s+protocol-mode=(\S+)/i.test(rawInput.trim()) && vendorId === 'mikrotik') {
      // MikroTik: "/interface bridge set bridge1 protocol-mode=rstp|stp|none"
      const pm = (rawInput.trim().match(/protocol-mode=(\S+)/i)?.[1] || 'rstp').toLowerCase();
      mem.stp = mem.stp || { enabled: true, priority: 32768, mode: 'rstp' };
      mem.stp.enabled = pm !== 'none';
      mem.stp.mode = pm === 'stp' ? 'stp' : pm === 'mstp' ? 'mst' : 'rstp';
      cmdResult = { raw: '' };
    } else if (/^\/interface\s+bridge\s+print/i.test(rawInput.trim()) && vendorId === 'mikrotik') {
      cmdResult = { type: 'bridge_print', stp: mem.stp };
    } else if (/^set\s+protocols\s+rstp/i.test(rawInput.trim()) && (vendorId === 'juniper' || vendorId === 'vyos' || vendorId === 'ubiquiti')) {
      // Juniper/VyOS: "set protocols rstp" → aktifkan RSTP
      mem.stp = mem.stp || { enabled: true, priority: 32768, mode: 'rstp' };
      mem.stp.enabled = true;
      mem.stp.mode = 'rstp';
      cmdResult = { raw: '' };
    } else if (/^delete\s+protocols\s+rstp/i.test(rawInput.trim()) && (vendorId === 'juniper' || vendorId === 'vyos' || vendorId === 'ubiquiti')) {
      mem.stp = mem.stp || { enabled: true, priority: 32768, mode: 'rstp' };
      mem.stp.enabled = false;
      cmdResult = { raw: '' };
    } else if (/^stp\s+mode\s+(\S+)/i.test(rawInput.trim()) && vendorId === 'huawei') {
      // Huawei: "stp mode rstp" (system view)
      const mode = (rawInput.trim().match(/^stp\s+mode\s+(\S+)/i)?.[1] || 'rstp').toLowerCase();
      mem.stp = mem.stp || { enabled: true, priority: 32768, mode: 'rstp' };
      mem.stp.enabled = true;
      mem.stp.mode = ['stp', 'mst', 'rstp'].includes(mode) ? mode : 'rstp';
      cmdResult = { raw: '' };
    } else if (/^set\s+protocols\s+(ospf|rip)\b/i.test(rawInput.trim()) && (vendorId === 'juniper' || vendorId === 'vyos' || vendorId === 'ubiquiti')) {
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
        mem.routing.ospf.interfaceCosts[resolveIfaceName(context?.ports, cm[1]) || cm[1]] = parseInt(cm[2], 10);
      }
      cmdResult = { raw: '' };
    } else if (/^switchport\s+(mode\s+access|access\s+vlan\s+\d+)$/i.test(rawInput.trim()) && mem.currentIface && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')) {
      // Cisco switch: "switchport mode access" / "switchport access vlan 10"
      const vlan = rawInput.trim().match(/access\s+vlan\s+(\d+)/i)?.[1];
      if (vlan) mem.portVlans[mem.currentIface] = parseInt(vlan, 10);
      if (rawInput.trim().match(/mode\s+access/i)) {
        mem.trunkPorts = (mem.trunkPorts || []).filter((t: string) => t !== mem.currentIface);
      }
      cmdResult = { raw: '' };
    } else if (/^switchport\s+(mode\s+trunk|trunk\s+allowed\s+vlan)/i.test(rawInput.trim()) && mem.currentIface && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')) {
      // Cisco switch: "switchport mode trunk" — port carries every VLAN
      pushTrunk(mem, mem.currentIface);
      cmdResult = { raw: '' };
    } else if (/^port\s+(link-type\s+access|default\s+vlan\s+\d+)$/i.test(rawInput.trim()) && mem.currentIface && vendorId === 'huawei') {
      // Huawei switch: "port link-type access" / "port default vlan 10"
      const vlan = rawInput.trim().match(/default\s+vlan\s+(\d+)/i)?.[1];
      if (vlan) mem.portVlans[mem.currentIface] = parseInt(vlan, 10);
      if (rawInput.trim().match(/link-type\s+access/i)) {
        mem.trunkPorts = (mem.trunkPorts || []).filter((t: string) => t !== mem.currentIface);
      }
      cmdResult = { raw: '' };
    } else if (/^port\s+(link-type\s+trunk|trunk\s+allow-pass\s+vlan)/i.test(rawInput.trim()) && mem.currentIface && vendorId === 'huawei') {
      // Huawei switch: "port link-type trunk" / "port trunk allow-pass vlan 10 20"
      pushTrunk(mem, mem.currentIface);
      cmdResult = { raw: '' };
    } else if (/^\/interface\s+bridge\s+port\s+add\s+.*interface=(\S+)/i.test(rawInput.trim()) && vendorId === 'mikrotik') {
      // MikroTik: "/interface bridge port add bridge=bridge1 interface=etherX" — bridge port is trunk-like
      const iface = rawInput.trim().match(/interface=(\S+)/i)?.[1];
      if (iface) pushTrunk(mem, resolveIfaceName(context?.ports, iface) || iface);
      cmdResult = { raw: '' };
    } else if (/^\/interface\s+wireless\s+(print|set\s+|security-profiles|registration-table|monitor)/i.test(rawInput.trim()) && vendorId === 'mikrotik') {
      // MikroTik: "/interface wireless set wlan1 ssid=NetLab band=2ghz-b mode=ap-bridge"
      //           "/interface wireless security-profiles add name=p1 wpa2-pre-shared-key=rahasia"
      //           "/interface wireless registration-table print" / monitor
      const raw = rawInput.trim();
      if (/^\/interface\s+wireless\s+security-profiles\s+add\s+/i.test(raw)) {
        const name = raw.match(/name=(\S+)/i)?.[1];
        if (name) {
          if (!mem.wirelessSecurityProfiles) mem.wirelessSecurityProfiles = {};
          mem.wirelessSecurityProfiles[name] = {
            authenticationTypes: raw.match(/authentication-types=(\S+)/i)?.[1] || 'wpa2-psk',
            key: raw.match(/wpa2-pre-shared-key=(\S+)/i)?.[1] || raw.match(/pre-shared-key=(\S+)/i)?.[1] || '',
          };
          cmdResult = { raw: '' };
        } else {
          cmdResult = { raw: '% Usage: /interface wireless security-profiles add name=<profil> authentication-types=wpa2-psk wpa2-pre-shared-key=<kunci>' };
        }
      } else if (/^\/interface\s+wireless\s+registration-table\s+print/i.test(raw)) {
        const info = typeof context.wirelessProvider === 'function' ? context.wirelessProvider() : null;
        cmdResult = { type: 'wireless_reg_print', entries: info && info.associations ? info.associations : [] };
      } else if (/^\/interface\s+wireless\s+monitor\s+/i.test(raw)) {
        const info = typeof context.wirelessProvider === 'function' ? context.wirelessProvider() : null;
        const assoc = info && info.associations ? info.associations : [];
        cmdResult = {
          type: 'wireless_monitor',
          mode: info?.mode || 'ap-bridge',
          ssid: info?.ssid || '(none)',
          signal: assoc.length > 0 ? assoc[0].signal : -100,
          stationCount: assoc.length,
        };
      } else if (/^\/interface\s+wireless\s+set\s+/i.test(raw)) {
        const iface = raw.match(/set\s+(\S+)/i)?.[1];
        if (iface) {
          if (!mem.wireless) mem.wireless = {};
          const w = { ...(mem.wireless[iface] || {}) };
          const ssid = raw.match(/ssid=(\S+)/i)?.[1];
          const band = raw.match(/band=(\S+)/i)?.[1];
          const mode = raw.match(/mode=(\S+)/i)?.[1];
          const secProf = raw.match(/security-profile=(\S+)/i)?.[1];
          const security = raw.match(/security=(\S+)/i)?.[1];
          const key = raw.match(/key=(\S+)/i)?.[1];
          if (ssid) w.ssid = ssid;
          if (band) w.band = band;
          if (mode) w.mode = mode;
          if (secProf) w.securityProfile = secProf;
          if (security) w.security = security;
          if (key) w.key = key;
          mem.wireless[iface] = w;
          cmdResult = { raw: '' };
        } else {
          cmdResult = { raw: '% Usage: /interface wireless set <interface> ssid=<nama>' };
        }
      } else {
        cmdResult = { type: 'wireless_print', wireless: mem.wireless };
      }
    } else if (/^dot11\s+ssid\s+(\S+)/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos')) {
      // Cisco: "dot11 ssid NetLab" → AP SSID (dot11radio0 dipetakan ke wlan1)
      const ssid = rawInput.trim().match(/^dot11\s+ssid\s+(\S+)/i)?.[1];
      if (!mem.wireless) mem.wireless = {};
      mem.wireless['wlan1'] = { ...(mem.wireless['wlan1'] || {}), ssid, mode: 'ap-bridge' };
      mem.currentSsid = ssid;
      cmdResult = { raw: '' };
    } else if (/^wpa-psk\s+ascii\s+\d+\s+(\S+)/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos') && mem.currentSsid) {
      // Cisco: "wpa-psk ascii 0 <kunci>" (dalam mode konfigurasi SSID)
      const key = rawInput.trim().match(/^wpa-psk\s+ascii\s+\d+\s+(\S+)/i)?.[1];
      if (!mem.wirelessSecurityProfiles) mem.wirelessSecurityProfiles = {};
      mem.wirelessSecurityProfiles['default'] = { authenticationTypes: 'wpa2-psk', key };
      const w = mem.wireless['wlan1'] || {};
      mem.wireless['wlan1'] = { ...w, securityProfile: 'default' };
      cmdResult = { raw: '' };
    } else if (/^show\s+dot11\s+associations/i.test(rawInput.trim()) && (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos')) {
      const info = typeof context.wirelessProvider === 'function' ? context.wirelessProvider() : null;
      cmdResult = { type: 'wireless_reg_print', entries: info && info.associations ? info.associations : [] };
    } else if (/^\/queue\s+simple\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik') {
      // MikroTik: "/queue simple add name=q1 target=192.168.1.0/24 max-limit=10M/10M"
      const raw = rawInput.trim();
      const name = raw.match(/name=(\S+)/i)?.[1];
      if (name) {
        if (!mem.queues) mem.queues = [];
        mem.queues.push({
          name,
          target: raw.match(/target=(\S+)/i)?.[1] || '',
          maxLimit: raw.match(/max-limit=(\S+)/i)?.[1] || '',
        });
        cmdResult = { raw: '' };
      } else {
        cmdResult = { raw: '% Usage: /queue simple add name=<nama> target=<jaringan> max-limit=<limit>' };
      }
    } else if (/^\/queue\s+simple\s+print/i.test(rawInput.trim()) || (normalized.target === 'queue_simple' && normalized.action === 'print')) {
      const live = typeof context.qosProvider === 'function' ? context.qosProvider() : [];
      cmdResult = { type: 'queue_print', queues: mem.queues, live };
    } else if (/^\/ip\s+firewall\s+mangle\s+add\s+/i.test(rawInput.trim()) && vendorId === 'mikrotik') {
      // MikroTik: "/ip firewall mangle add chain=prerouting protocol=icmp action=mark-packet new-packet-mark=voice"
      const raw = rawInput.trim();
      if (!mem.mangleRules) mem.mangleRules = [];
      mem.mangleRules.push({
        chain: raw.match(/chain=(\S+)/i)?.[1] || 'prerouting',
        protocol: raw.match(/protocol=(\S+)/i)?.[1] || '',
        srcAddress: raw.match(/src-address=(\S+)/i)?.[1] || '',
        dstAddress: raw.match(/dst-address=(\S+)/i)?.[1] || '',
        action: raw.match(/action=(\S+)/i)?.[1] || 'mark-packet',
        newPacketMark: raw.match(/new-packet-mark=(\S+)/i)?.[1] || '',
        packetMark: raw.match(/packet-mark=(\S+)/i)?.[1] || '',
        newMss: raw.match(/new-mss=(\S+)/i)?.[1] || '',
      });
      cmdResult = { raw: '' };
    } else if (/^\/ip\s+firewall\s+mangle\s+print/i.test(rawInput.trim()) || (normalized.target === 'ip_firewall_mangle' && normalized.action === 'print')) {
      cmdResult = { type: 'mangle_print', rules: mem.mangleRules };
    } else if (/^\/routing\s+(ospf|rip|bgp)\s+(instance|network)?\s*(print)?/i.test(rawInput.trim()) && vendorId === 'mikrotik' && /print/i.test(rawInput.trim())) {
      cmdResult = { type: 'proto_print', routing: mem.routing, bgp: mem.bgp };
    } else if (/^show\s+ip\s+protocols/i.test(rawInput.trim())) {
      cmdResult = { type: 'proto_print', routing: mem.routing, bgp: mem.bgp };
    } else if (normalized.action === 'set_config') {
      // Juniper / EdgeOS / VyOS: "set interfaces <if> ... address <ip/mask>" or static routes
      const path = ((normalized.payload as any)?.path || []).map(String).map(s => s.toLowerCase());
      const intIdx = path.indexOf('interfaces');
      if (intIdx >= 0 && path.length > intIdx + 1) {
        let iface = path[intIdx + 1];
        if (iface === 'ethernet') iface = path[intIdx + 2]; // vyos/edgeos: set interfaces ethernet eth0 address ...
        const addrIdx = path.lastIndexOf('address');
        const ip = addrIdx >= 0 ? path[addrIdx + 1] : undefined;
        if (ip) {
          mem.configuredIps[resolveIfaceName(context?.ports, iface)] = ip;
          cmdResult = { raw: '' };
        } else {
          cmdResult = { raw: '% Usage: set interfaces <iface> unit 0 family inet address <ip/mask>' };
        }
      } else if (path.includes('routing-options') && path.includes('static')) {
        // Juniper: set routing-options static route <dst> next-hop <gw>
        const ri = path.indexOf('route');
        const ni = path.indexOf('next-hop');
        const dst = ri >= 0 ? path[ri + 1] : undefined;
        const gw = ni >= 0 ? path[ni + 1] : undefined;
        if (dst && gw) {
          mem.routes.push({ dst, gateway: gw, distance: 1 });
          cmdResult = { raw: '' };
        } else {
          cmdResult = { raw: '% Usage: set routing-options static route <dst> next-hop <gw>' };
        }
      } else if (path.includes('protocols') && path.includes('static')) {
        // VyOS: set protocols static route <dst> next-hop <gw>
        const ri = path.indexOf('route');
        const ni = path.indexOf('next-hop');
        const dst = ri >= 0 ? path[ri + 1] : undefined;
        const gw = ni >= 0 ? path[ni + 1] : undefined;
        if (dst && gw) {
          mem.routes.push({ dst, gateway: gw, distance: 1 });
          cmdResult = { raw: '' };
        } else {
          cmdResult = { raw: '% Usage: set protocols static route <dst> next-hop <gw>' };
        }
      } else {
        cmdResult = { raw: '% Unknown "set" path' };
      }
    } else if (normalized.action === 'add_ip') {
      const { ip, iface, mask } = normalized.payload as any;
      const ifaceName = resolveIfaceName(context?.ports, iface || mem.currentIface);
      if (ip && ifaceName) {
        mem.configuredIps[ifaceName] = mask ? `${ip} ${mask}` : ip;
        cmdResult = { raw: '' };
      } else {
        cmdResult = { raw: '% Error: missing address or interface parameter' };
      }
    } else if (normalized.action === 'add_route') {
      const { dst, gw } = normalized.payload as any;
      if (dst && gw) {
        mem.routes.push({ dst, gateway: gw, distance: 1 });
        cmdResult = { raw: '' };
      } else {
        cmdResult = { raw: '% Error: missing dst-address or gateway' };
      }
    } else if (normalized.action === 'bgp_instance_add' || normalized.action === 'bgp_router') {
      const { as, routerId } = normalized.payload as any;
      if (as) mem.bgp.asn = parseInt(String(as), 10);
      if (routerId) mem.bgp.routerId = routerId;
      mem.currentProto = 'bgp';
      mem.currentDhcpPool = '';
      cmdResult = { raw: '' };
    } else if (normalized.action === 'bgp_peer_add') {
      const { remoteAs, remoteAddr, name } = normalized.payload as any;
      if (remoteAs && remoteAddr) {
        mem.bgp.peers.push({ remoteAs: parseInt(String(remoteAs), 10), remoteAddr, name: name || remoteAddr });
        cmdResult = { raw: '' };
      } else {
        cmdResult = { raw: '% Error: missing remote-as or remote-address' };
      }
    } else if (normalized.action === 'bgp_neighbor') {
      const { remoteAs, ip } = normalized.payload as any;
      if (remoteAs && ip) {
        mem.bgp.peers.push({ remoteAs: parseInt(String(remoteAs), 10), remoteAddr: ip, name: ip });
        cmdResult = { raw: '' };
      } else {
        cmdResult = { raw: '% Incomplete command' };
      }
    } else if (normalized.action === 'bgp_peer_print') {
      cmdResult = { type: 'bgp_peer_print', peers: mem.bgp.peers };
    } else if (normalized.action === 'show_bgp_summary') {
      const states = typeof context.bgpNeighborProvider === 'function' ? context.bgpNeighborProvider() : [];
      const peers = mem.bgp.peers.map((p: any) => {
        const s = states.find((x: any) => x.remoteAddr === p.remoteAddr);
        return { ...p, state: s?.state || 'Idle', prefixes: s?.prefixes ?? 0, uptime: s?.uptime || 'never' };
      });
      cmdResult = { type: 'show_bgp_summary', peers, asn: mem.bgp.asn, routerId: mem.bgp.routerId || mem.configuredIps[Object.keys(mem.configuredIps)[0]] };
    } else if (normalized.action === 'show_cdp_neighbors' || normalized.action === 'show_lldp_neighbors') {
      const proto = normalized.action === 'show_cdp_neighbors' ? 'cdp' : 'lldp';
      cmdResult = { type: 'neighbor_print', proto, neighbors: typeof context.neighborProvider === 'function' ? context.neighborProvider(proto) : [] };
    } else if (normalized.action === 'show_ospf_neighbor' || normalized.action === 'display_ospf_peer') {
      cmdResult = { type: 'ospf_neighbor_print', neighbors: typeof context.ospfNeighborProvider === 'function' ? context.ospfNeighborProvider() : [] };
    } else if (normalized.action === 'ip_neighbor_print' || (normalized.target === 'ip_neighbor' && normalized.action === 'print')) {
      cmdResult = { type: 'neighbor_print', proto: 'lldp', neighbors: typeof context.neighborProvider === 'function' ? context.neighborProvider('lldp') : [] };
    } else if (normalized.action === 'netstat' || normalized.action === 'ss' || normalized.action === 'show_tcp_brief') {
      cmdResult = { type: 'tcp_print', connections: typeof context.tcpProvider === 'function' ? context.tcpProvider() : [] };
    } else if (normalized.action === 'ip_neigh') {
      cmdResult = { type: 'ip_neigh', entries: typeof context.arpProvider === 'function' ? context.arpProvider() : [] };
    } else if (
      normalized.action === 'ip_address_print' ||
      (normalized.target === 'ip_address' && normalized.action === 'print')
    ) {
      const ports = mergeIps(context?.ports, mem.configuredIps);
      cmdResult = { type: 'ip_address_print', ports };
    } else if (
      normalized.action === 'interface_print' ||
      (normalized.action === 'print' && normalized.target === 'interface')
    ) {
      // MikroTik "/interface print" — daftar interface dengan status & IP.
      const ports = mergeIps(context?.ports, mem.configuredIps);
      cmdResult = { type: 'interface_print', ifaces: ports, shutdownIfaces: mem.shutdownIfaces || [] };
    } else if (normalized.action === 'show_int_status') {
      // NX-OS "show interface status" — kolom status per port.
      const ports = mergeIps(context?.ports, mem.configuredIps);
      cmdResult = {
        type: 'int_status',
        ifaces: ports,
        shutdownIfaces: mem.shutdownIfaces || [],
      };
    } else if (normalized.action === 'show_ip_int_brief' || normalized.action === 'show_int_brief' || normalized.action === 'show_ip_int' || normalized.action === 'display_ip_int' || normalized.action === 'get_system_interface' || normalized.action === 'show_interfaces_terse' || normalized.action === 'show_interfaces' || normalized.action === 'ifconfig' || normalized.action === 'ip_addr') {
      const ports = mergeIps(context?.ports, mem.configuredIps);
      cmdResult = { type: normalized.action, ports, shutdownIfaces: mem.shutdownIfaces || [] };
    } else if (normalized.action === 'show_ip_route' || normalized.action === 'show_route' || normalized.action === 'display_routing' || normalized.action === 'ip_route' || (normalized.target === 'ip_route' && normalized.action === 'print')) {
      const dynamicRoutes = typeof context.routeProvider === 'function' ? context.routeProvider() : [];
      const connectedRoutes = (mergeIps(context?.ports, mem.configuredIps) || [])
        .filter((p: any) => p.ipAddress)
        .map((p: any) => ({ dst: p.ipAddress, iface: p.name, gateway: '', prefSrc: p.ipAddress?.split('/')[0], kind: 'connected' }));
      const staticRoutes = mem.routes.map((r: any) => ({ dst: r.dst, iface: '', gateway: r.gateway || '', prefSrc: '', kind: 'static' }));
      const dynamic = dynamicRoutes
        .filter((r: any) => r.kind === 'dynamic')
        .map((r: any) => ({ dst: r.dst, iface: r.iface || '', gateway: r.gateway || '', prefSrc: '', kind: 'dynamic' }));
      cmdResult = { type: normalized.target === 'ip_route' && normalized.action === 'print' ? 'ip_route_print' : normalized.action, routes: [...connectedRoutes, ...staticRoutes, ...dynamic] };
    } else if (normalized.action === 'ping' || (normalized.target === 'tool' && (normalized.payload as any)?.ast?.subCommands?.[0]?.toLowerCase() === 'ping')) {
      const ast = (normalized.payload as any)?.ast;
      const host = (normalized.payload as any).host || ast?.subCommands?.[1] || ast?.subCommands?.[0] || '';
      cmdResult = { type: 'ping', host, target: host };
    } else if (normalized.action === 'traceroute' || normalized.action === 'tracert' || (normalized.target === 'tool' && (normalized.payload as any)?.ast?.subCommands?.[0]?.toLowerCase() === 'traceroute')) {
      const host = rawInput.trim().split(/\s+/).pop() || '';
      cmdResult = { type: 'traceroute', host, target: host };
    } else if (normalized.action === 'nslookup' && (vendorId === 'linux' || vendorId === 'openwrt')) {
      // Linux: "nslookup <domain>" — resolves via the engine's DNS (static
      // records on the configured DNS servers), falls back to the old fake
      // resolver when no engine callback is wired up.
      const host = (normalized.payload as any)?.host || rawInput.trim().split(/\s+/).pop() || '';
      if (typeof context.dnsResolver === 'function') {
        const r = context.dnsResolver(host);
        cmdResult = { type: 'nslookup', host, server: r.server || '', resolved: r.resolved, timedOut: !!r.timedOut, nxdomain: !!r.nxdomain };
      } else {
        const servers = mem.dnsServers || [];
        if (servers.length === 0) {
          cmdResult = { type: 'nslookup', host, server: '', resolved: null, timedOut: true };
        } else {
          cmdResult = { type: 'nslookup', host, server: servers[0], resolved: fakeDnsIp(host), timedOut: false };
        }
      }
    } else if (normalized.action === 'http_get' && (vendorId === 'linux' || vendorId === 'openwrt')) {
      // Linux: "curl http://192.168.1.10" / "curl <ip>" — checks real connectivity
      let url = (normalized.payload as any)?.url || rawInput.trim().split(/\s+/).pop() || '';
      url = url.replace(/^["']|["']$/g, '');
      const m = url.match(/^https?:\/\/([^/:]+)(?::(\d+))?/i) || url.match(/^(\d+\.\d+\.\d+\.\d+)(?::(\d+))?/);
      const host = m ? m[1] : '';
      const port = m?.[2] ? parseInt(m[2], 10) : 80;
      cmdResult = { type: 'http_get', host, port };
    } else if (normalized.action === 'show_version' || normalized.action === 'display_version' || normalized.action === 'resource' || normalized.action === 'version' || (normalized.target === 'system_resource' && normalized.action === 'print')) {
      cmdResult = { type: 'show_version', model: mem.modelLabel, hostname: mem.hostname || context?.name };
    } else if (normalized.action === 'configure_terminal' || normalized.action === 'configure' || normalized.action === 'system_view') {
      cmdResult = { type: normalized.action };
    } else if (normalized.action === 'enable') {
      cmdResult = { type: 'enable' };
    } else if (vendorId === 'juniper' && normalized.action === 'commit') {
      // Junos "commit suggest"/"commit check" hanya validasi — tidak menyimpan snapshot.
      const checkOnly = /^commit\s+(?:check|suggest)/i.test(rawInput.trim());
      const current = this.juniperSnapshot(mem);
      const prev = mem.juniperCommitted;
      if (checkOnly) {
        cmdResult = { type: 'commit_check' };
      } else if (prev && JSON.stringify(prev) === JSON.stringify(current)) {
        cmdResult = { raw: 'warning: no configuration change, commit aborted' };
      } else {
        mem.juniperCommitted = current;
        cmdResult = { type: 'commit' };
      }
    } else if (vendorId === 'vyos' || vendorId === 'ubiquiti') {
      if (normalized.action === 'commit') {
        // VyOS/EdgeOS "commit" — aktifkan kandidat (snapshot untuk rollback).
        const current = this.juniperSnapshot(mem);
        mem.juniperCommitted = current;
        cmdResult = { type: 'commit' };
      } else if (normalized.action === 'rollback') {
        const snap = mem.juniperCommitted;
        cmdResult = snap
          ? { raw: 'configuration rolled back' }
          : { raw: 'error: no configuration to roll back' };
        if (snap) this.restoreJuniper(mem, snap);
      } else {
        cmdResult = { type: 'commit' };
      }
    } else if (normalized.action === 'commit') {
      cmdResult = { type: 'commit' };
    } else if (normalized.action === 'rollback') {
      // Vendor lain tidak punya snapshot — jangan pernah pura-pura sukses.
      cmdResult = { raw: 'error: no configuration to roll back' };
    } else if (normalized.action === 'write_mem' || normalized.action === 'save') {
      this.saveStartupConfig(nodeId);
      cmdResult = { type: normalized.action };
    } else if (normalized.action === 'show_vlan' || (normalized.target === 'interface_vlan' && normalized.action === 'print')) {
      cmdResult = { type: 'show_vlan', vlans: mem.vlans };
    } else if (normalized.action === 'show_stp') {
      const info = typeof context.stpProvider === 'function' ? context.stpProvider() : null;
      cmdResult = info && info.enabled !== undefined
        ? { type: 'show_stp', enabled: info.enabled, mode: info.mode, priority: info.priority, rootId: info.rootId, rootName: info.rootName, bridgeId: info.bridgeId, rootPort: info.rootPort, ports: info.ports }
        : { type: 'show_stp' };
    } else if (normalized.action === 'get_system_status') {
      cmdResult = { type: 'get_system_status', model: mem.modelLabel, hostname: mem.hostname || context?.name };
    } else if (normalized.action === 'show_firewall_policy') {
      cmdResult = { type: 'show_firewall_policy' };
    } else if (normalized.action === 'dhcp_print' || normalized.action === 'show_ip_dhcp_pool' || (normalized.target === 'ip_dhcp-server' && normalized.action === 'print')) {
      cmdResult = { type: 'dhcp_print', pools: mem.dhcpPools };
    } else if (normalized.action === 'dns_print' || normalized.action === 'show_hosts' || (normalized.target === 'ip_dns' && normalized.action === 'print')) {
      cmdResult = { type: 'dns_print', servers: mem.dnsServers };
    } else if (normalized.action === 'nat_print' || (normalized.target === 'ip_firewall_nat' && normalized.action === 'print')) {
      cmdResult = { type: 'nat_print', rules: mem.natRules };
    } else if ((normalized.target === 'ip_dns_static' && normalized.action === 'print') || normalized.action === 'dns_static_print') {
      cmdResult = { type: 'dns_static_print', records: mem.dnsRecords };
    } else if (normalized.target === 'ip_service' && normalized.action === 'print') {
      cmdResult = { type: 'service_print', web: mem.webServer };
    } else if (normalized.action === 'vlan_print' || normalized.action === 'interface_vlan_print' || (normalized.action === 'print' && normalized.target === 'vlan')) {
      cmdResult = { type: 'vlan_print', vlans: mem.vlans };
    } else if (normalized.action === 'identity_print' || normalized.action === 'hostname_print' || normalized.action === 'show_hostname' || normalized.action === 'hostname' || (normalized.target === 'system_identity' && normalized.action === 'print')) {
      cmdResult = { type: 'identity_print', name: mem.hostname || context?.name || vendorId };
    } else if (normalized.action === 'uci_show') {
      cmdResult = { type: 'uci_show' };
    } else if (normalized.action === 'logread') {
      cmdResult = { type: 'logread' };
    } else if (normalized.action === 'show_running' || normalized.action === 'display_current' || normalized.action === 'export') {
      cmdResult = { raw: generateRunningConfig(context, mem, vendorId) };
    } else if (normalized.action === 'identity_print') {
      cmdResult = { type: 'identity_print', name: context?.name || vendorId };
    } else if (normalized.action === 'uname' && vendorId === 'linux') {
      cmdResult = { type: 'uname' };
    } else if (normalized.action === 'cat_file' && vendorId === 'linux') {
      cmdResult = { type: 'cat_file', path: (normalized.payload as any)?.path || '' };
    } else if (normalized.action === 'cat_file' && vendorId === 'openwrt') {
      const path = (normalized.payload as any)?.path || '';
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
    }

    if (cmdResult === undefined) {
      cmdResult = { raw: this.unknownCommand(vendorId, rawInput) };
    }

    let response = adapter.formatResponse(cmdResult);

    // Real simulation hook: when a ping simulator is supplied by the host app,
    // replace the hardcoded echo-reply output with genuine simulated results.
    if (
      cmdResult?.type === 'ping' &&
      typeof context.pingSimulator === 'function'
    ) {
      response = context.pingSimulator(cmdResult.host || '', vendorId);
    }
    if (
      cmdResult?.type === 'traceroute' &&
      typeof context.tracerouteSimulator === 'function'
    ) {
      response = context.tracerouteSimulator(cmdResult.host || '', vendorId);
    }
    if (
      cmdResult?.type === 'http_get' &&
      typeof context.connectivitySimulator === 'function'
    ) {
      response = context.connectivitySimulator(cmdResult.host || '', vendorId, cmdResult.port || 80);
    }

    return response;
  }
}

// ============================================================
// Vendor-specific command engines (dipanggil paling awal dari dispatch)
// Setiap fungsi mengembalikan cmdResult ketika perintah dikenali,
// atau undefined agar ditangani oleh engine generik di bawahnya.
// ============================================================

/**
 * Fortinet FortiOS — mode konfigurasi "config <section> / edit <n> / set <k> <v> / end".
 * Mendukung: DHCP server (+ip-range), VLAN (interface vlanid), OSPF, BGP,
 * firewall policy (NAT masquerade & ACL), firewall vip (port-forward),
 * firewall address, DNS system, static route (via engine generik).
 */
// ============================================================
// SNMP — konfigurasi agent per vendor + query snmpget/walk/set.
// State disimpan di mem.snmp, hasil query real dari engine via
// context.snmpQueryProvider (udp/161, ARP + routing).
// ============================================================
function snmpCommand(raw: string, vendorId: string, mem: any, context: any): any {
  const t = raw.trim();
  let m: RegExpMatchArray | null;

  // ── Query tools (Linux / OpenWrt) ──────────────────────────────
  if ((vendorId === 'linux' || vendorId === 'openwrt') && context && typeof context.snmpQueryProvider === 'function') {
    const q = matchSnmpQuery(t);
    if (q) {
      const host = q.host;
      const community = q.community || 'public';
      const oid = String(q.oid || '.1.3.6.1.2.1.1.1.0');
      const opts = { walk: q.walk, setValue: q.value };
      const res = context.snmpQueryProvider(host, community, oid, opts);
      return { type: 'snmp_query', result: res, host, oid, community, tool: q.tool, numeric: q.numeric, setValue: q.value };
    }
  }

  // ── MikroTik: /snmp set enabled=yes community=public / /snmp print ──
  if (vendorId === 'mikrotik' && /^\/snmp/i.test(t)) {
    if (/\/snmp\s+print/i.test(t) || /^\/snmp\s*$/i.test(t)) return { type: 'snmp_print', snmp: mem.snmp };
    if (/^\/snmp\s+set/i.test(t)) {
      const ok = setSnmpPairs(t, mem);
      return ok ? { type: 'snmp_ok' } : { raw: '% Usage: /snmp set enabled=yes community=<community>' };
    }
    return undefined;
  }

  // ── Cisco IOS / NX-OS / Aruba / Huawei ios-style ───────────────
  if ((vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba' || vendorId === 'huawei') && /^snmp[- ](agent|server)/i.test(t) && vendorId !== 'huawei') {
    m = t.match(/^snmp[- ]server\s+community\s+(\S+)\s+(ro|rw|read[-\s]?only|read[-\s]?write)/i) ||
        t.match(/^snmp[- ]server\s+community\s+(\S+)\s*$/i);
    if (m) {
      const comm = m[1];
      const right = (m[2] || 'ro').toLowerCase();
      mem.snmp.enabled = true;
      mem.snmp.community = comm;
      if (right.includes('rw') || right.includes('write')) mem.snmp.communityRW = comm;
      return { type: 'snmp_print', snmp: mem.snmp };
    }
    return { type: 'snmp_print', snmp: mem.snmp };
  }
  // Huawei VRP
  if (vendorId === 'huawei' && /^snmp[- ]?agent/i.test(t)) {
    m = t.match(/^snmp[- ]?agent\s+community\s+(read|write)\s+(\S+)/i) ||
        t.match(/^snmp[- ]agent\s+sys[- ]?info\s+(contact|location)\s+(.+)/i);
    if (m) {
      if (m[1].toLowerCase() === 'read') {
        mem.snmp.enabled = true;
        mem.snmp.community = m[2];
      } else if (m[1].toLowerCase() === 'write') {
        mem.snmp.enabled = true;
        mem.snmp.communityRW = m[2];
      } else {
        mem.snmp[m[1].toLowerCase()] = m[2];
      }
      return { type: 'snmp_print', snmp: mem.snmp };
    }
    if (/^snmp[- ]?agent\s*$/i.test(t)) {
      mem.snmp.enabled = true;
      return { type: 'snmp_print', snmp: mem.snmp };
    }
  }

  // ── Juniper: set snmp ... ──────────────────────────────────────
  if ((vendorId === 'juniper' || vendorId === 'vyos' || vendorId === 'ubiquiti') && t.toLowerCase().includes(' snmp')) {
    if (/^set\s+snmp\s*$/i.test(t)) {
      mem.snmp.enabled = true;
      return { type: 'snmp_print', snmp: mem.snmp };
    }
    if (/^set\s+snmp\s+community\s+(\S+)\s+authorization\s+(read-only|read-write)/i.test(t)) {
      m = t.match(/^set\s+snmp\s+community\s+(\S+)\s+authorization\s+(read-only|read-write)/i);
      if (m) {
        mem.snmp.enabled = true;
        mem.snmp.community = m[1];
        if (m[2].toLowerCase() === 'read-write') mem.snmp.communityRW = m[1];
        return { type: 'snmp_print', snmp: mem.snmp };
      }
    }
    if (/^set\s+snmp\s+community\s+(\S+)/i.test(t)) {
      m = t.match(/^set\s+snmp\s+community\s+(\S+)/i);
      if (m) {
        mem.snmp.enabled = true;
        mem.snmp.community = m[1];
        return { type: 'snmp_print', snmp: mem.snmp };
      }
    }
    if (/^set\s+snmp\s+(contact|location)\s+\"?([^"]+)\"?$/i.test(t)) {
      m = t.match(/^set\s+snmp\s+(contact|location)\s+\"?([^"]+)\"?$/i);
      if (m) {
        mem.snmp.enabled = true;
        mem.snmp[m[1].toLowerCase() === 'contact' ? 'sysContact' : 'sysLocation'] = m[2];
        return { type: 'snmp_print', snmp: mem.snmp };
      }
    }
    if (/^(?:set\s+)?service\s+snmp\s*$/i.test(t)) {
      mem.snmp.enabled = true;
      return { type: 'snmp_print', snmp: mem.snmp };
    }
    if (/^show\s+(configuration\s+)?snmp/i.test(t) || /^run\s+show\s+service\s+snmp/i.test(t) || /^show\s+service\s+snmp/i.test(t)) {
      return { type: 'snmp_print', snmp: mem.snmp };
    }
  }

  // ── VyOS: set service snmp community <c> ... / show service snmp ──
  if ((vendorId === 'vyos' || vendorId === 'ubiquiti') && /^set\s+service\s+snmp/i.test(t)) {
    m = t.match(/^set\s+service\s+snmp\s+community\s+(\S+)\s*(authorization\s+(read-only|read-write))?/i);
    if (m) mem.snmp.community = m[1];
    if (m && m[3] && /write/.test(m[3])) mem.snmp.communityRW = m[1];
    if (m) mem.snmp.enabled = true;
    m = t.match(/^set\s+service\s+snmp\s+(contact|location)\s+(.+)/i);
    if (m) mem.snmp[m[1].toLowerCase() === 'contact' ? 'sysContact' : 'sysLocation'] = m[2];
    if (m) mem.snmp.enabled = true;
    return { type: 'snmp_print', snmp: mem.snmp };
  }
  if ((vendorId === 'vyos' || vendorId === 'ubiquiti') && /^show\s+service\s+snmp/i.test(t)) {
    return { type: 'snmp_print', snmp: mem.snmp };
  }

  // ── OpenWrt: uci snmpd ─────────────────────────────────────────
  if (vendorId === 'openwrt' && /^uci\s+set\s+snmpd/i.test(t)) {
    const v = t.replace(/^uci\s+set\s+snmpd\./, '');
    const eq = v.indexOf('=');
    if (eq > 0) {
      const k = v.slice(0, eq).toLowerCase();
      const val = v.slice(eq + 1);
      if (k === 'community') mem.snmp.community = val;
      else if (k === 'contact') mem.snmp.sysContact = val;
      else if (k === 'location') mem.snmp.sysLocation = val;
      else if (k.endsWith('enabled') || k.endsWith('enable')) mem.snmp.enabled = val === '1' || val === 'yes';
      if (mem.snmp.community) mem.snmp.enabled = true;
    }
    return { raw: '' };
  }
  if (vendorId === 'openwrt' && /^uci\s+commit\s+snmpd/i.test(t)) return { raw: '' };
  if (vendorId === 'openwrt' && /^(uci\s+show\s+snmpd|cat\s+\/etc\/snmp\/snmpd\.conf)/i.test(t)) {
    return { type: 'snmp_print', snmp: mem.snmp };
  }
  if (vendorId === 'openwrt' && /^(\/etc\/init\.d\/snmpd\s+(?:enable|start)|service\s+snmpd\s+(?:start|restart|enable))/i.test(t)) {
    mem.snmp.enabled = true;
    return { raw: '' };
  }

  // ── Linux: /etc/snmp/snmpd.conf + service snmpd ────────────────
  if (vendorId === 'linux') {
    m = t.match(/^echo\s+["']?(\w+(?:ro|rw)community\s+\S+)["']?\s+(>>|>)\s*\/etc\/snmp\/snmpd\.conf/i);
    if (m) {
      const directive = m[1].toLowerCase();
      const comm = m[1].split(/\s+/)[1] || '';
      if (directive.includes('rocommunity')) {
        mem.snmp.enabled = true;
        mem.snmp.community = comm;
      } else if (directive.includes('rwcommunity')) {
        mem.snmp.enabled = true;
        mem.snmp.communityRW = comm;
      }
      return { raw: '' };
    }
    if (/^(service\s+snmpd\s+(start|restart)|systemctl\s+(start|enable|restart)\s+snmpd)/i.test(t)) {
      mem.snmp.enabled = true;
      return { raw: '' };
    }
    if (/^cat\s+\/etc\/snmp\/snmpd\.conf/i.test(t) || /^(service\s+snmpd\s+status|systemctl\s+status\s+snmpd)/i.test(t)) {
      return { type: 'snmp_print', snmp: mem.snmp };
    }
  }

  // ── View SNMP lintas vendor ────────────────────────────────────
  if (/^(show\s+snmp|display\s+snmp[- ]?agent|get\s+system\s+snmp\s+status)/i.test(t)) {
    return { type: 'snmp_print', snmp: mem.snmp };
  }

  return undefined;
}

function setSnmpPairs(t: string, mem: any): boolean {
  const body = t.replace(/^\/snmp\s+set/i, '').trim();
  const pairs = body.split(/\s+/).filter(Boolean);
  let any = false;
  for (const p of pairs) {
    const eq = p.indexOf('=');
    if (eq <= 0) continue;
    const k = p.slice(0, eq).toLowerCase();
    const v = p.slice(eq + 1);
    if (k === 'enabled') {
      mem.snmp.enabled = /^(yes|true|1|enabled|on)$/i.test(v);
    } else if (k === 'community') {
      mem.snmp.community = v;
      mem.snmp.enabled = true;
    } else if (k === 'contact') {
      mem.snmp.sysContact = v;
    } else if (k === 'location') {
      mem.snmp.sysLocation = v;
    } else {
      return false;
    }
    any = true;
  }
  return any;
}

/** Parse perintah query net-snmp: snmpget|snmpwalk|snmpgetnext|snmpset + opsi. */
function matchSnmpQuery(t: string): {
  tool: string;
  host: string;
  community: string;
  oid: string;
  walk: boolean;
  numeric: boolean;
  value?: string;
} | null {
  const head = /^(snmpget|snmpgetnext|snmpwalk|snmpset)\b/i.exec(t);
  if (!head) return null;
  const tool = head[1].toLowerCase();
  const rest = t.slice(head[0].length);
  let community = 'public';
  let numeric = false;
  const cleaned = rest.replace(/-c\s+("([^"]*)"|\S+)/i, (_m, _x, quoted) => {
    community = (quoted !== undefined ? quoted : _m.split(/\s+/)[1] || 'public').replace(/"/g, '');
    return '';
  });
  const tokens = (cleaned.match(/"([^"]*)"|\S+/g) || []).map((tk) => tk.replace(/^"|"$/g, ''));
  const args = tokens.filter((tk) => {
    if (!tk.startsWith('-')) return true;
    if (tk.includes('n') || tk.includes('v')) numeric = true;
    return false;
  });
  const host = args[0] || '';
  if (!host) return null;
  const oid = args[1] || '.1.3.6.1.2.1.1.1.0';
  const value = tool === 'snmpset' ? args.slice(2).join(' ') : undefined;
  return { tool, host, community, oid, walk: tool === 'snmpwalk' || tool === 'snmpgetnext', numeric, value };
}

function fortinetCommand(raw: string, context: any, mem: any): any {
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
      let p = mem.dhcpPools.find((x: any) => x.idx === mem.fortiDhcpIdx);
      if (!p) {
        p = { idx: mem.fortiDhcpIdx, name: `dhcp${mem.fortiDhcpIdx}`, range: '', network: '', iface: '', gateway: '' };
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
        finalizeFortiPool(pool);
        return { raw: '' };
      }
      m = t.match(/^set\s+end-ip\s+(\S+)/i);
      if (m) {
        pool.endIp = m[1];
        finalizeFortiPool(pool);
        return { raw: '' };
      }
    }
    m = t.match(/^set\s+(mode|ntp-sync|lease-time|timezone-option)\s+/i);
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
      const net = `${m[1]} ${m[2]}`;
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
      mem.bgp.asn = parseInt(m[1], 10);
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
      mem.fortiAddresses[mem.fortiAddrName] = `${m[1]} ${m[2]}`;
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
      mem.fortiPendingVlan = parseInt(m[1], 10);
      return { raw: '' };
    }
    m = t.match(/^set\s+interface\s+(\S+)/i);
    if (m && mem.fortiPendingVlan) {
      const name = `${mem.currentIface}.${mem.fortiPendingVlan}`;
      upsertSubinterface(mem, name, mem.currentIface, mem.fortiPendingVlan);
      if (!mem.vlans.find((v: any) => v.id === String(mem.fortiPendingVlan))) {
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

/** Lengkapi pool Fortinet setelah start/end IP tersedia (range + network CIDR). */
function finalizeFortiPool(pool: any): void {
  if (pool.startIp && pool.endIp) {
    pool.range = `${pool.startIp}-${pool.endIp}`;
    const mask = pool.netmask || '255.255.255.0';
    const net = networkOfMask(pool.startIp, mask);
    if (net) pool.network = net;
  }
}

/** Commit satu firewall policy Fortinet → NAT masquerade &/atau ACL. */
function commitFortiPolicy(mem: any, d: any): void {
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
      proto: d.service || 'any',
      src: resolveFortiAddress(mem, d.srcAddr) || 'any',
      dst: resolveFortiAddress(mem, d.dstAddr) || 'any',
    });
  }
}

/** Terjemahkan nama firewall address Fortinet → "ip mask", selain itu apa adanya. */
function resolveFortiAddress(mem: any, name: string | undefined): string {
  if (!name || name === 'all' || !mem.fortiAddresses) return name || '';
  const resolved = mem.fortiAddresses[name];
  return resolved || name;
}

/**
 * Juniper JunOS — perintah "set ..." tingkat lanjut: DHCP (address-assignment
 * pool + dhcp-local-server), BGP, firewall filter (ACL), security nat,
 * static-host-mapping (DNS), DHCP client.
 */
function juniperCommand(raw: string, context: any, mem: any): any {
  const t = raw.trim();
  let m: RegExpMatchArray | null;

  const poolFor = (name: string) => {
    let p = mem.dhcpPools.find((x: any) => x.name === name);
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
    poolFor(m[1]).range = `${m[3]}-${m[4]}`;
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
    const poolName = mem.bgpGroups['pool_' + m[1]] || 'pool1';
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
    mem.bgp.asn = parseInt(m[1], 10);
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
    const peerAs = mem.bgpGroups[m[1]];
    if (peerAs && !mem.bgp.peers.some((p: any) => p.remoteAddr === m[2])) {
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
    const key = `${m[1]}:${m[2]}`;
    mem.juniperSrcNat = mem.juniperSrcNat || {};
    mem.juniperFilters = mem.juniperFilters || {};
    mem.juniperFilters[key] = { proto: m[3].toLowerCase() };
    return { raw: '' };
  }
  m = t.match(/^set\s+firewall\s+family\s+inet\s+filter\s+(\S+)\s+term\s+(\S+)\s+then\s+(accept|reject|discard)/i);
  if (m) {
    const key = `${m[1]}:${m[2]}`;
    mem.juniperFilters = mem.juniperFilters || {};
    const f = mem.juniperFilters[key] || { proto: 'any' };
    const deny = m[3].toLowerCase() !== 'accept';
    mem.acls.push({ action: deny ? 'deny' : 'permit', proto: f.proto, src: 'any', dst: 'any' });
    return { raw: '' };
  }

  // NAT — security nat source
  m = t.match(/^set\s+security\s+nat\s+source\s+rule-set\s+(\S+)\s+rule\s+(\S+)\s+match\s+source-address\s+(\S+)/i);
  if (m) {
    const key = `${m[1]}:${m[2]}`;
    mem.juniperSrcNat = mem.juniperSrcNat || {};
    mem.juniperSrcNat[key] = { src: m[3] };
    return { raw: '' };
  }
  m = t.match(/^set\s+security\s+nat\s+source\s+rule-set\s+(\S+)\s+rule\s+(\S+)\s+then\s+source-nat\s+interface/i);
  if (m) {
    const key = `${m[1]}:${m[2]}`;
    mem.juniperSrcNat = mem.juniperSrcNat || {};
    const d = mem.juniperSrcNat[key] || { src: '' };
    mem.natRules.push({ chain: 'srcnat', action: 'masquerade', srcAddress: d.src || '' });
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
    mem.juniperDstPool[m[1]].port = m[2];
    return { raw: '' };
  }
  m = t.match(/^set\s+security\s+nat\s+destination\s+rule-set\s+(\S+)\s+rule\s+(\S+)\s+match\s+destination-address\s+(\S+)/i);
  if (m) {
    const key = `${m[1]}:${m[2]}`;
    mem.juniperSrcNat = mem.juniperSrcNat || {};
    mem.juniperSrcNat['dst_' + key] = { dstAddress: m[3], dstPort: '' };
    return { raw: '' };
  }
  m = t.match(/^set\s+security\s+nat\s+destination\s+rule-set\s+(\S+)\s+rule\s+(\S+)\s+match\s+destination-port\s+(\d+)/i);
  if (m) {
    const key = `${m[1]}:${m[2]}`;
    mem.juniperSrcNat = mem.juniperSrcNat || {};
    const d = mem.juniperSrcNat['dst_' + key] || (mem.juniperSrcNat['dst_' + key] = { dstAddress: '', dstPort: '' });
    d.dstPort = m[2];
    return { raw: '' };
  }
  m = t.match(/^set\s+security\s+nat\s+destination\s+rule-set\s+(\S+)\s+rule\s+(\S+)\s+then\s+destination-nat\s+pool\s+(\S+)/i);
  if (m) {
    const key = `${m[1]}:${m[2]}`;
    mem.juniperSrcNat = mem.juniperSrcNat || {};
    const d = mem.juniperSrcNat['dst_' + key] || { dstAddress: '', dstPort: '' };
    const pool = (mem.juniperDstPool || {})[m[3]] || { address: '', port: '' };
    if (pool.address) {
      mem.natRules.push({
        chain: 'dstnat',
        action: 'dst-nat',
        protocol: 'tcp',
        dstAddress: d.dstAddress,
        dstPort: d.dstPort,
        toAddresses: pool.address,
        toPorts: pool.port || '',
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

/**
 * VyOS / Ubiquiti EdgeOS — set lanjutan: dhcp-server shared-network,
 * nat source/destination, bgp, firewall name (ACL), static-host-mapping, DHCP client.
 */
function vyosCommand(raw: string, context: any, mem: any): any {
  const t = raw.trim();
  let m: RegExpMatchArray | null;

  const poolFor = (name: string) => {
    let p = mem.dhcpPools.find((x: any) => x.name === name);
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
    if (m[3] && m[4]) p.range = `${m[3]}-${m[4]}`;
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
    mem.bgp.asn = parseInt(m[1], 10);
    mem.bgp.routerId = m[2];
    return { raw: '' };
  }
  m = t.match(/^set\s+protocols\s+bgp\s+(\d+)\s+neighbor\s+(\S+)\s+remote-as\s+(\d+)/i);
  if (m) {
    mem.bgp.asn = parseInt(m[1], 10);
    if (!mem.bgp.peers.some((p: any) => p.remoteAddr === m[2])) {
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
    const key = `${m[1]}:${m[2]}`;
    const d = mem.natSrcDraft['fw_' + key] || (mem.natSrcDraft['fw_' + key] = {});
    d.action = m[3].toLowerCase() === 'accept' ? 'permit' : 'deny';
    return { raw: '' };
  }
  m = t.match(/^set\s+firewall\s+name\s+(\S+)\s+rule\s+(\d+)\s+protocol\s+(\S+)/i);
  if (m) {
    mem.natSrcDraft = mem.natSrcDraft || {};
    const key = `${m[1]}:${m[2]}`;
    const d = mem.natSrcDraft['fw_' + key] || (mem.natSrcDraft['fw_' + key] = {});
    d.proto = m[3].toLowerCase();
    return { raw: '' };
  }
  m = t.match(/^set\s+firewall\s+name\s+(\S+)\s+rule\s+(\d+)\s+(?:source|destination)\s+address\s+(\S+)/i);
  if (m) {
    mem.natSrcDraft = mem.natSrcDraft || {};
    const key = `${m[1]}:${m[2]}`;
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

/**
 * Huawei VRP — BGP (bgp/peer/network), ACL (acl/rule), NAT (nat outbound /
 * nat server), DNS static (ip host), tambahan DHCP pool (ip pool).
 */
function huaweiCommand(raw: string, context: any, mem: any): any {
  const t = raw.trim();
  let m: RegExpMatchArray | null;

  // DHCP pool
  m = t.match(/^ip\s+pool\s+(\S+)\s+network\s+(\S+)\s+(?:mask\s+(\S+))?/i);
  if (m) {
    const net = m[3] ? `${m[2]} ${m[3]}` : m[2];
    const pool = mem.dhcpPools.find((x: any) => x.name === m[1]);
    if (pool) pool.network = net;
    else mem.dhcpPools.push({ name: m[1], range: '', network: net, iface: '', gateway: '' });
    return { raw: '' };
  }
  m = t.match(/^gateway-list\s+(\S+)/i);
  if (m && mem.currentDhcpSection) {
    const pool = mem.dhcpPools.find((x: any) => x.name === mem.currentDhcpSection);
    if (pool) pool.gateway = m[1];
    return { raw: '' };
  }
  m = t.match(/^ip\s+pool\s+(\S+)/i);
  if (m) {
    mem.currentDhcpSection = m[1];
    if (!mem.dhcpPools.find((x: any) => x.name === m[1])) {
      mem.dhcpPools.push({ name: m[1], range: '', network: '', iface: '', gateway: '' });
    }
    return { raw: '' };
  }
  m = t.match(/^network\s+(\d+\.\d+\.\d+\.\d+)\s+(?:mask\s+)?(\S+)/i);
  if (m && mem.currentDhcpSection && mem.currentProto !== 'bgp') {
    const pool = mem.dhcpPools.find((x: any) => x.name === mem.currentDhcpSection);
    if (pool) pool.network = `${m[1]} ${m[2]}`;
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
    if (!mem.bgp.peers.some((p: any) => p.remoteAddr === m[1])) {
      mem.bgp.peers.push({ remoteAs: parseInt(m[2], 10), remoteAddr: m[1], name: m[1] });
    }
    return { raw: '' };
  }
  m = t.match(/^network\s+(\d+\.\d+\.\d+\.\d+)\s+mask\s+(\S+)/i);
  if (m && mem.currentProto === 'bgp') {
    if (!mem.bgp.networks) mem.bgp.networks = [];
    const net = `${m[1]} ${m[2]}`;
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
      src: m[3] ? `${m[3]} ${m[4]}` : 'any',
      dst: m[5] ? `${m[5]} ${m[6]}` : 'any',
      aclId: mem.currentAclId,
    });
    return { raw: '' };
  }

  // NAT outbound (masquerade via ACL)
  m = t.match(/^nat\s+outbound\s+(\d+)/i);
  if (m && mem.currentIface) {
    const acl = mem.acls.find((a: any) => a.aclId === m[1]);
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
    mem.natRules = mem.natRules.filter((r: any) => r.chain !== 'dstnat');
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
    return { type: 'bgp_peer_print', peers: mem.bgp.peers };
  }
  return undefined;
}

/**
 * OpenWrt — UCI config: dnsmasq (uci dhcp), static route & NAT (uci network /
 * firewall), DNS static (/etc/hosts).
 */
function openwrtCommand(raw: string, context: any, mem: any): any {
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
    return { type: 'ip_route_print', routes: mem.routes };
  }
  return undefined;
}

/** Terapkan konfigurasi UCI yang tertunda (dhcp → pool, route → routes, firewall → NAT). */
function commitUci(mem: any, context: any): void {
  const pending = mem.uciPending || {};
  const keys = Object.keys(pending);
  for (const key of keys) {
    const value = pending[key];
    // dnsmasq DHCP: uci set dhcp.<section>.<opt>=<val>
    const dhcpMatch = key.match(/^dhcp\.(\S+?)\.(start|limit|interface|leasetime|dhcpv4|enable)$/i);
    if (dhcpMatch) {
      const section = dhcpMatch[1];
      const opt = dhcpMatch[2].toLowerCase();
      let pool = mem.dhcpPools.find((x: any) => x.name === section);
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
    if (key.match(/^dhcp\.(\S+)$/i)) continue;
    // static route: uci set network.routeN.target / .gateway
    const routeMatch = key.match(/^network\.(route\d+)\.(target|gateway)$/i);
    if (routeMatch) {
      const section = routeMatch[1];
      const opt = routeMatch[2].toLowerCase();
      let route = mem.routes.find((r: any) => r.section === section);
      if (!route) {
        route = { section, dst: '', gateway: '', distance: 1 };
        mem.routes.push(route);
      }
      if (opt === 'target') route.dst = value;
      else route.gateway = value;
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
        protocol: (r.proto || 'tcp').toLowerCase(),
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
        const mask = pending[`network.${ifaceRaw}.netmask`] || '255.255.255.0';
        mem.configuredIps[iface] = `${value}/${maskToBits(mask)}`;
        if (!mem.ifaceSettings) mem.ifaceSettings = {};
      } else if (opt === 'proto' && value.toLowerCase() === 'dhcp') {
        if (!mem.dhcpClients) mem.dhcpClients = [];
        if (!mem.dhcpClients.some((c: any) => c.iface === iface)) {
          mem.dhcpClients.push({ iface, addDefaultRoute: true, status: 'searching' });
        }
      } else if (opt === 'gateway') {
        if (!mem.routes.some((r2: any) => r2.gateway === value)) {
          mem.routes.push({ dst: '0.0.0.0/0', gateway: value, distance: 1 });
        }
      }
    }
  }
  // selesaikan pool DHCP yang punya start/limit tapi belum range absolut
  for (const pool of mem.dhcpPools) {
    if (pool.start && !pool.range) {
      const baseIp = pool.iface ? ((mem.configuredIps || {})[pool.iface] || '192.168.1.1/24') : '192.168.1.1/24';
      const c = cidrOf(baseIp);
      const [netIp] = c.split('/');
      const octets = netIp.split('.');
      octets[3] = String(Number(pool.start));
      const startIp = octets.join('.');
      octets[3] = String(Number(pool.start) + (Number(pool.limit) || 100) - 1);
      pool.range = `${startIp}-${octets.join('.')}`;
      pool.network = networkOfMask(netIp, '255.255.255.0') || '';
      delete pool.start;
      delete pool.limit;
    }
  }
  mem.uciPending = {};
}

/**
 * Linux Debian — DHCP server (dhcpd.conf), NAT (iptables),
 * DNS static (/etc/hosts).
 */
function linuxCommand(raw: string, context: any, mem: any): any {
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
      const name = `lan${mem.dhcpPools.length + 1}`;
      mem.dhcpPools.push({
        name,
        range: `${range[1]}-${range[2]}`,
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
      raw: pools.map((p: any) =>
        `subnet ${p.network ? cidrOf(p.network).split('/')[0] : '0.0.0.0'} netmask 255.255.255.0 {\n  range ${(p.range || '').replace('-', ' ')};\n  option routers ${p.gateway || '0.0.0.0'};\n}`
      ).join('\n'),
    };
  }
  if (/^iptables\s+-t\s+nat\s+-L/i.test(t)) {
    const rules = mem.natRules || [];
    if (rules.length === 0) return { raw: 'Chain PREROUTING (policy ACCEPT)\nChain POSTROUTING (policy ACCEPT)' };
    return {
      raw: [
        'Chain PREROUTING (policy ACCEPT)',
        ...rules.filter((r: any) => r.chain === 'dstnat').map((r: any) =>
          `DNAT       ${r.protocol || 'tcp'}  --  anywhere  anywhere  dpt:${r.dstPort || '?'} to:${r.toAddresses || '?'}${r.toPorts ? ':' + r.toPorts : ''}`
        ),
        'Chain POSTROUTING (policy ACCEPT)',
        ...rules.filter((r: any) => r.chain === 'srcnat').map((r: any) =>
          `MASQUERADE  all  --  anywhere  anywhere`
        ),
      ].join('\n'),
    };
  }
  return undefined;
}

// ============================================================
// Helpers
// ============================================================
/** Format shared result types (vlan/dhcp/dns/nat/hostname prints) for any vendor. */
function formatExtended(cmdResult: any): string {
  if (!cmdResult) return '';
  if (cmdResult.type === 'vlan_print' || cmdResult.type === 'show_vlan') {
    const vlans = cmdResult.vlans || [];
    if (vlans.length === 0) return 'Flags: X - disabled, R - running\n # NAME      VLAN-ID   INTERFACE\n -- no entries --';
    const rows = vlans.map((v: any, i: number) =>
      ` ${i} ${(v.name || 'vlan' + v.id).padEnd(10)} ${String(v.id).padEnd(10)} ${v.iface || ''}`
    ).join('\n');
    return 'Flags: X - disabled, R - running\n # NAME      VLAN-ID   INTERFACE\n' + rows;
  }
  if (cmdResult.type === 'dhcp_print') {
    const pools = cmdResult.pools || [];
    if (pools.length === 0) return ' -- no DHCP servers --';
    const rows = pools.map((p: any, i: number) =>
      ` ${i} ${(p.name || 'pool' + i).padEnd(12)} ${(p.network || p.range || '-').padEnd(22)} ${(p.iface || '-').padEnd(12)} ${p.gateway || '-'}`
    ).join('\n');
    return ' # NAME         NETWORK/RANGE           INTERFACE    GATEWAY\n' + rows;
  }
  if (cmdResult.type === 'dhcp_client_print') {
    const clients = cmdResult.clients || [];
    if (clients.length === 0) return 'Flags: X - disabled, I - invalid, B - bound\n #    INTERFACE    ADD-DEFAULT-ROUTE    STATUS\n -- no entries --';
    const rows = clients.map((c: any, i: number) =>
      ` ${i} ${(c.iface || '-').padEnd(12)} ${(c.addDefaultRoute ? 'yes' : 'no').padEnd(19)} ${c.status === 'bound' ? 'B bound (address ' + c.ip + (c.gateway ? ', gw ' + c.gateway : '') + ')' : (c.status || 'searching')}`
    ).join('\n');
    return 'Flags: X - disabled, I - invalid, B - bound\n #    INTERFACE    ADD-DEFAULT-ROUTE    STATUS\n' + rows;
  }
  if (cmdResult.type === 'dns_print') {
    const servers = cmdResult.servers || [];
    if (servers.length === 0) return 'servers: (none)';
    return 'servers: ' + servers.join(', ');
  }
  if (cmdResult.type === 'acl_print') {
    const rules = cmdResult.rules || [];
    if (rules.length === 0) return 'Flags: X - disabled, P - permit, D - deny\n #    ACTION    PROTOCOL    SOURCE            DESTINATION\n -- no entries --';
    const rows = rules.map((r: any, i: number) =>
      ` ${i} ${(r.action === 'deny' ? 'D' : 'P')}   ${r.action.padEnd(6)} ${(r.proto || 'any').padEnd(10)} ${(r.src || 'any').padEnd(17)} ${r.dst || 'any'}`
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
      const asn = proto === 'eigrp' ? ` as=${p.asn || ''}` : '';
      lines.push(`Routing Protocol is "${proto.toUpperCase()}"${asn}`);
      lines.push(`  Networks: ${(p.networks && p.networks.length > 0) ? p.networks.join(', ') : 'none'}`);
    }
    if (bgp.asn) {
      lines.push(`Routing Protocol is "BGP" (as=${bgp.asn})`);
      lines.push(`  Networks: ${(bgp.networks && bgp.networks.length > 0) ? bgp.networks.join(', ') : 'connected only'}`);
      lines.push(`  Peers: ${(bgp.peers || []).map((x: any) => `${x.remoteAddr} (as${x.remoteAs})`).join(', ') || 'none'}`);
    }
    if (lines.length === 0) return 'Routing Protocol is "none"';
    return lines.join('\n');
  }
  if (cmdResult.type === 'nat_print') {
    const rules = cmdResult.rules || [];
    const header = 'Flags: X - disabled, I - invalid, D - dynamic\n #    CHAIN      ACTION      OUT-INTERFACE   SRC-ADDRESS     DST-ADDRESS    DST-PORT  TO-ADDRESSES   TO-PORTS';
    if (rules.length === 0) return header + '\n -- no entries --';
    const rows = rules.map((r: any, i: number) =>
      ` ${i} ${r.chain.padEnd(11)} ${r.action.padEnd(12)} ${(r.outInterface || '-').padEnd(15)} ${(r.srcAddress || '-').padEnd(15)} ${(r.dstAddress || '-').padEnd(14)} ${(r.dstPort || '-').padEnd(9)} ${(r.toAddresses || '-').padEnd(14)} ${r.toPorts || '-'}`
    ).join('\n');
    return header + '\n' + rows;
  }
  if (cmdResult.type === 'identity_print') {
    return `name: ${cmdResult.name || 'device'}`;
  }
  if (cmdResult.type === 'nslookup') {
    if (cmdResult.timedOut || !cmdResult.resolved) {
      return cmdResult.nxdomain
        ? `;; server can't find ${cmdResult.host}: NXDOMAIN`
        : `;; connection timed out; no servers could be reached`;
    }
    return `Server:         ${cmdResult.server}\nAddress:        ${cmdResult.server}#53\n\nNon-authoritative answer:\nName:    ${cmdResult.host}\nAddress: ${cmdResult.resolved}`;
  }
  if (cmdResult.type === 'dns_static_print') {
    const records = cmdResult.records || [];
    const header = 'Flags: X - disabled, D - dynamic\n #   NAME            ADDRESS\n';
    if (records.length === 0) return header + ' -- no entries --';
    const rows = records.map((r: any, i: number) => ` ${i}   ${r.name.padEnd(16)} ${r.address}`).join('\n');
    return header + rows;
  }
  if (cmdResult.type === 'service_print') {
    const web = cmdResult.web || {};
    const wwwState = web.enabled === false ? 'disabled' : 'enabled';
    const rows = [
      ' 0   winbox        8291    -                -                        -',
      ` 1   www           ${String(web.port || 80).padEnd(6)}  -                -                        ${wwwState}`,
      ' 2   ssh           22      -                -                        -',
      ' 3   telnet        23      -                -                        -',
    ].join('\n');
    return 'Flags: X - disabled, R - running\n #   NAME      PORT    ADDRESS         CERTIFICATE   VRF\n' + rows;
  }
  if (cmdResult.type === 'queue_print') {
    const queues = cmdResult.queues || [];
    const live = cmdResult.live || [];
    if (queues.length === 0) return 'Flags: X - disabled, I - invalid\n #    NAME       TARGET            MAX-LIMIT\n -- no entries --';
    const rows = queues.map((q: any, i: number) => {
      const s = live.find((l: any) => l.name === q.name);
      const tx = s ? `${s.packets} pkt, ${s.bytes} B` : 'idle';
      const dr = s && s.dropped > 0 ? `, ${s.dropped} dropped` : '';
      return ` ${i} ${(q.name || '').padEnd(10)} ${(q.target || '').padEnd(17)} ${(q.maxLimit || '').padEnd(12)} ${tx}${dr}`;
    }).join('\n');
    return 'Flags: X - disabled, I - invalid\n #    NAME       TARGET            MAX-LIMIT      RATE\n' + rows;
  }
  if (cmdResult.type === 'mangle_print') {
    const rules = cmdResult.rules || [];
    if (rules.length === 0) return 'Flags: X - disabled, I - invalid\n #    CHAIN         ACTION       PROTOCOL   SRC-ADDRESS\n -- no entries --';
    const rows = rules.map((r: any, i: number) =>
      ` ${i} ${(r.chain || '').padEnd(14)} ${(r.action || '').padEnd(12)} ${(r.protocol || '').padEnd(10)} ${(r.newPacketMark ? 'mark=' + r.newPacketMark : '')} ${r.srcAddress || ''}`
    ).join('\n');
    return 'Flags: X - disabled, I - invalid\n #    CHAIN         ACTION       PROTOCOL   MARK       SRC-ADDRESS\n' + rows;
  }
  if (cmdResult.type === 'wireless_print') {
    const wireless = cmdResult.wireless || {};
    const entries = Object.entries(wireless);
    if (entries.length === 0) return 'Flags: X - disabled, R - running\n #    NAME       SSID               BAND         MODE\n -- no entries --';
    const rows = entries.map(([name, w]: [string, any], i: number) =>
      ` ${i} R ${name.padEnd(11)} ${(w.ssid || '').padEnd(18)} ${(w.band || '2ghz-G').padEnd(13)} ${w.mode || 'ap-bridge'}`
    ).join('\n');
    return 'Flags: X - disabled, R - running\n #    NAME       SSID               BAND         MODE\n' + rows;
  }
  if (cmdResult.type === 'bridge_print') {
    const stp = cmdResult.stp || {};
    const rows = [
      ` 0   bridge1            enabled                ${stp.mode || 'rstp'}`,
    ];
    return 'Flags: X - disabled, R - running\n #    NAME               STP                    PROTOCOL-MODE\n' + rows;
  }
  if (cmdResult.type === 'wireless_reg_print') {
    const entries = cmdResult.entries || [];
    if (entries.length === 0) return 'Flags: A - active, B - blocked\n #    MAC-ADDRESS       SSID               SIGNAL   INTERFACE\n -- no registered stations --';
    const rows = entries.map((e: any, i: number) =>
      ` ${i} A ${(e.mac || '-').padEnd(18)} ${(e.ssid || '').padEnd(18)} ${String(e.signal ?? -100).padEnd(7)} ${e.iface || 'wlan1'}`
    ).join('\n');
    return 'Flags: A - active, B - blocked\n #    MAC-ADDRESS       SSID               SIGNAL   INTERFACE\n' + rows;
  }
  if (cmdResult.type === 'wireless_monitor') {
    return [
      `status: running`,
      `mode: ${cmdResult.mode || 'ap-bridge'}`,
      `ssid: ${cmdResult.ssid || '(none)'}`,
      `registered-stations: ${cmdResult.stationCount ?? 0}`,
      `signal-strength: ${cmdResult.signal ?? -100}dBm`,
    ].join('\n');
  }
  if (cmdResult.type === 'neighbor_print') {
    const neighbors = cmdResult.neighbors || [];
    if (neighbors.length === 0) return ' -- no neighbors discovered --';
    const rows = neighbors.map((n: any, i: number) =>
      ` ${i} ${(n.localPort || '-').padEnd(14)} ${(n.peerName || '?').padEnd(18)} ${(n.peerDeviceType || '').padEnd(12)} ${n.peerPort || '-'}`
    ).join('\n');
    return ' #    LOCAL-PORT     PEER               PLATFORM      PEER-PORT\n' + rows;
  }
  if (cmdResult.type === 'ospf_neighbor_print') {
    const neighbors = cmdResult.neighbors || [];
    const header = 'Neighbor ID     Pri   State           Dead Time   Address         Interface\n';
    const rows = neighbors.map((n: any) =>
      `${(n.routerId || '0.0.0.0').padEnd(16)}   1   FULL/  -        00:00:31    ${(n.ip || '').padEnd(16)} ${n.iface || ''}`
    ).join('\n');
    return header + (rows || '(no OSPF neighbors)');
  }
  if (cmdResult.type === 'tcp_print') {
    const conns = cmdResult.connections || [];
    if (conns.length === 0) return 'Local Address         Foreign Address         State\n(no active connections)';
    const rows = conns.map((c: any) =>
      `${(c.localIp + ':' + c.localPort).padEnd(21)} ${(c.remoteIp + ':' + c.remotePort).padEnd(23)} ${c.state}`
    ).join('\n');
    return 'Local Address         Foreign Address         State\n' + rows;
  }
  if (cmdResult.type === 'ip_neigh') {
    const entries = cmdResult.entries || [];
    if (entries.length === 0) return '(ARP cache empty — kirim ping dulu untuk belajar MAC)';
    return entries.map((e: any) => `${e.ip} dev eth0 lladdr ${e.mac} REACHABLE`).join('\n');
  }
  if (cmdResult.type === 'snmp_print') {
    const s = cmdResult.snmp || {};
    if (!s.enabled) return 'SNMP agent: disabled';
    const lines = [
      'SNMP agent: enabled',
      `Community (read-only):  ${s.community || 'public'}`,
      `Community (read-write): ${s.communityRW || 'private'}`,
      `Contact:   ${s.sysContact || '(not set)'}`,
      `Location:  ${s.sysLocation || '(not set)'}`,
    ];
    return lines.join('\n');
  }
  if (cmdResult.type === 'snmp_query') {
    return formatSnmpQuery(cmdResult);
  }
  return '';
}

/** Format output snmpget/snmpwalk/snmpset meniru net-snmp CLI. */
function formatSnmpQuery(cmdResult: any): string {
  const { result, host, community, tool, numeric } = cmdResult;
  const oid = cmdResult.oid || '.1.3.6.1.2.1.1.1.0';
  if (!result || result.ok === false) {
    const reason = result?.reason;
    if (reason === 'auth') return `${tool}: Error in packet. Reason: Bad community name used with community string: ${community}`;
    if (reason === 'readonly') return `${tool}: Error in packet. Reason: notWritable`;
    if (reason === 'no-agent' || reason === 'timeout' || reason === 'unreachable') {
      return `${tool}: Timeout: No Response from ${host}`;
    }
    if (reason === 'not-found-oid' || (result && Array.isArray(result.oids) && result.oids.length === 0)) {
      return `No Such Object available on this agent at this OID ${oid}`;
    }
    return `${tool}: ${result?.error || 'Error in packet'}`;
  }
  const oids = result.oids || [];
  if (oids.length === 0) return `No Such Instance currently exists at this OID ${oid}`;
  const prefix = numeric ? '' : 'SNMPv2-MIB::';
  const lines = oids.map((o: any) => `${prefix}${o.oid} = ${o.type || 'STRING'}: ${o.value}`);
  return lines.join('\n');
}

function mergeIps(ports: any[], configuredIps: Record<string, string>) {
  return (ports || []).map((p: any) => ({
    ...p,
    ipAddress: configuredIps[p.name] || p.ipAddress
  }));
}

/** Ambil 12 digit hex (4 prioritas + 8 MAC) dari bridge ID STP. */
function rootIdStr(id: string | undefined): string {
  const hex = (id || '').replace(/[^0-9a-fA-F]/g, '').toLowerCase().padEnd(12, '0');
  return hex.slice(0, 12);
}

/** Format MAC ala Cisco: xxxx.xxxx.xxxx */
function fmtMac(hex: string): string {
  return `${hex.slice(0, 4)}.${hex.slice(4, 8)}.${hex.slice(8, 12)}`;
}

/**
 * Mark an interface as a DHCP client and request a lease from the
 * simulation engine (via the host-app callback). On success the granted
 * IP is written into the CLI memory so it shows in "address print" and
 * survives a page refresh; an optional default route is added too.
 */
function grantDhcpClient(context: any, mem: any, iface: string, addDefaultRoute: boolean): string {
  if (!mem.dhcpClients) mem.dhcpClients = [];
  let entry = mem.dhcpClients.find((c: any) => c.iface === iface);
  if (!entry) {
    entry = { iface, addDefaultRoute, status: 'searching' };
    mem.dhcpClients.push(entry);
  }
  entry.addDefaultRoute = addDefaultRoute;

  const granted = typeof context.dhcpClientGrant === 'function'
    ? context.dhcpClientGrant(iface, addDefaultRoute)
    : null;

  if (granted && granted.ip) {
    entry.status = 'bound';
    entry.ip = granted.ip;
    entry.gateway = granted.gateway || '';
    const cidr = `${granted.ip}/${granted.prefix ?? 24}`;
    mem.configuredIps[iface] = cidr;
    if (
      addDefaultRoute &&
      granted.gateway &&
      !mem.routes.some(
        (r: any) => r.gateway === granted.gateway && (r.dst === '0.0.0.0/0' || r.dst === '0.0.0.0 0.0.0.0')
      )
    ) {
      mem.routes.push({ dst: '0.0.0.0/0', gateway: granted.gateway, distance: 1 });
    }
    return `% Interface ${iface}: DHCP client bound — lease ${cidr}${granted.gateway ? ` (gateway ${granted.gateway})` : ''}`;
  }

  entry.status = 'unbound';
  delete entry.ip;
  delete entry.gateway;
  return `% Interface ${iface}: DHCP client aktif — menunggu lease (pastikan DHCP server sudah dikonfigurasi di segmen yang sama)`;
}

/** Map a user-typed interface name to the device's real port name (case-insensitive). */
function resolveIfaceName(ports: any[], name: string | undefined): string | null {
  if (!name) return null;
  const found = (ports || []).find(
    (p: any) => p.name.toLowerCase() === name.toLowerCase()
  );
  return found ? found.name : name;
}

/** Ubah "192.168.88.1/24" atau "192.168.88.1 255.255.255.0" → bentuk CIDR. */
function cidrOf(entry: string): string {
  if (!entry) return '';
  const s = entry.trim();
  if (s.includes('/')) return s;
  const parts = s.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0]}/${maskToBits(parts[1])}`;
  }
  return s;
}

/** Netmask 255.255.255.0 → prefix 24. */
function maskToBits(mask: string): number {
  const octets = mask.split('.').map(Number);
  let bits = 0;
  for (const o of octets) {
    if (o === 255) bits += 8;
    else if (o === 254) bits += 7;
    else if (o === 252) bits += 6;
    else if (o === 248) bits += 5;
    else if (o === 240) bits += 4;
    else if (o === 224) bits += 3;
    else if (o === 192) bits += 2;
    else if (o === 128) bits += 1;
    else break;
  }
  return bits;
}

/** Ubah entry IP apa pun → "ip mask" (bentuk IOS/Huawei/Fortinet). */
function maskedPair(entry: string): string {
  const c = cidrOf(entry);
  const [ip, prefixStr] = c.split('/');
  const prefix = Number(prefixStr);
  const full = prefix >= 32 ? 0xffffffff : (0xffffffff << (32 - prefix)) >>> 0;
  const mask = [24, 16, 8, 0].map((s) => (full >>> s) & 255).join('.');
  return `${ip} ${mask}`;
}

/** Hitung alamat network + prefix dari "ip mask" → "192.168.88.0/24". */
function networkOfMask(ip: string, mask: string): string | null {
  const i = ip.split('.').map(Number);
  const m = mask.split('.').map(Number);
  if (i.length !== 4 || m.length !== 4 || i.some((n) => isNaN(n)) || m.some((n) => isNaN(n))) return null;
  const net = i.map((o, k) => o & m[k]);
  let prefix = 0;
  for (const o of m) {
    if (o === 255) {
      prefix += 8;
      continue;
    }
    for (let b = 7; b >= 0; b--) {
      if (((o >> b) & 1) === 1) prefix++;
      else break;
    }
    break;
  }
  return `${net.join('.')}/${prefix}`;
}

/** Register or update a VLAN subinterface entry (router-on-a-stick). */
function upsertSubinterface(mem: any, name: string, parentPort: string, vlanId: number): void {
  if (!mem.subinterfaces) mem.subinterfaces = [];
  const existing = mem.subinterfaces.find((s: any) => s.name === name);
  if (existing) {
    existing.parentPort = parentPort;
    existing.vlanId = vlanId;
  } else {
    mem.subinterfaces.push({ name, parentPort, vlanId });
  }
}

/** Administratively bring an interface down (shutdown) or up (no shutdown). */
function setShutdownState(mem: any, ifaceName: string, down: boolean): void {
  if (!ifaceName) return;
  if (!mem.shutdownIfaces) mem.shutdownIfaces = [];
  if (down) {
    if (!mem.shutdownIfaces.includes(ifaceName)) mem.shutdownIfaces.push(ifaceName);
  } else {
    mem.shutdownIfaces = mem.shutdownIfaces.filter((n: string) => n !== ifaceName);
  }
}

/** Mark a port as a trunk (carries all VLANs). */
function pushTrunk(mem: any, ifaceName: string): void {
  if (!ifaceName) return;
  if (!mem.trunkPorts) mem.trunkPorts = [];
  if (!mem.trunkPorts.includes(ifaceName)) mem.trunkPorts.push(ifaceName);
}

/** Deterministic fake DNS answer (used by nslookup when a DNS server is set). */
function fakeDnsIp(domain: string): string {
  let h = 5381;
  for (let i = 0; i < domain.length; i++) {
    h = ((h << 5) + h + domain.charCodeAt(i)) >>> 0;
  }
  return `10.${(h >>> 16) % 240 + 8}.${(h >>> 8) % 240 + 8}.${h % 240 + 8}`;
}

function generateRunningConfig(context: any, mem: any, vendor: string): string {
  const ports = mergeIps(context?.ports || [], mem.configuredIps);
  const lines: string[] = [];
  const hostname = mem.hostname || context?.name || 'Device';
  const withIp = ports.filter((p: any) => p.ipAddress);
  if (vendor === 'mikrotik') {
    lines.push('# RouterOS configuration export');
    lines.push(`/system identity set name=${hostname}`);
    if (mem.vlans.length > 0) {
      mem.vlans.forEach((v: any) => {
        lines.push(`/interface vlan add name=vlan${v.id} vlan-id=${v.id} interface=${v.iface || 'ether1'}`);
      });
    }
    withIp.forEach((p: any) => {
      lines.push(`/ip address add address=${p.ipAddress} interface=${p.name}`);
    });
    mem.routes.forEach((r: any) => {
      lines.push(`/ip route add dst-address=${r.dst} gateway=${r.gateway}`);
    });
    Object.entries(mem.configuredIps6 || {}).forEach(([name, addr]: [string, any]) => {
      lines.push(`/ipv6 address add address=${addr} interface=${name}`);
    });
    (mem.routes6 || []).forEach((r: any) => {
      lines.push(`/ipv6 route add dst-address=${r.dst} gateway=${r.gateway}`);
    });
    (mem.fhrpGroups || []).forEach((g: any) => {
      lines.push(`/routing vrrp instance add name=vrrp${g.vrid || 1} interface=${g.interface || ''} vrid=${g.vrid || 1} priority=${g.priority ?? 100} address=${g.virtualAddress}`);
    });
    (mem.shutdownIfaces || []).forEach((name: string) => {
      lines.push(`/interface disable ${name}`);
    });
    (mem.subinterfaces || []).forEach((s: any) => {
      lines.push(`/interface vlan add name=${s.name} vlan-id=${s.vlanId} interface=${s.parentPort}`);
    });
    (mem.trunkPorts || []).forEach((name: string) => {
      lines.push(`/interface bridge port add bridge=bridge1 interface=${name}`);
    });
    (mem.queues || []).forEach((q: any) => {
      lines.push(`/queue simple add name=${q.name} target=${q.target || ''} max-limit=${q.maxLimit || ''}`);
    });
    Object.entries(mem.wireless || {}).forEach(([name, w]: [string, any]) => {
      lines.push(`/interface wireless set ${name} ssid=${w.ssid || ''} band=${w.band || '2ghz-G'} mode=${w.mode || 'ap-bridge'}`);
    });
    mem.dhcpPools.forEach((p: any) => {
      if (p.range) lines.push(`/ip pool add name=${p.name} ranges=${p.range}`);
      if (p.iface) lines.push(`/ip dhcp-server add name=${p.name} interface=${p.iface} address-pool=${p.name}`);
    });
    if (mem.dnsServers.length > 0) lines.push(`/ip dns set servers=${mem.dnsServers.join(',')}`);
    mem.dnsRecords.forEach((r: any) => lines.push(`/ip dns static add name=${r.name} address=${r.address}`));
    if (mem.webServer && mem.webServer.enabled === false) lines.push('/ip service set www disabled=yes');
    mem.natRules.forEach((r: any) => {
      let line = `/ip firewall nat add chain=${r.chain}${r.outInterface ? ` out-interface=${r.outInterface}` : ''} action=${r.action}`;
      if (r.protocol) line += ` protocol=${r.protocol}`;
      if (r.dstAddress) line += ` dst-address=${r.dstAddress}`;
      if (r.dstPort) line += ` dst-port=${r.dstPort}`;
      if (r.toAddresses) line += ` to-addresses=${r.toAddresses}`;
      if (r.toPorts) line += ` to-ports=${r.toPorts}`;
      lines.push(line);
    });
  } else if (vendor === 'juniper') {
    lines.push(`set system host-name ${hostname}`);
    withIp.forEach((p: any) => lines.push(`set interfaces ${p.name} unit 0 family inet address ${cidrOf(p.ipAddress)}`));
    if (mem.dnsServers.length > 0) lines.push(`set system name-server ${mem.dnsServers.join(' ')}`);
    mem.dnsRecords.forEach((r: any) => lines.push(`set system static-host-mapping host-name ${r.name} inet ${r.address}`));
    mem.vlans.forEach((v: any) => lines.push(`set vlans ${v.name || 'VLAN' + v.id} vlan-id ${v.id}`));
    mem.routes.forEach((r: any) => lines.push(`set routing-options static route ${r.dst} next-hop ${r.gateway}`));
    mem.dhcpPools.forEach((p: any) => {
      if (p.network) lines.push(`set access address-assignment pool ${p.name} family inet network ${cidrOf(p.network)}`);
      const rm = String(p.range || '').match(/(\d+\.\d+\.\d+\.\d+)\s*-\s*(\d+\.\d+\.\d+\.\d+)/);
      if (rm) lines.push(`set access address-assignment pool ${p.name} family inet range R1 low ${rm[1]} high ${rm[2]}`);
      if (p.gateway) lines.push(`set access address-assignment pool ${p.name} family inet dhcp-attributes router ${p.gateway}`);
      if (p.iface) lines.push(`set system services dhcp-local-server group G1 pool ${p.name}`);
      if (p.iface) lines.push(`set system services dhcp-local-server group G1 interface ${p.iface}`);
    });
    if (mem.bgp.asn) {
      lines.push(`set routing-options autonomous-system ${mem.bgp.asn}`);
      if (mem.bgp.routerId) lines.push(`set routing-options router-id ${mem.bgp.routerId}`);
      mem.bgp.peers.forEach((p: any, i: number) => {
        lines.push(`set protocols bgp group EXT${i} type external`);
        lines.push(`set protocols bgp group EXT${i} peer-as ${p.remoteAs}`);
        lines.push(`set protocols bgp group EXT${i} neighbor ${p.remoteAddr}`);
      });
      (mem.bgp.networks || []).forEach((n: string) => lines.push(`set protocols bgp group EXT0 network ${n}`));
    }
    mem.acls.forEach((a: any, i: number) => {
      lines.push(`set firewall family inet filter FILTER${i} term t1 from protocol ${a.proto || 'any'}`);
      lines.push(`set firewall family inet filter FILTER${i} term t1 then ${a.action === 'deny' ? 'reject' : 'accept'}`);
    });
    mem.natRules.forEach((r: any, i: number) => {
      if (r.chain === 'srcnat') {
        lines.push(`set security nat source rule-set RS${i} rule 10 match source-address ${r.srcAddress || '0.0.0.0/0'}`);
        lines.push(`set security nat source rule-set RS${i} rule 10 then source-nat interface`);
      }
    });
  } else if (vendor === 'huawei') {
    lines.push(`sysname ${hostname}`);
    mem.vlans.forEach((v: any) => lines.push(`vlan ${v.id}`));
    withIp.forEach((p: any) => {
      lines.push(`interface ${p.name}`);
      lines.push(` ip address ${maskedPair(p.ipAddress)}`);
    });
    mem.routes.forEach((r: any) => lines.push(`ip route-static ${r.dst} ${r.gateway}`));
    mem.dhcpPools.forEach((p: any) => {
      lines.push('dhcp enable');
      lines.push(`ip pool ${p.name}`);
      if (p.network) lines.push(` network ${cidrOf(p.network).split('/')[0]} mask ${maskedPair(p.network).split(' ')[1]}`);
      if (p.gateway) lines.push(` gateway-list ${p.gateway}`);
    });
    mem.dnsRecords.forEach((r: any) => lines.push(`ip host ${r.name} ${r.address}`));
    if (mem.bgp.asn) {
      lines.push(`bgp ${mem.bgp.asn}`);
      mem.bgp.peers.forEach((p: any) => lines.push(` peer ${p.remoteAddr} as-number ${p.remoteAs}`));
      (mem.bgp.networks || []).forEach((n: string) => lines.push(` network ${cidrOf(n).split('/')[0]} mask ${maskedPair(n).split(' ')[1]}`));
      lines.push('quit');
    }
    mem.acls.forEach((a: any, i: number) => {
      if (a.aclId) {
        lines.push(`acl ${a.aclId}`);
        lines.push(` rule ${i + 1} ${a.action} ${a.proto || 'ip'} source ${(a.src || 'any').split(' ')[0]} ${(a.src || 'any').split(' ')[1] || '0.0.0.0'}`);
        lines.push('quit');
      }
    });
    mem.natRules.forEach((r: any) => {
      if (r.chain === 'srcnat' && mem.acls.length > 0 && mem.acls[0].aclId) lines.push(`nat outbound ${mem.acls[0].aclId}`);
      if (r.chain === 'dstnat') lines.push(`nat server protocol ${r.protocol || 'tcp'} global ${r.dstAddress || 'current-interface'} ${r.dstPort} inside ${r.toAddresses} ${r.toPorts}`);
    });
  } else if (vendor === 'fortinet') {
    lines.push('config system global');
    lines.push(` set hostname "${hostname}"`);
    lines.push('end');
    withIp.forEach((p: any) => {
      lines.push('config system interface');
      lines.push(` edit ${p.name}`);
      lines.push(` set ip ${maskedPair(p.ipAddress)}`);
      lines.push('end');
    });
    mem.routes.forEach((r: any, i: number) => {
      lines.push('config router static');
      lines.push(` edit ${i + 1}`);
      lines.push(` set dst ${r.dst}`);
      lines.push(` set gateway ${r.gateway}`);
      lines.push('end');
    });
    mem.dhcpPools.forEach((p: any) => {
      lines.push('config system dhcp server');
      lines.push(` edit ${p.idx || 1}`);
      if (p.iface) lines.push(` set interface ${p.iface}`);
      const rm = String(p.range || '').match(/(\d+\.\d+\.\d+\.\d+)\s*-\s*(\d+\.\d+\.\d+\.\d+)/);
      if (rm) {
        lines.push(' config ip-range');
        lines.push('  edit 1');
        lines.push(`  set start-ip ${rm[1]}`);
        lines.push(`  set end-ip ${rm[2]}`);
        lines.push('  end');
      }
      if (p.gateway) lines.push(` set default-gateway ${p.gateway}`);
      lines.push('end');
    });
    if (mem.dnsServers.length > 0) {
      lines.push('config system dns');
      lines.push(` set primary ${mem.dnsServers[0]}`);
      if (mem.dnsServers[1]) lines.push(` set secondary ${mem.dnsServers[1]}`);
      lines.push('end');
    }
    if (mem.routing.ospf.enabled) {
      lines.push('config router ospf');
      if (mem.routing.ospf.routerId) lines.push(` set router-id ${mem.routing.ospf.routerId}`);
      mem.routing.ospf.networks.forEach((n: string, i: number) => {
        lines.push(' config network');
        lines.push(`  edit ${i + 1}`);
        lines.push(`  set prefix ${n}`);
        lines.push('  end');
      });
      lines.push('end');
    }
    if (mem.bgp.asn) {
      lines.push('config router bgp');
      lines.push(` set as ${mem.bgp.asn}`);
      if (mem.bgp.routerId) lines.push(` set router-id ${mem.bgp.routerId}`);
      if (mem.bgp.peers.length > 0) {
        lines.push(' config neighbor');
        mem.bgp.peers.forEach((p: any) => {
          lines.push(`  edit ${p.remoteAddr}`);
          lines.push(`  set remote-as ${p.remoteAs}`);
          lines.push('  end');
        });
        lines.push(' end');
      }
      lines.push('end');
    }
    mem.natRules.forEach((r: any, i: number) => {
      if (r.chain === 'srcnat' && r.outInterface) {
        lines.push('config firewall policy');
        lines.push(` edit ${i + 1}`);
        lines.push(' set srcintf "internal"');
        lines.push(` set dstintf "${r.outInterface}"`);
        lines.push(' set srcaddr "all"');
        lines.push(' set dstaddr "all"');
        lines.push(' set action accept');
        lines.push(' set nat enable');
        lines.push('next');
        lines.push('end');
      }
      if (r.chain === 'dstnat' && r.toAddresses) {
        lines.push('config firewall vip');
        lines.push(` edit "web${i}"`);
        if (r.dstAddress) lines.push(` set extip ${r.dstAddress}`);
        lines.push(` set mappedip ${r.toAddresses}`);
        lines.push(` set extintf "${r.outInterface || 'wan1'}"`);
        lines.push(' set portforward enable');
        lines.push(` set protocol ${r.protocol || 'tcp'}`);
        if (r.dstPort) lines.push(` set extport ${r.dstPort}`);
        if (r.toPorts) lines.push(` set mappedport ${r.toPorts}`);
        lines.push('end');
      }
    });
  } else if (vendor === 'ubiquiti' || vendor === 'vyos') {
    lines.push(`set system host-name ${hostname}`);
    withIp.forEach((p: any) => lines.push(`set interfaces ethernet ${p.name} address ${cidrOf(p.ipAddress)}`));
    mem.vlans.forEach((v: any) => lines.push(`set interfaces ethernet vif ${v.id} address dhcp`));
    mem.routes.forEach((r: any) => lines.push(`set protocols static route ${r.dst} next-hop ${r.gateway}`));
    mem.dhcpPools.forEach((p: any) => {
      lines.push(`set service dhcp-server shared-network-name ${p.name} subnet ${cidrOf(p.network || '192.168.1.0/24')}`);
      const rm = String(p.range || '').match(/(\d+\.\d+\.\d+\.\d+)\s*-\s*(\d+\.\d+\.\d+\.\d+)/);
      if (rm) lines.push(`set service dhcp-server shared-network-name ${p.name} subnet ${cidrOf(p.network || '192.168.1.0/24')} start ${rm[1]} stop ${rm[2]}`);
      if (p.gateway) lines.push(`set service dhcp-server shared-network-name ${p.name} subnet ${cidrOf(p.network || '192.168.1.0/24')} default-router ${p.gateway}`);
    });
    mem.dnsRecords.forEach((r: any) => lines.push(`set system static-host-mapping host-name ${r.name} inet ${r.address}`));
    mem.natRules.forEach((r: any, i: number) => {
      if (r.chain === 'srcnat') {
        lines.push(`set nat source rule ${i + 10} outbound-interface ${r.outInterface || 'eth0'}`);
        if (r.srcAddress) lines.push(`set nat source rule ${i + 10} source address ${r.srcAddress}`);
        lines.push(`set nat source rule ${i + 10} translation address masquerade`);
      }
      if (r.chain === 'dstnat') {
        lines.push(`set nat destination rule ${i + 100} inbound-interface ${r.outInterface || 'eth0'}`);
        lines.push(`set nat destination rule ${i + 100} protocol ${r.protocol || 'tcp'}`);
        if (r.dstPort) lines.push(`set nat destination rule ${i + 100} destination port ${r.dstPort}`);
        lines.push(`set nat destination rule ${i + 100} translation address ${r.toAddresses}`);
        if (r.toPorts) lines.push(`set nat destination rule ${i + 100} translation port ${r.toPorts}`);
      }
    });
    if (mem.bgp.asn) {
      lines.push(`set protocols bgp ${mem.bgp.asn} parameters router-id ${mem.bgp.routerId || '0.0.0.0'}`);
      mem.bgp.peers.forEach((p: any) => lines.push(`set protocols bgp ${mem.bgp.asn} neighbor ${p.remoteAddr} remote-as ${p.remoteAs}`));
      (mem.bgp.networks || []).forEach((n: string) => lines.push(`set protocols bgp ${mem.bgp.asn} network ${n}`));
    }
    mem.acls.forEach((a: any, i: number) => {
      lines.push(`set firewall name FW${i} rule ${i + 10} action ${a.action === 'deny' ? 'drop' : 'accept'}`);
      if (a.proto && a.proto !== 'any') lines.push(`set firewall name FW${i} rule ${i + 10} protocol ${a.proto}`);
      if (a.src && a.src !== 'any') lines.push(`set firewall name FW${i} rule ${i + 10} source address ${a.src}`);
      if (a.dst && a.dst !== 'any') lines.push(`set firewall name FW${i} rule ${i + 10} destination address ${a.dst}`);
    });
  } else if (vendor === 'openwrt') {
    lines.push(`uci set system.@system[0].hostname=${hostname}`);
    withIp.forEach((p: any) => lines.push(`uci set network.${p.name}.ipaddr=${cidrOf(p.ipAddress).split('/')[0]}`));
    if (mem.dnsServers.length > 0) lines.push(`uci set network.wan.dns=${mem.dnsServers.join(' ')}`);
    mem.routes.forEach((r: any, i: number) => {
      lines.push(`uci set network.route${i + 1}=route`);
      lines.push(`uci set network.route${i + 1}.target=${r.dst}`);
      lines.push(`uci set network.route${i + 1}.gateway=${r.gateway}`);
    });
    mem.dhcpPools.forEach((p: any) => {
      const rm = String(p.range || '').match(/(\d+\.\d+\.\d+\.\d+)\s*-\s*(\d+\.\d+\.\d+\.\d+)/);
      lines.push('uci set dhcp.lan=dhcp');
      if (p.iface) lines.push(`uci set dhcp.lan.interface=${p.iface}`);
      if (rm) {
        const startOct = rm[1].split('.')[3];
        const endOct = rm[2].split('.')[3];
        lines.push(`uci set dhcp.lan.start=${startOct}`);
        lines.push(`uci set dhcp.lan.limit=${Number(endOct) - Number(startOct) + 1}`);
      }
      lines.push('uci commit dhcp');
    });
    mem.natRules.forEach((r: any, i: number) => {
      if (r.chain === 'srcnat') {
        lines.push('uci set firewall.@zone[1].masq=1');
        lines.push('uci commit firewall');
      }
      if (r.chain === 'dstnat' && r.dstPort && r.toAddresses) {
        lines.push('uci add firewall redirect');
        lines.push(`uci set firewall.@redirect[0].dest_ip=${r.toAddresses}`);
        if (r.toPorts) lines.push(`uci set firewall.@redirect[0].dest_port=${r.toPorts}`);
        lines.push(`uci set firewall.@redirect[0].src_dport=${r.dstPort}`);
        lines.push('uci set firewall.@redirect[0].target=DNAT');
        lines.push('uci commit firewall');
      }
    });
    lines.push('uci commit');
  } else if (vendor === 'linux') {
    lines.push(`hostname ${hostname}`);
    withIp.forEach((p: any) => lines.push(`ip addr add ${cidrOf(p.ipAddress)} dev ${p.name}`));
    mem.routes.forEach((r: any) => lines.push(`ip route add ${r.dst} via ${r.gateway}`));
    (mem.dnsServers || []).forEach((s: string) => lines.push(`echo "nameserver ${s}" > /etc/resolv.conf`));
    mem.dnsRecords.forEach((r: any) => lines.push(`echo "${r.address} ${r.name}" >> /etc/hosts`));
    mem.dhcpPools.forEach((p: any) => {
      const rm = String(p.range || '').match(/(\d+\.\d+\.\d+\.\d+)\s*-\s*(\d+\.\d+\.\d+\.\d+)/);
      if (rm) {
        const net = p.network ? cidrOf(p.network).split('/')[0] : '0.0.0.0';
        lines.push(`echo "subnet ${net} netmask 255.255.255.0 { range ${rm[1]} ${rm[2]}; option routers ${p.gateway || '0.0.0.0'}; }" > /etc/dhcp/dhcpd.conf`);
        lines.push('systemctl start isc-dhcp-server');
      }
    });
    mem.natRules.forEach((r: any) => {
      if (r.chain === 'srcnat') lines.push(`iptables -t nat -A POSTROUTING -o ${r.outInterface || 'eth0'} -j MASQUERADE`);
      if (r.chain === 'dstnat') {
        const line = `iptables -t nat -A PREROUTING -i ${r.outInterface || 'eth0'} -p ${r.protocol || 'tcp'} --dport ${r.dstPort} -j DNAT --to-destination ${r.toAddresses}${r.toPorts ? ':' + r.toPorts : ''}`;
        lines.push(line);
      }
    });
    if (mem.webServer) {
      if (mem.webServer.content) lines.push(`echo "${mem.webServer.content}" > /var/www/html/index.html`);
      if (mem.webServer.enabled === false) lines.push('systemctl stop nginx');
    }
  } else {
    lines.push(`! Running configuration`);
    lines.push(`hostname ${hostname}`);
    if (vendor === 'cisco_ios' || vendor === 'cisco_nxos' || vendor === 'aruba') {
      if (mem.dnsServers.length > 0) lines.push(`ip name-server ${mem.dnsServers.join(' ')}`);
      if (mem.vlans.length > 0) {
        mem.vlans.forEach((v: any) => {
          lines.push(`vlan ${v.id}`);
          lines.push(` name ${v.name || 'VLAN' + v.id}`);
        });
      }
      mem.dhcpPools.forEach((p: any) => {
        lines.push(`ip dhcp pool ${p.name}`);
        if (p.network) lines.push(` network ${p.network}`);
        if (p.gateway) lines.push(` default-router ${p.gateway}`);
      });
    }
    withIp.forEach((p: any) => {
      lines.push(`interface ${p.name}`);
      lines.push(` ip address ${maskedPair(p.ipAddress)}`);
      lines.push(` ${(mem.shutdownIfaces || []).includes(p.name) ? 'shutdown' : 'no shutdown'}`);
    });
    (mem.subinterfaces || []).forEach((s: any) => {
      lines.push(`interface ${s.name}`);
      lines.push(` encapsulation dot1q ${s.vlanId}`);
      lines.push(` no shutdown`);
    });
    (mem.trunkPorts || []).forEach((name: string) => {
      lines.push(`interface ${name}`);
      lines.push(` switchport mode trunk`);
    });
    mem.routes.forEach((r: any) => {
      lines.push(`ip route ${r.dst} ${r.gateway}`);
    });
    // IPv6: alamat per interface + rute statis
    Object.entries(mem.configuredIps6 || {}).forEach(([name, addr]: [string, any]) => {
      lines.push(`interface ${name}`);
      lines.push(` ipv6 address ${addr}`);
    });
    (mem.routes6 || []).forEach((r: any) => {
      lines.push(`ipv6 route ${r.dst} ${r.gateway}`);
    });
    // VRRP/HSRP: virtual IP di interface
    (mem.fhrpGroups || []).forEach((g: any) => {
      lines.push(`interface ${g.interface || 'ether1'}`);
      const ipOnly = String(g.virtualAddress || '').split('/')[0];
      if (ipOnly && ipOnly !== '0.0.0.0') lines.push(` vrrp ${g.vrid || 1} ip ${ipOnly}`);
      lines.push(` vrrp ${g.vrid || 1} priority ${g.priority ?? 100}`);
    });
  }
  return lines.join('\n');
}
