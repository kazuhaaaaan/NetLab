// GENERATED — adapter vendor aruba (diekstraksi dari index.ts lama).
import { CLIParser } from '../../../cli/src/index';
import type { NormalizedCommand } from '../../../cli/src/index';
import type { CommandResult, VendorAdapter as _IV } from '../common/types';

import { isPrefix } from '../common/ip';
import { portOperational } from '../common/state';
import { formatExtended } from '../common/format';

export class ArubaVendorAdapter implements _IV {
  vendorId = 'aruba';
  vendorName = 'Aruba ArubaOS-CX';
  promptTemplate = 'Aruba-CX-6300#';
  private parser = new CLIParser();

  parseSyntax(rawInput: string): NormalizedCommand {
    const ast = this.parser.parse(rawInput);
    const action = String(ast.command).toLowerCase();
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
      if (isPrefix(subs[0], 'mac') && isPrefix(subs[1], 'address-table')) return { action: 'show_mac_table', target: 'cx', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'ip') && isPrefix(subs[1], 'arp')) return { action: 'show_ip_arp', target: 'cx', payload: { raw: rawInput, ast } };
    }
    if (isPrefix(action, 'configure') || isPrefix(action, 'conf')) return { action: 'configure_terminal', target: 'cx', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'ping')) return { action: 'ping', target: 'cx', payload: { raw: rawInput, ast, host: subs[0] } };
    if (isPrefix(action, 'write')) return { action: 'write_mem', target: 'cx', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'ip') && isPrefix(subs[0], 'address')) return { action: 'add_ip', target: 'cx', payload: { raw: rawInput, ast, ip: subs[1], mask: subs[2] } };
    return { action: action || 'EXEC_COMMAND', target: 'cx', payload: { raw: rawInput, ast } };
  }

  formatResponse(cmdResult: CommandResult | undefined): string {
    if (!cmdResult) return '';
    if (cmdResult.type === 'show_int_brief') {
      const ports = (cmdResult.ports || []) as Array<Record<string, unknown>>;
      const shutdown = (cmdResult.shutdownIfaces || []) as string[];
      const header = 'Interface     Admin  Link   Speed  Description\n------------- ------ ------ ------  -----------\n';
      const rows = ports.map((p) => {
        const op = portOperational(p, shutdown);
        const admin = op.label === 'administratively down' ? 'down' : 'up';
        const link = op.up ? 'up   ' : op.label === 'not connected' ? 'down ' : 'down ';
        return `${String(String(p.name).padEnd(14))}${String(admin.padEnd(6))}${String(link)}  1000M  `;
      }).join('\n');
      return header + rows;
    }
    if (cmdResult.type === 'show_ip_int') {
      const ports = (cmdResult.ports || []) as Array<Record<string, unknown>>;
      const shutdown = (cmdResult.shutdownIfaces || []) as string[];
      if (ports.length === 0) return '';
      const rows = ports.map((p) => {
        const op = portOperational(p, shutdown);
        return `${String(String(p.name).padEnd(14))} ${String(op.up ? String(p.ipAddress || 'unassigned').padEnd(18) : 'unassigned          ')} ${String(op.up ? 'up' : 'down')}`;
      }).join('\n');
      return ['Interface      IP Address          Status',
        '------------- ------------------ -----------',
        rows].join('\n');
    }
    if (cmdResult.type === 'show_version') {
      return 'ArubaOS-CX 10.13.1000\nArubaOS-CX (build 2024010101)\nCopyright (C) 2024 Hewlett Packard Enterprise Development LP\nModel: 6300M-48G4X\nSerial Number: SG11KKQ001';
    }
    if (cmdResult.type === 'mac_table') {
      const entries = (cmdResult.entries || []) as Array<Record<string, unknown>>;
      if (entries.length === 0) return 'VLAN      MAC               Type       Port\n--------  ----------------  ---------  ----\n';
      const rows = entries.map((e) => `${String(String(e.vlan ?? 1).padEnd(10))} ${String(String(e.mac).padEnd(16))} dynamic    ${String(e.port)}`).join('\n');
      return 'VLAN      MAC               Type       Port\n--------  ----------------  ---------  ----\n' + rows;
    }
    if (cmdResult.type === 'arp_table') {
      const entries = (cmdResult.entries || []) as Array<Record<string, unknown>>;
      if (entries.length === 0) return 'IPv4 Address      MAC Address       Type        Port\n----------------  ----------------  ----------  ----\n';
      const rows = entries.map((e) => `${String(String(e.ip).padEnd(17))} ${String(String(e.mac).padEnd(16))} dynamic    Vlan1`).join('\n');
      return 'IPv4 Address      MAC Address       Type        Port\n----------------  ----------------  ----------  ----\n' + rows;
    }
    if (cmdResult.type === 'ping') {
      const host = cmdResult.host || '192.168.1.1';
      return `Sending 5, 100-byte ICMP Echos to ${String(host)}\n!!!!!\nSuccess rate is 100 percent (5/5), round-trip min/avg/max = 0/0/1 ms`;
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
