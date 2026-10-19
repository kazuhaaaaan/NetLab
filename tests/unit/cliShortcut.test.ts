/**
 * CLI SHORTCUT TEST SUITE — lapisan penyederhanaan CLI (qip/qroute).
 * Menguji src/engine/cli/shortcuts.normalizeCliShortcut + integrasi runCliCommand.
 * Bagian dari run_all_tests.mts.
 */
import { normalizeCliShortcut } from '../../src/engine/cli/shortcuts';
import { runCliCommand, createNetLabBridge } from '../../src/engine/index';

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

export function runCliShortcutTests(): Report {
  console.log('\n== C1. Shortcut qip (set IP) ==');
  {
    check('C1.1 linux qip', normalizeCliShortcut('linux', 'qip 10.0.0.1/24 eth0') === 'ip addr add 10.0.0.1/24 dev eth0', String(normalizeCliShortcut('linux', 'qip 10.0.0.1/24 eth0')));
    check('C1.2 mikrotik qip', normalizeCliShortcut('mikrotik', 'qip 10.0.0.1/24 ether1') === '/ip address add address=10.0.0.1/24 interface=ether1', String(normalizeCliShortcut('mikrotik', 'qip 10.0.0.1/24 ether1')));
    check('C1.3 openwrt → linux family', normalizeCliShortcut('openwrt', 'qip 10.0.0.1/24 br-lan') === 'ip addr add 10.0.0.1/24 dev br-lan');
  }

  console.log('\n== C2. Shortcut qroute ==');
  {
    check('C2.1 linux qroute via', normalizeCliShortcut('linux', 'qroute 10.1.0.0/24 via 10.0.0.1') === 'ip route add 10.1.0.0/24 via 10.0.0.1', String(normalizeCliShortcut('linux', 'qroute 10.1.0.0/24 via 10.0.0.1')));
    check('C2.2 linux qroute tanpa via', normalizeCliShortcut('linux', 'qroute 10.1.0.0/24 10.0.0.1') === 'ip route add 10.1.0.0/24 via 10.0.0.1');
    check('C2.3 mikrotik qroute', normalizeCliShortcut('mikrotik', 'qroute 10.1.0.0/24 via 10.0.0.1') === '/ip route add dst-address=10.1.0.0/24 gateway=10.0.0.1', String(normalizeCliShortcut('mikrotik', 'qroute 10.1.0.0/24 via 10.0.0.1')));
  }

  console.log('\n== C3. Bukan shortcut ⇒ null (perilaku lama) ==');
  {
    check('C3.1 perintah biasa null', normalizeCliShortcut('linux', 'ip addr show') === null);
    check('C3.2 vendor lain null', normalizeCliShortcut('cisco_ios', 'qip 10.0.0.1/24 eth0') === null);
    check('C3.3 argumen tak lengkap null', normalizeCliShortcut('linux', 'qip 10.0.0.1/24') === null);
    check('C3.4 qip ip invalid null', normalizeCliShortcut('linux', 'qip notanip eth0') === null);
    check('C3.5 qroute via salah null', normalizeCliShortcut('linux', 'qroute 10.1.0.0/24 thru 10.0.0.1') === null);
  }

  console.log('\n== C4. Integrasi runCliCommand (shortcut di-dispatch sebagai syntax asli) ==');
  {
    const seen: string[] = [];
    const bridge = createNetLabBridge(
      { dispatch: (_v, r) => { seen.push(r); return 'ok'; } },
      { simulatePing: () => ({ success: true, path: [], rttMs: 1 }), getDeviceStats: () => null }
    );
    const res = runCliCommand({ bridge, vendor: 'linux', nodeId: 'pc1', cmd: 'qip 10.0.0.1/24 eth0', context: {} });
    check('C4.1 dispatched = ip addr add', res.dispatched === 'ip addr add 10.0.0.1/24 dev eth0', res.dispatched);
    check('C4.2 engine menerima syntax asli', seen[0] === 'ip addr add 10.0.0.1/24 dev eth0', String(seen[0]));
    check('C4.3 output passthrough', res.output === 'ok');

    const res2 = runCliCommand({ bridge, vendor: 'mikrotik', nodeId: 'r1', cmd: 'qroute 10.1.0.0/24 via 10.0.0.1', context: {} });
    check('C4.4 mikrotik qroute dispatched', res2.dispatched === '/ip route add dst-address=10.1.0.0/24 gateway=10.0.0.1', res2.dispatched);
  }

  return rep;
}
