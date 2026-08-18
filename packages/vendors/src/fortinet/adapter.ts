// GENERATED — adapter vendor fortinet (diekstraksi dari index.ts lama).
import { CLIParser } from '../../../cli/src/index';
import type { NormalizedCommand } from '../../../cli/src/index';
import type { CommandResult, VendorAdapter as _IV } from '../common/types';

import { isPrefix } from '../common/ip';
import { formatExtended } from '../common/format';

export class FortinetVendorAdapter implements _IV {
  vendorId = 'fortinet';
  vendorName = 'Fortinet FortiOS';
  promptTemplate = 'FortiGate-60E #';
  private parser = new CLIParser();

  parseSyntax(rawInput: string): NormalizedCommand {
    const ast = this.parser.parse(rawInput);
    const action = String(ast.command).toLowerCase();
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

  formatResponse(cmdResult: CommandResult | undefined): string {
    if (!cmdResult) return '';
    if (cmdResult.type === 'get_system_status') {
      const model = cmdResult.model || 'FortiGate-60E';
      const hostname = cmdResult.hostname || 'FortiGate-60E';
      return [`Version: ${String(model)} v7.2.8,build1561,240307`,
        'Virus-DB: 1.00000(2024-03-07 15:48)',
        'IPS-DB: 6.00741(2015-12-01 02:30)',
        'Serial-Number: FGT60ETK17008187',
        'BIOS version: 05000007',
        `Hostname: ${String(hostname)}`,
        'System time: Tue Mar  7 15:48:00 2024',
      ].join('\n');
    }
    if (cmdResult.type === 'get_system_interface') {
      const ports = (cmdResult.ports || []) as Array<Record<string, unknown>>;
      return ports.map((p) =>
        `== [${String(p.name)}]\n\t\tmode: static\n\t\tip: ${String(p.ipAddress || '0.0.0.0 0.0.0.0')}\n\t\tstatus: ${String(p.status)}`
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
      return `PING ${String(host)} (${String(host)}): 56 data bytes\n64 bytes from ${String(host)}: icmp_seq=1 ttl=116 time=1.415 ms\n\n--- ${String(host)} ping statistics ---\n1 packets transmitted, 1 packets received, 0% packet loss\nround-trip min/avg/max = 1.415/1.415/1.415 ms`;
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
