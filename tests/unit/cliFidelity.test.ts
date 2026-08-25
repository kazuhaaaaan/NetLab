/**
 * CLI Fidelity conformance probes — dimensi "CLI Fidelity" skor konformansi.
 *
 * Berbeda dengan matriks fitur (verify-all-vendors.mts) yang menguji LEBAR
 * fitur, suite ini menguji KESETIAAN perilaku CLI tiap vendor sesuai definisi
 * sub-skor 5.1 master prompt:
 *   - hierarki/mode perintah & prompt vendor
 *   - help ("?"/help) menjawab bermakna
 *   - perintah tidak dikenal → pesan error GAYA VENDOR
 *   - konfigurasi inti benar-benar memutasi state (bukan parser-only)
 *   - input tidak valid DITOLAK tanpa mengubah state
 *   - show/display/print mencerminkan state yang tersimpan
 *   - semantik persistensi (save/commit/write memory) sesuai karakter vendor
 *   - singkatan perintah (abbreviation) untuk vendor yang memang mendukungnya
 *
 * Semua probe dieksekusi lewat VendorDispatcher sungguhan (jalur produksi),
 * bukan mock. Skor per vendor = passed/total — diimpor scripts/conformance-score.mts.
 */
import { VendorDispatcher } from '../../packages/vendors/src/index';
import type { NodeMemory } from '../../packages/vendors/src/index';

export interface Report {
  passed: number;
  failed: number;
  fails: string[];
}

const rep: Report = { passed: 0, failed: 0, fails: [] };

function check(name: string, cond: boolean, detail = ''): boolean {
  if (cond) rep.passed++;
  else {
    rep.failed++;
    rep.fails.push(`${name}${detail ? ' :: ' + detail : ''}`);
  }
  return cond;
}

// ── Harness ────────────────────────────────────────────────────────────────
const mkCtx = (nodeId: string, name: string, portNames: string[]) => ({
  nodeId,
  name,
  ports: portNames.map((n, i) => ({ id: n, name: n, status: (i === 0 ? 'up' : 'down') as 'up' | 'down' })),
  pingSimulator: undefined,
});

/** Sidik jari state konfigurasi yang relevan untuk deteksi mutasi. */
function fingerprint(mem: NodeMemory): string {
  return JSON.stringify({
    ips: mem.configuredIps,
    ips6: mem.configuredIps6,
    routes: mem.routes,
    routes6: mem.routes6,
    vlans: mem.vlans,
    dnsServers: mem.dnsServers,
    dhcpPools: mem.dhcpPools.length,
    natRules: mem.natRules.length,
    acls: mem.acls.length,
    hostname: mem.hostname,
    fhrp: mem.fhrpGroups,
    shutdown: mem.shutdownIfaces,
    ospf: mem.routing?.ospf?.enabled,
    bgpAsn: mem.bgp?.asn,
  });
}

interface Probe {
  name: string;
  cmds: string[];
  /** Output salah satu langkah harus cocok pola ini (mis. pesan error vendor). */
  expectErrRe?: RegExp;
  /** Output langkah TERAKHIR harus cocok pola ini (mis. show mencerminkan state). */
  expectOutRe?: RegExp;
  /** State HARUS berubah selama eksekusi probe (default: false = tidak boleh berubah). */
  expectMutation?: boolean;
  /** Asersi state tambahan terhadap NodeMemory akhir. */
  assertState?: (mem: NodeMemory) => boolean;
}

type VendorProbes = Record<string, Probe[]>;

