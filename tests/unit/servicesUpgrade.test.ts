/**
 * SERVICES & OPERATIONAL UPGRADE TEST SUITE — P3 (DHCP reservation) + P6 (NTP).
 *
 * P3 — DHCP reservation/fixed-address:
 *  - Klien dengan MAC terdaftar di pool.reservations selalu mendapat IP tetap.
 *  - Klien lain tidak bisa mengambil IP reservasi (dinamis melewatinya, request
 *    ke IP reservasi orang lain → NAK).
 *  - Setelah release, klien reservasi kembali mendapat IP yang sama.
 *
 * P6 — NTP:
 *  - Vendor CLI (cisco/huawei/mikrotik/junos) menyimpan ntpServers.
 *  - "show clock" / "show ntp status" menampilkan sinkronisasi jujur.
 *
 * Bagian dari run_all_tests.mts — murni, tanpa DOM.
 */
import { NetworkSimulator } from '../../src/engine/net/core/NetworkSimulator';
import type { LabProjectLike } from '../../src/engine/net/core/Topology';
import { VendorDispatcher } from '../../packages/vendors/src/index';
import { syncDhcpPools } from '../../src/utils/cliSync';

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

function dhcpLab() {
  const sim = new NetworkSimulator();
  const project: LabProjectLike = {
    nodes: [node('srv', 'SRV', 'router', 1, 's1a'), node('pc1', 'PC1', 'pc', 1, 's1b'), node('pc2', 'PC2', 'pc', 1, 's1c')],
    edges: [edge('e1', 'srv', 'ether1', 'pc1', 'ether1'), edge('e2', 'srv', 'ether1', 'pc2', 'ether1')],
  };
  sim.syncTopology(project);
  sim.applyNodeConfig('srv', { ether1: '10.0.1.1/24' }, []);
  const pc1Mac = sim.getDevice('pc1')!.getIfaceByName('ether1')!.mac;
  const pc2Mac = sim.getDevice('pc2')!.getIfaceByName('ether1')!.mac;
  return { sim, pc1Mac, pc2Mac };
}

