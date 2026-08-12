/**
 * Command tree CLI NetLab — sumber kebenaran untuk:
 *  - command abbreviation (prefix matching, ambigu → error vendor-autentik)
 *  - TAB completion (common prefix + kandidat, context-aware per mode)
 *  - '?' help (kandidat per posisi)
 *
 * Setiap perintah direpresentasikan sebagai daftar kata; "<name>" = slot
 * nilai (satu token apa pun, dilewatkan apa adanya saat ekspansi).
 *
 * Resolusi per posisi:
 *   0 match  → bukan abbreviation → serahkan ke engine (raw, tanpa ubah apa pun)
 *   1 match  → jalan unik; bila ada kata yang disingkat → ekspansi kanonis
 *   >1 match → AMBIGU → error vendor, state TIDAK berubah
 *
 * Hanya vendor facade (mikrotik, cisco, juniper, huawei) yang memakai tree
 * ini; vendor lain tetap memakai hint/engine seperti sebelumnya.
 */

export type CliMode = 'exec' | 'config' | 'config-if';

/** Satu entri perintah: kata-kata (null = slot nilai) + bentuk kanonis + mode. */
export interface CommandEntry {
  words: (string | null)[];
  /** command kanonis untuk display/ekspansi (mis. 'show ip route' / '/ip address print'). */
  canonical: string;
}

export const VENDOR_MODES: Record<string, CliMode[]> = {
  mikrotik: ['exec'],
  cisco: ['exec', 'config', 'config-if'],
  juniper: ['exec', 'config'],
  huawei: ['exec', 'config', 'config-if'],
  aruba: ['exec', 'config', 'config-if'],
  vyos: ['exec', 'config'],
  ubiquiti: ['exec', 'config'],
  fortinet: ['exec'],
};

/** Kata-kata literal sebuah perintah kanonis ("<foo>" → slot nilai). */
function wordsOf(command: string, stripSlash = false): (string | null)[] {
  const parts = command.split(/\s+/).filter(Boolean);
  if (stripSlash && parts[0]?.startsWith('/')) parts[0] = parts[0].slice(1);
  return parts.map((w) => (/^<.*>$/.test(w) ? null : w.toLowerCase()));
}

function buildEntries(commands: string[], modes: CliMode[]): Record<CliMode, CommandEntry[]> {
  const byMode: Record<CliMode, CommandEntry[]> = { exec: [], config: [], 'config-if': [] };
  for (const cmd of commands) {
    const stripSlash = cmd.startsWith('/');
    const entry: CommandEntry = { words: wordsOf(cmd, stripSlash), canonical: cmd };
    for (const m of modes) byMode[m].push(entry);
  }
  return byMode;
}

// ── Trees per vendor ───────────────────────────────────────────────

const CISCO_EXEC_CMDS: string[] = [
  'enable',
  'configure terminal',
  'show running-config',
  'show interfaces',
  'show ip interface brief',
  'show ip route',
  'show ip bgp',
  'show ip dhcp pool',
  'show ip ospf neighbor',
  'show ip arp',
  'show version',
  'show vlan',
  'show spanning-tree',
  'show cdp neighbors',
  'show lldp neighbors',
  'show tcp brief',
  'show mac address-table',
  'show hosts',
  'ping <host>',
  'traceroute <host>',
  'write memory',
  'copy running-config startup-config',
  'reload',
];

const CISCO_CONFIG_CMDS: string[] = [
  ...CISCO_EXEC_CMDS.filter((c) => c.startsWith('show ') || c.startsWith('ping ') || c === 'write memory'),
  'hostname <name>',
  'interface <name>',
  'ip route <network> <mask> <next-hop>',
  'ip name-server <server>',
  'ip dhcp pool <name>',
  'ip dhcp excluded-address <address>',
  'no shutdown',
  'vlan <id>',
  'router bgp <asn>',
  'neighbor <address> remote-as <asn>',
  'spanning-tree mode <mode>',
  'exit',
  'end',
];

