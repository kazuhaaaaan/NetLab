/**
 * PROTOCOL FIDELITY TEST SUITE — Prompt 4 (network protocol fidelity).
 *
 * Menguji perbaikan fidelity engine src/engine/net:
 *  - TCP/L4: RST saat port tertutup, teardown FIN (FIN-ACK + sesi dihapus),
 *    record koneksi client & server-side (netstat).
 *  - ICMPv6: error dest-unreachable type 1 untuk no-route v6 + traceroute6.
 *  - DHCP: renew (T1) & release (IP kembali ke pool, event DHCP_RELEASE).
 *  - DNS: chain CNAME + cache klien (TTL).
 *  - Firewall: action reject (balas RST/ICMP, reason 'rejected') + parse
 *    MikroTik action=reject.
 *  - SNMP: ifTable counters (ifOutOctets/ifOutUcastPkts) + sysUpTime berdetak.
 *  - EIGRP: DUAL educational — neighbor, successor, feasible successor,
 *    feasibility condition, state passive/active, prune rute saat link putus.
 *
 * Bagian dari run_all_tests.mts — murni, tanpa DOM.
 */
import { NetworkSimulator } from '../../src/engine/net/core/NetworkSimulator';
import type { LabProjectLike } from '../../src/engine/net/core/Topology';
import { VendorDispatcher } from '../../packages/vendors/src/index';
import { syncNodeToEngine } from '../../src/utils/cliSync';

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
    vendor: kind === 'pc' ? 'linux' : kind === 'server' ? 'linux' : kind === 'switch' ? 'cisco_ios' : 'cisco_ios',
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

