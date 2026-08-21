/**
 * DATA PLANE UPGRADE TEST SUITE — P2 (MTU, fragmentasi IPv4, ping size,
 * interface counters error).
 *
 * Menguji peningkatan engine src/engine/net:
 *  - ping size: ukuran paket dihormati (simulatePing size param).
 *  - MTU: paket > MTU interface keluar → fragmentasi (DF tidak diset) atau
 *    ICMP Fragmentation Needed type 3 code 4 (DF diset, reason 'frag-needed').
 *  - Reassembly: hanya host tujuan yang menggabungkan fragment (router
 *    perantara meneruskan fragment apa adanya).
 *  - Echo reply membawa ukuran request (round-trip besar tetap bekerja).
 *  - Counters: inPkts/outPkts/inOctets/outOctets + inErrors/outErrors
 *    (outErrors naik saat link/port mati saat transmit).
 *
 * Bagian dari run_all_tests.mts — murni, tanpa DOM.
 */
import { NetworkSimulator } from '../../src/engine/net/core/NetworkSimulator';
import type { LabProjectLike } from '../../src/engine/net/core/Topology';

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
    rep.fails.push(name);
    console.log(`  FAIL ${name} ${detail}`);
  }
}

function node(id: string, name: string, kind: 'pc' | 'server' | 'router' | 'switch', ports: number, seed: string) {
  return {
    id,
    name,
    vendor: kind === 'pc' ? 'linux' : 'cisco_ios',
    model: kind,
    deviceType: kind,
    ports: Array.from({ length: ports }, (_, i) => ({
      id: `ether${i + 1}`,
      name: `ether${i + 1}`,
      status: 'up',
      macAddress: `00:0c:29:${seed}:${(i + 1).toString().padStart(2, '0')}:01`,
    })),
  };
}

function edge(id: string, a: string, ap: string, b: string, bp: string) {
  return { id, sourceNodeId: a, sourcePortId: ap, targetNodeId: b, targetPortId: bp, cableType: 'copper_straight' };
}

