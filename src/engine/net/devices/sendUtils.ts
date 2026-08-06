// ============================================================
// sendUtils — pembantu pengiriman: resolve MAC next-hop via ARP
// (dipakai RouterProcessor.egress & HostProcessor.send)
// ============================================================

import { NetworkDevice } from './NetworkDevice';
import { SimulatorCore } from './DeviceProcessor';
import { Packet, MAC_BROADCAST } from '../core/types';

/**
 * Kirim `pkt` lewat `outPortName` menuju `nextHopIp`.
 * Jika MAC next-hop belum dikenal → buffer paket + kirim ARP request
 * (broadcast) supaya MAC dipelajari, lalu flush saat ARP reply tiba.
 */
export function arpResolveAndSend(
  dev: NetworkDevice,
  pkt: Packet,
  outPortName: string,
  nextHopIp: string,
  core: SimulatorCore,
  traceId: string
): boolean {
  const egress = dev.getIfaceByName(outPortName) || dev.getIfaceByPortId(outPortName);
  if (!egress || !egress.up || !egress.mac) return false;

  const entry = dev.arpCache.resolve(nextHopIp);
  if (entry) {
    pkt.srcMac = egress.mac;
    pkt.dstMac = entry.mac;
    return core.transmit(dev, pkt, egress.name, traceId);
  }

  // Belum tahu MAC next-hop → simpan paket, kirim ARP who-has
  core.bufferForArp(dev, nextHopIp, pkt, egress.name, traceId);
  const req = core.createPacket({
    protocol: 'arp',
    srcMac: egress.mac,
    dstMac: MAC_BROADCAST,
    srcIp: egress.ip?.address || '0.0.0.0',
    dstIp: nextHopIp,
    ttl: 1,
    traceId,
    payload: {
      op: 1,
      senderIp: egress.ip?.address || '0.0.0.0',
      senderMac: egress.mac,
      targetIp: nextHopIp,
    },
  });
  core.transmit(dev, req, egress.name, traceId);
  return true;
}
