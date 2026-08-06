// ============================================================
// Packet model — Ethernet / ARP / ICMP framing for the engine.
// The simulation walks packets hop-by-hop with real routing,
// TTL decrement and ICMP error generation.
// ============================================================

export type PacketKind =
  | 'arp-request'
  | 'arp-reply'
  | 'icmp-echo-request'
  | 'icmp-echo-reply'
  | 'icmp-ttl-exceeded'
  | 'icmp-dest-unreachable';

export interface SimPacket {
  kind: PacketKind;
  srcMac: string;
  dstMac: string;
  srcIp: string;
  dstIp: string;
  ttl: number;
  seq: number;
  /** node names visited so far (for traces) */
  trace: string[];
}

export function buildEchoRequest(srcIp: string, dstIp: string, srcMac: string, dstMac: string, ttl: number, seq: number): SimPacket {
  return { kind: 'icmp-echo-request', srcMac, dstMac, srcIp, dstIp, ttl, seq, trace: [] };
}

export function buildEchoReply(pkt: SimPacket, srcMac: string, dstMac: string): SimPacket {
  return { ...pkt, kind: 'icmp-echo-reply', srcMac, dstMac, srcIp: pkt.dstIp, dstIp: pkt.srcIp, ttl: 64 };
}

export function buildArpRequest(srcIp: string, srcMac: string, targetIp: string): SimPacket {
  return {
    kind: 'arp-request',
    srcMac,
    dstMac: 'ff:ff:ff:ff:ff:ff',
    srcIp,
    dstIp: targetIp,
    ttl: 1,
    seq: 0,
    trace: [],
  };
}
