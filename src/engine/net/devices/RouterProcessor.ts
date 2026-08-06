// ============================================================
// RouterProcessor — L3 routing engine:
// LPM, TTL, ICMP error, NAT, firewall, ARP, DHCP server, TCP handshake
// ============================================================

import { NetworkDevice } from './NetworkDevice';
import { DeviceProcessor, SimulatorCore } from './DeviceProcessor';
import { arpResolveAndSend } from './sendUtils';
import { Packet, IP_BROADCAST } from '../core/types';
import { isBroadcastMac } from '../layer2/EthernetFrame';
import { aclBlocks } from '../services/FirewallService';
import { NatTranslator } from '../layer4/Nat';
import { allocateIp, findServingPool, LeaseGrant } from '../services/DhcpService';
import { staticRecord } from '../services/DnsService';
import { parseCidr, ipToInt, networkOf, inSameSubnet } from '../core/ip';
import {
  ICMP_DEST_UNREACHABLE,
  ICMP_ECHO_REPLY,
  ICMP_ECHO_REQUEST,
  ICMP_TIME_EXCEEDED,
  IcmpPayload,
  buildDestUnreachable,
  buildTimeExceeded,
} from '../layer4/Icmp';
import { TCP_SYN, TCP_ACK, TcpSegment, buildTcpSegment, isSyn, isAck } from '../layer4/Tcp';
import { UDP_BOOTPS, UDP_BOOTPC, UDP_DNS } from '../layer4/Udp';

export class RouterProcessor implements DeviceProcessor {
  constructor(protected device: NetworkDevice) {}

  handlePacket(pkt: Packet, inPort: string, core: SimulatorCore, traceId: string): void {
    const dev = this.device;
    if (!dev.powered) {
      core.emit('PACKET_DROPPED', traceId, { reason: 'power' }, dev.id, inPort);
      core.drop(dev, pkt, 'power', traceId);
      return;
    }
    if (pkt.protocol === 'arp') {
      this.handleArp(pkt, inPort, core, traceId);
      return;
    }
    this.handleIp(pkt, inPort, core, traceId);
  }

  // ── ARP ──────────────────────────────────────────────────
  private handleArp(pkt: Packet, inPort: string, core: SimulatorCore, traceId: string): void {
    const dev = this.device;
    const p = (pkt.payload ?? {}) as { op?: number; senderIp?: string; senderMac?: string; targetIp?: string };
    if (!p.senderIp || !p.senderMac) {
      core.drop(dev, pkt, 'arp-malformed', traceId);
      return;
    }
    const mine = dev.hasIp(p.targetIp || '');

    if (p.op === 1) {
      // ARP request
      dev.arpCache.learn(p.senderIp, p.senderMac, inPort, core.now);
      core.emit('ARP_REQUEST', traceId, { who: p.targetIp, src: p.senderIp }, dev.id, inPort);
      if (mine) {
        const reply = core.createPacket({
          protocol: 'arp',
          srcMac: mine.mac,
          dstMac: p.senderMac,
          srcIp: p.targetIp!,
          dstIp: p.senderIp,
          ttl: 1,
          traceId,
          payload: { op: 2, senderIp: p.targetIp, senderMac: mine.mac, targetIp: p.senderIp },
        });
        reply.vlan = pkt.vlan;
        core.transmit(dev, reply, inPort, traceId);
        core.emit('ARP_REPLY', traceId, { for: p.senderIp, mac: mine.mac }, dev.id, inPort);
      } else {
        core.drop(dev, pkt, 'arp-not-for-me', traceId);
      }
    } else if (p.op === 2) {
      dev.arpCache.learn(p.senderIp, p.senderMac, inPort, core.now);
      core.emit('ARP_REPLY', traceId, { from: p.senderIp, mac: p.senderMac }, dev.id, inPort);
      core.flushArp(dev, p.senderIp, p.senderMac, traceId);
      core.drop(dev, pkt, 'arp-consumed', traceId);
    } else {
      core.drop(dev, pkt, 'arp-unknown', traceId);
    }
  }

