// GENERATED — adapter vendor cisco-nxos (diekstraksi dari index.ts lama).
import { CLIParser } from '../../../cli/src/index';
import type { NormalizedCommand } from '../../../cli/src/index';
import type { CommandResult, VendorAdapter as _IV } from '../common/types';

import { isPrefix } from '../common/ip';
import { portOperational, fmtMac } from '../common/state';
import { formatExtended } from '../common/format';

export class CiscoNxosVendorAdapter implements _IV {
  vendorId = 'cisco_nxos';
  vendorName = 'Cisco NX-OS';
  promptTemplate = 'nexus-sw#';
  private parser = new CLIParser();

  parseSyntax(rawInput: string): NormalizedCommand {
    const ast = this.parser.parse(rawInput);
    const action = String(ast.command).toLowerCase();
    const subs = ast.subCommands.map(s => s.toLowerCase());

    if (isPrefix(action, 'show')) {
      if (isPrefix(subs[0], 'ip') && isPrefix(subs[1], 'interface')) return { action: 'show_ip_int_brief', target: 'nxos', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'vlan')) return { action: 'show_vlan', target: 'nxos', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'interface') && isPrefix(subs[1], 'status')) return { action: 'show_int_status', target: 'nxos', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'version')) return { action: 'show_version', target: 'nxos', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'cdp') && isPrefix(subs[1], 'neighbors')) return { action: 'show_cdp_neighbors', target: 'nxos', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'lldp') && isPrefix(subs[1], 'neighbors')) return { action: 'show_lldp_neighbors', target: 'nxos', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'mac') && isPrefix(subs[1], 'address-table')) return { action: 'show_mac_table', target: 'nxos', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'ip') && isPrefix(subs[1], 'arp')) return { action: 'show_ip_arp', target: 'nxos', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'ip') && isPrefix(subs[1], 'ospf') && isPrefix(subs[2], 'neighbor')) return { action: 'show_ospf_neighbor', target: 'nxos', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'tcp') && isPrefix(subs[1], 'brief')) return { action: 'show_tcp_brief', target: 'nxos', payload: { raw: rawInput, ast } };
    }
    if (isPrefix(action, 'configure') || isPrefix(action, 'conf')) return { action: 'configure_terminal', target: 'nxos', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'ping')) return { action: 'ping', target: 'nxos', payload: { raw: rawInput, ast, host: subs[0] } };
    if (isPrefix(action, 'ip') && isPrefix(subs[0], 'address')) return { action: 'add_ip', target: 'nxos', payload: { raw: rawInput, ast, ip: subs[1], mask: subs[2] } };
    if (isPrefix(action, 'ip') && isPrefix(subs[0], 'route')) return { action: 'add_route', target: 'nxos', payload: { raw: rawInput, ast, dst: `${String(subs[1])} ${String(subs[2])}`, gw: subs[3] } };
    if (isPrefix(action, 'router') && isPrefix(subs[0], 'bgp')) return { action: 'bgp_router', target: 'nxos', payload: { raw: rawInput, ast, as: subs[1] } };
    if (isPrefix(action, 'neighbor') && isPrefix(subs[1], 'remote-as')) return { action: 'bgp_neighbor', target: 'nxos', payload: { raw: rawInput, ast, ip: subs[0], remoteAs: subs[2] } };
    return { action: action || 'EXEC_COMMAND', target: 'nxos', payload: { raw: rawInput, ast } };
  }

  formatResponse(cmdResult: CommandResult | undefined): string {
    if (!cmdResult) return '';
    if (cmdResult.type === 'show_ip_int_brief') {
      const ports = (cmdResult.ports || []) as Array<Record<string, unknown>>;
      const shutdown = (cmdResult.shutdownIfaces || []) as string[];
      const header = 'IP Interface Status for VRF "default"(1)\nInterface              IP Address      Interface Status\n';
      const rows = ports.map((p) => {
        const op = portOperational(p, shutdown);
        const st = op.up ? 'up/link-up' : op.label === 'administratively down' ? 'adm-down/down' : op.label === 'not connected' ? 'not-conn/down' : 'down/link-down';
        return `${String(String(p.name).padEnd(23))}${String((p.ipAddress ? String(p.ipAddress).split('/')[0] : 'unassigned').padEnd(16))}protocol-${String(st)}`;
      }).join('\n');
      return header + rows;
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
      if (entries.length === 0) return 'Legend:\n\t* - primary entry\n\nVlan    Mac Address       Type        Age    Secure NTFY Ports\n----    -----------       --------    ---    ------ ---- -----\n';
      const rows = entries.map((e) => `${String(String(e.vlan ?? 1).padEnd(7))} ${String(String(e.mac).padEnd(16))} dynamic     -      -      -    ${String(e.port)}`).join('\n');
      return 'Vlan    Mac Address       Type        Age    Secure NTFY Ports\n----    -----------       --------    ---    ------ ---- -----\n' + rows;
    }
    if (cmdResult.type === 'arp_table') {
      const entries = (cmdResult.entries || []) as Array<Record<string, unknown>>;
      if (entries.length === 0) return 'Flags: * - Adjacencies learnt on non-active FHRP interface\nIP ARP Adjacency Table\n';
      const rows = entries.map((e) => `* ${String(String(e.ip).padEnd(15))}  ${String(String(e.mac).padEnd(17))} Vlan1`).join('\n');
      return 'Flags: * - Adjacencies learnt on non-active FHRP interface\nIP ARP Adjacency Table\n' + rows;
    }
    if (cmdResult.type === 'show_version') {
      return 'Cisco Nexus Operating System (NX-OS) Software\nTAC support: http://www.cisco.com/tac\nNX-OS version: 9.3(8)\n';
    }
    if (cmdResult.type === 'int_status') {
      const ports = (cmdResult.ifaces || []) as Array<Record<string, unknown>>;
      const shutdown = (cmdResult.shutdownIfaces || []) as string[];
      const header = 'Port          Status    Vlan      Duplex  Speed Type\n';
      const rows = ports.map((p) => {
        const op = portOperational(p, shutdown);
        const status = op.up ? 'connected' : op.label === 'administratively down' ? 'adm-down' : op.label === 'not connected' ? 'notconnected' : 'down';
        const speedMbps = Number(p.speedMbps || 0);
        const speed = op.up ? (speedMbps > 0 && speedMbps <= 100 ? `${String(speedMbps)}Mb/s` : speedMbps >= 10000 ? '10G' : '1G') : '-';
        return `${String(String(p.name || '').padEnd(13))} ${String(status.padEnd(10))} ${String((p.vlan || (op.up ? '1' : '--')).toString().padEnd(9))} ${String(op.up ? 'full    ' : '')}${String(speed)}`;
      });
      return header + (rows.join('\n') || '-- no interfaces --');
    }
    if (cmdResult.type === 'show_interfaces') {
      const ports = (cmdResult.ports || []) as Array<Record<string, unknown>>;
      const shutdown = (cmdResult.shutdownIfaces || []) as string[];
      const lines: string[] = [];
      for (const p of ports) {
        const op = portOperational(p, shutdown);
        lines.push(
          `${String(p.name)} is ${String(op.label)}, line protocol is ${String(op.up ? 'up' : 'down')}${String(op.up ? ' (connected)' : '')}`,
          `  Hardware is GbE, address is ${String(fmtMac(String(p.macAddress || '005079666800')).replace(/\./g, '').toUpperCase())} (bia ${String(fmtMac(String(p.macAddress || '005079666800')).replace(/\./g, '').toUpperCase())})`,
          `  Internet address is ${String(p.ipAddress ? String(p.ipAddress).split('/')[0] + '/' + (String(p.ipAddress).split('/')[1] || 24) : 'unassigned')}`,
          `  MTU 1500 bytes, BW ${String((Number(p.speedMbps) || 1000) * 1000)} Kbit/sec, DLY 10 usec,`,
          ''
        );
      }
      return lines.join('\n') || '-- no interfaces --';
    }
    if (cmdResult.type === 'ping') {
      return `PING ${String(cmdResult.host)}: 56 data bytes\n64 bytes from ${String(cmdResult.host)}: icmp_seq=0 time=0.931 ms\n64 bytes from ${String(cmdResult.host)}: icmp_seq=1 time=0.712 ms\n--- ${String(cmdResult.host)} ping statistics ---\n2 packets transmitted, 2 packets received, 0.00% packet loss`;
    }
    if (cmdResult.type === 'help') return 'show, configure terminal, ping, copy run start';
    return String(cmdResult.raw ?? formatExtended(cmdResult) ?? '');
  }
}
