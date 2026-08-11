// ============================================================
// Automated Lab Testing — "/test"
// Scenario engine: topology + setup + assertions → result.
// Tidak memakai UI; dipakai oleh terminal & test suite.
// ============================================================

import { NetworkSimulator } from '../net/core/NetworkSimulator';
import type { LabProjectLike } from '../net/core/Topology';
import type { AclRule, NatRule } from '../net/core/types';
import type { DhcpPoolInfo } from '../net/compat';

export type LabCategory =
  | 'basic'
  | 'switching'
  | 'services'
  | 'routing'
  | 'security'
  | 'ipv6'
  | 'troubleshooting';

/** Setup: konfigurasi simulasi (dijalankan pada simulator segar). */
export type ScenarioSetup = (sim: NetworkSimulator) => void;

export interface AssertPing {
  type: 'assertPing';
  name: string;
  from: string;
  to: string;
  shouldSucceed?: boolean; // default true
}
export interface AssertRoute {
  type: 'assertRouteExists' | 'assertRouteAbsent';
  name: string;
  node: string;
  dst: string;
  kind?: 'static' | 'dynamic' | 'connected';
}
export interface AssertInterface {
  type: 'assertInterfaceUp' | 'assertInterfaceDown';
  name: string;
  node: string;
  iface: string;
}
export interface AssertIp {
  type: 'assertIpConfigured';
  name: string;
  node: string;
  iface: string;
  cidr: string;
}
export interface AssertDhcp {
  type: 'assertDhcpLease';
  name: string;
  node: string;
  iface?: string;
  expectedPrefix?: string;
}
export interface AssertDns {
  type: 'assertDnsResolve';
  name: string;
  node: string;
  hostname: string;
  expected?: string;
}
export interface AssertBgp {
  type: 'assertBgpEstablished';
  name: string;
  node: string;
  remoteIp: string;
}
export interface AssertOspf {
  type: 'assertOspfNeighbor';
  name: string;
  node: string;
}
export interface AssertBlock {
  type: 'assertBlocked';
  name: string;
  from: string;
  to: string;
  proto?: 'icmp' | 'tcp';
  port?: number;
}
export interface AssertAllowed {
  type: 'assertAllowed';
  name: string;
  from: string;
  to: string;
  proto?: 'icmp' | 'tcp';
  port?: number;
}
export interface AssertVlan {
  type: 'assertVlanReachability';
  name: string;
  from: string;
  to: string;
  reachable: boolean;
}

export type Assertion =
  | AssertPing
  | AssertRoute
  | AssertInterface
  | AssertIp
  | AssertDhcp
  | AssertDns
  | AssertBgp
  | AssertOspf
  | AssertBlock
  | AssertAllowed
  | AssertVlan;

export interface TestScenario {
  id: string;
  name: string;
  description: string;
  category: LabCategory;
  /** Topologi lab (selalu dibuat segar per run). */
  topology: LabProjectLike;
  /** Konfigurasi node/engine. */
  setup: ScenarioSetup;
  /** Daftar assertion yang diverifikasi. */
  tests: Assertion[];
  /** Ringkasan hasil yang diharapkan (dipajang di laporan). */
  expectedResult: string;
}

export interface LabAssertionResult {
  name: string;
  pass: boolean;
  expected: string;
  actual: string;
  likelyCause?: string;
}

export interface LabScenarioResult {
  id: string;
  name: string;
  description: string;
  category: LabCategory;
  expectedResult: string;
  pass: boolean;
  passed: number;
  failed: number;
  assertions: LabAssertionResult[];
}

export interface LabRunSummary {
  total: number;
  passed: number;
  failed: number;
  scenarios: LabScenarioResult[];
}

// ── Runner ────────────────────────────────────────────────────

function nodeName(sim: NetworkSimulator, id: string): string {
  return sim.getDeviceStats(id)?.name || id;
}

function ipOfIface(sim: NetworkSimulator, node: string, iface: string): string | null {
  const st = sim.getDeviceStats(node);
  const i = st?.interfaces.find((x) => x.name === iface);
  return i?.ip || i?.ipv6 || null;
}

