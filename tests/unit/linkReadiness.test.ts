/**
 * LINK READINESS TEST SUITE — evaluator "config kedua ujung cocok ⇒ terhubung".
 *
 * Menguji src/engine/net/core/LinkReadiness (NetworkSimulator.getLinkReadiness)
 * dan planner auto-fix (src/utils/linkAutoFix.planLinkAutoFix).
 *
 * Bagian dari run_all_tests.mts — murni, tanpa DOM.
 */
import { NetworkSimulator } from '../../src/engine/net/core/NetworkSimulator';
import type { LabProjectLike } from '../../src/engine/net/core/Topology';
import { VendorDispatcher } from '../../packages/vendors/src/index';
import { planLinkAutoFix } from '../../src/utils/linkAutoFix';
import { ipCommand, accessVlanCommand } from '../../src/modules/ai/agent/configTools';

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

function eNode(id: string, name: string, deviceType: string, portCount: number, macSeed: string, vendor?: string) {
  return {
    id,
    name,
    vendor: vendor || (deviceType === 'pc' || deviceType === 'server' ? 'linux' : 'cisco_ios'),
    model: deviceType,
    deviceType,
    ports: Array.from({ length: portCount }, (_, i) => ({
      id: `port${i + 1}`,
      name: `ether${i + 1}`,
      status: 'up',
      macAddress: `02:0c:29:${macSeed}:${(i + 1).toString().padStart(2, '0')}:01`,
    })),
  };
}

function eEdge(id: string, a: string, ap: string, b: string, bp: string) {
  return { id, sourceNodeId: a, sourcePortId: ap, targetNodeId: b, targetPortId: bp, cableType: 'copper_straight' };
}

function routerPair(): { sim: NetworkSimulator; project: LabProjectLike } {
  const project: LabProjectLike = {
    nodes: [eNode('r1', 'R1', 'router', 2, '01'), eNode('r2', 'R2', 'router', 2, '02')],
    edges: [eEdge('e1', 'r1', 'port1', 'r2', 'port1')],
  };
  const sim = new NetworkSimulator();
  sim.syncTopology(project);
  return { sim, project };
}

