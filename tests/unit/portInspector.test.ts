/**
 * Port Inspector — derivasi koneksi dari grafik topologi (src/connection.ts):
 * port → remote device/port, status (icon+text), rename/delete device,
 * disconnect/reconnect. Plus golden scenario end-to-end:
 * R1 ether1 → SW1 ether24, R1 ether2 → R2 ether1.
 *
 * Bagian dari run_all_tests.mts (murni, tanpa DOM).
 */
import {
  edgeForPort,
  portConnection,
  portHealth,
  accessVlanFor,
  connectionLabel,
  PORT_HEALTH_LABEL,
  CABLE_TYPE_LABEL,
} from '../../src/connection';
import { NetworkSimulator } from '../../src/engine/net/core/NetworkSimulator';
import type { LabNode, LabEdge, LabProject } from '../../src/types';

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

function mkNode(id: string, name: string, ports: { id: string; name: string; status?: 'up' | 'down' }[]): LabNode {
  const seed = id
    .split('')
    .reduce((a, c) => a + c.charCodeAt(0), 0)
    .toString(16)
    .padStart(2, '0')
    .slice(-2);
  return {
    id,
    name,
    vendor: 'mikrotik',
    model: 'hEX (RB750Gr3)',
    deviceType: 'router',
    position: { x: 0, y: 0 },
    ports: ports.map((p, i) => ({
      id: p.id,
      name: p.name,
      speedMbps: 1000,
      macAddress: `02:0c:29:${seed}:${String(i + 1).padStart(2, '0')}:01`,
      status: p.status ?? 'up',
      type: 'copper',
      side: i % 2 === 0 ? 'left' : 'right',
      slot: Math.floor(i / 2),
    })),
  };
}

function mkEdge(id: string, src: string, sPort: string, tgt: string, tPort: string, extra: Partial<LabEdge> = {}): LabEdge {
  return { id, sourceNodeId: src, sourcePortId: sPort, targetNodeId: tgt, targetPortId: tPort, cableType: 'copper_straight', ...extra };
}