function evalAssertion(sim: NetworkSimulator, a: Assertion): LabAssertionResult {
  const base = { name: a.name };
  switch (a.type) {
    case 'assertPing': {
      const r = sim.simulatePing(a.from, a.to);
      const want = a.shouldSucceed !== false;
      return {
        ...base,
        pass: r.success === want,
        expected: want ? `reachable (${nodeName(sim, a.from)} → ${a.to})` : `unreachable (${nodeName(sim, a.from)} → ${a.to})`,
        actual: r.success ? 'reachable' : `unreachable (${r.reason || '?'})`,
        likelyCause:
          r.success === want
            ? undefined
            : want
              ? `Route/ACL/NAT menghalangi ${nodeName(sim, a.from)} → ${a.to} (${r.reason || 'no reason'})`
              : `Terdapat jalur yang seharusnya diblokir`,
      };
    }
    case 'assertRouteExists':
    case 'assertRouteAbsent': {
      const st = sim.getDeviceStats(a.node);
      const found = (st?.routes || []).some(
        (r) => r.dst === a.dst && (!a.kind || r.kind === a.kind)
      );
      const want = a.type === 'assertRouteExists';
      return {
        ...base,
        pass: found === want,
        expected: want ? `route ${a.dst} ada di ${nodeName(sim, a.node)}` : `route ${a.dst} TIDAK ada di ${nodeName(sim, a.node)}`,
        actual: found ? `route ${a.dst} ada` : `route ${a.dst} tidak ada`,
        likelyCause: want && !found ? `Periksa protokol routing / static route di ${nodeName(sim, a.node)}` : undefined,
      };
    }
    case 'assertInterfaceUp':
    case 'assertInterfaceDown': {
      const st = sim.getDeviceStats(a.node);
      const i = st?.interfaces.find((x) => x.name === a.iface);
      const up = i?.up === true;
      const want = a.type === 'assertInterfaceUp';
      return {
        ...base,
        pass: up === want,
        expected: `${a.iface} @ ${nodeName(sim, a.node)} ${want ? 'up' : 'down'}`,
        actual: `${a.iface} @ ${nodeName(sim, a.node)} ${up ? 'up' : 'down'}`,
        likelyCause: up === want ? undefined : want ? 'Interface di-shutdown atau tidak punya IP' : 'Interface tidak di-shutdown',
      };
    }
    case 'assertIpConfigured': {
      const actual = ipOfIface(sim, a.node, a.iface);
      return {
        ...base,
        pass: actual === a.cidr,
        expected: `${a.iface} @ ${nodeName(sim, a.node)} = ${a.cidr}`,
        actual: actual || 'tidak ada IP',
        likelyCause: actual ? `IP berbeda (${actual})` : 'Konfigurasi IP belum diterapkan / ditolak (network/broadcast?)',
      };
    }
    case 'assertDhcpLease': {
      const lease = sim.dhcpLeaseFor(a.node, a.iface);
      const prefixOk = !a.expectedPrefix || (lease?.ip || '').startsWith(a.expectedPrefix);
      return {
        ...base,
        pass: !!lease && prefixOk,
        expected: `DHCP lease untuk ${nodeName(sim, a.node)}${a.expectedPrefix ? ` di ${a.expectedPrefix}.x` : ''}`,
        actual: lease ? lease.ip : 'tanpa lease',
        likelyCause: !lease ? 'DHCP server nonaktif / pool habis / subnet tidak cocok / interface down' : undefined,
      };
    }
    case 'assertDnsResolve': {
      const r = sim.resolveHostname(a.node, a.hostname);
      const ok = !!r.resolved && (!a.expected || r.resolved === a.expected);
      return {
        ...base,
        pass: ok,
        expected: `${a.hostname} → ${a.expected || 'ter-resolve'}`,
        actual: r.resolved ? r.resolved : r.nxdomain ? 'NXDOMAIN' : r.timedOut ? 'timeout (tanpa DNS server)' : 'tidak ter-resolve',
        likelyCause: !r.resolved ? 'DNS server tidak dikonfigurasi / record tidak ada' : undefined,
      };
    }
    case 'assertBgpEstablished': {
      const peers = sim.getBgpNeighborStates(a.node);
      const st = peers?.find((p) => p.remoteAddr === a.remoteIp);
      const est = st?.state === 'Established';
      return {
        ...base,
        pass: est,
        expected: `BGP ${a.node} ↔ ${a.remoteIp} = Established`,
        actual: st ? st.state : 'tidak ada peer',
        likelyCause: !est ? 'ASN/neighbor salah, tidak ada network diiklankan, atau link down' : undefined,
      };
    }
    case 'assertOspfNeighbor': {
      const peers = sim.getOspfNeighbors(a.node);
      const full = peers && peers.length > 0;
      return {
        ...base,
        pass: !!full,
        expected: `OSPF neighbor FULL di ${nodeName(sim, a.node)}`,
        actual: peers && peers.length > 0 ? peers.map((p) => p.state).join(',') : 'tanpa neighbor',
        likelyCause: !full ? 'OSPF network tidak mencakup interface / area salah / link down' : undefined,
      };
    }
    case 'assertBlocked':
    case 'assertAllowed': {
      const wantAllowed = a.type === 'assertAllowed';
      let actual: string;
      let pass: boolean;
      if (a.proto === 'tcp' && a.port) {
        const r = sim.simulateTcpConnect(a.from, a.to, a.port);
        actual = r.ok ? `connected (port ${a.port})` : `refused/blocked (${r.reason || '?'})`;
        pass = r.ok === wantAllowed;
      } else {
        const r = sim.simulatePing(a.from, a.to);
        actual = r.success ? 'reachable' : `blocked (${r.reason || '?'})`;
        pass = r.success === wantAllowed;
      }
      return {
        ...base,
        pass,
        expected: `${nodeName(sim, a.from)} → ${a.to} ${wantAllowed ? 'ALLOWED' : 'BLOCKED'}`,
        actual,
        likelyCause: pass ? undefined : wantAllowed ? 'Firewall/ACL memblokir' : 'Tidak ada aturan yang memblokir',
      };
    }
    case 'assertVlanReachability': {
      const r = sim.simulatePing(a.from, a.to);
      return {
        ...base,
        pass: r.success === a.reachable,
        expected: `${nodeName(sim, a.from)} → ${nodeName(sim, a.to)} ${a.reachable ? 'reachable' : 'isolated (VLAN)'}`,
        actual: r.success ? 'reachable' : 'unreachable',
        likelyCause: a.reachable
          ? 'VLAN/trunk/ROAS belum dikonfigurasi benar'
          : 'Isolasi VLAN bocor (access/trunk salah)',
      };
    }
  }
}