export function runLinkReadinessTests(): Report {
  console.log('\n== L1. Readiness: subnet cocok ⇒ connected ==');
  {
    const { sim } = routerPair();
    sim.replaceNodeIps('r1', { ether1: '10.0.0.1/24' }, []);
    sim.replaceNodeIps('r2', { ether1: '10.0.0.2/24' }, []);
    const r = sim.getLinkReadiness('e1');
    check('L1.1 subnet sama → ipConnected', r.ipConnected === true, `got ${r.ipConnected}`);
    check('L1.2 status connected', r.status === 'connected', `status=${r.status} label=${r.label}`);
    check('L1.3 label memuat up', r.label.startsWith('up'), r.label);
  }

  console.log('\n== L2. Readiness: subnet beda ⇒ degraded + blocker ==');
  {
    const { sim } = routerPair();
    sim.replaceNodeIps('r1', { ether1: '10.0.0.1/24' }, []);
    sim.replaceNodeIps('r2', { ether1: '10.0.1.2/24' }, []);
    const r = sim.getLinkReadiness('e1');
    check('L2.1 ipConnected false', r.ipConnected === false);
    check('L2.2 status degraded', r.status === 'degraded', `status=${r.status}`);
    check('L2.3 blocker beda subnet', r.blockers.some((b) => /beda subnet/i.test(b)), r.blockers.join('|'));
    const l3 = r.checks.find((c) => c.id === 'l3-subnet');
    check('L2.4 check l3 fail', l3?.status === 'fail', `l3=${l3?.status}`);
  }

  console.log('\n== L3. Readiness: belum ada IP ⇒ warn ==');
  {
    const { sim } = routerPair();
    const r = sim.getLinkReadiness('e1');
    check('L3.1 bukan connected', r.status !== 'connected', r.status);
    const l3 = r.checks.find((c) => c.id === 'l3-subnet');
    check('L3.2 l3 warn/na', l3?.status === 'warn' || l3?.status === 'na', `l3=${l3?.status}`);
  }

  console.log('\n== L4. Readiness: interface shutdown ⇒ down ==');
  {
    const { sim } = routerPair();
    sim.replaceNodeIps('r1', { ether1: '10.0.0.1/24' }, []);
    sim.replaceNodeIps('r2', { ether1: '10.0.0.2/24' }, []);
    sim.setShutdownIfaces('r2', ['ether1']);
    const r = sim.getLinkReadiness('e1');
    check('L4.1 status down', r.status === 'down', `status=${r.status}`);
    const admin = r.checks.find((c) => c.id === 'admin');
    check('L4.2 check admin fail', admin?.status === 'fail', `admin=${admin?.status}`);
  }

  console.log('\n== L5. Readiness: kabel down ⇒ down ==');
  {
    const project: LabProjectLike = {
      nodes: [eNode('r1', 'R1', 'router', 2, '01'), eNode('r2', 'R2', 'router', 2, '02')],
      edges: [{ ...eEdge('e1', 'r1', 'port1', 'r2', 'port1'), down: true }],
    };
    const sim = new NetworkSimulator();
    sim.syncTopology(project);
    sim.replaceNodeIps('r1', { ether1: '10.0.0.1/24' }, []);
    sim.replaceNodeIps('r2', { ether1: '10.0.0.2/24' }, []);
    const r = sim.getLinkReadiness('e1');
    check('L5.1 status down', r.status === 'down', `status=${r.status}`);
    const cable = r.checks.find((c) => c.id === 'cable');
    check('L5.2 check cable fail', cable?.status === 'fail', `cable=${cable?.status}`);
  }

  console.log('\n== L6. Readiness: OSPF area beda ⇒ degraded ==');
  {
    const { sim } = routerPair();
    sim.replaceNodeIps('r1', { ether1: '10.0.0.1/24' }, []);
    sim.replaceNodeIps('r2', { ether1: '10.0.0.2/24' }, []);
    sim.setRouting('r1', { ospf: { enabled: true, networks: ['10.0.0.0/24'], areas: { '10.0.0.0/24': 0 } } });
    sim.setRouting('r2', { ospf: { enabled: true, networks: ['10.0.0.0/24'], areas: { '10.0.0.0/24': 1 } } });
    const r = sim.getLinkReadiness('e1');
    const ospf = r.checks.find((c) => c.id === 'ospf');
    check('L6.1 ospf fail', ospf?.status === 'fail', `ospf=${ospf?.status}`);
    check('L6.2 blocker area', r.blockers.some((b) => /area/i.test(b)), r.blockers.join('|'));
    check('L6.3 status degraded', r.status === 'degraded', r.status);
  }

  console.log('\n== L7. Readiness: OSPF area sama ⇒ ok ==');
  {
    const { sim } = routerPair();
    sim.replaceNodeIps('r1', { ether1: '10.0.0.1/24' }, []);
    sim.replaceNodeIps('r2', { ether1: '10.0.0.2/24' }, []);
    sim.setRouting('r1', { ospf: { enabled: true, networks: ['10.0.0.0/24'], areas: { '10.0.0.0/24': 0 } } });
    sim.setRouting('r2', { ospf: { enabled: true, networks: ['10.0.0.0/24'], areas: { '10.0.0.0/24': 0 } } });
    const r = sim.getLinkReadiness('e1');
    const ospf = r.checks.find((c) => c.id === 'ospf');
    check('L7.1 ospf ok', ospf?.status === 'ok', `ospf=${ospf?.status}`);
    check('L7.2 status connected', r.status === 'connected', r.status);
  }

  console.log('\n== L8. Readiness: OSPF hanya satu sisi ⇒ fail ==');
  {
    const { sim } = routerPair();
    sim.replaceNodeIps('r1', { ether1: '10.0.0.1/24' }, []);
    sim.replaceNodeIps('r2', { ether1: '10.0.0.2/24' }, []);
    sim.setRouting('r1', { ospf: { enabled: true, networks: ['10.0.0.0/24'] } });
    const r = sim.getLinkReadiness('e1');
    const ospf = r.checks.find((c) => c.id === 'ospf');
    check('L8.1 ospf fail satu sisi', ospf?.status === 'fail', `ospf=${ospf?.status}`);
  }

  console.log('\n== L9. Readiness: BGP remote-as beda ⇒ degraded ==');
  {
    const { sim } = routerPair();
    sim.replaceNodeIps('r1', { ether1: '10.0.0.1/24' }, []);
    sim.replaceNodeIps('r2', { ether1: '10.0.0.2/24' }, []);
    sim.setBgp('r1', { asn: 65001, networks: [], peers: [{ remoteAs: 999, remoteAddr: '10.0.0.2' }] });
    sim.setBgp('r2', { asn: 65002, networks: [], peers: [{ remoteAs: 65001, remoteAddr: '10.0.0.1' }] });
    const r = sim.getLinkReadiness('e1');
    const bgp = r.checks.find((c) => c.id === 'bgp');
    check('L9.1 bgp fail', bgp?.status === 'fail', `bgp=${bgp?.status}`);
    check('L9.2 blocker bgp', r.blockers.some((b) => /bgp|remote-as/i.test(b)), r.blockers.join('|'));
  }

  console.log('\n== L10. Readiness: BGP remote-as cocok ⇒ ok ==');
  {
    const { sim } = routerPair();
    sim.replaceNodeIps('r1', { ether1: '10.0.0.1/24' }, []);
    sim.replaceNodeIps('r2', { ether1: '10.0.0.2/24' }, []);
    sim.setBgp('r1', { asn: 65001, networks: [], peers: [{ remoteAs: 65002, remoteAddr: '10.0.0.2' }] });
    sim.setBgp('r2', { asn: 65002, networks: [], peers: [{ remoteAs: 65001, remoteAddr: '10.0.0.1' }] });
    const r = sim.getLinkReadiness('e1');
    const bgp = r.checks.find((c) => c.id === 'bgp');
    check('L10.1 bgp ok', bgp?.status === 'ok', `bgp=${bgp?.status}`);
    check('L10.2 status connected', r.status === 'connected', r.status);
  }

  console.log('\n== L11. Readiness: VLAN access beda (switch) ⇒ fail ==');
  {
    const project: LabProjectLike = {
      nodes: [eNode('sw1', 'SW1', 'switch', 2, '01'), eNode('sw2', 'SW2', 'switch', 2, '02')],
      edges: [eEdge('e1', 'sw1', 'port1', 'sw2', 'port1')],
    };
    const sim = new NetworkSimulator();
    sim.syncTopology(project);
    sim.setPortVlans('sw1', { ether1: 10 });
    sim.setPortVlans('sw2', { ether1: 20 });
    const r = sim.getLinkReadiness('e1');
    const l2 = r.checks.find((c) => c.id === 'l2-vlan');
    check('L11.1 l2 fail', l2?.status === 'fail', `l2=${l2?.status} ${l2?.summary}`);
  }

  console.log('\n== L12. Auto-fix: subnet beda ⇒ plan menyelaraskan IP ==');
  {
    const { sim } = routerPair();
    const dis = new VendorDispatcher();
    sim.replaceNodeIps('r1', { ether1: '10.0.0.1/24' }, []);
    sim.replaceNodeIps('r2', { ether1: '10.0.1.2/24' }, []);
    const plan = planLinkAutoFix(sim, dis, 'e1');
    check('L12.1 tidak connected', plan.alreadyConnected === false);
    check('L12.2 ada fix IP', plan.fixes.length > 0, JSON.stringify(plan.fixes));
    check('L12.3 setidaknya satu ujung diselaraskan', plan.fixes.some((f) => f.commands.length > 0));
  }

  console.log('\n== L13. Auto-fix: sudah connected ⇒ tidak ada fix ==');
  {
    const { sim } = routerPair();
    const dis = new VendorDispatcher();
    sim.replaceNodeIps('r1', { ether1: '10.0.0.1/24' }, []);
    sim.replaceNodeIps('r2', { ether1: '10.0.0.2/24' }, []);
    const plan = planLinkAutoFix(sim, dis, 'e1');
    check('L13.1 alreadyConnected', plan.alreadyConnected === true);
    check('L13.2 fixes kosong', plan.fixes.length === 0);
  }

  console.log('\n== L14. Generator: syntax per vendor tidak kosong/valid ==');
  {
    const c = ipCommand('cisco_ios', 'GigabitEthernet0/1', '10.0.0.1/24', false);
    check('L14.1 cisco ip address', c.some((l) => /^ip address 10\.0\.0\.1 255\.255\.255\.0$/.test(l)), c.join('|'));
    const h = ipCommand('huawei', 'GigabitEthernet0/0/1', '10.0.0.1/24', false);
    check('L14.2 huawei ip address', h.some((l) => /^ip address 10\.0\.0\.1 255\.255\.255\.0$/.test(l)), h.join('|'));
    const av = accessVlanCommand('cisco_ios', 'GigabitEthernet0/1', 10);
    check('L14.3 cisco access vlan', av.includes('switchport access vlan 10'), av.join('|'));
    const hv = accessVlanCommand('huawei', 'GigabitEthernet0/0/1', 10);
    check('L14.4 huawei access vlan', hv.includes('port default vlan 10'), hv.join('|'));
    const none = accessVlanCommand('mikrotik', 'ether1', 10);
    check('L14.5 mikrotik access VLAN = [] (jujur tanpa syntax)', none.length === 0, none.join('|'));
  }

  console.log('\n== L15. evaluateAllLinkReadiness mencakup semua edge ==');
  {
    const { sim } = routerPair();
    sim.replaceNodeIps('r1', { ether1: '10.0.0.1/24' }, []);
    sim.replaceNodeIps('r2', { ether1: '10.0.0.2/24' }, []);
    const map = sim.getAllLinkReadiness();
    check('L15.1 memuat e1', map.has('e1'));
    check('L15.2 e1 connected', map.get('e1')?.status === 'connected');
  }

  return rep;
}