// ── Definisi probe per vendor ──────────────────────────────────────────────
// Prinsip: (1) hanya menguji perilaku yang MEMANG dikontrakkan vendor tersebut;
// (2) SETIAP probe self-contained — setup dilakukan di dalam probe yang sama
// karena dispatcher dibuat fresh per probe; (3) pesan error mengikuti
// common/errors.ts & commandTree.ts (kontrak vendor).
const PROBES: VendorProbes = {
  cisco_ios: [
    { name: '? help exec', cmds: ['?'], expectOutRe: /configure|show|enable/i },
    { name: 'unknown command → % Invalid input', cmds: ['frobnicate everything'], expectErrRe: /%|invalid/i },
    { name: 'abbreviasi conf t masuk mode config', cmds: ['conf t'], expectOutRe: /config/i },
    { name: 'abbreviasi sh versi ringkas', cmds: ['sh ver'], expectOutRe: /./ },
    { name: 'hostname memutasi state', cmds: ['conf t', 'hostname R-CORE'], expectMutation: true, assertState: (m) => m.hostname === 'R-CORE' },
    { name: 'IP interface tersimpan', cmds: ['conf t', 'interface p1', 'ip address 10.1.1.1 255.255.255.0'], expectMutation: true, assertState: (m) => String(m.configuredIps['p1'] || '').startsWith('10.1.1.1') },
    { name: 'oktet > 255 ditolak tanpa mutasi', cmds: ['conf t', 'interface p2', 'ip address 999.1.1.1 255.0.0.0'], expectErrRe: /%|invalid/i },
    { name: 'mask tidak kontigu ditolak', cmds: ['ip route 10.9.9.0 255.255.255.3 10.1.1.254'], expectErrRe: /%|invalid/i },
    { name: 'static route valid tersimpan', cmds: ['ip route 10.99.0.0 255.255.255.0 10.1.1.254'], expectMutation: true, assertState: (m) => m.routes.some((r) => r.gateway === '10.1.1.254') },
    { name: 'show running-config mencerminkan IP', cmds: ['conf t', 'interface p1', 'ip address 10.1.1.10 255.255.255.0', 'end', 'show running-config'], expectOutRe: /10\.1\.1\.10/ },
    { name: 'shutdown memutasi state', cmds: ['conf t', 'interface p2', 'shutdown'], expectMutation: true, assertState: (m) => (m.shutdownIfaces || []).includes('p2') },
    { name: 'no shutdown mengembalikan (negasi)', cmds: ['conf t', 'interface p3', 'shutdown', 'no shutdown'], expectMutation: false, assertState: (m) => !(m.shutdownIfaces || []).includes('p3') },
    { name: 'write memory menyimpan startup-config', cmds: ['end', 'write memory'], expectOutRe: /build|configuration|OK|\[OK\]/i },
  ],
  mikrotik: [
    { name: '? help menu', cmds: ['/?'], expectOutRe: /./ },
    { name: 'unknown command → bad command name', cmds: ['/definitely-not-a-menu print'], expectErrRe: /bad command name/i },
    { name: 'identity memutasi hostname', cmds: ['/system identity set name=MT-RTR'], expectMutation: true, assertState: (m) => m.hostname === 'MT-RTR' },
    { name: 'address add tersimpan', cmds: ['/ip address add address=10.2.1.1/24 interface=p1'], expectMutation: true, assertState: (m) => String(m.configuredIps['p1'] || '').startsWith('10.2.1.1') },
    { name: 'oktet > 255 ditolak', cmds: ['/ip address add address=300.1.1.1/24 interface=p1'], expectErrRe: /invalid|error/i },
    { name: 'route gateway bukan IP ditolak', cmds: ['/ip route add dst-address=10.9.9.0/27 gateway=not-an-ip'], expectErrRe: /invalid|error/i },
    { name: 'route valid tersimpan', cmds: ['/ip route add dst-address=10.98.0.0/24 gateway=10.2.1.254'], expectMutation: true, assertState: (m) => m.routes.some((r) => r.dst === '10.98.0.0/24') },
    { name: 'print mencerminkan address', cmds: ['/ip address add address=10.2.7.1/24 interface=p2', '/ip address print'], expectOutRe: /10\.2\.7\.1/ },
    { name: 'property disabled=yes tetap tersimpan', cmds: ['/ip address add address=10.2.9.1/24 interface=p1 disabled=yes'], expectMutation: true, assertState: (m) => Object.values(m.configuredIps).some((v) => String(v).startsWith('10.2.9.1')) },
    { name: 'remove menghapus entri', cmds: ['/ip address add address=10.2.8.1/24 interface=p3', '/ip address remove [find address="10.2.8.1/24"]'], expectMutation: false, assertState: (m) => !Object.values(m.configuredIps).some((v) => String(v).startsWith('10.2.8.1')) },
  ],
  cisco_nxos: [
    { name: 'unknown command → % Invalid', cmds: ['install feature frobnicate'], expectErrRe: /%|invalid/i },
    { name: 'feature ospf activation dulu', cmds: ['feature ospf'], expectOutRe: /./ },
    { name: 'hostname memutasi state', cmds: ['conf t', 'hostname NX-CORE'], expectMutation: true, assertState: (m) => m.hostname === 'NX-CORE' },
    { name: 'IP interface (format CIDR NX-OS)', cmds: ['conf t', 'interface p1', 'ip address 10.3.1.1/24'], expectMutation: true, assertState: (m) => String(m.configuredIps['p1'] || '').startsWith('10.3.1.1') },
    { name: 'prefix > 32 ditolak', cmds: ['ip route 10.9.9.0/33 10.3.1.254'], expectErrRe: /%|invalid/i },
    { name: 'show running-config mencerminkan', cmds: ['conf t', 'interface p1', 'ip address 10.3.1.5/24', 'end', 'show running-config'], expectOutRe: /10\.3\.1\.5|NX-CORE/i },
  ],
  juniper: [
    { name: '? help oper mode', cmds: ['?'], expectOutRe: /./ },
    { name: 'unknown command → syntax error', cmds: ['frobnicate now'], expectErrRe: /syntax error|error/i },
    { name: 'configure masuk candidate', cmds: ['configure'], expectOutRe: /#/i },
    { name: 'set host-name (candidate) lalu commit', cmds: ['configure', 'set system host-name JN-GW', 'commit'], expectMutation: true, assertState: (m) => m.hostname === 'JN-GW' },
    { name: 'oktet > 255 ditolak', cmds: ['set interfaces p1 unit 0 family inet address 10.0.0.999/24'], expectErrRe: /invalid|error/i },
    { name: 'prefix > 32 ditolak', cmds: ['set routing-options static route 10.9.9.0/33 next-hop 10.0.0.1'], expectErrRe: /invalid|error/i },
    { name: 'show configuration mencerminkan', cmds: ['configure', 'set system host-name JN-SHOW', 'commit', 'show configuration'], expectOutRe: /JN-SHOW|host-name/i },
    { name: 'rollback 0 ke commit terakhir', cmds: ['configure', 'set system host-name JN-TEMP', 'commit', 'delete system host-name', 'rollback 0'], expectMutation: false, assertState: (m) => m.hostname === 'JN-TEMP' },
  ],
  huawei: [
    { name: '? help user view', cmds: ['?'], expectOutRe: /./ },
    { name: 'unknown command → Unrecognized', cmds: ['display-frobnicate all'], expectErrRe: /Unrecognized|Error/i },
    { name: 'system-view masuk config', cmds: ['system-view'], expectOutRe: /./ },
    { name: 'sysname memutasi hostname', cmds: ['system-view', 'sysname HW-SW'], expectMutation: true, assertState: (m) => m.hostname === 'HW-SW' },
    { name: 'IP interface tersimpan', cmds: ['interface GigabitEthernet0/0/1', 'ip address 10.4.1.1 255.255.255.0'], expectMutation: true, assertState: (m) => String(m.configuredIps['GigabitEthernet0/0/1'] || '').startsWith('10.4.1.1') },
    { name: 'mask tidak kontigu ditolak', cmds: ['ip route-static 10.9.9.0 255.0.255.0 10.4.1.254'], expectErrRe: /%|Error|invalid/i },
    { name: 'undo ip address menghapus (negasi VRP)', cmds: ['system-view', 'interface GigabitEthernet0/0/1', 'ip address 10.4.1.9 255.255.255.0', 'undo ip address'], expectMutation: false, assertState: (m) => !String(m.configuredIps['GigabitEthernet0/0/1'] || '').startsWith('10.4.1.9') },
    { name: 'display current-configuration mencerminkan sysname', cmds: ['system-view', 'sysname HW-DISP', 'return', 'display current-configuration'], expectOutRe: /HW-DISP|sysname/i },
  ],
  ubiquiti: [
    { name: '? help oper mode', cmds: ['?'], expectOutRe: /./ },
    { name: 'unknown command ditolak gaya EdgeOS/Vyatta', cmds: ['set definitely-not-a-node value'], expectErrRe: /invalid|unknown|error|nothing|not/i },
    { name: 'set host-name memutasi', cmds: ['configure', 'set system host-name UB-EDGE', 'commit'], expectMutation: true, assertState: (m) => m.hostname === 'UB-EDGE' },
    { name: 'address interface (IPv4 node sama dgn IPv6)', cmds: ['set interfaces ethernet p1 address 10.5.1.1/24'], expectMutation: true, assertState: (m) => String(m.configuredIps['p1'] || '').startsWith('10.5.1.1') },
    { name: 'oktet > 255 ditolak', cmds: ['set interfaces ethernet p1 address 10.0.0.999/24'], expectErrRe: /invalid|error/i },
    { name: 'show configuration mencerminkan', cmds: ['configure', 'set system host-name UB-SHOW', 'commit', 'show configuration'], expectOutRe: /UB-SHOW|host-name/i },
    { name: 'rollback 0 ke commit terakhir', cmds: ['configure', 'set system host-name UB-OK', 'commit', 'set system host-name UB-DRAFT', 'rollback 0'], expectMutation: true, assertState: (m) => m.hostname === 'UB-OK' },
  ],
  vyos: [
    { name: '? help oper mode', cmds: ['?'], expectOutRe: /./ },
    { name: 'unknown command ditolak gaya VyOS', cmds: ['set definitely-not-a-node value'], expectErrRe: /invalid|unknown|error|nothing|not/i },
    { name: 'set host-name memutasi', cmds: ['configure', 'set system host-name VY-GW', 'commit'], expectMutation: true, assertState: (m) => m.hostname === 'VY-GW' },
    { name: 'address interface tersimpan', cmds: ['set interfaces ethernet p1 address 10.6.1.1/24'], expectMutation: true, assertState: (m) => String(m.configuredIps['p1'] || '').startsWith('10.6.1.1') },
    { name: 'prefix > 32 ditolak', cmds: ['set protocols static route 10.9.9.0/33 next-hop 10.6.1.254'], expectErrRe: /invalid|error/i },
    { name: 'show configuration mencerminkan', cmds: ['configure', 'set system host-name VY-SHOW', 'commit', 'show configuration'], expectOutRe: /VY-SHOW|host-name/i },
    { name: 'save menyimpan startup', cmds: ['save'], expectOutRe: /sav|Done|./i },
  ],
  fortinet: [
    { name: 'unknown command ditolak gaya FortiOS', cmds: ['execute frobnicate-now'], expectErrRe: /unknown|invalid|not recognized|command/i },
    { name: 'config/edit/set/next/end stack interface', cmds: ['config system interface', 'edit port1', 'set ip 10.7.1.1 255.255.255.0', 'next', 'end'], expectMutation: true, assertState: (m) => String(m.configuredIps['port1'] || '').startsWith('10.7.1.1') },
    { name: 'gateway bukan IP ditolak (state utuh)', cmds: ['config router static', 'edit 1', 'set gateway 999.0.0.1', 'end'], expectErrRe: /%|invalid|error/i },
    { name: 'set hostname via config system global', cmds: ['config system global', 'set hostname FT-GW', 'end'], expectMutation: true, assertState: (m) => m.hostname === 'FT-GW' },
    { name: 'show mencerminkan konfigurasi', cmds: ['config system interface', 'edit port1', 'set ip 10.7.1.20 255.255.255.0', 'next', 'end', 'show'], expectOutRe: /10\.7\.1\.20|system interface/i },
  ],
  aruba: [
    { name: 'unknown command → % Invalid (keluarga IOS-like)', cmds: ['show frobnicate-detail'], expectErrRe: /%|invalid|incomplete/i },
    { name: 'configure (bukan conf t panjang) masuk config', cmds: ['configure'] },
    { name: 'hostname memutasi', cmds: ['configure', 'hostname AX-SW'], expectMutation: true, assertState: (m) => m.hostname === 'AX-SW' },
    { name: 'vlan 10 membuat VLAN', cmds: ['vlan 10'], expectMutation: true, assertState: (m) => m.vlans.some((v) => String(v.id) === '10') },
    { name: 'IP interface tersimpan', cmds: ['interface p1', 'ip address 10.8.1.1 255.255.255.0'], expectMutation: true, assertState: (m) => String(m.configuredIps['p1'] || '').startsWith('10.8.1.1') },
    { name: 'mask tidak kontigu ditolak', cmds: ['ip route 10.9.9.0 255.255.0.255 10.8.1.254'], expectErrRe: /%|invalid/i },
    { name: 'show running-config mencerminkan', cmds: ['configure', 'hostname AX-DISP', 'end', 'show running-config'], expectOutRe: /AX-DISP|vlan|10\.8\.1\.1/i },
  ],
  openwrt: [
    { name: 'unknown command → bash not found', cmds: ['frobnicate --now'], expectErrRe: /not found/i },
    { name: 'uci set+commit hostname (atomic)', cmds: ['uci set system.@system[0].hostname=OWRT-X', 'uci commit system'], expectMutation: true, assertState: (m) => m.hostname === 'OWRT-X' },
    { name: 'uci set tanpa commit belum atomic', cmds: ['uci set network.zone9.proto=static'], expectMutation: false },
    { name: 'ip addr add tersimpan', cmds: ['ip addr add 10.9.1.1/24 dev p1'], expectMutation: true, assertState: (m) => String(m.configuredIps['p1'] || '').startsWith('10.9.1.1') },
    { name: 'device hantu ditolak', cmds: ['ip addr add 10.9.9.9/24 dev eth9'], expectErrRe: /Cannot find device|error/i },
    { name: 'route mask tidak kontigu ditolak saat commit', cmds: ['uci set network.route7.target=10.9.9.0', 'uci set network.route7.netmask=255.255.0.255', 'uci set network.route7.gateway=192.168.88.1', 'uci commit network'], expectErrRe: /%|invalid|error/i },
    { name: 'uci show mencerminkan hostname ter-commit', cmds: ['uci set system.@system[0].hostname=OWRT-SHOW', 'uci commit system', 'uci show system'], expectOutRe: /OWRT-SHOW|hostname/i },
  ],
  linux: [
    { name: 'unknown command → bash not found', cmds: ['frobnicate --now'], expectErrRe: /not found/i },
    { name: 'hostname memutasi', cmds: ['hostname LN-HOST'], expectMutation: true, assertState: (m) => m.hostname === 'LN-HOST' },
    { name: 'ip addr add tersimpan', cmds: ['ip addr add 10.10.1.5/24 dev p1'], expectMutation: true, assertState: (m) => String(m.configuredIps['p1'] || '').startsWith('10.10.1.5') },
    { name: 'oktet > 255 ditolak', cmds: ['ip addr add 10.0.0.999/24 dev p1'], expectErrRe: /invalid|error/i },
    { name: 'ip link set down memutasi', cmds: ['ip link set p2 down'], expectMutation: true, assertState: (m) => (m.shutdownIfaces || []).includes('p2') },
    { name: 'ip route add default via tersimpan', cmds: ['ip route add default via 10.10.1.1'], expectMutation: true, assertState: (m) => m.routes.some((r) => r.dst === '0.0.0.0/0') },
    { name: 'prefix > 32 ditolak', cmds: ['ip route add 10.9.9.0/33 via 10.10.1.1'], expectErrRe: /invalid|error/i },
    { name: 'cat /etc/resolv.conf mencerminkan DNS', cmds: ['echo "nameserver 8.8.4.4" > /etc/resolv.conf', 'cat /etc/resolv.conf'], expectOutRe: /nameserver 8\.8\.4\.4/ },
  ],
  windows: [
    { name: 'help mencantumkan perintah', cmds: ['help'], expectOutRe: /ipconfig|ping/i },
    { name: 'unknown command gaya Windows', cmds: ['frobnicate /all'], expectErrRe: /not recognized|bukan|tidak dikenali|internal|external/i },
    { name: 'hostname membaca identitas', cmds: ['hostname'], expectOutRe: /./ },
    { name: 'ver membaca versi', cmds: ['ver'], expectOutRe: /Windows|Version/i },
    { name: 'ipconfig menampilkan status interface', cmds: ['ipconfig'], expectOutRe: /adapter|IPv4|Ethernet/i },
  ],
};

// ── Runner ─────────────────────────────────────────────────────────────────
interface CliFidelityResult {
  report: Report;
  /** Skor per vendor (0–100) — sumber dimensi 'cli' di conformance-score.mts. */
  perVendor: Record<string, { passed: number; total: number; pct: number }>;
}

export function runCliFidelityTests(): Report {
  return runCliFidelityDetailed().report;
}

/** Jalankan seluruh probe & kembalikan report + skor per vendor. */
export function runCliFidelityDetailed(): CliFidelityResult {
  console.log('\n== CF. CLI Fidelity conformance probes (per vendor) ==');
  const portsFor: Record<string, string[]> = {
    huawei: ['GigabitEthernet0/0/1', 'GigabitEthernet0/0/2', 'GigabitEthernet0/0/3'],
    fortinet: ['port1', 'port2', 'port3'],
    windows: ['Ethernet'],
  };
  const perVendor: CliFidelityResult['perVendor'] = {};
  for (const [vendor, probes] of Object.entries(PROBES)) {
    let vPass = 0;
    for (const probe of probes) {
      const d = new VendorDispatcher();
      const nodeId = `cf_${vendor}`;
      const ctx: any = mkCtx(nodeId, `${vendor}-cli`, portsFor[vendor] ?? ['p1', 'p2', 'p3']);
      const mem = d.getNodeMemory(nodeId);
      // Seed deterministik: hostname kosong → beberapa probe negasi butuh kondisi awal jelas.
      const before = fingerprint(mem);
      const outputs: string[] = [];
      try {
        for (const cmd of probe.cmds) outputs.push(String(d.dispatch(vendor, cmd, ctx)));
      } catch (e) {
        outputs.push(`THROWN: ${(e as Error)?.message ?? String(e)}`);
      }
      const last = outputs[outputs.length - 1] ?? '';
      const mutated = fingerprint(mem) !== before;
      let ok = true;
      const why: string[] = [];
      if (probe.expectErrRe && !outputs.some((o) => probe.expectErrRe!.test(o))) {
        ok = false;
        why.push(`tidak ada error cocok ${probe.expectErrRe}; out=${outputs.map((o) => o.slice(0, 60)).join(' | ')}`);
      }
      if (ok && probe.expectOutRe && !probe.expectOutRe.test(last)) {
        ok = false;
        why.push(`output akhir tidak cocok ${probe.expectOutRe}; out=${last.slice(0, 80)}`);
      }
      if (ok && probe.expectMutation && !mutated) {
        ok = false;
        why.push('state TIDAK berubah');
      }
      if (ok && !probe.expectMutation && mutated && probe.expectErrRe) {
        // Probe penolakan: error boleh terjadi di tengah rantai, tapi TIDAK BOLEH memutasi state.
        ok = false;
        why.push('input invalid justru memutasi state');
      }
      if (ok && probe.assertState) {
        const st = probe.assertState(mem);
        if (!st) {
          ok = false;
          why.push(`assertState gagal; mem=${JSON.stringify({ ips: mem.configuredIps, hn: mem.hostname, routes: mem.routes.length })}`);
        }
      }
      if (check(`CF ${vendor} · ${probe.name}`, ok, why.join('; '))) vPass++;
    }
    perVendor[vendor] = { passed: vPass, total: probes.length, pct: Math.round((vPass / probes.length) * 1000) / 10 };
    console.log(`   ${vendor}: ${vPass}/${probes.length}`);
  }
  return { report: rep, perVendor };
}