const CISCO_CONFIG_IF_CMDS: string[] = [
  ...CISCO_EXEC_CMDS.filter((c) => c.startsWith('show ') || c.startsWith('ping ')),
  'ip address <address> <mask>',
  'no shutdown',
  'exit',
  'end',
];

const MIKROTIK_CMDS: string[] = [
  '/ip address print',
  '/ip address add address=<address> interface=<interface>',
  '/ip route print',
  '/ip route add dst-address=<network> gateway=<gateway>',
  '/ip dns print',
  '/ip dns set servers=<servers>',
  '/ip dhcp-server print',
  '/ip dhcp-server add name=<name> interface=<interface> address-pool=<pool>',
  '/ip dhcp-client print',
  '/ip firewall nat print',
  '/ip firewall nat add chain=<chain> out-interface=<interface> action=<action>',
  '/ip neighbor print',
  '/ip service print',
  '/ip arp print',
  '/ip pool print',
  '/ip pool add name=<name> ranges=<ranges>',
  '/ip vrrp print',
  '/interface print',
  '/interface set name=<interface> disabled=<on-off>',
  '/interface vlan print',
  '/interface vlan add name=<name> vlan-id=<id> interface=<interface>',
  '/interface bridge print',
  '/interface wireless print',
  '/routing bgp instance print',
  '/routing bgp instance add as=<asn> router-id=<router-id>',
  '/routing bgp peer print',
  '/routing bgp peer add remote-address=<address> remote-as=<asn> name=<name>',
  '/routing bgp network print',
  '/routing ospf instance print',
  '/routing ospf instance add name=<name> router-id=<router-id>',
  '/routing ospf network print',
  '/routing ospf network add network=<network> area=<area>',
  '/routing ospf neighbor print',
  '/routing vrrp instance print',
  '/routing vrrp instance add name=<name> interface=<interface> vrid=<vrid> priority=<priority>',
  '/routing rip print',
  '/system identity print',
  '/system identity set name=<name>',
  '/system resource print',
  '/system routerboard print',
  '/system reboot',
  '/log print',
  'ping <host>',
  'export',
];

// ── Juniper JunOS (operational mode `>` / configuration mode `#`) ──
// Hanya perintah yang didukung engine nyata (JuniperVendorAdapter +
// juniperCommand). Engine sendiri menerima singkatan via isPrefix; tree di
// sini menangani ekspansi kanonis & deteksi ambiguitas.

const JUNIPER_OPER_CMDS: string[] = [
  'show interfaces terse',
  'show interfaces',
  'show route',
  'show bgp summary',
  'show ospf neighbor',
  'show version',
  'show configuration',
  'ping <host>',
  'configure',
  'quit',
];

const JUNIPER_CONFIG_CMDS: string[] = [
  ...JUNIPER_OPER_CMDS.filter((c) => c.startsWith('show ') || c.startsWith('ping ')),
  'set system host-name <name>',
  'set system name-server <server>',
  'set interfaces <interface> unit 0 family inet address <address>',
  'set interfaces <interface> unit 0 family inet dhcp-client',
  'set routing-options static route <network> next-hop <next-hop>',
  'set routing-options autonomous-system <asn>',
  'set routing-options router-id <router-id>',
  'set protocols ospf area <area> network <network>',
  'set protocols ospf area <area> interface <interface>',
  'set protocols ospf area <area> interface <interface> passive',
  'set protocols bgp group <name> peer-as <asn>',
  'set protocols bgp group <name> neighbor <address>',
  'set protocols bgp group <name> network <network>',
  'set vlans <name> vlan-id <id>',
  'set access address-assignment pool <name> family inet network <network>',
  'set access address-assignment pool <name> family inet range <range> low <low> high <high>',
  'set access address-assignment pool <name> family inet dhcp-attributes router <gateway>',
  'set system services dhcp-local-server group <group> pool <pool>',
  'set system services dhcp-local-server group <group> interface <interface>',
  'set firewall family inet filter <name> term <term> from protocol <protocol>',
  'set firewall family inet filter <name> term <term> then <action>',
  'set security nat source rule-set <name> rule <rule> match source-address <address>',
  'set security nat source rule-set <name> rule <rule> then source-nat interface',
  'delete <path>',
  'commit',
  'rollback 0',
  'exit',
];

