// ============================================================
// Verify Engine — audit fitur network engine secara end-to-end:
// TCP, NAT masquerade, port-forwarding (dstnat), ACL, DNS, LLDP,
// VLAN isolation, router-on-a-stick (subinterface).
// Jalankan: .\node_modules\.bin\tsx.cmd scripts\verify-engine.mts
// ============================================================

import { NetworkSimulator } from '../src/engine/net/core/NetworkSimulator';
import type { LabProjectLike } from '../src/engine/net/core/Topology';

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail = ''): void {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    failures.push(`${label}${detail ? ` :: ${detail}` : ''}`);
    console.log(`  FAIL  ${label}${detail ? ` :: ${detail}` : ''}`);
  }
}

function sep(label: string): void {
  console.log(`\n${'═'.repeat(64)}\n${label}\n${'═'.repeat(64)}`);
}

function ports(n: number, macSeed: string) {
  return Array.from({ length: n }, (_, i) => ({
    id: `port${i + 1}`,
    name: `ether${i + 1}`,
    status: 'up',
    macAddress: `00:0c:29:${macSeed}:${(i + 1).toString().padStart(2, '0')}:01`,
  }));
}

function node(id: string, name: string, deviceType: string, portCount: number, macSeed: string) {
  return {
    id,
    name,
    vendor: deviceType === 'pc' || deviceType === 'server' ? 'linux' : 'mikrotik',
    model: deviceType,
    deviceType,
    ports: ports(portCount, macSeed),
  };
}

function edge(id: string, a: string, ap: string, b: string, bp: string) {
  return { id, sourceNodeId: a, sourcePortId: ap, targetNodeId: b, targetPortId: bp, cableType: 'copper_straight' };
}

// ── Lab 1: layanan internal, routing antar-router, ACL, DNS, LLDP ──────────
function lab1(): { sim: NetworkSimulator; setAcls: (r: import('../src/engine/net/core/types').AclRule[] | undefined) => void } {
  const sim = new NetworkSimulator();
  const project: LabProjectLike = {
    nodes: [
      node('pc1', 'PC1', 'pc', 1, '01'),
      node('svr1', 'SVR1', 'server', 1, '02'),
      node('sw1', 'SW1', 'switch', 4, '03'),
      node('r1', 'R1', 'router', 3, '04'),
      node('r2', 'R2', 'router', 3, '05'),
      node('sw2', 'SW2', 'switch', 4, '06'),
      node('pc2', 'PC2', 'pc', 1, '07'),
      node('svr2', 'SVR2', 'server', 1, '08'),
    ],
    edges: [
      edge('e1', 'pc1', 'port1', 'sw1', 'port1'),
      edge('e2', 'svr1', 'port1', 'sw1', 'port2'),
      edge('e3', 'sw1', 'port3', 'r1', 'port1'),
      edge('e4', 'r1', 'port2', 'r2', 'port1'),
      edge('e5', 'r2', 'port2', 'sw2', 'port1'),
      edge('e6', 'sw2', 'port2', 'pc2', 'port1'),
      edge('e7', 'sw2', 'port3', 'svr2', 'port1'),
    ],
  };
  sim.syncTopology(project);
  sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24', ether2: '192.168.1.1/30' }, [{ dst: '10.0.2.0/24', gateway: '192.168.1.2' }]);
  sim.applyNodeConfig('r2', { ether1: '192.168.1.2/30', ether2: '10.0.2.1/24' }, [{ dst: '10.0.1.0/24', gateway: '192.168.1.1' }]);
  sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
  sim.applyNodeConfig('svr1', { ether1: '10.0.1.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
  sim.applyNodeConfig('pc2', { ether1: '10.0.2.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.2.1' }]);
  sim.applyNodeConfig('svr2', { ether1: '10.0.2.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.2.1' }]);
  sim.setWebServer('svr1', { enabled: true, port: 80, content: 'Hello NetLab' });
  sim.setWebServer('svr2', { enabled: true, port: 80, content: 'Back' });
  sim.setDnsRecords('r1', [{ name: 'web.lab', address: '10.0.1.10' }]);
  sim.setDnsServers('pc1', ['10.0.1.1']);
  return { sim, setAcls: (r) => sim.setAcls('r1', r) };
}

