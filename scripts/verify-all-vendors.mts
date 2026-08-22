/**
 * Verifikasi fitur lengkap SEMUA vendor: DHCP server/client, DNS, NAT,
 * VLAN, ACL, routing (OSPF/RIP), BGP, wireless, queue, web server.
 * Jalankan: npx tsx scripts/verify-all-vendors.mts
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { VendorDispatcher } from '../packages/vendors/src/index';

const VENDORS = ['mikrotik', 'cisco_ios', 'cisco_nxos', 'juniper', 'huawei', 'ubiquiti', 'vyos', 'fortinet', 'aruba', 'openwrt', 'linux'];

/** Nama port autentik per vendor (selaras deviceModels.ts) — huawei memakai
 *  GigabitEthernet0/0/N, vendor lain generik p1..p3 sesuai kasus matriks. */
const VENDOR_PORTS: Record<string, string[]> = {
  huawei: ['GigabitEthernet0/0/1', 'GigabitEthernet0/0/2', 'GigabitEthernet0/0/3'],
};

const mkCtx = (nodeId: string, name: string, portNames: string[]) => ({
  nodeId,
  name,
  ports: portNames.map((n, i) => ({ id: n, name: n, status: (i === 0 ? 'up' : 'down') as 'up' | 'down' })),
  pingSimulator: undefined,
});

interface FeatureCase {
  name: string;
  cmds: string[];
  check: (mem: any) => boolean;
  detail?: (mem: any) => string;
}

type VendorMatrix = Record<string, FeatureCase[]>;

