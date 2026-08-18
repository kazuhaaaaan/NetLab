// ============================================================
// RunManager — SimulationRuntime: siklus hidup run + eksekusi event.
//
// PEMILIK TUNGGAL state `runs` dan penghitung `runSeq`.
// Bertanggung jawab:
//   - penciptaan/status run (running → ok/fail + reason)
//   - scheduling eksekusi: processUntil (scheduler pop → dispatch)
//   - dispatch PACKET_SEND ke DeviceProcessor
//   - AGING berkala (MAC/ARP aging, lease expiry, NAT prune,
//     timeout ARP buffer, reschedule)
// ============================================================

import { Packet, SimEvent } from './types';
import { ARP_RESOLVE_TIMEOUT_MS, BufferedFrame, Run, SimulationContext, SimRunOptions, createRunEntry } from './SimulationContext';
import { SimulationCore } from './SimulationCore';

export class RunManager {
  private runSeq = 0;

  constructor(
    private readonly ctx: SimulationContext,
    /** Primitif packet pipeline (emit/drop) — RunManager bukan pemilik state-nya. */
    private readonly core: SimulationCore
  ) {}

  clearRuns(): void {
    this.ctx.runs.clear();
  }

  /** Dapatkan run; run yang belum ada dibuat (semantik kompatibel API lama). */
  getRun(traceId: string): Run {
    const run = this.ctx.runs.get(traceId);
    if (run) return run;
    return createRunEntry(this.ctx, traceId);
  }

  beginRun(traceId: string): Run {
    return createRunEntry(this.ctx, traceId);
  }

  failRunIfRoot(traceId: string, reason: Run['reason']): void {
    const run = this.ctx.runs.get(traceId);
    if (run && run.status === 'running') {
      run.status = 'fail';
      run.reason = reason;
    }
  }

  /** Jalankan scheduler sampai run selesai / timeout / guard event. */
  processUntil(traceId: string, opts?: SimRunOptions): void {
    const run = this.ctx.runs.get(traceId);
    if (!run) return;
    const maxEvents = opts?.maxEvents ?? 500_000;
    const maxTimeMs = opts?.maxTimeMs ?? 20_000;
    const t0 = run.start;
    let guard = 0;
    while (run.status === 'running') {
      const evt = this.ctx.scheduler.pop();
      if (!evt) break;
      if (evt.time - t0 > maxTimeMs) {
        run.status = 'fail';
        run.reason = 'timeout';
        break;
      }
      this.ctx.time.advanceTo(evt.time);
      this.dispatchEvent(evt);
      if (++guard > maxEvents) {
        run.status = 'fail';
        run.reason = 'timeout';
        break;
      }
    }
  }

  private dispatchEvent(evt: SimEvent): void {
    if (evt.type === 'AGING') {
      this.ageAll(evt.time);
      return;
    }
    if (evt.type !== 'PACKET_SEND') return;
    const d = evt.data as { pkt: Packet; traceId: string };
    const device = evt.nodeId ? this.ctx.nodes.get(evt.nodeId) : null;
    if (!device) return;

    const pkt = d.pkt;
    if (!device.powered) {
      this.core.drop(device, pkt, 'power', d.traceId);
      this.failRunIfRoot(d.traceId, 'power');
      return;
    }

    const run = this.ctx.runs.get(d.traceId);
    const dir = pkt.flags['dir'] === 'reply' ? 'rev' : 'fwd';
    pkt.hops.push({ nodeId: device.id, port: evt.port || '', time: this.ctx.time.now(), direction: dir });

    // Penghitung ingress per interface (SNMP ifInOctets/ifInUcastPkts).
    const inIface = device.getIfaceByPortId(evt.port || '') || device.getIfaceByName(evt.port || '');
    if (inIface) {
      const c = device.ifaceCounters.get(inIface.name) || { inPkts: 0, outPkts: 0, inOctets: 0, outOctets: 0 };
      c.inPkts += 1;
      c.inOctets += Math.max(pkt.size, 64);
      device.ifaceCounters.set(inIface.name, c);
    }

    if (run && dir === 'fwd' && pkt.correlationId === d.traceId && pkt.flags['dir'] === 'req') {
      if (run.fwdPath[run.fwdPath.length - 1] !== device.name) run.fwdPath.push(device.name);
    }

    const proc = this.ctx.processors.get(device.id);
    if (proc) proc.handlePacket(pkt, evt.port || '', this.core, d.traceId);
  }

  private ageAll(now: number): void {
    for (const dev of this.ctx.nodes.values()) {
      const agedMac = dev.macTable.age(now);
      if (agedMac.length > 0) this.core.emit('MAC_AGED', `aging-${dev.id}`, { macs: agedMac }, dev.id);
      const agedArp = dev.arpCache.age(now);
      if (agedArp.length > 0) this.core.emit('DEBUG_TRACE', `aging-${dev.id}`, { arpAged: agedArp }, dev.id);
      // Neighbor cache IPv6 (NDP) ikut di-age — entry stale tidak menempel.
      const agedNdp = dev.ipv6Neighbors.age(now);
      if (agedNdp.length > 0) this.core.emit('DEBUG_TRACE', `aging-${dev.id}`, { ndpAged: agedNdp }, dev.id);
      // Cache DNS klien (TTL 300s) di-age bersama siklus aging.
      for (const [name, entry] of [...dev.dnsCache.entries()]) {
        if (entry.expiresAt <= now) dev.dnsCache.delete(name);
      }
      // Lease DHCP yang kedaluwarsa dikembalikan ke pool.
      for (const [iface, lease] of [...dev.leases.entries()]) {
        if (lease.expiresAt <= now) dev.leases.delete(iface);
      }
      // Sesi NAT yang menganggur dibersihkan.
      dev.nat.prune(now);
    }
    // ARP/NDP yang tidak terjawab: paket yang menunggu MAC next-hop melebihi
    // batas waktu di-buffer dibuang dengan alasan deterministik ARP_UNRESOLVED
    // (bukan menggantung sampai timeout run; buffer juga tidak menumpuk).
    for (const [key, list] of [...this.core.arpBuffers.entries()]) {
      const devId = key.split('|')[0];
      const dev = this.ctx.nodes.get(devId);
      const live: BufferedFrame[] = [];
      for (const b of list) {
        if (now - b.pkt.created >= ARP_RESOLVE_TIMEOUT_MS) {
          if (dev) this.core.drop(dev, b.pkt, 'arp-unresolved', b.traceId);
        } else {
          live.push(b);
        }
      }
      if (live.length === 0) this.core.arpBuffers.delete(key);
      else this.core.arpBuffers.set(key, live);
    }
    // jadwal ulang
    const next = now + 5000;
    this.ctx.scheduler.schedule({ type: 'AGING', traceId: 'aging', data: {} }, next);
  }
}