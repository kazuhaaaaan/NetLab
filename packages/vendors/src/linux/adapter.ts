// GENERATED — adapter vendor linux (diekstraksi dari index.ts lama).
import { CLIParser } from '../../../cli/src/index';
import type { NormalizedCommand } from '../../../cli/src/index';
import type { CommandResult, VendorAdapter as _IV } from '../common/types';

import { isPrefix } from '../common/ip';
import { portOperational } from '../common/state';
import { formatExtended } from '../common/format';

export class LinuxDebianVendorAdapter implements _IV {
  vendorId = 'linux';
  vendorName = 'Debian GNU/Linux';
  promptTemplate = 'root@server:~#';
  private parser = new CLIParser();

  parseSyntax(rawInput: string): NormalizedCommand {
    const ast = this.parser.parse(rawInput);
    const action = String(ast.command).toLowerCase();
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

  formatResponse(cmdResult: CommandResult | undefined): string {
    if (!cmdResult) return '';
    const ports = (cmdResult.ports || []) as Array<Record<string, unknown>>;

    if (cmdResult.type === 'ip_addr') {
      const rows = ports.map((p, i: number) => {
        const ip = p.ipAddress ? String(p.ipAddress).split('/')[0] : undefined;
        const prefix = p.ipAddress ? (String(p.ipAddress).split('/')[1] || '24') : undefined;
        const op = portOperational(p, (cmdResult.shutdownIfaces || []) as string[]);
        return [
          `${String(i + 1)}: ${String(p.name)}: <BROADCAST,MULTICAST,${String(op.up ? 'UP,LOWER_UP' : 'DOWN')}> mtu 1500 qdisc mq state ${String(op.up ? 'UP' : 'DOWN')} group default qlen 1000`,
          `    link/ether ${String(p.macAddress || '00:00:00:00:00:00')} brd ff:ff:ff:ff:ff:ff`,
          ...(ip ? [
            `    inet ${String(ip)}/${String(prefix)} brd ${String(ip.replace(/\.\d+$/, '.255'))} scope global ${String(p.name)}`,
            `       valid_lft forever preferred_lft forever`,
          ] : []),
        ].join('\n');
      });
      return rows.join('\n') || '-- no interfaces --';
    }
    if (cmdResult.type === 'ifconfig' || cmdResult.type === 'show_ip_int_brief') {
      const rows = ports.map((p) => {
        const ip = p.ipAddress ? String(p.ipAddress).split('/')[0] : '0.0.0.0';
        return [
          `${String(p.name)}: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500`,
          `        inet ${String(ip)}  netmask 255.255.255.0  broadcast ${String(ip.replace(/\.\d+$/, '.255'))}`,
          `        ether ${String(p.macAddress || '00:00:00:00:00:00')}  txqueuelen 1000  (Ethernet)`,
          `        RX packets 42312  bytes 38924521 (37.1 MiB)`,
          `        TX packets 35891  bytes 21042311 (20.0 MiB)`,
        ].join('\n');
      });
      return rows.join('\n\n') || '-- no interfaces --';
    }
    if (cmdResult.type === 'ip_link') {
      const rows = ports.map((p, i: number) => {
        const op = portOperational(p, (cmdResult.shutdownIfaces || []) as string[]);
        return `${String(i + 1)}: ${String(p.name)}: <BROADCAST,MULTICAST,${String(op.up ? 'UP,LOWER_UP' : 'DOWN')}> mtu 1500 qdisc mq state ${String(op.up ? 'UP' : 'DOWN')} mode DEFAULT group default qlen 1000\n    link/ether ${String(p.macAddress || '00:00:00:00:00:00')} brd ff:ff:ff:ff:ff:ff`;
      });
      return rows.join('\n') || '';
    }
    if (cmdResult.type === 'ip_neigh') {
      const entries = (cmdResult.entries || []) as Array<Record<string, unknown>>;
      if (entries.length === 0) return 'arp cache empty — kirim ping dulu untuk belajar MAC';
      return entries.map((e) => `${String(e.ip)} dev eth0 lladdr ${String(e.mac)} REACHABLE`).join('\n');
    }
    if (cmdResult.type === 'ip_route' || cmdResult.type === 'show_ip_route') {
      const routes = (cmdResult.routes || []) as Array<Record<string, unknown>>;
      if (routes.length === 0) return 'default via 192.168.1.1 dev eth0 proto static metric 100\n192.168.1.0/24 dev eth0 proto kernel scope link src 192.168.1.10';
      return routes.map((r) => {
        const dst = r.dst === '0.0.0.0/0' || r.dst === 'default' ? 'default' : r.dst;
        const proto = r.kind === 'connected' ? 'kernel scope link' : 'static';
        const src = r.prefSrc ? ` src ${String(r.prefSrc)}` : '';
        return `${String(dst)}${r.gateway ? ` via ${String(r.gateway)}` : ''} dev ${String(r.iface || 'eth0')} proto ${String(proto)} metric 100${String(src)}`;
      }).join('\n');
    }
    if (cmdResult.type === 'tcp_print') {
      const conns = (cmdResult.connections || []) as Array<Record<string, unknown>>;
      const header = 'Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name\n';
      if (conns.length === 0) return header + '(no active connections)';
      const rows = conns.map((c) =>
        `tcp        0      0 ${String(String(c.localIp + ':' + c.localPort).padEnd(20))} ${String(String(c.remoteIp + ':' + c.remotePort).padEnd(22))} ${String(c.state)}      1234/app`
      );
      return header + rows.join('\n');
    }
    if (cmdResult.type === 'ss') {
      const conns = (cmdResult.connections || []) as Array<Record<string, unknown>>;
      const header = 'Netid  State   Recv-Q  Send-Q   Local Address:Port      Peer Address:Port  Process';
      if (conns.length === 0) return header + '\n(no active connections)';
      const rows = conns.map((c) =>
        `tcp    ${String(c.state === 'LISTEN' ? 'LISTEN' : 'ESTAB')} 0       0        ${String(String(c.localIp + ':' + c.localPort).padEnd(21))} ${String(String(c.remoteIp + ':' + c.remotePort).padEnd(20))}  users:(("app",pid=1234,fd=3))`
      );
      return header + '\n' + rows.join('\n');
    }
    if (cmdResult.type === 'netstat') {
      const conns = (cmdResult.connections || []) as Array<Record<string, unknown>>;
      const header = 'Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name';
      if (conns.length === 0) return header + '\n(no active connections)';
      const rows = conns.map((c) =>
        `tcp        0      0 ${String(String(c.localIp + ':' + c.localPort).padEnd(20))} ${String(String(c.remoteIp + ':' + c.remotePort).padEnd(22))} ${String(c.state)}      1234/app`
      );
      return header + '\n' + rows.join('\n');
    }
    if (cmdResult.type === 'traceroute') {
      const host = cmdResult.host || '8.8.8.8';
      return [
        `traceroute to ${String(host)} (${String(host)}), 30 hops max, 60 byte packets`,
        ` 1  192.168.1.1 (192.168.1.1)  0.312 ms  0.289 ms  0.301 ms`,
        ` 2  10.0.0.1 (10.0.0.1)  1.412 ms  1.389 ms  1.401 ms`,
        ` 3  ${String(host)} (${String(host)})  2.001 ms  1.998 ms  2.012 ms`,
      ].join('\n');
    }
    if (cmdResult.type === 'nslookup') {
      if (cmdResult.timedOut || !cmdResult.resolved) {
        return cmdResult.nxdomain
          ? `;; server can't find ${String(cmdResult.host)}: NXDOMAIN`
          : ';; connection timed out; no servers could be reached';
      }
      const host = cmdResult.host || 'google.com';
      return `Server:\t\t${String(cmdResult.server || '8.8.8.8')}\nAddress:\t${String(cmdResult.server || '8.8.8.8')}#53\n\nNon-authoritative answer:\nName:\t${String(host)}\nAddress: ${String(cmdResult.resolved)}`;
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
        `PING ${String(host)} (${String(host)}) 56(84) bytes of data.`,
        `64 bytes from ${String(host)}: icmp_seq=1 ttl=64 time=0.412 ms`,
        `64 bytes from ${String(host)}: icmp_seq=2 ttl=64 time=0.389 ms`,
        `64 bytes from ${String(host)}: icmp_seq=3 ttl=64 time=0.401 ms`,
        ``,
        `--- ${String(host)} ping statistics ---`,
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
      return `cat: ${String(path)}: No such file or directory`;
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
