// PHASE 1 — Core correctness conformance tests.
// Cakupan: validasi IPv6 strict, validator rute, penolakan CLI tanpa mutasi
// state, parseCidr ketat (mask kontigu), determinism (xid DHCP & output ping).
import { isValidIpv6, isValidIpv4RouteDst, isValidIpv6RouteDst, isValidRouteGateway, isContiguousMask } from '../../packages/vendors/src/common/ip';
import { VendorDispatcher } from '../../packages/vendors/src/index';
import { parseCidr } from '../../src/engine/net/core/ip';
import { nextDhcpXid, fnv1a32 } from '../../src/engine/net/core/deterministic';

interface Report {
  passed: number;
  failed: number;
  fails: string[];
}

const rep: Report = { passed: 0, failed: 0, fails: [] };
function check(name: string, cond: boolean, detail = ''): boolean {
  if (cond) rep.passed++;
  else {
    rep.failed++;
    rep.fails.push(`${name}${detail ? ' :: ' + detail : ''}`);
  }
  return cond;
}

export function runPhase1CoreTests(): Report {
  console.log('\n== P1. Validasi IPv6 strict ==');
  const v6ok = ['2001:db8::1', 'fe80::1', '2001:db8:1::10', '2001:db8:0000:0000:0000:0000:0002:0001', '::', '::1', '[2001:db8::1]', 'fe80::1%eth0'];
  for (const a of v6ok) check(`valid ${a}`, isValidIpv6(a));
  const v6bad = ['1::2::3', '2001:db8:::1', '1:2:3:4:5:6:7:8:9', '1:2:3:4:5:6:7:8::', 'g::1', ':1:2', '1:2:', '12345::1', '192.168.1.1', '', '2001db8::1'];
  for (const a of v6bad) check(`invalid ${JSON.stringify(a)}`, !isValidIpv6(a));

  console.log('\n== P1-2. Validator dst/gateway rute ==');
  const dstOk = ['10.0.0.0/24', '0.0.0.0/0', '10.0.0.0 255.255.0.0', '10.0.0.0 0.0.0.0', '10.10.10.1/31', '10.10.10.1'];
  for (const d of dstOk) check(`dst valid ${d}`, isValidIpv4RouteDst(d));
  const dstBad = ['300.1.2.3/24', '10.0.0', '10.10.10.1.1', '10.0.0.0 255.255.0.1', '10.0.0.0 255.0.255.0', 'foo/24', ''];
  for (const d of dstBad) check(`dst invalid ${JSON.stringify(d)}`, !isValidIpv4RouteDst(d));
  const v6dstOk = ['2001:db8::/64', '::/0', '2001:db8:1::/48'];
  for (const d of v6dstOk) check(`v6dst valid ${d}`, isValidIpv6RouteDst(d));
  const v6dstBad = ['2001:db8::', '1::2::3/64', '2001:db8::/129', '/64'];
  for (const d of v6dstBad) check(`v6dst invalid ${JSON.stringify(d)}`, !isValidIpv6RouteDst(d));
  check('gw v4 valid', isValidRouteGateway('10.0.0.1'));
  check('gw v6 valid', isValidRouteGateway('fe80::1'));
  check('gw invalid', !isValidRouteGateway('ether1') && !isValidRouteGateway('999.0.0.1') && !isValidRouteGateway(''));
  check('mask kontigu 255.255.255.252', isContiguousMask('255.255.255.252'));
  check('mask non-kontigu 255.255.0.1', !isContiguousMask('255.255.0.1'));

  console.log('\n== P1-3. CLI menolak rute invalid TANPA mutasi state ==');
  const d = new VendorDispatcher();
  function routeProbe(vendor: string, cmd: string): { out: string; count: number; last?: any } {
    const id = `p1_${vendor}`;
    const ctx: any = {
      nodeId: id,
      name: `${vendor}-r`,
      ports: ['p1', 'p2'].map((n, i) => ({ id: n, name: n, status: i === 0 ? 'up' : 'down' })),
      pingSimulator: undefined,
    };
    // seed satu rute valid sebagai pembanding
    seedValid(vendor, ctx, id);
    const before = (d.getNodeMemory(id).routes || []).length;
    const out = String(d.dispatch(vendor, cmd, ctx));
    const mem: any = d.getNodeMemory(id);
    return { out, count: (mem.routes || []).length - before, last: (mem.routes || []).slice(-1)[0] };
  }
  function seedValid(vendor: string, ctx: any, id: string) {
    const seeds: Record<string, string> = {
      mikrotik: '/ip route add dst-address=10.5.0.0/16 gateway=10.0.0.1',
      cisco_ios: 'ip route 10.5.0.0 255.255.0.0 10.0.0.1',
      cisco_nxos: 'ip route 10.5.0.0/16 10.0.0.1',
      juniper: 'set routing-options static route 10.5.0.0/16 next-hop 10.0.0.1',
      vyos: 'set protocols static route 10.5.0.0/16 next-hop 10.0.0.1',
      ubiquiti: 'set protocols static route 10.5.0.0/16 next-hop 10.0.0.1',
      huawei: 'ip route-static 10.5.0.0 16 10.0.0.1',
      linux: 'ip route add 10.5.0.0/16 via 10.0.0.1',
    };
    d.dispatch(vendor, seeds[vendor], ctx);
  }
  const rejects: Array<[string, string]> = [
    ['mikrotik', '/ip route add dst-address=999.1.1.1/24 gateway=10.0.0.9'],
    ['mikrotik', '/ip route add dst-address=10.99.0.0/24 gateway=foobar'],
    ['cisco_ios', 'ip route 10.20.0.0 255.255.0.1 192.168.1.254'],
    ['cisco_ios', 'ip route 300.20.0.0 255.255.0.0 192.168.1.254'],
    ['cisco_nxos', 'ip route 300.99.0.0/24 10.0.1.2'],
    ['juniper', 'set routing-options static route 10.0.0.0/24 next-hop not-an-ip'],
    ['vyos', 'set protocols static route 999.0.0.0/24 next-hop 10.0.0.1'],
    ['huawei', 'ip route-static 10.0.0.0 99 192.168.1.254'],
    ['linux', 'ip route add 10.0.0.0/24 via 999.1.1.1'],
  ];
  for (const [vendor, cmd] of rejects) {
    const r = routeProbe(vendor, cmd);
    check(`${vendor} reject: ${cmd}`, r.count === 0 && /error|invalid|Unrecognized|bad argument/i.test(r.out), `out=${JSON.stringify(r.out.slice(0, 80))} delta=${r.count}`);
  }
  // positive control: seed tetap masuk & rute valid baru tersimpan
  const okProbe = routeProbe('cisco_ios', 'ip route 10.7.0.0 255.255.0.0 10.0.0.7');
  check('cisco_ios rute valid tetap tersimpan', okProbe.count === 1);

  console.log('\n== P1-4. IPv6 route CLI ditolak tanpa mutasi routes6 ==');
  {
    const id = 'p1_v6';
    const ctx: any = { nodeId: id, name: 'v6-r', ports: [{ id: 'p1', name: 'p1', status: 'up' }, { id: 'p2', name: 'p2', status: 'down' }], pingSimulator: undefined };
    const bad: Array<[string, string]> = [
      ['cisco_ios', 'ipv6 route 1::2::3/64 fe80::1'],
      ['mikrotik', '/ipv6 route add dst-address=1::2::3/64 gateway=fe80::2'],
      ['linux', 'ip -6 route add 1::2::3/64 via fe80::3'],
    ];
    for (const [vendor, cmd] of bad) {
      d.dispatch(vendor, cmd, ctx);
      const n = ((d.getNodeMemory(id) as any).routes6 || []).length;
      check(`${vendor} v6-route invalid ditolak`, n === 0, `routes6=${n}`);
    }
    d.dispatch('cisco_ios', 'ipv6 route 2001:db8:2::/64 2001:db8:ff::2', ctx);
    check('cisco_ios v6-route valid tersimpan', ((d.getNodeMemory(id) as any).routes6 || []).length === 1);
  }

  console.log('\n== P1-5. parseCidr engine ketat ==');
  check('mask dotted valid', parseCidr('10.10.10.1 255.255.0.0')?.prefix === 16);
  check('mask non-kontigu → null', parseCidr('10.10.10.1 255.255.0.1') === null);
  check('/31 valid', parseCidr('10.10.10.1/31')?.prefix === 31);
  check('/32 valid', parseCidr('10.10.10.1/32')?.prefix === 32);
  check("prefix sampah '24x' → null", parseCidr('10.10.10.1/24x') === null);
  check('IP sampah 999 → null', parseCidr('999.1.1.1/24') === null);

  console.log('\n== P1-6. Determinism: DHCP xid & ping error output ==');
  {
    class Owner {}
    const o1 = new Owner();
    const o2 = new Owner();
    const x1a = nextDhcpXid('dev-a', 'eth0', o1);
    const x1b = nextDhcpXid('dev-a', 'eth0', o1);
    const x2a = nextDhcpXid('dev-a', 'eth0', new Owner());
    check('xid sama utama run identik', x1a === x2a && x1a > 0);
    check('xid beda antar transaksi', x1b !== x1a);
    check('fnv stabil', fnv1a32('abc') === fnv1a32('abc') && fnv1a32('abc') !== fnv1a32('abd'));
  }

  console.log('\n== P1-7. Alamat interface & rute UCI ditolak tanpa mutasi state ==');
  {
    function addrProbe(vendor: string, cmds: string[], fingerprintOf: (mem: any) => unknown): { out: string; changed: boolean } {
      const id = `p1a_${vendor}`;
      const ctx: any = { nodeId: id, name: `${vendor}-a`, ports: [{ id: 'p1', name: 'p1', status: 'up' }, { id: 'p2', name: 'p2', status: 'down' }], pingSimulator: undefined };
      const mem: any = d.getNodeMemory(id);
      const before = JSON.stringify(fingerprintOf(mem));
      const outs: string[] = [];
      for (const c of cmds) outs.push(String(d.dispatch(vendor, c, ctx)));
      return { out: outs.join('\n'), changed: JSON.stringify(fingerprintOf(d.getNodeMemory(id))) !== before };
    }
    const ips = (m: any) => m.configuredIps;
    const cases: Array<[string, string[], (m: any) => unknown]> = [
      ['juniper', ['set interfaces p1 unit 0 family inet address 10.0.0.999/24'], ips],
      ['vyos', ['set interfaces ethernet p1 address 10.0.0.999/24'], ips],
      ['ubiquiti', ['set interfaces ethernet p1 address 300.1.1.1/24'], ips],
      ['linux', ['ip addr add 10.0.0.999/24 dev p1'], ips],
      // uci route: netmask tidak kontigu → ditolak saat set, rute tak dimaterialkan
      ['openwrt', ['uci set network.route9.target=10.9.9.0', 'uci set network.route9.netmask=255.255.0.255', 'uci set network.route9.gateway=192.168.88.1', 'uci commit network'], (m) => m.routes],
    ];
    for (const [vendor, cmds, fp] of cases) {
      const r = addrProbe(vendor, cmds, fp);
      check(`${vendor} reject alamat/rute invalid`, /error|invalid/i.test(r.out) && !r.changed, `out=${JSON.stringify(r.out.slice(0, 80))} changed=${r.changed}`);
    }
    // Positive control: nilai valid tetap diterima.
    const okV = addrProbe('vyos', ['set interfaces ethernet p1 address 10.0.5.1/24'], ips);
    check('vyos alamat valid tersimpan', !okV.changed === false && String((d.getNodeMemory('p1a_vyos') as any).configuredIps.p1 || '').startsWith('10.0.5.1'));
    // openwrt positive: rute lengkap & kontigu tersimpan sebagai CIDR.
    const okOw = addrProbe('openwrt', ['uci set network.route8.target=10.8.0.0', 'uci set network.route8.netmask=255.255.255.0', 'uci set network.route8.gateway=192.168.88.254', 'uci commit network'], (m) => m.routes);
    const owRoute = ((d.getNodeMemory('p1a_openwrt') as any).routes || []).find((r: any) => r.section === 'route8');
    check('openwrt rute valid → CIDR', okOw.changed && owRoute?.dst === '10.8.0.0/24' && owRoute?.gateway === '192.168.88.254');
  }

  return rep;
}
