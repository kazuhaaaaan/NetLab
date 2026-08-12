/**
 * Command tree NetLab: abbreviation (prefix matching), ambiguitas, TAB
 * completion (common prefix + kandidat), mode context (exec/config/config-if),
 * dan transisi mode CLI. Bagian dari run_all_tests.mts (murni, tanpa DOM).
 */
import {
  resolveAbbreviation,
  completionFor,
  nextCliMode,
  sequenceModes,
  entriesFor,
  abbreviationError,
} from '../../src/engine/cli/commandTree';
import { runCliCommand, createNetLabBridge, treeVendor } from '../../src/engine/index';
import { createDeviceState, type DeviceState } from '../../src/engine/state/DeviceState';
import type { NetLabBridge } from '../../src/engine/state/bridge';

interface Report {
  passed: number;
  failed: number;
  fails: string[];
}

const rep: Report = { passed: 0, failed: 0, fails: [] };

function check(name: string, cond: boolean, detail = '') {
  if (cond) rep.passed++;
  else {
    rep.failed++;
    rep.fails.push(`${name} ${detail}`);
  }
}

export function runCommandTreeTests(): Report {
  // ── 1. Abbreviation unik → ekspansi kanonis ─────────────────────────
  {
    const r = resolveAbbreviation('cisco', 'exec', 'sh run');
    check('A1 sh run → show running-config', r.kind === 'expanded' && r.command === 'show running-config', JSON.stringify(r));

    const r2 = resolveAbbreviation('cisco', 'exec', 'show ip r');
    check('A2 show ip r → show ip route', r2.kind === 'expanded' && r2.command === 'show ip route', JSON.stringify(r2));

    const r3 = resolveAbbreviation('cisco', 'exec', 'sh ip int br');
    check('A3 sh ip int br → show ip interface brief', r3.kind === 'expanded' && r3.command === 'show ip interface brief', JSON.stringify(r3));

    const r4 = resolveAbbreviation('mikrotik', 'exec', '/ip addr pr');
    check('A4 /ip addr pr → /ip address print', r4.kind === 'expanded' && r4.command === '/ip address print', JSON.stringify(r4));

    const r5 = resolveAbbreviation('mikrotik', 'exec', 'sys id p');
    check('A5 sys id p → /system identity print', r5.kind === 'expanded' && r5.command === '/system identity print', JSON.stringify(r5));

    const r6 = resolveAbbreviation('mikrotik', 'exec', '/int prin');
    check('A6 /int prin → /interface print', r6.kind === 'expanded' && r6.command === '/interface print', JSON.stringify(r6));
  }

  // ── 2. Ambiguitas → ditolak (state tidak berubah) ───────────────────
  {
    const amb = resolveAbbreviation('cisco', 'exec', 'sh i');
    check('B1 "sh i" ambigu (show ip* vs show interfaces)', amb.kind === 'ambiguous' && amb.candidates.length >= 2, JSON.stringify(amb));

    const amb2 = resolveAbbreviation('cisco', 'exec', 'sh ip i');
    check('B2 "sh ip i" parsial → raw (engine yang menilai)', amb2.kind === 'raw', JSON.stringify(amb2));

    const amb3 = resolveAbbreviation('mikrotik', 'exec', '/ip a');
    check('B3 "/ip a" ambigu (print vs add)', amb3.kind === 'ambiguous' && amb3.candidates.length >= 2, JSON.stringify(amb3));

    check('B4 error cisco vendor-autentik', abbreviationError('cisco', 'sh i', ['show interfaces', 'show ip route']).includes('% Ambiguous command'));
    check('B5 error mikrotik vendor-autentik', abbreviationError('mikrotik', '/ip a', ['/ip address print', '/ip address add']).includes('bad command name'));

    // Melalui runCliCommand: ambigu → error, TIDAK dispatch ke engine
    let dispatched: string | null = null;
    const bridge: NetLabBridge = {
      dispatch: (v: string, raw: string) => {
        dispatched = raw;
        return '[disp]';
      },
      simulatePing: () => ({ success: true, path: [], rttMs: 1 }),
      getDeviceStats: () => null,
    };
    const res = runCliCommand({
      bridge,
      vendor: 'cisco',
      nodeId: 'r1',
      cmd: 'sh i',
      mode: 'exec',
      context: { nodeId: 'r1', ports: [], portLinks: {} },
    });
    check('B6 ambigu via facade → error output', res.output.includes('Ambiguous'), res.output);
    check('B7 ambigu TIDAK dispatch ke engine', dispatched === null, String(dispatched));

    // Perintah lengkap & tidak dikenal tetap diteruskan apa adanya
    const res2 = runCliCommand({
      bridge,
      vendor: 'cisco',
      nodeId: 'r1',
      cmd: 'show version',
      mode: 'exec',
      context: { nodeId: 'r1', ports: [], portLinks: {} },
    });
    check('B8 lengkap diteruskan apa adanya', dispatched === 'show version' && res2.output === '[disp]', res2.output);
  }

  // ── 3. Tidak touch: full command & perintah non-tree → raw ──────────
  {
    const full = resolveAbbreviation('cisco', 'exec', 'show running-config');
    check('C1 perintah penuh → raw (passthrough)', full.kind === 'raw', JSON.stringify(full));
    const nv = resolveAbbreviation('openwrt', 'exec', 'sh int');
    check('C2 vendor tanpa tree → raw', nv.kind === 'raw', JSON.stringify(nv));
    const slotted = resolveAbbreviation('cisco', 'config', 'interface GigabitEthernet0/0');
    check('C3 slot nilai + kata penuh → raw', slotted.kind === 'raw', JSON.stringify(slotted));
    const val = resolveAbbreviation('mikrotik', 'exec', '/ip address add address=192.168.1.1/24 interface=ether1');
    check('C4 input flag/value + penuh → raw', val.kind === 'raw', JSON.stringify(val));
    const abbrevSlot = resolveAbbreviation('cisco', 'config', 'int g0/0');
    check('C5 int g0/0 → interface g0/0 (nilai dipertahankan)', abbrevSlot.kind === 'expanded' && abbrevSlot.command === 'interface g0/0', JSON.stringify(abbrevSlot));
  }

  // ── 4. TAB completion: common prefix + kandidat ─────────────────────
  {
    const t1 = completionFor('cisco', 'exec', 'conf');
    check('D1 TAB "conf" → common prefix "configure"', t1.candidates.length === 1 && t1.commonPrefix === 'configure', JSON.stringify(t1));

    const t2 = completionFor('cisco', 'exec', 'show ip r');
    check('D2 TAB "show ip r" → show ip route', t2.candidates.includes('show ip route') && t2.commonPrefix === 'show ip route', JSON.stringify(t2));

    const t3 = completionFor('cisco', 'exec', 'sh i');
    check('D3 TAB "sh i" ambigu → banyak kandidat + common prefix pendek', t3.candidates.length >= 2, JSON.stringify(t3));
    check('D3b common prefix tidak menyesatkan', t3.commonPrefix === 'sh i', t3.commonPrefix);

    const t4 = completionFor('mikrotik', 'exec', '/ip r');
    check('D4 TAB "/ip r" → /ip route*', t4.candidates.every((c) => c.startsWith('/ip route')), JSON.stringify(t4.candidates));

    const t5 = completionFor('mikrotik', 'exec', '/interface ');
    check('D5 TAB "/interface " kandidat print/set/vlan/…', t5.candidates.length >= 3, JSON.stringify(t5));

    const t6 = completionFor('cisco', 'exec', '');
    check('D6 TAB kosong → kandidat EXEC saja (bukan global)', t6.candidates.includes('show running-config') && !t6.candidates.includes('ip address <address> <mask>'), JSON.stringify(t6.candidates));
    const t7 = completionFor('cisco', 'config', 'ip ');
    check('D7 TAB config "ip " → ip route/name-server/dhcp', t7.candidates.includes('ip route <network> <mask> <next-hop>'), JSON.stringify(t7.candidates));
    const t8 = completionFor('cisco', 'config-if', 'no sh');
    check('D8 TAB config-if "no sh" → no shutdown', t8.candidates.includes('no shutdown'), JSON.stringify(t8));
    // Context: perintah EXEC yang TIDAK valid di config-if tidak muncul di mode config-if
    const t9 = completionFor('cisco', 'config-if', '');
    check('D9 config-if tidak menawarkan "configure terminal"', !t9.candidates.includes('configure terminal'), JSON.stringify(t9.candidates.slice(0, 20)));
  }

  // ── 5. Mode context (exec → config → config-if) ─────────────────────
  {
    check('X1 configure terminal → config', nextCliMode('cisco', 'exec', 'configure terminal') === 'config');
    check('X2 conf terminal → config', nextCliMode('cisco', 'exec', 'conf terminal') === 'config');
    check('X2b conf t (abbreviation) → config', nextCliMode('cisco', 'exec', 'conf t') === 'config');
    check('X3 interface … → config-if', nextCliMode('cisco', 'config', 'interface GigabitEthernet0/0') === 'config-if');
    check('X4 int … → config-if', nextCliMode('cisco', 'config', 'int g0/0') === 'config-if');
    check('X5 exit dari config-if → config', nextCliMode('cisco', 'config-if', 'exit') === 'config');
    check('X6 exit dari config → exec', nextCliMode('cisco', 'config', 'exit') === 'exec');
    check('X7 end → exec', nextCliMode('cisco', 'config-if', 'end') === 'exec');
    check('X8 vendor lain selalu exec', nextCliMode('mikrotik', 'config', 'interface ether1') === 'exec');
    check('X9 perintah lain menjaga mode', nextCliMode('cisco', 'config', 'hostname R1') === 'config');
  }

  // ── 6. Refleksi: entriesFor & treeVendor ────────────────────────────
  {
    check('Y1 entriesFor cisco exec > 0', entriesFor('cisco', 'exec').length >= 20);
    check('Y2 entriesFor mikrotik exec > 0', entriesFor('mikrotik', 'exec').length >= 20);
    check('Y3 entriesFor juniper/huawei > 0', entriesFor('juniper', 'exec').length >= 5 && entriesFor('huawei', 'config').length >= 5);
    check('Y4 treeVendor mapping', treeVendor('cisco_ios') === 'cisco' && treeVendor('cisco_nxos') === 'cisco' && treeVendor('mikrotik') === 'mikrotik' && treeVendor('juniper') === 'juniper' && treeVendor('huawei') === 'huawei');
    check('Y5 vendor non-tree → null (openwrt/linux)', treeVendor('openwrt') === null && treeVendor('linux') === null && treeVendor('cisco_ios') === 'cisco');
    check('Y5b treeVendor vendor baru', treeVendor('aruba') === 'aruba' && treeVendor('vyos') === 'vyos' && treeVendor('ubiquiti') === 'ubiquiti' && treeVendor('fortinet') === 'fortinet');
    check('Y6 entriesFor juniper tanpa config-if', entriesFor('juniper', 'config-if').length === 0);
  }

  // ── 7. Facade: abbreviation tidak memutus state mirror ──────────────
  {
    let mirror: DeviceState | null = null;
    let dispatched: string | null = null;
    const bridge: NetLabBridge = {
      dispatch: (v: string, raw: string) => {
        dispatched = raw;
        return '[ok]';
      },
      simulatePing: () => ({ success: true, path: [], rttMs: 1 }),
      getDeviceStats: () => null,
    };
    const res = runCliCommand({
      bridge,
      vendor: 'mikrotik',
      nodeId: 'r1',
      cmd: '/ip address add address=10.0.0.1/24 interface=ether1',
      mode: 'exec',
      context: { nodeId: 'r1', ports: [], portLinks: {} },
      currentDevice: createDeviceState('r1', 'mikrotik', 'R1', ['ether1', 'ether2']),
      onStateChange: (d) => {
        mirror = d;
      },
    });
    check('Z1 perintah mikrotik penuh diteruskan', dispatched === '/ip address add address=10.0.0.1/24 interface=ether1', String(dispatched));
    check('Z2 mirror tetap diproses', mirror !== null && mirror.interfaces[0].ip === '10.0.0.1', JSON.stringify(mirror));
    check('Z3 changed', res.changed === true);

    // Ambigu + mirror: tidak boleh ada mutasi state / panggilan onStateChange
    let mutated2 = false;
    const res2 = runCliCommand({
      bridge,
      vendor: 'cisco',
      nodeId: 'r1',
      cmd: 'sh i',
      mode: 'exec',
      context: { nodeId: 'r1', ports: [], portLinks: {} },
      currentDevice: createDeviceState('r1', 'cisco', 'R1', ['GigabitEthernet0/0']),
      onStateChange: () => {
        mutated2 = true;
      },
    });
    check('Z4 ambigu → changed=false & onStateChange TIDAK dipanggil', res2.changed === false && !mutated2, res2.output);
  }

  // ── 8. Tree Juniper (operational > / configuration #) ───────────────
  {
    const r1 = resolveAbbreviation('juniper', 'exec', 'show r');
    check('N1 juniper "show r" → show route', r1.kind === 'expanded' && r1.command === 'show route', JSON.stringify(r1));

    const r2 = resolveAbbreviation('juniper', 'exec', 'sh int');
    check('N2 "sh int" parsial (2 kata dari 3) → raw, engine menilai', r2.kind === 'raw', JSON.stringify(r2));

    const r3 = resolveAbbreviation('juniper', 'exec', 'c');
    check('N3 "c" mode exec → configure (unik)', r3.kind === 'expanded' && r3.command === 'configure', JSON.stringify(r3));

    const r4 = resolveAbbreviation('juniper', 'config', 'co');
    check('N4 "co" mode config → commit (configure tak ada di config)', r4.kind === 'expanded' && r4.command === 'commit', JSON.stringify(r4));

    const r5 = resolveAbbreviation('juniper', 'config', 'set sys h R1');
    check('N5 "set sys h R1" → set system host-name R1 (case nil ai dipertahankan)', r5.kind === 'expanded' && r5.command === 'set system host-name R1', JSON.stringify(r5));

    const r6 = resolveAbbreviation('juniper', 'config', 'set routing-options static route 10.20.0.0/24 next-hop 192.168.1.1');
    check('N6 perintah lengkap dengan slot → raw (passthrough)', r6.kind === 'raw', JSON.stringify(r6));

    const r7 = resolveAbbreviation('juniper', 'config', 'set protocols ospf area 0 network 10.0.0.0/24');
    check('N7 perintah lengkap ospf → raw', r7.kind === 'raw', JSON.stringify(r7));

    // Ambiguitas juniper: dua literal berbeda pada posisi terakhir
    const r8 = resolveAbbreviation('juniper', 'exec', 'q');
    check('N8 "q" op → quit (unik)', r8.kind === 'expanded' && r8.command === 'quit', JSON.stringify(r8));

    const t1 = completionFor('juniper', 'exec', 'show r');
    check('N9 TAB "show r" → show route', t1.candidates.length === 1 && t1.commonPrefix === 'show route', JSON.stringify(t1));

    const t2 = completionFor('juniper', 'config', 'set protocols ');
    check('N10 TAB "set protocols " → ospf/bgp saja', t2.candidates.length >= 2 && t2.candidates.every((c) => c.startsWith('set protocols')), JSON.stringify(t2.candidates));

    const t3 = completionFor('juniper', 'exec', '');
    check('N11 TAB kosong op → show/ping/configure, tanpa set config', t3.candidates.includes('show interfaces terse') && !t3.candidates.some((c) => c.startsWith('set ')), JSON.stringify(t3.candidates.slice(0, 12)));
  }

  // ── 9. Tree Huawei (<R> / [R] / [R-if]) ─────────────────────────────
  {
    const r1 = resolveAbbreviation('huawei', 'exec', 'dis ip int br');
    check('P1 "dis ip int br" → display ip interface brief', r1.kind === 'expanded' && r1.command === 'display ip interface brief', JSON.stringify(r1));

    const r2 = resolveAbbreviation('huawei', 'exec', 'dis ip r');
    check('P2 "dis ip r" → display ip routing-table', r2.kind === 'expanded' && r2.command === 'display ip routing-table', JSON.stringify(r2));

    const r3 = resolveAbbreviation('huawei', 'exec', 'dis v');
    check('P3 "dis v" ambigu (vlan vs version) → ditolak', r3.kind === 'ambiguous' && r3.candidates.length >= 2, JSON.stringify(r3));

    const r4 = resolveAbbreviation('huawei', 'exec', 'sys');
    check('P4 "sys" → system-view', r4.kind === 'expanded' && r4.command === 'system-view', JSON.stringify(r4));

    const r5 = resolveAbbreviation('huawei', 'config', 'sy R1');
    check('P5 "sy R1" → sysname R1 (case nilai dipertahankan)', r5.kind === 'expanded' && r5.command === 'sysname R1', JSON.stringify(r5));

    const r6 = resolveAbbreviation('huawei', 'config', 'ip ro 10.0.0.0 255.255.255.0 192.168.1.1');
    check('P6 "ip ro …" → ip route-static lengkap', r6.kind === 'expanded' && r6.command === 'ip route-static 10.0.0.0 255.255.255.0 192.168.1.1', JSON.stringify(r6));

    const r7 = resolveAbbreviation('huawei', 'config-if', 'ip add 10.0.0.1 255.255.255.0');
    check('P7 "ip add …" → ip address (mode interface)', r7.kind === 'expanded' && r7.command === 'ip address 10.0.0.1 255.255.255.0', JSON.stringify(r7));

    const r8 = resolveAbbreviation('huawei', 'config-if', 'port link-type tr');
    check('P8 "port link-type tr" → trunk', r8.kind === 'expanded' && r8.command === 'port link-type trunk', JSON.stringify(r8));

    const r9 = resolveAbbreviation('huawei', 'config', 'int GigabitEthernet0/0/0');
    check('P9 "int …" → interface … (nilai dipertahankan)', r9.kind === 'expanded' && r9.command === 'interface GigabitEthernet0/0/0', JSON.stringify(r9));

    check('P10 error huawei vendor-autentik', abbreviationError('huawei', 'dis v', ['display vlan', 'display version']).includes('Ambiguous command'));
    check('P11 error juniper vendor-autentik', abbreviationError('juniper', 'q', ['quit']).includes('ambiguous'));

    const t1 = completionFor('huawei', 'exec', 'dis ip ');
    check('P12 TAB "dis ip " → interface brief + routing-table', t1.candidates.length === 2 && t1.candidates.includes('display ip interface brief'), JSON.stringify(t1.candidates));

    const t2 = completionFor('huawei', 'config', '');
    check('P13 TAB kosong config → display/sysname/interface, tanpa cmd exec-only quit mode lain', t2.candidates.includes('sysname <name>') && !t2.candidates.includes('ip address <address> <mask>'), JSON.stringify(t2.candidates.slice(0, 10)));

    const t3 = completionFor('huawei', 'config-if', '');
    check('P14 TAB config-if tidak menawarkan "interface <name>"', !t3.candidates.includes('interface <name>'), JSON.stringify(t3.candidates.slice(0, 10)));
  }

  // ── 10. Mode context vendor baru (juniper/huawei) ───────────────────
  {
    check('Q1 juniper configure → config', nextCliMode('juniper', 'exec', 'configure') === 'config');
    check('Q2 juniper exit → exec', nextCliMode('juniper', 'config', 'exit') === 'exec');
    check('Q3 juniper quit → exec', nextCliMode('juniper', 'config', 'quit') === 'exec');
    check('Q4 juniper commit tetap config', nextCliMode('juniper', 'config', 'commit') === 'config');
    check('Q5 juniper rollback tetap config', nextCliMode('juniper', 'config', 'rollback 0') === 'config');
    check('Q6 huawei system-view → config', nextCliMode('huawei', 'exec', 'system-view') === 'config');
    check('Q7 huawei config + interface → config-if', nextCliMode('huawei', 'config', 'interface ether1') === 'config-if');
    check('Q8 huawei config-if + quit → config', nextCliMode('huawei', 'config-if', 'quit') === 'config');
    check('Q9 huawei config + quit → exec', nextCliMode('huawei', 'config', 'quit') === 'exec');
    check('Q10 huawei return → exec', nextCliMode('huawei', 'config-if', 'return') === 'exec');
    check('Q11 huawei sysname menjaga config', nextCliMode('huawei', 'config', 'sysname R1') === 'config');
    check('Q12 juniper perintah lain menjaga mode', nextCliMode('juniper', 'config', 'set system host-name R1') === 'config');
  }

  // ── 11. Facade E2E: abbreviation juniper/huawei lewat runCliCommand ─
  {
    let dispatched: string | null = null;
    const bridge: NetLabBridge = {
      dispatch: (v: string, raw: string) => {
        dispatched = raw;
        return '[disp]';
      },
      simulatePing: () => ({ success: true, path: [], rttMs: 1 }),
      getDeviceStats: () => null,
    };
    const ctx = { nodeId: 'r1', ports: [], portLinks: {} };

    const res = runCliCommand({ bridge, vendor: 'juniper', nodeId: 'r1', cmd: 'show r', mode: 'exec', context: ctx });
    check('R1 juniper facade "show r" → engine terima "show route"', dispatched === 'show route' && res.output === '[disp]', res.output);

    const res2 = runCliCommand({ bridge, vendor: 'huawei', nodeId: 'r1', cmd: 'dis ip int br', mode: 'exec', context: ctx });
    check('R2 huawei facade "dis ip int br" → "display ip interface brief"', dispatched === 'display ip interface brief' && res2.output === '[disp]', res2.output);

    const res3 = runCliCommand({ bridge, vendor: 'huawei', nodeId: 'r1', cmd: 'dis v', mode: 'exec', context: ctx });
    check('R3 huawei ambigu "dis v" → error, TIDAK dispatch', dispatched !== 'display vlan' && res3.output.includes('Ambiguous') && res3.changed === false, res3.output);

    const res4 = runCliCommand({ bridge, vendor: 'juniper', nodeId: 'r1', cmd: 'set sys h R1', mode: 'config', context: ctx });
    check('R4 juniper "set sys h R1" → "set system host-name R1" (case utuh)', dispatched === 'set system host-name R1', String(dispatched));

    // Vendor non-tree tetap passthrough (tidak ada ekspansi paksa)
    const res5 = runCliCommand({ bridge, vendor: 'vyos', nodeId: 'r1', cmd: 'show interfaces', mode: 'exec', context: ctx });
    check('R5 non-tree lolos apa adanya', dispatched === 'show interfaces', String(dispatched));
  }

  // ── 12. Tree Aruba / VyOS / EdgeOS / Fortinet (terverifikasi engine) ──
  {
    // Aruba — mirip Cisco
    const a1 = resolveAbbreviation('aruba', 'exec', 'sh ip int');
    check('S1 aruba "sh ip int" → show ip interface', a1.kind === 'expanded' && a1.command === 'show ip interface', JSON.stringify(a1));

    const a2 = resolveAbbreviation('aruba', 'exec', 'sh v');
    check('S2 aruba "sh v" ambigu (vlan vs version)', a2.kind === 'ambiguous' && a2.candidates.length >= 2, JSON.stringify(a2));

    const a3 = resolveAbbreviation('aruba', 'exec', 'conf t');
    check('S3 aruba "conf t" → configure terminal', a3.kind === 'expanded' && a3.command === 'configure terminal', JSON.stringify(a3));

    const a4 = resolveAbbreviation('aruba', 'config-if', 'sw m ac');
    check('S4 aruba "sw m ac" → switchport mode access', a4.kind === 'expanded' && a4.command === 'switchport mode access', JSON.stringify(a4));

    check('S5 aruba "sh i" ambigu (interface brief vs ip interface)', resolveAbbreviation('aruba', 'exec', 'sh i').kind === 'ambiguous', JSON.stringify(resolveAbbreviation('aruba', 'exec', 'sh i')));

    const t1 = completionFor('aruba', 'config', 'ip ro ');
    check('S6 TAB aruba config "ip ro " → ip route', t1.candidates.includes('ip route <network> <mask> <next-hop>'), JSON.stringify(t1.candidates));

    // VyOS / EdgeOS
    const v1 = resolveAbbreviation('vyos', 'exec', 'conf');
    check('S7 vyos "conf" → configure', v1.kind === 'expanded' && v1.command === 'configure', JSON.stringify(v1));

    const v2 = resolveAbbreviation('vyos', 'config', 'set sys host-name V1');
    check('S8 vyos "set sys host-name V1" → kanonis (case utuh)', v2.kind === 'expanded' && v2.command === 'set system host-name V1', JSON.stringify(v2));

    const v3 = resolveAbbreviation('vyos', 'config', 'set n');
    check('S9 vyos "set n" parsial → raw (engine menilai)', v3.kind === 'raw', JSON.stringify(v3));

    const v4 = resolveAbbreviation('vyos', 'config', 'set nat destination rule 5 translation port 8080');
    check('S10 vyos perintah lengkap → raw (passthrough)', v4.kind === 'raw', JSON.stringify(v4));

    const v5 = resolveAbbreviation('ubiquiti', 'config', 'set proto ospf area 0 network 10.0.0.0/24');
    check('S11 edgeos "set proto ospf …" → kanonis', v5.kind === 'expanded' && v5.command === 'set protocols ospf area 0 network 10.0.0.0/24', JSON.stringify(v5));

    const v6 = resolveAbbreviation('vyos', 'config', 'set firewall name WAN rule 10 action drop');
    check('S12 vyos firewall lengkap → raw', v6.kind === 'raw', JSON.stringify(v6));

    const t2 = completionFor('vyos', 'config', 'set prot');
    check('S13 TAB vyos "set prot" → hanya set protocols*', t2.candidates.every((c) => c.startsWith('set protocols')), JSON.stringify(t2.candidates.slice(0, 6)));

    check('S14 vyos config-if kosong (tidak punya mode itu)', entriesFor('vyos', 'config-if').length === 0);

    // Fortinet — satu level (config inline)
    const f1 = resolveAbbreviation('fortinet', 'exec', 'g s s');
    check('S15 fortinet "g s s" → get system status', f1.kind === 'expanded' && f1.command === 'get system status', JSON.stringify(f1));

    const f2 = resolveAbbreviation('fortinet', 'exec', 'se ip 10.0.0.1 255.255.255.0');
    check('S16 fortinet "se ip …" → set ip … (slot dipertahankan)', f2.kind === 'expanded' && f2.command === 'set ip 10.0.0.1 255.255.255.0', JSON.stringify(f2));

    const f3 = resolveAbbreviation('fortinet', 'exec', 'config system interface');
    check('S17 fortinet config system interface penuh → raw', f3.kind === 'raw', JSON.stringify(f3));

    const f4 = resolveAbbreviation('fortinet', 'exec', 'co s i');
    check('S18 fortinet "co s i" → config system interface (unik)', f4.kind === 'expanded' && f4.command === 'config system interface', JSON.stringify(f4));

    check('S19 fortinet hanya satu mode', entriesFor('fortinet', 'config').length === 0 && entriesFor('fortinet', 'config-if').length === 0);
    check('S20 fortinet "config" ambigu → error vendor', abbreviationError('fortinet', 'co', ['config system interface']).includes('Ambiguous'));

    // Mode context vendor baru
    check('S21 aruba conf t → config', nextCliMode('aruba', 'exec', 'configure terminal') === 'config');
    check('S22 aruba interface → config-if', nextCliMode('aruba', 'config', 'interface ether1') === 'config-if');
    check('S23 aruba end → exec', nextCliMode('aruba', 'config-if', 'end') === 'exec');
    check('S24 vyos configure → config', nextCliMode('vyos', 'exec', 'configure') === 'config');
    check('S25 vyos exit → exec', nextCliMode('vyos', 'config', 'exit') === 'exec');
    check('S26 vyos commit tetap config', nextCliMode('vyos', 'config', 'commit') === 'config');
    check('S27 fortinet selalu exec', nextCliMode('fortinet', 'config', 'set ip 1.1.1.1 255.255.255.0') === 'exec' && nextCliMode('fortinet', 'exec', 'get system status') === 'exec');

    // Facade E2E — ekspansi dikirim ke engine, ambigu tidak dispatch
    let dispatched: string | null = null;
    const bridge: NetLabBridge = {
      dispatch: (v: string, raw: string) => {
        dispatched = raw;
        return '[disp]';
      },
      simulatePing: () => ({ success: true, path: [], rttMs: 1 }),
      getDeviceStats: () => null,
    };
    const ctx = { nodeId: 'r1', ports: [], portLinks: {} };
    const r1 = runCliCommand({ bridge, vendor: 'aruba', nodeId: 'r1', cmd: 'sh ip int', mode: 'exec', context: ctx });
    check('S28 aruba facade "sh ip int" → engine terima "show ip interface"', dispatched === 'show ip interface' && r1.output === '[disp]', r1.output);
    const r2 = runCliCommand({ bridge, vendor: 'vyos', nodeId: 'r1', cmd: 'set sys host-name V1', mode: 'config', context: ctx });
    check('S29 vyos facade → "set system host-name V1"', dispatched === 'set system host-name V1', String(dispatched));
    const r3 = runCliCommand({ bridge, vendor: 'fortinet', nodeId: 'r1', cmd: 'g s s', mode: 'exec', context: ctx });
    check('S30 fortinet facade → "get system status"', dispatched === 'get system status', String(dispatched));
    const r4 = runCliCommand({ bridge, vendor: 'fortinet', nodeId: 'r1', cmd: 'se ip 10.0.0.1 255.255.255.0', mode: 'exec', context: ctx });
    check('S31 fortinet facade preserve slot case di alamat', dispatched === 'set ip 10.0.0.1 255.255.255.0', String(dispatched));
  }

  // ── T1–T6. sequenceModes: mode tiap perintah = mode SEBELUM eksekusi ──
  {
    const seq1 = sequenceModes('cisco', 'exec', ['conf t', 'hostname R1', 'interface ether1', 'ip address 10.0.0.1 255.255.255.0', 'exit', 'end']);
    check('T1 mode perintah 1 = exec (bukan config)', seq1[0] === 'exec', JSON.stringify(seq1));
    check('T2 mode perintah 2 = config', seq1[1] === 'config', JSON.stringify(seq1));
    check('T3 mode perintah 3 = config (bukan config-if)', seq1[2] === 'config', JSON.stringify(seq1));
    check('T4 mode perintah 4 = config-if', seq1[3] === 'config-if', JSON.stringify(seq1));
    check('T5 mode perintah 5 (exit dari config-if) = config-if', seq1[4] === 'config-if', JSON.stringify(seq1));
    check('T6 mode perintah 6 (end) = config', seq1[5] === 'config', JSON.stringify(seq1));

    const seq2 = sequenceModes('mikrotik', 'exec', ['/ip address print', 'ping 10.0.0.1']);
    check('T7 mikrotik semua exec', seq2[0] === 'exec' && seq2[1] === 'exec', JSON.stringify(seq2));

    const seq3 = sequenceModes('huawei', 'exec', ['system-view', 'sysname R1', 'interface ether1', 'quit', 'return']);
    check('T8 huawei system-view → exec dulu', seq3[0] === 'exec', JSON.stringify(seq3));
    check('T9 huawei mode kedua config', seq3[1] === 'config', JSON.stringify(seq3));
    check('T10 huawei interface dijalankan saat masih config', seq3[2] === 'config', JSON.stringify(seq3));
    check('T11 huawei quit dijalankan dari config-if', seq3[3] === 'config-if', JSON.stringify(seq3));
    check('T12 huawei return dijalankan dari config', seq3[4] === 'config', JSON.stringify(seq3));

    const seq4 = sequenceModes('juniper', 'exec', ['configure', 'set system host-name J1', 'exit']);
    check('T13 juniper configure → exec', seq4[0] === 'exec', JSON.stringify(seq4));
    check('T14 juniper set → config', seq4[1] === 'config', JSON.stringify(seq4));
    check('T15 juniper exit → config', seq4[2] === 'config', JSON.stringify(seq4));
  }

  return rep;
}