// ── Lab 2: NAT masquerade LAN → internet ───────────────────────────────────
function lab2(): { sim: NetworkSimulator; setNat: (rules: import('../src/engine/net/core/types').NatRule[]) => void } {
  const sim = new NetworkSimulator();
  const project: LabProjectLike = {
    nodes: [
      node('pc1', 'PC1', 'pc', 1, '01'),
      node('sw1', 'SW1', 'switch', 4, '02'),
      node('r1', 'R1', 'router', 3, '03'),
      node('r2', 'R2-ISP', 'router', 3, '04'),
      node('pub', 'PUB', 'server', 1, '05'),
    ],
    edges: [
      edge('e1', 'pc1', 'port1', 'sw1', 'port1'),
      edge('e2', 'sw1', 'port2', 'r1', 'port1'),
      edge('e3', 'r1', 'port2', 'r2', 'port1'),
      edge('e4', 'r2', 'port2', 'pub', 'port1'),
    ],
  };
  sim.syncTopology(project);
  // R2 sengaja TIDAK punya rute balik ke 10.0.1.0/24 → tanpa NAT handshake gagal.
  sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24', ether2: '203.0.113.1/24' }, [{ dst: '0.0.0.0/0', gateway: '203.0.113.254' }]);
  sim.applyNodeConfig('r2', { ether1: '203.0.113.254/24', ether2: '8.8.8.1/24' }, []);
  sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
  sim.applyNodeConfig('pub', { ether1: '8.8.8.8/24' }, [{ dst: '0.0.0.0/0', gateway: '8.8.8.1' }]);
  sim.setWebServer('pub', { enabled: true, port: 80, content: 'Public' });
  return { sim, setNat: (rules) => sim.setNatRules('r1', rules) };
}

