// ============================================================
// SmartCli — saran command saat user salah ketik ("Did you mean").
// Basis data command per vendor; jarak Levenshtein untuk saran.
// ============================================================

import { VendorId } from './types';

const COMMANDS: Record<VendorId, string[]> = {
  mikrotik: [
    '/ip address add',
    '/ip address print',
    '/ip route add',
    '/ip route print',
    '/ip dhcp-client add',
    '/ip dhcp-server setup',
    '/ip dhcp-server network add',
    '/ip firewall nat add',
    '/ip firewall nat print',
    '/ip firewall filter add',
    '/ip firewall filter print',
    '/ip dns set',
    '/ip dns static add',
    '/ip service print',
    '/interface set',
    '/interface enable',
    '/interface vlan add',
    '/interface bridge port add',
    '/routing ospf instance set',
    '/routing rip set',
    '/interface wireless security-profiles set',
    '/queue simple add',
  ],
  cisco: [
    'show ip interface brief',
    'show ip route',
    'show arp',
    'show mac address-table',
    'show vlan brief',
    'show interfaces status',
    'ip address',
    'ip route 0.0.0.0 0.0.0.0',
    'ip dhcp pool',
    'ip nat inside source list',
    'access-list',
    'ip access-group',
    'switchport mode trunk',
    'switchport access vlan',
    'interface gigabitethernet',
    'no shutdown',
    'enable',
    'configure terminal',
  ],
  huawei: [
    'display ip interface brief',
    'display ip routing-table',
    'display arp',
    'display mac-address',
    'display vlan',
    'display interface brief',
    'ip address',
    'ip route-static',
    'port link-type trunk',
    'port link-type access',
    'port default vlan',
    'nat outbound',
    'acl number',
    'undo shutdown',
    'system-view',
  ],
  juniper: [
    'show configuration interfaces',
    'show route',
    'show arp',
    'show ethernet-switching table',
    'show vlans',
    'set interfaces',
    'set routing-options static route',
    'set security nat source',
    'set vlans',
    'commit',
  ],
  linux: [
    'ip addr add',
    'ip addr show',
    'ip route add',
    'ip route show',
    'ip link set up',
    'dhclient',
    'iptables -t nat -A POSTROUTING',
    'iptables -A INPUT',
    'ping',
    'curl',
    'traceroute',
    'cat /etc/resolv.conf',
    'systemctl restart dnsmasq',
  ],
  fortinet: [
    'config system interface',
    'config router static',
    'config firewall policy',
    'config system dns',
    'config system dhcp server',
    'config firewall vip',
    'get system interface',
    'get router info routing-table all',
    'execute ping',
  ],
};

export interface CliSuggestion {
  typed: string;
  vendor: VendorId;
  candidates: { command: string; distance: number }[];
  /** "Did you mean: /ip address" — null bila tidak ada kandidat dekat */
  best: { command: string; distance: number } | null;
}

/** Levenshtein distance (case-insensitive). */
export function levenshtein(a: string, b: string): number {
  const A = a.toLowerCase();
  const B = b.toLowerCase();
  if (A === B) return 0;
  const m = A.length;
  const n = B.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (A[i - 1] === B[j - 1] ? 0 : 1)
      );
      prev = tmp;
    }
  }
  return dp[n];
}

export class SmartCli {
  suggest(typed: string, vendor: VendorId = 'mikrotik'): CliSuggestion {
    const t = typed.trim();
    const list = COMMANDS[vendor] || [];
    const scored = list
      .map((c) => ({ command: c, distance: levenshtein(t, c) }))
      .filter((s) => s.distance <= Math.max(2, Math.floor(t.length * 0.4)))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);

    return { typed: t, vendor, candidates: scored, best: scored[0] ?? null };
  }

  /** Pesan "Did you mean:" — dipakai saat command tidak dikenal. */
  respond(typed: string, vendor: VendorId = 'mikrotik'): string {
    const s = this.suggest(typed, vendor);
    if (!s.best) {
      return `Perintah tidak dikenali: "${typed}". Ketik /? untuk daftar command.`;
    }
    return `Did you mean:\n\n${s.candidates.map((c) => `  ${c.command}`).join('\n')}`;
  }
}
