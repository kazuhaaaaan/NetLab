// ============================================================
// Demo end-to-end: Simulation Engine (net) + AI Mentor.
// Jalankan: .\node_modules\.bin\tsx.cmd scripts\ai-demo.mts
// ============================================================

import { NetworkSimulator } from '../src/engine/net/core/NetworkSimulator';
import type { LabProjectLike } from '../src/engine/net/core/Topology';
import type { PingSimResult } from '../src/engine/net/compat';
import { MentorEngine, renderDiagnosis, renderResponse } from '../src/modules/ai';

function buildProject(): LabProjectLike {
  const ports = (n: number, macSeed: string) => Array.from({ length: n }, (_, i) => ({ id: `port${i + 1}`, name: `ether${i + 1}`, status: 'up', macAddress: `00:0c:29:${macSeed}:${(i + 1).toString().padStart(2, '0')}:01` }));
  const node = (id: string, name: string, deviceType: string, portCount: number, macSeed: string) => ({
    id, name, vendor: deviceType === 'pc' ? 'linux' : 'mikrotik', model: deviceType, deviceType, ports: ports(portCount, macSeed),
  });
  const edge = (id: string, a: string, ap: string, b: string, bp: string) => ({ id, sourceNodeId: a, sourcePortId: ap, targetNodeId: b, targetPortId: bp, cableType: 'copper_straight' });

  return {
    nodes: [
      node('pc1', 'PC1', 'pc', 1, '01'),
      node('sw1', 'SW1', 'switch', 4, '02'),
      node('r1', 'R1', 'router', 3, '03'),
      node('r2', 'R2', 'router', 3, '04'),
      node('sw2', 'SW2', 'switch', 4, '05'),
      node('pc2', 'PC2', 'pc', 1, '06'),
      node('pc3', 'PC3', 'pc', 1, '07'),
    ],
    edges: [
      edge('l1', 'pc1', 'port1', 'sw1', 'port1'),
      edge('l2', 'sw1', 'port2', 'r1', 'port1'),
      edge('l3', 'r1', 'port2', 'r2', 'port1'),
      edge('l4', 'r2', 'port2', 'sw2', 'port1'),
      edge('l5', 'sw2', 'port2', 'pc2', 'port1'),
      edge('l6', 'sw1', 'port3', 'pc3', 'port1'),
    ],
  };
}

function configSim(sim: NetworkSimulator): void {
  sim.syncTopology(buildProject());
  sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24', ether2: '192.168.1.1/30' }, [{ dst: '0.0.0.0/0', gateway: '192.168.1.2' }]);
  // R2 sengaja TIDAK punya rute balik ke 10.0.1.0/24 dan tidak ada default route.
  sim.applyNodeConfig('r2', { ether1: '192.168.1.2/30', ether2: '20.0.2.1/24' }, []);
  sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
  sim.applyNodeConfig('pc2', { ether1: '20.0.2.2/24' }, [{ dst: '0.0.0.0/0', gateway: '20.0.2.1' }]);
  // DHCP pool pada R1 untuk segmen 10.0.1.0/24 (PC3 akan meminta IP).
  sim.setDhcpPools({ r1: [{ name: 'dhcp_pool', range: '10.0.1.50-10.0.1.100', network: '10.0.1.0/24', iface: 'ether1', gateway: '10.0.1.1' }] });
}

function sep(label: string): void {
  console.log(`\n${'═'.repeat(60)}\n${label}\n${'═'.repeat(60)}`);
}

function main(): void {
  const sim = new NetworkSimulator();
  configSim(sim);
  const mentor = new MentorEngine(sim);

  // 1) State yang direkam AI (harus berisi device + rute yang salah).
  sep('NETWORK STATE (via NetworkStateReader)');
  console.log(mentor.context());

  // 2) Probe ping langsung (engine) — PC1 → PC2.
  sep('PROBE ENGINE: ping PC1 → 20.0.2.2');
  const ping: PingSimResult = sim.simulatePing('pc1', '20.0.2.2');
  console.log(`success=${ping.success} reason=${ping.reason ?? '-'}`);
  console.log('path:', ping.path.join(' → '));

  // 3) Diagnosis penuh (semua analyzer + probe).
  sep('DIAGNOSIS (diagnose)');
  const diag = mentor.diagnose({ probes: [{ from: 'pc1', to: '20.0.2.2' }] });
  console.log(renderDiagnosis(diag));

  // 4) ask() — bahasa bebas.
  sep('ASK: "kenapa ping dari PC1 ke PC2 gagal"');
  const ans = mentor.ask('kenapa ping dari PC1 ke PC2 gagal');
  console.log(renderResponse(ans));

  // 5) Hint bertahap (sedikit demi sedikit, berbasis state).
  sep('HINT: routing (langkah 1-2)');
  console.log(renderResponse(mentor.hint('routing')));
  console.log(renderResponse(mentor.hint('routing')));

  // 6) Belajar (bimbingan tanpa jawaban).
  sep('LEARN: routing');
  console.log(renderResponse(mentor.learn('routing')));

  // 7) Fix command.
  sep('FIX: default-route (mikrotik)');
  console.log(renderResponse(mentor.fix('default-route', 'mikrotik')));

  // 8) Smart CLI (Did you mean).
  sep('SMART CLI: "/ip route prit"');
  console.log(renderResponse(mentor.smartCli('/ip route prit')));

  // 9) DHCP — PC3 tanpa IP minta lease lewat ping (engine grant otomatis).
  sep('DHCP: PC3 (tanpa IP) → request via ping ke 10.0.1.1');
  const p3 = sim.simulatePing('pc3', '10.0.1.1');
  console.log(`success=${p3.success} reason=${p3.reason ?? '-'} dhcpGranted=${p3.dhcpGranted ?? false}`);
  console.log('leases:', JSON.stringify(sim.getLeases()));
  console.log('PC3 dhcpClientState:', sim.getDevice('pc3')?.dhcpClient?.state);

  // 10) Ringkasan akhir (AI melihat DHCP sehat, routing masih bermasalah).
  sep('SUMMARY setelah DHCP');
  console.log(renderResponse(mentor.summary()));

  console.log('\nDEMO SELESAI ✓');
}

main();
