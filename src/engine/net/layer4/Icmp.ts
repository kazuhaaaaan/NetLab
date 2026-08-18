// ============================================================
// Icmp — ICMP echo request/reply & error generation
// ============================================================

import { Packet } from '../core/types';

export const ICMP_ECHO_REPLY = 0;
export const ICMP_DEST_UNREACHABLE = 3;
export const ICMP_TIME_EXCEEDED = 11;
export const ICMP_ECHO_REQUEST = 8;

let icmpSeq = 0;

export function nextIcmpId(): number {
  return (icmpSeq = (icmpSeq + 1) & 0xffff);
}

export interface IcmpPayload {
  type: number;
  code: number;
  seq: number;
  id: number;
  /** alasan ICMP error */
  detail?: string;
  /** true = pesan ICMPv6 (tipe error 1/3, bukan 3/11 IPv4). */
  v6?: boolean;
}

/** Bangun ICMP echo request/reply sebagai payload struktur. */
export function buildIcmpEcho(
  type: number,
  srcIp: string,
  dstIp: string,
  seq: number,
  id: number
): IcmpPayload {
  return { type, code: 0, seq, id };
}

export function buildTimeExceeded(): IcmpPayload {
  return { type: ICMP_TIME_EXCEEDED, code: 0, seq: 0, id: 0, detail: 'time to live exceeded' };
}

export function buildDestUnreachable(detail = 'destination host unreachable'): IcmpPayload {
  return { type: ICMP_DEST_UNREACHABLE, code: 1, seq: 0, id: 0, detail };
}

export function icmpLabel(pkt: Packet): string {
  const p = (pkt.payload ?? {}) as unknown as IcmpPayload;
  switch (p.type) {
    case ICMP_ECHO_REQUEST:
      return 'ICMP Echo Request';
    case ICMP_ECHO_REPLY:
      return 'ICMP Echo Reply';
    case ICMP_TIME_EXCEEDED:
      return 'ICMP Time Exceeded';
    case ICMP_DEST_UNREACHABLE:
      return 'ICMP Destination Unreachable';
    default:
      return `ICMP type=${p.type}`;
  }
}
