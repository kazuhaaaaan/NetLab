// GENERATED — adapter vendor cisco-ios (diekstraksi dari index.ts lama).
import { CLIParser } from '../../../cli/src/index';
import type { NormalizedCommand } from '../../../cli/src/index';
import type { CommandResult, VendorAdapter as _IV } from '../common/types';

import { isPrefix } from '../common/ip';
import { portOperational, fmtMac, rootIdStr } from '../common/state';
import { formatExtended } from '../common/format';

export class CiscoVendorAdapter implements _IV {
  vendorId = 'cisco_ios';
  vendorName = 'Cisco IOS';
  promptTemplate = 'Router#';
  private parser = new CLIParser();
  private configMode = false;

  parseSyntax(rawInput: string): NormalizedCommand {
    const ast = this.parser.parse(rawInput);
    let action = String(ast.command).toLowerCase();
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
      if (isPrefix(subs[0], 'mac') && isPrefix(subs[1], 'address-table')) return { action: 'show_mac_table', target: 'ios', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'ip') && isPrefix(subs[1], 'arp')) return { action: 'show_ip_arp', target: 'ios', payload: { raw: rawInput, ast } };
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

  formatResponse(cmdResult: CommandResult | undefined): string {
    if (!cmdResult) return '';
    if (cmdResult.type === 'show_ip_int_brief') {
      const ports = (cmdResult.ports || []) as Array<Record<string, unknown>>;
      const shutdown = (cmdResult.shutdownIfaces || []) as string[];
      const header = 'Interface              IP-Address      OK? Method Status                Protocol\n';
      const rows = ports.map((p) => {
        const op = portOperational(p, shutdown);
        return `${String(String(p.name).padEnd(23))}${String((p.ipAddress ? String(p.ipAddress).split('/')[0] : 'unassigned').padEnd(16))}YES unset  ${String(String(op.label).padEnd(20))}${String(op.up ? 'up' : 'down')}`;
      }).join('\n');
      return header + rows;
    }
    if (cmdResult.type === 'int_status') {
      const ports = (cmdResult.ifaces || []) as Array<Record<string, unknown>>;
      const shutdown = (cmdResult.shutdownIfaces || []) as string[];
      const header = 'Port          Name    Status       Vlan     Duplex  Speed Type\n';
      const rows = ports.map((p) => {
        const op = portOperational(p, shutdown);
        const status = op.up ? 'up' : op.label === 'not connected' ? 'notconn' : op.label === 'administratively down' ? 'adm-down' : 'down';
        const speedMbps = Number(p.speedMbps || 0);
        const speed = op.up ? (speedMbps > 0 && speedMbps <= 100 ? `${String(speedMbps)}Mb/s` : speedMbps >= 10000 ? '10G' : '1G') : '-';
        return `${String(String(p.name || '').padEnd(12))} ${String(' '.padEnd(7))} ${String(status.padEnd(12))} ${String((p.vlan || (op.up ? '1' : '--')).toString().padEnd(8))} ${String(op.up ? 'full' : '  ')}   ${String(speed)}`;
      });
      return header + (rows.join('\n') || '-- no interfaces --');
    }
    if (cmdResult.type === 'show_interfaces') {
      const ports = (cmdResult.ports || []) as Array<Record<string, unknown>>;
      const shutdown = (cmdResult.shutdownIfaces || []) as string[];
      const macOf = (p) => fmtMac(p.macAddress || '005079666800').toUpperCase();
      const lines: string[] = [];
      for (const p of ports) {
        const op = portOperational(p, shutdown);
        lines.push(
          `${String(p.name)} is ${String(op.label)}, line protocol is ${String(op.up ? 'up' : 'down')}${String(op.up ? ' (connected)' : '')}`,
          `  Hardware is GbE, address is ${String(macOf(p))} (bia ${String(macOf(p))})`,
          `  Internet address is ${String(p.ipAddress ? String(p.ipAddress).split('/')[0] + '/' + (String(p.ipAddress).split('/')[1] || 24) : 'unassigned')}`,
          `  MTU 1500 bytes, BW ${String((Number(p.speedMbps) || 1000) * 1000)} Kbit/sec, DLY 10 usec,`,
          ''
        );
      }
      return lines.join('\n') || '-- no interfaces --';
    }
    if (cmdResult.type === 'show_ip_route') {
      const routes = (cmdResult.routes || []) as Array<Record<string, unknown>>;
      const header = 'Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP\n       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area\n\nGateway of last resort is not set\n';
      const rows = routes.map((r) => {
        const code = r.kind === 'static' ? 'S' : r.kind === 'dynamic' ? 'O' : 'C';
        if (r.kind === 'connected') {
          return `${String(code)}    ${String(r.dst || '0.0.0.0/0')} is directly connected, ${String(r.iface || 'GigabitEthernet0/0')}`;
        }
        return `${String(code)}    ${String(r.dst || '0.0.0.0/0')} [1/0] via ${String(r.gateway || '0.0.0.0')}${r.iface ? `, ${String(r.iface)}` : ''}`;
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
        `${String(model)} (ARM64) processor (revision 1.0) with 1048576K/6147K bytes of memory.`,
        `Processor board ID FGL2217L0FN`,
        `Hostname: ${String(hostname)}`,
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
        `Sending 5, 100-byte ICMP Echos to ${String(host)}, timeout is 2 seconds:`,
        `!!!!!`,
        `Success rate is 100 percent (5/5), round-trip min/avg/max = 1/1/2 ms`,
      ].join('\n');
    }
    if (cmdResult.type === 'show_bgp_summary') {
      const peers = (cmdResult.peers || []) as Array<Record<string, unknown>>;
      const header = 'BGP router identifier ' + (cmdResult.routerId || '0.0.0.0') + ', local AS number ' + (cmdResult.asn || '0') + '\n\nNeighbor        V           AS MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  State/PfxRcd\n';
      const rows = peers.map((p) => {
        const pfx = p.state === 'Established' ? (p.prefixes ?? 0) : p.state;
        return `${String(String(p.remoteAddr || '0.0.0.0').padEnd(15))} 4        ${String(String(p.remoteAs || 0).padEnd(5))}    1255    1255       0    0    0  ${String(String(p.uptime || 'never').padEnd(8))} ${String(pfx)}`;
      });
      return header + (rows.join('\n') || 'No BGP neighbors configured.');
    }
    if (cmdResult.type === 'neighbor_print') {
      const neighbors = (cmdResult.neighbors || []) as Array<Record<string, unknown>>;
      if (cmdResult.proto === 'cdp') {
        const header = 'Capability Codes: R - Router, T - Trans Bridge, B - Source Route Bridge\n                  S - Switch, H - Host, I - IGMP, r - Repeater, P - Phone\n\nDevice ID        Local Intrfce   Holdtme  Capability  Platform  Port ID\n';
        const rows = neighbors.map((n) =>
          `${String(String(n.peerName || '?').padEnd(16))} ${String(String(n.localPort || '').padEnd(15))} 145    R S I       ${String(String(n.peerDeviceType || '').padEnd(9))} ${String(n.peerPort || '')}`
        );
        return header + (rows.join('\n') || 'Total cdp entries displayed : 0');
      }
      const header = 'Local Intf   Chassis-id      Port id   System Name\n';
      const rows = neighbors.map((n) =>
        `${String(String(n.localPort || '').padEnd(12))} ${String(String(n.peerName || '?').padEnd(15))} ${String(String(n.peerPort || '').padEnd(10))} ${String(n.peerName || '')}`
      );
      return header + (rows.join('\n') || 'Total entries displayed: 0');
    }
    if (cmdResult.type === 'ospf_neighbor_print') {
      const neighbors = (cmdResult.neighbors || []) as Array<Record<string, unknown>>;
      const header = 'Neighbor ID     Pri   State           Dead Time   Address         Interface\n';
      const rows = neighbors.map((n) =>
        `${String(String(n.routerId || '0.0.0.0').padEnd(15))}   1   ${String((String(n.state) === 'Full' ? 'FULL/  -' : (String(n.state || 'Down'))).padEnd(14))} 00:00:31    ${String(String(n.ip || '').padEnd(16))} ${String(n.iface || '')}`
      );
      return header + (rows.join('\n') || '(no OSPF neighbors)');
    }
    if (cmdResult.type === 'tcp_print') {
      const conns = (cmdResult.connections || []) as Array<Record<string, unknown>>;
      const header = 'TCB          Local Address               Foreign Address             (state)\n';
      const rows = conns.map((c, i: number) =>
        `${String(('0x' + (1000000 + i).toString(16)).padEnd(12))} ${String(String(String(c.localIp) + '.' + String(c.localPort)).padEnd(26))} ${String(String(String(c.remoteIp) + '.' + String(c.remotePort)).padEnd(28))} ${String(c.state)}`
      );
      return header + (rows.join('\n') || '(no active connections)');
    }
    if (cmdResult.type === 'show_vlan') {
      const vlans = (cmdResult.vlans || []) as Array<Record<string, unknown>>;
      const portLabel = (v) => {
        const p = (v.ports || []).map(String);
        return p.length > 0 ? p.join(', ') : '(none)';
      };
      const rows = vlans.length > 0
        ? vlans.map((v) => `${String(String(v.id).padEnd(4))} ${String(String(v.name || `VLAN${String(v.id)}`).padEnd(33))}active    ${String(portLabel(v))}`).join('\n')
        : '1    default                          active    (none)';
      return ['VLAN Name                             Status    Ports',
        '---- -------------------------------- --------- -------------------------------',
        rows,
      ].join('\n');
    }
    if (cmdResult.type === 'mac_table') {
      const entries = (cmdResult.entries || []) as Array<Record<string, unknown>>;
      if (entries.length === 0) return 'Mac Address Table\n-------------------------------------------\nVlan    Mac Address       Type        Ports\n----    -----------       --------    -----\n';
      const rows = entries.map((e) => `${String(String(e.vlan ?? 1).padEnd(7))} ${String(String(e.mac).padEnd(16))} DYNAMIC     ${String(e.port)}`).join('\n');
      return 'Mac Address Table\n-------------------------------------------\nVlan    Mac Address       Type        Ports\n----    -----------       --------    -----\n' + rows;
    }
    if (cmdResult.type === 'arp_table') {
      const entries = (cmdResult.entries || []) as Array<Record<string, unknown>>;
      if (entries.length === 0) return 'Protocol  Address          Age (min)  Hardware Addr   Type   Interface\n';
      const rows = entries.map((e) => `Internet  ${String(String(e.ip).padEnd(15))} -          ${String(String(e.mac).padEnd(15))} ARPA   Vlan1`).join('\n');
      return 'Protocol  Address          Age (min)  Hardware Addr   Type   Interface\n' + rows;
    }
    if (cmdResult.type === 'show_stp') {
      if (cmdResult.ports && cmdResult.ports.length > 0) {
        const modeLabel = cmdResult.mode === 'rapid-pvst' ? 'rapid-pvst' : cmdResult.mode === 'pvst' ? 'ieee (pvst)' : 'ieee';
        const isRoot = cmdResult.rootId === cmdResult.bridgeId;
        const lines = [
          'VLAN0001',
          `  Spanning tree enabled protocol ${String(modeLabel)}`,
          `  Root ID    Priority    ${String(String(cmdResult.priority + 1))}`,
          `             Address     ${String(fmtMac(rootIdStr(cmdResult.rootId)))}`,
          `             ${isRoot ? 'This bridge is the root' : `Cost        4`}`,
          `             ${String(isRoot ? '' : 'Port        ' + (cmdResult.rootPort || ''))}`,
          `  Bridge ID  Priority    ${String(String(cmdResult.priority))}`,
          `             Address     ${String(fmtMac(rootIdStr(cmdResult.bridgeId)))}`,
          'Interface           Role Sts Cost      Prio.Nbr Type',
          '------------------- ---- --- --------- -------- --------',
        ];
        for (const p of cmdResult.ports) {
          const pr = p as Record<string, unknown>;
          const role = pr.role === 'root' ? 'Root' : pr.role === 'designated' ? 'Desg' : pr.role === 'alternate' ? 'Altn' : 'Disa';
          const sts = pr.state === 'forwarding' ? 'FWD' : pr.state === 'blocking' ? 'BLK' : 'DIS';
          lines.push(`${String(String(pr.port || 'Port').padEnd(20))} ${String(role.padEnd(4))} ${String(sts.padEnd(3))} ${String(String(pr.cost ?? 4).padEnd(9))} 128.1    P2p${String(pr.state === 'blocking' ? ' *' : '')}`);
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
