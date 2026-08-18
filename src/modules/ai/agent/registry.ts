// ============================================================
// registry — registrasi SEMUA tool AI Network Agent.
//
// Setiap tool: name, description, kind, permission, mutating,
// params (label), validate + execute.
//
// Validasi dipisah dari eksekusi: validator menjalankan schema
// typed; eksekusi hanya menerima params yang sudah divalidasi.
// ============================================================

import type { ToolDef, ToolResult, ToolExecCtx, ToolValidation } from './types';
import * as readTools from './readTools';
import * as topologyTools from './topologyTools';
import * as configTools from './configTools';
import { validate, vStr, vInt, vBool, vEnum, vPos, vStrOrEmpty } from './schemas';
import type { VerificationResult } from './types';
import { diagnoseNetwork, diagnoseConnectivity } from './diagnostics';

type Executor = (ctx: ToolExecCtx, p: Record<string, unknown>) => ToolResult;

const REQUIRED = false as const;
const OPTIONAL = true as const;

/** Definisikan satu tool dengan validator typed. */
function def(
  name: string,
  description: string,
  kind: ToolDef['kind'],
  permission: ToolDef['permission'],
  mutating: boolean,
  params: Record<string, string>,
  spec: Record<string, { optional?: boolean; check: (v: unknown, k: string) => unknown; label: string }>,
  run: Executor
): ToolDef {
  return {
    name,
    description,
    kind,
    permission,
    mutating,
    params,
    execute: (rawParams, ctx) => {
      const v = validate(rawParams, spec as never) as ToolValidation;
      if (!v.ok) {
        return { ok: false, message: `Tool ${name}: parameter invalid — ${v.errors.join('; ')}`, error: 'validation-failed' };
      }
      return run(ctx, v.params);
    },
  };
}

// ── helper spec singkat ────────────────────────────────────────

const devId = (optional = false) => ({
  optional,
  check: vStr,
  label: 'deviceId atau nama device',
});

const dst = () => ({
  optional: false,
  check: vStr,
  label: 'IP tujuan / hostname',
});

const ifaceRef = (optional = false) => ({
  optional,
  check: vStr,
  label: 'interface (id atau nama)',
});

// ── Registry ───────────────────────────────────────────────────