// ── Huawei VRP (user view `<R>` / system view `[R]` / interface view) ──
// Hanya perintah yang didukung engine nyata (HuaweiVendorAdapter +
// huaweiCommand + handler VRP di dispatcher).

const HUAWEI_EXEC_CMDS: string[] = [
  'display current-configuration',
  'display ip interface brief',
  'display ip routing-table',
  'display vlan',
  'display version',
  'display ospf peer',
  'display lldp neighbor',
  'display mac-address',
  'display arp',
  'system-view',
  'ping <host>',
  'save',
  'quit',
];

const HUAWEI_CONFIG_CMDS: string[] = [
  ...HUAWEI_EXEC_CMDS.filter((c) => c.startsWith('display ') || c.startsWith('ping ') || c === 'save'),
  'sysname <name>',
  'interface <name>',
  'vlan <id>',
  'ip route-static <network> <mask> <next-hop>',
  'dns server <server>',
  'dhcp enable',
  'ip host <name> <address>',
  'ip pool <name>',
  'ospf <id>',
  'area <id>',
  'network <network> <mask> area <area>',
  'bgp <asn>',
  'peer <address> as-number <asn>',
  'stp mode <mode>',
  'stp priority <priority>',
  'quit',
  'return',
];

const HUAWEI_CONFIG_IF_CMDS: string[] = [
  ...HUAWEI_EXEC_CMDS.filter((c) => c.startsWith('display ') || c.startsWith('ping ')),
  'ip address <address> <mask>',
  'ipv6 address <address>',
  'undo shutdown',
  'ospf cost <cost>',
  'dot1q termination vid <id>',
  'port link-type access',
  'port default vlan <id>',
  'port link-type trunk',
  'port trunk allow-pass vlan <id>',
  'quit',
  'return',
];

// ── Aruba ArubaOS-CX (mirror hierarki Cisco; hanya perintah terverifikasi
// engine untuk 'aruba' — mis. router bgp TIDAK didukung engine → tidak ada) ──

const ARUBA_EXEC_CMDS: string[] = [
  'show interface brief',
  'show ip interface',
  'show running-config',
  'show vlan',
  'show version',
  'show cdp neighbors',
  'show lldp neighbors',
  'show ip ospf neighbor',
  'show tcp brief',
  'show mac address-table',
  'show ip arp',
  'ping <host>',
  'configure terminal',
  'write memory',
];

const ARUBA_CONFIG_CMDS: string[] = [
  ...ARUBA_EXEC_CMDS.filter((c) => c.startsWith('show ') || c.startsWith('ping ') || c === 'write memory'),
  'hostname <name>',
  'interface <name>',
  'vlan <id>',
  'ip route <network> <mask> <next-hop>',
  'ip name-server <server>',
  'ip dhcp pool <name>',
  'router ospf <id>',
  'router rip',
  'spanning-tree mode <mode>',
  'exit',
  'end',
];

const ARUBA_CONFIG_IF_CMDS: string[] = [
  ...ARUBA_EXEC_CMDS.filter((c) => c.startsWith('show ') || c.startsWith('ping ')),
  'ip address <address> <mask>',
  'ip address dhcp',
  'no shutdown',
  'switchport mode access',
  'switchport access vlan <id>',
  'switchport mode trunk',
  'switchport trunk allowed vlan <id>',
  'exit',
  'end',
];