/** Jalankan satu scenario pada simulator segar. */
export function runScenario(scenario: TestScenario): LabScenarioResult {
  const sim = new NetworkSimulator();
  sim.syncTopology(scenario.topology);
  scenario.setup(sim);
  const assertions = scenario.tests.map((a) => evalAssertion(sim, a));
  const passed = assertions.filter((a) => a.pass).length;
  const failed = assertions.length - passed;
  return {
    id: scenario.id,
    name: scenario.name,
    description: scenario.description,
    category: scenario.category,
    expectedResult: scenario.expectedResult,
    pass: failed === 0,
    passed,
    failed,
    assertions,
  };
}

/** Jalankan daftar scenario, agak misal satu gagal tidak menghentikan yang lain. */
export function runLab(scenarios: TestScenario[]): LabRunSummary {
  const results = scenarios.map(runScenario);
  const passed = results.filter((r) => r.pass).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    scenarios: results,
  };
}

// ── Format hasil untuk terminal ───────────────────────────────

export function formatLabResult(summary: LabRunSummary): string {
  const lines: string[] = ['NETWORK TEST', '============='];
  for (const s of summary.scenarios) {
    lines.push('');
    lines.push(`${s.pass ? '✓' : '✗'} [${s.id}] ${s.name} — ${s.pass ? 'PASS' : `FAIL (${s.failed}/${s.assertions.length})`}`);
    lines.push(`  ${s.description}`);
    lines.push(`  Expected: ${s.expectedResult}`);
    for (const a of s.assertions) {
      const mark = a.pass ? '✓' : '✗';
      lines.push(`  ${mark} ${a.name}`);
      if (!a.pass) {
        lines.push(`    Expected: ${a.expected}`);
        lines.push(`    Actual:   ${a.actual}`);
        if (a.likelyCause) lines.push(`    Likely cause: ${a.likelyCause}`);
      }
    }
  }
  lines.push('');
  lines.push(`RESULT: ${summary.passed}/${summary.total} scenario PASS`);
  if (summary.failed > 0) lines.push(`RESULT: ${summary.failed} scenario FAILED`);
  return lines.join('\n');
}

/** Cari scenario by id (prefix match). */
export function findScenarios(registry: TestScenario[], idOrCategory?: string): TestScenario[] {
  if (!idOrCategory || idOrCategory === 'all') return registry;
  const q = idOrCategory.toLowerCase();
  return registry.filter((s) => s.id.toLowerCase().includes(q) || s.category.toLowerCase().includes(q));
}
