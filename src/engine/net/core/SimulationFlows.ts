// ============================================================
// SimulationFlows — alur simulasi tingkat aplikasi: ping (v4/v6),
// traceroute, TCP connect, SNMP query, DHCP client, resolusi DNS.
//
// Membaca state dari context (nodes/topology) + ConfigStore
// (daya perangkat, SLAAC) + Observation (lease) + RunManager
// (lifecycle run) dan memakai SimulationCore untuk pembuatan
// paket & transmisi (inject → ARP/NDP resolve → transmit).
// ============================================================

import { NetworkDevice } from '../devices/NetworkDevice';
import { NetworkInterfaceModel } from '../interfaces/NetworkInterface';
import { Packet } from './types';
import { DEFAULT_TTL, SimulationContext } from './SimulationContext';
import { SimulationCore } from './SimulationCore';
import { RunManager } from './RunManager';
import { ConfigStore } from './ConfigStore';
import { Observation } from './Observation';
import { isValidIp, inSameSubnet } from './ip';
import { isIpv6Address, inSameIpv6Subnet } from './ipv6';
import { buildTcpSegment, TCP_SYN } from '../layer4/Tcp';
import { arpResolveAndSend } from '../devices/sendUtils';
import { ndpResolveAndSend } from '../devices/ndpUtils';
import {
  DhcpLeaseGrant,
  DnsResolution,
  PingSimResult,
  SnmpQueryOptions,
  SnmpQueryResult,
  TcpConnectResult,
  TracerouteResult,
} from '../compat';
import { linkLatencyMs } from './Topology';

export class SimulationFlows {
  private runSeq = 0;

  constructor(
    private readonly ctx: SimulationContext,
    private readonly core: SimulationCore,
    private readonly runManager: RunManager,
    private readonly configStore: ConfigStore,
    private readonly observation: Observation
  ) {}

  grantDhcpLease(nodeId: string, ifaceName?: string): DhcpLeaseGrant | null {
    return this.ensureLease(nodeId, ifaceName);
  }

  dhcpLeaseFor(nodeId: string, ifaceName?: string): DhcpLeaseGrant | null {
    return this.ensureLease(nodeId, ifaceName);
  }

  /** Coba penuhi lease (DORA event-driven) bila device belum punya IP. */
  private ensureLease(nodeId: string, ifaceName?: string): DhcpLeaseGrant | null {
    const dev = this.ctx.nodes.get(nodeId);
    if (!dev || dev.getIpAddress()) return null;
    const existing = this.observation.getLeaseFor(nodeId);
    if (existing) return existing;

    const proc = this.ctx.processors.get(nodeId);
    if (!proc?.startDhcp) return null;
    const traceId = `dhcp-${nodeId}-${++this.runSeq}`;
    const run = this.runManager.beginRun(traceId);
    if (!proc.startDhcp(traceId, this.core)) return null;
    this.runManager.processUntil(traceId);
    void run;
    return this.observation.getLeaseFor(nodeId);
  }

  resolveHostname(nodeId: string, name: string): DnsResolution {
    const dev = this.ctx.nodes.get(nodeId);
    const n = name.toLowerCase().replace(/\.$/, '');
    if (dev) {
      const own = dev.dnsRecords.find((r) => r.name.toLowerCase() === n || r.name.toLowerCase() === n + '.');
      if (own) return { resolved: own.address, server: 'self' };
    }
    const servers = dev?.dnsServers || [];
    if (servers.length === 0) return { resolved: null, timedOut: true };
    for (const srvIp of servers) {
      const srv = this.deviceByIp(srvIp);
      if (!srv || !this.configStore.isNodePowered(srv.id)) continue;
      const rec = srv.dnsRecords.find((r) => r.name.toLowerCase() === n);
      if (rec) return { resolved: rec.address, server: srvIp };
    }
    // Fallback: nama perangkat di topologi (mis. "PC2" → IP pertamanya).
    const byName = this.deviceByName(n);
    if (byName) {
      const ip = byName.getIpAddress();
      if (ip) return { resolved: ip, server: 'topology' };
    }
    return { resolved: null, nxdomain: true };
  }

