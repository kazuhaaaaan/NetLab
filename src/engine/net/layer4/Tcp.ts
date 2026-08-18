// ============================================================
// Tcp — segment TCP (SYN / SYN-ACK / ACK) untuk handshake
// ============================================================

export interface TcpSegment {
  srcPort: number;
  dstPort: number;
  seq: number;
  ack: number;
  flags: string; // 'SYN' | 'SYN-ACK' | 'ACK' | 'FIN' | 'RST'
  window: number;
}

export const TCP_SYN = 0x02;
export const TCP_ACK = 0x10;
export const TCP_FIN = 0x01;
export const TCP_RST = 0x04;

export function flagsToString(flags: number): string {
  const parts: string[] = [];
  if (flags & TCP_SYN) parts.push('SYN');
  if (flags & TCP_ACK) parts.push('ACK');
  if (flags & TCP_FIN) parts.push('FIN');
  if (flags & TCP_RST) parts.push('RST');
  return parts.length ? parts.join('-') : '----';
}

export function buildTcpSegment(
  srcPort: number,
  dstPort: number,
  seq: number,
  ack: number,
  flags: number
): TcpSegment {
  return { srcPort, dstPort, seq, ack, flags: flagsToString(flags), window: 65535 };
}

export function isSyn(seg: TcpSegment): boolean {
  return seg.flags.includes('SYN');
}
export function isAck(seg: TcpSegment): boolean {
  return seg.flags.includes('ACK');
}
export function isFin(seg: TcpSegment): boolean {
  return seg.flags.includes('FIN');
}
export function isRst(seg: TcpSegment): boolean {
  return seg.flags.includes('RST');
}
