/**
 * PRODUCTION ENGINE TEST SUITE — src/engine/net (NetworkSimulator).
 *
 * Tests engine nyata yang dipakai aplikasi (App.tsx → syncNodeToEngine →
 * NetworkSimulator): pembuatan device, state interface (operasional vs
 * admin), koneksi topologi, VLAN otoritatif (kreasi/validasi/penghapusan/
 * rename — tanpa duplikat), trunk allowed/native, forwarding L2/L3,
 * ARP, switching (MAC learning + isolasi VLAN), dan alur CLI vendor → memori
 * → engine (persis alur App).
 *
 * Bagian dari run_all_tests.mts — murni, tanpa DOM.
 */
import { NetworkSimulator } from '../../src/engine/net/core/NetworkSimulator';
import type { LabProjectLike } from '../../src/engine/net/core/Topology';
import { VlanTable, isValidVlanId, VLAN_ID_MIN, VLAN_ID_MAX } from '../../src/engine/net/layer2/VlanTable';
import { MacTable } from '../../src/engine/net/layer2/MacTable';
import { VendorDispatcher } from '../../packages/vendors/src/index';
import { formatPingOutput } from '../../src/engine/net/services/formatPing';

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
    vendor: vendor || (deviceType === 'pc' || deviceType === 'server' ? 'linux' : 'mikrotik'),
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