  /** Perkiraan RTT (ms) sebuah lintasan: 2 × latensi propagasi tiap hop. */
  private rttOf(edgeIds: string[]): number {
    let oneWay = 0;
    const seen = new Set<string>();
    for (const id of edgeIds) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      oneWay += linkLatencyMs(this.ctx.topology.links.linkById(id));
    }
    return oneWay * 2;
  }

  /**
   * Resolusi alamat tujuan: IP langsung, nama host via DNS (record statis /
   * server DNS), terakhir nama perangkat di topologi (ping PC2 tanpa config).
   * Nilai null = tidak bisa di-resolve (ping('invalid') → reason invalid).
   */
  private resolvePingTarget(srcNodeId: string, dstIp: string): string | null {
    if (isValidIp(dstIp) || isIpv6Address(dstIp)) return dstIp;
    const viaDns = this.resolveHostname(srcNodeId, dstIp);
    if (viaDns.resolved) return viaDns.resolved;
    const byName = this.deviceByName(dstIp);
    if (byName?.getIpAddress()) return byName.getIpAddress();
    return null;
  }

  private deviceByName(name: string): NetworkDevice | null {
    const n = name.toLowerCase();
    for (const dev of this.ctx.nodes.values()) {
      if (dev.name.toLowerCase() === n) return dev;
    }
    return null;
  }

  private deviceByIp(ip: string): NetworkDevice | null {
    for (const dev of this.ctx.nodes.values()) {
      if (dev.hasIp(ip)) return dev;
    }
    return null;
  }

  // ── Simulasi flow ──────────────────────────────────────────────
  simulatePing(srcNodeId: string, dstIp: string): PingSimResult {
    const src = this.ctx.nodes.get(srcNodeId);
    if (!src) return this.pingFail('not-found');
    if (isIpv6Address(dstIp)) return this.simulatePing6(srcNodeId, dstIp);
    const target = this.resolvePingTarget(srcNodeId, dstIp);
    if (!target) return this.pingFail('invalid');
    dstIp = target;
    if (!isValidIp(dstIp)) return this.pingFail('invalid');
    if (!this.configStore.isNodePowered(src.id)) return this.pingFail('power');
    if (src.hasIp(dstIp)) {
      return { success: true, path: [src.name], edgeIds: [], ttlAtDestination: DEFAULT_TTL, reason: 'self' };
    }

    let dhcpGranted = false;
    if (!src.getIpAddress()) {
      const lease = this.ensureLease(srcNodeId);
      if (!lease) return this.pingFail('no-ip');
      dhcpGranted = true;
    }

    const iface = src.getInterfaces().find((i) => i.ip && i.up);
    if (!iface || !iface.ip) return this.pingFail('no-ip');

    const traceId = `ping-${++this.runSeq}`;
    const run = this.runManager.beginRun(traceId);
    run.fwdPath = [src.name];
    const req = this.core.createPacket({
      protocol: 'icmp',
      srcIp: iface.ip.address,
      dstIp,
      srcMac: iface.mac,
      dstMac: '',
      srcPort: 0,
      dstPort: 0,
      ttl: DEFAULT_TTL,
      traceId,
      flags: { dir: 'req', icmpType: 8 },
      payload: { type: 8, code: 0, seq: 1, id: (Math.random() * 0xffff) & 0xffff },
    });
    run.rootPktId = req.id;

    if (!this.inject(src, req, traceId)) return this.pingFail('unreachable');
    this.runManager.processUntil(traceId);

    if (run.status === 'ok') {
      const path = run.fwdPath.length > 0 ? run.fwdPath : [src.name];
      return {
        success: true,
        path,
        edgeIds: run.fwdEdges,
        ttlAtDestination: run.ttlAtDst ?? DEFAULT_TTL,
        dhcpGranted: dhcpGranted || undefined,
        rttMs: this.rttOf(run.fwdEdges),
      };
    }
    return this.pingFail(mapReason(run.reason));
  }

  /** Ping IPv6 (ICMPv6 echo). Tanpa DHCP — host harus punya alamat v6. */
  simulatePing6(srcNodeId: string, dstIp: string): PingSimResult {
    const src = this.ctx.nodes.get(srcNodeId);
    if (!src) return this.pingFail('not-found');
    if (!isIpv6Address(dstIp)) return this.pingFail('invalid');
    if (!this.configStore.isNodePowered(src.id)) return this.pingFail('power');
    if (src.hasIpv6(dstIp)) {
      return { success: true, path: [src.name], edgeIds: [], ttlAtDestination: DEFAULT_TTL, reason: 'self' };
    }
    const iface = src.getInterfaces().find((i) => i.ipv6 && i.up);
    if (!iface || !iface.ipv6) {
      // SLAAC/DHCPv6 client: host dengan interface autoconfig mendapatkan
      // alamat dari prefix router terhubung sebelum ping.
      if (src.slaacIfaces.length > 0 && this.configStore.slaacAutoConfig(src)) {
        const newIface = src.getInterfaces().find((i) => i.ipv6 && i.up);
        if (newIface?.ipv6) return this.continueSimulatePing6(src, newIface, dstIp);
      }
      return this.pingFail('no-ip');
    }
    return this.continueSimulatePing6(src, iface, dstIp);
  }

  private continueSimulatePing6(src: NetworkDevice, iface: NetworkInterfaceModel, dstIp: string): PingSimResult {
    const traceId = `ping6-${++this.runSeq}`;
    const run = this.runManager.beginRun(traceId);
    run.fwdPath = [src.name];
    const req = this.core.createPacket({
      protocol: 'icmp',
      srcIp: iface.ipv6.address,
      dstIp,
      srcMac: iface.mac,
      dstMac: '',
      srcPort: 0,
      dstPort: 0,
      ttl: DEFAULT_TTL,
      traceId,
      flags: { dir: 'req', icmpType: 128, v6: true },
      payload: { type: 128, code: 0, seq: 1, id: (Math.random() * 0xffff) & 0xffff, v6: true },
    });
    run.rootPktId = req.id;

    if (!this.inject6(src, req, traceId)) return this.pingFail('unreachable');
    this.runManager.processUntil(traceId);

    if (run.status === 'ok') {
      const path = run.fwdPath.length > 0 ? run.fwdPath : [src.name];
      return {
        success: true,
        path,
        edgeIds: run.fwdEdges,
        ttlAtDestination: run.ttlAtDst ?? DEFAULT_TTL,
        rttMs: this.rttOf(run.fwdEdges),
      };
    }
    return this.pingFail(mapReason(run.reason));
  }

  simulateTraceroute(srcNodeId: string, dstIp: string): TracerouteResult {
    const src = this.ctx.nodes.get(srcNodeId);
    if (!src) return { ok: false, hops: [], reason: 'not-found' };
    if (isIpv6Address(dstIp)) return { ok: false, hops: [], reason: 'invalid' };
    const target = this.resolvePingTarget(srcNodeId, dstIp);
    if (!target) return { ok: false, hops: [], reason: 'invalid' };
    dstIp = target;
    if (!isValidIp(dstIp)) return { ok: false, hops: [], reason: 'invalid' };
    if (!this.configStore.isNodePowered(src.id)) return { ok: false, hops: [], reason: 'power' };

    if (!src.getIpAddress()) {
      const lease = this.ensureLease(srcNodeId);
      if (!lease) return { ok: false, hops: [], reason: 'no-ip' };
    }
    const iface = src.getInterfaces().find((i) => i.ip && i.up);
    if (!iface || !iface.ip) return { ok: false, hops: [], reason: 'no-ip' };

    // Traceroute nyata: probe ICMP hop demi hop dengan TTL naik.
    // Router yang TTL-nya habis membalas ICMP time-exceeded (hop ke-ttl),
    // router tanpa rute membalas dest-unreachable (jalur putus), dst balas
    // echo-reply (selesai). Hop diidentifikasi dari event log per probe.
    const MAX_HOPS = 16;
    const hops: TracerouteResult['hops'] = [];
    for (let ttl = 1; ttl <= MAX_HOPS; ttl++) {
      const traceId = `trace-${++this.runSeq}`;
      const run = this.runManager.beginRun(traceId);
      run.fwdPath = [src.name];
      const logStart = this.core.eventLog.length;
      const req = this.core.createPacket({
        protocol: 'icmp',
        srcIp: iface.ip.address,
        dstIp,
        srcMac: iface.mac,
        dstMac: '',
        srcPort: 0,
        dstPort: 0,
        ttl,
        traceId,
        flags: { dir: 'req', icmpType: 8 },
        payload: { type: 8, code: 0, seq: ttl, id: (Math.random() * 0xffff) & 0xffff, traceroute: true },
      });
      run.rootPktId = req.id;
      if (!this.inject(src, req, traceId)) break;
      this.runManager.processUntil(traceId);

      if (run.status === 'ok') {
        const dst = this.deviceByIp(dstIp) || src;
        hops.push({ name: dst.name, ttl, ip: dstIp });
        return { ok: true, hops };
      }

      const probeEvents = this.core.eventLog.slice(logStart).filter((e) => e.traceId === traceId);
      const ttlExpired = probeEvents.find((e) => e.type === 'TTL_EXCEEDED');
      if (ttlExpired && ttlExpired.nodeId) {
        const hopDev = this.ctx.nodes.get(ttlExpired.nodeId);
        hops.push({
          name: hopDev?.name || ttlExpired.nodeId,
          ttl,
          ip: hopDev?.getIpAddress() || null,
        });
        continue;
      }
      const icmpErr = probeEvents.find((e) => e.type === 'ICMP_ERROR');
      if (icmpErr && icmpErr.nodeId) {
        const hopDev = this.ctx.nodes.get(icmpErr.nodeId);
        hops.push({
          name: hopDev?.name || icmpErr.nodeId,
          ttl,
          ip: hopDev?.getIpAddress() || null,
        });
        return { ok: false, hops, reason: mapReason(run.reason) };
      }
      // Paket hilang diam-diam (firewall block / link down) → jalur putus tanpa hop.
      return { ok: false, hops, reason: mapReason(run.reason) };
    }
    return { ok: false, hops, reason: 'unreachable' };
  }

  canReach(srcNodeId: string, dstIp: string): boolean {
    return this.simulatePing(srcNodeId, dstIp).success;
  }

  simulateTcpConnect(srcNodeId: string, dstIp: string, dstPort = 80): TcpConnectResult {
    const src = this.ctx.nodes.get(srcNodeId);
    if (!src) return { ok: false, reason: 'not-found', handshake: [] };
    if (!isValidIp(dstIp)) return { ok: false, reason: 'invalid', handshake: [] };
    if (!this.configStore.isNodePowered(src.id)) return { ok: false, reason: 'power', handshake: [] };

    let dhcpGranted = false;
    if (!src.getIpAddress()) {
      const lease = this.ensureLease(srcNodeId);
      if (!lease) return { ok: false, reason: 'no-ip', handshake: [] };
      dhcpGranted = true;
    }

    const iface = src.getInterfaces().find((i) => i.ip && i.up);
    if (!iface || !iface.ip) return { ok: false, reason: 'no-ip', handshake: [] };

    const traceId = `tcp-${++this.runSeq}`;
    const run = this.runManager.beginRun(traceId);
    const iseq = Math.floor(Math.random() * 50000) + 1000;
    const clientPort = 40000 + Math.floor(Math.random() * 10000);
    const syn = this.core.createPacket({
      protocol: 'tcp',
      srcIp: iface.ip.address,
      dstIp,
      srcMac: iface.mac,
      dstMac: '',
      srcPort: clientPort,
      dstPort,
      ttl: DEFAULT_TTL,
      traceId,
      flags: { dir: 'req', tcp: 'syn', clientPort },
      payload: { ...buildTcpSegment(clientPort, dstPort, iseq, 0, TCP_SYN) },
    });
    run.rootPktId = syn.id;

    if (!this.inject(src, syn, traceId)) return { ok: false, reason: 'unreachable', handshake: [] };
    this.runManager.processUntil(traceId);

    if (run.status === 'ok') {
      return {
        ok: true,
        handshake: run.handshake || [],
        status: run.statusCode,
        body: run.body,
      };
    }
    return { ok: false, reason: mapReason(run.reason), handshake: [] };
  }

  /**
   * Query SNMP antar-perangkat (udp/161): kirim paket nyata melewati
   * ARP/routing, agent target merespons sesuai MIB yang di-bangun dari
   * state-nya (community, get/walk/set). Mirip simulatePing/TcpConnect.
   */
  simulateSnmpQuery(
    srcNodeId: string,
    dstIp: string,
    community: string,
    oid: string,
    opts: SnmpQueryOptions = {}
  ): SnmpQueryResult {
    const src = this.ctx.nodes.get(srcNodeId);
    if (!src) return { ok: false, reason: 'not-found' };
    if (!isValidIp(dstIp)) return { ok: false, reason: 'invalid' };
    if (!this.configStore.isNodePowered(src.id)) return { ok: false, reason: 'power' };

    let dhcpGranted = false;
    if (!src.getIpAddress()) {
      const lease = this.ensureLease(srcNodeId);
      if (!lease) return { ok: false, reason: 'no-ip' };
      dhcpGranted = true;
    }

    const iface = src.getInterfaces().find((i) => i.ip && i.up);
    if (!iface || !iface.ip) return { ok: false, reason: 'no-ip' };

    const traceId = `snmp-${++this.runSeq}`;
    const run = this.runManager.beginRun(traceId);
    const clientPort = 50000 + Math.floor(Math.random() * 5000);
    const req = this.core.createPacket({
      protocol: 'udp',
      srcIp: iface.ip.address,
      dstIp,
      srcMac: iface.mac,
      dstMac: '',
      srcPort: clientPort,
      dstPort: 161,
      ttl: 64,
      traceId,
      payload: {
        snmpOp: opts.walk ? 'walk' : opts.setValue !== undefined ? 'set' : 'get',
        oid: String(oid || '.1.3.6.1.2.1.1.1.0'),
        community: String(community || ''),
        setValue: opts.setValue,
      },
    });
    run.rootPktId = req.id;

    if (!this.inject(src, req, traceId)) return { ok: false, reason: 'unreachable' };
    this.runManager.processUntil(traceId);

    if (run.status === 'ok') {
      const res = (run.snmp || {}) as Record<string, unknown> & {
        ok?: boolean;
        error?: string;
        oids?: SnmpQueryResult['oids'];
      };
      if (res.ok === false) {
        return { ok: false, reason: (res.reason as SnmpQueryResult['reason']) || (res.error ? 'auth' : 'timeout'), error: res.error, device: String(res.device || '') };
      }
      return { ok: true, device: String(res.device || ''), oids: res.oids || [] };
    }
    const raw = run.reason === 'no-agent' ? 'no-agent' : run.reason === 'auth' ? 'auth' : mapReason(run.reason);
    const reason: SnmpQueryResult['reason'] = (raw === 'ttl' || raw === 'self' || raw === 'blocked' || raw === 'refused') ? 'timeout' : raw;
    return { ok: false, reason, error: run.reason === 'auth' ? 'Bad community name' : undefined };
  }

  /** Suntik paket dari perangkat sumber ke jaringan (rute + ARP). */
  private inject(src: NetworkDevice, pkt: Packet, traceId: string): boolean {
    const candidates = src.getInterfaces().filter((i) => i.ip && i.up);
    const sameSub = candidates.find((i) => inSameSubnet(i.ip!.address, i.ip!.prefix, pkt.dstIp));

    const nh = src.routing.lookup(pkt.dstIp);
    let nextHop: string | null = null;
    if (nh && nh.gateway) nextHop = nh.gateway;
    else if (nh && nh.iface && sameSub) nextHop = pkt.dstIp;
    else {
      const def = src.getRoutes().find((r) => r.kind === 'static' && r.active !== false && (r.dst === '0.0.0.0/0' || r.dst === '0.0.0.0'));
      nextHop = def?.gateway || null;
    }
    if (!nextHop) {
      // host yang dapat IP via DHCP memakai gateway lease sebagai default route
      const lease = src.leases.get(sameSub?.name || candidates[0]?.name || '');
      if (lease?.gateway) nextHop = lease.gateway;
    }
    if (!nextHop) return false;

    // Interface keluar = subnet yang memuat next-hop (bukan sekadar iface pertama),
    // agar paket tidak tersasar ke link lain.
    const nhIface = src.resolveEgressIface(nextHop);
    const iface = nhIface || sameSub || candidates[0];
    if (!iface || !iface.ip) return false;

    pkt.srcIp = iface.ip.address;
    pkt.srcMac = iface.mac;
    return arpResolveAndSend(src, pkt, iface.name, nextHop, this.core, traceId);
  }

  private inject6(src: NetworkDevice, pkt: Packet, traceId: string): boolean {
    const candidates = src.getInterfaces().filter((i) => i.ipv6 && i.up);
    const sameSub = candidates.find((i) => inSameIpv6Subnet(i.ipv6!.address, i.ipv6!.prefix, pkt.dstIp));

    const nh = src.ipv6Routing.lookup(pkt.dstIp);
    let nextHop: string | null = null;
    if (nh && nh.gateway === 'discard') return false; // blackhole: dibuang diam-diam
    if (nh && nh.gateway) nextHop = nh.gateway;
    else if (sameSub) nextHop = pkt.dstIp;
    if (!nextHop) return false;

    const nhIface = src.resolveEgressIface6(nextHop);
    const iface = nhIface || sameSub || candidates[0];
    if (!iface || !iface.ipv6) return false;

    pkt.srcIp = iface.ipv6.address;
    pkt.srcMac = iface.mac;
    return ndpResolveAndSend(src, pkt, iface.name, nextHop, this.core, traceId);
  }

  private pingFail(reason: PingSimResult['reason']): PingSimResult {
    return { success: false, path: [], edgeIds: [], ttlAtDestination: 0, reason };
  }
}

/** Normalisasi alasan kegagalan run → alasan kompatibel API lama. */
function mapReason(reason: string | undefined): PingSimResult['reason'] {
  switch (reason) {
    case 'no-ip':
    case 'invalid':
    case 'not-found':
    case 'self':
    case 'blocked':
    case 'power':
    case 'refused':
    case 'ttl':
    case 'unreachable':
      return reason;
    default:
      return 'unreachable';
  }
}