  // ── IPv4 ─────────────────────────────────────────────────
  private handleIp(pkt: Packet, inPort: string, core: SimulatorCore, traceId: string): void {
    const dev = this.device;
    core.emit('PACKET_RECEIVED', traceId, { packetId: pkt.id }, dev.id, inPort);

    // L2 filter: frame harus untuk MAC saya / broadcast
    const forMyMac =
      isBroadcastMac(pkt.dstMac) ||
      [...dev.getInterfaces()].some((i) => i.mac.toLowerCase() === pkt.dstMac.toLowerCase());
    if (!forMyMac) {
      core.emit('PACKET_DROPPED', traceId, { reason: 'l2-filter' }, dev.id, inPort);
      core.drop(dev, pkt, 'l2-filter', traceId);
      return;
    }

    // Firewall ingress — rule dibaca per paket
    if (aclBlocks(dev, pkt)) {
      core.emit('FIREWALL_BLOCK', traceId, { dstIp: pkt.dstIp, srcIp: pkt.srcIp }, dev.id, inPort);
      const run = core.getRun(traceId);
      if (run && run.status === 'running') {
        run.blocked = true;
        run.status = 'fail';
        run.reason = 'blocked';
      }
      core.drop(dev, pkt, 'firewall', traceId);
      return;
    }

    // Layanan UDP broadcast (DHCP server) — hanya untuk device yang punya pool
    if (pkt.protocol === 'udp' && pkt.dstPort === UDP_BOOTPS && dev.dhcpPools.length > 0) {
      this.handleDhcpServer(pkt, inPort, core, traceId);
      return;
    }

    // Trafik balik NAT masquerade: tujuan IP saya tapi ada sesi → kembalikan dstIp asli
    if (dev.hasIp(pkt.dstIp)) {
      if (dev.nat.unmasquerade(pkt)) {
        core.emit('NAT_REWRITE', traceId, { action: 'unmasquerade', to: pkt.dstIp }, dev.id, inPort);
      }
    }

    let myIface = dev.hasIp(pkt.dstIp);

    // dstnat / port-forward
    const dstnat = NatTranslator.dstnatRule(dev.natRules, pkt.dstIp, pkt.dstPort, pkt.protocol);
    if (dstnat) {
      pkt.dstIp = NatTranslator.toAddresses(dstnat);
      pkt.dstPort = NatTranslator.toPort(dstnat, pkt.dstPort);
      core.emit('NAT_REWRITE', traceId, { action: 'dstnat', to: pkt.dstIp }, dev.id, inPort);
      myIface = dev.hasIp(pkt.dstIp);
    }

    if (myIface) {
      this.localDelivery(pkt, inPort, myIface.name, core, traceId);
      return;
    }

    // DHCP client: offer/ack server datang dengan dstIp broadcast/0.0.0.0,
    // tapi frame ditujukan ke MAC kita → terima sebagai trafik lokal.
    if (pkt.protocol === 'udp' && pkt.dstPort === UDP_BOOTPC && forMyMac) {
      const inIface = dev.getIfaceByPortId(inPort) || dev.getIfaceByName(inPort);
      if (inIface) {
        this.localDelivery(pkt, inPort, inIface.name, core, traceId);
        return;
      }
    }

    // Bukan untuk saya
    if (dev.kind === 'pc' || dev.kind === 'server') {
      core.drop(dev, pkt, 'not-for-me', traceId);
      return;
    }

    // TTL
    if (pkt.ttl <= 1) {
      core.emit('TTL_EXCEEDED', traceId, { srcIp: pkt.srcIp, dstIp: pkt.dstIp }, dev.id, inPort);
      const run = core.getRun(traceId);
      if (run && run.status === 'running') {
        run.ttlExpired = true;
        run.status = 'fail';
        run.reason = 'ttl';
      }
      this.sendIcmpError(pkt, inPort, buildTimeExceeded(), core, traceId);
      core.drop(dev, pkt, 'ttl-expired', traceId);
      return;
    }
    pkt.ttl -= 1;

    // Routing — longest prefix match
    const nh = dev.routing.lookup(pkt.dstIp);
    if (!nh) {
      core.emit('ICMP_ERROR', traceId, { reason: 'no-route' }, dev.id, inPort);
      const run = core.getRun(traceId);
      if (run && run.status === 'running') {
        run.unreachable = true;
        run.status = 'fail';
        run.reason = 'unreachable';
      }
      this.sendIcmpError(pkt, inPort, buildDestUnreachable(), core, traceId);
      core.drop(dev, pkt, 'no-route', traceId);
      return;
    }

    let egressName = nh.iface || (nh.gateway ? dev.resolveEgressIface(nh.gateway)?.name || null : null);
    if (!egressName) {
      const firstUp = dev.getInterfaces().find((i) => i.up && i.ip);
      egressName = firstUp?.name || null;
    }
    const egress = egressName ? dev.getIfaceByName(egressName) : null;
    if (!egress || !egress.up || !egress.ip) {
      core.drop(dev, pkt, 'egress-down', traceId);
      return;
    }
    const nextHopIp = nh.gateway || pkt.dstIp;

    // srcnat masquerade di interface keluar
    const masq = NatTranslator.srcnatRule(dev.natRules, egress.name);
    if (masq && pkt.srcIp !== egress.ip.address) {
      dev.nat.masquerade(pkt, egress.ip.address, egress.name);
      core.emit('NAT_REWRITE', traceId, { action: 'masquerade', to: egress.ip.address }, dev.id, egress.name);
    }

    // ARP untuk next hop → rewrite MAC, baru transmit
    arpResolveAndSend(dev, pkt, egress.name, nextHopIp, core, traceId);
  }

