// ============================================================
// dropReasons — kode drop deterministik untuk event PACKET_DROPPED.
// Memperkaya event yang SUDAH ADA (tidak ada sistem event paralel):
// setiap core.drop() kini menyertakan `code` kanonik di samping
// `reason` detail. Kode stabil bisa di-assert oleh test/grading.
// ============================================================

export const DROP_CODE = {
  'iface-down': 'PORT_DOWN',
  'egress-down': 'PORT_DOWN',
  'power': 'POWER_OFF',
  'stp': 'STP_BLOCK',
  'vlan': 'VLAN_MISMATCH',
  'port-security-violation': 'PORT_SECURITY',
  'same-port': 'SAME_PORT',
  'flood-empty': 'NO_MAC_ENTRY',
  'l2-loop': 'LOOP_BOUND',
  'arp-malformed': 'ARP_MALFORMED',
  'arp-not-for-me': 'ARP_NOT_FOR_ME',
  'arp-consumed': 'ARP_CONSUMED',
  'arp-unknown': 'ARP_UNKNOWN',
  'arp-unresolved': 'ARP_UNRESOLVED',
  'l2-filter': 'L2_FILTER',
  'firewall': 'FIREWALL_DENY',
  'acl-deny': 'ACL_DENY',
  'not-for-me': 'NOT_FOR_ME',
  'ttl-expired': 'TTL_EXPIRED',
  'no-route': 'NO_ROUTE',
  'no-route-v6': 'NO_ROUTE',
  'route-discard': 'NO_ROUTE',
  'nat-port-exhausted': 'NAT_FAILURE',
  'qos': 'QOS_DROP',
  'refused': 'TCP_REFUSED',
  'no-assoc': 'NO_ASSOCIATION',
  'auth': 'WIRELESS_AUTH',
  'dhcp-no-pool': 'DHCP_NO_POOL',
  'dhcp-pool-full': 'DHCP_POOL_FULL',
  'dhcp-nak': 'DHCP_NAK',
  'dhcp-unknown': 'DHCP_UNKNOWN',
  'dhcp-consumed': 'DHCP_CONSUMED',
  'dhcp-ignored': 'DHCP_IGNORED',
  'dhcp-relay-no-ip': 'DHCP_RELAY_NO_IP',
  'dhcp-relay-no-client-iface': 'DHCP_RELAY_NO_CLIENT_IFACE',
  'ndp-consumed': 'NDP_CONSUMED',
  'icmp-error': 'ICMP_ERROR',
  'icmp-unknown': 'ICMP_UNKNOWN',
  'tcp-unknown': 'TCP_UNKNOWN',
  'unsupported': 'UNSUPPORTED',
  'dns-consumed': 'DNS_CONSUMED',
  'snmp-consumed': 'SNMP_CONSUMED',
  'no-snmp-agent': 'NO_SNMP_AGENT',
  'udp-unknown': 'UDP_UNKNOWN',
  'consumed': 'CONSUMED',
} as const;

/** Kode kanonik untuk sebuah reason detail ('no-route' → 'NO_ROUTE'). */
export function dropCodeOf(reason: string): string {
  return (DROP_CODE as Record<string, string>)[reason] || 'DROP';
}
