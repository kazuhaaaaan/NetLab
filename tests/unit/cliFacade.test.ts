/**
 * Face facade engine: lexer → parser → adapter vendor → DeviceState →
 * executor → resolver. Bagian dari run_all_tests.mts.
 *
 * Semua test murni (tidak menyentuh DOM / React render aktual); bridge memakai
 * tiruan agar deterministik.
 */
import { tokenize, splitWords, stripQuotes } from '../../src/engine/cli/lexer';
import { parseCommand, parseCommandObject } from '../../src/engine/cli/parser';
import type { Token } from '../../src/engine/cli/types';
import { parseMikroTik, SUPPORTED_COMMANDS as MIKROTIK_CMDS } from '../../src/engine/vendors/mikrotik';
import { parseCisco, SUPPORTED_COMMANDS as CISCO_CMDS } from '../../src/engine/vendors/cisco';
import {
  createDeviceState,
  setInterfaceIp,
  setInterfaceDisabled,
  setHostname,
  addRoute,
  setMode,
  generateMac,
  type DeviceState,
} from '../../src/engine/state/DeviceState';
import { topologyReducer, INITIAL_TOPOLOGY_STATE, type TopologyState } from '../../src/engine/state/TopologyState';
import { executeCommand, maskToPrefix } from '../../src/engine/state/executor';
import {
  resolvePing,
  resolveShowInterfaces,
  resolveShowRoutes,
  cidrContains,
  ipv4ToInt,
} from '../../src/engine/state/resolver';
import type { NetLabBridge } from '../../src/engine/state/bridge';
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

function tokenTypes(tokens: Token[]): string[] {
  return tokens.map((t) => t.type);
}

function tokenValues(tokens: Token[]): string[] {
  return tokens.map((t) => t.value).filter((v) => v !== '');
}

// ── Fake bridge deterministik ─────────────────────────────────────────
function fakeBridge(): NetLabBridge {
  return {
    dispatch: (vendor: string, raw: string) => `[${vendor}] ${raw} => ok`,
    simulatePing: (nodeId: string, dstIp: string) => ({
      success: dstIp === '10.0.0.2',
      path: dstIp === '10.0.0.2' ? ['R1', 'R2'] : ['R1'],
      reason: dstIp === '10.0.0.2' ? undefined : 'unreachable',
      rttMs: dstIp === '10.0.0.2' ? 12 : undefined,
    }),
    getDeviceStats: () => null,
  };
}

function mkMikroTikDevice(): DeviceState {
  return createDeviceState('r1', 'mikrotik', 'R1', ['ether1', 'ether2']);
}

function mkCiscoDevice(): DeviceState {
  return createDeviceState('r2', 'cisco', 'R2', ['GigabitEthernet0/0', 'GigabitEthernet0/1']);
}

function mkStateWithDevices(devices: DeviceState[]): TopologyState {
  return { devices: new Map(devices.map((d) => [d.id, d])), cables: [] };
}