  private sendIcmpError(pkt: Packet, inPort: string, error: IcmpPayload, core: SimulatorCore, traceId: string): void {
    const dev = this.device;
    const inIface = dev.getIfaceByPortId(inPort) || dev.getIfaceByName(inPort);
    if (!inIface) return;
    const err = core.createPacket({
      protocol: 'icmp',
      srcMac: inIface.mac,
      dstMac: pkt.srcMac,
      srcIp: pkt.dstIp || inIface.ip?.address || '0.0.0.0',
      dstIp: pkt.srcIp,
      ttl: 64,
      traceId,
      payload: { ...error },
    });
    core.transmit(dev, err, inIface.name, traceId);
  }

  // ── Local delivery ───────────────────────────────────────
  protected localDelivery(pkt: Packet, inPort: string, ifaceName: string, core: SimulatorCore, traceId: string): void {
    const dev = this.device;
    const iface = dev.getIfaceByName(ifaceName);
    if (!iface) return;

    if (pkt.protocol === 'icmp') {
      const p = (pkt.payload ?? {}) as unknown as IcmpPayload;
      if (p.type === ICMP_ECHO_REQUEST) {
        // simpan TTL saat tiba di tujuan
        pkt.flags['ttlAtDst'] = pkt.ttl;
        const reply = core.createPacket({
          protocol: 'icmp',
          srcMac: iface.mac,
          dstMac: pkt.srcMac,
          srcIp: pkt.dstIp,
          dstIp: pkt.srcIp,
          ttl: 64,
          traceId,
          payload: { type: ICMP_ECHO_REPLY, code: 0, seq: p.seq, id: p.id },
        });
        // bawa trace request agar lintasan utuh di reply
        reply.hops = pkt.hops.slice();
        reply.edgeIds = pkt.edgeIds.slice();
        reply.trace = pkt.trace.slice();
        core.transmit(dev, reply, iface.name, traceId);
        core.emit('PING_REPLY', traceId, { seq: p.seq }, dev.id, iface.name);
      } else if (p.type === ICMP_ECHO_REPLY) {
        core.emit('PING_REPLY', traceId, { seq: p.seq, arrived: true }, dev.id, iface.name);
        const run = core.getRun(traceId);
        if (run && run.status === 'running') {
          run.status = 'ok';
          run.ttlAtDst = (pkt.flags['ttlAtDst'] as number) || 64;
        }
        core.drop(dev, pkt, 'consumed', traceId);
      } else if (p.type === ICMP_TIME_EXCEEDED) {
        const run = core.getRun(traceId);
        if (run && run.status === 'running') {
          run.ttlExpired = true;
          run.status = 'fail';
          run.reason = 'ttl';
        }
        core.drop(dev, pkt, 'icmp-error', traceId);
      } else if (p.type === ICMP_DEST_UNREACHABLE) {
        const run = core.getRun(traceId);
        if (run && run.status === 'running') {
          run.unreachable = true;
          run.status = 'fail';
          run.reason = 'unreachable';
        }
        core.drop(dev, pkt, 'icmp-error', traceId);
      } else {
        core.drop(dev, pkt, 'icmp-unknown', traceId);
      }
      return;
    }

    if (pkt.protocol === 'tcp') {
      this.handleTcp(pkt, inPort, iface, core, traceId);
      return;
    }

    if (pkt.protocol === 'udp') {
      this.handleUdpLocal(pkt, inPort, iface, core, traceId);
      return;
    }

    core.drop(dev, pkt, 'unsupported', traceId);
  }