export function runProtocolFidelityTests(): Report {
  // ── F1. TCP/L4: RST saat refused, FIN teardown, netstat client+server ──
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [node('pc1', 'PC1', 'pc', 1, 'f1a'), node('r1', 'R1', 'router', 2, 'f1b')],
      edges: [edge('e1', 'pc1', 'ether1', 'r1', 'ether1')],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('pc1', { ether1: '10.0.1.10/24' }, []);
    sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24' }, []);
    sim.setWebServer('r1', { enabled: true, port: 80, content: 'Hello NetLab' });

    const ok = sim.simulateTcpConnect('pc1', '10.0.1.1', 80);
    check('F1 TCP handshake sukses', ok.ok && ok.status === 200, JSON.stringify(ok));
    const clientConns = sim.getTcpConnections('pc1');
    const serverConns = sim.getTcpConnections('r1');
    check(
      'F1 koneksi tercatat client-side (ESTABLISHED)',
      clientConns.some((c) => c.remoteIp === '10.0.1.1' && c.remotePort === 80 && c.state === 'ESTABLISHED'),
      JSON.stringify(clientConns)
    );
    check(
      'F1 koneksi tercatat server-side (ESTABLISHED)',
      serverConns.some((c) => c.localIp === '10.0.1.1' && c.localPort === 80 && c.state === 'ESTABLISHED'),
      JSON.stringify(serverConns)
    );

    const refused = sim.simulateTcpConnect('pc1', '10.0.1.1', 22);
    check('F1 TCP port tertutup → refused', !refused.ok && refused.reason === 'refused', JSON.stringify(refused));
    check(
      'F1 refused memicu RST (event TCP_RST)',
      sim.eventHistory.some((e) => e.type === 'TCP_RST' && e.data?.port === 22),
      'TCP_RST tidak ditemukan'
    );

    const close = sim.simulateTcpClose('pc1', '10.0.1.1', 80);
    check('F1 teardown FIN → ok (tcp-closed)', close.ok && close.reason === 'tcp-closed', JSON.stringify(close));
    check(
      'F1 server menghapus sesi setelah FIN (tidak ada ESTABLISHED)',
      !sim.getTcpConnections('r1').some((c) => c.localIp === '10.0.1.1' && c.localPort === 80 && c.state === 'ESTABLISHED'),
      JSON.stringify(sim.getTcpConnections('r1'))
    );
    check('F1 event TCP_FIN tercatat', sim.eventHistory.some((e) => e.type === 'TCP_FIN'), 'TCP_FIN tidak ditemukan');
  }

  // ── F2. IPv6: traceroute6 multi-hop + ICMPv6 dest-unreachable no-route ──
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        node('pc1', 'PC1', 'pc', 1, 'f2a'),
        node('r1', 'R1', 'router', 2, 'f2b'),
        node('r2', 'R2', 'router', 2, 'f2c'),
        node('svr', 'SVR', 'server', 1, 'f2d'),
      ],
      edges: [
        edge('e1', 'pc1', 'ether1', 'r1', 'ether1'),
        edge('e2', 'r1', 'ether2', 'r2', 'ether1'),
        edge('e3', 'r2', 'ether2', 'svr', 'ether1'),
      ],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig6('pc1', { ether1: '2001:db8:1::10/64' }, [{ dst: '::/0', gateway: '2001:db8:1::1' }]);
    sim.applyNodeConfig6('r1', { ether1: '2001:db8:1::1/64', ether2: '2001:db8:2::1/64' }, [
      { dst: '2001:db8:3::/64', gateway: '2001:db8:2::2' },
    ]);
    sim.applyNodeConfig6('r2', { ether1: '2001:db8:2::2/64', ether2: '2001:db8:3::1/64' }, [
      { dst: '2001:db8:1::/64', gateway: '2001:db8:2::1' },
    ]);
    sim.applyNodeConfig6('svr', { ether1: '2001:db8:3::10/64' }, [{ dst: '::/0', gateway: '2001:db8:3::1' }]);

    const trace6 = sim.simulateTraceroute('pc1', '2001:db8:3::10');
    check(
      'F2 traceroute6 multi-hop sukses (2 hop + dst)',
      trace6.ok && trace6.hops.length >= 3 && trace6.hops[trace6.hops.length - 1].ip === '2001:db8:3::10',
      JSON.stringify(trace6)
    );

    const noRoute = sim.simulatePing6('pc1', '2001:db8:99::1');
    check('F2 ping6 ke subnet tanpa rute gagal', !noRoute.success, JSON.stringify(noRoute));
    check(
      'F2 ICMP_ERROR no-route-v6 dipancarkan',
      sim.eventHistory.some((e) => e.type === 'ICMP_ERROR' && e.data?.reason === 'no-route-v6'),
      'ICMP_ERROR no-route-v6 tidak ditemukan'
    );
  }

  // ── F3. DHCP: renew (T1) & release ────────────────────────────────────
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [node('pc1', 'PC1', 'pc', 1, 'f3a'), node('pc2', 'PC2', 'pc', 1, 'f3b'), node('r1', 'R1', 'router', 2, 'f3c')],
      edges: [
        edge('e1', 'pc1', 'ether1', 'r1', 'ether1'),
        edge('e2', 'pc2', 'ether1', 'r1', 'ether2'),
      ],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('r1', { ether1: '192.168.5.1/24' }, []);
    sim.setDhcpPools({ r1: [{ name: 'pool1', network: '192.168.5.0/24', range: '192.168.5.100-192.168.5.150' }] });

    const lease = sim.grantDhcpLease('pc1');
    check('F3 DHCP initial lease', !!lease && lease.ip === '192.168.5.100', JSON.stringify(lease));
    const renew = sim.simulateDhcpRenew('pc1');
    check('F3 renew mempertahankan IP yang sama', !!renew && renew.ip === '192.168.5.100', JSON.stringify(renew));
    check(
      'F3 renew tercatat (DHCP_REQUEST renew)',
      sim.eventHistory.some((e) => e.type === 'DHCP_REQUEST' && e.data?.renew === true),
      'DHCP_REQUEST renew tidak ditemukan'
    );

    const released = sim.simulateDhcpRelease('pc1');
    check('F3 release menghapus lease', released, 'lease masih ada');
    check('F3 event DHCP_RELEASE tercatat', sim.eventHistory.some((e) => e.type === 'DHCP_RELEASE'), 'DHCP_RELEASE tidak ditemukan');
    const lease2 = sim.grantDhcpLease('pc2');
    // Release mengembalikan alamat ke pool (RFC 2131 §3.4: klien meninggalkan
    // alamat) → pc2 mendapat IP yang BARU SAJA dilepas (192.168.5.100), bukan
    // .101. Ekspektasi lama (.101) meng-encode perilaku keliru: klien yang
    // melepas alamat masih memegangnya sehingga IP tak pernah kembali ke pool.
    check('F3 klien lain mendapat alamat valid setelah release', !!lease2 && lease2.ip === '192.168.5.100', JSON.stringify(lease2));
  }

  // ── F4. DNS: chain CNAME + cache klien ────────────────────────────────
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [node('pc1', 'PC1', 'pc', 1, 'f4a'), node('r1', 'R1', 'router', 2, 'f4b')],
      edges: [edge('e1', 'pc1', 'ether1', 'r1', 'ether1')],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('pc1', { ether1: '10.0.1.10/24' }, []);
    sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24' }, []);
    sim.setDnsServers('pc1', ['10.0.1.1']);
    sim.setDnsRecords('r1', [
      { name: 'web.lab', address: 'alias.lab' },
      { name: 'alias.lab', address: '10.0.1.20' },
    ]);

    const viaChain = sim.resolveHostname('pc1', 'web.lab');
    check('F4 CNAME chain ter-resolve ke IP final', viaChain.resolved === '10.0.1.20', JSON.stringify(viaChain));
    const cached = sim.resolveHostname('pc1', 'web.lab');
    check('F4 panggilan kedua memakai cache klien', cached.resolved === '10.0.1.20' && cached.server === 'cache', JSON.stringify(cached));
    const nx = sim.resolveHostname('pc1', 'nope.lab');
    check('F4 nama tanpa record → NXDOMAIN', !nx.resolved && nx.nxdomain === true, JSON.stringify(nx));
  }

  // ── F5. Firewall reject: balas RST/ICMP + reason 'rejected' + parse CLI ──
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [node('pc1', 'PC1', 'pc', 1, 'f5a'), node('r1', 'R1', 'router', 2, 'f5b'), node('svr', 'SVR', 'server', 1, 'f5c')],
      edges: [
        edge('e1', 'pc1', 'ether1', 'r1', 'ether1'),
        edge('e2', 'r1', 'ether2', 'svr', 'ether1'),
      ],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('pc1', { ether1: '10.0.1.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
    sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24', ether2: '10.0.2.1/24' }, []);
    sim.applyNodeConfig('svr', { ether1: '10.0.2.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.2.1' }]);
    sim.setAcls('r1', [{ action: 'reject', proto: 'icmp', src: '10.0.1.0/24', dst: '10.0.2.0/24' }]);

    const ping = sim.simulatePing('pc1', '10.0.2.10');
    check('F5 ping diblokir reject → reason rejected', !ping.success && ping.reason === 'rejected', JSON.stringify(ping));
    check(
      'F5 event FIREWALL_REJECT tercatat',
      sim.eventHistory.some((e) => e.type === 'FIREWALL_REJECT'),
      'FIREWALL_REJECT tidak ditemukan'
    );

    // parse CLI MikroTik: action=reject → rule action reject
    const dis = new VendorDispatcher();
    const ctx: any = {
      nodeId: 'r1',
      name: 'R1',
      ports: project.nodes[1].ports,
      node: sim.getDevice('r1'),
      dhcpClientGrant: () => null,
      pingSimulator: () => '',
    };
    const out = dis.dispatch('mikrotik', '/ip firewall filter add chain=input protocol=icmp action=reject', ctx);
    check('F5 CLI mikrotik action=reject diterima', typeof out === 'string' && out.includes('Error') === false, JSON.stringify(out));
    check(
      'F5 rule reject ter-parse (bukan deny)',
      (dis.getNodeMemory('r1').acls || []).some((r: any) => r.action === 'reject'),
      JSON.stringify(dis.getNodeMemory('r1').acls)
    );
  }

  // ── F6. SNMP: counters ifTable + sysUpTime berdetak ───────────────────
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [node('pc1', 'PC1', 'pc', 1, 'f6a'), node('r1', 'R1', 'router', 2, 'f6b')],
      edges: [edge('e1', 'pc1', 'ether1', 'r1', 'ether1')],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('pc1', { ether1: '10.0.1.10/24' }, []);
    sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24' }, []);
    sim.setSnmp('r1', { enabled: true, community: 'public' });

    sim.simulatePing('pc1', '10.0.1.1');
    const outPkts = sim.simulateSnmpQuery('pc1', '10.0.1.1', 'public', '1.3.6.1.2.1.2.2.1.15.1');
    const stripDot = (oid: string) => oid.replace(/^\./, '');
    const outVal = Number(outPkts.oids?.find((o) => stripDot(o.oid) === '1.3.6.1.2.1.2.2.1.15.1')?.value);
    check(
      'F6 ifOutUcastPkts mencerminkan trafik (reply echo terkirim)',
      outPkts.ok && outVal > 0,
      JSON.stringify(outPkts)
    );
    sim.time.advance(90_000);
    const uptime = sim.simulateSnmpQuery('pc1', '10.0.1.1', 'public', '1.3.6.1.2.1.1.3.0');
    const ticks = String(uptime.oids?.[0]?.value || '').match(/\((\d+)\)/)?.[1];
    check('F6 sysUpTime bertambah mengikuti waktu virtual', outPkts.ok && Number(ticks) >= 900, JSON.stringify(uptime));
  }

  // ── F7. EIGRP DUAL: neighbor, successor/FS, passive, prune saat fail ──
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [
        node('pc1', 'PC1', 'pc', 1, 'f7a'),
        node('r1', 'R1', 'router', 3, 'f7b'),
        node('r2', 'R2', 'router', 3, 'f7c'),
        node('r3', 'R3', 'router', 3, 'f7d'),
        node('svr', 'SVR', 'server', 1, 'f7e'),
      ],
      edges: [
        edge('e1', 'pc1', 'ether1', 'r1', 'ether1'),
        edge('e2', 'r1', 'ether2', 'r2', 'ether1'),
        edge('e3', 'r2', 'ether2', 'r3', 'ether1'),
        edge('e4', 'r1', 'ether3', 'r3', 'ether2'),
        edge('e5', 'r2', 'ether3', 'svr', 'ether1'),
      ],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('pc1', { ether1: '10.0.1.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
    sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24', ether2: '10.0.2.1/24', ether3: '10.0.4.1/24' }, []);
    sim.applyNodeConfig('r2', { ether1: '10.0.2.2/24', ether2: '10.0.3.2/24', ether3: '10.0.5.1/24' }, []);
    sim.applyNodeConfig('r3', { ether1: '10.0.3.3/24', ether2: '10.0.4.3/24' }, []);
    sim.applyNodeConfig('svr', { ether1: '10.0.5.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.5.1' }]);
    const eigrp = { enabled: true, asn: 100, networks: ['10.0.0.0/8'] };
    sim.setRouting('r1', { eigrp });
    sim.setRouting('r2', { eigrp });
    sim.setRouting('r3', { eigrp });
    sim.computeDynamicRoutes();

    const info1 = sim.getEigrpInfo('r1');
    check('F7 R1 melihat 2 tetangga EIGRP', info1.neighbors.length === 2, JSON.stringify(info1.neighbors));
    check('F7 tetangga punya ASN & interface', info1.neighbors.every((n) => n.asn === 100 && !!n.iface), JSON.stringify(info1.neighbors));

    // 10.0.3.0/24 punya 2 jalur (r1-r2-r3 & r1-r3) → successor + feasible successor.
    const dualEntry = info1.topology.find((t) => t.dst === '10.0.3.0/24');
    check(
      'F7 DUAL: successor + feasible successor (feasibility condition)',
      !!dualEntry && !!dualEntry.successor && dualEntry.feasibleSuccessors.length >= 1 && dualEntry.state === 'passive',
      JSON.stringify(dualEntry)
    );

    // 10.0.5.0/24 hanya lewat r2 → successor tunggal, tanpa FS (RD == FD).
    const singleEntry = info1.topology.find((t) => t.dst === '10.0.5.0/24');
    check(
      'F7 DUAL: jalur tunggal tanpa feasible successor',
      !!singleEntry && singleEntry.successor === 'r2' && singleEntry.feasibleSuccessors.length === 0,
      JSON.stringify(singleEntry)
    );

    const pingSvr = sim.simulatePing('pc1', '10.0.5.10');
    check('F7 routing EIGRP berfungsi (ping ke server lintas DUAL)', pingSvr.success, JSON.stringify(pingSvr));

    // Fail: r2 mati → rute 10.0.5.0/24 di-prune (successor hilang).
    sim.setNodePowered('r2', false);
    sim.computeDynamicRoutes();
    const info1b = sim.getEigrpInfo('r1');
    const afterFail = info1b.topology.find((t) => t.dst === '10.0.5.0/24');
    check(
      'F7 rute hilang saat successor mati (prune)',
      !afterFail || afterFail.successor !== 'r2' || afterFail.state === 'active',
      JSON.stringify(info1b.topology)
    );
    check('F7 ping ke server gagal setelah r2 mati', !sim.simulatePing('pc1', '10.0.5.10').success, 'masih sukses');
  }

  // ── F8. SLAAC E2E: Router Solicitation → Router Advertisement ─────────
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [node('pc1', 'PC1', 'pc', 1, 'f8a'), node('r1', 'R1', 'router', 2, 'f8b')],
      edges: [edge('e1', 'pc1', 'ether1', 'r1', 'ether1')],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('pc1', { ether1: '10.0.1.10/24' }, []);
    sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24' }, []);
    sim.applyNodeConfig6('r1', { ether1: '2001:db8:1::1/64' }, []);
    sim.setIpv6DhcpClients('pc1', ['ether1']);

    const pc1 = sim.getDevice('pc1');
    const before = pc1.getInterfaces().find((i) => i.name === 'ether1')?.ipv6;
    check('F8 host SLAAC belum punya alamat v6 sebelum RS', !before, JSON.stringify(before));

    const ping = sim.simulatePing6('pc1', '2001:db8:1::1');
    check('F8 ping6 ke router sukses setelah RS/RA (SLAAC E2E)', ping.success, JSON.stringify(ping));
    const raEvents = sim.eventHistory.filter((e) => e.type === 'NDP_RS' || e.type === 'NDP_RA');
    check(
      'F8 event RS & RA tercatat',
      raEvents.some((e) => e.type === 'NDP_RS') && raEvents.some((e) => e.type === 'NDP_RA'),
      JSON.stringify(raEvents)
    );
    const addr = pc1.getInterfaces().find((i) => i.name === 'ether1')?.ipv6;
    check('F8 alamat EUI-64 diterapkan dari prefix RA', !!addr && addr.prefix === 64 && addr.address.startsWith('2001:db8:1:'), JSON.stringify(addr));
    check('F8 default route v6 dari RA (gateway router)', pc1.ipv6StaticRoutes.some((r) => r.dst === '::/0' && r.gateway === '2001:db8:1::1'), JSON.stringify(pc1.ipv6StaticRoutes));
    check('F8 slaacAddresses tercatat', !!pc1.slaacAddresses['ether1'], JSON.stringify(pc1.slaacAddresses));
  }

  // ── F9. NAT dstnat E2E: CLI Cisco → engine → paket (NAT_REWRITE) ──────
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [node('pc1', 'PC1', 'pc', 1, 'f9a'), node('r1', 'R1', 'router', 2, 'f9b'), node('svr', 'SVR', 'server', 1, 'f9c')],
      edges: [edge('e1', 'pc1', 'ether1', 'r1', 'ether1'), edge('e2', 'r1', 'ether2', 'svr', 'ether1')],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('pc1', { ether1: '10.0.1.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
    sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24', ether2: '10.0.2.1/24' }, []);
    sim.applyNodeConfig('svr', { ether1: '10.0.2.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.2.1' }]);
    sim.setWebServer('svr', { enabled: true, port: 80, content: 'Inside Web' });

    // CLI Cisco: port-forward 10.0.1.1:8080 → 10.0.2.10:80.
    const dis = new VendorDispatcher();
    const ctx = {
      nodeId: 'r1',
      name: 'R1',
      ports: [{ id: 'ether1', name: 'ether1', status: 'up' as const }, { id: 'ether2', name: 'ether2', status: 'up' as const }],
      pingSimulator: undefined,
    };
    const out = dis.dispatch('cisco_ios', 'ip nat inside source static tcp 10.0.2.10 80 10.0.1.1 8080', ctx);
    check('F9 CLI Cisco dstnat diterima', !/% Error|% Invalid/i.test(out), out);
    syncNodeToEngine(sim, dis, 'r1');

    const conn = sim.simulateTcpConnect('pc1', '10.0.1.1', 8080);
    check('F9 dstnat: koneksi luar → dalam sukses (NAT_REWRITE)', conn.ok && conn.status === 200, JSON.stringify(conn));
    const natRewrites = sim.eventHistory.filter((e) => e.type === 'NAT_REWRITE');
    check('F9 event NAT_REWRITE tercatat', natRewrites.length >= 1, JSON.stringify(natRewrites));
    const svrConns = sim.getTcpConnections('svr');
    check(
      'F9 server dalam menerima koneksi di port asli (80)',
      svrConns.some((c) => c.localPort === 80 && c.remoteIp === '10.0.1.10'),
      JSON.stringify(svrConns)
    );
    const noRule = sim.simulateTcpConnect('pc1', '10.0.1.1', 9999);
    check('F9 port tanpa rule dstnat → refused', noRule.ok === false, JSON.stringify(noRule));
  }

  // ── F10. ACL NX-OS/Aruba E2E: deny ICMP via CLI → paket diblokir ──────
  {
    const sim = new NetworkSimulator();
    const project: LabProjectLike = {
      nodes: [node('pc1', 'PC1', 'pc', 1, 'f10a'), node('r1', 'R1', 'router', 2, 'f10b'), node('svr', 'SVR', 'server', 1, 'f10c')],
      edges: [edge('e1', 'pc1', 'ether1', 'r1', 'ether1'), edge('e2', 'r1', 'ether2', 'svr', 'ether1')],
    };
    sim.syncTopology(project);
    sim.applyNodeConfig('pc1', { ether1: '10.0.1.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.1.1' }]);
    sim.applyNodeConfig('r1', { ether1: '10.0.1.1/24', ether2: '10.0.2.1/24' }, []);
    sim.applyNodeConfig('svr', { ether1: '10.0.2.10/24' }, [{ dst: '0.0.0.0/0', gateway: '10.0.2.1' }]);

    const dis = new VendorDispatcher();
    const ctx = {
      nodeId: 'r1',
      name: 'R1',
      ports: [{ id: 'ether1', name: 'ether1', status: 'up' as const }, { id: 'ether2', name: 'ether2', status: 'up' as const }],
      pingSimulator: undefined,
    };
    const out = dis.dispatch('cisco_nxos', 'access-list 101 deny icmp 10.0.1.0 0.0.0.255 10.0.2.0 0.0.0.255', ctx);
    check('F10 CLI NX-OS ACL diterima', !/% Error|% Invalid/i.test(out), out);
    syncNodeToEngine(sim, dis, 'r1');

    const blocked = sim.simulatePing('pc1', '10.0.2.10');
    check('F10 deny ICMP: ping diblokir (reason blocked)', blocked.success === false && blocked.reason === 'blocked', JSON.stringify(blocked));
    check('F10 event FIREWALL_BLOCK tercatat', sim.eventHistory.some((e) => e.type === 'FIREWALL_BLOCK'), 'tidak ada');

    // Aruba: ACL deny ICMP arah balik juga teruji (parity vendor).
    const dis2 = new VendorDispatcher();
    const ctx2 = { ...ctx, nodeId: 'svr', name: 'SVR' };
    const out2 = dis2.dispatch('aruba', 'access-list 110 deny icmp 10.0.2.0 0.0.0.255 10.0.1.0 0.0.0.255', ctx2);
    check('F10 CLI Aruba ACL diterima', !/% Error|% Invalid/i.test(out2), out2);
  }

  console.log(`PROTOCOL FIDELITY: ${rep.passed} passed, ${rep.failed} failed`);
  return rep;
}