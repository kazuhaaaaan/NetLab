export interface EthernetFrame {
  destMac: string;
  srcMac: string;
  etherType: number;
  payload: Uint8Array;
}

export interface IPv4Packet {
  version: number;
  ttl: number;
  protocol: number;
  srcIp: string;
  destIp: string;
  payload: Uint8Array;
}