  protected handleTcp(pkt: Packet, inPort: string, iface: { name: string; mac: string; ip?: { address: string; prefix: number } }, core: SimulatorCore, traceId: string): void {
    const dev = this.device;
    const seg = (pkt.payload ?? {}) as unknown as TcpSegment;
    const run = core.getRun(traceId);

    if (isSyn(seg) && !isAck(seg)) {
      core.emit('TCP_SYN', traceId, { port: pkt.dstPort }, dev.id, iface.name);
      const web = dev.webServer;
      if (!web || !web.enabled || pkt.dstPort !== web.port) {
        core.emit('PACKET_DROPPED', traceId, { reason: 'refused' }, dev.id, iface.name);
        if (run && run.status === 'running') {
          run.refused = true;
          run.status = 'fail';
          run.reason = 'refused';
        }
        core.drop(dev, pkt, 'refused', traceId);
        return;
      }
      const iseq = Math.floor(Math.random() * 50000) + 1000;
      const reply = core.createPacket({
        protocol: 'tcp',
        srcMac: iface.mac,
        dstMac: pkt.srcMac,
        srcIp: pkt.dstIp,
        dstIp: pkt.srcIp,
        srcPort: pkt.dstPort,
        dstPort: pkt.srcPort,
        ttl: 64,
        traceId,
        payload: { ...buildTcpSegment(pkt.dstPort, pkt.srcPort, iseq, seg.seq + 1, TCP_SYN | TCP_ACK) },
      });
      reply.hops = pkt.hops.slice();
      reply.edgeIds = pkt.edgeIds.slice();
      reply.trace = pkt.trace.slice();
      reply.flags['serverSeq'] = iseq;
      reply.flags['webContent'] = dev.webServer?.content || '';
      core.transmit(dev, reply, iface.name, traceId);
      core.emit('TCP_SYN_ACK', traceId, { seq: iseq, ack: seg.seq + 1 }, dev.id, iface.name);
    } else if (isAck(seg) && isSyn(seg)) {
      // Client menerima SYN-ACK → 3-way handshake selesai, kirim ACK balik.
      core.emit('TCP_ACK', traceId, {}, dev.id, iface.name);
      if (run && run.status === 'running') {
        run.status = 'ok';
        run.statusCode = 200;
        run.body = String(pkt.flags['webContent'] ?? '');
        run.handshake = [
          { seq: seg.ack - 1, ack: 0, flags: 'SYN' },
          { seq: seg.seq, ack: seg.ack, flags: 'SYN-ACK' },
          { seq: seg.ack, ack: seg.seq + 1, flags: 'ACK' },
        ];
      }
      const ack = core.createPacket({
        protocol: 'tcp',
        srcMac: iface.mac,
        dstMac: pkt.srcMac,
        srcIp: pkt.dstIp,
        dstIp: pkt.srcIp,
        srcPort: pkt.dstPort,
        dstPort: pkt.srcPort,
        ttl: 64,
        traceId,
        flags: { tcp: 'ack' },
        payload: { ...buildTcpSegment(pkt.dstPort, pkt.srcPort, seg.ack, seg.seq + 1, TCP_ACK) },
      });
      if (iface.ip && inSameSubnet(iface.ip.address, iface.ip.prefix, pkt.srcIp)) {
        arpResolveAndSend(dev, ack, iface.name, pkt.srcIp, core, traceId);
      } else {
        core.transmit(dev, ack, iface.name, traceId);
      }
      core.drop(dev, pkt, 'consumed', traceId);
    } else if (isAck(seg)) {
      // Server menerima ACK final → catat koneksi server-side.
      core.emit('TCP_ACK', traceId, {}, dev.id, iface.name);
      dev.tcpConnections.push({
        localIp: pkt.dstIp,
        localPort: pkt.dstPort,
        remoteIp: pkt.srcIp,
        remotePort: pkt.srcPort,
        state: 'ESTABLISHED',
        proto: 'tcp',
      });
      core.drop(dev, pkt, 'consumed', traceId);
    } else {
      core.drop(dev, pkt, 'tcp-unknown', traceId);
    }
  }

