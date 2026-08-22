/**
 * Mesin skor konformansi NetLab — SEMUA skor diturunkan dari eksekusi nyata.
 *
 * Dimensi & sumber data (tidak ada angka hardcode):
 *  - cli        : registry kapabilitas (capabilities.ts), bobot status
 *                 supported=100, partial=60, parser-only=25, not-supported=0.
 *  - config     : matriks fitur per vendor (verify-all-vendors.mts).
 *  - engine     : suite kebenaran inti (tests/unit/phase1CoreCorrectness.test.ts)
 *                 — determinisme, parsing ketat, validasi core (shared engine).
 *  - protocols  : 60% kasus protokol pada matriks fitur (OSPF/BGP/RIP)
 *                 + 40% share status kapabilitas protokol di registry.
 *  - validation : probe input-tidak-valid PER VENDOR — CLI wajib menolak dengan
 *                 pesan error DAN tidak mengubah state (routes/configuredIps).
 *  - testing    : rasio lulus suite interop+registry (vendorInterop.test.ts).
 *
 * Formula: total = .20*cli + .20*config + .20*engine + .20*protocols
 *                 + .10*validation + .10*testing
 * PASS ≥90 hanya jika total ≥90 DAN floor sub-dimensi terpenuhi
 * (cli≥85, config≥85, engine≥90, protocols≥85, validation≥80, testing≥90).
 *
 * Jalankan: npx tsx scripts/conformance-score.mts [--json=path]
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { VendorDispatcher } from '../packages/vendors/src/index';
import { VENDOR_CAPABILITIES } from '../packages/vendors/src/capabilities';
import { runVerifyMatrix } from './verify-all-vendors.mts';
import { runPhase1CoreTests } from '../tests/unit/phase1CoreCorrectness.test';
import { runVendorInteropTests } from '../tests/unit/vendorInterop.test';

const WEIGHTS = { cli: 0.2, config: 0.2, engine: 0.2, protocols: 0.2, validation: 0.1, testing: 0.1 };
const FLOORS = { cli: 85, config: 85, engine: 90, protocols: 85, validation: 80, testing: 90 };
const STATUS_WEIGHT: Record<string, number> = { supported: 100, partial: 60, 'parser-only': 25, 'not-supported': 0 };
const PROTOCOL_CAPS = ['ospf', 'rip', 'eigrp', 'bgp', 'vrrp'] as const;

/** Probe input-tidak-valid per vendor: harus DITOLAK tanpa mengubah state. */
const VALIDATION_PROBES: Record<string, { name: string; cmds: string[] }[]> = {
  mikrotik: [
    { name: 'IP oktet > 255', cmds: ['/ip address add address=300.1.1.1/24 interface=p1'] },
    { name: 'Gateway bukan IP', cmds: ['/ip route add dst-address=10.9.9.0/27 gateway=not-an-ip'] },
  ],
  cisco_ios: [
    { name: 'Mask route tidak kontigu', cmds: ['ip route 10.9.9.0 255.255.255.3 192.168.1.1'] },
    { name: 'Mask interface tidak kontigu', cmds: ['interface p1', 'ip address 1.2.3.4 255.0.255.0'] },
  ],
  cisco_nxos: [
    { name: 'Prefix > 32', cmds: ['ip route 10.9.9.0/33 10.0.0.1'] },
  ],
  juniper: [
    { name: 'Oktet IP > 255', cmds: ['set interfaces p1 unit 0 family inet address 10.0.0.999/24'] },
    { name: 'Prefix > 32', cmds: ['set routing-options static route 10.9.9.0/33 next-hop 10.0.0.1'] },
  ],
  huawei: [
    { name: 'Mask tidak kontigu', cmds: ['ip route-static 10.9.9.0 255.0.255.0 10.0.0.1'] },
    { name: 'Prefix digit sampah', cmds: ['ip route-static 10.9.9.0 24x 10.0.0.1'] },
  ],
  ubiquiti: [
    { name: 'Prefix > 32', cmds: ['set protocols static route 10.9.9.0/33 next-hop 10.0.0.1'] },
    { name: 'Oktet IP > 255', cmds: ['set interfaces ethernet p1 address 10.0.0.999/24'] },
  ],
  vyos: [
    { name: 'Prefix > 32', cmds: ['set protocols static route 10.9.9.0/33 next-hop 10.0.0.1'] },
    { name: 'Oktet IP > 255', cmds: ['set interfaces ethernet p1 address 10.0.0.999/24'] },
  ],
  fortinet: [
    { name: 'Gateway bukan IP', cmds: ['config router static', 'edit 1', 'set gateway 999.0.0.1', 'end'] },
  ],
  aruba: [
    { name: 'Mask tidak kontigu', cmds: ['ip route 10.9.9.0 255.255.0.255 10.0.0.1'] },
    { name: 'IP oktet > 255', cmds: ['interface p1', 'ip address 300.1.1.1 255.255.255.0'] },
  ],
  openwrt: [
    {
      name: 'Route mask tidak kontigu',
      cmds: ['uci set network.route7.target=10.9.9.0', 'uci set network.route7.netmask=255.255.0.255', 'uci set network.route7.gateway=192.168.88.1', 'uci commit network'],
    },
  ],
  linux: [
    { name: 'Prefix > 32', cmds: ['ip route add 10.9.9.0/33 via 10.0.0.1'] },
    { name: 'Oktet IP > 255', cmds: ['ip addr add 10.0.0.999/24 dev p1'] },
  ],
};

