// ============================================================
// SimulationCore — PacketRuntime: primitif pipeline paket.
// Implementasi interface SimulatorCore yang dipakai DeviceProcessor
// (emit/createPacket/transmit/drop/ARP buffering) + kepemilikan
// eventLog, arpBuffers, dan penghitung id paket.
//
// Pipeline transmission (dipertahankan persis dari NetworkSimulator lama):
//   ingress → interface validation (up/shutdown) → VLAN tag subinterface
//   → link/neighbor/powered check → QoS (mangle + simple queue)
//   → transmission delay → scheduler (PACKET_SEND) → event log.
//
// PIPELINE PAKET KANONIK (seluruh engine — ingress di DeviceProcessor,
// egress di sini; urutan persis implementasi lama, tidak diubah):
//
//   Ingress (DeviceProcessor.handlePacket per jenis perangkat)
//    ↓ powered check
//    ↓ interface validation (up/shutdown)
//    ↓ ARP/NDP (router) — diproses di jalur tersendiri
//    ↓ STP port state (switch/wireless: blocking/alternate tidak meneruskan)
//    ↓ ACL/firewall ingress (applyAclDeny; DHCP bootstrap dikecualikan)
//    ↓ L2 processing (switch: VLAN classification access/trunk/native,
//    ↓   VlanTable otoritatif, MAC learning, port security)
//    ↓ L3 lookup (router: LPM routing table; firewall/NAT chain)
//    ↓ NAT (dstnat → masquerade/unmasquerade)
//    ↓ TTL / ICMP error
//    ↓ Egress (SimulationCore.transmit)
//    ↓ interface validation (up/shutdown) + VLAN tag subinterface
//    ↓ link/neighbor/powered check
//    ↓ QoS (mangle + simple queue token bucket)
//    ↓ transmission delay → scheduler (PACKET_SEND)
//    ↓ Destination processing (handlePacket hop berikutnya)
//
// Urutan ini diverifikasi oleh run_all_tests.mts (1498 assertions) dan
// TIDAK BOLEH diubah tanpa membuktikan bug networking semantics lebih dulu.
// ============================================================

import { NetworkDevice } from '../devices/NetworkDevice';
import { Packet, RunResult, SimEvent, SimEventType } from './types';
import { BufferedFrame, DEFAULT_TTL, Run, SimulationContext, createRunEntry } from './SimulationContext';
import { applyMangle, applyQos } from '../services/QosService';
import { transmissionDelay } from './Topology';
import { dropCodeOf } from './dropReasons';
import { ConfigStore } from './ConfigStore';

export class SimulationCore {
  private seq = 0;
  private pktSeq = 0;
  readonly arpBuffers = new Map<string, BufferedFrame[]>();
  private _eventLog: SimEvent[] = [];

  constructor(
    private readonly ctx: SimulationContext,
    /** Status daya perangkat (poweredOff) — state milik ConfigStore. */
    private readonly configStore: ConfigStore
  ) {}

  get now(): number {
    return this.ctx.time.now();
  }

  get eventLog(): SimEvent[] {
    return this._eventLog;
  }

  clearEventLog(): void {
    this._eventLog = [];
  }

  clearArpBuffers(): void {
    this.arpBuffers.clear();
  }

  emit(type: SimEventType, traceId: string, data: Record<string, unknown>, nodeId?: string, port?: string): void {
    const evt: SimEvent = {
      id: `evt-${this.seq++}`,
      traceId,
      type,
      time: this.ctx.time.now(),
      nodeId,
      port,
      data,
    };
    this._eventLog.push(evt);
    // Batasi log agar sesi panjang tidak menumpuk memori tanpa batas.
    if (this._eventLog.length > 5000) this._eventLog.splice(0, this._eventLog.length - 5000);
    this.ctx.bus.emit(evt);
  }