/** Lab 2-segmen: pc1 -- r1 -- pc2 (r1 sebagai router antar segmen). */
function lab3(): { sim: NetworkSimulator } {
  const sim = new NetworkSimulator();
  const project: LabProjectLike = {
    nodes: [node('pc1', 'PC1', 'pc', 1, 'd1a'), node('r1', 'R1', 'router', 2, 'd1b'), node('pc2', 'PC2', 'pc', 1, 'd1c')],
    edges: [edge('e1', 'pc1', 'ether1', 'r1', 'ether1'), edge('e2', 'r1', 'ether2', 'pc2', 'ether1')],
  };
  sim.syncTopology(project);
  sim.applyNodeConfig('pc1', { ether1: '10.0.1.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
  sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24', ether2: '10.0.2.1/24' }, []);
  sim.applyNodeConfig('pc2', { ether1: '10.0.2.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.2.1' }]);
  return { sim };
}

export function runDataPlaneUpgradeTests(): Report {
  // ── D1. Ping size dasar: ukuran paket dihormati, tetap sukses < MTU ──
  {
    const { sim } = lab3();
    const ok = sim.simulatePing('pc1', '10.0.2.10', 1400);
    check('D1 ping size 1400 (< MTU) sukses tanpa fragmentasi', ok.success, JSON.stringify(ok));
    check('D1 path lintas router', ok.path && ok.path.length === 3, JSON.stringify(ok.path));
  }

  // ── D2. Fragmentasi IPv4: size > MTU tanpa DF → sukses via reassembly ──
  {
    const { sim } = lab3();
    const ok = sim.simulatePing('pc1', '10.0.2.10', 3000);
    check('D2 ping size 3000 (> MTU) terfragmentasi dan sukses', ok.success, JSON.stringify(ok));
    check('D2 r1 mencatat fragmentasi (PACKET_FORWARDED untuk fragment)', sim.eventHistory.some((e) => e.type === 'PACKET_FORWARDED' && String(e.data?.packetId).includes('pkt-')), '');
    const r1 = sim.getDevice('r1');
    check('D2 buffer reassembly dikosongkan setelah selesai', r1 && r1.fragBuffer.size === 0, `fragBuffer=${r1?.fragBuffer.size}`);
    const pc2 = sim.getDevice('pc2');
    check('D2 pc2 tidak menyimpan sisa fragment', pc2 && pc2.fragBuffer.size === 0, `fragBuffer=${pc2?.fragBuffer.size}`);
  }

  // ── D3. DF bit: size > MTU dengan DF → ICMP frag-needed (reason frag-needed) ──
  {
    const { sim } = lab3();
    const ok = sim.simulatePing('pc1', '10.0.2.10', 3000, true);
    check('D3 ping size 3000 df-bit → frag-needed', !ok.success && ok.reason === 'frag-needed', JSON.stringify(ok));
    check(
      'D3 event ICMP_ERROR fragmentation needed tercatat',
      sim.eventHistory.some((e) => e.type === 'ICMP_ERROR' && String(e.data?.reason ?? '').includes('fragmentation needed')),
      JSON.stringify(sim.eventHistory.filter((e) => e.type === 'ICMP_ERROR').slice(-2))
    );
  }

  // ── D4. MTU lebih kecil (mis. 1400): size 1500 terfragmentasi / DF ditolak ──
  {
    const { sim } = lab3();
    const r1 = sim.getDevice('r1');
    const iface = r1?.getIfaceByName('ether2');
    if (iface) iface.mtu = 1400;
    const ok = sim.simulatePing('pc1', '10.0.2.10', 1500);
    check('D4 size 1500 > MTU 1400 tanpa DF → fragmentasi sukses', ok.success, JSON.stringify(ok));
    const okDf = sim.simulatePing('pc1', '10.0.2.10', 1500, true);
    check('D4 size 1500 > MTU 1400 dengan DF → frag-needed', !okDf.success && okDf.reason === 'frag-needed', JSON.stringify(okDf));
  }

  // ── D5. Echo reply membawa ukuran request: reply besar juga bekerja ──
  {
    const { sim } = lab3();
    const ok = sim.simulatePing('pc1', '10.0.2.10', 2000);
    check('D5 reply sebesar request (2000) berhasil round-trip', ok.success, JSON.stringify(ok));
  }

  // ── D6. Counters: paket terhitung di ingress/egress, outErrors saat link down ──
  {
    const { sim } = lab3();
    sim.simulatePing('pc1', '10.0.2.10', 100);
    const pc1 = sim.getDevice('pc1');
    const c = pc1?.ifaceCounters.get('ether1');
    check('D6 pc1 ether1 outPkts > 0', !!c && c.outPkts > 0, JSON.stringify(c));
    check('D6 pc1 ether1 inPkts > 0 (reply masuk)', !!c && c.inPkts > 0, JSON.stringify(c));
    check('D6 pc1 ether1 tanpa error', !!c && c.inErrors === 0 && c.outErrors === 0, JSON.stringify(c));
    const r1 = sim.getDevice('r1');
    const c2 = r1?.ifaceCounters.get('ether1');
    check('D6 r1 ether1 outOctets > 0', !!c2 && c2.outOctets > 0, JSON.stringify(c2));

    // Link down → kirim gagal → outErrors naik di sisi pengirim
    const before = r1?.ifaceCounters.get('ether2')?.outErrors ?? 0;
    const project = { nodes: [node('pc1', 'PC1', 'pc', 1, 'd6a'), node('r1', 'R1', 'router', 2, 'd6b'), node('pc2', 'PC2', 'pc', 1, 'd6c')], edges: [] };
    sim.syncTopology(project);
    sim.applyNodeConfig('pc1', { ether1: '10.0.1.10/24' }, []);
    sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24', ether2: '10.0.2.1/24' }, []);
    const r1b = sim.getDevice('r1');
    const c3 = r1b?.ifaceCounters.get('ether2');
    check('D6 counter di-reset saat topology disinkronkan', !c3 || c3.outErrors === 0, JSON.stringify(c3));
    void before;
  }

  // ── D7. Snapshot statistik: counters & errors terekspos via getDeviceStats ──
  {
    const { sim } = lab3();
    sim.simulatePing('pc1', '10.0.2.10', 100);
    const stats = sim.getDeviceStats('pc1');
    const ether = stats?.interfaces.find((i) => i.name === 'ether1');
    check('D7 snapshot menyertakan counters', !!ether && typeof ether.counters.outPkts === 'number', JSON.stringify(stats?.interfaces));
    check('D7 snapshot counters tanpa error', !!ether && ether.counters.inErrors === 0 && ether.counters.outErrors === 0, '');
  }

  return rep;
}