  protected handleUdpLocal(pkt: Packet, inPort: string, iface: { name: string; mac: string }, core: SimulatorCore, traceId: string): void {
    const dev = this.device;
    if (pkt.dstPort === UDP_DNS) {
      const name = String((pkt.payload as Record<string, unknown> | null)?.name || '');
      const rec = staticRecord(dev, name);
      if (rec && pkt.srcIp && pkt.srcIp !== '0.0.0.0' && pkt.srcMac) {
        const reply = core.createPacket({
          protocol: 'udp',
          srcMac: iface.mac,
          dstMac: pkt.srcMac,
          srcIp: pkt.dstIp,
          dstIp: pkt.srcIp,
          srcPort: UDP_DNS,
          dstPort: pkt.srcPort,
          ttl: 64,
          traceId,
          payload: { address: rec, name },
        });
        core.transmit(dev, reply, iface.name, traceId);
      }
      core.drop(dev, pkt, 'dns-consumed', traceId);
      return;
    }
    core.drop(dev, pkt, 'udp-unknown', traceId);
  }

  // ── DHCP server (DORA) ───────────────────────────────────
  private handleDhcpServer(pkt: Packet, inPort: string, core: SimulatorCore, traceId: string): void {
    const dev = this.device;
    const p = (pkt.payload ?? {}) as Record<string, unknown> & { type?: string; xid?: number };

    if (p.type === 'discover') {
      core.emit('DHCP_DISCOVER', traceId, { xid: p.xid, mac: pkt.srcMac }, dev.id, inPort);
      const pool = findServingPool(dev, inPort);
      const grant = pool ? this.grantFromPool(dev, pool, core) : null;
      if (!grant) {
        core.drop(dev, pkt, 'dhcp-no-pool', traceId);
        return;
      }
      const offer = core.createPacket({
        protocol: 'udp',
        srcMac: (dev.getIfaceByPortId(inPort) || dev.getIfaceByName(inPort))?.mac || pkt.dstMac,
        dstMac: pkt.srcMac,
        srcIp: (dev.getIfaceByPortId(inPort) || dev.getIfaceByName(inPort))?.ip?.address || '0.0.0.0',
        dstIp: pkt.srcIp === '0.0.0.0' ? '255.255.255.255' : pkt.srcIp,
        srcPort: UDP_BOOTPS,
        dstPort: UDP_BOOTPC,
        ttl: 64,
        traceId,
        payload: { type: 'offer', xid: p.xid, ...grant },
      });
      core.transmit(dev, offer, inPort, traceId);
      core.emit('DHCP_OFFER', traceId, { ip: grant.ip }, dev.id, inPort);
      core.drop(dev, pkt, 'dhcp-consumed', traceId);
    } else if (p.type === 'request') {
      core.emit('DHCP_REQUEST', traceId, { xid: p.xid }, dev.id, inPort);
      const pool = findServingPool(dev, inPort);
      if (!pool) {
        core.drop(dev, pkt, 'dhcp-no-pool', traceId);
        return;
      }
      const requestedIp = String(p.requestedIp || '');
      const grant =
        requestedIp && this.ipInPool(requestedIp, pool)
          ? this.ackForPool(pool, requestedIp)
          : this.grantFromPool(dev, pool, core);
      if (!grant) {
        core.drop(dev, pkt, 'dhcp-pool-full', traceId);
        return;
      }
      const ack = core.createPacket({
        protocol: 'udp',
        srcMac: (dev.getIfaceByPortId(inPort) || dev.getIfaceByName(inPort))?.mac || pkt.dstMac,
        dstMac: pkt.srcMac,
        srcIp: (dev.getIfaceByPortId(inPort) || dev.getIfaceByName(inPort))?.ip?.address || '0.0.0.0',
        dstIp: pkt.srcIp === '0.0.0.0' ? '255.255.255.255' : pkt.srcIp,
        srcPort: UDP_BOOTPS,
        dstPort: UDP_BOOTPC,
        ttl: 64,
        traceId,
        payload: { type: 'ack', xid: p.xid, ...grant },
      });
      core.transmit(dev, ack, inPort, traceId);
      core.emit('DHCP_ACK', traceId, { ip: grant.ip }, dev.id, inPort);
      core.drop(dev, pkt, 'dhcp-consumed', traceId);
    } else {
      core.drop(dev, pkt, 'dhcp-unknown', traceId);
    }
  }