// ── VyOS / EdgeOS (operational `$` / configuration `#`) ──
// Hanya perintah terverifikasi engine (vyosCommand + shared dispatcher).
// Catatan jujur: 'show configuration', 'save', 'exit' TIDAK didukung engine
// (V7/V4) → tidak masuk tree.

const VYOS_OPER_CMDS: string[] = [
  'show interfaces',
  'show ip route',
  'show version',
  'ping <host>',
  'configure',
];

const VYOS_CONFIG_CMDS: string[] = [
  ...VYOS_OPER_CMDS.filter((c) => c.startsWith('show ') || c.startsWith('ping ')),
  'set system host-name <name>',
  'set system name-server <server>',
  'set system static-host-mapping host-name <host> inet <address>',
  'set interfaces <interface> unit 0 family inet address <address>',
  'set interfaces <interface> address dhcp',
  'set routing-options static route <network> next-hop <next-hop>',
  'set protocols ospf area <area> network <network>',
  'set protocols ospf area <area> interface <interface>',
  'set protocols ospf area <area> interface <interface> passive',
  'set protocols rstp',
  'delete protocols rstp',
  'set protocols bgp <asn> parameters router-id <router-id>',
  'set protocols bgp <asn> neighbor <address> remote-as <asn>',
  'set protocols bgp <asn> address-family ipv4-unicast network <network>',
  'set protocols bgp <asn> network <network>',
  'set vlans <name> vlan-id <id>',
  'set firewall name <name> rule <rule> action <action>',
  'set firewall name <name> rule <rule> protocol <protocol>',
  'set firewall name <name> rule <rule> source address <address>',
  'set firewall name <name> rule <rule> destination address <address>',
  'set nat source rule <rule> outbound-interface <interface>',
  'set nat source rule <rule> source address <address>',
  'set nat source rule <rule> translation address masquerade',
  'set nat destination rule <rule> inbound-interface <interface>',
  'set nat destination rule <rule> protocol <protocol>',
  'set nat destination rule <rule> destination port <port>',
  'set nat destination rule <rule> translation address <address>',
  'set nat destination rule <rule> translation port <port>',
  'set service dhcp-server shared-network-name <name> subnet <subnet>',
  'set service dhcp-server shared-network-name <name> subnet <subnet> start <start> stop <stop>',
  'set service dhcp-server shared-network-name <name> subnet <subnet> default-router <gateway>',
  'set service dhcp-server shared-network-name <name> subnet <subnet> name-server <server>',
  'commit',
  'rollback 0',
];

// ── Fortinet FortiOS (satu level — config inline, bukan global mode) ──
// Hanya perintah terverifikasi engine: 'config system interface' + edit/set
// jalan; 'config system global' / 'config router static' TIDAK didukung.

const FORTINET_CMDS: string[] = [
  'get system status',
  'get system interface',
  'show firewall policy',
  'show system status',
  'config system interface',
  'edit <name>',
  'set ip <address> <mask>',
  'set hostname <name>',
  'execute ping <host>',
  'ping <host>',
  'quit',
];

const enc: Record<string, Record<CliMode, CommandEntry[]>> = {
  mikrotik: { exec: buildEntries(MIKROTIK_CMDS, ['exec']).exec, config: [], 'config-if': [] },
  cisco: buildEntries([...CISCO_EXEC_CMDS], ['exec']),
  juniper: {
    exec: buildEntries(JUNIPER_OPER_CMDS, ['exec']).exec,
    config: buildEntries(JUNIPER_CONFIG_CMDS, ['config']).config,
    'config-if': [],
  },
  huawei: {
    exec: buildEntries(HUAWEI_EXEC_CMDS, ['exec']).exec,
    config: buildEntries(HUAWEI_CONFIG_CMDS, ['config']).config,
    'config-if': buildEntries(HUAWEI_CONFIG_IF_CMDS, ['config-if'])['config-if'],
  },
  aruba: {
    exec: buildEntries(ARUBA_EXEC_CMDS, ['exec']).exec,
    config: buildEntries(ARUBA_CONFIG_CMDS, ['config']).config,
    'config-if': buildEntries(ARUBA_CONFIG_IF_CMDS, ['config-if'])['config-if'],
  },
  vyos: {
    exec: buildEntries(VYOS_OPER_CMDS, ['exec']).exec,
    config: buildEntries(VYOS_CONFIG_CMDS, ['config']).config,
    'config-if': [],
  },
  ubiquiti: {
    exec: buildEntries(VYOS_OPER_CMDS, ['exec']).exec,
    config: buildEntries(VYOS_CONFIG_CMDS, ['config']).config,
    'config-if': [],
  },
  fortinet: { exec: buildEntries(FORTINET_CMDS, ['exec']).exec, config: [], 'config-if': [] },
};

