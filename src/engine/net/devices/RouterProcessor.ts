// ============================================================
// RouterProcessor — L3 routing engine:
// LPM, TTL, ICMP error, NAT, firewall, ARP, DHCP server, TCP handshake
// ============================================================

import { NetworkDevice } from './NetworkDevice';
import { DeviceProcessor, SimulatorCore } from './DeviceProcessor';
import { arpResolveAndSend } from './sendUtils';
import { Packet, IP_BROADCAST } from '../core/types';
import { isBroadcastMac } from '../layer2/EthernetFrame';
import { applyAclDeny } from '../services/FirewallService';
import { NatTranslator } from '../layer4/Nat';
import { allocateIp, findServingPool, LeaseGrant } from '../services/DhcpService';
import { staticRecord } from '../services/DnsService';
import { parseCidr, ipToInt, networkOf, inSameSubnet, isValidIp } from '../core/ip';
import { isIpv6Address, isIpv6Multicast, inSameIpv6Subnet } from '../core/ipv6';
import { ndpResolveAndSend, NDP_NS, NDP_NA, ICMPV6_ECHO_REQUEST, ICMPV6_ECHO_REPLY } from './ndpUtils';
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
import { UDP_BOOTPS, UDP_BOOTPC, UDP_DNS, UDP_SNMP } from '../layer4/Udp';
import { buildMib, mibLookup, normalizeOid } from '../services/SnmpService';

