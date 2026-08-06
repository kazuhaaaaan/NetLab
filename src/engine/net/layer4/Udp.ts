// ============================================================
// Udp — datagram UDP (dipakai DHCP & DNS)
// ============================================================

export interface UdpDatagram {
  srcPort: number;
  dstPort: number;
  length: number;
}

export const UDP_BOOTPC = 68;
export const UDP_BOOTPS = 67;
export const UDP_DNS = 53;
export const UDP_SNMP = 161;

export function buildUdpDatagram(srcPort: number, dstPort: number, length: number): UdpDatagram {
  return { srcPort, dstPort, length };
}