// cisco config & config-if: build per mode (exec base + mode sendiri)
enc.cisco.config = buildEntries(CISCO_CONFIG_CMDS, ['config']).config;
enc.cisco['config-if'] = buildEntries(CISCO_CONFIG_IF_CMDS, ['config-if'])['config-if'];

/** Daftar entri yang berlaku di (vendor, mode). */
export function entriesFor(vendor: string, mode: CliMode): CommandEntry[] {
  return enc[vendor]?.[mode] || [];
}

/** Token COMMAND dari input (mengikuti lexer facade: flag/values '=' dilepas). */
function commandTokens(input: string): string[] {
  return input
    .trim()
    .split(/\s+/)
    .filter((w) => !w.includes('=') && !w.startsWith('-'))
    .map((w) => w.toLowerCase());
}

/** Mencocokkan satu token terhadap satu kata entri (slot nilai selalu cocok). */
function wordMatches(word: string | null, token: string): boolean {
  if (word === null) return true;
  return word.startsWith(token);
}

/** Merapikan input mikrotik: buang '/' di kata pertama agar path cocok. */
function normalizeTokens(vendor: string, input: string): string[] {
  const tokens = commandTokens(input);
  if (vendor === 'mikrotik' && tokens[0]?.startsWith('/')) tokens[0] = tokens[0].slice(1);
  return tokens;
}

/** Token input dalam bentuk ASLI (tanpa lowercase) — dipakai untuk
 *  merekonstruksi nilai slot (hostname, alamat, dst.) tanpa merusak case. */
function rawTokensOf(vendor: string, input: string): string[] {
  const tokens = input
    .trim()
    .split(/\s+/)
    .filter((w) => !w.includes('=') && !w.startsWith('-'));
  if (vendor === 'mikrotik' && tokens[0]?.startsWith('/')) tokens[0] = tokens[0].slice(1);
  return tokens;
}

export type AbbrevOutcome =
  | { kind: 'ambiguous'; input: string; candidates: string[] }
  | { kind: 'expanded'; command: string; input: string }
  | { kind: 'raw' };

/**
 * Resolusi abbreviation terhadap tree vendor+mode.
 *
 * - Ambigu: token terakhir (atau token tengah) adalah prefix ketat ≥2 kata
 *   literal berbeda pada posisi yang sama → kembalikan kandidat.
 * - Unik dengan ≥1 kata disingkat → ekspansi kanonis (nilai token asli dipertahankan).
 * - Tidak match → 'raw' (engine yang menilai — tidak ada mutasi).
 */