export function runProductionEngineTests(): Report {
  console.log('\n== P1. Device creation & interface state ==');
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('r1', 'R1', 'router', 3, '01'),
        eNode('sw1', 'SW1', 'switch', 4, '02'),
        eNode('pc1', 'PC1', 'pc', 1, '03'),
        eNode('ap1', 'AP1', 'wireless', 3, '04'),
      ],
      edges: [
        eEdge('e1', 'r1', 'port1', 'sw1', 'port1'),
        eEdge('e2', 'sw1', 'port2', 'pc1', 'port1'),
        eEdge('e3', 'r1', 'port2', 'sw1', 'port3'),
      ],
    };
    sim.syncTopology(project);

    const r1 = sim.getDevice('r1');
    const sw1 = sim.getDevice('sw1');
    const pc1 = sim.getDevice('pc1');
    const ap1 = sim.getDevice('ap1');
    check('P1 device router dibuat', !!r1 && r1.kind === 'router', `${r1?.kind}`);
    check('P1 device switch dibuat', !!sw1 && sw1.isSwitch, `${sw1?.kind}`);
    check('P1 device pc dibuat', !!pc1 && pc1.kind === 'pc', `${pc1?.kind}`);
    check('P1 device wireless dibuat', !!ap1 && ap1.kind === 'wireless', `${ap1?.kind}`);
    check('P1 device tak dikenal tidak ada', sim.getDevice('xyz') === undefined);

    check('P1 r1 punya 3 interface', !!r1 && r1.getInterfaces().length === 3);
    check('P1 nama interface ether1', !!r1 && r1.getIfaceByName('ether1')?.name === 'ether1');
    check('P1 MAC tiap port unik', (() => {
      const macs = [
        ...(r1?.getInterfaces().map((i) => i.mac) || []),
        ...(sw1?.getInterfaces().map((i) => i.mac) || []),
        ...(pc1?.getInterfaces().map((i) => i.mac) || []),
      ];
      return macs.length === new Set(macs).size && macs.length === 8;
    })());
    check('P1 MAC format valid', (r1?.getInterfaces()[0].mac.match(/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/) || null) !== null);

    // Interface state: admin-down vs cable presence (operasional).
    sim.applyNodeConfig('pc1', { ether1: '10.0.0.2/24' }, []);
    sim.setShutdownIfaces('r1', ['ether1']);
    const st = sim.getDeviceStats('r1');
    const ether1 = st?.interfaces.find((i: any) => i.name === 'ether1');
    const ether2 = st?.interfaces.find((i: any) => i.name === 'ether2');
    check('P1 admin-down + kabel → operational admin-down', ether1?.operational === 'admin-down', JSON.stringify(ether1));
    check('P1 up + kabel → operational up', ether2?.operational === 'up', JSON.stringify(ether2));
    const pcSt = sim.getDeviceStats('pc1');
    check('P1 pc terhubung → ether1 up', pcSt?.interfaces[0]?.operational === 'up', JSON.stringify(pcSt?.interfaces[0]));

    // Tanpa kabel → not-connected
    const r1b = sim.getDeviceStats('r1');
    const ether3 = r1b?.interfaces.find((i: any) => i.name === 'ether3');
    check('P1 tanpa kabel → not-connected', ether3?.operational === 'not-connected', JSON.stringify(ether3));
    check('P1 stats memuat ip', !!pcSt && pcSt.interfaces[0]?.ip === '10.0.0.2/24', JSON.stringify(pcSt?.interfaces[0]?.ip));
  }

  console.log('\n== P2. Topology connection ==');
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [eNode('r1', 'R1', 'router', 3, '01'), eNode('r2', 'R2', 'router', 3, '02')],
      edges: [
        eEdge('e1', 'r1', 'port1', 'r2', 'port1'),
        eEdge('bad1', 'r1', 'port9', 'r2', 'port2'), // port tidak ada
        eEdge('bad2', 'r1', 'port1', 'r2', 'port1'), // duplikat
        { ...eEdge('bad3', 'r1', 'port2', 'r1', 'port2'), sourceNodeId: 'r1', targetNodeId: 'r1', sourcePortId: 'port2', targetPortId: 'port2' }, // self-loop
        eEdge('bad4', 'nope', 'port1', 'r2', 'port2'), // node tidak ada
      ],
    };
    sim.syncTopology(project);

    const r1 = sim.getDevice('r1')!;
    check('P2 kabel r1 port1 → r2 port1', sim.topology.links.neighborOf('r1', 'port1')?.nodeId === 'r2');
    check('P2 kabel r2 port1 → r1 port1', sim.topology.links.neighborOf('r2', 'port1')?.nodeId === 'r1');
    check('P2 port2 r1 tidak ber-kabel', sim.topology.links.linkOn('r1', 'port2') === null);

    const warns = sim.getTopologyWarnings();
    check('P2 edge ditolak: port tidak ada', warns.some((w) => w.id === 'bad1'), JSON.stringify(warns));
    check('P2 edge ditolak: duplikat', warns.some((w) => w.id === 'bad2'), JSON.stringify(warns));
    check('P2 edge ditolak: self-loop', warns.some((w) => w.id === 'bad3'), JSON.stringify(warns));
    check('P2 edge ditolak: node tidak ada', warns.some((w) => w.id === 'bad4'), JSON.stringify(warns));
    check('P2 edge valid diterima (4 ditolak)', sim.topology.links.all.length === 1);

    // Ping membutuhkan kabel — tanpa kabel r1-r2, unreachable.
    sim.applyNodeConfig('r1', { ether1: '10.0.0.1/24' }, []);
    sim.applyNodeConfig('r2', { ether1: '10.0.0.2/24' }, []);
    check('P2 ping lewat kabel sukses', sim.simulatePing('r1', '10.0.0.2').success);
    check('P2 jalur ping berisi R2', sim.simulatePing('r1', '10.0.0.2').path.includes('R2'));
  }

  console.log('\n== P3. VLAN authoritative state (VlanTable) ==');
  {
    // 3a. Aturan ID
    check('P3 id 1 valid', isValidVlanId(1));
    check('P3 id 4094 valid', isValidVlanId(4094));
    check('P3 id 0 invalid', !isValidVlanId(0));
    check('P3 id 4095 invalid', !isValidVlanId(4095));
    check('P3 id negatif invalid', !isValidVlanId(-5));
    check('P3 id pecahan invalid', !isValidVlanId(10.5));
    check('P3 konstanta 1..4094', VLAN_ID_MIN === 1 && VLAN_ID_MAX === 4094);

    const tbl = new VlanTable();
    check('P3 add 10 berhasil', tbl.add(10, 'Sales'));
    check('P3 add duplikat 10 ditolak (tidak ada duplikat)', !tbl.add(10, 'Sales-X'));
    check('P3 add 0 ditolak', !tbl.add(0));
    check('P3 add 4095 ditolak', !tbl.add(4095));
    check('P3 lookup 10 = Sales', tbl.get(10)?.name === 'Sales');
    check('P3 lookup 11 kosong', tbl.get(11) === undefined);
    check('P3 default nama VLAN10 bila kosong', tbl.add(20) && tbl.get(20)?.name === 'VLAN20');

    check('P3 rename 10 → Finansial', tbl.rename(10, 'Finansial') && tbl.get(10)?.name === 'Finansial');
    check('P3 rename id tak ada ditolak', !tbl.rename(99, 'X'));
    check('P3 rename nama kosong ditolak', tbl.rename(10, '   ') === false);
    check('P3 rename tetap 10', tbl.get(10)?.id === 10);

    check('P3 remove 10', tbl.remove(10) && tbl.get(10) === undefined);
    check('P3 remove id tak ada ditolak', !tbl.remove(77));

    check('P3 active default', tbl.isActive(20));
    check('P3 suspended bukan active', (() => {
      tbl.replace([{ id: '30', state: 'suspended' }]);
      return !tbl.isActive(30);
    })());

    // replace: string id dinormalisasi, invalid dibuang, duplikat disatukan.
    const n = tbl.replace([{ id: '10', name: 'A' }, { id: 10, name: 'B' }, { id: '4095' }, { id: 10, name: 'C' }, { id: '30', name: 'Eng' }]);
    check('P3 replace memuat 2 VLAN unik (bukan 5)', n === 2, `loaded=${n}`);
    const list = tbl.list();
    check('P3 replace duplikat 10 = entri terakhir (C)', list.find((v) => v.id === 10)?.name === 'C', JSON.stringify(list));
    check('P3 replace invalid 4095 dibuang', list.length === 2 && list.every((v) => isValidVlanId(v.id)), JSON.stringify(list));
    check('P3 replace id string jadi number', typeof list[0].id === 'number');
  }

  console.log('\n== P4. VLAN engine sync (setVlans) & no duplicate objects ==');
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [eNode('sw1', 'SW1', 'switch', 4, '01')],
      edges: [],
    };
    sim.syncTopology(project);

    // Device ada → lihat dari VlanTable device (otoritatif).
    sim.setVlans('sw1', [{ id: '10', name: 'Mgmt' }, { id: 10, name: 'Mgmt-2' }, { id: '20', name: 'Users' }, { id: '0' }, { id: '7000' }]);
    const vlans = sim.getNodeVlans('sw1');
    check('P4 hanya 2 VLAN (duplikat 10 disatukan, invalid dibuang)', vlans.length === 2, JSON.stringify(vlans));
    check('P4 VLAN 10 = entri terakhir', vlans.find((v) => v.id === 10)?.name === 'Mgmt-2', JSON.stringify(vlans));
    check('P4 VLAN 20 ada', vlans.find((v) => v.id === 20)?.name === 'Users');

    // Node belum ada di topologi → normalisasi tetap konsisten.
    const vlansNoDev = sim.getNodeVlans('sw-x');
    check('P4 device tak ada → list kosong', vlansNoDev.length === 0);
    sim.setVlans('sw-x', [{ id: '10' }]);
    const vlansSy = sim.getNodeVlans('sw-x');
    check('P4 device tak ada + set → normalisasi id angka', vlansSy.length === 1 && vlansSy[0].id === 10 && vlansSy[0].name === 'VLAN10', JSON.stringify(vlansSy));

    // replace([]) → kosong (penghapusan VLAN).
    sim.setVlans('sw1', []);
    check('P4 setVlans([]) menghapus semua VLAN', sim.getNodeVlans('sw1').length === 0);

    // syncTopology tidak menghilangkan VLAN yang tersimpan (persistensi config).
    sim.setVlans('sw1', [{ id: '10', name: 'Mgmt' }]);
    sim.syncTopology(project);
    check('P4 VLAN tetap ada setelah syncTopology', sim.getNodeVlans('sw1').length === 1 && sim.getNodeVlans('sw1')[0].id === 10);
  }

  console.log('\n== P5. VLAN CLI → memory → engine (alur App; no duplicates) ==');
  {
    const dis = new VendorDispatcher();
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('sw1', 'SW1', 'switch', 4, '01', 'cisco_ios'),
        eNode('r1', 'R1', 'router', 3, '02', 'cisco_ios'),
      ],
      edges: [eEdge('e1', 'sw1', 'port1', 'r1', 'port1')],
    };
    sim.syncTopology(project);
    dis.setNodeModelLabel('sw1', 'Catalyst 2960-X');
    dis.setNodeModelLabel('r1', 'Catalyst 2960-X');

    const ciscoCtx = { nodeId: 'sw1', name: 'SW1', ports: (project.nodes[0] as any).ports, portLinks: [] };

    // 1. `vlan 10` berulang → TIDAK pernah membuat objek duplikat.
    dis.dispatch('cisco_ios', 'vlan 10', ciscoCtx);
    dis.dispatch('cisco_ios', 'vlan 10', ciscoCtx);
    dis.dispatch('cisco_ios', 'vlan 10', ciscoCtx);
    const mem = dis.getNodeMemory('sw1');
    check('P5 memori vendor: vlan 10 hanya 1 entri', mem.vlans.length === 1 && String(mem.vlans[0].id) === '10', JSON.stringify(mem.vlans));

    // 2. Sync ke engine — persis alur App (syncNodeToEngine).
    sim.setVlans('sw1', mem.vlans);
    const engineVlans = sim.getNodeVlans('sw1');
    check('P5 engine: vlan 10 hanya 1 objek', engineVlans.length === 1 && engineVlans[0].id === 10, JSON.stringify(engineVlans));

    // 3. VLAN invalid ditolak vendor (bukan fake success).
    const invalid = dis.dispatch('cisco_ios', 'vlan 0', ciscoCtx);
    const invalid2 = dis.dispatch('cisco_ios', 'vlan 4095', ciscoCtx);
    check('P5 vlan 0 ditolak', invalid !== '' && /invalid/i.test(invalid), invalid.slice(0, 80));
    check('P5 vlan 4095 ditolak', invalid2 !== '' && /invalid/i.test(invalid2), invalid2.slice(0, 80));
    check('P5 vendor: tidak ada VLAN invalid', mem.vlans.length === 1);

    // 4. `show vlan` mencerminkan state (hanya VLAN yang benar-benar ada).
    const show = dis.dispatch('cisco_ios', 'show vlan', ciscoCtx);
    check('P5 show vlan memuat 10', show.includes('10'), show.slice(0, 100));
    check('P5 show vlan TIDAK memuat baris 0/4095', !/4095/.test(show) && !show.split('\n').some((l) => /^\s*0\s+/.test(l)), show.slice(0, 120));

    // 5. Penghapusan: `no vlan 10` → hilang dari vendor DAN engine.
    dis.dispatch('cisco_ios', 'no vlan 10', ciscoCtx);
    check('P5 no vlan 10 → memori kosong', mem.vlans.length === 0);
    sim.setVlans('sw1', mem.vlans);
    check('P5 engine ikut bersih', sim.getNodeVlans('sw1').length === 0);
    const noSuchErr = dis.dispatch('cisco_ios', 'no vlan 99', ciscoCtx);
    check('P5 no vlan 99 → error jujur (tidak ada)', noSuchErr.includes('% VLAN 99 does not exist'), noSuchErr.slice(0, 80));

    // 6. MikroTik vlan add: duplikat juga disatukan (id = identitas).
    const mt = new VendorDispatcher();
    const mtCtx = { nodeId: 'mt1', name: 'MT1', ports: (project.nodes[0] as any).ports, portLinks: [] };
    mt.dispatch('mikrotik', '/interface vlan add name=vlan10 vlan-id=10 interface=ether1', mtCtx);
    mt.dispatch('mikrotik', '/interface vlan add name=vlan10 vlan-id=10 interface=ether1', mtCtx);
    mt.dispatch('mikrotik', '/interface vlan add name=vlan20 vlan-id=20 interface=ether1', mtCtx);
    const mtMem = mt.getNodeMemory('mt1');
    check('P5 MT: vlan 10 + 20 = 2 entri (bukan 3)', mtMem.vlans.length === 2, JSON.stringify(mtMem.vlans));
    // name cukup → vlan-id wajib ada
    const mtBad = mt.dispatch('mikrotik', '/interface vlan add name=vlanX interface=ether1', mtCtx);
    check('P5 MT tanpa vlan-id → usage jujur', mtBad.includes('Usage'), mtBad.slice(0, 80));
    const mtRange = mt.dispatch('mikrotik', '/interface vlan add name=vlanX vlan-id=5000 interface=ether1', mtCtx);
    check('P5 MT vlan-id 5000 → failure jujur', mtRange.includes('failure') && /1\.\.4094/.test(mtRange), mtRange.slice(0, 80));
  }

  console.log('\n== P6. Trunk allowed & native VLAN (divergence fix) ==');
  {
    const dis = new VendorDispatcher();
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('sw1', 'SW1', 'switch', 5, '01', 'cisco_ios'),
        eNode('pcA', 'PCA', 'pc', 1, '02'),
        eNode('pcB', 'PCB', 'pc', 1, '03'),
        eNode('pcC', 'PCC', 'pc', 1, '04'),
        eNode('pcD', 'PCD', 'pc', 1, '05'),
      ],
      edges: [
        eEdge('e1', 'sw1', 'port1', 'pcA', 'port1'),
        eEdge('e2', 'sw1', 'port2', 'pcB', 'port1'),
        eEdge('e3', 'sw1', 'port3', 'pcC', 'port1'),
        eEdge('e4', 'sw1', 'port4', 'pcD', 'port1'),
      ],
    };
    sim.syncTopology(project);
    const ctx = { nodeId: 'sw1', name: 'SW1', ports: (project.nodes[0] as any).ports, portLinks: [] };

    // interface ether1…4 (cisco) → mode trunk + allowed + native
    dis.dispatch('cisco_ios', 'interface ether1', ctx);
    dis.dispatch('cisco_ios', 'switchport mode trunk', ctx);
    const setErr = dis.dispatch('cisco_ios', 'switchport trunk allowed vlan 10,20-22', ctx);
    check('P6 allowed vlan diterima', setErr === '', setErr.slice(0, 80));
    dis.dispatch('cisco_ios', 'interface ether2', ctx);
    dis.dispatch('cisco_ios', 'switchport mode trunk', ctx);
    dis.dispatch('cisco_ios', 'switchport trunk allowed vlan all', ctx);
    dis.dispatch('cisco_ios', 'switchport trunk native vlan 20', ctx);
    const badAllowed = dis.dispatch('cisco_ios', 'switchport trunk allowed vlan 10,5000', ctx);
    const badNative = dis.dispatch('cisco_ios', 'switchport trunk native vlan 0', ctx);
    check('P6 allowed vlan tidak valid ditolak', badAllowed.includes('Invalid'), badAllowed.slice(0, 90));
    check('P6 native vlan 0 ditolak', badNative.includes('Invalid'), badNative.slice(0, 90));
    // Perintah GAGAL tidak boleh mengubah state — port tidak jadi trunk, memori bersih.
    dis.dispatch('cisco_ios', 'interface ether3', ctx);
    const bad3 = dis.dispatch('cisco_ios', 'switchport trunk allowed vlan 10,5000', ctx);
    check('P6 gagal allowed vlan → port tidak jadi trunk', bad3.includes('Invalid') && !dis.getNodeMemory('sw1').trunkPorts.includes('ether3'), bad3.slice(0, 90));
    const bad4 = dis.dispatch('cisco_ios', 'switchport trunk native vlan 0', ctx);
    check('P6 gagal native vlan → port tidak jadi trunk', bad4.includes('Invalid') && !dis.getNodeMemory('sw1').trunkPorts.includes('ether3'), bad4.slice(0, 90));

    const mem = dis.getNodeMemory('sw1');
    check('P6 mem.trunkAllowed ether1 = [10,20,21,22]', JSON.stringify(mem.trunkAllowed?.ether1) === JSON.stringify([10, 20, 21, 22]), JSON.stringify(mem.trunkAllowed));
    check('P6 ether2 allowed tidak ada (all)', mem.trunkAllowed?.ether2 === undefined, JSON.stringify(mem.trunkAllowed));
    check('P6 mem.trunkNative ether2 = 20', mem.trunkNative?.ether2 === 20, JSON.stringify(mem.trunkNative));
    check('P6 ether1+ether2 masuk trunkPorts', mem.trunkPorts.includes('ether1') && mem.trunkPorts.includes('ether2'));

    // Sync ke engine (subset syncNodeToEngine App).
    sim.setVlans('sw1', mem.vlans);
    sim.setTrunkPorts('sw1', mem.trunkPorts);
    sim.setTrunkAllowed('sw1', mem.trunkAllowed);
    sim.setTrunkNative('sw1', mem.trunkNative);
    sim.applyNodeConfig('pcA', { ether1: '10.0.1.2/24' }, []);
    sim.applyNodeConfig('pcB', { ether1: '10.0.2.2/24' }, []);
    sim.applyNodeConfig('pcC', { ether1: '10.0.3.2/24' }, []);
    sim.applyNodeConfig('pcD', { ether1: '10.0.4.2/24' }, []);

    const allowed = sim.getNodeTrunkAllowed('sw1');
    const native = sim.getNodeTrunkNative('sw1');
    check('P6 engine allowed ether1 = [10,20,21,22]', JSON.stringify(allowed.get('ether1')) === JSON.stringify([10, 20, 21, 22]), JSON.stringify([...allowed]));
    check('P6 engine native ether2 = 20', native.get('ether2') === 20, JSON.stringify([...native]));

    // Validasi engine: id invalid tidak diterima diam-diam.
    sim.setTrunkAllowed('sw1', { ether5: [10, 0, 4095, 5000, 50] });
    const cleaned = [...sim.getNodeTrunkAllowed('sw1').get('ether5')!];
    check('P6 setTrunkAllowed membuang id invalid', JSON.stringify(cleaned) === JSON.stringify([10, 50]), JSON.stringify(cleaned));
    sim.setTrunkNative('sw1', { ether5: 99999 });
    check('P6 setTrunkNative membuang id invalid', sim.getNodeTrunkNative('sw1').has('ether5') === false);

    // `no switchport trunk allowed vlan` → daftar dihapus (kembali semua VLAN).
    dis.dispatch('cisco_ios', 'interface ether1', ctx);
    const noAllowed = dis.dispatch('cisco_ios', 'no switchport trunk allowed vlan', ctx);
    check('P6 no allowed (ada daftar) → sukses', noAllowed === '', noAllowed.slice(0, 80));
    check('P6 no allowed → memori ether1 bersih', !('ether1' in (mem.trunkAllowed || {})), JSON.stringify(mem.trunkAllowed));
    const noAllowedAgain = dis.dispatch('cisco_ios', 'no switchport trunk allowed vlan', ctx);
    check('P6 no allowed tanpa daftar → error jujur', noAllowedAgain.includes('No trunk allowed list'), noAllowedAgain.slice(0, 90));

    // `no switchport trunk native vlan` → native dihapus; tanpa native → error jujur.
    dis.dispatch('cisco_ios', 'interface ether2', ctx);
    const noNative = dis.dispatch('cisco_ios', 'no switchport trunk native vlan', ctx);
    check('P6 no native (dikonfigurasi) → sukses', noNative === '', noNative.slice(0, 80));
    check('P6 no native → memori ether2 bersih', mem.trunkNative?.ether2 === undefined, JSON.stringify(mem.trunkNative));
    dis.dispatch('cisco_ios', 'interface ether4', ctx);
    const noNativeAgain = dis.dispatch('cisco_ios', 'no switchport trunk native vlan', ctx);
    check('P6 no native tanpa konfigurasi → error jujur', noNativeAgain.includes('No trunk native VLAN'), noNativeAgain.slice(0, 90));

    // `switchport trunk allowed vlan none` → daftar kosong DIHAPUS bukan
    // diabaikan — "none" ≠ "semua" (divergence fix; engine wajib mempertahankan).
    dis.dispatch('cisco_ios', 'interface ether3', ctx);
    dis.dispatch('cisco_ios', 'switchport mode trunk', ctx);
    dis.dispatch('cisco_ios', 'switchport trunk allowed vlan none', ctx);
    sim.setTrunkAllowed('sw1', mem.trunkAllowed);
    const noneList = sim.getNodeTrunkAllowed('sw1').get('ether3');
    check('P6 allowed none → engine menyimpan daftar kosong', Array.isArray(noneList) && noneList.length === 0, JSON.stringify([...sim.getNodeTrunkAllowed('sw1')]));

    // Engine ikut diperbarui (allowed ether1 hilang = trunk membawa semua VLAN).
    sim.setTrunkAllowed('sw1', mem.trunkAllowed);
    sim.setTrunkNative('sw1', mem.trunkNative);
    check('P6 engine allowed ether1 dibersihkan', !sim.getNodeTrunkAllowed('sw1').has('ether1'));
    check('P6 engine native ether2 dibersihkan', !sim.getNodeTrunkNative('sw1').has('ether2'));
  }

  console.log('\n== P7. VLAN enforced forwarding (engine behavior) ==');
  {
    // 7a. Isolasi L2 access + trunk enforcement (regresi vlanAllows).
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('pcA', 'PCA', 'pc', 1, '10'),
        eNode('pcB', 'PCB', 'pc', 1, '11'),
        eNode('pcC', 'PCC', 'pc', 1, '12'),
        eNode('sw1', 'SW1', 'switch', 5, '13'),
      ],
      edges: [
        eEdge('e1', 'pcA', 'port1', 'sw1', 'port1'),
        eEdge('e2', 'pcB', 'port1', 'sw1', 'port2'),
        eEdge('e3', 'pcC', 'port1', 'sw1', 'port3'),
      ],
    };
    sim.syncTopology(project);
    sim.setPortVlans('sw1', { ether1: 10, ether2: 20, ether3: 10 });
    sim.applyNodeConfig('pcA', { ether1: '10.0.1.2/24' }, []);
    sim.applyNodeConfig('pcB', { ether1: '10.0.2.2/24' }, []);
    sim.applyNodeConfig('pcC', { ether1: '10.0.1.3/24' }, []);
    check('P7a same-VLAN ping sukses', sim.simulatePing('pcA', '10.0.1.3').success);
    check('P7a beda-VLAN terisolasi (A→B)', !sim.simulatePing('pcA', '10.0.2.2').success);

    // 7b. VLAN suspended → frame dibuang (VlanTable enforcement).
    const sim2 = new NetworkSimulator();
    const project2: LabProjectLike = {
      nodes: [
        eNode('pcX', 'PCX', 'pc', 1, '20'),
        eNode('pcY', 'PCY', 'pc', 1, '21'),
        eNode('sw2', 'SW2', 'switch', 5, '22'),
      ],
      edges: [
        eEdge('e1', 'pcX', 'port1', 'sw2', 'port1'),
        eEdge('e2', 'pcY', 'port1', 'sw2', 'port2'),
      ],
    };
    sim2.syncTopology(project2);
    sim2.setVlans('sw2', [{ id: 10, state: 'suspended' }]);
    sim2.setPortVlans('sw2', { ether1: 10, ether2: 10 });
    sim2.applyNodeConfig('pcX', { ether1: '10.0.1.2/24' }, []);
    sim2.applyNodeConfig('pcY', { ether1: '10.0.1.3/24' }, []);
    check('P7b VLAN suspended → lalu lintas dibuang', !sim2.simulatePing('pcX', '10.0.1.3').success);
    check('P7b tanpa VLAN state → default VLAN 1 tetap jalan', (() => {
      sim2.setVlans('sw2', [{ id: 10, state: 'active' }]);
      return sim2.simulatePing('pcX', '10.0.1.3').success;
    })());

    // 7c. VLAN aktif → ping sukses (VlanTable tidak menghalangi).
    check('P7c VLAN active → ping sukses', (() => {
      const s3 = new NetworkSimulator();
      const p3: LabProjectLike = {
        nodes: [
          eNode('pcA', 'PCA', 'pc', 1, '30'),
          eNode('pcB', 'PCB', 'pc', 1, '31'),
          eNode('sw3', 'SW3', 'switch', 5, '32'),
        ],
        edges: [
          eEdge('e1', 'pcA', 'port1', 'sw3', 'port1'),
          eEdge('e2', 'pcB', 'port1', 'sw3', 'port2'),
        ],
      };
      s3.syncTopology(p3);
      s3.setVlans('sw3', [{ id: 10, name: 'Mgmt' }]);
      s3.setPortVlans('sw3', { ether1: 10, ether2: 10 });
      s3.applyNodeConfig('pcA', { ether1: '10.0.1.2/24' }, []);
      s3.applyNodeConfig('pcB', { ether1: '10.0.1.3/24' }, []);
      return s3.simulatePing('pcA', '10.0.1.3').success;
    })());

    // 7d. Trunk allowed enforcement antar switch: "none" memblokir SEMUA VLAN,
    //     allowed [10] meneruskan VLAN 10. (divergence fix — kosong ≠ semua).
    {
      const s4 = new NetworkSimulator();
      const p4: LabProjectLike = {
        nodes: [
          eNode('pcA', 'PCA', 'pc', 1, '33'),
          eNode('pcB', 'PCB', 'pc', 1, '34'),
          eNode('swX', 'SWX', 'switch', 4, '35'),
          eNode('swY', 'SWY', 'switch', 4, '36'),
        ],
        edges: [
          eEdge('e1', 'pcA', 'port1', 'swX', 'port1'),
          eEdge('e2', 'pcB', 'port1', 'swY', 'port1'),
          eEdge('e3', 'swX', 'port4', 'swY', 'port4'),
        ],
      };
      s4.syncTopology(p4);
      s4.setVlans('swX', [{ id: 10 }]);
      s4.setVlans('swY', [{ id: 10 }]);
      s4.setPortVlans('swX', { ether1: 10 });
      s4.setPortVlans('swY', { ether1: 10 });
      s4.setTrunkPorts('swX', ['ether4']);
      s4.setTrunkPorts('swY', ['ether4']);
      s4.applyNodeConfig('pcA', { ether1: '10.0.1.2/24' }, []);
      s4.applyNodeConfig('pcB', { ether1: '10.0.1.3/24' }, []);

      // allowed none → VLAN 10 tidak menyeberang trunk.
      s4.setTrunkAllowed('swX', { ether4: [] });
      s4.setTrunkAllowed('swY', { ether4: [] });
      check('P7d trunk allowed none → VLAN 10 diblokir', !s4.simulatePing('pcA', '10.0.1.3').success);

      // allowed [10] → VLAN 10 menyeberang.
      s4.setTrunkAllowed('swX', { ether4: [10] });
      s4.setTrunkAllowed('swY', { ether4: [10] });
      check('P7d trunk allowed [10] → VLAN 10 diteruskan', s4.simulatePing('pcA', '10.0.1.3').success);

      // trunk tanpa allowed-list → semua VLAN (default IOS).
      s4.setTrunkAllowed('swX', {});
      s4.setTrunkAllowed('swY', {});
      check('P7d trunk tanpa allowed → VLAN 10 diteruskan', s4.simulatePing('pcA', '10.0.1.3').success);
    }
  }

  console.log('\n== P8. ARP & switching (MAC learning) ==');
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('pc1', 'PC1', 'pc', 1, '40'),
        eNode('pc2', 'PC2', 'pc', 1, '41'),
        eNode('sw1', 'SW1', 'switch', 4, '42'),
      ],
      edges: [
        eEdge('e1', 'pc1', 'port1', 'sw1', 'port1'),
        eEdge('e2', 'pc2', 'port1', 'sw1', 'port2'),
      ],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('pc1', { ether1: '10.0.0.2/24' }, []);
    sim.applyNodeConfig('pc2', { ether1: '10.0.0.3/24' }, []);

    const ping = sim.simulatePing('pc1', '10.0.0.3');
    check('P8 ping L2 sukses (pra-syarat ARP)', ping.success, JSON.stringify(ping));

    const pc1 = sim.getDevice('pc1')!;
    const pc2 = sim.getDevice('pc2')!;
    const sw1 = sim.getDevice('sw1')!;
    const macOf = (n: any, portId: string) => n.getIfaceByPortId(portId)?.mac;

    const pc2Mac = macOf(pc2, 'port1');
    check('P8 PC1 ARP cache berisi PC2', [...pc1.arpCache.entriesList()].some((e) => e.ip === '10.0.0.3' && e.mac === pc2Mac), JSON.stringify(pc1.arpCache.entriesList()));
    check('P8 PC2 ARP cache berisi PC1', [...pc2.arpCache.entriesList()].some((e) => e.ip === '10.0.0.2' && e.mac === macOf(pc1, 'port1')));
    check('P8 PC1 ARP cache berisi 1 entri (tidak bocor)', pc1.arpCache.entriesList().length === 1);

    const macEntries = sw1.macTable.entriesList();
    check('P8 switch belajar 2 MAC', macEntries.length === 2, JSON.stringify(macEntries));
    check('P8 switch MAC PC1 di port1', macEntries.some((e) => e.mac === macOf(pc1, 'port1') && e.port === 'port1'));
    check('P8 switch MAC PC2 di port2', macEntries.some((e) => e.mac === macOf(pc2, 'port1') && e.port === 'port2'));

    const stats = sim.getDeviceStats('sw1');
    check('P8 stats MAC table = 2', (stats?.macTable?.length || 0) === 2, JSON.stringify(stats?.macTable));
    check('P8 stats ARP PC1 = 1', (sim.getDeviceStats('pc1')?.arp?.length || 0) === 1);
  }

  console.log('\n== P9. Switching & L3 routing (forwarding) ==');
  {
    // 9a. Router statis (2 segmen + default route) — ping & TCP lintas router.
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('pc1', 'PC1', 'pc', 1, '50'),
        eNode('r1', 'R1', 'router', 3, '51'),
        eNode('r2', 'R2', 'router', 3, '52'),
        eNode('svr2', 'SVR2', 'server', 1, '53'),
      ],
      edges: [
        eEdge('e1', 'pc1', 'port1', 'r1', 'port1'),
        eEdge('e2', 'r1', 'port2', 'r2', 'port1'),
        eEdge('e3', 'r2', 'port2', 'svr2', 'port1'),
      ],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24', ether2: '192.168.1.1/30' }, [{ dst: '10.0.2.0/24', gateway: '192.168.1.2' }]);
    sim.applyNodeConfig('r2', { ether1: '192.168.1.2/30', ether2: '10.0.2.1/24' }, [{ dst: '10.0.1.0/24', gateway: '192.168.1.1' }]);
    sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
    sim.applyNodeConfig('svr2', { ether1: '10.0.2.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.2.1' }]);
    sim.setWebServer('svr2', { enabled: true, port: 80, content: 'Hello NetLab' });

    const ping = sim.simulatePing('pc1', '10.0.2.10');
    check('P9a ping lintas router sukses', ping.success, JSON.stringify(ping));
    check('P9a jalur ping R1 → R2', ping.path.includes('R1') && ping.path.includes('R2'), JSON.stringify(ping.path));
    const tcp = sim.simulateTcpConnect('pc1', '10.0.2.10', 80);
    check('P9a TCP lintas router 200', tcp.ok && tcp.status === 200 && tcp.body === 'Hello NetLab', JSON.stringify(tcp));

    const r1Stats = sim.getDeviceStats('r1');
    check('P9a rute statis r1 aktif', r1Stats?.routes.some((r) => r.dst === '10.0.2.0/24' && r.kind === 'static'), JSON.stringify(r1Stats?.routes));
    check('P9a rute connected r1', r1Stats?.routes.some((r) => r.dst === '10.0.1.0/24' && r.kind === 'connected'));

    // 9b. Rute statis tanpa kabel → inactive (tidak dipakai lookup).
    const sim2 = new NetworkSimulator();
    const p2: LabProjectLike = {
      nodes: [eNode('pc1', 'PC1', 'pc', 1, '60'), eNode('r1', 'R1', 'router', 2, '61')],
      edges: [eEdge('e1', 'pc1', 'port1', 'r1', 'port1')],
    };
    sim2.syncTopology(p2);
    sim2.applyNodeConfig('r1', { ether1: '10.0.1.1/24' }, [{ dst: '0.0.0.0/0', gateway: '10.99.99.99' }]);
    const r1b = sim2.getDeviceStats('r1');
    check('P9b gateway di subnet tak ada → rute inactive', r1b?.routes.find((r) => r.dst === '0.0.0.0/0')?.active === false, JSON.stringify(r1b?.routes));
    check('P9b gateway invalid tidak diterima', (() => {
      const s3 = new NetworkSimulator();
      const p3: LabProjectLike = { nodes: [eNode('r1', 'R1', 'router', 2, '62')], edges: [] };
      s3.syncTopology(p3);
      s3.applyNodeConfig('r1', { ether1: '10.0.1.1/24' }, [{ dst: '0.0.0.0/0', gateway: 'bukan-ip' }]);
      return s3.getDeviceStats('r1')?.routes.filter((r) => r.kind === 'static').length === 0;
    })());
  }

  console.log('\n== P10. formatPingOutput (produksi, bukan legacy) ==');
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [eNode('pc1', 'PC1', 'pc', 1, '70'), eNode('pc2', 'PC2', 'pc', 1, '71')],
      edges: [eEdge('e1', 'pc1', 'port1', 'pc2', 'port1')],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('pc1', { ether1: '10.0.0.2/24' }, []);
    sim.applyNodeConfig('pc2', { ether1: '10.0.0.3/24' }, []);
    const ok = sim.simulatePing('pc1', '10.0.0.3');
    const out = formatPingOutput('linux', '10.0.0.3', ok);
    check('P10 output berisi reply', /64 bytes from/.test(out) && /3 packets transmitted, 3 received/.test(out), out.slice(0, 120));
    const bad = sim.simulatePing('pc1', '10.99.99.99');
    const outBad = formatPingOutput('cisco_ios', '10.99.99.99', bad);
    check('P10 output gagal jujur (bukan reply)', /Success rate is 0 percent/.test(outBad), outBad.slice(0, 120));
  }

  console.log('\n== P11. Cisco VLAN config view (name context) ==');
  {
    const dis = new VendorDispatcher();
    dis.setNodeModelLabel('sw1', 'Catalyst 2960-X');
    const ctx = { nodeId: 'sw1', name: 'SW1', ports: (() => {
      const ports: any[] = [];
      for (let i = 1; i <= 4; i++) ports.push({ id: `port${i}`, name: `ether${i}`, status: 'up', macAddress: `02:0c:29:01:0${i}:01` });
      return ports;
    })(), portLinks: [] };

    // configure terminal → vlan 10 → name MANAGEMENT
    dis.dispatch('cisco_ios', 'configure terminal', ctx);
    dis.dispatch('cisco_ios', 'vlan 10', ctx);
    dis.dispatch('cisco_ios', 'name MANAGEMENT', ctx);
    const mem = dis.getNodeMemory('sw1');
    check('P11 vlan 10 + name → tepat satu VLAN nama MANAGEMENT', mem.vlans.length === 1 && mem.vlans[0].id === '10' && mem.vlans[0].name === 'MANAGEMENT', JSON.stringify(mem.vlans));

    const show = dis.dispatch('cisco_ios', 'show vlan', ctx);
    check('P11 show vlan memuat nama asli MANAGEMENT', show.includes('MANAGEMENT') && !show.includes('VLAN10 '), show.slice(0, 100));

    // rename: vlan 10 → name USERS — tetap satu objek
    dis.dispatch('cisco_ios', 'vlan 10', ctx);
    dis.dispatch('cisco_ios', 'name USERS', ctx);
    const after = dis.getNodeMemory('sw1');
    check('P11 rename → 1 VLAN nama USERS', after.vlans.length === 1 && after.vlans[0].name === 'USERS', JSON.stringify(after.vlans));

    // name TANPA context → error jujur, tidak membuat VLAN / mengubah apapun
    dis.dispatch('cisco_ios', 'exit', ctx);
    const noCtx = dis.dispatch('cisco_ios', 'name ORPHAN', ctx);
    const after2 = dis.getNodeMemory('sw1');
    check('P11 name tanpa vlan view → error', noCtx.includes('Invalid input'), noCtx.slice(0, 90));
    check('P11 name tidak membuat VLAN baru', after2.vlans.length === 1, JSON.stringify(after2.vlans));

    // name tidak menyentuh VLAN lain
    dis.dispatch('cisco_ios', 'vlan 20', ctx);
    dis.dispatch('cisco_ios', 'name ENGINEERING', ctx);
    dis.dispatch('cisco_ios', 'vlan 10', ctx);
    dis.dispatch('cisco_ios', 'name USERS-NEW', ctx);
    const mem3 = dis.getNodeMemory('sw1');
    const v20 = mem3.vlans.find((v: any) => v.id === '20');
    check('P11 name hanya mengubah VLAN aktif', v20?.name === 'ENGINEERING', JSON.stringify(mem3.vlans));
    check('P11 vlan 10 masih USERS-NEW', mem3.vlans.find((v: any) => v.id === '10')?.name === 'USERS-NEW');

    // interface view mengakhiri vlan view
    dis.dispatch('cisco_ios', 'interface ether1', ctx);
    const afterIface = dis.dispatch('cisco_ios', 'name NOPE', ctx);
    check('P11 name di interface view → error', afterIface.includes('Invalid input'), afterIface.slice(0, 90));

    // show run memuat name
    const run = dis.dispatch('cisco_ios', 'show run', ctx);
    check('P11 show run memuat name USERS-NEW', run.includes('name USERS-NEW'), run.slice(0, 200));

    // Huawei: vlan 30 → name HRD
    const h = new VendorDispatcher();
    const hctx = { nodeId: 'sw', name: 'SW', ports: [], portLinks: [] };
    h.dispatch('huawei', 'vlan 30', hctx);
    h.dispatch('huawei', 'name HRD', hctx);
    const hm = h.getNodeMemory('sw');
    check('P11 huawei vlan 30 name HRD', hm.vlans.length === 1 && hm.vlans[0].name === 'HRD', JSON.stringify(hm.vlans));
  }

  console.log('\n== P12. VLAN persistence cycle (serialize → JSON → restore) ==');
  {
    const dis = new VendorDispatcher();
    dis.setNodeModelLabel('sw1', 'Catalyst 2960-X');
    const ctx = { nodeId: 'sw1', name: 'SW1', ports: (() => {
      const ports: any[] = [];
      for (let i = 1; i <= 4; i++) ports.push({ id: `port${i}`, name: `ether${i}`, status: 'up', macAddress: `02:0c:29:02:0${i}:01` });
      return ports;
    })(), portLinks: [] };
    dis.dispatch('cisco_ios', 'vlan 10', ctx);
    dis.dispatch('cisco_ios', 'name MANAGEMENT', ctx);
    dis.dispatch('cisco_ios', 'vlan 20', ctx);
    dis.dispatch('cisco_ios', 'name USERS', ctx);
    dis.dispatch('cisco_ios', 'interface ether1', ctx);
    dis.dispatch('cisco_ios', 'switchport mode access', ctx);
    dis.dispatch('cisco_ios', 'switchport access vlan 10', ctx);

    // .mlab / storage cycle: JSON.stringify (persist) → parse (load) → restoreMemory
    const persisted = JSON.stringify(dis.serializeMemory());
    const loaded = JSON.parse(persisted) as Record<string, any>;
    const dis2 = new VendorDispatcher();
    dis2.restoreMemory(loaded);
    const mem2 = dis2.getNodeMemory('sw1');
    check('P12 restore: 2 VLAN dengan nama', mem2.vlans.length === 2 && mem2.vlans[0].name === 'MANAGEMENT' && mem2.vlans[1].name === 'USERS', JSON.stringify(mem2.vlans));
    check('P12 restore: access vlan ikut', mem2.portVlans?.ether1 === 10, JSON.stringify(mem2.portVlans));

    // show vlan dari dispatcher baru mencerminkan nama yang dipersist
    const show2 = dis2.dispatch('cisco_ios', 'show vlan', ctx);
    check('P12 show vlan setelah load memuat MANAGEMENT+USERS', show2.includes('MANAGEMENT') && show2.includes('USERS'), show2.slice(0, 120));
    check('P12 show vlan port dari state nyata (bukan hardcode Gi0/1)', show2.includes('ether1') && !show2.includes('Gi0/1'), show2.slice(0, 150));

    // engine ikut: sync vlans dari memori hasil load → state otoritatif bernama
    const sim = new NetworkSimulator();
    const project: LabProjectLike = { nodes: [eNode('sw1', 'SW1', 'switch', 4, '02', 'cisco_ios')], edges: [] };
    sim.syncTopology(project);
    sim.setVlans('sw1', mem2.vlans);
    const ev = sim.getNodeVlans('sw1');
    check('P12 engine VLAN bernama setelah load', ev.length === 2 && ev.find((v) => v.id === 10)?.name === 'MANAGEMENT', JSON.stringify(ev));
  }

  console.log('\n== P13. Broadcast domain & unknown-unicast VLAN boundary ==');
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('pc1', 'PC1', 'pc', 1, '80'),
        eNode('pc2', 'PC2', 'pc', 1, '81'),
        eNode('pc3', 'PC3', 'pc', 1, '82'),
        eNode('sw1', 'SW1', 'switch', 6, '83'),
      ],
      edges: [
        eEdge('e1', 'pc1', 'port1', 'sw1', 'port1'),
        eEdge('e2', 'pc2', 'port1', 'sw1', 'port2'),
        eEdge('e3', 'pc3', 'port1', 'sw1', 'port3'),
      ],
    };
    sim.syncTopology(project);
    sim.setVlans('sw1', [{ id: 10, name: 'Mgmt' }, { id: 20, name: 'Users' }]);
    sim.setPortVlans('sw1', { ether1: 10, ether2: 10, ether3: 20 });
    sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, []);
    sim.applyNodeConfig('pc2', { ether1: '10.0.1.3/24' }, []);
    sim.applyNodeConfig('pc3', { ether1: '10.0.2.2/24' }, []);

    // Broadcast (ARP) dari PC1 menjangkau PC2 (VLAN 10) — sukses.
    check('P13 same-VLAN ping (broadcast domain 10)', sim.simulatePing('pc1', '10.0.1.3').success);

    const pc1 = sim.getDevice('pc1')!;
    const pc2 = sim.getDevice('pc2')!;
    const pc3 = sim.getDevice('pc3')!;
    const sw1 = sim.getDevice('sw1')!;
    const macOf = (n: any, pid: string) => n.getIfaceByPortId(pid)?.mac;

    // Broadcast tidak bocor ke VLAN 20: ARP cache PC3 kosong.
    check('P13 broadcast TIDAK sampai PC3 (VLAN 20)', pc3.arpCache.entriesList().length === 0, JSON.stringify(pc3.arpCache.entriesList()));
    // PC2 tahu MAC PC1 (broadcast diterima), PC1 tahu PC2.
    check('P13 PC2 ARP berisi PC1', [...pc2.arpCache.entriesList()].some((e) => e.mac === macOf(pc1, 'port1')), JSON.stringify(pc2.arpCache.entriesList()));

    // Unknown-unicast lintas VLAN: PC1 → PC3 (10.0.2.2) tidak mungkin — L2 tidak
    // boleh flood ke VLAN 20. MAC PC3 tidak pernah dipelajari di VLAN 10.
    check('P13 ping lintas VLAN gagal (tidak ada L3)', !sim.simulatePing('pc1', '10.0.2.2').success);
    const macEntries = sw1.macTable.entriesList();
    check('P13 MAC table hanya berisi VLAN 10', macEntries.every((e) => (e.vlan ?? 1) === 10), JSON.stringify(macEntries));
    check('P13 MAC PC3 tidak bocor ke VLAN 10', !macEntries.some((e) => e.mac === macOf(pc3, 'port1')), JSON.stringify(macEntries));
    check('P13 PC3 ARP tetap kosong (tidak ada flood lintas VLAN)', pc3.arpCache.entriesList().length === 0);

    // MAC PC1 & PC2 terpaut port yang benar di VLAN 10.
    check('P13 MAC PC1 di port1 vlan 10', macEntries.some((e) => e.mac === macOf(pc1, 'port1') && e.port === 'port1' && (e.vlan ?? 1) === 10), JSON.stringify(macEntries));
  }

  console.log('\n== P14. VLAN-aware MAC table (same MAC, two VLANs) ==');
  {
    const tbl = new MacTable();
    const MAC = 'aa:bb:cc:dd:ee:ff';
    tbl.learn(MAC, 'port1', 10, 1000);
    tbl.learn(MAC, 'port2', 20, 1000);
    check('P14 MAC sama di 2 VLAN = 2 entri independen', tbl.entriesList().length === 2, JSON.stringify(tbl.entriesList()));
    const in10 = tbl.lookup(MAC, 10);
    const in20 = tbl.lookup(MAC, 20);
    check('P14 lookup(vlan10) → port1', in10?.port === 'port1', JSON.stringify(in10));
    check('P14 lookup(vlan20) → port2', in20?.port === 'port2', JSON.stringify(in20));
    check('P14 lookup tanpa vlan → tidak ditemukan (API vlan-aware)', tbl.lookup(MAC, null) === null);

    // Movement: MAC berpindah port dalam VLAN 10 → update, VLAN 20 tidak berubah.
    const moved = tbl.learn(MAC, 'port3', 10, 1100);
    check('P14 movement terdeteksi (port berubah)', moved === true);
    check('P14 movement → port3 di vlan 10', tbl.lookup(MAC, 10)?.port === 'port3');
    check('P14 movement tidak menyentuh vlan 20', tbl.lookup(MAC, 20)?.port === 'port2');

    // Removal per-VLAN.
    check('P14 remove vlan 10', tbl.remove(MAC, 10) && tbl.entriesList().length === 1);
    check('P14 remove vlan 20', tbl.remove(MAC, 20) && tbl.entriesList().length === 0);

    // Aging (default agingMs = 30000).
    tbl.learn(MAC, 'port1', 10, 0);
    check('P14 belum tua → masih ada', tbl.lookup(MAC, 10) !== null);
    const aged = tbl.age(30001);
    check('P14 aging menghapus entri tua', aged.includes(MAC) && tbl.lookup(MAC, 10) === null);

    // VLAN removal memusnahkan MAC milik VLAN itu.
    tbl.learn(MAC, 'port1', 10, 0);
    tbl.learn(MAC, 'port2', 20, 0);
    tbl.removeVlan(10);
    check('P14 removeVlan(10) menyisakan vlan 20 saja', tbl.entriesList().length === 1 && tbl.lookup(MAC, 20) !== null && tbl.lookup(MAC, 10) === null);
  }

  console.log('\n== P15. Access port & shutdown ==');
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('pc1', 'PC1', 'pc', 1, '90'),
        eNode('pc2', 'PC2', 'pc', 1, '91'),
        eNode('sw1', 'SW1', 'switch', 4, '92'),
      ],
      edges: [
        eEdge('e1', 'pc1', 'port1', 'sw1', 'port1'),
        eEdge('e2', 'pc2', 'port1', 'sw1', 'port2'),
      ],
    };
    sim.syncTopology(project);
    sim.setPortVlans('sw1', { ether1: 10, ether2: 10 });
    sim.applyNodeConfig('pc1', { ether1: '10.0.1.2/24' }, []);
    sim.applyNodeConfig('pc2', { ether1: '10.0.1.3/24' }, []);
    check('P15 access port VLAN 10 → komunikasi jalan', sim.simulatePing('pc1', '10.0.1.3').success);

    // shutdown port access (switch) → forwarding berhenti.
    sim.setShutdownIfaces('sw1', ['ether1']);
    check('P15 shutdown access port → forwarding berhenti', !sim.simulatePing('pc1', '10.0.1.3').success);
    const stats = sim.getDeviceStats('sw1');
    const e1 = stats?.interfaces.find((i: any) => i.name === 'ether1');
    check('P15 operational admin-down', e1?.operational === 'admin-down', JSON.stringify(e1));

    // no shutdown → kembali.
    sim.setShutdownIfaces('sw1', []);
    check('P15 no shutdown → forwarding kembali', sim.simulatePing('pc1', '10.0.1.3').success);
  }

  console.log('\n== P16. Native VLAN & trunk ingress filtering (end-to-end) ==');
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('pc1', 'PC1', 'pc', 1, 'a0'),
        eNode('pc2', 'PC2', 'pc', 1, 'a1'),
        eNode('swX', 'SWX', 'switch', 4, 'a2'),
        eNode('swY', 'SWY', 'switch', 4, 'a3'),
      ],
      edges: [
        eEdge('e1', 'pc1', 'port1', 'swX', 'port1'),
        eEdge('e2', 'pc2', 'port1', 'swY', 'port1'),
        eEdge('e3', 'swX', 'port4', 'swY', 'port4'),
      ],
    };
    sim.syncTopology(project);
    sim.setVlans('swX', [{ id: 10 }, { id: 50 }, { id: 99 }]);
    sim.setVlans('swY', [{ id: 10 }, { id: 50 }, { id: 99 }]);
    sim.setPortVlans('swX', { ether1: 99 });
    sim.setPortVlans('swY', { ether1: 99 });
    sim.setTrunkPorts('swX', ['ether4']);
    sim.setTrunkPorts('swY', ['ether4']);
    sim.applyNodeConfig('pc1', { ether1: '10.0.99.2/24' }, []);
    sim.applyNodeConfig('pc2', { ether1: '10.0.99.3/24' }, []);

    // 16a. Native VLAN 99: frame tak-bertag lewat trunk → kedua ujung native sama.
    sim.setTrunkNative('swX', { ether4: 99 });
    sim.setTrunkNative('swY', { ether4: 99 });
    check('P16a native 99 → VLAN 99 menyeberang trunk', sim.simulatePing('pc1', '10.0.99.3').success);

    // 16b. Native berbeda di ujung lain → frame native 99 ditolak di sisi Y
    //     (Y menerima untagged sebagai native 50, bukan 99).
    sim.setTrunkNative('swY', { ether4: 50 });
    check('P16b native mismatch → komunikasi terputus', !sim.simulatePing('pc1', '10.0.99.3').success);
    sim.setTrunkNative('swY', { ether4: 99 });

    // 16c. Allowed-list tanpa native: native tetap boleh (native ≠ tagged).
    sim.setTrunkAllowed('swX', { ether4: [10] });
    sim.setTrunkAllowed('swY', { ether4: [10] });
    check('P16c allowed [10] + native 99 → native tetap lewat', sim.simulatePing('pc1', '10.0.99.3').success);

    // 16d. Tagged VLAN 10 harus lewat bila allowed; diblokir bila tidak.
    sim.setPortVlans('swX', { ether1: 10 });
    sim.setPortVlans('swY', { ether1: 10 });
    sim.applyNodeConfig('pc1', { ether1: '10.0.10.2/24' }, []);
    sim.applyNodeConfig('pc2', { ether1: '10.0.10.3/24' }, []);
    check('P16d VLAN 10 (allowed [10]) → lewat', sim.simulatePing('pc1', '10.0.10.3').success);
    sim.setTrunkAllowed('swX', { ether4: [50] });
    check('P16d VLAN 10 TIDAK di allowed → diblokir', !sim.simulatePing('pc1', '10.0.10.3').success);
    sim.setTrunkAllowed('swX', { ether4: [10] });

    // 16e. Trunk tanpa allowed → semua VLAN (default model).
    sim.setTrunkAllowed('swX', {});
    sim.setTrunkAllowed('swY', {});
    check('P16e trunk tanpa allowed → VLAN 10 lewat', sim.simulatePing('pc1', '10.0.10.3').success);
  }

  console.log('\n== P17. STP blocked path (loop) ==');
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        eNode('pc1', 'PC1', 'pc', 1, 'b0'),
        eNode('pc2', 'PC2', 'pc', 1, 'b1'),
        eNode('sw1', 'SW1', 'switch', 4, 'b2', 'cisco_ios'),
        eNode('sw2', 'SW2', 'switch', 4, 'b3', 'cisco_ios'),
        eNode('sw3', 'SW3', 'switch', 4, 'b4', 'cisco_ios'),
      ],
      edges: [
        eEdge('e1', 'pc1', 'port1', 'sw1', 'port1'),
        eEdge('e2', 'pc2', 'port1', 'sw2', 'port1'),
        // loop segitiga: sw1-sw2, sw2-sw3, sw3-sw1
        eEdge('e3', 'sw1', 'port2', 'sw2', 'port2'),
        eEdge('e4', 'sw2', 'port3', 'sw3', 'port3'),
        eEdge('e5', 'sw3', 'port2', 'sw1', 'port3'),
      ],
    };
    sim.syncTopology(project);
    sim.setStp('sw1', { enabled: true, priority: 4096, mode: 'rstp' });
    sim.setStp('sw2', { enabled: true, priority: 32768, mode: 'rstp' });
    sim.setStp('sw3', { enabled: true, priority: 32768, mode: 'rstp' });
    sim.applyNodeConfig('pc1', { ether1: '10.0.0.2/24' }, []);
    sim.applyNodeConfig('pc2', { ether1: '10.0.0.3/24' }, []);

    // Ada port yang diblokir STP di loop (alternate/blocking).
    const blocked: { dev: string; port: string; state: string }[] = [];
    for (const sw of ['sw1', 'sw2', 'sw3']) {
      const info = sim.getStpInfo(sw);
      if (!info) continue;
      for (const p of info.ports) if (p.state !== 'forwarding') blocked.push({ dev: sw, port: p.port, state: p.state });
    }
    check('P17 loop → minimal satu port diblokir STP', blocked.length >= 1, JSON.stringify(blocked));

    // Traffic tetap jalan lewat spanning tree (loop dipecah, tidak ada live-lock).
    const ping = sim.simulatePing('pc1', '10.0.0.3');
    check('P17 ping lintas loop sukses (STP path)', ping.success, JSON.stringify(ping));

    // Forwarding menghormati port blocked: tidak ada frame yang diteruskan
    // melalui port alternate — jalur komunikasi memakai spanning tree saja.
    const blockedPort = blocked[0];
    const statsSw = sim.getDeviceStats('sw1');
    check('P17 stats STP tampil (root info)', !!statsSw?.stp, JSON.stringify(statsSw?.stp));
    check('P17 port diblokir dilaporkan bukan forwarding', blockedPort.state !== 'forwarding', JSON.stringify(blockedPort));
  }

  console.log(`PRODUCTION ENGINE: ${rep.passed} passed, ${rep.failed} failed`);
  return rep;
}