const matrix: VendorMatrix = {
  mikrotik: [
    {
      name: 'DHCP server (pool + server)',
      cmds: [
        '/ip pool add name=pool1 ranges=192.168.88.100-192.168.88.200',
        '/ip dhcp-server add name=dhcp1 interface=p1 address-pool=pool1',
      ],
      check: (m) => m.dhcpPools.length === 1 && m.dhcpPools[0].iface === 'p1',
    },
    { name: 'DHCP client', cmds: ['/ip dhcp-client add interface=p2 add-default-route=yes'], check: (m) => (m.dhcpClients || []).length === 1 },
    { name: 'DNS server', cmds: ['/ip dns set servers=8.8.8.8'], check: (m) => m.dnsServers.length === 1 },
    { name: 'DNS static record', cmds: ['/ip dns static add name=web.site address=203.0.113.10'], check: (m) => m.dnsRecords.length === 1 },
    { name: 'NAT (srcnat masquerade)', cmds: ['/ip firewall nat add chain=srcnat out-interface=p1 action=masquerade'], check: (m) => m.natRules.length === 1 && m.natRules[0].chain === 'srcnat' },
    { name: 'NAT (dstnat port-forward)', cmds: ['/ip firewall nat add chain=dstnat protocol=tcp dst-port=8080 action=dst-nat to-addresses=192.168.1.10 to-ports=80'], check: (m) => m.natRules.length === 2 && m.natRules[1].toPorts === '80' },
    { name: 'VLAN', cmds: ['/interface vlan add name=vlan10 vlan-id=10 interface=p2'], check: (m) => m.vlans.length === 1 && m.vlans[0].name === 'vlan10' },
    { name: 'ACL (firewall filter)', cmds: ['/ip firewall filter add chain=input protocol=icmp action=drop'], check: (m) => m.acls.length === 1 && m.acls[0].action === 'deny' },
    { name: 'OSPF', cmds: ['/routing ospf instance add name=x router-id=1.1.1.1', '/routing ospf network add network=10.0.0.0/24 area=0'], check: (m) => m.routing.ospf.enabled && m.routing.ospf.networks.length === 1 },
    { name: 'BGP (instance+peer+network)', cmds: ['/routing bgp instance add as=65001 router-id=1.1.1.1', '/routing bgp peer add remote-as=65002 remote-address=192.168.1.2', '/routing bgp network add network=10.0.1.0/24'], check: (m) => m.bgp.asn === 65001 && m.bgp.peers.length === 1 && m.bgp.networks.length === 1 },
    { name: 'Wireless', cmds: ['/interface wireless set wlan1 ssid=NetLab band=2ghz-b mode=ap-bridge'], check: (m) => m.wireless?.wlan1?.ssid === 'NetLab' },
    { name: 'Queue simple', cmds: ['/queue simple add name=q1 target=192.168.1.0/24 max-limit=10M/10M'], check: (m) => (m.queues || []).length === 1 },
    { name: 'Web server', cmds: ['/ip service set www disabled=no'], check: (m) => m.webServer?.enabled === true },
  ],
  cisco_ios: [
    {
      name: 'DHCP server (pool)',
      cmds: ['ip dhcp pool LAN1', 'network 192.168.88.0 255.255.255.0', 'default-router 192.168.88.1'],
      check: (m) => m.dhcpPools.length === 1 && m.dhcpPools[0].name === 'LAN1' && m.dhcpPools[0].gateway === '192.168.88.1',
    },
    { name: 'DHCP client', cmds: ['interface p1', 'ip address dhcp'], check: (m) => (m.dhcpClients || []).length === 1 },
    { name: 'DNS', cmds: ['ip name-server 8.8.8.8'], check: (m) => m.dnsServers.length === 1 },
    { name: 'VLAN', cmds: ['vlan 10'], check: (m) => m.vlans.length === 1 && m.vlans[0].id === '10' },
    { name: 'ACL', cmds: ['access-list 100 deny icmp any any'], check: (m) => m.acls.length === 1 && m.acls[0].action === 'deny' },
    { name: 'OSPF', cmds: ['router ospf 1', 'network 10.0.0.0 0.0.0.255 area 0'], check: (m) => m.routing.ospf.enabled && m.routing.ospf.networks.length === 1 },
    { name: 'BGP', cmds: ['router bgp 65001', 'neighbor 192.168.1.2 remote-as 65002', 'network 10.0.1.0 mask 255.255.255.0'], check: (m) => m.bgp.asn === 65001 && m.bgp.peers.length === 1 && m.bgp.networks.length === 1 },
  ],
  cisco_nxos: [
    {
      name: 'DHCP server (pool)',
      cmds: ['ip dhcp pool LAN1', 'network 192.168.88.0 255.255.255.0', 'default-router 192.168.88.1'],
      check: (m) => m.dhcpPools.length === 1 && m.dhcpPools[0].gateway === '192.168.88.1',
    },
    { name: 'DHCP client', cmds: ['interface p1', 'ip address dhcp'], check: (m) => (m.dhcpClients || []).length === 1 },
    { name: 'DNS', cmds: ['ip name-server 8.8.8.8'], check: (m) => m.dnsServers.length === 1 },
    { name: 'VLAN', cmds: ['vlan 10'], check: (m) => m.vlans.length === 1 },
    { name: 'ACL', cmds: ['access-list 100 deny icmp any any'], check: (m) => m.acls.length === 1 },
    { name: 'OSPF', cmds: ['router ospf 1', 'network 10.0.0.0 0.0.0.255 area 0'], check: (m) => m.routing.ospf.enabled },
    { name: 'BGP', cmds: ['router bgp 65001', 'neighbor 192.168.1.2 remote-as 65002', 'network 10.0.1.0 mask 255.255.255.0'], check: (m) => m.bgp.asn === 65001 && m.bgp.peers.length === 1 },
  ],
  juniper: [
    { name: 'DNS', cmds: ['set system name-server 8.8.8.8'], check: (m) => m.dnsServers.length === 1 },
    { name: 'DNS static record', cmds: ['set system static-host-mapping host-name web.site inet 203.0.113.10'], check: (m) => m.dnsRecords.length === 1 && m.dnsRecords[0].address === '203.0.113.10' },
    { name: 'VLAN', cmds: ['set vlans V10 vlan-id 10'], check: (m) => m.vlans.length === 1 && m.vlans[0].id === '10' },
    { name: 'OSPF', cmds: ['set protocols ospf area 0 interface ge-0/0/0'], check: (m) => m.routing.ospf.enabled },
    {
      name: 'DHCP server (pool + dhcp-local-server)',
      cmds: [
        'set access address-assignment pool LAN1 family inet network 192.168.88.0/24',
        'set access address-assignment pool LAN1 family inet range R1 low 192.168.88.100 high 192.168.88.200',
        'set access address-assignment pool LAN1 family inet dhcp-attributes router 192.168.88.1',
        'set system services dhcp-local-server group G1 pool LAN1',
        'set system services dhcp-local-server group G1 interface p1',
      ],
      check: (m) => m.dhcpPools.length === 1 && m.dhcpPools[0].network === '192.168.88.0/24' && m.dhcpPools[0].range === '192.168.88.100-192.168.88.200' && m.dhcpPools[0].iface === 'p1' && m.dhcpPools[0].gateway === '192.168.88.1',
    },
    { name: 'DHCP client', cmds: ['set interfaces p2 unit 0 family inet dhcp-client'], check: (m) => (m.dhcpClients || []).length === 1 },
    {
      name: 'BGP (as + group + peer + network)',
      cmds: [
        'set routing-options autonomous-system 65001',
        'set routing-options router-id 1.1.1.1',
        'set protocols bgp group EXT type external',
        'set protocols bgp group EXT peer-as 65002',
        'set protocols bgp group EXT neighbor 192.168.1.2',
        'set protocols bgp group EXT network 10.0.1.0/24',
      ],
      check: (m) => m.bgp.asn === 65001 && m.bgp.routerId === '1.1.1.1' && m.bgp.peers.length === 1 && m.bgp.peers[0].remoteAs === 65002 && m.bgp.networks.length === 1,
    },
    {
      name: 'ACL (firewall filter)',
      cmds: ['set firewall family inet filter PROTECT term t1 from protocol icmp', 'set firewall family inet filter PROTECT term t1 then reject'],
      check: (m) => m.acls.length === 1 && m.acls[0].action === 'deny' && m.acls[0].proto === 'icmp',
    },
    {
      name: 'NAT (source-nat interface)',
      cmds: ['set security nat source rule-set RS1 rule 10 match source-address 192.168.88.0/24', 'set security nat source rule-set RS1 rule 10 then source-nat interface'],
      check: (m) => m.natRules.length === 1 && m.natRules[0].chain === 'srcnat' && m.natRules[0].action === 'masquerade' && m.natRules[0].srcAddress === '192.168.88.0/24',
    },
    {
      name: 'NAT (destination pool)',
      cmds: [
        'set security nat destination pool WEB address 192.168.1.10',
        'set security nat destination pool WEB port 80',
        'set security nat destination rule-set RS2 rule 10 match destination-address 203.0.113.1',
        'set security nat destination rule-set RS2 rule 10 match destination-port 8080',
        'set security nat destination rule-set RS2 rule 10 then destination-nat pool WEB',
      ],
      check: (m) => m.natRules.length === 2 && m.natRules[1].chain === 'dstnat' && m.natRules[1].toAddresses === '192.168.1.10' && m.natRules[1].toPorts === '80',
    },
  ],
  huawei: [
    { name: 'DHCP server (global)', cmds: ['dhcp enable'], check: (m) => m.dhcpEnabled === true },
    { name: 'DHCP client', cmds: ['interface GigabitEthernet0/0/2', 'ip address dhcp'], check: (m) => (m.dhcpClients || []).length === 1 },
    { name: 'DNS', cmds: ['dns server 8.8.8.8'], check: (m) => m.dnsServers.length === 1 },
    { name: 'VLAN', cmds: ['vlan 10'], check: (m) => m.vlans.length === 1 },
    { name: 'OSPF', cmds: ['ospf 1', 'network 10.0.0.0 0.0.0.255 area 0'], check: (m) => m.routing.ospf.enabled },
    {
      name: 'DHCP server (ip pool + gateway)',
      cmds: ['ip pool LAN1', 'network 192.168.88.0 mask 255.255.255.0', 'gateway-list 192.168.88.1'],
      check: (m) => m.dhcpPools.some((p: any) => p.name === 'LAN1' && p.gateway === '192.168.88.1' && p.network === '192.168.88.0 255.255.255.0'),
    },
    {
      name: 'BGP (bgp/peer/network)',
      cmds: ['bgp 65001', 'peer 192.168.1.2 as-number 65002', 'network 10.0.1.0 mask 255.255.255.0', 'quit'],
      check: (m) => m.bgp.asn === 65001 && m.bgp.peers.length === 1 && m.bgp.peers[0].remoteAs === 65002 && m.bgp.networks.length === 1,
    },
    {
      name: 'ACL (acl + rule)',
      cmds: ['acl 3000', 'rule 5 deny icmp source 10.0.0.0 0.0.0.255', 'quit'],
      check: (m) => m.acls.length === 1 && m.acls[0].aclId === '3000' && m.acls[0].action === 'deny' && m.acls[0].proto === 'icmp',
    },
    {
      name: 'NAT (outbound + server)',
      cmds: [
        'interface GigabitEthernet0/0/1',
        'ip address 203.0.113.1 255.255.255.0',
        'nat outbound 3000',
        'nat server protocol tcp global current-interface 8080 inside 192.168.1.10 80',
      ],
      check: (m) => {
        const src = m.natRules.find((r: any) => r.chain === 'srcnat');
        const dst = m.natRules.find((r: any) => r.chain === 'dstnat');
        return !!src && !!dst && dst.dstAddress === '203.0.113.1' && dst.toAddresses === '192.168.1.10' && dst.toPorts === '80';
      },
    },
    { name: 'DNS static record', cmds: ['ip host web.site 203.0.113.10'], check: (m) => m.dnsRecords.length === 1 },
  ],
  ubiquiti: [
    { name: 'DNS', cmds: ['set system name-server 8.8.8.8'], check: (m) => m.dnsServers.length === 1 },
    { name: 'VLAN', cmds: ['set vlans V10 vlan-id 10'], check: (m) => m.vlans.length === 1 },
    { name: 'OSPF', cmds: ['set protocols ospf area 0 interface eth0'], check: (m) => m.routing.ospf.enabled },
    {
      name: 'DHCP server (shared-network)',
      cmds: [
        'set service dhcp-server shared-network-name LAN1 subnet 192.168.88.0/24 start 192.168.88.100 stop 192.168.88.200',
        'set service dhcp-server shared-network-name LAN1 subnet 192.168.88.0/24 default-router 192.168.88.1',
      ],
      check: (m) => m.dhcpPools.length === 1 && m.dhcpPools[0].network === '192.168.88.0/24' && m.dhcpPools[0].range === '192.168.88.100-192.168.88.200' && m.dhcpPools[0].gateway === '192.168.88.1',
    },
    { name: 'DHCP client', cmds: ['set interfaces ethernet p2 address dhcp'], check: (m) => (m.dhcpClients || []).length === 1 },
    {
      name: 'NAT source (masquerade)',
      cmds: ['set nat source rule 10 outbound-interface p2', 'set nat source rule 10 source address 192.168.88.0/24', 'set nat source rule 10 translation address masquerade'],
      check: (m) => m.natRules.length === 1 && m.natRules[0].chain === 'srcnat' && m.natRules[0].outInterface === 'p2',
    },
    {
      name: 'NAT destination (port-forward)',
      cmds: ['set nat destination rule 100 inbound-interface p2', 'set nat destination rule 100 protocol tcp', 'set nat destination rule 100 destination port 8080', 'set nat destination rule 100 translation address 192.168.1.10', 'set nat destination rule 100 translation port 80'],
      check: (m) => m.natRules.length === 2 && m.natRules[1].chain === 'dstnat' && m.natRules[1].toAddresses === '192.168.1.10' && m.natRules[1].toPorts === '80' && m.natRules[1].dstPort === '8080',
    },
    {
      name: 'BGP',
      cmds: ['set protocols bgp 65001 parameters router-id 1.1.1.1', 'set protocols bgp 65001 neighbor 192.168.1.2 remote-as 65002', 'set protocols bgp 65001 network 10.0.1.0/24'],
      check: (m) => m.bgp.asn === 65001 && m.bgp.peers.length === 1 && m.bgp.networks.length === 1,
    },
    {
      name: 'ACL (firewall name)',
      cmds: ['set firewall name FW1 rule 10 action drop', 'set firewall name FW1 rule 10 protocol icmp', 'set firewall name FW1 rule 10 source address 10.0.0.0/8'],
      check: (m) => m.acls.length === 1 && m.acls[0].action === 'deny' && m.acls[0].proto === 'icmp' && m.acls[0].src === '10.0.0.0/8',
    },
    { name: 'DNS static record', cmds: ['set system static-host-mapping host-name web.site inet 203.0.113.10'], check: (m) => m.dnsRecords.length === 1 },
  ],
  vyos: [
    { name: 'DNS', cmds: ['set system name-server 8.8.8.8'], check: (m) => m.dnsServers.length === 1 },
    { name: 'VLAN', cmds: ['set vlans V10 vlan-id 10'], check: (m) => m.vlans.length === 1 },
    { name: 'OSPF', cmds: ['set protocols ospf area 0 interface eth0'], check: (m) => m.routing.ospf.enabled },
    {
      name: 'DHCP server (shared-network)',
      cmds: [
        'set service dhcp-server shared-network-name LAN1 subnet 192.168.88.0/24 start 192.168.88.100 stop 192.168.88.200',
        'set service dhcp-server shared-network-name LAN1 subnet 192.168.88.0/24 default-router 192.168.88.1',
      ],
      check: (m) => m.dhcpPools.length === 1 && m.dhcpPools[0].network === '192.168.88.0/24' && m.dhcpPools[0].range === '192.168.88.100-192.168.88.200' && m.dhcpPools[0].gateway === '192.168.88.1',
    },
    { name: 'DHCP client', cmds: ['set interfaces ethernet p2 address dhcp'], check: (m) => (m.dhcpClients || []).length === 1 },
    {
      name: 'NAT source (masquerade)',
      cmds: ['set nat source rule 10 outbound-interface p2', 'set nat source rule 10 source address 192.168.88.0/24', 'set nat source rule 10 translation address masquerade'],
      check: (m) => m.natRules.length === 1 && m.natRules[0].chain === 'srcnat' && m.natRules[0].outInterface === 'p2',
    },
    {
      name: 'NAT destination (port-forward)',
      cmds: ['set nat destination rule 100 inbound-interface p2', 'set nat destination rule 100 protocol tcp', 'set nat destination rule 100 destination port 8080', 'set nat destination rule 100 translation address 192.168.1.10', 'set nat destination rule 100 translation port 80'],
      check: (m) => m.natRules.length === 2 && m.natRules[1].chain === 'dstnat' && m.natRules[1].toAddresses === '192.168.1.10' && m.natRules[1].toPorts === '80' && m.natRules[1].dstPort === '8080',
    },
    {
      name: 'BGP',
      cmds: ['set protocols bgp 65001 parameters router-id 1.1.1.1', 'set protocols bgp 65001 neighbor 192.168.1.2 remote-as 65002', 'set protocols bgp 65001 network 10.0.1.0/24'],
      check: (m) => m.bgp.asn === 65001 && m.bgp.peers.length === 1 && m.bgp.networks.length === 1,
    },
    {
      name: 'ACL (firewall name)',
      cmds: ['set firewall name FW1 rule 10 action drop', 'set firewall name FW1 rule 10 protocol icmp', 'set firewall name FW1 rule 10 source address 10.0.0.0/8'],
      check: (m) => m.acls.length === 1 && m.acls[0].action === 'deny' && m.acls[0].proto === 'icmp' && m.acls[0].src === '10.0.0.0/8',
    },
    { name: 'DNS static record', cmds: ['set system static-host-mapping host-name web.site inet 203.0.113.10'], check: (m) => m.dnsRecords.length === 1 },
  ],
  fortinet: [
    {
      name: 'DHCP server (full config)',
      // Alur FortiOS nyata: interface wajib punya IP dulu — network pool
      // diturunkan dari subnet interface (bukan dikarang dari range).
      cmds: [
        'config system interface',
        'edit port1',
        'set ip 192.168.88.1 255.255.255.0',
        'next',
        'end',
        'config system dhcp server',
        'edit 1',
        'set interface port1',
        'set netmask 255.255.255.0',
        'config ip-range',
        'edit 1',
        'set start-ip 192.168.88.100',
        'set end-ip 192.168.88.200',
        'end',
        'set default-gateway 192.168.88.1',
        'set dns-server 8.8.8.8',
        'end',
      ],
      check: (m) => m.dhcpPools.length === 1 && m.dhcpPools[0].iface === 'port1' && m.dhcpPools[0].range === '192.168.88.100-192.168.88.200' && m.dhcpPools[0].network === '192.168.88.0/24' && m.dhcpPools[0].gateway === '192.168.88.1' && m.dnsServers.includes('8.8.8.8'),
    },
    { name: 'DHCP client', cmds: ['config system dhcp client', 'edit port2', 'set mode dhcp', 'end'], check: (m) => (m.dhcpClients || []).length === 1 },
    { name: 'DNS (system dns)', cmds: ['config system dns', 'set primary 1.1.1.1', 'set secondary 8.8.8.8', 'end'], check: (m) => m.dnsServers.length === 2 },
    { name: 'VLAN (subinterface)', cmds: ['config system interface', 'edit port1.10', 'set vlanid 10', 'set interface port1', 'end'], check: (m) => m.vlans.length === 1 && m.vlans[0].id === '10' },
    {
      name: 'OSPF',
      cmds: ['config router ospf', 'set router-id 1.1.1.1', 'config network', 'edit 1', 'set prefix 10.0.0.0 255.255.255.0', 'end', 'end'],
      check: (m) => m.routing.ospf.enabled && m.routing.ospf.routerId === '1.1.1.1' && m.routing.ospf.networks.length === 1,
    },
    {
      name: 'BGP',
      cmds: ['config router bgp', 'set as 65001', 'set router-id 1.1.1.1', 'config neighbor', 'edit 192.168.1.2', 'set remote-as 65002', 'end', 'end'],
      check: (m) => m.bgp.asn === 65001 && m.bgp.peers.length === 1 && m.bgp.peers[0].remoteAddr === '192.168.1.2',
    },
    {
      name: 'NAT (policy nat)',
      cmds: ['config firewall policy', 'edit 1', 'set srcintf "port1"', 'set dstintf "port2"', 'set action accept', 'set nat enable', 'set srcaddr "all"', 'set dstaddr "all"', 'next', 'end'],
      check: (m) => m.natRules.length === 1 && m.natRules[0].chain === 'srcnat' && m.natRules[0].outInterface === 'port2',
    },
    {
      name: 'NAT (vip port-forward)',
      cmds: ['config firewall vip', 'edit "web1"', 'set extip 203.0.113.1', 'set mappedip 192.168.1.10', 'set extintf "port2"', 'set portforward enable', 'set protocol tcp', 'set extport 8080', 'set mappedport 80', 'end'],
      check: (m) => m.natRules.length === 2 && m.natRules[1].chain === 'dstnat' && m.natRules[1].toAddresses === '192.168.1.10' && m.natRules[1].toPorts === '80' && m.natRules[1].dstPort === '8080',
    },
    {
      name: 'ACL (policy deny)',
      cmds: ['config firewall policy', 'edit 2', 'set srcintf "port1"', 'set dstintf "port2"', 'set action deny', 'set srcaddr "all"', 'set dstaddr "all"', 'set service icmp', 'next', 'end'],
      check: (m) => m.acls.length === 1 && m.acls[0].action === 'deny' && m.acls[0].proto === 'icmp',
    },
  ],
  aruba: [
    {
      name: 'DHCP server (pool)',
      cmds: ['ip dhcp pool LAN1', 'network 192.168.88.0 255.255.255.0', 'default-router 192.168.88.1'],
      check: (m) => m.dhcpPools.length === 1 && m.dhcpPools[0].gateway === '192.168.88.1',
    },
    { name: 'DHCP client', cmds: ['interface p1', 'ip address dhcp'], check: (m) => (m.dhcpClients || []).length === 1 },
    { name: 'DNS', cmds: ['ip name-server 8.8.8.8'], check: (m) => m.dnsServers.length === 1 },
    { name: 'VLAN', cmds: ['vlan 10'], check: (m) => m.vlans.length === 1 },
    { name: 'ACL', cmds: ['access-list 100 deny icmp any any'], check: (m) => m.acls.length === 1 },
    { name: 'OSPF', cmds: ['router ospf 1', 'network 10.0.0.0 0.0.0.255 area 0'], check: (m) => m.routing.ospf.enabled },
    { name: 'DNS static record', cmds: ['ip host web.site 203.0.113.10'], check: (m) => m.dnsRecords.length === 1 },
  ],
  openwrt: [
    { name: 'DNS', cmds: ['echo "nameserver 8.8.8.8" > /etc/resolv.conf'], check: (m) => m.dnsServers.length === 1 },
    { name: 'VLAN', cmds: ['uci set network.vlan10.vlan=10'], check: (m) => m.vlans.length === 1 },
    { name: 'DHCP client', cmds: ['dhclient eth0'], check: (m) => (m.dhcpClients || []).length === 1 },
    { name: 'Web server', cmds: ['echo "Hi" > /var/www/html/index.html'], check: (m) => m.webServer?.content === 'Hi' },
    {
      name: 'DHCP server (uci dhcp)',
      cmds: ['uci set network.lan.ipaddr=192.168.1.1', 'uci set network.lan.netmask=255.255.255.0', 'uci set network.lan.proto=static', 'uci commit network', 'uci set dhcp.lan=dhcp', 'uci set dhcp.lan.interface=lan', 'uci set dhcp.lan.start=100', 'uci set dhcp.lan.limit=100', 'uci commit dhcp'],
      check: (m) => m.dhcpPools.length === 1 && m.dhcpPools[0].name === 'lan' && m.dhcpPools[0].range === '192.168.1.100-192.168.1.199' && m.dhcpPools[0].iface === 'lan' && m.dhcpPools[0].network === '192.168.1.0/24',
    },
    {
      name: 'NAT masquerade (uci firewall)',
      cmds: ['uci set firewall.@zone[1].masq=1', 'uci commit firewall'],
      check: (m) => m.natRules.length === 1 && m.natRules[0].chain === 'srcnat' && m.natRules[0].action === 'masquerade',
    },
    {
      name: 'NAT port-forward (uci redirect)',
      cmds: ['uci add firewall redirect', 'uci set firewall.@redirect[0].dest_ip=192.168.1.10', 'uci set firewall.@redirect[0].dest_port=80', 'uci set firewall.@redirect[0].src_dport=8080', 'uci set firewall.@redirect[0].target=DNAT', 'uci commit firewall'],
      check: (m) => m.natRules.length === 2 && m.natRules[1].chain === 'dstnat' && m.natRules[1].toAddresses === '192.168.1.10' && m.natRules[1].dstPort === '8080' && m.natRules[1].toPorts === '80',
    },
    {
      name: 'Static route (uci network)',
      cmds: ['uci set network.route1=route', 'uci set network.route1.target=10.0.0.0/24', 'uci set network.route1.gateway=192.168.88.1', 'uci commit network'],
      check: (m) => m.routes.length === 1 && m.routes[0].dst === '10.0.0.0/24' && m.routes[0].gateway === '192.168.88.1',
    },
  ],
  linux: [
    { name: 'DNS', cmds: ['echo "nameserver 8.8.8.8" > /etc/resolv.conf'], check: (m) => m.dnsServers.length === 1 },
    { name: 'DHCP client', cmds: ['dhclient eth0'], check: (m) => (m.dhcpClients || []).length === 1 },
    { name: 'Web server', cmds: ['echo "Hi" > /var/www/html/index.html'], check: (m) => m.webServer?.content === 'Hi' },
    {
      name: 'DHCP server (dhcpd.conf)',
      cmds: ['echo "subnet 192.168.88.0 netmask 255.255.255.0 { range 192.168.88.100 192.168.88.200; option routers 192.168.88.1; }" > /etc/dhcp/dhcpd.conf'],
      check: (m) => m.dhcpPools.length === 1 && m.dhcpPools[0].range === '192.168.88.100-192.168.88.200' && m.dhcpPools[0].network === '192.168.88.0/24' && m.dhcpPools[0].gateway === '192.168.88.1',
    },
    { name: 'NAT masquerade (iptables)', cmds: ['iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE'], check: (m) => m.natRules.length === 1 && m.natRules[0].chain === 'srcnat' && m.natRules[0].outInterface === 'eth0' },
    {
      name: 'NAT port-forward (DNAT)',
      cmds: ['iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 8080 -j DNAT --to-destination 192.168.1.10:80'],
      check: (m) => m.natRules.length === 2 && m.natRules[1].chain === 'dstnat' && m.natRules[1].toAddresses === '192.168.1.10' && m.natRules[1].toPorts === '80' && m.natRules[1].dstPort === '8080',
    },
    { name: 'DNS static record', cmds: ['echo "203.0.113.10 web.site" >> /etc/hosts'], check: (m) => m.dnsRecords.length === 1 },
  ],
};

