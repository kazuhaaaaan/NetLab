// ============================================================
// IpPacket — header IPv4 & fragmentasi (struktur)
// ============================================================

export interface IpHeader {
  version: 4;
  ihl: number;
  id: number;
  flags: { df: boolean; mf: boolean };
  fragOffset: number;
  ttl: number;
  proto: number;
  checksum: number;
  src: string;
  dst: string;
}

export const IP_PROTO_ICMP = 1;
export const IP_PROTO_TCP = 6;
export const IP_PROTO_UDP = 17;

let ipIdCounter = 0;

export function nextIpId(): number {
  ipIdCounter = (ipIdCounter + 1) & 0xffff;
  return ipIdCounter;
}

export function buildIpHeader(opts: {
  src: string;
  dst: string;
  ttl: number;
  proto: number;
  df?: boolean;
  id?: number;
}): IpHeader {
  return {
    version: 4,
    ihl: 5,
    id: opts.id ?? nextIpId(),
    flags: { df: opts.df ?? true, mf: false },
    fragOffset: 0,
    ttl: opts.ttl,
    proto: opts.proto,
    checksum: 0,
    src: opts.src,
    dst: opts.dst,
  };
}

/**
 * Fragmentasi IPv4 (struktur). Ketika paket lebih besar dari MTU interface
 * keluar, header difragmentasi menjadi beberapa potongan yang masing-masing
 * tetap membawa id, offset, dan flag MF (more fragments).
 */
export interface IpFragment {
  header: IpHeader;
  /** offset 8-byte unit */
  offset: number;
  length: number;
  more: boolean;
}

export function fragmentIp(header: IpHeader, payloadLength: number, mtu: number): IpFragment[] {
  if (header.flags.df || payloadLength + header.ihl * 4 <= mtu) {
    return [{ header, offset: 0, length: payloadLength, more: false }];
  }
  const maxPayload = Math.floor((mtu - header.ihl * 4) / 8) * 8;
  const out: IpFragment[] = [];
  let offset = 0;
  let remaining = payloadLength;
  while (remaining > 0) {
    const len = Math.min(maxPayload, remaining);
    const more = remaining > len;
    out.push({
      header: {
        ...header,
        flags: { df: false, mf: more },
        fragOffset: offset / 8,
        id: header.id,
      },
      offset,
      length: len,
      more,
    });
    offset += len;
    remaining -= len;
  }
  return out;
}