export function runCliFacadeTest(): Report {
  // ── 1. Lexer ─────────────────────────────────────────────────────────
  {
    const tokens = tokenize('/ip address add address=192.168.1.1/24 interface=ether1');
    check('L1 spesifikasi: /ip address add address=…', JSON.stringify(tokenTypes(tokens)) ===
      '["SLASH","COMMAND","COMMAND","COMMAND","FLAG","EQUALS","VALUE","FLAG","EQUALS","VALUE"]', JSON.stringify(tokenTypes(tokens)));
    const firstValue = tokens.find((t) => t.type === 'VALUE');
    const lastValue = [...tokens].reverse().find((t) => t.type === 'VALUE');
    check('L1b nilai CIDR utuh (tidak dipecah oleh /)', firstValue?.value === '192.168.1.1/24', firstValue?.value);
    check('L1c params mikrotik benar', lastValue?.value === 'ether1', lastValue?.value);
    check('L2 path /ip/address kompak → SLASH + segmen COMMAND', tokenTypes(tokenize('/ip/address print')).join(',') === 'SLASH,COMMAND,COMMAND,COMMAND');
    check('L3 nilai berspasi dengan kutip', tokenValues(tokenize('/system identity set name="R1 Lab"'))[5] === 'R1 Lab');
    check('L4 flag --detail', tokenTypes(tokenize('show running-config --detail')).includes('FLAG'));
    check('L5 kata CISCO bermid-slash tidak dipecah', tokenValues(tokenize('interface GigabitEthernet0/0')).join(' ') === 'interface GigabitEthernet0/0');
    check('L6 splitWords menghormati kutip', splitWords('a "b c" d').join('|') === 'a|b c|d');
    check('L6b kata kutip penuh tanpa whitespace', splitWords('"x y"').join('|') === 'x y');
    check('L7 stripQuotes', stripQuotes('"x"') === 'x' && stripQuotes('abc') === 'abc');
  }

  // ── 2. Adapter MikroTik ──────────────────────────────────────────────
  {
    const cases: Array<[string, string, Record<string, string> | null]> = [
      ['/ip address add address=192.168.1.1/24 interface=ether1', 'ADD_IP_ADDRESS', { address: '192.168.1.1/24', interface: 'ether1' }],
      ['/ip address print', 'SHOW_IP_ADDRESSES', {}],
      ['/interface print', 'SHOW_INTERFACES', {}],
      ['/interface set name=ether1 disabled=yes', 'SET_INTERFACE_STATE', { interface: 'ether1', disabled: 'yes' }],
      ['/interface set name=ether1 disabled=no', 'SET_INTERFACE_STATE', { interface: 'ether1', disabled: 'no' }],
      ['/ip route add dst-address=192.168.2.0/24 gateway=192.168.1.2', 'ADD_ROUTE', { dst: '192.168.2.0/24', gateway: '192.168.1.2' }],
      ['/ping 192.168.1.1', 'PING', { target: '192.168.1.1' }],
      ['/system identity set name=R1', 'SET_HOSTNAME', { hostname: 'R1' }],
    ];
    for (const [raw, action, params] of cases) {
      const obj = parseCommand(raw, 'mikrotik');
      check(`M1 ${raw} → ${action}`, obj.action === action, `${obj.action}`);
      check(`M1b params ${raw}`, params
        ? Object.entries(params).every(([k, v]) => obj.params[k] === v)
        : Object.keys(obj.params).length === 0, JSON.stringify(obj.params));
      check(`M1c vendor=${obj.vendor}`, obj.vendor === 'mikrotik');
    }
    check('M2 perintah tak dikenal → null (adapter)', parseMikroTik(tokenize('/nothing print'), '/nothing print') === null);
    check('M3 SUPPORTED_COMMANDS terisi', MIKROTIK_CMDS.length >= 7);
  }

  // ── 3. Adapter Cisco ─────────────────────────────────────────────────
  {
    const cases: Array<[string, string, Record<string, string> | null]> = [
      ['enable', 'ENABLE_MODE', {}],
      ['configure terminal', 'CONFIG_MODE', {}],
      ['interface GigabitEthernet0/0', 'ENTER_INTERFACE', { interface: 'GigabitEthernet0/0' }],
      ['ip address 192.168.1.1 255.255.255.0', 'ADD_IP_ADDRESS', { address: '192.168.1.1', mask: '255.255.255.0' }],
      ['no shutdown', 'SET_INTERFACE_STATE', { disabled: 'no' }],
      ['show interfaces', 'SHOW_INTERFACES', {}],
      ['show ip interface brief', 'SHOW_INTERFACES', {}],
      ['show ip route', 'SHOW_ROUTES', {}],
      ['ping 10.0.0.1', 'PING', { target: '10.0.0.1' }],
      ['hostname R1', 'SET_HOSTNAME', { hostname: 'R1' }],
    ];
    for (const [raw, action, params] of cases) {
      const obj = parseCommand(raw, 'cisco');
      check(`C1 ${raw} → ${action}`, obj.action === action, `${obj.action}`);
      check(`C1b params ${raw}`, params
        ? Object.entries(params).every(([k, v]) => obj.params[k] === v)
        : Object.keys(obj.params).length === 0, JSON.stringify(obj.params));
      check(`C1c vendor=${obj.vendor}`, obj.vendor === 'cisco');
    }
    check('C2 tak dikenal → null (adapter)', parseCisco(tokenize('what is love'), 'what is love') === null);
    check('C3 UNKNOWN dari parser', parseCommand('whatever xyz 123', 'cisco').action === 'UNKNOWN');
    check('C4 vendor tak dikenal → vendor unknown', parseCommandObject([], '', 'juniper').vendor === 'unknown');
    check('C5 SUPPORTED_COMMANDS terisi', CISCO_CMDS.length >= 10);
  }

  // ── 4. DeviceState ───────────────────────────────────────────────────
  {
    const d = mkMikroTikDevice();
    check('D1 port map terbentuk', d.interfaces.length === 2 && d.interfaces[0].name === 'ether1');
    check('D2 MAC deterministik', generateMac('r1:ether1') === generateMac('r1:ether1') && generateMac('r1:ether1') !== generateMac('r1:ether2'));
    const withIp = setInterfaceIp(d, 'ether1', '192.168.1.1/24');
    check('D3 setInterfaceIp', withIp.interfaces[0].ip === '192.168.1.1' && withIp.interfaces[0].prefix === 24);
    check('D3b immutabel', d.interfaces[0].ip === undefined);
    const noIp = setInterfaceIp(d, 'ether1', '');
    check('D4 hapus ip saat kosong', noIp.interfaces[0].ip === undefined);
    const down = setInterfaceDisabled(d, 'ether1', true);
    check('D5 disabled', down.interfaces[0].disabled === true && d.interfaces[0].disabled === false);
    const named = setHostname(d, 'Router-1');
    check('D6 hostname', named.hostname === 'Router-1' && d.hostname === 'R1');
    const routed = addRoute(d, { dst: '192.168.2.0/24', gateway: '192.168.1.2', interface: 'ether1', type: 'static' });
    const routedDup = addRoute(routed, { dst: '192.168.2.0/24', gateway: '192.168.1.9', interface: 'ether2', type: 'static' });
    check('D7 addRoute + dedupe', routed.routes.length === 1 && routedDup.routes.length === 1);
    const ctx = setMode(d, 'interface', 'ether2');
    check('D8 setMode', ctx.mode === 'interface' && ctx.activeInterface === 'ether2');
  }

  // ── 5. Executor ──────────────────────────────────────────────────────
  {
    check('E1 maskToPrefix /24', maskToPrefix('255.255.255.0') === 24);
    check('E2 maskToPrefix /30', maskToPrefix('255.255.255.252') === 30);
    check('E3 maskToPrefix /8', maskToPrefix('255.0.0.0') === 8);

    let state = mkStateWithDevices([mkMikroTikDevice()]);
    let out = executeCommand(state, 'r1', parseCommand('/ip address add address=192.168.1.1/24 interface=ether1', 'mikrotik'));
    const ipDev = out.state.devices.get('r1')!;
    check('E4 mikrotik add-ip mencermin', ipDev.interfaces[0].ip === '192.168.1.1', JSON.stringify(ipDev.interfaces[0]));
    check('E4b mutated dicatat', out.mutated.includes('ADD_IP_ADDRESS'));
    check('E4c Map baru (immutabel)', out.state.devices !== state.devices);

    state = out.state;
    out = executeCommand(state, 'r1', parseCommand('/ip route add dst-address=10.0.0.0/8 gateway=192.168.1.254', 'mikrotik'));
    check('E5 mikrotik add-route', out.state.devices.get('r1')!.routes[0]?.dst === '10.0.0.0/8');

    state = out.state;
    out = executeCommand(state, 'r1', parseCommand('/interface set name=ether1 disabled=yes', 'mikrotik'));
    check('E6 mikrotik disable', out.state.devices.get('r1')!.interfaces[0].disabled === true);

    out = executeCommand(state, 'r1', parseCommand('/system identity set name=GW-1', 'mikrotik'));
    check('E7 mikrotik hostname', out.state.devices.get('r1')!.hostname === 'GW-1');

    // Cisco chain: interface → ip address → no shutdown
    const ciscoDev = createDeviceState('r2', 'cisco', 'R2', ['GigabitEthernet0/0', 'GigabitEthernet0/1']);
    let cState = mkStateWithDevices([ciscoDev]);
    cState = executeCommand(cState, 'r2', parseCommand('configure terminal', 'cisco')).state;
    check('E8 cisco config mode', cState.devices.get('r2')!.mode === 'config');
    cState = executeCommand(cState, 'r2', parseCommand('interface GigabitEthernet0/0', 'cisco')).state;
    check('E8b interface context', cState.devices.get('r2')!.mode === 'interface' && cState.devices.get('r2')!.activeInterface === 'GigabitEthernet0/0');
    cState = executeCommand(cState, 'r2', parseCommand('ip address 192.168.1.1 255.255.255.0', 'cisco')).state;
    const cIface = cState.devices.get('r2')!.interfaces[0];
    check('E9 cisco ip di interface aktif', cIface.ip === '192.168.1.1' && cIface.prefix === 24, JSON.stringify(cIface));
    cState = executeCommand(cState, 'r2', parseCommand('no shutdown', 'cisco')).state;
    check('E9b no shutdown → disabled=false', cState.devices.get('r2')!.interfaces[0].disabled === false);

    const noMut = executeCommand(mkStateWithDevices([mkMikroTikDevice()]), 'r1', parseCommand('/ping 8.8.8.8', 'mikrotik'));
    check('E10 ping tidak memutasi', noMut.mutated.length === 0);
    const unk = executeCommand(mkStateWithDevices([mkMikroTikDevice()]), 'r1', parseCommand('blah blah', 'mikrotik'));
    check('E11 UNKNOWN tidak memutasi', unk.mutated.length === 0);
  }

  // ── 6. Resolver ──────────────────────────────────────────────────────
  {
    check('R1 cidrContains dalam subnet', cidrContains('192.168.2.0/24', '192.168.2.5') === true);
    check('R2 cidrContains luar subnet', cidrContains('192.168.2.0/24', '192.168.3.1') === false);
    check('R3 ipv4ToInt valid', ipv4ToInt('192.168.1.1') === 0xc0a80101);
    check('R4 ipv4ToInt invalid', ipv4ToInt('999.1.1.1') === null && ipv4ToInt('a.b') === null);

    const bridge = fakeBridge();
    const r1 = mkMikroTikDevice();
    const r2 = createDeviceState('r2', 'mikrotik', 'R2', ['ether1']);
    const pState = mkStateWithDevices([r1, r2]);

    const ok = resolvePing(bridge, pState, 'r1', '10.0.0.2');
    check('R5 ping via bridge sukses + hops', ok.success && ok.hops.join(',') === 'R1,R2', JSON.stringify(ok));
    check('R6 latency dari rttMs bridge', ok.latency === 12, String(ok.latency));
    const fail = resolvePing(bridge, pState, 'r1', '10.0.0.9');
    check('R7 ping gagal via bridge', !fail.success && fail.reason === 'unreachable');

    // Fallback murni (bridge = null)
    const selfHost = setInterfaceIp(mkMikroTikDevice(), 'ether1', '192.168.1.1/24');
    const self = resolvePing(null, mkStateWithDevices([selfHost]), 'r1', '192.168.1.1');
    check('R8 fallback self-ping', self.success && self.hops[0] === 'R1' && self.latency === 1);
    let st = addRoute(r1, { dst: '10.0.0.0/8', gateway: '192.168.1.254', interface: 'ether1', type: 'static' });
    st = setInterfaceIp(st, 'ether1', '192.168.1.1/24');
    const gw = resolvePing(null, mkStateWithDevices([st]), 'r1', '10.1.2.3');
    check('R9 fallback via-gateway', gw.success && gw.hops[1] === '192.168.1.254' && gw.latency === 6);
    const dead = resolvePing(null, pState, 'r1', '203.0.113.1');
    check('R10 fallback unreachable', !dead.success);

    // Show interfaces — fallback formatter
    const mt = resolveShowInterfaces(null, mkStateWithDevices([r1]), 'r1', 'mikrotik');
    check('R11 mikrotik show interfaces berisi MAC', mt.includes(r1.interfaces[0].mac) && mt.includes('ether1'));
    const cc = resolveShowInterfaces(null, mkStateWithDevices([mkCiscoDevice()]), 'r2', 'cisco');
    check('R12 cisco show interfaces format up/line protocol', cc.includes('GigabitEthernet0/0 is up, line protocol is up'), cc);

    // Show routes — fallback formatter
    const routed = addRoute(r1, { dst: '10.0.0.0/8', gateway: '192.168.1.254', interface: 'ether1', type: 'static' });
    const mRoutes = resolveShowRoutes(null, mkStateWithDevices([routed]), 'r1', 'mikrotik');
    check('R13 mikrotik show routes berisi DST', mRoutes.includes('10.0.0.0/8') && mRoutes.includes('192.168.1.254'));
    const cRoutes = resolveShowRoutes(null, mkStateWithDevices([routed]), 'r1', 'cisco');
    check('R14 cisco show routes kode S', cRoutes.includes('S    10.0.0.0/8'), cRoutes);

    // Show interfaces — via bridge (output dari engine nyata musti muncul)
    const viaBridge = resolveShowInterfaces(fakeBridge(), mkStateWithDevices([r1]), 'r1', 'mikrotik');
    check('R15 show interfaces via bridge', viaBridge.includes('[mikrotik] /interface print => ok'), viaBridge);
  }

  // ── 7. TopologyState reducer ─────────────────────────────────────────
  {
    const d1 = mkMikroTikDevice();
    let st = topologyReducer(INITIAL_TOPOLOGY_STATE, { type: 'DEVICE_ADDED', device: d1 });
    check('T1 DEVICE_ADDED', st.devices.size === 1 && st.devices.has('r1'));
    st = topologyReducer(st, { type: 'CABLE_ADDED', cable: { from: 'r1:ether1', to: 'r2:ether1' } });
    check('T2 CABLE_ADDED', st.cables.length === 1);
    st = topologyReducer(st, { type: 'CABLE_ADDED', cable: { from: 'r2:ether1', to: 'r1:ether1' } });
    check('T3 kabel bolak-balik dedupe', st.cables.length === 1);
    const hostname = setHostname(d1, 'X');
    st = topologyReducer(st, { type: 'DEVICE_UPDATED', device: hostname });
    check('T4 DEVICE_UPDATED ganti objek', st.devices.get('r1')!.hostname === 'X');
    st = topologyReducer(st, { type: 'CABLE_REMOVED', from: 'r1:ether1', to: 'r2:ether1' });
    check('T5 CABLE_REMOVED', st.cables.length === 0);
    st = topologyReducer(st, { type: 'DEVICE_REMOVED', deviceId: 'r1' });
    check('T6 DEVICE_REMOVED', st.devices.size === 0);
    const restored = topologyReducer(st, { type: 'STATES_RESTORED', devices: [d1], cables: [{ from: 'a:1', to: 'b:1' }] });
    check('T7 STATS_RESTORED', restored.devices.size === 1 && restored.cables.length === 1);
  }

  // ── 8. runCliCommand (entry facade) ──────────────────────────────────
  {
    const bridge = fakeBridge();
    let mirror: DeviceState | null = null;
    const result = runCliCommand({
      bridge,
      vendor: 'mikrotik',
      nodeId: 'r1',
      cmd: '/ip address add address=10.0.0.1/24 interface=ether1',
      context: { nodeId: 'r1' },
      currentDevice: mkMikroTikDevice(),
      onStateChange: (d) => { mirror = d; },
    });
    check('F1 output passthrough engine nyata', result.output === '[mikrotik] /ip address add address=10.0.0.1/24 interface=ether1 => ok');
    check('F2 command parsed', result.command.action === 'ADD_IP_ADDRESS');
    check('F3 changed=true', result.changed === true);
    check('F4 onStateChange menerima cermin baru', mirror !== null && mirror.interfaces[0].ip === '10.0.0.1', JSON.stringify(mirror));

    const noop = runCliCommand({
      bridge,
      vendor: 'mikrotik',
      nodeId: 'r1',
      cmd: '/interface print',
      context: { nodeId: 'r1' },
      currentDevice: mkMikroTikDevice(),
    });
    check('F5 show → changed=false', noop.changed === false && noop.command.action === 'SHOW_INTERFACES');

    // createNetLabBridge meneruskan ke dispatcher/simulator nyata
    const b2 = createNetLabBridge(
      { dispatch: (v, r) => `D:${v}:${r}` },
      {
        simulatePing: () => ({ success: true, path: ['A', 'B'], rttMs: 5 }),
        getDeviceStats: () => null,
      }
    );
    check('F6 bridge tercipta + dispatch', b2.dispatch('cisco', 'show version', {}) === 'D:cisco:show version');
    check('F7 bridge ping', b2.simulatePing('x', 'y').success === true);
  }

  return rep;
}