  createPacket(opts: Partial<Packet> & { protocol: Packet['protocol']; traceId: string }): Packet {
    const id = `pkt-${++this.pktSeq}`;
    const pkt: Packet = {
      id,
      correlationId: opts.correlationId || opts.traceId,
      parentId: opts.parentId,
      protocol: opts.protocol,
      srcMac: opts.srcMac || '',
      dstMac: opts.dstMac || '',
      srcIp: opts.srcIp || '',
      dstIp: opts.dstIp || '',
      srcPort: opts.srcPort || 0,
      dstPort: opts.dstPort || 0,
      vlan: opts.vlan ?? null,
      ttl: opts.ttl ?? DEFAULT_TTL,
      flags: { ...opts.flags },
      payload: opts.payload ? { ...opts.payload } : null,
      size: opts.size || 64,
      created: this.ctx.time.now(),
      hops: [],
      edgeIds: [],
      trace: [`t=${this.ctx.time.now()} pkt=${id} created`],
      destroyed: false,
    };
    this.emit('PACKET_CREATED', opts.traceId, { packetId: id, protocol: opts.protocol, size: pkt.size });
    return pkt;
  }

  transmit(device: NetworkDevice, pkt: Packet, outPort: string, traceId: string): boolean {
    const iface = device.getIfaceByName(outPort) || device.getIfaceByPortId(outPort) || null;
    // Resolusi port fisik untuk topologi: subinterface (VLAN) menunjuk parentPort berupa NAMA
    // interface, padahal topologi memakai port ID (mis. 'port3') → telusuri hingga interface fisik.
    let portId = outPort;
    if (iface) {
      let phys: ReturnType<NetworkDevice['getIfaceByName']> | null = iface;
      while (phys && phys.parentPort) phys = device.getIfaceByName(phys.parentPort);
      portId = phys?.portId || iface.parentPort || iface.portId || outPort;
    }
    // Interface keluar mati (shutdown) → frame tidak pernah dikirim.
    // Berlaku untuk SEMUA perangkat (switch/wireless/router), termasuk port
    // fisik induk subinterface VLAN.
    const physIface = device.getIfaceByPortId(portId) || device.getIfaceByName(portId) || iface;
    if (!physIface || !physIface.up) {
      this.drop(device, pkt, 'iface-down', traceId);
      return false;
    }
    // Keluar lewat subinterface (VLAN) → tandai tag agar switch meneruskannya ke VLAN yang benar.
    if (iface && iface.type === 'vlan' && iface.vlanId) pkt.vlan = iface.vlanId;
    const neighbor = this.ctx.topology.links.neighborOf(device.id, portId);
    if (!neighbor) return false;
    // Link dimatikan (failure injection) → frame hilang di kabel.
    const link = this.ctx.topology.links.linkById(neighbor.linkId);
    if (link?.down) return false;
    // Perangkat tujuan mati = link down: frame hilang di kabel tanpa
    // menggagalkan run (fisiknya memang tidak sampai ke perangkat).
    if (!this.configStore.isNodePowered(neighbor.nodeId)) return false;

    // QoS: mangle (mark-packet/change-mss) lalu simple queue (token bucket).
    if (pkt.protocol !== 'arp') {
      applyMangle(device, pkt);
      if (!applyQos(device, pkt, this.ctx.time.now())) {
        this.drop(device, pkt, 'qos', traceId);
        return false;
      }
    }
    const delay = transmissionDelay(link, pkt);

    // track lintasan request (dir=req) pada run
    if (pkt.flags['dir'] === 'req' && pkt.correlationId === traceId) {
      const run = this.ctx.runs.get(traceId);
      if (run && run.rootPktId === pkt.id) {
        if (run.fwdEdges[run.fwdEdges.length - 1] !== neighbor.linkId) run.fwdEdges.push(neighbor.linkId);
      }
    }
    if (!pkt.edgeIds.includes(neighbor.linkId)) pkt.edgeIds.push(neighbor.linkId);

    const frame = clonePacket(pkt);
    this.countEgress(device, portId, pkt);
    this.ctx.scheduler.schedule(
      { type: 'PACKET_SEND', traceId, nodeId: neighbor.nodeId, port: neighbor.port, data: { pkt: frame, traceId } },
      this.ctx.time.now() + delay
    );
    this.emit('PACKET_QUEUED', traceId, { packetId: pkt.id, to: neighbor.nodeId, port: neighbor.port, delay, outPort }, device.id, outPort);
    this.emit('PACKET_SEND', traceId, { packetId: pkt.id, to: neighbor.nodeId, port: neighbor.port, delay }, device.id, outPort);
    this.emit('PACKET_TRANSMITTED', traceId, { packetId: pkt.id, to: neighbor.nodeId, port: neighbor.port, linkId: neighbor.linkId }, device.id, outPort);
    return true;
  }