const PREFIX = '.1.3.6.1.2.1';

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
    if (isIpv6Address(pkt.dstIp)) {
      this.handleIpv6(pkt, inPort, core, traceId);
      return;
    }
    this.handleIp(pkt, inPort, core, traceId);
  }

  // ── ARP ──────────────────────────────────────────────────
  private handleArp(pkt: Packet, inPort: string, core: SimulatorCore, traceId: string): void {
    const dev = this.device;
    const inIfaceCheck = dev.getIfaceByPortId(inPort) || dev.getIfaceByName(inPort);
    if (inIfaceCheck && !inIfaceCheck.up) {
      core.drop(dev, pkt, 'iface-down', traceId);
      return;
    }
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

    // Interface masuk mati (shutdown) → frame ditolak (tidak diproses).
    const inIfaceCheck = dev.getIfaceByPortId(inPort) || dev.getIfaceByName(inPort);
    if (inIfaceCheck && !inIfaceCheck.up) {
      core.emit('PACKET_DROPPED', traceId, { reason: 'iface-down' }, dev.id, inPort);
      core.drop(dev, pkt, 'iface-down', traceId);
      return;
    }

    // L2 filter: frame harus untuk MAC saya / broadcast
    const forMyMac =
      isBroadcastMac(pkt.dstMac) ||
      [...dev.getInterfaces()].some((i) => i.mac.toLowerCase() === pkt.dstMac.toLowerCase());
    if (!forMyMac) {
      core.emit('PACKET_DROPPED', traceId, { reason: 'l2-filter' }, dev.id, inPort);
      core.drop(dev, pkt, 'l2-filter', traceId);
      return;
    }

    // Firewall ingress — rule dibaca per paket. DHCP bootstrap (udp 67/68)
    // dikecualikan: klien harus tetap bisa memperoleh alamat dari router
    // meski ada aturan deny-all (input chain tidak memblokir DHCP).
    const isDhcpBootstrap = pkt.protocol === 'udp' && (pkt.dstPort === UDP_BOOTPS || pkt.dstPort === UDP_BOOTPC);
    if (!isDhcpBootstrap && applyAclDeny(core, dev, pkt, traceId, inPort)) {
      return;
    }

    // Layanan UDP DHCP: server lokal jika punya pool di port ini, atau DHCP relay.
    // Relay menang duluan agar perangkat campuran (pool + helper-address) tetap
    // meneruskan trafik klien dari segmen yang di-relay.
    if (pkt.protocol === 'udp' && pkt.dstPort === UDP_BOOTPS) {
      const serving = this.servingIface(inPort, pkt.vlan);
      const relayServer = serving ? dev.dhcpRelays[serving.name] : null;
      if (relayServer) {
        this.handleDhcpRelay(pkt, inPort, relayServer, core, traceId);
        return;
      }
      if (dev.dhcpPools.length > 0) {
        this.handleDhcpServer(pkt, inPort, core, traceId);
        return;
      }
    }

    // Trafik balik NAT masquerade: tujuan IP saya tapi ada sesi → kembalikan dstIp asli
    if (dev.hasIp(pkt.dstIp)) {
      if (dev.nat.unmasquerade(pkt, core.now)) {
        core.emit('NAT_REWRITE', traceId, { action: 'unmasquerade', to: pkt.dstIp }, dev.id, inPort);
      }
    }

    let myIface = dev.hasIp(pkt.dstIp);

    // dstnat / port-forward
    const dstnat = NatTranslator.dstnatRule(dev.natRules, pkt.dstIp, pkt.dstPort, pkt.protocol, pkt.srcIp);
    if (dstnat) {
      pkt.dstIp = NatTranslator.toAddresses(dstnat);
      pkt.dstPort = NatTranslator.toPort(dstnat, pkt.dstPort);
      core.emit('NAT_REWRITE', traceId, { action: 'dstnat', to: pkt.dstIp }, dev.id, inPort);
      myIface = dev.hasIp(pkt.dstIp);
    }

    if (myIface) {
      // Jangan tangkap balasan DHCP yang harus diteruskan relay (relayed offer/ack
      // membawa penanda relayed walau dstIp menunjuk interface router itu sendiri).
      const rp0 = (pkt.payload ?? {}) as Record<string, unknown> | undefined;
      if (!(pkt.protocol === 'udp' && pkt.dstPort === UDP_BOOTPC && rp0?.relayed && (rp0.relayed as any).clientMac)) {
        // Balas via interface tempat paket masuk (bukan interface yang IP-nya cocok),
        // agar reply lintas-interface (mis. ping ke IP LAN lain) kembali ke sumber.
        const inIface = dev.getIfaceByPortId(inPort) || dev.getIfaceByName(inPort);
        this.localDelivery(pkt, inPort, (inIface || myIface).name, core, traceId);
        return;
      }
    }

    // DHCP client: offer/ack server datang dengan dstIp broadcast/0.0.0.0,
    // tapi frame ditujukan ke MAC kita → terima sebagai trafik lokal.
    if (pkt.protocol === 'udp' && pkt.dstPort === UDP_BOOTPC && forMyMac) {
      const rp = (pkt.payload ?? {}) as Record<string, unknown> & { relayed?: { clientMac: string; clientIface: string } };
      if (rp.relayed && rp.relayed.clientMac) {
        // Balasan DHCP dari server yang lewat relay (ip helper-address) →
        // teruskan kembali ke klien asli di segmen broadcast-nya.
        this.handleDhcpRelayReply(pkt, inPort, core, traceId);
        return;
      }
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

    // Firewall pass kedua (forward): rule dengan out-interface dinilai
    // sekarang setelah interface keluar diketahui (mis. deny out-interface=wan).
    const outIfaceName = egress.name;
    if (!isDhcpBootstrap && applyAclDeny(core, dev, pkt, traceId, inPort, outIfaceName)) {
      return;
    }

    const nextHopIp = nh.gateway || pkt.dstIp;

    // srcnat: masquerade (PAT dinamis) atau static one-to-one (to-addresses).
    // Rule dinilai per paket; src-address rule ikut dihormati.
    const natRule = NatTranslator.srcnatRule(dev.natRules, egress.name, pkt.srcIp);
    if (natRule && pkt.srcIp !== egress.ip.address) {
      if (natRule.action === 'masquerade') {
        if (dev.nat.masquerade(pkt, egress.ip.address, egress.name, core.now)) {
          core.emit('NAT_REWRITE', traceId, { action: 'masquerade', to: egress.ip.address, port: pkt.srcPort }, dev.id, egress.name);
        } else {
          core.drop(dev, pkt, 'nat-port-exhausted', traceId);
          return;
        }
      } else if (natRule.action === 'srcnat' && natRule.toAddresses) {
        const toIp = NatTranslator.toAddresses(natRule);
        dev.nat.translateStatic(pkt, toIp, egress.name, core.now);
        core.emit('NAT_REWRITE', traceId, { action: 'srcnat', to: toIp }, dev.id, egress.name);
      }
    }

    // ARP untuk next hop → rewrite MAC, baru transmit
    core.emit('PACKET_FORWARDED', traceId, { packetId: pkt.id, dstIp: pkt.dstIp, egress: egress.name }, dev.id, egress.name);
    arpResolveAndSend(dev, pkt, egress.name, nextHopIp, core, traceId);
  }

  // ── IPv6 (NDP + ICMPv6 echo + routing v6) ───────────────
  private handleIpv6(pkt: Packet, inPort: string, core: SimulatorCore, traceId: string): void {
    const dev = this.device;
    core.emit('PACKET_RECEIVED', traceId, { packetId: pkt.id }, dev.id, inPort);
    const p = (pkt.payload ?? {}) as { type?: number; ndp?: string; target?: string; seq?: number; id?: number };

    // Interface masuk mati (shutdown) → frame ditolak.
    const inIfaceCheck = dev.getIfaceByPortId(inPort) || dev.getIfaceByName(inPort);
    if (inIfaceCheck && !inIfaceCheck.up) {
      core.emit('PACKET_DROPPED', traceId, { reason: 'iface-down' }, dev.id, inPort);
      core.drop(dev, pkt, 'iface-down', traceId);
      return;
    }

    // NDP: NS/NA datang ke solicited-node multicast MAC (33:33:ff:..) —
    // harus ditangani sebelum filter L2.
    if (p.type === NDP_NS && p.ndp === 'ns' && p.target) {
      const mine = dev.hasIpv6(p.target);
      dev.ipv6Neighbors.learn(pkt.srcIp, pkt.srcMac, inPort, core.now);
      if (mine) {
        const na = core.createPacket({
          protocol: 'icmp',
          srcMac: mine.mac,
          dstMac: pkt.srcMac,
          srcIp: p.target,
          dstIp: pkt.srcIp,
          ttl: 64,
          traceId,
          payload: { type: NDP_NA, code: 0, target: p.target, ndp: 'na' },
        });
        core.transmit(dev, na, inPort, traceId);
      }
      core.drop(dev, pkt, 'ndp-consumed', traceId);
      return;
    }
    if (p.type === NDP_NA && p.ndp === 'na' && p.target) {
      dev.ipv6Neighbors.learn(p.target, pkt.srcMac, inPort, core.now);
      core.flushArp(dev, p.target, pkt.srcMac, traceId);
      core.drop(dev, pkt, 'ndp-consumed', traceId);
      return;
    }

    const forMyMac =
      isBroadcastMac(pkt.dstMac) ||
      pkt.dstMac.toLowerCase().startsWith('33:33') ||
      [...dev.getInterfaces()].some((i) => i.mac.toLowerCase() === pkt.dstMac.toLowerCase());
    if (!forMyMac) {
      core.drop(dev, pkt, 'l2-filter', traceId);
      return;
    }

    const myIface = dev.hasIpv6(pkt.dstIp);
    if (myIface) {
      const inIface = dev.getIfaceByPortId(inPort) || dev.getIfaceByName(inPort);
      core.emit('PACKET_DELIVERED', traceId, { packetId: pkt.id, srcIp: pkt.srcIp, dstIp: pkt.dstIp, protocol: pkt.protocol, v6: true }, dev.id, (inIface || myIface).name);
      if (pkt.protocol === 'icmp' && p.type === ICMPV6_ECHO_REQUEST) {
        pkt.flags['ttlAtDst'] = pkt.ttl;
        const reply = core.createPacket({
          protocol: 'icmp',
          srcMac: myIface.mac,
          dstMac: pkt.srcMac,
          srcIp: pkt.dstIp,
          dstIp: pkt.srcIp,
          ttl: 64,
          traceId,
          flags: { ttlAtDst: pkt.ttl },
          payload: { type: ICMPV6_ECHO_REPLY, code: 0, seq: p.seq, id: p.id, v6: true },
        });
        reply.hops = pkt.hops.slice();
        reply.edgeIds = pkt.edgeIds.slice();
        reply.trace = pkt.trace.slice();
        reply.vlan = pkt.vlan;
        core.transmit(dev, reply, (inIface || myIface).name, traceId);
        core.emit('PING_REPLY', traceId, { seq: p.seq }, dev.id, (inIface || myIface).name);
      } else if (pkt.protocol === 'icmp' && p.type === ICMPV6_ECHO_REPLY) {
        core.emit('PING_REPLY', traceId, { seq: p.seq, arrived: true }, dev.id, (inIface || myIface).name);
        const run = core.getRun(traceId);
        if (run && run.status === 'running') {
          run.status = 'ok';
          run.ttlAtDst = (pkt.flags['ttlAtDst'] as number) || 64;
        }
      }
      core.drop(dev, pkt, 'consumed', traceId);
      return;
    }

    if (dev.kind === 'pc' || dev.kind === 'server') {
      core.drop(dev, pkt, 'not-for-me', traceId);
      return;
    }

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

    const nh = dev.ipv6Routing.lookup(pkt.dstIp);
    if (!nh || nh.gateway === 'discard') {
      core.emit('ICMP_ERROR', traceId, { reason: nh?.gateway === 'discard' ? 'route-discard' : 'no-route-v6' }, dev.id, inPort);
      const run = core.getRun(traceId);
      if (run && run.status === 'running') {
        run.unreachable = true;
        run.status = 'fail';
        run.reason = 'unreachable';
      }
      core.drop(dev, pkt, nh?.gateway === 'discard' ? 'route-discard' : 'no-route-v6', traceId);
      return;
    }

    let egressName = nh.iface || (nh.gateway ? dev.resolveEgressIface6(nh.gateway)?.name || null : null);
    if (!egressName) {
      const firstUp = dev.getInterfaces().find((i) => i.up && i.ipv6);
      egressName = firstUp?.name || null;
    }
    const egress = egressName ? dev.getIfaceByName(egressName) : null;
    if (!egress || !egress.up || !egress.ipv6) {
      core.drop(dev, pkt, 'egress-down', traceId);
      return;
    }
    const nextHopIp = nh.gateway || pkt.dstIp;
    core.emit('PACKET_FORWARDED', traceId, { packetId: pkt.id, dstIp: pkt.dstIp, v6: true, egress: egress.name }, dev.id, egress.name);
    ndpResolveAndSend(dev, pkt, egress.name, nextHopIp, core, traceId);
  }

  private sendIcmpError(pkt: Packet, inPort: string, error: IcmpPayload, core: SimulatorCore, traceId: string): void {
    const dev = this.device;
    const inIface = dev.getIfaceByPortId(inPort) || dev.getIfaceByName(inPort);
    if (!inIface) return;
    const err = core.createPacket({
      protocol: 'icmp',
      srcMac: inIface.mac,
      dstMac: pkt.srcMac,
      // Source IP ICMP error harus milik router (interface masuk), bukan dstIp asli paket.
      srcIp: inIface.ip?.address || pkt.dstIp || '0.0.0.0',
      dstIp: pkt.srcIp,
      ttl: 64,
      traceId,
      payload: { ...error },
    });
    // ICMP error kembali lewat interface masuk → pertahankan tag VLAN-nya.
    err.vlan = pkt.vlan;
    core.transmit(dev, err, inIface.name, traceId);
  }

  // ── Local delivery ───────────────────────────────────────
  protected localDelivery(pkt: Packet, inPort: string, ifaceName: string, core: SimulatorCore, traceId: string): void {
    const dev = this.device;
    const iface = dev.getIfaceByName(ifaceName);
    if (!iface) return;
    core.emit('PACKET_DELIVERED', traceId, { packetId: pkt.id, srcIp: pkt.srcIp, dstIp: pkt.dstIp, protocol: pkt.protocol }, dev.id, ifaceName);

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
          flags: { ttlAtDst: pkt.ttl },
          payload: { type: ICMP_ECHO_REPLY, code: 0, seq: p.seq, id: p.id },
        });
        // bawa trace request agar lintasan utuh di reply
        reply.hops = pkt.hops.slice();
        reply.edgeIds = pkt.edgeIds.slice();
        reply.trace = pkt.trace.slice();
        // Reply keluar lewat interface yang sama dengan frame masuk → pertahankan
        // tag VLAN (subinterface) agar switch meneruskannya ke VLAN asal.
        reply.vlan = pkt.vlan;
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
      reply.vlan = pkt.vlan;
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
      ack.vlan = pkt.vlan;
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
    if (pkt.dstPort === UDP_SNMP) {
      this.handleSnmpAgent(pkt, inPort, iface, core, traceId);
      return;
    }
    if (pkt.dstPort === UDP_DNS) {
      const name = String((pkt.payload as Record<string, unknown> | null)?.name || '');
      const rec = staticRecord(dev, name);
      if (pkt.srcIp && pkt.srcIp !== '0.0.0.0' && pkt.srcMac) {
        // Jawab SELALU (termasuk saat record tidak ada → NXDOMAIN), jangan
        // drop diam-diam agar klien tidak menunggu sampai timeout.
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
          payload: { address: rec, name, nxdomain: !rec },
        });
        reply.vlan = pkt.vlan;
        core.transmit(dev, reply, iface.name, traceId);
      }
      core.drop(dev, pkt, 'dns-consumed', traceId);
      return;
    }
    // Respon SNMP yang datang ke host klien → finalisasi run dengan hasil query.
    if (pkt.dstPort !== UDP_SNMP && (pkt.payload as Record<string, unknown> | null)?.snmpResult) {
      const run = core.getRun(traceId);
      if (run && run.status === 'running') {
        run.status = 'ok';
        run.snmp = (pkt.payload as { snmpResult: Record<string, unknown> }).snmpResult;
      }
      core.drop(dev, pkt, 'snmp-consumed', traceId);
      return;
    }
    core.drop(dev, pkt, 'udp-unknown', traceId);
  }

  /** Agent SNMP (udp/161): validasi community, jawab get / getnext / walk / set. */
  private handleSnmpAgent(pkt: Packet, inPort: string, iface: { name: string; mac: string }, core: SimulatorCore, traceId: string): void {
    const dev = this.device;
    const run = core.getRun(traceId);
    const req = (pkt.payload ?? {}) as {
      snmpOp?: string;
      oid?: string;
      community?: string;
      setValue?: string;
    };
    const agent = dev.snmpAgent;
    if (!agent || !agent.enabled) {
      core.emit('PACKET_DROPPED', traceId, { reason: 'no-snmp-agent' }, dev.id, inPort);
      if (run && run.status === 'running') {
        run.status = 'fail';
        run.reason = 'no-agent';
      }
      core.drop(dev, pkt, 'no-snmp-agent', traceId);
      return;
    }
    const community = String(req.community || '');
    const isSet = req.snmpOp === 'set';
    const okCommunity =
      community === agent.community || (isSet && community === agent.communityRW);
    if (!okCommunity) {
      const reply = core.createPacket({
        protocol: 'udp',
        srcMac: iface.mac,
        dstMac: pkt.srcMac,
        srcIp: pkt.dstIp,
        dstIp: pkt.srcIp,
        srcPort: UDP_SNMP,
        dstPort: pkt.srcPort,
        ttl: 64,
        traceId,
        payload: { snmpResult: { ok: false, error: 'Bad community name', reason: 'auth' }, oid: req.oid },
      });
      reply.vlan = pkt.vlan;
      core.transmit(dev, reply, iface.name, traceId);
      if (run && run.status === 'running') {
        run.status = 'fail';
        run.reason = 'auth';
      }
      core.drop(dev, pkt, 'snmp-consumed', traceId);
      return;
    }

    const mib = buildMib(dev);
    const oid = normalizeOid(req.oid || '');
    const walk = req.snmpOp === 'getnext' || req.snmpOp === 'walk';
    const result: { ok: boolean; oids?: { oid: string; value: string; type: string }[]; readonly?: boolean } = { ok: true };

    if (req.snmpOp === 'set') {
      // set butuh community RW
      if (community !== agent.communityRW) {
        result.ok = false;
        (result as { readonly?: boolean; reason?: string }).reason = 'readonly';
      } else {
        if (oid === `${PREFIX}.1.5.0`) {
          dev.name = String(req.setValue || '');
          mib.set(`${PREFIX}.1.5.0`, { value: dev.name, type: 'STRING' });
        }
        result.oids = [{ oid, value: mib.get(oid)?.value ?? '', type: mib.get(oid)?.type ?? 'STRING' }];
      }
    } else if (walk) {
      const found: { oid: string; value: string; type: string }[] = [];
      let cursor = oid;
      for (let i = 0; i < 200; i++) {
        const next = mibLookup(mib, cursor, true);
        if (!next) break;
        found.push({ oid: next.oid, value: next.entry.value, type: next.entry.type });
        cursor = next.oid;
        if (!cursor.startsWith(oid)) break;
      }
      result.oids = found;
    } else {
      const hit = mibLookup(mib, oid, false);
      if (!hit) {
        result.ok = false;
        (result as { reason?: string }).reason = 'not-found-oid';
        result.oids = [];
      } else {
        result.oids = [{ oid, value: hit.entry.value, type: hit.entry.type }];
      }
    }

    const reply = core.createPacket({
      protocol: 'udp',
      srcMac: iface.mac,
      dstMac: pkt.srcMac,
      srcIp: pkt.dstIp,
      dstIp: pkt.srcIp,
      srcPort: UDP_SNMP,
      dstPort: pkt.srcPort,
      ttl: 64,
      traceId,
      payload: { snmpResult: { ...result, device: dev.name }, oid },
    });
    reply.vlan = pkt.vlan;
    core.transmit(dev, reply, iface.name, traceId);

    const done: Record<string, unknown> = { ...result, device: dev.name };
    if (run && run.status === 'running' && req.snmpOp === 'set') {
      run.status = 'ok';
      run.snmp = done;
    }
    core.drop(dev, pkt, 'snmp-consumed', traceId);
  }

  // ── DHCP server (DORA) ───────────────────────────────────
  private handleDhcpServer(pkt: Packet, inPort: string, core: SimulatorCore, traceId: string): void {
    const dev = this.device;
    const p = (pkt.payload ?? {}) as Record<string, unknown> & { type?: string; xid?: number };
    // Permintaan datang via relay (ip helper-address) → balasan harus
    // membawa penanda relayed agar relay bisa meneruskannya ke klien asli.
    const relayed = (pkt.payload as Record<string, unknown> | undefined)?.relayed;
    // Interface yang melayani: frame bertag (VLAN) yang masuk port fisik
    // dilayani oleh subinterface VLAN-nya — pool per-VLAN baru cocok.
    const serving = this.servingIface(inPort, pkt.vlan);
    const serverIface = serving || dev.getIfaceByPortId(inPort) || dev.getIfaceByName(inPort);

    if (p.type === 'discover') {
      core.emit('DHCP_DISCOVER', traceId, { xid: p.xid, mac: pkt.srcMac }, dev.id, inPort);
      const pool = findServingPool(dev, serverIface?.name || inPort);
      const grant = pool ? this.grantFromPool(dev, pool, core) : null;
      if (!grant) {
        core.drop(dev, pkt, 'dhcp-no-pool', traceId);
        return;
      }
      const offer = core.createPacket({
        protocol: 'udp',
        srcMac: serverIface?.mac || pkt.dstMac,
        dstMac: pkt.srcMac,
        srcIp: serverIface?.ip?.address || '0.0.0.0',
        dstIp: pkt.srcIp === '0.0.0.0' ? '255.255.255.255' : pkt.srcIp,
        srcPort: UDP_BOOTPS,
        dstPort: UDP_BOOTPC,
        ttl: 64,
        traceId,
        payload: relayed ? { type: 'offer', xid: p.xid, ...grant, relayed } : { type: 'offer', xid: p.xid, ...grant },
      });
      offer.vlan = pkt.vlan;
      core.transmit(dev, offer, inPort, traceId);
      core.emit('DHCP_OFFER', traceId, { ip: grant.ip }, dev.id, inPort);
      core.drop(dev, pkt, 'dhcp-consumed', traceId);
    } else if (p.type === 'request') {
      core.emit('DHCP_REQUEST', traceId, { xid: p.xid }, dev.id, inPort);
      const pool = findServingPool(dev, serverIface?.name || inPort);
      if (!pool) {
        core.drop(dev, pkt, 'dhcp-no-pool', traceId);
        return;
      }
      const requestedIp = String(p.requestedIp || '');
      const used = core.usedIps();
      const inPool = requestedIp !== '' && this.ipInPool(requestedIp, pool);
      const ownedByClient = core.isIpLeasedTo?.(requestedIp, pkt.srcMac) ?? false;
      // IP diminta sudah dipakai klien lain → NAK (cegah double-allocation).
      if (inPool && used.has(requestedIp) && !ownedByClient) {
        const nak = core.createPacket({
          protocol: 'udp',
          srcMac: serverIface?.mac || pkt.dstMac,
          dstMac: pkt.srcMac,
          srcIp: serverIface?.ip?.address || '0.0.0.0',
          dstIp: pkt.srcIp === '0.0.0.0' ? '255.255.255.255' : pkt.srcIp,
          srcPort: UDP_BOOTPS,
          dstPort: UDP_BOOTPC,
          ttl: 64,
          traceId,
          payload: relayed ? { type: 'nak', xid: p.xid, ip: requestedIp, relayed } : { type: 'nak', xid: p.xid, ip: requestedIp },
        });
        nak.vlan = pkt.vlan;
        core.transmit(dev, nak, inPort, traceId);
        core.emit('DHCP_REQUEST', traceId, { xid: p.xid, nak: true, ip: requestedIp }, dev.id, inPort);
        core.drop(dev, pkt, 'dhcp-nak', traceId);
        return;
      }
      const grant =
        inPool && (ownedByClient || !used.has(requestedIp))
          ? this.ackForPool(pool, requestedIp)
          : this.grantFromPool(dev, pool, core);
      if (!grant) {
        core.drop(dev, pkt, 'dhcp-pool-full', traceId);
        return;
      }
      const ack = core.createPacket({
        protocol: 'udp',
        srcMac: serverIface?.mac || pkt.dstMac,
        dstMac: pkt.srcMac,
        srcIp: serverIface?.ip?.address || '0.0.0.0',
        dstIp: pkt.srcIp === '0.0.0.0' ? '255.255.255.255' : pkt.srcIp,
        srcPort: UDP_BOOTPS,
        dstPort: UDP_BOOTPC,
        ttl: 64,
        traceId,
        payload: relayed ? { type: 'ack', xid: p.xid, ...grant, relayed } : { type: 'ack', xid: p.xid, ...grant },
      });
      ack.vlan = pkt.vlan;
      core.transmit(dev, ack, inPort, traceId);
      core.emit('DHCP_ACK', traceId, { ip: grant.ip }, dev.id, inPort);
      core.drop(dev, pkt, 'dhcp-consumed', traceId);
    } else {
      core.drop(dev, pkt, 'dhcp-unknown', traceId);
    }
  }

  /**
   * Interface efektif untuk paket yang masuk lewat port fisik:
   * frame bertag (pkt.vlan) → subinterface VLAN dengan parentPort fisik
   * tsb (mis. tag 10 di ether1 → ether1.10). Tanpa tag / tanpa subinterface
   * cocok → interface fisik. Dipakai DHCP (pool per-VLAN, srcIp/srcMac
   * reply) dan DHCP relay (helper-address per subinterface).
   */
  private servingIface(inPort: string, vlan: number | null): ReturnType<NetworkDevice['getInterfaces']>[number] | null {
    const dev = this.device;
    const phys = dev.getIfaceByPortId(inPort) || dev.getIfaceByName(inPort);
    if (!phys || vlan == null || phys.type !== 'ethernet') return phys;
    for (const iface of dev.getInterfaces()) {
      if (iface.type === 'vlan' && iface.parentPort === phys.name && iface.vlanId === vlan) return iface;
    }
    return phys;
  }

  private grantFromPool(dev: NetworkDevice, pool: NonNullable<ReturnType<typeof findServingPool>>, core: SimulatorCore): LeaseGrant | null {
    const alloc = allocateIp(dev, pool, core.usedIps());
    if (!alloc) return null;
    return {
      ip: alloc.ip,
      gateway: alloc.gateway,
      prefix: alloc.prefix,
      poolNodeId: dev.id,
      dnsServers: pool.dnsServers?.length ? pool.dnsServers : undefined,
      leaseTimeMs: pool.leaseTimeMs,
    };
  }

  // ── DHCP relay (ip helper-address) ──────────────────────────
  private handleDhcpRelay(pkt: Packet, inPort: string, serverIp: string, core: SimulatorCore, traceId: string): void {
    const dev = this.device;
    const p = (pkt.payload ?? {}) as Record<string, unknown> & { type?: string };
    if (p.type !== 'discover' && p.type !== 'request') {
      core.drop(dev, pkt, 'dhcp-unknown', traceId);
      return;
    }
    const inIface = this.servingIface(inPort, pkt.vlan) || dev.getIfaceByPortId(inPort) || dev.getIfaceByName(inPort);
    if (!inIface || !inIface.ip) {
      core.drop(dev, pkt, 'dhcp-relay-no-ip', traceId);
      return;
    }
    // Interface keluar menuju server: rute lookup memberi tahu egress yang benar
    // (server di subnet lain via router lain); fallback ke subnet langsung.
    const nh = dev.routing.lookup(serverIp);
    const nextHopIp = nh?.gateway || serverIp;
    const egressIface =
      (nh?.iface ? dev.getIfaceByName(nh.iface) || dev.getIfaceByPortId(nh.iface) : null) ||
      (nh?.gateway ? dev.resolveEgressIface(nh.gateway) || null : null);
    const egress = egressIface || dev.resolveEgressIface(serverIp) || inIface;
    const fwd = core.createPacket({
      protocol: 'udp',
      srcMac: egress.mac,
      dstMac: '',
      srcIp: egress.ip.address,
      dstIp: serverIp,
      srcPort: UDP_BOOTPS,
      dstPort: UDP_BOOTPS,
      ttl: 64,
      traceId,
      payload: { ...p, relayed: { clientMac: pkt.srcMac, clientIface: inIface.name } },
    });
    core.emit('DHCP_RELAY', traceId, { xid: p.xid, to: serverIp, clientMac: pkt.srcMac }, dev.id, inPort);
    arpResolveAndSend(dev, fwd, egress.name, nextHopIp, core, traceId);
    core.drop(dev, pkt, 'dhcp-consumed', traceId);
  }

  private handleDhcpRelayReply(pkt: Packet, inPort: string, core: SimulatorCore, traceId: string): void {
    const dev = this.device;
    const p = (pkt.payload ?? {}) as Record<string, unknown> & { relayed?: { clientMac: string; clientIface: string } };
    const r = p.relayed!;
    const clientIface = dev.getIfaceByName(r.clientIface) || dev.getIfaceByPortId(inPort) || null;
    if (!clientIface) {
      core.drop(dev, pkt, 'dhcp-relay-no-client-iface', traceId);
      return;
    }
    // Relay tidak tahu IP klien (offer/ack berisi alamat yang ditawarkan di
    // payload), jadi balasan ke segmen klien selalu dikirim sebagai broadcast
    // unicast-frame (dstMac = MAC klien dari penanda relayed).
    const reply = core.createPacket({
      protocol: 'udp',
      srcMac: clientIface.mac,
      dstMac: r.clientMac,
      srcIp: pkt.srcIp,
      dstIp: '255.255.255.255',
      srcPort: UDP_BOOTPS,
      dstPort: UDP_BOOTPC,
      ttl: 64,
      traceId,
      payload: { ...p, relayed: undefined },
    });
    core.emit('DHCP_RELAY_REPLY', traceId, { xid: p.xid, clientMac: r.clientMac }, dev.id, clientIface.name);
    core.transmit(dev, reply, clientIface.name, traceId);
    core.drop(dev, pkt, 'dhcp-consumed', traceId);
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
    return {
      ip,
      prefix,
      gateway,
      poolNodeId: this.device.id,
      dnsServers: pool.dnsServers?.length ? pool.dnsServers : undefined,
      leaseTimeMs: pool.leaseTimeMs,
    };
  }
}
