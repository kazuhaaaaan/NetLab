// GENERATED — adapter vendor juniper (diekstraksi dari index.ts lama).
import { CLIParser } from '../../../cli/src/index';
import type { NormalizedCommand } from '../../../cli/src/index';
import type { CommandResult, VendorAdapter as _IV } from '../common/types';

import { isPrefix, cidrOf } from '../common/ip';
import { portOperational } from '../common/state';
import { formatExtended } from '../common/format';

export class JuniperVendorAdapter implements _IV {
  vendorId = 'juniper';
  vendorName = 'Juniper JunOS';
  promptTemplate = 'admin@JunOS> ';
  private parser = new CLIParser();

  parseSyntax(rawInput: string): NormalizedCommand {
    const ast = this.parser.parse(rawInput);
    const action = String(ast.command).toLowerCase();
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

  formatResponse(cmdResult: CommandResult | undefined): string {
    if (!cmdResult) return '';
    if (cmdResult.type === 'show_interfaces_terse') {
      const ports = (cmdResult.ports || []) as Array<Record<string, unknown>>;
      const shutdown = (cmdResult.shutdownIfaces || []) as string[];
      const header = 'Interface               Admin Link Proto    Local                 Remote\n';
      const rows = ports.map((p) => {
        const op = portOperational(p, shutdown);
        const link = op.up ? 'up   ' : 'down ';
        const admin = op.label === 'administratively down' ? 'down' : 'up';
        return `${String(String(p.name).padEnd(24))}${String(admin)}   ${String(link)} inet     ${String(op.up ? String(p.ipAddress || '') : '')}`.padEnd(70);
      }).join('\n');
      return header + rows;
    }
    if (cmdResult.type === 'show_interfaces') {
      const ports = (cmdResult.ports || []) as Array<Record<string, unknown>>;
      const shutdown = (cmdResult.shutdownIfaces || []) as string[];
      const blocks = ports.map((p) => {
        const op = portOperational(p, shutdown);
        const link = op.up ? 'Up' : 'Down';
        const admin = op.label === 'administratively down' ? 'Administratively Down' : 'Up';
        const inet = op.up && p.ipAddress ? `\n    Protocol inet, MTU: 1500\n      Addresses, Flags: Is-Preferred Is-Primary\n        Destination: ${String(p.ipAddress)}, Local: ${String(cidrOf(String(p.ipAddress)))}` : '';
        return [
          `Physical interface: ${String(p.name)}, ${String(admin)}, Physical link is ${String(link)}`,
          `  Interface index: 128, SNMP ifIndex: ${String(String(p.name).split('-')[1] || 0)}`,
          `  Type: Ethernet, MTU: 1500, Speed: 1Gbps`,
          `  Device flags: Present Running${String(op.up ? '' : ' Down')}`,
          `  Link flags: None`,
          `  Logical interface ${String(p.name)}.0 (Index 68) (SNMP ifIndex 69)`,
          `    Flags: Up SNMP-Traps 0x4004000 Encapsulation: ENET2`,
          `    Input packets : 0`,
          `    Output packets: 0${String(inet)}`,
        ].join('\n');
      });
      return blocks.join('\n\n');
    }
    if (cmdResult.type === 'show_route') {
      const routes = (cmdResult.routes || []) as Array<Record<string, unknown>>;
      if (routes.length === 0) return 'inet.0: 0 destinations, 0 routes (0 active, 0 holddown, 0 hidden)';
      const rows = routes.map((r, i: number) => {
        const via = r.gateway ? `> to ${String(r.gateway)} via ${String(r.iface || 'ge-0/0/0.0')}` : `> directly connected via ${String(r.iface || 'ge-0/0/0.0')}`;
        const proto = r.kind === 'static' ? 'Static' : r.kind === 'dynamic' ? 'OSPF' : 'Direct';
        return [r.dst, `          *[${String(proto)}/5] 00:12:34, metric 0`, '            ' + via].join(' ');
      });
      return `inet.0: ${String(routes.length)} destinations, ${String(routes.length)} routes (${String(routes.length)} active, 0 holddown, 0 hidden)\n\n` + rows.join('\n');
    }
    if (cmdResult.type === 'show_bgp_summary') {
      const peers = (cmdResult.peers || []) as Array<Record<string, unknown>>;
      const asn = cmdResult.asn || 0;
      const routerId = cmdResult.routerId || '0.0.0.0';
      if (peers.length === 0) {
        return `Groups: 0 Peers: 0 Down peers: 0\n\nRouter ID: ${String(routerId)}  Local AS: ${String(asn)}`;
      }
      const head = [
        `Groups: ${String(peers.length)} Peers: ${String(peers.length)} Down peers: 0`,
        `Table          Tot Paths  Act Paths Suppressed    History Damp State    Pending`,
        `inet.0              `,
        '',
      ];
      const rows = peers.map((p) => {
        const state = String(p.state === 'Established' || p.state === 'Establ' ? 'Establ' : p.state || 'Idle');
        const updown = state === 'Establ' ? (String(p.uptime || '00:12:34')) : 'never';
        const pref = state === 'Establ' ? `${String(p.prefixes ?? 0)}/0/0/0` : '0/0/0/0';
        const flag = state === 'Establ' ? 'E' : ' ';
        return `  ${String(p.remoteAddr || '0.0.0.0')}  ${String(String(p.remoteAs || 0).padStart(6))}   ${String(flag)}      10       10       0      0  ${String(updown.padEnd(11))} ${String(state)} ${String(pref)}`;
      });
      return head.concat(rows).join('\n');
    }
    if (cmdResult.type === 'show_version') {
      const model = cmdResult.model || 'mx240';
      const hostname = cmdResult.hostname || 'router';
      return [
        'Junos: 22.2R1.9',
        'JUNOS OS Kernel 64-bit [20240115.050253_builder_stable_12]',
        `Hostname: ${String(hostname)}`,
        `Model: ${String(model)}`,
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
      return [`PING ${String(host)}: 56 data bytes`,
        `64 bytes from ${String(host)}: icmp_seq=0 ttl=255 time=0.412 ms`,
        `64 bytes from ${String(host)}: icmp_seq=1 ttl=255 time=0.389 ms`,
        ``,
        `--- ${String(host)} ping statistics ---`,
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