export function runServicesUpgradeTests(): Report {
  // ── S1. Reservasi MAC → IP tetap ──
  {
    const { sim, pc1Mac } = dhcpLab();
    sim.setDhcpPools({
      srv: [
        {
          name: 'R1',
          network: '10.0.1.0/24',
          range: '10.0.1.100-10.0.1.200',
          iface: 'ether1',
          gateway: '10.0.1.1',
          reservations: [{ mac: pc1Mac, ip: '10.0.1.50' }],
        },
      ],
    });
    const lease = sim.grantDhcpLease('pc1', 'ether1');
    check('S1 pc1 (MAC terdaftar) mendapat IP reservasi 10.0.1.50', lease?.ip === '10.0.1.50', JSON.stringify(lease));
  }

  // ── S2. Klien lain tidak mendapat IP reservasi ──
  {
    const { sim, pc1Mac, pc2Mac } = dhcpLab();
    sim.setDhcpPools({
      srv: [
        {
          name: 'R1',
          network: '10.0.1.0/24',
          range: '10.0.1.100-10.0.1.200',
          iface: 'ether1',
          gateway: '10.0.1.1',
          reservations: [{ mac: pc1Mac, ip: '10.0.1.50' }],
        },
      ],
    });
    const lease2 = sim.grantDhcpLease('pc2', 'ether1');
    check('S2 pc2 (MAC lain) dapat IP dinamis, bukan 10.0.1.50', !!lease2 && lease2.ip !== '10.0.1.50' && lease2.ip !== pc2Mac, JSON.stringify(lease2));
  }

  // ── S3. Request IP reservasi orang lain → NAK ──
  // Alur nyata: klien hanya meminta IP yang ditawarkan server. Agar jalur NAK
  // (reservedForOther) teruji secara jujur, klien harus MEMEGANG IP itu dulu:
  //   1) sebelum reservasi ada, pc2 lease 10.0.1.50 (range 50-50);
  //   2) reservasi untuk pc1 ditambahkan → 10.0.1.50 kini milik pc1;
  //   3) pc2 renew lease lamanya (requestedIp=10.0.1.50) → server NAK
  //      (reserved) → binding lama dibuang dan klien meninggalkan alamat;
  //   4) pc1 mengambil reservasinya (10.0.1.50).
  {
    const { sim, pc1Mac } = dhcpLab();
    sim.setDhcpPools({
      srv: [
        {
          name: 'R1',
          network: '10.0.1.0/24',
          range: '10.0.1.50-10.0.1.50',
          iface: 'ether1',
          gateway: '10.0.1.1',
        },
      ],
    });
    const lease2 = sim.grantDhcpLease('pc2', 'ether1');
    check('S3 pc2 dulu memegang 10.0.1.50 (sebelum reservasi)', lease2?.ip === '10.0.1.50', JSON.stringify(lease2));
    sim.setDhcpPools({
      srv: [
        {
          name: 'R1',
          network: '10.0.1.0/24',
          range: '10.0.1.100-10.0.1.200',
          iface: 'ether1',
          gateway: '10.0.1.1',
          reservations: [{ mac: pc1Mac, ip: '10.0.1.50' }],
        },
      ],
    });
    sim.simulateDhcpRenew('pc2', 'ether1');
    check(
      'S3 ada event NAK reserved',
      sim.eventHistory.some((e) => e.type === 'DHCP_REQUEST' && e.data?.nak === true && e.data?.reserved === true),
      ''
    );
    check('S3 pc2 meninggalkan alamat setelah NAK', sim.getDevice('pc2')?.getIpAddress() === null, '');
    const lease = sim.grantDhcpLease('pc1', 'ether1');
    check('S3 pc1 mengambil reservasinya', lease?.ip === '10.0.1.50', JSON.stringify(lease));
  }

  // ── S4. Release → reserve lagi: IP tetap sama ──
  {
    const { sim, pc1Mac } = dhcpLab();
    sim.setDhcpPools({
      srv: [
        {
          name: 'R1',
          network: '10.0.1.0/24',
          range: '10.0.1.100-10.0.1.200',
          iface: 'ether1',
          gateway: '10.0.1.1',
          reservations: [{ mac: pc1Mac, ip: '10.0.1.50' }],
        },
      ],
    });
    const lease = sim.grantDhcpLease('pc1', 'ether1');
    check('S4 pertama 10.0.1.50', lease?.ip === '10.0.1.50', JSON.stringify(lease));
    sim.simulateDhcpRelease('pc1', 'ether1');
    const lease2 = sim.grantDhcpLease('pc1', 'ether1');
    check('S4 setelah release → kembali 10.0.1.50', lease2?.ip === '10.0.1.50', JSON.stringify(lease2));
  }

  // ── S5. syncDhcpPools menyalurkan reservasi vendor (mikrotik) ke engine ──
  {
    const dis = new VendorDispatcher();
    const ctx = { nodeId: 'srv', name: 'SRV', ports: [{ id: 'ether1', name: 'ether1', status: 'up' }] };
    dis.dispatch('mikrotik', '/ip pool add name=pool1 ranges=10.0.1.100-10.0.1.200', ctx);
    dis.dispatch('mikrotik', '/ip dhcp-server add name=dhcp1 interface=ether1 address-pool=pool1', ctx);
    dis.dispatch('mikrotik', '/ip dhcp-server lease add address=10.0.1.50 mac-address=AA:BB:CC:DD:EE:FF', ctx);
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [node('srv', 'SRV', 'router', 1, 's5a'), node('pc1', 'PC1', 'pc', 1, 's5b')],
      edges: [edge('e1', 'srv', 'ether1', 'pc1', 'ether1')],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('srv', { ether1: '10.0.1.1/24' }, []);
    syncDhcpPools(sim, dis);
    const stats = sim.getDeviceStats('srv');
    check('S5 engine menerima reservasi dari CLI mikrotik', (stats as unknown as { dhcpPools?: { reservations?: unknown[] }[] }).dhcpPools?.some((p) => (p.reservations || []).length > 0), JSON.stringify((stats as unknown as { dhcpPools?: unknown[] }).dhcpPools));

    const pc1Mac = sim.getDevice('pc1')!.getIfaceByName('ether1')!.mac;
    const lease = sim.grantDhcpLease('pc1', 'ether1');
    check('S5 klien mac lain dapat dinamis (bukan 10.0.1.50)', !!lease && lease.ip !== '10.0.1.50', JSON.stringify(lease));
  }

  // ── S6. Cisco pool reservation via CLI → engine grant reservasi ──
  {
    const dis = new VendorDispatcher();
    const ctx = { nodeId: 'srv', name: 'SRV', ports: [{ id: 'ether1', name: 'ether1', status: 'up' }] };
    dis.dispatch('cisco_ios', 'ip dhcp pool R1', ctx);
    dis.dispatch('cisco_ios', 'network 10.0.1.0 255.255.255.0', ctx);
    dis.dispatch('cisco_ios', 'default-router 10.0.1.1', ctx);
    dis.dispatch('cisco_ios', 'host 10.0.1.50 255.255.255.0', ctx);
    dis.dispatch('cisco_ios', 'hardware-address 0050.7966.6677', ctx);
    // Memory dikunci per nodeId (ctx.nodeId='srv') — sama seperti S5.
    const mem = dis.getNodeMemory('srv') as { dhcpPools: { reservations?: { mac: string; ip: string }[] }[] };
    check('S6 cisco pool mencatat reservasi', mem.dhcpPools.some((p) => (p.reservations || []).some((r) => r.ip === '10.0.1.50')), JSON.stringify(mem.dhcpPools));
  }

  return rep;
}