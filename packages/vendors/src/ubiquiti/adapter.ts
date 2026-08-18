// GENERATED — adapter vendor ubiquiti (diekstraksi dari index.ts lama).
import { CLIParser } from '../../../cli/src/index';
import type { NormalizedCommand } from '../../../cli/src/index';
import type { CommandResult, VendorAdapter as _IV } from '../common/types';

import { isPrefix } from '../common/ip';
import { portOperational } from '../common/state';
import { formatExtended } from '../common/format';

export class UbiquitiVendorAdapter implements _IV {
  vendorId = 'ubiquiti';
  vendorName = 'Ubiquiti EdgeOS';
  promptTemplate = 'ubnt@EdgeRouter:~$';
  private parser = new CLIParser();

  parseSyntax(rawInput: string): NormalizedCommand {
    const ast = this.parser.parse(rawInput);
    const action = String(ast.command).toLowerCase();
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

  formatResponse(cmdResult: CommandResult | undefined): string {
    if (!cmdResult) return '';
    if (cmdResult.type === 'show_interfaces') {
      const ports = (cmdResult.ports || []) as Array<Record<string, unknown>>;
      const shutdown = (cmdResult.shutdownIfaces || []) as string[];
      const rows = ports.map((p) => {
        const op = portOperational(p, shutdown);
        return `${String(p.name)}      Link encap:Ethernet  HWaddr ${String(p.macAddress || '00:00:00:00:00:00')}\n          inet addr:${String(op.up ? p.ipAddress || 'unassigned' : 'unassigned')}  Bcast:0.0.0.0  Mask:255.255.255.0\n          ${String(op.up ? 'UP BROADCAST RUNNING MULTICAST' : op.label === 'administratively down' ? 'DOWN (administratively down)' : 'DOWN (not connected)')}  MTU:1500  Metric:1`;
      }).join('\n\n');
      return rows || '-- no interfaces --';
    }
    if (cmdResult.type === 'show_version') return 'EdgeOS v2.0.9.5247762.221128.1601\nBuild ID: 5247762\nBuild date: 2024-01-01';
    if (cmdResult.type === 'configure') return '[edit]\nubnt@EdgeRouter#';
    if (cmdResult.type === 'commit') return 'Commit complete.';
    if (cmdResult.type === 'ping') {
      const host = cmdResult.host || '192.168.1.1';
      return `PING ${String(host)} (${String(host)}) 56(84) bytes of data.\n64 bytes from ${String(host)}: icmp_seq=1 ttl=64 time=0.412 ms\n64 bytes from ${String(host)}: icmp_seq=2 ttl=64 time=0.389 ms\n\n--- ${String(host)} ping statistics ---\n2 packets transmitted, 2 received, 0% packet loss`;
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