export function resolveAbbreviation(vendor: string, mode: CliMode, input: string): AbbrevOutcome {
  const entries = entriesFor(vendor, mode);
  if (entries.length === 0) return { kind: 'raw' };
  const tokens = normalizeTokens(vendor, input);
  if (tokens.length === 0) return { kind: 'raw' };
  const rawTokens = rawTokensOf(vendor, input);

  // Saring entri berdasarkan token sejauh ini.
  let matched = entries.filter((e) => e.words.length >= tokens.length);
  let usedAbbrev = false;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    matched = matched.filter((e) => wordMatches(e.words[i], token));
    if (matched.length === 0) return { kind: 'raw' };

    // Ambiguitas POSISI INI: token yang sama prefix-match ≥2 kata literal berbeda.
    const literals = new Set(
      matched.map((e) => e.words[i]).filter((w): w is string => w !== null && w !== token)
    );
    if (i === tokens.length - 1) {
      const exactSome = matched.some((e) => e.words[i] === token);
      if (!exactSome && literals.size > 1) {
        const candidates = [...new Set(matched.map((e) => e.canonical))].slice(0, 6);
        return { kind: 'ambiguous', input: input.trim(), candidates };
      }
    } else if (literals.size > 1) {
      // token tengah ambigu → error juga (mis. 'sh i', dari posisi mana pun)
      const prefixChars = matched.some((e) => e.words[i] === null);
      if (!prefixChars) {
        const candidates = [...new Set(matched.map((e) => e.canonical))].slice(0, 6);
        return { kind: 'ambiguous', input: input.trim(), candidates };
      }
    }
    if (matched.some((e) => e.words[i] !== null && e.words[i].length > token.length)) usedAbbrev = true;
  }

  if (matched.length === 1) {
    const entry = matched[0];
    // Ekspansi hanya untuk perintah LENGKAP (token = jumlah kata entri).
    // Input parsial (mis. 'show ip i' untuk 'show ip interface brief') tetap
    // diteruskan apa adanya — engine sudah menangani sebagian singkatan
    // (shut/dot1q/int) lewat polanya sendiri.
    if (tokens.length !== entry.words.length) return { kind: 'raw' };
    if (!usedAbbrev) return { kind: 'raw' };
    const rebuilt = entry.words.map((w, i) => (w === null ? rawTokens[i] : w));
    let command = rebuilt.join(' ');
    if (vendor === 'mikrotik' && entry.canonical.startsWith('/') && !command.startsWith('/')) command = '/' + command;
    return { kind: 'expanded', command, input: input.trim() };
  }

  // >1 entri cocok tetapi tidak ambigu (perbedaan pada slot nilai / token lanjutan
  // belum bisa diputuskan) → biarkan engine menilai seperti sebelumnya.
  return { kind: 'raw' };
}

// ── Completion (TAB) & help (?) ────────────────────────────────────

export interface CompletionResult {
  candidates: string[];
  commonPrefix: string;
}

/**
 * Kandidat completion untuk input di (vendor, mode). Tiap kata input harus
 * prefix-match posisi yang bersesuaian; kandidat = perintah kanonis yang
 * cocok dengan token terakhir sebagai awalan.
 */
export function completionFor(vendor: string, mode: CliMode, input: string): CompletionResult {
  const entries = entriesFor(vendor, mode);
  if (entries.length === 0) return { candidates: [], commonPrefix: input };
  const tokens = normalizeTokens(vendor, input);
  if (tokens.length === 0) {
    return {
      candidates: [...new Set(entries.map((e) => e.canonical))].slice(0, 20),
      commonPrefix: '',
    };
  }
  const last = tokens[tokens.length - 1] || '';
  const head = tokens.slice(0, -1);
  const matched = entries.filter((e) => {
    if (e.words.length < tokens.length) return false;
    if (!wordMatches(e.words[tokens.length - 1], last)) return false;
    for (let i = 0; i < head.length; i++) {
      if (!wordMatches(e.words[i], head[i])) return false;
    }
    return true;
  });
  if (matched.length === 0) return { candidates: [], commonPrefix: input };

  const candidateWords = [...new Set(matched.map((e) => e.words[tokens.length - 1]).filter((w): w is string => w !== null))];
  const common = candidateWords.length > 0 ? commonPrefixOf(candidateWords) : '';
  const next = common && common.length > last.length ? common : '';
  const commonPrefix = [...tokens.slice(0, -1), next ? next : last].filter((t) => t !== '').join(' ');
  return {
    candidates: [...new Set(matched.map((e) => e.canonical))].slice(0, 12),
    commonPrefix,
  };
}

