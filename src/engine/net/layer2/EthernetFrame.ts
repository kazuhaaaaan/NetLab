// ============================================================
// EthernetFrame — framing & payload ethertype
// ============================================================

import { MAC_BROADCAST, Packet, PacketProtocol } from '../core/types';

export const ETH_TYPE_ARP = 0x0806;
export const ETH_TYPE_IPV4 = 0x0800;

export const ETHERNET_MIN_FRAME = 64;
export const ETHERNET_HEADER = 14;

export function isBroadcastMac(mac: string): boolean {
  return mac.toLowerCase() === MAC_BROADCAST;
}

export function isMulticastMac(mac: string): boolean {
  const m = mac.toLowerCase();
  const first = m.split(':')[0] ?? '';
  return first === '01' || first === '33' || first === '01:00:5e';
}

/** Hitung ukuran frame hasil encapsulasi paket (header + payload). */
export function frameSize(pkt: Packet): number {
  return Math.max(ETHERNET_MIN_FRAME, ETHERNET_HEADER + Math.max(1, pkt.size));
}

/** Jenis protocol → ethertype frame. */
export function etherTypeOf(protocol: PacketProtocol): number {
  switch (protocol) {
    case 'arp':
      return ETH_TYPE_ARP;
    default:
      return ETH_TYPE_IPV4;
  }
}