const ERROR_RE = /%|invalid|incomplete|failed|unknown|unrecognized|not supported|bad argument|must be|error/i;
const isProtoCase = (name: string) => /ospf|bgp|rip/i.test(name);

function capsScore(vendorId: string, keys?: readonly string[]): number {
  const reg = VENDOR_CAPABILITIES[vendorId];
  if (!reg) return 0;
  const list = keys ?? Object.keys(reg.caps);
  const vals = list.map((k) => STATUS_WEIGHT[reg.caps[k as keyof typeof reg.caps]] ?? 0);
  return vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
}

function stateFingerprint(mem: any): string {
  return JSON.stringify({ ips: mem.configuredIps, routes: mem.routes });
}

function runValidationProbes(vendor: string): { total: number; passed: number; failed: string[] } {
  const probes = VALIDATION_PROBES[vendor] ?? [];
  let passed = 0;
  const failed: string[] = [];
  for (const probe of probes) {
    const d = new VendorDispatcher();
    const ctx: any = {
      nodeId: `v_${vendor}`, name: `${vendor}-val`,
      ports: [{ id: 'p1', name: 'p1', status: 'up' }, { id: 'p2', name: 'p2', status: 'down' }],
      pingSimulator: undefined,
    };
    const mem: any = d.getNodeMemory(`v_${vendor}`);
    const before = stateFingerprint(mem);
    const outputs: string[] = [];
    for (const cmd of probe.cmds) outputs.push(d.dispatch(vendor, cmd, ctx));
    // Ditolak = minimal SATU langkah menjawab error (penolakan boleh terjadi
    // di tengah rantai; langkah berikutnya boleh sukses).
    const rejected = outputs.some((o) => ERROR_RE.test(o));
    const unchanged = stateFingerprint(mem) === before;
    if (rejected && unchanged) passed++;
    else failed.push(`${probe.name}${rejected ? '' : ' [diterima diam-diam]'}${unchanged ? '' : ' [state berubah]'}`);
  }
  return { total: probes.length, passed, failed };
}

export interface VendorScore {
  vendor: string;
  cli: number;
  config: number | null;
  engine: number;
  protocols: number | null;
  validation: number | null;
  testing: number;
  total: number | null;
  pass: boolean;
  detail: Record<string, unknown>;
}