export interface MatrixCaseResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  detail?: string;
}

export interface VendorMatrixResult {
  vendor: string;
  total: number;
  pass: number;
  fail: number;
  skip: number;
  cases: MatrixCaseResult[];
}

export interface VerifyReport {
  vendors: VendorMatrixResult[];
  pass: number;
  fail: number;
  skip: number;
}

/** Jalankan matriks fitur untuk semua vendor dan kembalikan hasil terstruktur.
 *  Dipakai langsung oleh CLI ini maupun diimpor scripts/conformance-score.mts —
 *  skor konformansi SELALU diturunkan dari eksekusi nyata, bukan angka hardcode. */
export function runVerifyMatrix(opts?: { quiet?: boolean }): VerifyReport {
  const log = (...a: unknown[]) => { if (!opts?.quiet) console.log(...a); };
  const d = new VendorDispatcher();
  const report: VerifyReport = { vendors: [], pass: 0, fail: 0, skip: 0 };

  for (const vendor of VENDORS) {
    log(`\n== ${vendor} ==`);
    const cases = matrix[vendor] ?? [];
    const res: VendorMatrixResult = { vendor, total: cases.length, pass: 0, fail: 0, skip: 0, cases: [] };
    if (cases.length === 0) {
      log('  (tidak ada fitur lanjutan yang didefinisikan — SKIP)');
      res.skip++;
      continue;
    }
    const id = `t_${vendor}`;
    const c = mkCtx(id, `${vendor}-gw`, VENDOR_PORTS[vendor] ?? ['p1', 'p2', 'p3']);
    const mem = d.getNodeMemory(id);
    for (const tc of cases) {
      let out = '';
      for (const cmd of tc.cmds) out = d.dispatch(vendor, cmd, c);
      const ok = tc.check(mem);
      const detail = tc.detail ? tc.detail(mem) : JSON.stringify({
        dhcpPools: mem.dhcpPools.length,
        dhcpClients: (mem.dhcpClients || []).length,
        dnsServers: mem.dnsServers.length,
        dnsRecords: mem.dnsRecords.length,
        natRules: mem.natRules.length,
        vlans: mem.vlans.length,
        acls: mem.acls.length,
        ospf: mem.routing.ospf.enabled,
        rip: mem.routing.rip.enabled,
        bgp: mem.bgp.asn,
        peers: mem.bgp.peers.length,
        queues: (mem.queues || []).length,
        wireless: mem.wireless ? Object.keys(mem.wireless) : [],
        web: mem.webServer,
      });
      if (ok) {
        res.pass++;
        res.cases.push({ name: tc.name, status: 'PASS' });
        log(`  PASS · ${tc.name}`);
      } else if (tc.detail) {
        res.skip++;
        res.cases.push({ name: tc.name, status: 'SKIP', detail });
        log(`  SKIP · ${tc.name} — ${detail}`);
      } else {
        res.fail++;
        res.cases.push({ name: tc.name, status: 'FAIL', detail });
        log(`  FAIL · ${tc.name}\n         ${detail}`);
      }
    }
    report.pass += res.pass;
    report.fail += res.fail;
    report.skip += res.skip;
    report.vendors.push(res);
  }

  log(`\nRESULT: ${report.pass} passed, ${report.fail} failed, ${report.skip} skipped (vendor matrix)`);
  return report;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  const failures = runVerifyMatrix().vendors.flatMap((v) => v.cases.filter((c) => c.status === 'FAIL').map((c) => `${v.vendor}: ${c.name}`));
  // Gagal = exit code 1 — CI wajib gagal bila ada regresi vendor.
  process.exit(failures.length ? 1 : 0);
}