export function buildRegistry(): ToolDef[] {
  return [
    // ══ READ (semua mode diizinkan — tidak memutasi) ══════════════
    def('get_topology', 'Daftar perangkat + kabel saat ini', 'read', 'read_only', false,
      { source: '—' }, {}, (ctx) => readTools.toolGetTopology(ctx, {})),
    def('get_devices', 'Daftar semua perangkat', 'read', 'read_only', false,
      { source: '—' }, {}, (ctx) => readTools.toolGetDevices(ctx, {})),
    def('get_device', 'Detail satu perangkat (status, IP, interfaces)', 'read', 'read_only', false,
      { deviceId: 'id atau nama device' }, { deviceId: devId() }, (ctx, p) => readTools.toolGetDevice(ctx, p)),
    def('get_interfaces', 'Daftar interface sebuah perangkat', 'read', 'read_only', false,
      { deviceId: 'id atau nama device' }, { deviceId: devId() }, (ctx, p) => readTools.toolGetInterfaces(ctx, p)),
    def('get_interface', 'Detail satu interface', 'read', 'read_only', false,
      { deviceId: 'id/nama device', interfaceId: 'id atau nama interface' },
      { deviceId: devId(), interfaceId: { optional: false, check: vStr, label: 'interfaceId' } },
      (ctx, p) => readTools.toolGetInterface(ctx, p)),
    def('get_routes', 'Tabel routing IPv4 sebuah perangkat', 'read', 'read_only', false,
      { deviceId: 'id atau nama device' }, { deviceId: devId() }, (ctx, p) => readTools.toolGetRoutes(ctx, p)),
    def('get_ipv6_routes', 'Tabel routing IPv6 sebuah perangkat', 'read', 'read_only', false,
      { deviceId: 'id atau nama device' }, { deviceId: devId() }, (ctx, p) => readTools.toolGetIpv6Routes(ctx, p)),
    def('get_arp_table', 'Cache ARP sebuah perangkat', 'read', 'read_only', false,
      { deviceId: 'id atau nama device' }, { deviceId: devId() }, (ctx, p) => readTools.toolGetArp(ctx, p)),
    def('get_ndp_table', 'Cache NDP (neighbor discovery IPv6)', 'read', 'read_only', false,
      { deviceId: 'id atau nama device' }, { deviceId: devId() }, (ctx, p) => readTools.toolGetNdp(ctx, p)),
    def('get_mac_table', 'Tabel MAC (switch)', 'read', 'read_only', false,
      { deviceId: 'id atau nama device' }, { deviceId: devId() }, (ctx, p) => readTools.toolGetMacTable(ctx, p)),
    def('get_vlan_table', 'Konfigurasi VLAN/trunk sebuah switch', 'read', 'read_only', false,
      { deviceId: 'id atau nama device' }, { deviceId: devId() }, (ctx, p) => readTools.toolGetVlanTable(ctx, p)),
    def('get_dhcp_leases', 'Lease DHCP aktif di jaringan', 'read', 'read_only', false,
      { source: '—' }, {}, (ctx) => readTools.toolGetDhcpLeases(ctx, {})),
    def('get_nat_sessions', 'Rule NAT sebuah perangkat', 'read', 'read_only', false,
      { deviceId: 'id atau nama device' }, { deviceId: devId() }, (ctx, p) => readTools.toolGetNatSessions(ctx, p)),
    def('get_firewall_rules', 'Rule firewall/ACL sebuah perangkat', 'read', 'read_only', false,
      { deviceId: 'id atau nama device' }, { deviceId: devId() }, (ctx, p) => readTools.toolGetFirewallRules(ctx, p)),
    def('get_ospf_neighbors', 'Tetangga OSPF (state adjacency)', 'read', 'read_only', false,
      { deviceId: 'id atau nama device' }, { deviceId: devId() }, (ctx, p) => readTools.toolGetOspfNeighbors(ctx, p)),
    def('get_ospf_database', 'LSDB OSPF sebuah perangkat', 'read', 'read_only', false,
      { deviceId: 'id atau nama device' }, { deviceId: devId() }, (ctx, p) => readTools.toolGetOspfDatabase(ctx, p)),
    def('get_bgp_neighbors', 'Peer BGP (state session)', 'read', 'read_only', false,
      { deviceId: 'id atau nama device' }, { deviceId: devId() }, (ctx, p) => readTools.toolGetBgpNeighbors(ctx, p)),
    def('get_bgp_routes', 'RIB BGP sebuah perangkat', 'read', 'read_only', false,
      { deviceId: 'id atau nama device' }, { deviceId: devId() }, (ctx, p) => readTools.toolGetBgpRoutes(ctx, p)),
    def('get_eigrp_neighbors', 'Tetangga EIGRP + tabel topologi DUAL', 'read', 'read_only', false,
      { deviceId: 'id atau nama device' }, { deviceId: devId() }, (ctx, p) => readTools.toolGetEigrp(ctx, p)),
    def('get_stp_state', 'Status spanning-tree sebuah switch', 'read', 'read_only', false,
      { deviceId: 'id atau nama device' }, { deviceId: devId() }, (ctx, p) => readTools.toolGetStp(ctx, p)),
    def('get_fhrp_state', 'Status VRRP/FHRP (master/backup)', 'read', 'read_only', false,
      { deviceId: 'id atau nama device' }, { deviceId: devId() }, (ctx, p) => readTools.toolGetFhrp(ctx, p)),
    def('get_wireless_clients', 'Asosiasi client wireless sebuah AP', 'read', 'read_only', false,
      { deviceId: 'id atau nama device' }, { deviceId: devId() }, (ctx, p) => readTools.toolGetWirelessClients(ctx, p)),
    def('get_interface_statistics', 'Statistik interface (counter, QoS)', 'read', 'read_only', false,
      { deviceId: 'id atau nama device' }, { deviceId: devId() }, (ctx, p) => readTools.toolGetInterfaceStatistics(ctx, p)),
    def('get_qos_stats', 'Statistik antrean QoS', 'read', 'read_only', false,
      { deviceId: 'id atau nama device' }, { deviceId: devId() }, (ctx, p) => readTools.toolGetQosStats(ctx, p)),
    def('get_snmp_agent', 'Status agent SNMP sebuah perangkat', 'read', 'read_only', false,
      { deviceId: 'id atau nama device' }, { deviceId: devId() }, (ctx, p) => readTools.toolGetSnmp(ctx, p)),
    def('get_tcp_connections', 'Koneksi TCP aktif (state machine)', 'read', 'read_only', false,
      { deviceId: 'id atau nama device' }, { deviceId: devId() }, (ctx, p) => readTools.toolGetTcpConnections(ctx, p)),
    def('get_packet_trace', 'Telusuri paket hop-by-hop (dengan alasan drop)', 'read', 'read_only', false,
      { source: 'device sumber', destination: 'IP tujuan' },
      { source: devId(), destination: dst() }, (ctx, p) => readTools.toolGetPacketTrace(ctx, p)),
    def('get_ping_result', 'Jalankan ping via engine dan baca hasil', 'read', 'read_only', false,
      { source: 'device sumber', destination: 'IP tujuan' },
      { source: devId(), destination: dst() }, (ctx, p) => readTools.toolGetPingResult(ctx, p)),
    def('get_traceroute_result', 'Traceroute via engine (hop-by-hop)', 'read', 'read_only', false,
      { source: 'device sumber', destination: 'IP tujuan' },
      { source: devId(), destination: dst() }, (ctx, p) => readTools.toolGetTracerouteResult(ctx, p)),
    def('get_verification_history', 'Riwayat verifikasi sesi ini', 'read', 'read_only', false,
      { source: '—' }, {}, (ctx) => readTools.toolGetVerificationHistory(ctx, {})),

    // ══ VERIFICATION (read-only, tapi menulis riwayat) ═══════════
    def('verify_ping', 'Verifikasi konektivitas ICMP via engine (jalur SAMA dengan Ping Tools)', 'verification', 'read_only', false,
      { source: 'device sumber', destination: 'IP tujuan' },
      { source: devId(), destination: dst() },
      (ctx, p) => {
        const r = ctx.verification.verifyPing({ source: String(p.source), destination: String(p.destination), actionId: ctx.actionId, label: `ping ${String(p.source)} → ${String(p.destination)}` });
        return verifyResultToTool(r);
      }),
    def('verify_ping6', 'Verifikasi ICMPv6 (IPv6) via engine', 'verification', 'read_only', false,
      { source: 'device sumber', destination: 'alamat IPv6 tujuan' },
      { source: devId(), destination: dst() },
      (ctx, p) => {
        const r = ctx.verification.verifyPing6({ source: String(p.source), destination: String(p.destination), actionId: ctx.actionId });
        return verifyResultToTool(r);
      }),
    def('verify_traceroute', 'Verifikasi jalur hop-by-hop', 'verification', 'read_only', false,
      { source: 'device sumber', destination: 'IP tujuan' },
      { source: devId(), destination: dst() },
      (ctx, p) => {
        const r = ctx.verification.verifyTraceroute({ source: String(p.source), destination: String(p.destination), actionId: ctx.actionId });
        return verifyResultToTool(r);
      }),
    def('verify_tcp', 'Verifikasi koneksi TCP (handshake nyata engine)', 'verification', 'read_only', false,
      { source: 'device sumber', destination: 'IP tujuan', port: 'port tujuan (default 80)' },
      { source: devId(), destination: dst(), port: { optional: true, check: vInt, label: 'port' } },
      (ctx, p) => {
        const r = ctx.verification.verifyTcp({ source: String(p.source), destination: String(p.destination), port: p.port as number | undefined, actionId: ctx.actionId });
        return verifyResultToTool(r);
      }),
    def('verify_route', 'Verifikasi rute statis/dinamis ke sebuah jaringan', 'verification', 'read_only', false,
      { source: 'device', dst: 'jaringan tujuan (CIDR)' },
      { source: devId(), dst: { optional: false, check: vStr, label: 'dst CIDR' } },
      (ctx, p) => {
        const r = ctx.verification.verifyRoute({ source: String(p.source), dst: String(p.dst), actionId: ctx.actionId });
        return verifyResultToTool(r);
      }),
    def('verify_arp', 'Verifikasi entri ARP', 'verification', 'read_only', false,
      { source: 'device', destination: 'IP (opsional)' },
      { source: devId(), destination: { optional: true, check: vStr, label: 'IP tujuan' } },
      (ctx, p) => {
        const r = ctx.verification.verifyArp({ source: String(p.source), destination: p.destination as string | undefined, actionId: ctx.actionId });
        return verifyResultToTool(r);
      }),
    def('verify_ndp', 'Verifikasi entri NDP (IPv6)', 'verification', 'read_only', false,
      { source: 'device', destination: 'alamat v6 (opsional)' },
      { source: devId(), destination: { optional: true, check: vStr, label: 'alamat v6' } },
      (ctx, p) => {
        const r = ctx.verification.verifyNdp({ source: String(p.source), destination: p.destination as string | undefined, actionId: ctx.actionId });
        return verifyResultToTool(r);
      }),
    def('verify_ospf', 'Verifikasi adjacency OSPF Full', 'verification', 'read_only', false,
      { source: 'device' }, { source: devId() },
      (ctx, p) => {
        const r = ctx.verification.verifyOspf({ source: String(p.source), actionId: ctx.actionId });
        return verifyResultToTool(r);
      }),
    def('verify_bgp', 'Verifikasi session BGP Established', 'verification', 'read_only', false,
      { source: 'device', destination: 'alamat peer (opsional)' },
      { source: devId(), destination: { optional: true, check: vStr, label: 'alamat peer' } },
      (ctx, p) => {
        const r = ctx.verification.verifyBgp({ source: String(p.source), destination: p.destination as string | undefined, actionId: ctx.actionId });
        return verifyResultToTool(r);
      }),
    def('verify_vlan', 'Verifikasi konfigurasi VLAN pada switch', 'verification', 'read_only', false,
      { source: 'device', vlanId: 'ID VLAN (opsional)', trunk: 'interface trunk (opsional)' },
      { source: devId(), vlanId: { optional: true, check: vInt, label: 'vlanId' }, trunk: { optional: true, check: vStr, label: 'trunk iface' } },
      (ctx, p) => {
        const r = ctx.verification.verifyVlan({ source: String(p.source), vlanId: p.vlanId as number | undefined, trunk: p.trunk as string | undefined, actionId: ctx.actionId });
        return verifyResultToTool(r);
      }),
    def('verify_dhcp', 'Verifikasi lease DHCP', 'verification', 'read_only', false,
      { source: 'device' }, { source: devId() },
      (ctx, p) => {
        const r = ctx.verification.verifyDhcp({ source: String(p.source), actionId: ctx.actionId });
        return verifyResultToTool(r);
      }),
    def('verify_nat', 'Verifikasi rule NAT terpasang', 'verification', 'read_only', false,
      { source: 'device' }, { source: devId() },
      (ctx, p) => {
        const r = ctx.verification.verifyNat({ source: String(p.source), actionId: ctx.actionId });
        return verifyResultToTool(r);
      }),

    // ══ TOPOLOGY (mutasi — butuh izin) ═══════════════════════════
    def('create_device', 'Buat perangkat baru (router/switch/pc/server/firewall/wireless)', 'topology', 'execute', true,
      { type: 'jenis perangkat', vendor: 'vendor', name: 'nama (opsional)', position: '{x,y} (opsional)', id: 'id (opsional)', seed: 'seed id (opsional)' },
      {
        type: { optional: false, check: vEnum(['router', 'switch', 'firewall', 'pc', 'server', 'wireless'] as const), label: 'jenis perangkat' },
        vendor: { optional: false, check: vEnum(['mikrotik', 'cisco_ios', 'cisco_nxos', 'juniper', 'huawei', 'ubiquiti', 'vyos', 'fortinet', 'aruba', 'openwrt', 'linux'] as const), label: 'vendor' },
        name: { optional: true, check: vStr, label: 'nama device' },
        position: { optional: true, check: vPos, label: 'posisi canvas' },
        id: { optional: true, check: vStr, label: 'id device' },
        seed: { optional: true, check: vStr, label: 'seed untuk id deterministik' },
      },
      (ctx, p) => topologyTools.toolCreateDevice(ctx, p)),
    def('delete_device', 'Hapus perangkat + kabelnya', 'topology', 'execute', true,
      { deviceId: 'id atau nama device' }, { deviceId: devId() },
      (ctx, p) => topologyTools.toolDeleteDevice(ctx, p)),
    def('rename_device', 'Ganti nama perangkat', 'topology', 'execute', true,
      { deviceId: 'id atau nama device', name: 'nama baru' },
      { deviceId: devId(), name: { optional: false, check: vStr, label: 'nama baru' } },
      (ctx, p) => topologyTools.toolRenameDevice(ctx, p)),
    def('move_device', 'Pindahkan posisi canvas perangkat', 'topology', 'execute', true,
      { deviceId: 'id atau nama device', position: '{x,y}' },
      { deviceId: devId(), position: { optional: false, check: vPos, label: 'posisi' } },
      (ctx, p) => topologyTools.toolMoveDevice(ctx, p)),
    def('connect_devices', 'Hubungkan dua perangkat (kabel)', 'topology', 'execute', true,
      { sourceDeviceId: 'device sumber', targetDeviceId: 'device tujuan', sourceInterfaceId: 'port sumber (opsional)', targetInterfaceId: 'port tujuan (opsional)', seed: 'seed id (opsional)' },
      { sourceDeviceId: devId(), targetDeviceId: devId(), sourceInterfaceId: ifaceRef(true), targetInterfaceId: ifaceRef(true), seed: { optional: true, check: vStr, label: 'seed id edge' } },
      (ctx, p) => topologyTools.toolConnectDevices(ctx, p)),
    def('disconnect_devices', 'Putuskan kabel antara dua device (atau semua kabel device)', 'topology', 'execute', true,
      { sourceDeviceId: 'device', targetDeviceId: 'device lain (opsional)' },
      { sourceDeviceId: devId(), targetDeviceId: { optional: true, check: vStr, label: 'device tujuan' } },
      (ctx, p) => topologyTools.toolDisconnectDevices(ctx, p)),
    def('update_device_properties', 'Perbarui properti perangkat (powered)', 'topology', 'execute', true,
      { deviceId: 'id atau nama device', powered: 'true/false' },
      { deviceId: devId(), powered: { optional: true, check: vBool, label: 'powered' } },
      (ctx, p) => topologyTools.toolUpdateDeviceProperties(ctx, p)),
    def('update_interface_properties', 'Perbarui properti interface (ipAddress tampilan awal)', 'topology', 'execute', true,
      { deviceId: 'id atau nama device', interfaceId: 'interface', ipAddress: 'CIDR (opsional)' },
      { deviceId: devId(), interfaceId: { optional: false, check: vStr, label: 'interfaceId' }, ipAddress: { optional: true, check: vStrOrEmpty, label: 'ipAddress' } },
      (ctx, p) => topologyTools.toolUpdateInterfaceProperties(ctx, p)),

    // ══ CONFIG (mutasi — butuh izin) ═════════════════════════════
    def('execute_cli', 'Eksekusi command CLI vendor (jalur SAMA dengan terminal manusia)', 'config', 'execute', true,
      { deviceId: 'id atau nama device', command: 'command vendor (multi-baris dengan \\n)' },
      { deviceId: devId(), command: { optional: false, check: vStr, label: 'command' } },
      (ctx, p) => configTools.toolExecuteCli(ctx, p)),
    def('configure_ip_address', 'Pasang IP pada interface', 'config', 'execute', true,
      { deviceId: 'id atau nama device', interface: 'interface', address: 'CIDR (mis. 10.0.0.1/24)' },
      { deviceId: devId(), interface: { optional: false, check: vStr, label: 'interface' }, address: { optional: false, check: vStr, label: 'address CIDR' } },
      (ctx, p) => configTools.toolConfigureIpAddress(ctx, p)),
    def('remove_ip_address', 'Hapus IP dari interface', 'config', 'execute', true,
      { deviceId: 'id atau nama device', interface: 'interface', address: 'CIDR' },
      { deviceId: devId(), interface: { optional: false, check: vStr, label: 'interface' }, address: { optional: false, check: vStr, label: 'address CIDR' } },
      (ctx, p) => configTools.toolRemoveIpAddress(ctx, p)),
    def('configure_route', 'Tambahkan rute statis', 'config', 'execute', true,
      { deviceId: 'id atau nama device', dst: 'jaringan tujuan (CIDR)', gateway: 'next-hop' },
      { deviceId: devId(), dst: { optional: false, check: vStr, label: 'dst CIDR' }, gateway: { optional: false, check: vStr, label: 'gateway' } },
      (ctx, p) => configTools.toolConfigureRoute(ctx, p)),
    def('configure_vlan', 'Buat VLAN (opsional: interface untuk mikrotik/fortinet)', 'config', 'execute', true,
      { deviceId: 'id atau nama device', vlanId: 'ID VLAN', name: 'nama (opsional)', interface: 'interface (opsional)' },
      { deviceId: devId(), vlanId: { optional: false, check: vInt, label: 'vlanId' }, name: { optional: true, check: vStr, label: 'nama vlan' }, interface: { optional: true, check: vStr, label: 'interface' } },
      (ctx, p) => configTools.toolConfigureVlan(ctx, p)),
    def('configure_trunk', 'Jadikan interface sebagai trunk', 'config', 'execute', true,
      { deviceId: 'id atau nama device', interface: 'interface' },
      { deviceId: devId(), interface: { optional: false, check: vStr, label: 'interface' } },
      (ctx, p) => configTools.toolConfigureTrunk(ctx, p)),
    def('configure_ospf', 'Aktifkan OSPF untuk sebuah network', 'config', 'execute', true,
      { deviceId: 'id atau nama device', network: 'network (CIDR)', area: 'area ID (default 0)' },
      { deviceId: devId(), network: { optional: false, check: vStr, label: 'network' }, area: { optional: true, check: vInt, label: 'area' } },
      (ctx, p) => configTools.toolConfigureOspf(ctx, p)),
    def('configure_bgp', 'Konfigurasi BGP (AS, neighbor)', 'config', 'execute', true,
      { deviceId: 'id atau nama device', asn: 'ASN lokal', neighborIp: 'alamat neighbor', remoteAs: 'ASN remote', network: 'network yang diiklankan (opsional)' },
      { deviceId: devId(), asn: { optional: false, check: vInt, label: 'asn' }, neighborIp: { optional: false, check: vStr, label: 'neighborIp' }, remoteAs: { optional: false, check: vInt, label: 'remoteAs' }, network: { optional: true, check: vStr, label: 'network' } },
      (ctx, p) => configTools.toolConfigureBgp(ctx, p)),
    def('configure_dhcp', 'Konfigurasi DHCP server/pool', 'config', 'execute', true,
      { deviceId: 'id atau nama device', poolName: 'nama pool', range: 'rentang IP (mis. 192.168.1.100-192.168.1.200)', gateway: 'gateway' },
      { deviceId: devId(), poolName: { optional: false, check: vStr, label: 'poolName' }, range: { optional: false, check: vStr, label: 'range' }, gateway: { optional: false, check: vStr, label: 'gateway' } },
      (ctx, p) => configTools.toolConfigureDhcp(ctx, p)),
    def('configure_nat', 'Konfigurasi NAT (masquerade/srcnat)', 'config', 'execute', true,
      { deviceId: 'id atau nama device', outInterface: 'interface keluar', masquerade: 'true/false (default true)' },
      { deviceId: devId(), outInterface: { optional: false, check: vStr, label: 'outInterface' }, masquerade: { optional: true, check: vBool, label: 'masquerade' } },
      (ctx, p) => configTools.toolConfigureNat(ctx, p)),
    def('configure_firewall', 'Tambah rule firewall (accept/drop/reject)', 'config', 'execute', true,
      { deviceId: 'id atau nama device', action: 'accept|drop|reject', chain: 'input|forward (default forward)', src: 'sumber (opsional)', dst: 'tujuan (opsional)', protocol: 'protokol (opsional)', port: 'port tujuan (opsional)' },
      { deviceId: devId(), action: { optional: false, check: vEnum(['accept', 'drop', 'reject'] as const), label: 'action' }, chain: { optional: true, check: vEnum(['input', 'forward'] as const), label: 'chain' }, src: { optional: true, check: vStr, label: 'src' }, dst: { optional: true, check: vStr, label: 'dst' }, protocol: { optional: true, check: vStr, label: 'protocol' }, port: { optional: true, check: vInt, label: 'port' } },
      (ctx, p) => configTools.toolConfigureFirewall(ctx, p)),
    def('configure_wireless', 'Konfigurasi wireless (AP/station, SSID)', 'config', 'execute', true,
      { deviceId: 'id atau nama device', ssid: 'SSID', mode: 'ap|station (default ap)', password: 'WPA2 password (opsional)' },
      { deviceId: devId(), ssid: { optional: false, check: vStr, label: 'ssid' }, mode: { optional: true, check: vEnum(['ap', 'station'] as const), label: 'mode' }, password: { optional: true, check: vStr, label: 'password' } },
      (ctx, p) => configTools.toolConfigureWireless(ctx, p)),

    // ══ DIAGNOSTIC ═══════════════════════════════════════════════
    def('diagnose', 'Diagnosis penuh jaringan (semua analyzer)', 'diagnostic', 'read_only', false,
      { source: '—' }, {}, (ctx, p) => {
        const res = diagnoseNetwork(ctx.runtime.sim);
        return {
          ok: res.ok,
          message: res.ok ? 'Jaringan sehat.' : `${res.issues.length} masalah ditemukan.`,
          data: { status: res.ok ? 'healthy' : 'problem', issues: res.issues, checks: res.checks, confidence: res.confidence },
        };
      }),
    def('diagnose_connectivity', 'Diagnosa satu koneksi sumber→tujuan (root cause + perbaikan)', 'diagnostic', 'read_only', false,
      { source: 'device sumber', destination: 'IP tujuan' },
      { source: devId(), destination: dst() },
      (ctx, p) => {
        const res = diagnoseConnectivity(ctx.runtime.sim, ctx.verification, { source: String(p.source), destination: String(p.destination) });
        return {
          ok: res.ok,
          message: res.message,
          data: {
            ok: res.ok,
            rootCause: res.rootCause,
            packetTrace: res.packetTrace,
            recommendedFixes: res.recommendedFixes.map((f) => ({ type: f.type, target: f.target, params: f.params, expectedEffect: f.expectedEffect, risk: f.risk })),
            evidence: res.evidence,
          },
          evidence: res.evidence.flatMap((e) => e.data),
        };
      }),
  ];
}

function verifyResultToTool(r: VerificationResult): ToolResult {
  return {
    ok: r.success,
    message: `${r.testType}: ${r.success ? 'BERHASIL' : 'GAGAL'}${r.reason ? ` (${r.reason})` : ''}`,
    data: { success: r.success, testType: r.testType, source: r.source, destination: r.destination, reason: r.reason, hops: r.hops, latency: r.latency, evidence: r.evidence, detail: r.detail },
    evidence: r.evidence,
  };
}

/** Registry dalam bentuk Map (name → ToolDef). */
export function registryMap(tools: ToolDef[]): Map<string, ToolDef> {
  return new Map(tools.map((t) => [t.name, t]));
}

/** Mode minimum untuk tool — helper permission check. */
export function permissionOk(tool: ToolDef, mode: import('./types').AiPermissionMode): boolean {
  const rank: Record<import('./types').AiPermissionMode, number> = { read_only: 0, propose: 1, execute: 2 };
  const need: Record<import('./types').AiPermissionMode, number> = {
    read_only: 0,
    propose: 1,
    execute: 2,
  };
  return rank[mode] >= need[tool.permission];
}