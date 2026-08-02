export interface RoutingTableEntry {
  network: string;
  netmask: string;
  gateway: string;
  interfaceName: string;
  metric: number;
  protocol: 'static' | 'connected' | 'ospf' | 'bgp';
}

export interface ARPCacheEntry {
  ipAddress: string;
  macAddress: string;
  ttlSeconds: number;
}
