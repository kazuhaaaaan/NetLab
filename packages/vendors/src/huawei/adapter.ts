// GENERATED — adapter vendor huawei (diekstraksi dari index.ts lama).
import { CLIParser } from '../../../cli/src/index';
import type { NormalizedCommand } from '../../../cli/src/index';
import type { CommandResult, VendorAdapter as _IV } from '../common/types';

import { isPrefix } from '../common/ip';
import { portOperational } from '../common/state';
import { formatExtended } from '../common/format';

export class HuaweiVendorAdapter implements _IV {
  vendorId = 'huawei';
  vendorName = 'Huawei VRP';
  promptTemplate = '<Huawei>';
  private parser = new CLIParser();

  parseSyntax(rawInput: string): NormalizedCommand {
    const ast = this.parser.parse(rawInput);
    const action = String(ast.command).toLowerCase();
    const subs = ast.subCommands.map(s => s.toLowerCase());
    if (isPrefix(action, 'display') || isPrefix(action, 'dis')) {
      if (isPrefix(subs[0], 'ip') && isPrefix(subs[1], 'interface')) return { action: 'display_ip_int', target: 'vrp', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'ip') && isPrefix(subs[1], 'routing-table')) return { action: 'display_routing', target: 'vrp', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'current-configuration') || isPrefix(subs[0], 'cu')) return { action: 'display_current', target: 'vrp', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'vlan')) return { action: 'vlan_print', target: 'vrp', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'version')) return { action: 'display_version', target: 'vrp', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'ospf') && isPrefix(subs[1], 'peer')) return { action: 'display_ospf_peer', target: 'vrp', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'lldp') && isPrefix(subs[1], 'neighbor')) return { action: 'show_lldp_neighbors', target: 'vrp', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'mac-address')) return { action: 'display_mac', target: 'vrp', payload: { raw: rawInput, ast } };
      if (isPrefix(subs[0], 'arp')) return { action: 'display_arp', target: 'vrp', payload: { raw: rawInput, ast } };
    }
    if (isPrefix(action, 'system-view') || isPrefix(action, 'sys')) return { action: 'system_view', target: 'vrp', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'ping')) return { action: 'ping', target: 'vrp', payload: { raw: rawInput, ast, host: subs[0] } };
    if (isPrefix(action, 'save')) return { action: 'save', target: 'vrp', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'quit')) return { action: 'quit', target: 'vrp', payload: { raw: rawInput, ast } };
    return { action: action || 'EXEC_COMMAND', target: 'vrp', payload: { raw: rawInput, ast } };
  }

  formatResponse(cmdResult: CommandResult | undefined): string {
    if (!cmdResult) return '';
    if (cmdResult.type === 'display_ip_int') {
      const ports = (cmdResult.ports || []) as Array<Record<string, unknown>>;
      const shutdown = (cmdResult.shutdownIfaces || []) as string[];
      const rows = ports.map((p) => {
        const op = portOperational(p, shutdown);
        return `${String(p.name)}\n  Internet Address is ${String(op.up ? p.ipAddress || 'unassigned' : 'unassigned')}\n  Physical is ${String(op.label)}, line protocol is ${String(op.up ? 'up' : 'down')}`;
      }).join('\n\n');
      return rows || '-- No interfaces --';
    }
    if (cmdResult.type === 'display_routing') {
      const routes = (cmdResult.routes || []) as Array<Record<string, unknown>>;
      if (routes.length === 0) {
        return 'Route Flags: R - relay, D - download to fib\n------------------------------------------------------------------------------\nRouting Tables: Public\n         Destinations : 0        Routes : 0\n\nDestination/Mask    Proto   Pre  Cost      Flags NextHop         Interface';
      }
      const kindToProto: Record<string, string> = { connected: 'Direct', static: 'Static', dynamic: 'OSPF' };
      const rows = routes.map((r) => {
        const dst = String(r.dst || '').padEnd(20);
        const proto = String(kindToProto[String(r.kind)] || String(r.kind) || 'Direct').padEnd(6);
        const pre = String(r.kind === 'connected' ? 0 : r.kind === 'static' ? 60 : 10).padEnd(4);
        const flags = String(r.kind === 'connected' ? 'D' : 'D').padEnd(6);
        const nh = String(r.gateway || '').padEnd(14);
        const iface = r.iface || '';
        return `${String(dst)}  ${String(proto)} ${String(pre)}  ${String(r.distance ?? 0)}          ${String(flags)} ${String(nh)} ${String(iface)}`;
      }).join('\n');
      return [
        'Route Flags: R - relay, D - download to fib',
        '------------------------------------------------------------------------------',
        'Routing Tables: Public',
        `         Destinations : ${String(routes.length)}        Routes : ${String(routes.length)}`,
        '',
        'Destination/Mask    Proto   Pre  Cost      Flags NextHop         Interface',
        '------------------------------------------------------------------------------',
        rows,
      ].join('\n');
    }
    if (cmdResult.type === 'bgp_peer_print') {
      const peers = (cmdResult.peers || []) as Array<Record<string, unknown>>;
      const asn = cmdResult.asn ?? '';
      const routerId = cmdResult.routerId ?? '0.0.0.0';
      if (peers.length === 0) {
        return ` BGP local router ID : ${String(routerId)}\n Local AS number : ${String(asn)}\n Total number of peers : 0`;
      }
      const establishedCount = peers.filter((p) => p.state === 'Established').length;
      const rows = peers.map((p) => {
        const addr = String(p.remoteAddr || '0.0.0.0').padEnd(16);
        const state = p.state === 'Established' ? 'Established' : p.state || 'Idle';
        return `${String(addr)}  4   ${String(String(p.remoteAs || 0).padEnd(8))} 0        0        0 ${String(String(p.uptime || 'never').padEnd(10))} ${String(state)} ${String(p.prefixes || 0)}`;
      }).join('\n');
      return [
        ` BGP local router ID : ${String(routerId)}`,
        ` Local AS number : ${String(asn)}`,
        ` Total number of peers : ${String(peers.length)}                 Peers in established state : ${String(establishedCount)}`,
        '',
        '  Peer            V          AS  MsgRcvd  MsgSent  OutQ  Up/Down       State PrefRcv',
        '  ------------------------------------------------------------------------------------',
        rows,
      ].join('\n');
    }
    if (cmdResult.type === 'display_version' || cmdResult.type === 'show_version') {
      const model = cmdResult.model || 'Huawei AR6120';
      const hostname = cmdResult.hostname || 'Huawei';
      return ['Huawei Versatile Routing Platform Software',
        'VRP (R) software, Version 8.230 (AR6120 V300R023C10SPC300)',
        'Copyright (C) 2000-2024 Huawei Technologies Co., Ltd.',
        `${String(model)} uptime is 2 days, 14 hours, 22 minutes`,
        `Sysname: ${String(hostname)}`,
        'DRAM Memory Size    : 1024 M bytes',
        'Flash Memory Size   : 256 M bytes',
      ].join('\n');
    }
    if (cmdResult.type === 'display_mac' || cmdResult.type === 'mac_table') {
      const entries = (cmdResult.entries || []) as Array<Record<string, unknown>>;
      if (entries.length === 0) return 'Warning: The Mac address table is empty.\n';
      const rows = entries.map((e) => `${String(String(e.mac).padEnd(18))} dynamic     ${String(String(e.vlan ?? 1).padEnd(6))} ${String(e.port)}`).join('\n');
      return 'MAC address table (dynamic):\n-------------------------------------------------\nMAC               Type        VLAN    Port\n-------------------------------------------------\n' + rows + '\n-------------------------------------------------\n';
    }
    if (cmdResult.type === 'display_arp' || cmdResult.type === 'arp_table') {
      const entries = (cmdResult.entries || []) as Array<Record<string, unknown>>;
      if (entries.length === 0) return '  IP ADDRESS      MAC ADDRESS     EXPIRE(M) TYPE INTERFACE\n  --------------- --------------- ---------- ----------- ---------\n';
      const rows = entries.map((e) => `  ${String(String(e.ip).padEnd(15))} ${String(String(e.mac).padEnd(15))} 20          I        -`).join('\n');
      return '  IP ADDRESS      MAC ADDRESS     EXPIRE(M) TYPE INTERFACE\n  --------------- --------------- ---------- ----------- ---------\n' + rows;
    }
    if (cmdResult.type === 'system_view') return '[Huawei]';
    if (cmdResult.type === 'save') return 'The current configuration will be written to the device.\nAre you sure to continue?[Y/N]y\nInfo: Please input the file name ( *.cfg, *.zip ) [vrpcfg.zip]:\nNow saving the current configuration to the slot 0.\nSave the configuration successfully.';
    if (cmdResult.type === 'ping') {
      const host = cmdResult.host || '192.168.1.1';
      return [`PING ${String(host)}: 56  data bytes, press CTRL_C to break`,
        `  Reply from ${String(host)}: bytes=56 Sequence=1 ttl=254 time=1 ms`,
        `  Reply from ${String(host)}: bytes=56 Sequence=2 ttl=254 time=1 ms`,
        ``,
        `--- ${String(host)} ping statistics ---`,
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