export function computeConformance(): { scores: VendorScore[]; globals: Record<string, number>; generatedAt: string; commit: string } {
  // 1. Matriks fitur (config-plane) — dieksekusi sungguhan.
  const matrix = runVerifyMatrix({ quiet: true });
  const byVendor = new Map(matrix.vendors.map((v) => [v.vendor, v]));

  // 2. Suite inti (engine global) + suite interop (testing global).
  const core = runPhase1CoreTests();
  const enginePct = core.passed / Math.max(1, core.passed + core.failed) * 100;
  const interop = runVendorInteropTests();
  const testingPct = interop.passed / Math.max(1, interop.passed + interop.failed) * 100;

  let commit = 'unknown';
  try { commit = execSync('git rev-parse --short HEAD').toString().trim(); } catch { /* bukan repo */ }

  const scores: VendorScore[] = [];
  for (const vid of Object.keys(VENDOR_CAPABILITIES)) {
    const m = byVendor.get(vid);
    const hasMatrix = !!m && m.total > 0;

    const cli = capsScore(vid);
    const config = hasMatrix ? (m!.pass / m!.total) * 100 : null;

    let protoMatrixRate: number | null = null;
    if (hasMatrix) {
      const protoCases = m!.cases.filter((c) => isProtoCase(c.name));
      if (protoCases.length) {
        protoMatrixRate = protoCases.filter((c) => c.status === 'PASS').length / protoCases.length * 100;
      }
    }
    const protoCapsShare = capsScore(vid, PROTOCOL_CAPS);
    // Vendor tanpa kasus protokol di matriks → pakai share registry saja.
    const protocols = protoMatrixRate !== null ? 0.6 * protoMatrixRate + 0.4 * protoCapsShare : hasMatrix ? protoCapsShare : null;

    const vp = runValidationProbes(vid);
    const validation = vp.total ? (vp.passed / vp.total) * 100 : null;

    const dims: (number | null)[] = [cli, config, enginePct, protocols, validation, testingPct];
    const complete = dims.every((v) => v !== null);
    let total: number | null = null;
    let pass = false;
    if (complete) {
      total =
        WEIGHTS.cli * cli +
        WEIGHTS.config * (config as number) +
        WEIGHTS.engine * enginePct +
        WEIGHTS.protocols * (protocols as number) +
        WEIGHTS.validation * (validation as number) +
        WEIGHTS.testing * testingPct;
      total = Math.round(total * 10) / 10;
      pass = total >= 90 &&
        cli >= FLOORS.cli && (config as number) >= FLOORS.config && enginePct >= FLOORS.engine &&
        (protocols as number) >= FLOORS.protocols && (validation as number) >= FLOORS.validation && testingPct >= FLOORS.testing;
    }

    scores.push({
      vendor: vid,
      cli: Math.round(cli * 10) / 10,
      config: config === null ? null : Math.round(config * 10) / 10,
      engine: Math.round(enginePct * 10) / 10,
      protocols: protocols === null ? null : Math.round(protocols * 10) / 10,
      validation: validation === null ? null : Math.round(validation * 10) / 10,
      testing: Math.round(testingPct * 10) / 10,
      total,
      pass,
      detail: {
        matrixTotal: m?.total ?? 0,
        matrixPass: m?.pass ?? 0,
        matrixFail: m?.fail ?? 0,
        validationProbes: vp.total,
        validationPassed: vp.passed,
        validationFailed: vp.failed,
      },
    });
  }

  return {
    scores,
    globals: {
      engineChecks: core.passed + core.failed,
      enginePassed: core.passed,
      interopChecks: interop.passed + interop.failed,
      interopPassed: interop.passed,
      matrixPass: matrix.pass,
      matrixFail: matrix.fail,
      matrixSkip: matrix.skip,
    },
    generatedAt: new Date().toISOString(),
    commit,
  };
}

function renderTable(scores: VendorScore[]): string {
  const head = ['vendor', 'cli', 'config', 'engine', 'proto', 'valid', 'testing', 'TOTAL', 'PASS'];
  const rows = scores.map((s) => [
    s.vendor,
    String(s.cli),
    s.config === null ? 'n/a' : String(s.config),
    String(s.engine),
    s.protocols === null ? 'n/a' : String(s.protocols),
    s.validation === null ? 'n/a' : String(s.validation),
    String(s.testing),
    s.total === null ? 'n/a' : String(s.total),
    s.total === null ? '(dim tak lengkap)' : s.pass ? 'YES' : 'no',
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const fmt = (r: string[]) => r.map((c, i) => c.padEnd(widths[i])).join('  ');
  return [fmt(head), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map(fmt)].join('\n');
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  const jsonArg = process.argv.find((a) => a.startsWith('--json='));
  const result = computeConformance();
  console.log(renderTable(result.scores));
  console.log(`\nGlobals: engine ${result.globals.enginePassed}/${result.globals.engineChecks}, interop ${result.globals.interopPassed}/${result.globals.interopChecks}, matrix ${result.globals.matrixPass}/${result.globals.matrixPass + result.globals.matrixFail} (${result.globals.matrixSkip} skip)`);
  const failingValidation = result.scores.flatMap((s) => (s.detail.validationFailed as string[]).map((f) => `${s.vendor}: ${f}`));
  if (failingValidation.length) console.log('\nVALIDATION GAPS (input invalid diterima/state berubah):\n  ' + failingValidation.join('\n  '));
  if (jsonArg) writeFileSync(jsonArg.slice('--json='.length), JSON.stringify(result, null, 2) + '\n');
}
