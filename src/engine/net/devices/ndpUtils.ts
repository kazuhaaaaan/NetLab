// ============================================================
// ndpUtils — Neighbor Discovery Protocol: resolve MAC next-hop
// IPv6 via Neighbor Solicitation (mirip arpResolveAndSend).
// ============================================================

import { NetworkDevice } from './NetworkDevice';
import { SimulatorCore } from './DeviceProcessor';
import { Packet } from '../core/types';
import { solicitedNodeMac } from '../core/ipv6';

export const NDP_NS = 135;
export const NDP_NA = 136;
export const ICMPV6_ECHO_REQUEST = 128;
export const ICMPV6_ECHO_REPLY = 129;

/**
 * Kirim `pkt` lewat `outPortName` menuju next-hop IPv6 `nextHopIp6`.
 * Jika MAC belum dikenal → buffer paket + kirim Neighbor Solicitation
 * ke solicited-node multicast; NA reply akan me-flush buffer.
 */
export function ndpResolveAndSend(
  dev: NetworkDevice,
  pkt: Packet,
  outPortName: string,
  nextHopIp6: string,
  core: SimulatorCore,
  traceId: string
): boolean {
  const egress = dev.getIfaceByName(outPortName) || dev.getIfaceByPortId(outPortName);
  if (!egress || !egress.up || !egress.mac) return false;

  const entry = dev.ipv6Neighbors.resolve(nextHopIp6);
  if (entry) {
    pkt.srcMac = egress.mac;
    pkt.dstMac = entry.mac;
    return core.transmit(dev, pkt, egress.name, traceId);
  }

  core.bufferForArp(dev, nextHopIp6, pkt, egress.name, traceId);
  const ns = core.createPacket({
    protocol: 'icmp',
    srcMac: egress.mac,
    dstMac: solicitedNodeMac(nextHopIp6),
    srcIp: egress.ipv6?.address || egress.ip?.address || 'fe80::1',
    dstIp: nextHopIp6,
    ttl: 64,
    traceId,
    payload: { type: NDP_NS, code: 0, target: nextHopIp6, ndp: 'ns' },
  });
  core.transmit(dev, ns, egress.name, traceId);
  return true;
}