// ── Lab 3: port-forwarding (dstnat) ────────────────────────────────────────
function lab3(): { sim: NetworkSimulator; setNat: (rules: import('../src/engine/net/core/types').NatRule[]) => void } {
  const sim = new NetworkSimulator();
  const project: LabProjectLike = {
    nodes: [
      node('host2', 'HOST2', 'pc', 1, '01'),
      node('r2', 'R2-ISP', 'router', 3, '02'),
      node('r1', 'R1', 'router', 3, '03'),
      node('sw1', 'SW1', 'switch', 4, '04'),
      node('svr1', 'SVR1', 'server', 1, '05'),
    ],
    edges: [
      edge('e1', 'host2', 'port1', 'r2', 'port3'),
      edge('e2', 'r2', 'port1', 'r1', 'port2'),
      edge('e3', 'r1', 'port1', 'sw1', 'port3'),
      edge('e4', 'sw1', 'port2', 'svr1', 'port1'),
    ],
  };
  sim.syncTopology(project);
  sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24', ether2: '203.0.113.1/24' }, [{ dst: '0.0.0.0/0', gateway: '203.0.113.254' }]);
  sim.applyNodeConfig('r2', { ether1: '203.0.113.254/24', ether3: '198.51.100.1/24' }, [
    { dst: '10.0.1.0/24', gateway: '203.0.113.1' },
  ]);
  sim.applyNodeConfig('svr1', { ether1: '10.0.1.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
  sim.applyNodeConfig('host2', { ether1: '198.51.100.10/24' }, [{ dst: '0.0.0.0/0', gateway: '198.51.100.1' }]);
  sim.setWebServer('svr1', { enabled: true, port: 80, content: 'Hello NetLab' });
  return { sim, setNat: (rules) => sim.setNatRules('r1', rules) };
}

// ── Lab 4: VLAN + router-on-a-stick ────────────────────────────────────────
function lab4(): { sim: NetworkSimulator } {
  const sim = new NetworkSimulator();
  const project: LabProjectLike = {
    nodes: [
      node('pc1', 'PC1', 'pc', 1, '01'),
      node('svr1', 'SVR1', 'server', 1, '02'),
      node('pc3', 'PC3', 'pc', 1, '03'),
      node('sw1', 'SW1', 'switch', 5, '04'),
      node('r1', 'R1', 'router', 3, '05'),
      node('r2', 'R2', 'router', 3, '06'),
      node('pc4', 'PC4', 'pc', 1, '07'),
    ],
    edges: [
      edge('e1', 'pc1', 'port1', 'sw1', 'port1'),
      edge('e2', 'svr1', 'port1', 'sw1', 'port2'),
      edge('e3', 'pc3', 'port1', 'sw1', 'port3'),
      edge('e4', 'sw1', 'port4', 'r1', 'port3'),
      edge('e5', 'r1', 'port1', 'r2', 'port1'),
      edge('e6', 'r2', 'port2', 'pc4', 'port1'),
    ],
  };
  sim.syncTopology(project);
  sim.setPortVlans('sw1', { ether1: 10, ether2: 10, ether3: 20 });
  sim.setTrunkPorts('sw1', ['ether4']);
  sim.setSubinterfaces('r1', [
    { name: 'ether3.10', parentPort: 'ether3', vlanId: 10 },
    { name: 'ether3.20', parentPort: 'ether3', vlanId: 20 },
  ]);
  sim.applyNodeConfig(
    'r1',
    { 'ether3.10': '10.0.1.1/24', 'ether3.20': '10.0.2.1/24', ether1: '192.168.1.1/30' },
    [{ dst: '10.0.3.0/24', gateway: '192.168.1.2' }]
  );
  sim.applyNodeConfig('r2', { ether1: '192.168.1.2/30', ether2: '10.0.3.1/24' }, [
    { dst: '10.0.1.0/24', gateway: '192.168.1.1' },
    { dst: '10.0.2.0/24', gateway: '192.168.1.1' },
  ]);
  sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
  sim.applyNodeConfig('svr1', { ether1: '10.0.1.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
  sim.applyNodeConfig('pc3', { ether1: '10.0.2.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.2.1' }]);
  sim.applyNodeConfig('pc4', { ether1: '10.0.3.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.3.1' }]);
  sim.setWebServer('svr1', { enabled: true, port: 80, content: 'Hello NetLab' });
  return { sim };
}

// ── Lab 5: isolasi L2 VLAN murni (tanpa router) ────────────────────────────
function lab5(): { sim: NetworkSimulator } {
  const sim = new NetworkSimulator();
  const project: LabProjectLike = {
    nodes: [
      node('pcA', 'PCA', 'pc', 1, '10'),
      node('pcB', 'PCB', 'pc', 1, '11'),
      node('pcC', 'PCC', 'pc', 1, '12'),
      node('sw1', 'SW1', 'switch', 5, '13'),
    ],
    edges: [
      edge('e1', 'pcA', 'port1', 'sw1', 'port1'),
      edge('e2', 'pcB', 'port1', 'sw1', 'port2'),
      edge('e3', 'pcC', 'port1', 'sw1', 'port3'),
    ],
  };
  sim.syncTopology(project);
  sim.setPortVlans('sw1', { ether1: 10, ether2: 20, ether3: 10 });
  sim.applyNodeConfig('pcA', { ether1: '10.0.1.2/24' }, []);
  sim.applyNodeConfig('pcB', { ether1: '10.0.2.2/24' }, []);
  sim.applyNodeConfig('pcC', { ether1: '10.0.1.3/24' }, []);
  return { sim };
}

function pingSummary(sim: NetworkSimulator, from: string, to: string): string {
  const r = sim.simulatePing(from, to);
  return `success=${r.success} reason=${r.reason ?? '-'} path=${r.path.join('→')}`;
}

function main(): void {
  // ── Lab 1 ──────────────────────────────────────────────
  sep('LAB 1 — layanan internal, ACL, DNS, LLDP');
  const l1 = lab1();
  const s1 = l1.sim;

  check('ping PC1 → SVR1 (10.0.1.10) sukses', s1.simulatePing('pc1', '10.0.1.10').success, pingSummary(s1, 'pc1', '10.0.1.10'));
  check('ping PC1 → PC2 (10.0.2.2 via R1/R2) sukses', s1.simulatePing('pc1', '10.0.2.2').success, pingSummary(s1, 'pc1', '10.0.2.2'));

  const tcpOk = s1.simulateTcpConnect('pc1', '10.0.1.10', 80);
  check('TCP PC1 → SVR1:80 handshake + status 200', tcpOk.ok && tcpOk.status === 200 && tcpOk.body === 'Hello NetLab', JSON.stringify({ ok: tcpOk.ok, status: tcpOk.status, body: tcpOk.body, reason: tcpOk.reason }));

  const tcpRefused = s1.simulateTcpConnect('pc1', '10.0.1.10', 22);
  check('TCP PC1 → SVR1:22 (port tertutup) ditolak', !tcpRefused.ok, `ok=${tcpRefused.ok} reason=${tcpRefused.reason ?? '-'}`);

  const tcpToPc = s1.simulateTcpConnect('pc1', '10.0.2.2', 80);
  check('TCP PC1 → PC2:80 (tanpa server) ditolak', !tcpToPc.ok, `ok=${tcpToPc.ok} reason=${tcpToPc.reason ?? '-'}`);

  const dns = s1.resolveHostname('pc1', 'web.lab');
  check('DNS web.lab → 10.0.1.10 via server 10.0.1.1', dns.resolved === '10.0.1.10', JSON.stringify(dns));
  const dnsNx = s1.resolveHostname('pc1', 'nope.example');
  check('DNS nope.example → NXDOMAIN', dnsNx.resolved === null && dnsNx.nxdomain === true, JSON.stringify(dnsNx));

  const lldpR1 = s1.getLldpNeighbors('r1');
  check('LLDP R1 melihat 2 tetangga (SW1, R2)', lldpR1.length === 2, `count=${lldpR1.length}`);
  const lldpPc = s1.getLldpNeighbors('pc1');
  check('LLDP PC1 melihat SW1', lldpPc.some((n) => n.peerNodeId === 'sw1'), JSON.stringify(lldpPc));

  // ACL
  l1.setAcls([{ action: 'deny', proto: 'icmp', src: '10.0.1.0/24', dst: '10.0.2.0/24' }]);
  const blocked = s1.simulatePing('pc1', '10.0.2.2');
  check('ACL deny icmp → ping PC1 → PC2 diblokir', !blocked.success && blocked.reason === 'blocked', pingSummary(s1, 'pc1', '10.0.2.2'));
  check('ACL deny icmp → ping PC1 → SVR1 (tak kena) tetap sukses', s1.simulatePing('pc1', '10.0.1.10').success, pingSummary(s1, 'pc1', '10.0.1.10'));
  const tcpUnderAcl = s1.simulateTcpConnect('pc1', '10.0.2.10', 80);
  check('ACL deny icmp → TCP PC1 → SVR2:80 tetap jalan', tcpUnderAcl.ok && tcpUnderAcl.body === 'Back', JSON.stringify({ ok: tcpUnderAcl.ok, body: tcpUnderAcl.body, reason: tcpUnderAcl.reason }));
  l1.setAcls(undefined);
  check('ACL dicabut → ping PC1 → PC2 sukses lagi', s1.simulatePing('pc1', '10.0.2.2').success, pingSummary(s1, 'pc1', '10.0.2.2'));

  // ── Lab 2: NAT masquerade ─────────────────────────────
  sep('LAB 2 — NAT masquerade LAN → internet');
  const l2 = lab2();
  const s2 = l2.sim;

  const noNat = s2.simulateTcpConnect('pc1', '8.8.8.8', 80);
  check('Tanpa NAT: TCP PC1 → 8.8.8.8:80 gagal (tak ada rute balik)', !noNat.ok, `ok=${noNat.ok} reason=${noNat.reason ?? '-'}`);

  l2.setNat([{ chain: 'srcnat', action: 'masquerade', outInterface: 'ether2' }]);
  const nat = s2.simulateTcpConnect('pc1', '8.8.8.8', 80);
  check('NAT masquerade: TCP PC1 → 8.8.8.8:80 sukses (status 200, body Public)', nat.ok && nat.status === 200 && nat.body === 'Public', JSON.stringify({ ok: nat.ok, status: nat.status, body: nat.body, reason: nat.reason }));
  check('NAT masquerade: ping PC1 → 8.8.8.8 sukses', s2.simulatePing('pc1', '8.8.8.8').success, pingSummary(s2, 'pc1', '8.8.8.8'));

  // ── Lab 3: port-forwarding ────────────────────────────
  sep('LAB 3 — port-forwarding (dstnat)');
  const l3 = lab3();
  const s3 = l3.sim;

  const pfOff = s3.simulateTcpConnect('host2', '203.0.113.1', 8080);
  check('Tanpa dstnat: HOST2 → 203.0.113.1:8080 gagal', !pfOff.ok, `ok=${pfOff.ok} reason=${pfOff.reason ?? '-'}`);

  l3.setNat([{ chain: 'dstnat', action: 'dstnat', protocol: 'tcp', dstAddress: '203.0.113.1', dstPort: '8080', toAddresses: '10.0.1.10', toPorts: '80' }]);
  const pf = s3.simulateTcpConnect('host2', '203.0.113.1', 8080);
  check('dstnat: HOST2 → 203.0.113.1:8080 → 10.0.1.10:80 sukses', pf.ok && pf.status === 200 && pf.body === 'Hello NetLab', JSON.stringify({ ok: pf.ok, status: pf.status, body: pf.body, reason: pf.reason }));
  const pfWrong = s3.simulateTcpConnect('host2', '203.0.113.1', 81);
  check('dstnat: HOST2 → 203.0.113.1:81 (tak kena rule) ditolak', !pfWrong.ok, `ok=${pfWrong.ok} reason=${pfWrong.reason ?? '-'}`);

  // ── Lab 4: VLAN + router-on-a-stick ───────────────────
  sep('LAB 4 — VLAN isolation + router-on-a-stick');
  const s4 = lab4().sim;

  check('VLAN: ping PC1 → SVR1 (sama VLAN 10) sukses', s4.simulatePing('pc1', '10.0.1.10').success, pingSummary(s4, 'pc1', '10.0.1.10'));
  check('Router-on-a-stick: ping PC1 → gateway subif 10.0.1.1 sukses', s4.simulatePing('pc1', '10.0.1.1').success, pingSummary(s4, 'pc1', '10.0.1.1'));
  check('Inter-VLAN routing: ping PC1 → PC3 via R1 sukses', s4.simulatePing('pc1', '10.0.2.2').success, pingSummary(s4, 'pc1', '10.0.2.2'));
  check('Cross-router via trunk: ping PC1 → PC4 (10.0.3.2) sukses', s4.simulatePing('pc1', '10.0.3.2').success, pingSummary(s4, 'pc1', '10.0.3.2'));
  const tcpVlan = s4.simulateTcpConnect('pc1', '10.0.1.10', 80);
  check('VLAN: TCP PC1 → SVR1:80 (sama VLAN) sukses', tcpVlan.ok && tcpVlan.body === 'Hello NetLab', JSON.stringify({ ok: tcpVlan.ok, body: tcpVlan.body, reason: tcpVlan.reason }));

  // ── Lab 5: isolasi L2 murni ────────────────────────────
  sep('LAB 5 — isolasi L2 VLAN (tanpa router)');
  const s5 = lab5().sim;
  check('L2: ping PCA → PCC (sama VLAN 10) sukses', s5.simulatePing('pcA', '10.0.1.3').success, pingSummary(s5, 'pcA', '10.0.1.3'));
  check('L2: ping PCA → PCB (beda VLAN) GAGAL', !s5.simulatePing('pcA', '10.0.2.2').success, pingSummary(s5, 'pcA', '10.0.2.2'));
  check('L2: ping PCB → PCC (beda VLAN) GAGAL', !s5.simulatePing('pcB', '10.0.1.3').success, pingSummary(s5, 'pcB', '10.0.1.3'));

  console.log(`\n${'═'.repeat(64)}\nHASIL: ${pass} passed, ${fail} failed\n${'═'.repeat(64)}`);
  if (failures.length > 0) {
    console.log('\nDaftar kegagalan:');
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log('SEMUA FITUR BERJALAN ✓');
}

main();
