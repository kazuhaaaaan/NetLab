/**
 * AI Network Agent + Shared Verification Engine — uji unit.
 * Bagian dari run_all_tests.mts (murni, tanpa DOM).
 *
 * Yang diuji:
 *   - Shared Verification Engine: parity verify_ping == simulatePing,
 *     coverage verifier, riwayat verifikasi.
 *   - Tool registry: validasi typed (tolak param tak dikenal), permission
 *     gate (read_only memblokir mutasi).
 *   - AgentEngine: plan → execute → verify; rollback saat action gagal;
 *     lab generation OSPF end-to-end (topologi + CLI + grading nyata).
 *   - Diagnostik: root cause + perbaikan terstruktur.
 *   - CLI AI == jalur vendor yang sama dengan terminal manusia.
 */
import { NetworkSimulator } from '../../src/engine/net/core/NetworkSimulator';
import { VendorDispatcher } from '../../packages/vendors/src/index';
import { AgentEngine } from '../../src/modules/ai/agent/AgentEngine';
import { createHeadlessRuntime } from '../../src/modules/ai/agent/runtime';
import { VerificationEngine } from '../../src/modules/ai/agent/verification';
import { buildRegistry, registryMap, permissionOk } from '../../src/modules/ai/agent/registry';
import { buildLabFromTemplate, LAB_TEMPLATES } from '../../src/modules/ai/agent/labGenerator';
import { diagnoseConnectivity } from '../../src/modules/ai/agent/diagnostics';
import { validate } from '../../src/modules/ai/agent/schemas';
import type { LabProject, LabNode } from '../../src/types';

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

function baseProject(): LabProject {
  return {
    version: '1.0',
    metadata: { name: 'ai-test', author: 'test', description: '', createdAt: '', updatedAt: '' },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [],
    edges: [],
  };
}

function makeRuntime() {
  const sim = new NetworkSimulator();
  const dispatcher = new VendorDispatcher();
  const runtime = createHeadlessRuntime(sim, dispatcher);
  runtime.applyProject(baseProject());
  return { sim, dispatcher, runtime };
}