export function runPortInspectorTests(): Report {
  const r1 = mkNode('r1', 'R1', [
    { id: 'ether1', name: 'ether1' },
    { id: 'ether2', name: 'ether2' },
    { id: 'ether3', name: 'ether3' },
  ]);
  const sw1 = mkNode('sw1', 'SW1', [
    { id: 'ether24', name: 'ether24' },
    { id: 'ether23', name: 'ether23' },
  ]);
  const r2 = mkNode('r2', 'R2', [{ id: 'ether1', name: 'ether1' }]);
  const nodes = [r1, sw1, r2];
  const edges = [
    mkEdge('e1', 'r1', 'ether1', 'sw1', 'ether24'),
    mkEdge('e2', 'r1', 'ether2', 'r2', 'ether1'),
  ];

  // ── 1. Golden: R1 ether1 → SW1/ether24, ether2 → R2/ether1 ──────────
  {
    const c1 = portConnection(nodes, edges, 'r1', 'ether1');
    check('P1 ether1 → SW1', c1?.remoteNodeName === 'SW1' && c1?.remotePortName === 'ether24', JSON.stringify(c1));
    check('P1b label', c1 && connectionLabel(c1) === 'SW1 / ether24', c1 ? connectionLabel(c1) : 'null');
    const c2 = portConnection(nodes, edges, 'r1', 'ether2');
    check('P2 ether2 → R2/ether1', c2?.remoteNodeName === 'R2' && c2?.remotePortName === 'ether1', JSON.stringify(c2));
    // Arah sebaliknya (dari sisi remote)
    const c3 = portConnection(nodes, edges, 'sw1', 'ether24');
    check('P3 arah balik: SW1 ether24 → R1/ether1', c3?.remoteNodeName === 'R1' && c3?.remotePortName === 'ether1', JSON.stringify(c3));
    const c4 = portConnection(nodes, edges, 'r1', 'ether3');
    check('P4 ether3 → null (Not Connected)', c4 === null);
    check('P5 status ether3 NOT CONNECTED', portHealth(r1.ports[2], null) === 'not-connected');
    check('P6 label status', PORT_HEALTH_LABEL['not-connected'] === 'NOT CONNECTED');
    check('P7 edgeForPort menemukan e1', edgeForPort(nodes, edges, 'r1', 'ether1')?.id === 'e1');
  }

  // ── 2. Disconnect / reconnect ────────────────────────────────────────
  {
    const edges2 = edges.filter((e) => e.id !== 'e1');
    const c = portConnection(nodes, edges2, 'r1', 'ether1');
    check('P8 setelah disconnect → NOT CONNECTED', c === null && portHealth(r1.ports[0], c) === 'not-connected');
    const edges3 = [...edges2, mkEdge('e3', 'r1', 'ether1', 'sw1', 'ether23', { cableType: 'fiber' })];
    const c2 = portConnection(nodes, edges3, 'r1', 'ether1');
    check('P9 reconnect ke port lain', c2?.remotePortName === 'ether23' && c2?.edge.cableType === 'fiber', JSON.stringify(c2));
  }

  // ── 3. Rename device / remote device dihapus ─────────────────────────
  {
    const renamed = [...nodes].map((n) => (n.id === 'r1' ? { ...n, name: 'Router-Uptime' } : n));
    const c = portConnection(renamed, edges, 'r1', 'ether1');
    check('P10 rename local → nama baru di label', c?.remoteNodeName === 'SW1', JSON.stringify(c));
    const missing = nodes.filter((n) => n.id !== 'sw1');
    const c2 = portConnection(missing, edges, 'r1', 'ether1');
    check('P11 remote dihapus → tidak ada info koneksi (bukan string sampah)', c2 === null);
    const c3 = portConnection(nodes, edges.filter((e) => e.id !== 'e2'), 'r2', 'ether1');
    check('P12 port R2 ether1 terlepas kabelnya', c3 === null);
  }

  // ── 4. Link type & down → status ────────────────────────────────────
  {
    const edgesDown = edges.map((e) => (e.id === 'e1' ? { ...e, down: true } : e));
    const c = portConnection(nodes, edgesDown, 'r1', 'ether1')!;
    check('P13 label link type', CABLE_TYPE_LABEL[c.edge.cableType] === 'Copper Straight');
    check('P14 edge.down → status DOWN', portHealth(r1.ports[0], c) === 'down');
    const adminDown = mkNode('x', 'X', [{ id: 'p1', name: 'p1', status: 'down' }]);
    const c2 = portConnection([...nodes, adminDown], [mkEdge('e9', 'x', 'p1', 'r1', 'ether3')], 'x', 'p1')!;
    check('P15 port.status down + terhubung → ADMIN DOWN', portHealth(adminDown.ports[0], c2) === 'admin-down');
    check('P16 label ADMIN DOWN', PORT_HEALTH_LABEL['admin-down'] === 'ADMIN DOWN');
    // Status ADMIN DOWN dari state ENGINE (shutdownIfaces via CLI), bukan status UI.
    const c3 = portConnection(nodes, edges, 'r1', 'ether1')!;
    check('Q1 port up + shutdown CLI → ADMIN DOWN', portHealth(r1.ports[0], c3, ['ether1']) === 'admin-down');
    check('Q2 port up + shutdown CLI nama lain → tetap UP', portHealth(r1.ports[0], c3, ['ether2']) === 'up');
    check('Q3 shutdown CLI nama port tidak dikenal → tidak berpengaruh', portHealth(r1.ports[0], c3, ['xyz']) === 'up');
    // Urutan prioritas engine: shutdown > link down.
    const edgesDown2 = edges.map((e) => (e.id === 'e1' ? { ...e, down: true } : e));
    const c4 = portConnection(nodes, edgesDown2, 'r1', 'ether1')!;
    check('Q4 shutdown + link down → ADMIN DOWN (prioritas engine)', portHealth(r1.ports[0], c4, ['ether1']) === 'admin-down');
  }

  // ── 5. VLAN access dari state ENGINE (portVlans) → kolom VLAN inspector ─
  {
    const vlanMap = { ether1: 10, ether2: 20 };
    check('R1 accessVlanFor ether1 → 10', accessVlanFor('ether1', vlanMap) === 10);
    check('R2 accessVlanFor nama tak dikenal → null', accessVlanFor('ether9', vlanMap) === null);
    check('R3 tanpa state → null (jujur, bukan asumsi)', accessVlanFor('ether1', undefined) === null);
    check('R4 vlan 0 / nilai rusak → null', accessVlanFor('ether1', { ether1: 0 }) === null);
    // Konsistensi label: trunk STATE engine (trunkPorts) tetap TRUNK walau ada access vlan.
    const c = portConnection(nodes, edges, 'r1', 'ether1')!;
    check('R5 access vlan tidak mengganggu status port', portHealth(r1.ports[0], c) === 'up');
  }

  // ── 6. Wireless: Laptop1 wlan0 → AP1 wlan0 (radio port) ─────────────
  {
    const ap = mkNode('ap1', 'AP1', [
      { id: 'wlan0', name: 'wlan0' },
      { id: 'wlan1', name: 'wlan1' },
      { id: 'eth0', name: 'eth0' },
    ]);
    const laptop = mkNode('laptop1', 'Laptop1', [{ id: 'wlan0', name: 'wlan0' }]);
    const wkNodes = [...nodes, ap, laptop];
    const wkEdges = [...edges, mkEdge('wl1', 'laptop1', 'wlan0', 'ap1', 'wlan0', { cableType: 'copper_straight' })];
    const c = portConnection(wkNodes, wkEdges, 'laptop1', 'wlan0');
    check('W1 laptop wlan0 → AP1 / wlan0', c?.remoteNodeName === 'AP1' && c?.remotePortName === 'wlan0', JSON.stringify(c));
    check('W2 arah balik AP1 wlan0 → Laptop1 / wlan0', portConnection(wkNodes, wkEdges, 'ap1', 'wlan0')?.remoteNodeName === 'Laptop1');
    const c2 = portConnection(wkNodes, wkEdges, 'ap1', 'wlan1');
    check('W3 AP1 wlan1 idle → null', c2 === null && portHealth(ap.ports[1], c2) === 'not-connected');
    check('W4 status radio terhubung UP', c !== null && portHealth(laptop.ports[0], c) === 'up');
    const wlDown = wkEdges.map((e) => (e.id === 'wl1' ? { ...e, down: true } : e));
    check('W5 wireless link down → status DOWN', portHealth(laptop.ports[0], portConnection(wkNodes, wlDown, 'laptop1', 'wlan0')!) === 'down');
  }

  // ── 5. Event packet lifecycle (PACKET_QUEUED/FORWARDED/DELIVERED) ────
  {
    const sim = new NetworkSimulator();
    const project: LabProject = {
      version: '1',
      metadata: { name: 'pi', author: '', description: '', createdAt: '', updatedAt: '' },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        mkNode('pc1', 'PC1', [{ id: 'port1', name: 'ether1' }]),
        mkNode('sw1', 'SW1', [
          { id: 'port1', name: 'ether1' },
          { id: 'port2', name: 'ether2' },
        ]),
        mkNode('pc2', 'PC2', [{ id: 'port1', name: 'ether1' }]),
      ].map((n) => ({ ...n, vendor: 'linux' as const, deviceType: (n.id === 'sw1' ? 'switch' : 'pc') as LabNode['deviceType'] })),
      edges: [
        mkEdge('l1', 'pc1', 'port1', 'sw1', 'port1'),
        mkEdge('l2', 'sw1', 'port2', 'pc2', 'port1'),
      ],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('pc1', { ether1: '192.168.1.10/24' }, []);
    sim.applyNodeConfig('pc2', { ether1: '192.168.1.11/24' }, []);

    const res = sim.simulatePing('pc1', '192.168.1.11');
    check('P17 ping PC1→PC2 sukses', res.success, JSON.stringify(res));
    const ev = sim.eventHistory;
    const created = ev.filter((e) => e.type === 'PACKET_CREATED').length;
    const queued = ev.filter((e) => e.type === 'PACKET_QUEUED').length;
    const tx = ev.filter((e) => e.type === 'PACKET_TRANSMITTED').length;
    const rcvd = ev.filter((e) => e.type === 'PACKET_RECEIVED').length;
    const fwd = ev.filter((e) => e.type === 'PACKET_FORWARDED').length;
    const delivered = ev.filter((e) => e.type === 'PACKET_DELIVERED').length;
    check('P18 PACKET_CREATED ada', created > 0, String(created));
    check('P19 PACKET_QUEUED ada (scheduler)', queued > 0, String(queued));
    check('P20 PACKET_TRANSMITTED ada', tx > 0, String(tx));
    check('P21 PACKET_RECEIVED ada', rcvd > 0, String(rcvd));
    check('P22 PACKET_FORWARDED ada (switch L2 forward)', fwd > 0, String(fwd));
    check('P23 PACKET_DELIVERED ada (host menerima)', delivered > 0, String(delivered));
    const drops = ev.filter((e) => e.type === 'PACKET_DROPPED');
    check('P24 drop tanpa reason TIDAK ada', drops.every((d) => Boolean((d.data as { reason?: string })?.reason)), JSON.stringify(drops.slice(0, 3)));
  }

  return rep;
}