function commonPrefixOf(words: string[]): string {
  let prefix = words[0];
  for (const w of words.slice(1)) {
    while (!w.startsWith(prefix)) prefix = prefix.slice(0, -1);
    if (!prefix) return '';
  }
  return prefix;
}

/** Error abbreviation vendor-autentik. */
export function abbreviationError(vendor: string, input: string, candidates: string[]): string {
  if (vendor === 'mikrotik') {
    return `bad command name ${input} (12)\n  candidates: ${candidates.slice(0, 6).join(', ')}`;
  }
  if (vendor === 'huawei') {
    return `Error: Ambiguous command.${candidates.length > 0 ? `\n  candidates: ${candidates.slice(0, 6).join(', ')}` : ''}`;
  }
  if (vendor === 'juniper') {
    return `error: '${input}' is ambiguous.${candidates.length > 0 ? `\n  candidates: ${candidates.slice(0, 6).join(', ')}` : ''}`;
  }
  const list = candidates.length > 0 ? `\n  candidates: ${candidates.slice(0, 6).join(', ')}` : '';
  return `% Ambiguous command:  "${input}"${list}`;
}

/**
 * Transisi mode CLI (context) berdasarkan perintah yang baru saja dijalankan.
 * Dipakai App/TerminalPanel supaya abbreviation & completion context-aware.
 */
export function nextCliMode(vendor: string, mode: CliMode, cmd: string): CliMode {
  const c = cmd.trim().toLowerCase();
  if (vendor === 'juniper') {
    if (c === 'configure' || c === 'edit') return 'config';
    if (c === 'exit' || c === 'quit' || c.startsWith('exit configuration')) return 'exec';
    return mode;
  }
  if (vendor === 'huawei') {
    if (c === 'system-view') return 'config';
    if (mode === 'config' && (c.startsWith('interface ') || c.startsWith('int '))) return 'config-if';
    if (mode === 'config-if' && c === 'quit') return 'config';
    if (c === 'return') return 'exec';
    if (mode === 'config' && c === 'quit') return 'exec';
    return mode;
  }
  if (vendor === 'vyos' || vendor === 'ubiquiti') {
    if (c === 'configure') return 'config';
    if (c === 'exit') return 'exec';
    return mode;
  }
  if (vendor === 'fortinet') return 'exec';
  if (vendor !== 'cisco_ios' && vendor !== 'cisco' && vendor !== 'cisco_nxos' && vendor !== 'aruba') return 'exec';
  if (c === 'configure terminal' || c === 'conf terminal' || c === 'conf t') return 'config';
  if (c === 'exit') {
    if (mode === 'config-if') return 'config';
    if (mode === 'config') return 'exec';
    return mode;
  }
  if (c === 'end' || c === 'quit') return 'exec';
  if (mode === 'config' && (c.startsWith('interface ') || c.startsWith('int '))) return 'config-if';
  return mode;
}

/**
 * Mode yang berlaku untuk TIAP perintah dalam urutan eksekusi berurutan
 * (paste multi-baris). Mode perintah ke-i = mode SEBELUM perintah itu
 * dijalankan — bukan mode hasil transisinya sendiri. Mengembalikan array
 * dengan panjang sama dengan `commands`; mode akhir (setelah semua perintah)
 * ada di `nextCliMode(‥)` hasil terakhir bila pemanggil membutuhkannya.
 */
export function sequenceModes(vendor: string, initial: CliMode, commands: string[]): CliMode[] {
  const out: CliMode[] = [];
  let acc = initial;
  for (const raw of commands) {
    const c = raw.trim();
    out.push(acc);
    if (c) acc = nextCliMode(vendor, acc, c);
  }
  return out;
}