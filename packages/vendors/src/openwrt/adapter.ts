// GENERATED — adapter vendor openwrt (diekstraksi dari index.ts lama).
import { CLIParser } from '../../../cli/src/index';
import type { NormalizedCommand } from '../../../cli/src/index';
import type { CommandResult, VendorAdapter as _IV } from '../common/types';
import { recordArray, recordObject } from '../common/types';

import { isPrefix, broadcastOf, cidrOf, bitsToMask } from '../common/ip';
import { uciNetworkLines, formatExtended } from '../common/format';
import { portOperational } from '../common/state';

export class OpenwrtVendorAdapter implements _IV {
  vendorId = 'openwrt';
  vendorName = 'OpenWrt';
  promptTemplate = 'root@OpenWrt:~#';
  private parser = new CLIParser();

  parseSyntax(rawInput: string): NormalizedCommand {
    const ast = this.parser.parse(rawInput);
    const action = String(ast.command).toLowerCase();
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

  formatResponse(cmdResult: CommandResult | undefined): string {
    if (!cmdResult) return '';
    if (cmdResult.type === 'uci_show') {
      // Output derived dari state tersimpan — tidak ada fabricasi lan/wan default.
      const lines: string[] = [];
      const net = uciNetworkLines(recordObject(cmdResult.mem) || {});
      if (net.length > 0) lines.push(...net);
      const pools = recordArray(cmdResult.pools).filter((p) => p && p.name);
      pools.forEach((p) => {
        lines.push(`dhcp.${String(p.name)}=dhcp`);
        if (p.iface) lines.push(`dhcp.${String(p.name)}.interface='${String(p.iface)}'`);
        if (p.range) {
          const rm = String(p.range).match(/(\d+\.\d+\.\d+\.\d+)\s*-\s*(\d+\.\d+\.\d+\.\d+)/);
          if (rm) {
            lines.push(`dhcp.${String(p.name)}.start='${String(Number(rm[1].split('.')[3]))}'`);
            lines.push(`dhcp.${String(p.name)}.limit='${String(Number(rm[2].split('.')[3]) - Number(rm[1].split('.')[3]) + 1)}'`);
          }
        }
        lines.push(`dhcp.${String(p.name)}.leasetime='12h'`);
      });
      const srcnat = recordArray(cmdResult.natRules).filter((r) => r.chain === 'srcnat');
      if (srcnat.length > 0) {
        lines.push('firewall.@zone[1]=zone');
        lines.push("firewall.@zone[1].masq='1'");
      }
      (cmdResult.hostname ? [`system.@system[0]=system`, `system.@system[0].hostname='${String(cmdResult.hostname)}'`] : []).forEach((l) => lines.push(l));
      return lines.length > 0 ? lines.join('\n') : '(uci: belum ada konfigurasi yang tersimpan)';
    }
    if (cmdResult.type === 'uci_network_show') {
      const lines = uciNetworkLines(recordObject(cmdResult.mem) || {});
      return lines.length > 0 ? lines.join('\n') : '(uci show network: belum ada konfigurasi interface)';
    }
    if (cmdResult.type === 'ip_addr') {
      const ports = (cmdResult.ports || []) as Array<Record<string, unknown>>;
      if (ports.length === 0) {
        return '(ip addr: tidak ada interface yang terdeteksi)';
      }
      return ports.map((p, i: number) => {
        const ip = p.ipAddress ? String(p.ipAddress).split('/')[0] : undefined;
        const prefix = p.ipAddress ? (String(p.ipAddress).split('/')[1] || '24') : undefined;
        const op = portOperational(p, (cmdResult.shutdownIfaces || []) as string[]);
        const up = op.up;
        return [
          `${String(i + 2)}: ${String(p.name)}: <BROADCAST,MULTICAST,${String(up ? 'UP,LOWER_UP' : 'DOWN')}> mtu 1500 qdisc noqueue state ${String(up ? 'UP' : 'DOWN')}`,
          `    link/ether ${String(p.macAddress || '00:00:00:00:00:00')} brd ff:ff:ff:ff:ff:ff`,
          ...(ip ? [`    inet ${String(ip)}/${String(prefix)} brd ${String(broadcastOf(ip, Number(prefix) || 24))} scope global ${String(p.name)}`] : []),
        ].join('\n');
      }).join('\n\n');
    }
    if (cmdResult.type === 'ip_route') {
      const routes = (cmdResult.routes || []) as Array<Record<string, unknown>>;
      if (routes.length === 0) return '(route table empty — tidak ada jaringan yang dikonfigurasi)';
      return routes.map((r) => {
        const dst = r.dst === '0.0.0.0/0' || r.dst === 'default' ? 'default' : r.dst;
        return `${String(dst)}${r.gateway ? ` via ${String(r.gateway)}` : ''} dev ${String(r.iface || 'br-lan')}`;
      }).join('\n');
    }
    if (cmdResult.type === 'ifconfig') {
      const ports = (cmdResult.ports || []) as Array<Record<string, unknown>>;
      return ports.map((p) => {
        const raw = p.ipAddress ? cidrOf(String(p.ipAddress)) : '';
        const [ip, pref] = raw.split('/');
        const mask = ip ? bitsToMask(Number(pref) || 24) : '0.0.0.0';
        const bc = ip ? broadcastOf(ip, Number(pref) || 24) : '0.0.0.0';
        return `${String(p.name)}: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500\n        inet ${String(ip || '0.0.0.0')}  netmask ${String(mask)}  broadcast ${String(bc)}\n        ether ${String(p.macAddress || '00:00:00:00:00:00')}  txqueuelen 1000  (Ethernet)`;
      }).join('\n\n');
    }
    if (cmdResult.type === 'logread') {
      return `Mar  7 00:00:01 OpenWrt kernel: [    0.000000] Linux version 5.15.137\nMar  7 00:00:02 OpenWrt netifd: lo: set_interface_up\nMar  7 00:00:03 OpenWrt netifd: br-lan: set_interface_up`;
    }
    if (cmdResult.type === 'ping') {
      const host = cmdResult.host || '';
      return `PING ${String(host)} (${String(host)}): simulation engine not available in this context. Use the NetLab ping panel.`;
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