export function runAiAgentTests(): Report {
  // ── S1. Shared Verification Engine: parity dengan Ping Tools ──────────
  console.log('\n== S1. Shared Verification Engine (parity) ==');
  {
    const { sim, runtime } = makeRuntime();
    const v = new VerificationEngine(sim);
    const project = runtime.getProject() as LabProject;
    runtime.applyProject({
      ...project,
      nodes: [
        { id: 'r1', name: 'R1', vendor: 'mikrotik', model: 'hEX (RB750Gr3)', deviceType: 'router', position: { x: 0, y: 0 }, powered: true, ports: [
          { id: 'ether1', name: 'ether1', speedMbps: 1000, status: 'up', macAddress: '00:00:00:00:00:01', type: 'copper' },
          { id: 'ether2', name: 'ether2', speedMbps: 1000, status: 'up', macAddress: '00:00:00:00:00:02', type: 'copper' },
        ] },
        { id: 'pc1', name: 'PC1', vendor: 'linux', model: 'Debian 12 (Bookworm)', deviceType: 'pc', position: { x: 0, y: 0 }, powered: true, ports: [
          { id: 'eth0', name: 'eth0', speedMbps: 1000, status: 'up', macAddress: '00:00:00:00:00:03', type: 'copper' },
        ] },
      ],
      edges: [
        { id: 'e1', sourceNodeId: 'r1', sourcePortId: 'ether1', targetNodeId: 'pc1', targetPortId: 'eth0', cableType: 'copper_straight' },
      ],
    });
    sim.applyNodeConfig('r1', { ether1: '10.0.0.1/24' }, []);
    sim.applyNodeConfig('pc1', { eth0: '10.0.0.2/24' }, []);

    // Parity: hasil verifyPing HARUS identik dengan simulatePing (shared path)
    const vr = v.verifyPing({ source: 'pc1', destination: '10.0.0.1', actionId: 'a1', label: 'parity' });
    const raw = sim.simulatePing('pc1', '10.0.0.1');
    check('S1.1 verifyPing.success == simulatePing.success', vr.success === raw.success, `vr=${vr.success} raw=${raw.success}`);
    check('S1.2 verifyPing.hops == path', JSON.stringify(vr.hops) === JSON.stringify(raw.path), JSON.stringify(vr.hops));

    const failVr = v.verifyPing({ source: 'pc1', destination: '10.99.99.99', actionId: 'a2' });
    const failRaw = sim.simulatePing('pc1', '10.99.99.99');
    check('S1.3 gagal: reason sama', failVr.reason === failRaw.reason, `vr=${failVr.reason} raw=${failRaw.reason}`);

    // Coverage verifier
    check('S1.4 verifyRoute', v.verifyRoute({ source: 'pc1', dst: '10.0.0.0/24' }).success);
    check('S1.5 verifyArp', v.verifyArp({ source: 'pc1', destination: '10.0.0.1' }).success);
    check('S1.6 verifyInterface', v.verifyInterface({ source: 'pc1', iface: 'eth0' }).success);
    check('S1.7 verifyLink', v.verifyLink('r1', 'pc1').success);
    check('S1.8 verifyDeviceExists', v.verifyDeviceExists('r1').success);
    const tcp = v.verifyTcp({ source: 'pc1', destination: '10.0.0.1', port: 80 });
    check('S1.9 verifyTcp (port kosong → refused)', tcp.success === false, JSON.stringify(tcp));

    // Riwayat verifikasi tercatat (Configuration → Verification → Fix → Verify)
    const hist = v.all();
    check('S1.10 riwayat verifikasi tercatat', hist.length >= 8, `len=${hist.length}`);
    check('S1.11 riwayat punya label', hist.some((h) => h.label === 'parity'));
    const a2 = hist.filter((h) => h.actionId === 'a2');
    check('S1.12 clearForAction membersihkan per action', (() => { v.clearForAction('a2'); return v.all().filter((h) => h.actionId === 'a2').length === 0; })());
    check('S1.13 action lain tetap tersimpan', v.all().some((h) => h.actionId === 'a1'), `len=${v.all().length}`);
  }

  // ── S2. Registry: validasi typed + permission gate ────────────────────
  console.log('\n== S2. Registry (validasi + permission) ==');
  {
    const tools = buildRegistry();
    const map = registryMap(tools);
    check('S2.1 registry non-empty', tools.length >= 45, `count=${tools.length}`);
    for (const t of tools) {
      check(`S2.2 ${t.name} punya deskripsi`, t.description.length > 0 && t.params !== undefined);
    }
    check('S2.3 read tool permission=read_only', map.get('get_topology')?.permission === 'read_only');
    check('S2.4 mutasi permission=execute', map.get('create_device')?.permission === 'execute' && map.get('create_device')?.mutating === true);
    check('S2.5 execute_cli mutating', map.get('execute_cli')?.mutating === true);
    check('S2.6 verify_ping tidak mutating', map.get('verify_ping')?.mutating === false);

    // permissionOk
    check('S2.7 read tool OK di read_only', permissionOk(map.get('get_topology')!, 'read_only'));
    check('S2.8 mutasi DITOLAK di read_only', !permissionOk(map.get('create_device')!, 'read_only'));
    check('S2.9 mutasi OK di execute', permissionOk(map.get('create_device')!, 'execute'));

    // Validasi typed: schema
    const spec = { deviceId: { optional: false, check: (v: unknown, k: string) => (typeof v === 'string' ? v : null), label: 'id' } };
    const good = validate({ deviceId: 'r1' }, spec);
    check('S2.10 param valid', good.ok === true && good.params.deviceId === 'r1');
    const badType = validate({ deviceId: 42 }, spec);
    check('S2.11 tipe salah ditolak', badType.ok === false);
    const unknown = validate({ deviceId: 'r1', hack: 'x' }, spec);
    check('S2.12 param tak dikenal ditolak', unknown.ok === false && unknown.errors.some((e) => e.includes('hack')));
    const missing = validate({}, spec);
    check('S2.13 param wajib hilang ditolak', missing.ok === false);
  }

  // ── S3. AgentEngine: permission gate (read_only memblokir mutasi) ─────
  console.log('\n== S3. AgentEngine permission ==');
  {
    const { sim, runtime } = makeRuntime();
    const agent = new AgentEngine({ runtime, mode: 'read_only' });
    const denied = agent.callTool('create_device', { type: 'router', vendor: 'mikrotik', name: 'R1' }, { goal: 'test' });
    check('S3.1 create_device diblokir read_only', denied.ok === false && denied.error === 'permission-denied', JSON.stringify(denied));
    const read = agent.callTool('get_topology', {}, { goal: 'test' });
    check('S3.2 read tool tetap jalan', read.ok === true, JSON.stringify(read));
    const unknownTool = agent.callTool('nope', {}, { goal: 'test' });
    check('S3.3 tool tak dikenal ditolak', unknownTool.ok === false && unknownTool.error === 'unknown-tool');

    agent.setPermissionMode('execute');
    const ok = agent.callTool('create_device', { type: 'router', vendor: 'mikrotik', name: 'R1', position: { x: 10, y: 10 }, seed: 'r1' }, { goal: 'test' });
    check('S3.4 create_device jalan di execute', ok.ok === true, JSON.stringify(ok));
  }

  // ── S4. AgentEngine: lab OSPF end-to-end ──────────────────────────────
  console.log('\n== S4. Lab OSPF end-to-end ==');
  {
    const { sim, runtime, dispatcher } = makeRuntime();
    const agent = new AgentEngine({ runtime, mode: 'execute' });

    const plan = agent.plan('buat lab ospf 3 router', 'execute');
    check('S4.1 intent lab terdeteksi', plan.ok && plan.intent === 'lab_generation', JSON.stringify(plan));
    check('S4.2 plan punya action', !!plan.plan && plan.plan.actions.length > 0, `actions=${plan.plan?.actions.length}`);

    const out = agent.executePlan(plan.plan!);
    check('S4.3 lab dieksekusi sukses', out.ok === true, JSON.stringify(out.message ?? out.results.map((r) => r.message).join('|')));
    check('S4.4 semua action sukses', out.results.every((r) => r.ok), JSON.stringify(out.results.filter((r) => !r.ok)));

    const project = runtime.getProject() as LabProject;
    check('S4.5 3 router dibuat', project.nodes.filter((n) => n.deviceType === 'router').length === 3, `nodes=${project.nodes.map((n) => n.name).join(',')}`);
    check('S4.6 3 kabel terpasang', project.edges.length === 3, `edges=${project.edges.length}`);

    // Tugas siswa: konfigurasi OSPF via agent (tool configure_ospf → jalur CLI)
    // Interkoneksi + loopback masing-masing router diiklankan ke OSPF area 0.
    const nets: Record<string, string[]> = {
      R1: ['10.0.1.0/30', '10.0.3.0/30', '1.1.1.1/32'],
      R2: ['10.0.1.0/30', '10.0.2.0/30', '2.2.2.2/32'],
      R3: ['10.0.2.0/30', '10.0.3.0/30', '3.3.3.3/32'],
    };
    for (const [name, list] of Object.entries(nets)) {
      for (const net of list) {
        const r = agent.callTool('configure_ospf', { deviceId: name, network: net, area: 0 }, { goal: 'lab ospf' });
        check(`S4.6b ospf ${name} ${net}`, r.ok === true, JSON.stringify(r));
      }
    }
    const idOf = (name: string) => project.nodes.find((n) => n.name === name)?.id ?? name;

    // OSPF adjacency benar-benar terbentuk di engine (bukan klaim AI)
    const n1 = sim.getOspfNeighbors(idOf('R1'));
    check('S4.7 OSPF neighbor nyata (engine)', n1.length >= 2, JSON.stringify(n1));
    const full = n1.filter((x) => x.state === 'Full');
    check('S4.8 adjacency Full', full.length >= 2, JSON.stringify(full));

    // Ping lintas loopback via rute dinamik
    const ping = sim.simulatePing(idOf('R1'), '2.2.2.2');
    check('S4.9 ping loopback R2 via OSPF', ping.success, JSON.stringify(ping));
    check('S4.10 rute dinamik di R1', sim.getDeviceStats(idOf('R1'))?.routes.some((r) => r.dst === '2.2.2.2/32' && r.kind === 'dynamic'));

    // Grading berbasis state nyata
    const lab = buildLabFromTemplate('ospf-3-router', 'ospf-3-router');
    const grade = lab.grading(sim, project);
    check('S4.11 grading semua pass', grade.every((g) => g.pass), JSON.stringify(grade.filter((g) => !g.pass)));
    check('S4.12 grading berlabel', grade.every((g) => g.label.length > 0));

    // Template lain valid (bukan hanya OSPF)
    const ids = Object.keys(LAB_TEMPLATES);
    check('S4.13 semua template punya grading+setup', ids.every((id) => {
      const t = LAB_TEMPLATES[id as keyof typeof LAB_TEMPLATES];
      const fakeProject = { nodes: t.topology.devices.map((d) => ({ id: d.seed, name: d.name } as unknown as LabNode)) };
      return Object.keys(t.setupCommands).length > 0 && t.grading(sim, fakeProject as LabProject).length > 0 && t.tasks.length > 0;
}), ids.join(','));
  }

  // ── S5. Transaction: rollback saat action kedua gagal ─────────────────
  console.log('\n== S5. Transaction & rollback ==');
  {
    const { sim, runtime, dispatcher } = makeRuntime();
    const agent = new AgentEngine({ runtime, mode: 'execute' });

    // Action plan buatan: create R1 (valid) lalu create R1 lagi (duplicate) → rollback
    const plan = {
      id: 'plan-x',
      goal: 'uji rollback',
      mode: 'execute' as const,
      actions: [
        { id: 'x1', type: 'create_device' as const, target: 'R1', params: { type: 'router', vendor: 'mikrotik', name: 'R1', seed: 'r1x' }, reason: 'buat R1', expectedEffect: 'R1 tersedia di canvas', risk: 'low' as const, validation: 'ok' },
        { id: 'x2', type: 'create_device' as const, target: 'R1', params: { type: 'router', vendor: 'mikrotik', name: 'R1', seed: 'r1y' }, reason: 'buat R1 lagi (harus gagal)', expectedEffect: 'R1 tersedia di canvas', risk: 'low' as const, validation: 'ok' },
      ],
    };

    const out = agent.executePlan(plan);
    check('S5.1 plan gagal', out.ok === false, JSON.stringify(out.message));
    check('S5.2 rolledBack=true', out.rolledBack === true, String(out.rolledBack));
    const project = runtime.getProject() as LabProject;
    check('S5.3 R1 tidak tersisa (rollback proyek)', project.nodes.length === 0, `nodes=${project.nodes.length}`);
    check('S5.4 memori vendor dibersihkan', dispatcher.getNodeMemory('r1x').hostname === '');

    // CLI via AI: jalur vendor SAMA dengan terminal manusia
    const { runtime: rt2, sim: sim2 } = makeRuntime();
    const project2 = rt2.getProject() as LabProject;
    rt2.applyProject({
      ...project2,
      nodes: [
        { id: 'r1', name: 'R1', vendor: 'mikrotik', model: 'hEX (RB750Gr3)', deviceType: 'router', position: { x: 0, y: 0 }, powered: true, ports: [
          { id: 'ether1', name: 'ether1', speedMbps: 1000, status: 'up', macAddress: '00:00:00:00:00:01', type: 'copper' },
        ] },
        { id: 'pc1', name: 'PC1', vendor: 'linux', model: 'Debian 12 (Bookworm)', deviceType: 'pc', position: { x: 0, y: 0 }, powered: true, ports: [
          { id: 'eth0', name: 'eth0', speedMbps: 1000, status: 'up', macAddress: '00:00:00:00:00:02', type: 'copper' },
        ] },
      ],
      edges: [{ id: 'e1', sourceNodeId: 'r1', sourcePortId: 'ether1', targetNodeId: 'pc1', targetPortId: 'eth0', cableType: 'copper_straight' }],
    });
    const agent2 = new AgentEngine({ runtime: rt2, mode: 'execute' });
    const cli = agent2.callTool('execute_cli', { deviceId: 'R1', command: '/ip address add address=10.0.0.1/24 interface=ether1' }, { goal: 'test' });
    check('S5.5 execute_cli berhasil via dispatcher', cli.ok === true, JSON.stringify(cli));
    const ipAfter = sim2.getDeviceStats('r1')?.interfaces.find((i) => i.name === 'ether1');
    check('S5.6 IP benar-benar aktif di engine', ipAfter?.ip === '10.0.0.1/24', JSON.stringify(ipAfter));
  }

  // ── S6. Diagnostik: root cause + perbaikan terstruktur ────────────────
  console.log('\n== S6. Diagnostik ==');
  {
    const { sim, runtime } = makeRuntime();
    const project = runtime.getProject() as LabProject;
    runtime.applyProject({
      ...project,
      nodes: [
        { id: 'r1', name: 'R1', vendor: 'mikrotik', model: 'hEX (RB750Gr3)', deviceType: 'router', position: { x: 0, y: 0 }, powered: true, ports: [
          { id: 'ether1', name: 'ether1', speedMbps: 1000, status: 'up', macAddress: '00:00:00:00:00:01', type: 'copper' },
        ] },
        { id: 'pc1', name: 'PC1', vendor: 'linux', model: 'Debian 12 (Bookworm)', deviceType: 'pc', position: { x: 0, y: 0 }, powered: true, ports: [
          { id: 'eth0', name: 'eth0', speedMbps: 1000, status: 'up', macAddress: '00:00:00:00:00:02', type: 'copper' },
        ] },
      ],
      edges: [{ id: 'e1', sourceNodeId: 'r1', sourcePortId: 'ether1', targetNodeId: 'pc1', targetPortId: 'eth0', cableType: 'copper_straight' }],
    });
    // PC1 tanpa IP → no-ip
    sim.applyNodeConfig('r1', { ether1: '10.0.0.1/24' }, []);
    sim.applyNodeConfig('pc1', {}, []);

    const v = new VerificationEngine(sim);
    const diag = diagnoseConnectivity(sim, v, { source: 'pc1', destination: '10.0.0.1' });
    check('S6.1 diagnosa menemukan masalah', diag.ok === false && diag.rootCause !== null, JSON.stringify(diag));
    check('S6.2 root cause no-ip', diag.rootCause?.includes('no-ip') ?? diag.rootCause?.includes('IP'), diag.rootCause ?? '');
    check('S6.3 rekomendasi perbaikan ada', diag.recommendedFixes.length > 0, `fixes=${diag.recommendedFixes.length}`);
    check('S6.4 perbaikan terstruktur (PlanAction)', diag.recommendedFixes[0].type === 'configure_ip_address', diag.recommendedFixes[0].type);
    check('S6.5 bukti berjenjang', diag.evidence.some((e) => e.step === 'ping') && diag.evidence.some((e) => e.step === 'arp/ndp'));

    // Diagnosa sehat
    sim.applyNodeConfig('pc1', { eth0: '10.0.0.2/24' }, []);
    const healthy = diagnoseConnectivity(sim, v, { source: 'pc1', destination: '10.0.0.1' });
    check('S6.6 diagnosa sehat setelah perbaikan', healthy.ok === true && healthy.rootCause === null, JSON.stringify(healthy));
  }

  // ── S7. AgentEngine.handle: plan di mode propose tidak mengeksekusi ───
  console.log('\n== S7. handle() mode propose ==');
  {
    const { runtime } = makeRuntime();
    const agent = new AgentEngine({ runtime, mode: 'propose' });
    const out = agent.handle('buat lab dhcp server');
    check('S7.1 plan dibuat', out.ok === true && out.intent === 'lab_generation');
    check('S7.2 tidak dieksekusi (mode propose)', out.execution === undefined, JSON.stringify(out.execution));
    check('S7.3 proyek tidak berubah', (runtime.getProject() as LabProject).nodes.length === 0);
    const out2 = agent.handle('apa itu dhcp', 'read_only');
    check('S7.4 intent belajar → jawaban non-plan', out2.intent === 'learn');
  }

  return rep;
}