  private grantFromPool(dev: NetworkDevice, pool: NonNullable<ReturnType<typeof findServingPool>>, core: SimulatorCore): LeaseGrant | null {
    const alloc = allocateIp(dev, pool, core.usedIps());
    if (!alloc) return null;
    return { ip: alloc.ip, gateway: alloc.gateway, prefix: alloc.prefix, poolNodeId: dev.id };
  }

  private ipInPool(ip: string, pool: NonNullable<ReturnType<typeof findServingPool>>): boolean {
    if (pool.range) {
      const m = pool.range.match(/(\d+\.\d+\.\d+\.\d+)\s*-\s*(\d+\.\d+\.\d+\.\d+)/);
      if (!m) return pool.range.trim() === ip;
      const n = ipToInt(ip);
      return n >= ipToInt(m[1]) && n <= ipToInt(m[2]);
    }
    if (pool.network) {
      const parsed = parseCidr(pool.network);
      if (!parsed) return false;
      return networkOf(ip, parsed.prefix) === networkOf(parsed.address, parsed.prefix);
    }
    return false;
  }

  private ackForPool(pool: NonNullable<ReturnType<typeof findServingPool>>, ip: string): LeaseGrant {
    const prefix =
      (pool.network ? parseCidr(pool.network)?.prefix : null) ??
      this.device.getIfaceByName(pool.iface || '')?.ip?.prefix ??
      24;
    const gateway = pool.gateway || this.device.getIfaceByName(pool.iface || '')?.ip?.address || '';
    return { ip, prefix, gateway, poolNodeId: this.device.id };
  }
}