  drop(device: NetworkDevice, pkt: Packet, reason: string, traceId: string): void {
    pkt.destroyed = true;
    pkt.trace.push(`t=${this.ctx.time.now()} drop:${reason}@${device.id}`);
    // `code` = kode drop deterministik (PORT_DOWN, VLAN_MISMATCH, NO_ROUTE,
    // ACL_DENY, FIREWALL_DENY, TTL_EXPIRED, NAT_FAILURE, ARP_UNRESOLVED, ...)
    // — kanonik dan stabil untuk assertion, di samping reason detail.
    this.emit('PACKET_DROPPED', traceId, { packetId: pkt.id, reason, code: dropCodeOf(reason), srcIp: pkt.srcIp, dstIp: pkt.dstIp }, device.id);
  }

  bufferForArp(device: NetworkDevice, targetIp: string, pkt: Packet, outPort: string, traceId: string): void {
    const key = `${device.id}|${targetIp}`;
    const list = this.arpBuffers.get(key) || [];
    list.push({ pkt, outPort, traceId });
    this.arpBuffers.set(key, list);
  }

  flushArp(device: NetworkDevice, ip: string, mac: string, traceId: string): void {
    const key = `${device.id}|${ip}`;
    const list = this.arpBuffers.get(key);
    if (!list || list.length === 0) return;
    this.arpBuffers.delete(key);
    for (const b of list) {
      const egress = device.getIfaceByName(b.outPort) || device.getIfaceByPortId(b.outPort);
      if (!egress) continue;
      b.pkt.srcMac = egress.mac;
      b.pkt.dstMac = mac;
      this.transmit(device, b.pkt, egress.name, b.traceId);
    }
  }

  usedIps(): Set<string> {
    const set = new Set<string>();
    const now = this.ctx.time.now();
    for (const dev of this.ctx.nodes.values()) {
      for (const i of dev.getInterfaces()) if (i.ip) set.add(i.ip.address);
      // Lease kedaluwarsa tidak dihitung (IP dikembalikan ke pool).
      for (const lease of dev.leases.values()) if (lease.expiresAt > now) set.add(lease.ip);
    }
    return set;
  }

  isIpLeasedTo(ip: string, mac: string): boolean {
    const m = (mac || '').toLowerCase();
    for (const dev of this.ctx.nodes.values()) {
      for (const lease of dev.leases.values()) {
        if (lease.ip !== ip) continue;
        if ([...dev.getInterfaces()].some((i) => i.mac.toLowerCase() === m)) return true;
      }
    }
    return false;
  }

  /** Hapus semua lease dengan IP itu (DHCP release — IP kembali ke pool). */
  releaseLease(ip: string): void {
    for (const dev of this.ctx.nodes.values()) {
      for (const [iface, lease] of [...dev.leases.entries()]) {
        if (lease.ip === ip) dev.leases.delete(iface);
      }
    }
  }

  /** Catat paket keluar pada penghitung interface (SNMP ifOutOctets/ifOutUcastPkts). */
  private countEgress(device: NetworkDevice, outPort: string, pkt: Packet): void {
    const iface = device.getIfaceByName(outPort) || device.getIfaceByPortId(outPort);
    if (!iface) return;
    const c = device.ifaceCounters.get(iface.name) || { inPkts: 0, outPkts: 0, inOctets: 0, outOctets: 0 };
    c.outPkts += 1;
    c.outOctets += Math.max(pkt.size, 64);
    device.ifaceCounters.set(iface.name, c);
  }

  /** Status flow yang sedang berjalan — run yang belum ada dibuat (semantik SimulatorCore lama). */
  getRun(traceId: string): RunResult {
    const run = this.ctx.runs.get(traceId);
    if (run) return run;
    return createRunEntry(this.ctx, traceId);
  }

  queueSnapshot(): { pending: number; nextArrival?: number } {
    return { pending: this.ctx.scheduler.size, nextArrival: this.ctx.scheduler.peek()?.time };
  }
}

function clonePacket(pkt: Packet): Packet {
  return {
    ...pkt,
    flags: { ...pkt.flags },
    payload: pkt.payload ? { ...pkt.payload } : null,
    hops: pkt.hops.slice(),
    edgeIds: pkt.edgeIds.slice(),
    trace: pkt.trace.slice(),
  };
}