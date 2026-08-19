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
import { formatPlanPreview, formatExecuteOutcome } from '../../src/modules/ai/agent/format';
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

  // ── S8. Plan fallback: pola natural language → ActionPlan ─────────────
  console.log('\n== S8. Plan fallback (natural language) ==');
  {
    const { runtime } = makeRuntime();
    const agent = new AgentEngine({ runtime, mode: 'propose' });

    const ip = agent.plan('konfigurasi IP ether1 10.0.0.1/24 di R1', 'propose');
    check('S8.1 pola IP → plan', ip.ok && ip.plan?.actions[0]?.type === 'configure_ip_address', JSON.stringify(ip));
    check('S8.2 params IP benar', ip.plan?.actions[0]?.params['deviceId'] === 'R1' && ip.plan.actions[0].params['address'] === '10.0.0.1/24', JSON.stringify(ip.plan?.actions[0]?.params));

    const route = agent.plan('tambah route 10.0.2.0/24 via 10.0.0.254 di R1', 'propose');
    check('S8.3 pola route → plan', route.ok && route.plan?.actions[0]?.type === 'configure_route', JSON.stringify(route));

    const dev = agent.plan('buat router R9', 'propose');
    check('S8.4 pola buat device → plan', dev.ok && dev.plan?.actions[0]?.type === 'create_device' && dev.plan.actions[0].params['name'] === 'R9', JSON.stringify(dev));

    const link = agent.plan('hubungkan R1 dan R2', 'propose');
    check('S8.5 pola hubungkan → connect_devices', link.ok && link.plan?.actions[0]?.type === 'connect_devices', JSON.stringify(link));

    const del = agent.plan('hapus R1', 'propose');
    check('S8.6 pola hapus → delete_device', del.ok && del.plan?.actions[0]?.type === 'delete_device', JSON.stringify(del));

    const unknown = agent.plan('apa warna langit', 'propose');
    check('S8.7 teks tak dikenal → unknown intent', unknown.intent === 'unknown' || unknown.intent === 'learn', unknown.intent);

    // Plan di mode execute dapat dieksekusi penuh (create + connect)
    const agent2 = new AgentEngine({ runtime, mode: 'execute' });
    const plan = agent2.plan('buat router R1', 'execute');
    const out = plan.ok && plan.plan ? agent2.executePlan(plan.plan) : null;
    check('S8.8 create R1 via plan berhasil', out?.ok === true, JSON.stringify(out));
    check('S8.9 proyek berisi R1', (runtime.getProject() as LabProject).nodes.some((n) => n.name === 'R1'));
  }

  // ── S9. Verification timeline: config → verify → fix → verify ────────
  console.log('\n== S9. Verification timeline (fix loop) ==');
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
    const v = new VerificationEngine(sim);

    // Langkah 1: ping sebelum konfigurasi → GAGAL
    const before = v.verifyPing({ source: 'pc1', destination: '10.0.0.1', actionId: 'step1', label: 'ping pc1 → r1 (sebelum config)' });
    check('S9.1 sebelum config: ping gagal', before.success === false, JSON.stringify(before.reason));

    // Langkah 2: konfigurasi IP via agent (jalur vendor)
    const agent = new AgentEngine({ runtime, mode: 'execute' });
    const cfg1 = agent.callTool('configure_ip_address', { deviceId: 'pc1', interface: 'eth0', address: '10.0.0.2/24' }, { goal: 'fix', actionId: 'step2' });
    const cfg2 = agent.callTool('configure_ip_address', { deviceId: 'r1', interface: 'ether1', address: '10.0.0.1/24' }, { goal: 'fix', actionId: 'step3' });
    check('S9.2 IP terpasang via agent', cfg1.ok && cfg2.ok, JSON.stringify([cfg1, cfg2]));

    // Langkah 3: verify → SUKSES
    const after = v.verifyPing({ source: 'pc1', destination: '10.0.0.1', actionId: 'step4', label: 'ping pc1 → r1 (setelah config)' });
    check('S9.3 setelah config: ping sukses', after.success === true, JSON.stringify(after.reason));

    // Timeline riwayat: gagal → sukses dalam urutan kejadian
    const hist = v.all();
    const timeline = hist.filter((h) => h.testType === 'ping' && h.actionId && h.actionId.startsWith('step'));
    check('S9.4 timeline tercatat berurutan', timeline.length === 2 && timeline[0].success === false && timeline[1].success === true, JSON.stringify(timeline.map((t) => ({ id: t.id, ok: t.success }))));
  }

  // ── S10. Packet trace: alasan drop per hop dalam diagnosa ─────────────
  console.log('\n== S10. Packet trace dalam diagnosis ==');
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
    sim.applyNodeConfig('r1', { ether1: '10.0.0.1/24' }, []);
    sim.applyNodeConfig('pc1', { eth0: '10.0.0.2/24' }, []);

    // Kasus A: pc1 tanpa rute → drop di sumber (tidak ada hop engine)
    const v = new VerificationEngine(sim);
    const diagA = diagnoseConnectivity(sim, v, { source: 'pc1', destination: '10.99.99.99' });
    check('S10.1 diagnosa A menemukan no-route', diagA.ok === false && diagA.rootCause !== null, JSON.stringify(diagA));
    check('S10.2 bukti packet-trace ada', diagA.evidence.some((e) => e.step === 'packet-trace'), JSON.stringify(diagA.evidence.map((e) => e.step)));
    const traceA = diagA.evidence.find((e) => e.step === 'packet-trace');
    check('S10.3 fallback jujur: alasan drop tercantum', traceA?.data.some((d) => d.includes('DROP')) ?? false, JSON.stringify(traceA?.data));

    // Kasus B: pc1 punya default route via R1, R1 TIDAK punya rute →
    // drop di hop R1 (ICMP dest-unreachable) → hop-by-hop dengan reason.
    sim.applyNodeConfig('pc1', { eth0: '10.0.0.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.0.1' }]);
    const diagB = diagnoseConnectivity(sim, v, { source: 'pc1', destination: '10.99.99.99' });
    check('S10.4 diagnosa B menemukan masalah', diagB.ok === false && diagB.rootCause !== null, JSON.stringify(diagB));
    check('S10.5 packet trace hop-by-hop ada', diagB.packetTrace.length > 0, JSON.stringify(diagB.packetTrace));
    check('S10.6 hop R1 dengan reason drop', diagB.packetTrace.some((h) => h.includes('R1') && h.includes('DROP')), JSON.stringify(diagB.packetTrace));
    const traceB = diagB.evidence.find((e) => e.step === 'packet-trace');
    check('S10.7 evidence packet-trace memuat drop reason', traceB?.data.some((d) => d.includes('DROP')) ?? false, JSON.stringify(traceB?.data));
  }

  // ── S11. Vendor tak didukung → UNSUPPORTED jujur (bukan command karangan)
  console.log('\n== S11. Unsupported vendor → jujur ==');
  {
    const { sim, runtime } = makeRuntime();
    const project = runtime.getProject() as LabProject;
    // device vendor eksotis (di luar daftar supported config AI)
    runtime.applyProject({
      ...project,
      nodes: [
        { id: 'fw1', name: 'FW1', vendor: 'pfsense' as never, model: 'pfSense', deviceType: 'firewall', position: { x: 0, y: 0 }, powered: true, ports: [
          { id: 'wan', name: 'wan', speedMbps: 1000, status: 'up', macAddress: '00:00:00:00:00:0a', type: 'copper' },
        ] },
      ],
      edges: [],
    });
    const agent = new AgentEngine({ runtime, mode: 'execute' });
    const r = agent.callTool('configure_ip_address', { deviceId: 'FW1', interface: 'wan', address: '192.168.1.1/24' }, { goal: 'test' });
    check('S11.1 vendor tak didukung ditolak', r.ok === false, JSON.stringify(r));
    check('S11.2 alasan menyebut vendor', (r.error ?? r.message).toLowerCase().includes('vendor') || r.message.toLowerCase().includes('vendor'), r.message);
    // Tidak ada state yang berubah
    const stats = sim.getDeviceStats('fw1');
    check('S11.3 tidak ada IP terpasang (state aman)', !stats?.interfaces.some((i) => i.ip), JSON.stringify(stats?.interfaces));
  }

  // ── S12. Grading parity: lab grading ping == VerificationEngine ping ──
  console.log('\n== S12. Grading parity (grading ↔ verification) ==');
  {
    const { sim, runtime } = makeRuntime();
    const agent = new AgentEngine({ runtime, mode: 'execute' });
    const plan = agent.plan('buat lab ospf 3 router', 'execute');
    const out = plan.ok && plan.plan ? agent.executePlan(plan.plan) : null;
    check('S12.1 lab OSPF terbangun', out?.ok === true, JSON.stringify(out?.message));

    const project = runtime.getProject() as LabProject;
    const lab = buildLabFromTemplate('ospf-3-router', 'ospf-3-router');
    const grade = lab.grading(sim, project);
    const pingChecks = grade.filter((g) => g.label.toLowerCase().includes('ping'));
    check('S12.2 grading punya cek ping', pingChecks.length > 0, JSON.stringify(grade.map((g) => g.label)));

    // Parity: cek ping grading == verifier (jalur engine sama)
    const v = new VerificationEngine(sim);
    for (const c of pingChecks.slice(0, 3)) {
      const m = c.detail.match(/ping\s+(\S+)\s*→\s*(\S+)/);
      if (!m) continue;
      const vr = v.verifyPing({ source: m[1], destination: m[2], actionId: 's12' });
      check(`S12.3 grading(${c.label}) == verifyPing(${m[1]}→${m[2]})`, c.pass === vr.success, `${c.pass} vs ${vr.success}`);
    }
  }

  // ── S13. execute_cli action → verifikasi per-action (expectedEffect) ──
  console.log('\n== S13. Verifikasi per-action ==');
  {
    const { runtime } = makeRuntime();
    const agent = new AgentEngine({ runtime, mode: 'execute' });
    const plan = {
      id: 'plan-cli',
      goal: 'uji verify CLI',
      mode: 'execute' as const,
      actions: [
        { id: 'c1', type: 'create_device' as const, target: 'R1', params: { type: 'router', vendor: 'mikrotik', name: 'R1', seed: 'cli-r1' }, reason: 'buat R1', expectedEffect: 'R1 tersedia di canvas', risk: 'low' as const, validation: 'ok' },
        { id: 'c2', type: 'execute_cli' as const, target: 'R1', params: { deviceId: 'R1', command: '/ip address add address=10.0.0.1/24 interface=ether1' }, reason: 'pasang IP via CLI', expectedEffect: 'konfigurasi R1 terpasang', risk: 'low' as const, validation: 'ok' },
      ],
    };
    const out = agent.executePlan(plan);
    check('S13.1 plan CLI sukses', out.ok === true, JSON.stringify(out.message));
    check('S13.2 semua action diverifikasi', out.verifications.length === 2, `verify=${out.verifications.length}`);
    check('S13.3 verification terhubung ke action', out.results.every((r) => !!r.verification), JSON.stringify(out.results.map((r) => !!r.verification)));
    check('S13.4 semua verifikasi sukses', out.verifications.every((x) => x.success), JSON.stringify(out.verifications));
    check('S13.5 verifiedCount == jumlah verifikasi', out.verifiedCount === out.verifications.length, `${out.verifiedCount}/${out.verifications.length}`);
  }

  // ── S14. Format helpers untuk UI chat ────────────────────────────────
  console.log('\n== S14. Format helpers ==');
  {
    const plan = { id: 'p1', goal: 'uji', mode: 'propose' as const, actions: [
      { id: 'a1', type: 'create_device' as const, target: 'R1', params: {}, reason: 'buat', expectedEffect: 'R1 tersedia', risk: 'low' as const, validation: 'ok' },
    ] };
    const preview = formatPlanPreview(plan);
    check('S14.1 preview memuat aksi + efek', preview.includes('create_device') && preview.includes('R1 tersedia'), preview);

    const outcome = { ok: true, planId: 'p1', goal: 'uji', mode: 'execute' as const, results: [
      { actionId: 'a1', type: 'create_device' as const, ok: true, message: 'ok', verification: { success: true, testType: 'topology' as const, evidence: [], timestamp: 1 } },
    ], verifications: [{ success: true, testType: 'topology' as const, evidence: [], timestamp: 1 }], rolledBack: false, message: 'selesai', verifiedCount: 1, failedCount: 0 };
    const text = formatExecuteOutcome(outcome);
    check('S14.2 outcome memuat status + verify', text.includes('PLAN SUKSES') && text.includes('verify:'), text);
  }

  return rep;
}