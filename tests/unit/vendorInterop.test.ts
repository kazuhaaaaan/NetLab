/**
 * Vendor interop & validation tests — bagian dari run_all_tests.mts.
 *
 * Isi:
 * 1. Konsistensi registry kapabilitas: setiap klaim 'supported' harus punya
 *    test otomatis yang lulus di file ini (tidak boleh klaim tanpa bukti).
 * 2. Round-trip konfigurasi per vendor: CLI → state → export config →
 *    re-import → state setara.
 * 3. Interop lintas vendor: ping L3 (static routing) untuk SEMUA pasangan
 *    vendor router (28 pasangan), plus DHCP lintas vendor.
 * 4. Fitur yang tidak didukung gagal JUJUR (no fake success).
 */
import { VendorDispatcher, VENDOR_CAPABILITIES } from '../../packages/vendors/src/index';
import type { CapabilityKey } from '../../packages/vendors/src/capabilities';
import { NetworkSimulator } from '../../src/engine/net/core/NetworkSimulator';
import type { LabProjectLike } from '../../src/engine/net/core/Topology';
import { unwrapProjectFile, validateProject, SCHEMA_VERSION, ENGINE_VERSION } from '../../src/utils/projectValidation';
import { isReservedAddress, validateGatewayInSubnet, findSubnetOverlap, validateHostIp } from '../../src/utils/validation';

const VENDOR_IDS = Object.keys(VENDOR_CAPABILITIES);

// Urutan kolom & baris matriks validasi (sama dengan modal UI VendorCapabilitiesModal).
const CAP_ORDER: CapabilityKey[] = [
  'ipv4', 'ipv6', 'staticRoute', 'vlan', 'dhcp', 'nat', 'ospf', 'bgp', 'vrrp', 'firewall', 'dns', 'commit',
];
const VENDOR_ORDER = ['mikrotik', 'cisco_ios', 'cisco_nxos', 'juniper', 'huawei', 'ubiquiti', 'vyos', 'fortinet', 'aruba', 'openwrt', 'linux'];

interface Report {
  passed: number;
  failed: number;
  fails: string[];
}

const rep: Report = { passed: 0, failed: 0, fails: [] };

function check(name: string, cond: boolean, detail = '') {
  if (cond) rep.passed++;
  else {
    rep.failed++;
    rep.fails.push(`${name} ${detail}`);
  }
}

// ── Harness: replika App.syncNodeToEngine ─────────────────────────────
const iPorts = (n: number, macSeed: string) =>
  Array.from({ length: n }, (_, i) => ({ id: `ether${i + 1}`, name: `ether${i + 1}`, status: 'up' as const, macAddress: `00:0c:29:${macSeed}:${(i + 1).toString().padStart(2, '0')}:01` }));

const mkCtx = (nodeId: string, name: string, portNames: string[]) => ({
  nodeId,
  name,
  ports: portNames.map((n, i) => ({ id: n, name: n, status: (i === 0 ? 'up' : 'down') as 'up' | 'down' })),
  pingSimulator: undefined,
});

const syncCli = (dis: VendorDispatcher, sim: NetworkSimulator, nodeId: string) => {
  const mem = dis.getNodeMemory(nodeId);
  sim.setSubinterfaces(nodeId, mem.subinterfaces || undefined);
  sim.setShutdownIfaces(nodeId, mem.shutdownIfaces || undefined);
  sim.applyNodeConfig(nodeId, mem.configuredIps, mem.routes);
  sim.setRouting(nodeId, mem.routing || undefined);
  sim.setBgp(nodeId, mem.bgp || undefined);
  sim.setSnmp(nodeId, mem.snmp || undefined);
  sim.setAcls(nodeId, mem.acls || undefined);
  sim.setNatRules(nodeId, mem.natRules || undefined);
  sim.setDnsRecords(nodeId, mem.dnsRecords || undefined);
  sim.setDnsServers(nodeId, mem.dnsServers || undefined);
  sim.setFhrp(nodeId, mem.fhrpGroups || undefined);
  sim.setTrunkPorts(nodeId, mem.trunkPorts || undefined);
  sim.setPortVlans(nodeId, mem.portVlans || undefined);
  sim.setStp(nodeId, mem.stp || undefined);
  sim.setWebServer(nodeId, mem.webServer || undefined);
};

// ── 1. Per-capability feature commands per vendor (bukti dukungan) ────
// Setiap command harus memodifikasi normalized memory yang dibaca engine.
interface FeatureCmd {
  cap: CapabilityKey;
  cmds: string[];
  assert: (mem: any) => boolean;
}

// Normalisasi "10.0.1.1 255.255.255.252" ↔ "10.0.1.1/30" (storage tiap vendor
// berbeda bentuk; engine menerima keduanya).
const maskBits = (mask: string): number =>
  mask.split('.').reduce((b, o) => b + (o === '255' ? 8 : o === '254' ? 7 : o === '252' ? 6 : o === '248' ? 5 : o === '240' ? 4 : o === '224' ? 3 : o === '192' ? 2 : o === '128' ? 1 : 0), 0);
const cidrNorm = (v: string): string => {
  const c = String(v || '').trim();
  if (!c) return '';
  if (c.includes('/')) return c;
  const p = c.split(/\s+/);
  return `${p[0]}/${maskBits(p[1] || '')}`;
};
const ipStored = (m: any, iface: string, want: string): boolean => cidrNorm(m.configuredIps?.[iface]) === want;
const routeStored = (m: any, dst: string, gw: string): boolean =>
  (m.routes || []).some((r: any) => cidrNorm(r.dst) === dst && r.gateway === gw);

const FEATURES: Record<string, FeatureCmd[]> = {
  mikrotik: [
    { cap: 'ipv4', cmds: ['/ip address add address=10.0.1.1/30 interface=ether1'], assert: (m) => ipStored(m, 'ether1', '10.0.1.1/30') },
    { cap: 'staticRoute', cmds: ['/ip route add dst-address=10.99.0.0/24 gateway=10.0.1.2'], assert: (m) => routeStored(m, '10.99.0.0/24', '10.0.1.2') },
    { cap: 'vlan', cmds: ['/interface vlan add name=vlan10 vlan-id=10 interface=ether1'], assert: (m) => m.vlans.some((v: any) => String(v.id) === '10') },
    { cap: 'nat', cmds: ['/ip firewall nat add chain=srcnat out-interface=ether2 action=masquerade'], assert: (m) => m.natRules.some((r: any) => r.chain === 'srcnat') },
    { cap: 'ospf', cmds: ['/routing ospf instance add name=x router-id=1.1.1.1', '/routing ospf network add network=10.0.0.0/24 area=0'], assert: (m) => m.routing?.ospf?.enabled && (m.routing?.ospf?.networks?.length ?? 0) >= 1 },
    { cap: 'bgp', cmds: ['/routing bgp instance add as=65001 router-id=1.1.1.1', '/routing bgp peer add remote-as=65002 remote-address=10.0.9.2', '/routing bgp network add network=10.0.1.0/24'], assert: (m) => m.bgp?.asn === 65001 && m.bgp?.peers?.length === 1 && (m.bgp?.networks?.length ?? 0) >= 1 },
    { cap: 'dns', cmds: ['/ip dns set servers=8.8.8.8'], assert: (m) => (m.dnsServers || []).length >= 1 },
    { cap: 'ipv6', cmds: ['/ipv6 address add address=2001:db8::1/64 interface=ether1'], assert: (m) => m.configuredIps6?.['ether1'] === '2001:db8::1/64' },
    { cap: 'dhcp', cmds: ['/ip pool add name=pool1 ranges=192.168.88.100-192.168.88.200', '/ip dhcp-server add name=dhcp1 interface=ether1 address-pool=pool1'], assert: (m) => m.dhcpPools.some((p: any) => p.iface === 'ether1') },
    { cap: 'firewall', cmds: ['/ip firewall filter add chain=input protocol=icmp action=drop'], assert: (m) => m.acls.some((a: any) => a.action === 'deny') },
  ],
  cisco_ios: [
    { cap: 'ipv4', cmds: ['interface ether1', 'ip address 10.0.1.1 255.255.255.252'], assert: (m) => ipStored(m, 'ether1', '10.0.1.1/30') },
    { cap: 'staticRoute', cmds: ['ip route 10.99.0.0 255.255.255.0 10.0.1.2'], assert: (m) => routeStored(m, '10.99.0.0/24', '10.0.1.2') },
    { cap: 'vlan', cmds: ['vlan 10', 'name v10'], assert: (m) => m.vlans.some((v: any) => String(v.id) === '10') },
    { cap: 'dhcp', cmds: ['ip dhcp pool LAN', 'network 192.168.9.0 255.255.255.0', 'default-router 192.168.9.1'], assert: (m) => m.dhcpPools.some((p: any) => p.name === 'LAN' && p.gateway === '192.168.9.1') },
    { cap: 'ospf', cmds: ['router ospf 1', 'network 10.0.0.0 0.0.0.255 area 0'], assert: (m) => m.routing?.ospf?.enabled },
    { cap: 'bgp', cmds: ['router bgp 65001', 'neighbor 10.0.9.2 remote-as 65002'], assert: (m) => m.bgp?.asn === 65001 && m.bgp?.peers?.length === 1 },
    { cap: 'vrrp', cmds: ['interface ether1', 'vrrp 1 ip 192.168.9.254'], assert: (m) => m.fhrpGroups?.some((g: any) => g.vrid === 1) },
    { cap: 'dns', cmds: ['ip name-server 8.8.8.8'], assert: (m) => (m.dnsServers || []).length >= 1 },
    { cap: 'ipv6', cmds: ['interface ether1', 'ipv6 address 2001:db8:1::1/64'], assert: (m) => m.configuredIps6?.['ether1'] === '2001:db8:1::1/64' },
  ],
  cisco_nxos: [
    { cap: 'ipv4', cmds: ['interface ether1', 'ip address 10.0.1.1/30'], assert: (m) => ipStored(m, 'ether1', '10.0.1.1/30') },
    { cap: 'staticRoute', cmds: ['ip route 10.99.0.0/24 10.0.1.2'], assert: (m) => routeStored(m, '10.99.0.0/24', '10.0.1.2') },
    { cap: 'vlan', cmds: ['vlan 10'], assert: (m) => String(m.vlans?.[0]?.id) === '10' },
    { cap: 'dhcp', cmds: ['ip dhcp pool LAN1', 'network 192.168.88.0 255.255.255.0', 'default-router 192.168.88.1'], assert: (m) => m.dhcpPools.some((p: any) => p.gateway === '192.168.88.1') },
    { cap: 'ospf', cmds: ['router ospf 1', 'network 10.0.0.0 0.0.0.255 area 0'], assert: (m) => m.routing?.ospf?.enabled },
    { cap: 'bgp', cmds: ['router bgp 65001', 'neighbor 10.0.9.2 remote-as 65002'], assert: (m) => m.bgp?.asn === 65001 && m.bgp?.peers?.length === 1 },
    { cap: 'dns', cmds: ['ip name-server 8.8.8.8'], assert: (m) => (m.dnsServers || []).length >= 1 },
    { cap: 'ipv6', cmds: ['interface ether1', 'ipv6 address 2001:db8::1/64'], assert: (m) => m.configuredIps6?.['ether1'] === '2001:db8::1/64' },
  ],
  juniper: [
    { cap: 'ipv4', cmds: ['set interfaces ether1 unit 0 family inet address 10.0.1.1/30'], assert: (m) => ipStored(m, 'ether1', '10.0.1.1/30') },
    { cap: 'staticRoute', cmds: ['set routing-options static route 10.99.0.0/24 next-hop 10.0.1.2'], assert: (m) => routeStored(m, '10.99.0.0/24', '10.0.1.2') },
    { cap: 'nat', cmds: ['set security nat source rule-set SNAT1 from interface ether2', 'set security nat source rule-set SNAT1 rule 10 match source-address 10.0.0.0/16', 'set security nat source rule-set SNAT1 rule 10 then source-nat interface'], assert: (m) => m.natRules.some((r: any) => r.chain === 'srcnat') },
    { cap: 'ospf', cmds: ['set protocols ospf area 0 interface ether1'], assert: (m) => m.routing?.ospf?.enabled },
    { cap: 'bgp', cmds: ['set routing-options autonomous-system 65001', 'set routing-options router-id 1.1.1.1', 'set protocols bgp group EXT type external', 'set protocols bgp group EXT peer-as 65002', 'set protocols bgp group EXT neighbor 10.0.9.2', 'set protocols bgp group EXT network 10.0.1.0/24'], assert: (m) => m.bgp?.asn === 65001 && m.bgp?.peers?.length === 1 && (m.bgp?.networks?.length ?? 0) >= 1 },
    { cap: 'commit', cmds: ['set system host-name jnet', 'commit'], assert: (m) => m.hostname === 'jnet' },
    { cap: 'vlan', cmds: ['set vlans V10 vlan-id 10'], assert: (m) => String(m.vlans?.[0]?.id) === '10' },
    { cap: 'dhcp', cmds: ['set access address-assignment pool LAN1 family inet network 192.168.88.0/24', 'set access address-assignment pool LAN1 family inet range R1 low 192.168.88.100 high 192.168.88.200', 'set access address-assignment pool LAN1 family inet dhcp-attributes router 192.168.88.1', 'set system services dhcp-local-server group G1 pool LAN1', 'set system services dhcp-local-server group G1 interface ether1'], assert: (m) => m.dhcpPools.some((p: any) => p.network === '192.168.88.0/24' && p.range === '192.168.88.100-192.168.88.200' && p.iface === 'ether1') },
    { cap: 'firewall', cmds: ['set firewall family inet filter PROTECT term t1 from protocol icmp', 'set firewall family inet filter PROTECT term t1 then reject'], assert: (m) => m.acls.some((a: any) => a.action === 'deny' && a.proto === 'icmp') },
    { cap: 'dns', cmds: ['set system name-server 8.8.8.8'], assert: (m) => (m.dnsServers || []).length >= 1 },
  ],
  huawei: [
    { cap: 'ipv4', cmds: ['interface ether1', 'ip address 10.0.1.1 255.255.255.252'], assert: (m) => ipStored(m, 'ether1', '10.0.1.1/30') },
    { cap: 'staticRoute', cmds: ['ip route-static 10.99.0.0 255.255.255.0 10.0.1.2'], assert: (m) => routeStored(m, '10.99.0.0/24', '10.0.1.2') },
    { cap: 'vlan', cmds: ['vlan 10'], assert: (m) => (m.vlans || []).length >= 1 },
    { cap: 'dhcp', cmds: ['dhcp enable', 'ip pool LAN1', 'network 192.168.9.0 mask 255.255.255.0', 'gateway-list 192.168.9.1'], assert: (m) => m.dhcpPools.some((p: any) => p.name === 'LAN1') },
    { cap: 'ospf', cmds: ['ospf 1', 'network 10.0.0.0 0.0.0.255 area 0'], assert: (m) => m.routing?.ospf?.enabled },
    { cap: 'bgp', cmds: ['bgp 65001', 'peer 10.0.9.2 as-number 65002', 'network 10.0.1.0 mask 255.255.255.0'], assert: (m) => m.bgp?.asn === 65001 && m.bgp?.peers?.length === 1 },
    { cap: 'nat', cmds: ['interface ether1', 'nat outbound 3000', 'nat server protocol tcp global current-interface 8080 inside 192.168.1.10 80'], assert: (m) => m.natRules.some((r: any) => r.chain === 'srcnat') && m.natRules.some((r: any) => r.chain === 'dstnat' && r.toPorts === '80') },
    { cap: 'firewall', cmds: ['acl 3000', 'rule 5 deny icmp source 10.0.0.0 0.0.0.255', 'quit'], assert: (m) => m.acls.some((a: any) => a.aclId === '3000' && a.action === 'deny' && a.proto === 'icmp') },
    { cap: 'dns', cmds: ['dns server 8.8.8.8'], assert: (m) => (m.dnsServers || []).length >= 1 },
  ],
  ubiquiti: [
    { cap: 'ipv4', cmds: ['set interfaces ethernet ether1 address 10.0.1.1/30'], assert: (m) => ipStored(m, 'ether1', '10.0.1.1/30') },
    { cap: 'staticRoute', cmds: ['set protocols static route 10.99.0.0/24 next-hop 10.0.1.2'], assert: (m) => routeStored(m, '10.99.0.0/24', '10.0.1.2') },
    { cap: 'nat', cmds: ['set nat source rule 10 outbound-interface ether2', 'set nat source rule 10 source address 192.168.88.0/24', 'set nat source rule 10 translation address masquerade'], assert: (m) => m.natRules.some((r: any) => r.chain === 'srcnat') },
    { cap: 'commit', cmds: ['set system host-name uedge', 'commit'], assert: (m) => m.hostname === 'uedge' },
    { cap: 'vlan', cmds: ['set vlans V10 vlan-id 10'], assert: (m) => (m.vlans || []).length >= 1 },
    { cap: 'dhcp', cmds: ['set service dhcp-server shared-network-name LAN1 subnet 192.168.88.0/24 start 192.168.88.100 stop 192.168.88.200', 'set service dhcp-server shared-network-name LAN1 subnet 192.168.88.0/24 default-router 192.168.88.1'], assert: (m) => m.dhcpPools.some((p: any) => p.network === '192.168.88.0/24' && p.range === '192.168.88.100-192.168.88.200' && p.gateway === '192.168.88.1') },
    { cap: 'ospf', cmds: ['set protocols ospf area 0 interface eth0'], assert: (m) => m.routing?.ospf?.enabled },
    { cap: 'bgp', cmds: ['set protocols bgp 65001 parameters router-id 1.1.1.1', 'set protocols bgp 65001 neighbor 10.0.9.2 remote-as 65002', 'set protocols bgp 65001 network 10.0.1.0/24'], assert: (m) => m.bgp?.asn === 65001 && m.bgp?.peers?.length === 1 && (m.bgp?.networks?.length ?? 0) >= 1 },
    { cap: 'firewall', cmds: ['set firewall name FW1 rule 10 action drop', 'set firewall name FW1 rule 10 protocol icmp', 'set firewall name FW1 rule 10 source address 10.0.0.0/8'], assert: (m) => m.acls.some((a: any) => a.action === 'deny' && a.proto === 'icmp' && a.src === '10.0.0.0/8') },
    { cap: 'dns', cmds: ['set system name-server 8.8.8.8'], assert: (m) => (m.dnsServers || []).length >= 1 },
  ],
  vyos: [
    { cap: 'ipv4', cmds: ['set interfaces ethernet ether1 address 10.0.1.1/30'], assert: (m) => ipStored(m, 'ether1', '10.0.1.1/30') },
    { cap: 'staticRoute', cmds: ['set protocols static route 10.99.0.0/24 next-hop 10.0.1.2'], assert: (m) => routeStored(m, '10.99.0.0/24', '10.0.1.2') },
    { cap: 'nat', cmds: ['set nat source rule 10 outbound-interface ether2', 'set nat source rule 10 source address 192.168.88.0/24', 'set nat source rule 10 translation address masquerade'], assert: (m) => m.natRules.some((r: any) => r.chain === 'srcnat') },
    { cap: 'ospf', cmds: ['set protocols ospf area 0 network 10.0.0.0/24', 'set protocols ospf parameters router-id 1.1.1.1'], assert: (m) => m.routing?.ospf?.enabled },
    { cap: 'commit', cmds: ['set system host-name vedge', 'commit'], assert: (m) => m.hostname === 'vedge' },
    { cap: 'vlan', cmds: ['set vlans V10 vlan-id 10'], assert: (m) => (m.vlans || []).length >= 1 },
    { cap: 'dhcp', cmds: ['set service dhcp-server shared-network-name LAN1 subnet 192.168.88.0/24 start 192.168.88.100 stop 192.168.88.200', 'set service dhcp-server shared-network-name LAN1 subnet 192.168.88.0/24 default-router 192.168.88.1'], assert: (m) => m.dhcpPools.some((p: any) => p.network === '192.168.88.0/24' && p.range === '192.168.88.100-192.168.88.200' && p.gateway === '192.168.88.1') },
    { cap: 'bgp', cmds: ['set protocols bgp 65001 parameters router-id 1.1.1.1', 'set protocols bgp 65001 neighbor 10.0.9.2 remote-as 65002', 'set protocols bgp 65001 network 10.0.1.0/24'], assert: (m) => m.bgp?.asn === 65001 && m.bgp?.peers?.length === 1 && (m.bgp?.networks?.length ?? 0) >= 1 },
    { cap: 'firewall', cmds: ['set firewall name FW1 rule 10 action drop', 'set firewall name FW1 rule 10 protocol icmp', 'set firewall name FW1 rule 10 source address 10.0.0.0/8'], assert: (m) => m.acls.some((a: any) => a.action === 'deny' && a.proto === 'icmp' && a.src === '10.0.0.0/8') },
    { cap: 'dns', cmds: ['set system name-server 8.8.8.8'], assert: (m) => (m.dnsServers || []).length >= 1 },
  ],
  fortinet: [
    { cap: 'ipv4', cmds: ['config system interface', 'edit ether1', 'set ip 10.0.1.1 255.255.255.252', 'next', 'end'], assert: (m) => ipStored(m, 'ether1', '10.0.1.1/30') },
    { cap: 'staticRoute', cmds: ['config router static', 'edit 1', 'set dst 10.99.0.0 255.255.255.0', 'set gateway 10.0.1.2', 'next', 'end'], assert: (m) => routeStored(m, '10.99.0.0/24', '10.0.1.2') },
    { cap: 'nat', cmds: ['config firewall policy', 'edit 1', 'set action accept', 'set srcaddr all', 'set dstaddr all', 'set srcintf ether2', 'set dstintf ether1', 'set nat enable', 'next', 'end'], assert: (m) => m.natRules.some((r: any) => r.chain === 'srcnat') },
    { cap: 'ospf', cmds: ['config router ospf', 'set router-id 1.1.1.1', 'config network', 'edit 1', 'set prefix 10.0.0.0 255.255.255.0', 'next', 'end', 'end'], assert: (m) => m.routing?.ospf?.enabled },
    { cap: 'bgp', cmds: ['config router bgp', 'set as 65001', 'config neighbor', 'edit 10.0.9.2', 'set remote-as 65002', 'next', 'end', 'end'], assert: (m) => m.bgp?.asn === 65001 && m.bgp?.peers?.length === 1 },
    { cap: 'vlan', cmds: ['config system interface', 'edit ether1.10', 'set vlanid 10', 'set interface ether1', 'end'], assert: (m) => String(m.vlans?.[0]?.id) === '10' },
    { cap: 'dhcp', cmds: ['config system dhcp server', 'edit 1', 'set interface ether1', 'set netmask 255.255.255.0', 'config ip-range', 'edit 1', 'set start-ip 192.168.88.100', 'set end-ip 192.168.88.200', 'end', 'set default-gateway 192.168.88.1', 'end'], assert: (m) => m.dhcpPools.some((p: any) => p.iface === 'ether1' && p.range === '192.168.88.100-192.168.88.200' && p.gateway === '192.168.88.1') },
    { cap: 'firewall', cmds: ['config firewall policy', 'edit 2', 'set srcintf "ether1"', 'set dstintf "ether2"', 'set action deny', 'set srcaddr "all"', 'set dstaddr "all"', 'set service icmp', 'next', 'end'], assert: (m) => m.acls.some((a: any) => a.action === 'deny' && a.proto === 'icmp') },
    { cap: 'dns', cmds: ['config system dns', 'set primary 1.1.1.1', 'set secondary 8.8.8.8', 'end'], assert: (m) => (m.dnsServers || []).length === 2 },
  ],
  aruba: [
    { cap: 'ipv4', cmds: ['interface ether1', 'ip address 10.0.1.1 255.255.255.252'], assert: (m) => ipStored(m, 'ether1', '10.0.1.1/30') },
    { cap: 'staticRoute', cmds: ['ip route 10.99.0.0 255.255.255.0 10.0.1.2'], assert: (m) => routeStored(m, '10.99.0.0/24', '10.0.1.2') },
    { cap: 'vlan', cmds: ['vlan 10'], assert: (m) => (m.vlans || []).length >= 1 },
    { cap: 'ospf', cmds: ['router ospf 1', 'network 10.0.0.0 0.0.0.255 area 0'], assert: (m) => m.routing?.ospf?.enabled },
    { cap: 'dhcp', cmds: ['ip dhcp pool LAN1', 'network 192.168.88.0 255.255.255.0', 'default-router 192.168.88.1'], assert: (m) => m.dhcpPools.some((p: any) => p.gateway === '192.168.88.1') },
    { cap: 'dns', cmds: ['ip name-server 8.8.8.8'], assert: (m) => (m.dnsServers || []).length >= 1 },
  ],
  openwrt: [
    { cap: 'ipv4', cmds: ['uci set network.ether1.ipaddr=10.0.1.1', 'uci set network.ether1.netmask=255.255.255.252', 'uci set network.ether1.proto=static', 'uci commit network'], assert: (m) => ipStored(m, 'ether1', '10.0.1.1/30') },
    { cap: 'staticRoute', cmds: ['uci set network.route1=route', 'uci set network.route1.target=10.99.0.0', 'uci set network.route1.netmask=255.255.255.0', 'uci set network.route1.gateway=10.0.1.2', 'uci commit network'], assert: (m) => routeStored(m, '10.99.0.0/24', '10.0.1.2') },
    { cap: 'nat', cmds: ['uci set firewall.@zone[1].masq=1', 'uci commit firewall'], assert: (m) => m.natRules.some((r: any) => r.chain === 'srcnat' && r.action === 'masquerade') },
    { cap: 'commit', cmds: ['uci set system.@system[0].hostname=owrt', 'uci commit system'], assert: (m) => m.hostname === 'owrt' },
    { cap: 'vlan', cmds: ['uci set network.vlan10.vlan=10'], assert: (m) => (m.vlans || []).length >= 1 },
    { cap: 'dhcp', cmds: ['uci set dhcp.lan=dhcp', 'uci set dhcp.lan.interface=lan', 'uci set dhcp.lan.start=100', 'uci set dhcp.lan.limit=100', 'uci commit dhcp'], assert: (m) => m.dhcpPools.some((p: any) => p.name === 'lan' && p.range === '192.168.1.100-192.168.1.199') },
    { cap: 'firewall', cmds: ['uci add firewall redirect', 'uci set firewall.@redirect[0].dest_ip=192.168.1.10', 'uci set firewall.@redirect[0].dest_port=80', 'uci set firewall.@redirect[0].src_dport=8080', 'uci set firewall.@redirect[0].target=DNAT', 'uci commit firewall'], assert: (m) => m.natRules.some((r: any) => r.chain === 'dstnat' && r.toAddresses === '192.168.1.10' && r.dstPort === '8080') },
    { cap: 'dns', cmds: ['echo "nameserver 8.8.8.8" > /etc/resolv.conf'], assert: (m) => (m.dnsServers || []).length >= 1 },
  ],
  linux: [
    { cap: 'ipv4', cmds: ['ip addr add 10.0.1.1/30 dev ether1'], assert: (m) => ipStored(m, 'ether1', '10.0.1.1/30') },
    { cap: 'staticRoute', cmds: ['ip route add 10.99.0.0/24 via 10.0.1.2'], assert: (m) => routeStored(m, '10.99.0.0/24', '10.0.1.2') },
    { cap: 'nat', cmds: ['iptables -t nat -A POSTROUTING -o ether2 -j MASQUERADE'], assert: (m) => m.natRules.some((r: any) => r.chain === 'srcnat') },
    { cap: 'dhcp', cmds: ['echo "subnet 192.168.88.0 netmask 255.255.255.0 { range 192.168.88.100 192.168.88.200; option routers 192.168.88.1; }" > /etc/dhcp/dhcpd.conf'], assert: (m) => m.dhcpPools.some((p: any) => p.range === '192.168.88.100-192.168.88.200' && p.gateway === '192.168.88.1') },
    { cap: 'dns', cmds: ['echo "nameserver 8.8.8.8" > /etc/resolv.conf'], assert: (m) => (m.dnsServers || []).length >= 1 },
  ],
};

export function runVendorInteropTests(): Report {
  console.log('\n== V0. Registry kapabilitas vendor konsisten (supported = teruji) ==');
  for (const vid of VENDOR_IDS) {
    const reg = VENDOR_CAPABILITIES[vid];
    const feats = FEATURES[vid] || [];
    check(`V0 ${vid} ada di registry`, !!reg);
    if (!reg) continue;
    for (const cap of Object.keys(reg.caps) as CapabilityKey[]) {
      const status = reg.caps[cap];
      if (status !== 'supported') continue;
      const feat = feats.find((f) => f.cap === cap);
      if (!feat) {
        check(`V0 ${vid} ${cap} punya bukti test`, false, '(tidak ada feature case — turunkan status ke partial/parser-only)');
        continue;
      }
      const dis = new VendorDispatcher();
      const ctx = mkCtx(vid, vid, ['ether1', 'ether2']);
      const mem = dis.getNodeMemory(vid);
      feat.cmds.forEach((c) => dis.dispatch(vid, c, ctx));
      check(`V0 ${vid}.${cap} teruji`, feat.assert(mem), JSON.stringify(mem.configuredIps));
    }
  }

  console.log('\n== V1. Round-trip config export/import per vendor ==');
  for (const vid of VENDOR_IDS) {
    const feats = FEATURES[vid] || [];
    const cfgCmds = feats.flatMap((f) => f.cmds);
    if (cfgCmds.length === 0) continue;
    const disA = new VendorDispatcher();
    const ctxA = mkCtx(vid, vid, ['ether1', 'ether2']);
    const memA = disA.getNodeMemory(vid);
    cfgCmds.forEach((c) => disA.dispatch(vid, c, ctxA));
    const exported = disA.exportRunningConfig(vid, ctxA);
    check(`V1 ${vid} export non-empty`, exported.trim().length > 0, exported.slice(0, 120));
    if (exported.trim().length === 0) continue;
    // Re-import: baris export di-dispatch ulang ke memory bersih.
    const disB = new VendorDispatcher();
    const ctxB = mkCtx(vid, vid, ['ether1', 'ether2']);
    const memB = disB.getNodeMemory(vid);
    const errs: string[] = [];
    for (const line of exported.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#') || t.startsWith('!') || t.startsWith('//')) continue;
      const out = disB.dispatch(vid, t, ctxB);
      if (typeof out === 'string' && /error|unknown|incomplete|invalid/i.test(out) && !/^% Unknown command \.\.\.$/.test(out)) {
        errs.push(`${t} → ${out.slice(0, 60)}`);
      }
    }
    const eq = (a: any, b: any) => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
    // Beda bentuk penyimpanan (cidr vs "ip mask") wajar lintas export; bandingkan ternormalisasi.
    const normIps = (m: any) => Object.fromEntries(Object.entries(m.configuredIps || {}).map(([k, v]) => [k, cidrNorm(String(v))]));
    const ipsEq = eq(normIps(memA), normIps(memB));
    const routesEq = eq(
      (memA.routes || []).map((r: any) => `${cidrNorm(r.dst)}|${r.gateway}`).sort(),
      (memB.routes || []).map((r: any) => `${cidrNorm(r.dst)}|${r.gateway}`).sort()
    );
    const vlansEq = eq(
      (memA.vlans || []).map((v: any) => `${v.id}|${v.name}`).sort(),
      (memB.vlans || []).map((v: any) => `${v.id}|${v.name}`).sort()
    );
    check(`V1 ${vid} IP sama setelah round-trip`, ipsEq, `A=${JSON.stringify(memA.configuredIps)} B=${JSON.stringify(memB.configuredIps)}`);
    check(`V1 ${vid} routes sama`, routesEq, `A=${JSON.stringify(memA.routes)} B=${JSON.stringify(memB.routes)}`);
    check(`V1 ${vid} VLAN sama`, vlansEq, `A=${JSON.stringify(memA.vlans)} B=${JSON.stringify(memB.vlans)}`);
    // OSPF/BGP round-trip (untuk vendor yang meng-export protokol)
    const protoA = memA.routing?.ospf?.enabled ? 'ospf' : memA.bgp?.asn ? 'bgp' : null;
    const protoB = memB.routing?.ospf?.enabled ? 'ospf' : memB.bgp?.asn ? 'bgp' : null;
    if (protoA) check(`V1 ${vid} protokol ${protoA} survive`, protoA === protoB, JSON.stringify({ A: protoA, B: protoB }));
  }

  console.log('\n== V2. Interop L3 lintas vendor: static route + ping (semua pasangan) ==');
  const ROUTER_VENDORS = ['mikrotik', 'cisco_ios', 'cisco_nxos', 'juniper', 'huawei', 'fortinet', 'vyos', 'openwrt'];
  const ipCmd = {
    mikrotik: (i: string, ip: string) => [`/ip address add address=${ip} interface=${i}`],
    cisco_ios: (i: string, ip: string) => [`interface ${i}`, `ip address ${ip.replace('/', ' ')}`],
    cisco_nxos: (i: string, ip: string) => [`interface ${i}`, `ip address ${ip}`],
    juniper: (i: string, ip: string) => [`set interfaces ${i} unit 0 family inet address ${ip}`],
    huawei: (i: string, ip: string) => [`interface ${i}`, `ip address ${ip.replace('/', ' ')}`],
    fortinet: (i: string, ip: string) => ['config system interface', `edit ${i}`, `set ip ${ip.replace('/', ' ')}`, 'next', 'end'],
    vyos: (i: string, ip: string) => [`set interfaces ethernet ${i} address ${ip}`],
    openwrt: (i: string, ip: string) => [`uci set network.${i}.ipaddr=${ip.split('/')[0]}`, `uci set network.${i}.netmask=${ip.includes('/30') ? '255.255.255.252' : '255.255.255.0'}`, `uci set network.${i}.proto=static`, 'uci commit network'],
    linux: (i: string, ip: string) => [`ip addr add ${ip} dev ${i}`],
  } as Record<string, (i: string, ip: string) => string[]>;
  const routeCmd = {
    mikrotik: (dst: string, gw: string) => [`/ip route add dst-address=${dst} gateway=${gw}`],
    cisco_ios: (dst: string, gw: string) => [`ip route ${dst.split('/')[0]} ${cidrMask(dst)} ${gw}`],
    cisco_nxos: (dst: string, gw: string) => [`ip route ${dst} ${gw}`],
    juniper: (dst: string, gw: string) => [`set routing-options static route ${dst} next-hop ${gw}`],
    huawei: (dst: string, gw: string) => [`ip route-static ${dst.split('/')[0]} ${dst.split('/')[1]} ${gw}`],
    fortinet: (dst: string, gw: string) => ['config router static', 'edit 1', `set dst ${dst.split('/')[0]} ${cidrMask(dst)}`, `set gateway ${gw}`, 'next', 'end'],
    vyos: (dst: string, gw: string) => [`set protocols static route ${dst} next-hop ${gw}`],
    openwrt: (dst: string, gw: string) => ['uci set network.route1=route', `uci set network.route1.target=${dst.split('/')[0]}`, `uci set network.route1.netmask=${cidrMask(dst)}`, `uci set network.route1.gateway=${gw}`, 'uci commit network'],
    linux: (dst: string, gw: string) => [`ip route add ${dst} via ${gw}`],
  } as Record<string, (dst: string, gw: string) => string[]>;

  function cidrMask(cidr: string): string {
    const bits = parseInt(cidr.split('/')[1], 10);
    const mask = bits === 0 ? 0 : ~0 << (32 - bits);
    return [24, 16, 8, 0].map((s) => ((mask >>> s) & 255)).join('.');
  }

  for (let ai = 0; ai < ROUTER_VENDORS.length; ai++) {
    for (let bi = ai + 1; bi < ROUTER_VENDORS.length; bi++) {
      const va = ROUTER_VENDORS[ai];
      const vb = ROUTER_VENDORS[bi];
      const dis = new VendorDispatcher();
      const sim = new NetworkSimulator();
      const nodes = [
        { id: 'pc1', name: 'PC1', vendor: 'linux', deviceType: 'pc', ports: iPorts(1, '11') },
        { id: 'r1', name: `R1-${va}`, vendor: va, deviceType: 'router', ports: iPorts(2, '12') },
        { id: 'r2', name: `R2-${vb}`, vendor: vb, deviceType: 'router', ports: iPorts(2, '13') },
        { id: 'pc2', name: 'PC2', vendor: 'linux', deviceType: 'pc', ports: iPorts(1, '14') },
      ];
      const edges = [
        { id: 'e1', sourceNodeId: 'pc1', sourcePortId: 'ether1', targetNodeId: 'r1', targetPortId: 'ether1', cableType: 'copper_straight' },
        { id: 'e2', sourceNodeId: 'r1', sourcePortId: 'ether2', targetNodeId: 'r2', targetPortId: 'ether1', cableType: 'copper_straight' },
        { id: 'e3', sourceNodeId: 'r2', sourcePortId: 'ether2', targetNodeId: 'pc2', targetPortId: 'ether1', cableType: 'copper_straight' },
      ];
      sim.syncTopology({ nodes, edges } as LabProjectLike);
      const configure = (nodeId: string, vendor: string, ipCmds: string[], routeCmds: string[]) => {
        const ctx = { ...mkCtx(nodeId, nodeId, ['ether1', 'ether2']), pingSimulator: undefined };
        ipCmds.forEach((c) => dis.dispatch(vendor, c, ctx));
        routeCmds.forEach((c) => dis.dispatch(vendor, c, ctx));
      };
      // PC1 (linux)
      configure('pc1', 'linux', ipCmd.linux('ether1', '10.0.0.1/24'), routeCmd.linux('0.0.0.0/0', '10.0.0.2'));
      configure('r1', va, ipCmd[va]('ether1', '10.0.0.2/24').concat(ipCmd[va]('ether2', '10.0.1.1/30')), routeCmd[va]('10.0.2.0/24', '10.0.1.2'));
      configure('r2', vb, ipCmd[vb]('ether1', '10.0.1.2/30').concat(ipCmd[vb]('ether2', '10.0.2.2/24')), routeCmd[vb]('10.0.0.0/24', '10.0.1.1'));
      configure('pc2', 'linux', ipCmd.linux('ether1', '10.0.2.3/24'), routeCmd.linux('0.0.0.0/0', '10.0.2.2'));
      for (const n of nodes) syncCli(dis, sim, n.id);
      const ping = sim.simulatePing('pc1', '10.0.2.3');
      check(`V2 ${va.padEnd(9)} ↔ ${vb.padEnd(9)} ping PC1→PC2`, ping.success, JSON.stringify(ping).slice(0, 200));
    }
  }

  console.log('\n== V3. DHCP lintas vendor (server router → klien Linux) ==');
  const DHCP_SERVERS = ['mikrotik', 'cisco_ios', 'juniper', 'huawei', 'fortinet'];
  const poolCmds: Record<string, string[]> = {
    mikrotik: ['/ip address add address=192.168.9.1/24 interface=ether1', '/ip pool add name=pool1 ranges=192.168.9.100-192.168.9.200', '/ip dhcp-server add name=dhcp1 interface=ether1 address-pool=pool1'],
    cisco_ios: ['interface ether1', 'ip address 192.168.9.1 255.255.255.0', 'no shutdown', 'exit', 'ip dhcp pool LAN', 'network 192.168.9.0 255.255.255.0', 'default-router 192.168.9.1'],
    juniper: ['set interfaces ether1 unit 0 family inet address 192.168.9.1/24', 'set access address-assignment pool jpool family inet network 192.168.9.0/24', 'set access address-assignment pool jpool family inet range jr1 low 192.168.9.100 high 192.168.9.200', 'set access address-assignment pool jpool family inet dhcp-attributes router 192.168.9.1', 'set system services dhcp-local-server group jdhcp pool jpool', 'set system services dhcp-local-server group jdhcp interface ether1'],
    huawei: ['dhcp enable', 'ip pool LAN1', 'network 192.168.9.0 mask 255.255.255.0', 'gateway-list 192.168.9.1', 'quit', 'interface ether1', 'ip address 192.168.9.1 255.255.255.0', 'dhcp select global'],
    fortinet: ['config system interface', 'edit ether1', 'set ip 192.168.9.1 255.255.255.0', 'next', 'end', 'config system dhcp server', 'edit 1', 'set interface ether1', 'config ip-range', 'edit 1', 'set start-ip 192.168.9.100', 'set end-ip 192.168.9.200', 'next', 'end', 'set netmask 255.255.255.0', 'next', 'end'],
  };
  const syncPools = (dis: VendorDispatcher, sim: NetworkSimulator) => {
    const poolsByNode: Record<string, any[]> = {};
    for (const [nodeId, m] of Object.entries(dis.serializeMemory())) {
      if (m && Array.isArray(m.dhcpPools) && m.dhcpPools.length > 0) poolsByNode[nodeId] = m.dhcpPools;
    }
    sim.setDhcpPools(poolsByNode);
  };
  for (const sv of DHCP_SERVERS) {
    const dis = new VendorDispatcher();
    const sim = new NetworkSimulator();
    const nodes = [
      { id: 'pc1', name: 'PC1', vendor: 'linux', deviceType: 'pc', ports: iPorts(1, '21') },
      { id: 'r1', name: `R1-${sv}`, vendor: sv, deviceType: 'router', ports: iPorts(1, '22') },
    ];
    const edges = [{ id: 'e1', sourceNodeId: 'pc1', sourcePortId: 'ether1', targetNodeId: 'r1', targetPortId: 'ether1', cableType: 'copper_straight' }];
    sim.syncTopology({ nodes, edges } as LabProjectLike);
    const ctx = { ...mkCtx('r1', 'r1', ['ether1']), dhcpClientGrant: undefined, pingSimulator: undefined } as any;
    poolCmds[sv].forEach((c) => dis.dispatch(sv, c, ctx));
    syncCli(dis, sim, 'r1');
    syncPools(dis, sim);
    // Klien: linux dhclient memohon lease lewat engine (alur App).
    const pcCtx = {
      nodeId: 'pc1',
      name: 'PC1',
      ports: [{ id: 'ether1', name: 'ether1', status: 'up' }],
      dhcpClientGrant: (iface: string) => {
        const granted = sim.grantDhcpLease('pc1', iface);
        return granted ? { ip: granted.ip, gateway: granted.gateway, prefix: granted.prefix, poolNodeId: granted.poolNodeId } : null;
      },
      pingSimulator: undefined,
    } as any;
    const out = dis.dispatch('linux', 'dhclient ether1', pcCtx);
    const lease = sim.getLeaseFor('pc1');
    check(`V3 ${sv.padEnd(9)} lease DHCP ter-grant`, !!lease && lease.ip.startsWith('192.168.9.'), JSON.stringify(lease));
    check(`V3 ${sv.padEnd(9)} dhclient output ada`, typeof out === 'string' && out.length > 0, String(out).slice(0, 80));
    if (lease) {
      const ping = sim.simulatePing('pc1', '192.168.9.1');
      check(`V3 ${sv.padEnd(9)} PC1 ping gateway via DHCP`, ping.success, JSON.stringify(ping).slice(0, 150));
    }
  }

  console.log('\n== V4. Fitur tidak didukung gagal JUJUR (no fake success) ==');
  const UNSUPPORTED: Record<string, { cap: CapabilityKey; cmds: string[] }> = {
    aruba: { cap: 'nat', cmds: ['ip nat inside', 'ip nat outside'] },
    openwrt: { cap: 'bgp', cmds: ['router bgp 65001', '/routing bgp peer add name=x remote-address=1.1.1.1 remote-as=2'] },
    linux: { cap: 'ospf', cmds: ['router ospf 1', '/routing ospf instance set default'] },
  };
  for (const [vid, u] of Object.entries(UNSUPPORTED)) {
    const reg = VENDOR_CAPABILITIES[vid];
    const st = reg?.caps[u.cap] ?? null;
    // Registry harus jujur: bukan 'supported'.
    check(`V4 ${vid}.${u.cap} registry tidak mengklaim supported`, st !== 'supported', `status=${st}`);
    const dis = new VendorDispatcher();
    const ctx = mkCtx(vid, vid, ['ether1', 'ether2']);
    const memA = dis.getNodeMemory(vid);
    const before = JSON.stringify(memA);
    for (const c of u.cmds) {
      const out = dis.dispatch(vid, c, ctx);
      const outStr = typeof out === 'string' ? out : JSON.stringify(out ?? '');
      const honest = /unknown command|not supported|belum|tidak didukung|unrecognized|not currently simulated|not simulated/i.test(outStr);
      check(`V4 ${vid} '${c.slice(0, 40)}' gagal jujur`, honest, outStr.slice(0, 80));
    }
    // State tidak boleh berubah karena perintah tak didukung (tidak ada sukses palsu).
    const after = JSON.stringify(memA);
    check(`V4 ${vid}.${u.cap} state tidak berubah`, before === after, 'state berubah walau fitur tak didukung');
  }

  console.log('\n== V5. Matriks validasi vendor: SEMUA klaim kapabilitas punya bukti ==');
  // Untuk setiap vendor × kapabilitas, pastikan status di registry konsisten
  // dengan kategori yang sama di tabel matriks (tidak ada kontradiksi), dan
  // kapabilitas 'not-supported'/'parser-only' tidak pernah punya feature case
  // yang mengklaim berfungsi (no fake success di arah lain).
  for (const vid of VENDOR_IDS) {
    const reg = VENDOR_CAPABILITIES[vid];
    const feats = FEATURES[vid] || [];
    if (!reg) continue;
    for (const cap of Object.keys(reg.caps) as CapabilityKey[]) {
      const st = reg.caps[cap];
      const hasFeat = feats.some((f) => f.cap === cap);
      if (st === 'not-supported' || st === 'parser-only') {
        check(`V5 ${vid}.${cap} (${st}) tidak punya feature case`, !hasFeat, 'feature case ada padahal status bukan supported');
      }
      if (st === 'supported') {
        // Sudah diverifikasi V0 — pastikan notes/registry punya entri vendor.
        check(`V5 ${vid} ada di daftar vendor UI`, VENDOR_ORDER.includes(vid), 'vendor tidak ada di matriks');
      }
    }
  }
  // Kelengkapan matriks: semua vendor yang terdaftar harus punya SEMUA kolom kapabilitas.
  for (const vid of VENDOR_IDS) {
    const reg = VENDOR_CAPABILITIES[vid];
    const keys = reg ? (Object.keys(reg.caps) as CapabilityKey[]) : [];
    const missing = CAP_ORDER.filter((c) => !keys.includes(c));
    check(`V5 ${vid} semua kolom matriks terisi`, missing.length === 0, `kurang: ${missing.join(',')}`);
    const validStatus = keys.every((k) => ['supported', 'partial', 'parser-only', 'not-supported'].includes(reg.caps[k]));
    check(`V5 ${vid} status valid`, validStatus, JSON.stringify(reg?.caps));
  }

  console.log('\n== V6. State versioning .mlab (schemaVersion, migrasi, kompatibilitas) ==');
  const rawLab = {
    version: SCHEMA_VERSION,
    metadata: { name: 'Legacy', author: 't', description: '', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
    nodes: [
      { id: 'n1', name: 'R1', vendor: 'mikrotik', model: 'RB3011UiAS-RM', deviceType: 'router', position: { x: 0, y: 0 }, ports: [{ id: 'ether1', name: 'ether1', speedMbps: 1000, status: 'up', macAddress: '02:00:00:00:00:01' }] },
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  // 1. Envelope baru (schemaVersion numerik) → project terbaca.
  const envNew = unwrapProjectFile({ format: 'netlab-mlab', schemaVersion: 1, engineVersion: ENGINE_VERSION, metadata: {}, project: rawLab, deviceConfigs: { n1: { hostname: 'R1' } } });
  check('V6 envelope baru terbaca', !!envNew.project && envNew.schemaVersion === 1 && !!envNew.deviceConfigs, JSON.stringify(envNew).slice(0, 120));
  // 2. Envelope lama (version string "1.0") → tetap terbaca (migrasi).
  const envOld = unwrapProjectFile({ format: 'netlab-mlab', version: '1.0', project: rawLab });
  check('V6 envelope lama terbaca', !!envOld.project && envOld.schemaVersion === 1, JSON.stringify(envOld).slice(0, 120));
  // 3. Raw LabProject (tanpa wrapper) → tetap terbaca.
  const raw = unwrapProjectFile(rawLab);
  check('V6 raw LabProject terbaca', !!raw.project && raw.schemaVersion === undefined, JSON.stringify(raw).slice(0, 120));
  // 4. Migrasi { devices, links, configuration } → nodes/edges.
  const migrated = unwrapProjectFile({ schemaVersion: 1, devices: rawLab.nodes, links: rawLab.edges, configuration: { n1: { hostname: 'R1' } } });
  check('V6 {devices,links,configuration} termigrasi', Array.isArray(migrated.project?.nodes) && Array.isArray(migrated.project?.edges) && !!migrated.deviceConfigs, JSON.stringify(migrated).slice(0, 150));
  // 5. Proyek hasil migrasi lolos validasi penuh.
  const resMigrated = validateProject(migrated.project);
  check('V6 proyek migrasi lolos validasi', 'ok' in resMigrated && resMigrated.ok, 'error' in resMigrated ? `${resMigrated.error.code} ${resMigrated.error.message}` : '');
  // 6. Versi project lama (v1.0 legacy tanpa schema) tetap valid.
  const resLegacy = validateProject(rawLab);
  check('V6 proyek legacy lolos validasi', 'ok' in resLegacy && resLegacy.ok, 'error' in resLegacy ? `${resLegacy.error.code}` : '');
  // 7. Schema version lebih baru dari dukungan ditolak dengan pesan jujur.
  const resFuture = validateProject({ ...rawLab, version: '99.0' });
  check('V6 versi masa depan ditolak', 'error' in resFuture && resFuture.error.code === 'UNSUPPORTED_SCHEMA_VERSION', 'error' in resFuture ? resFuture.error.code : 'no error');

  console.log('\n== V7. Perintah show/print mencerminkan state sungguhan ==');
  // Ping/traceroute mengikuti hasil engine, bukan teks hard-coded.
  for (const [vid, ipLine] of [
    ['mikrotik', '/ip address add address=192.168.50.1/24 interface=ether1'],
    ['cisco_ios', 'interface ether1'],
    ['juniper', 'set interfaces ether1 unit 0 family inet address 192.168.50.1/24'],
  ] as [string, string][]) {
    const dis = new VendorDispatcher();
    const sim = new NetworkSimulator();
    const nodes = [
      { id: 'pc1', name: 'PC1', vendor: 'linux', deviceType: 'pc', ports: iPorts(1, '31') },
      { id: 'r1', name: 'R1', vendor: vid, deviceType: 'router', ports: iPorts(1, '32') },
    ];
    sim.syncTopology({ nodes, edges: [{ id: 'e1', sourceNodeId: 'pc1', sourcePortId: 'ether1', targetNodeId: 'r1', targetPortId: 'ether1', cableType: 'copper_straight' }] } as LabProjectLike);
    const ctx = { ...mkCtx(vid, vid, ['ether1']), pingSimulator: undefined, tracerouteSimulator: undefined } as any;
    if (vid === 'cisco_ios') {
      dis.dispatch(vid, ipLine, ctx);
      dis.dispatch(vid, 'ip address 192.168.50.1 255.255.255.0', ctx);
      dis.dispatch(vid, 'no shutdown', ctx);
    } else {
      dis.dispatch(vid, ipLine, ctx);
    }
    // Ping TANPA simulator → harus jujur tidak tersedia, bukan sukses palsu.
    const out = String(dis.dispatch(vid, vid === 'mikrotik' ? '/tool ping 192.168.50.2' : 'ping 192.168.50.2', ctx));
    const honestPing = /simulator|not available|tidak tersedia|not configured/i.test(out) || out.trim() === '';
    check(`V7 ${vid} ping tanpa engine tidak sukses palsu`, honestPing, out.slice(0, 80));
    // Print IP mencerminkan state yang baru dikonfigurasi.
    const ipOut = String(dis.dispatch(vid, vid === 'mikrotik' ? '/ip address print' : vid === 'juniper' ? 'show configuration interfaces' : 'show ip interface brief', ctx));
    check(`V7 ${vid} print IP dari state`, ipOut.includes('192.168.50.1'), ipOut.slice(0, 100));
  }

  // BGP peer print harus mencerminkan state engine, bukan Established palsu.
  for (const [vid, cmds, printCmd, stateProvider] of [
    ['mikrotik', ['/routing bgp instance add as=65001 router-id=1.1.1.1', '/routing bgp peer add remote-as=65002 remote-address=10.0.9.2'], '/routing bgp peer print', null],
    ['huawei', ['bgp 65001', 'peer 10.0.9.2 as-number 65002'], 'display bgp peer', null],
  ] as [string, string[], string, null][]) {
    for (const [label, st, wantE] of [
      ['Idle (tidak established)', 'Idle', false],
      ['Established (engine reachable)', 'Established', true],
    ] as [string, string, boolean][]) {
      const dis = new VendorDispatcher();
      const ctx = { ...mkCtx(vid, vid, ['ether1']), bgpNeighborProvider: () => [{ remoteAddr: '10.0.9.2', state: st, prefixes: 0, uptime: 'never' }] } as any;
      for (const c of cmds) dis.dispatch(vid, c, ctx);
      const out = String(dis.dispatch(vid, printCmd, ctx));
      check(`V7 ${vid} bgp print ${label}`, wantE ? /Established| E /.test(out) : /Idle| X /.test(out) && !/Established/.test(out), out.slice(0, 120));
      const estCount = (out.match(/established state : (\d+)/) || [])[1];
      check(`V7 ${vid} bgp established count ${label}`, estCount === undefined || estCount === String(wantE ? 1 : 0), out.slice(0, 120));
    }
  }

  // Cisco OSPF neighbor: state Down dari engine → Down, bukan FULL palsu.
  {
    const dis = new VendorDispatcher();
    const ctx = { ...mkCtx('r1', 'r1', ['ether1']), ospfNeighborProvider: () => [{ routerId: '2.2.2.2', ip: '192.168.10.2', iface: 'ether1', state: 'Down' }] } as any;
    dis.dispatch('cisco_ios', 'router ospf 1', ctx);
    const down = String(dis.dispatch('cisco_ios', 'show ip ospf neighbor', ctx));
    check('V7 cisco ospf neighbor Down dari engine', /Down/.test(down) && !/FULL/.test(down), down.slice(0, 120));
    const ctxFull = { ...mkCtx('r1', 'r1', ['ether1']), ospfNeighborProvider: () => [{ routerId: '2.2.2.2', ip: '192.168.10.2', iface: 'ether1', state: 'Full' }] } as any;
    const disFull = new VendorDispatcher();
    disFull.dispatch('cisco_ios', 'router ospf 1', ctxFull);
    const full = String(disFull.dispatch('cisco_ios', 'show ip ospf neighbor', ctxFull));
    check('V7 cisco ospf neighbor Full dari engine', /FULL/.test(full), full.slice(0, 120));
  }

  console.log('\n== V8. Validasi jaringan: network/broadcast, gateway, overlap, /31 /32 ==');
  // Network & broadcast ditolak sebagai host; /31 & /32 dikecualikan (p2p/host route).
  check('V8 network address reserved', isReservedAddress('192.168.1.0', 24) === true, '');
  check('V8 broadcast address reserved', isReservedAddress('192.168.1.255', 24) === true, '');
  check('V8 host normal bukan reserved', isReservedAddress('192.168.1.1', 24) === false, '');
  check('V8 /31 tidak dianggap reserved (p2p)', isReservedAddress('10.0.0.0', 31) === false, '');
  check('V8 /32 tidak dianggap reserved (host route)', isReservedAddress('10.0.0.5', 32) === false, '');
  check('V8 validateHostIp tolak broadcast', (validateHostIp('192.168.2.255', 24) ?? '').includes('network/broadcast'), '');
  check('V8 validateHostIp terima host', validateHostIp('192.168.2.10', 24) === null, '');
  // Gateway di luar subnet → error; di dalam subnet → ok.
  check('V8 gateway luar subnet ditolak', (validateGatewayInSubnet('10.0.0.1', '192.168.1.1/24') ?? '').includes('luar subnet'), '');
  check('V8 gateway dalam subnet diterima', validateGatewayInSubnet('192.168.1.254', '192.168.1.1/24') === null, '');
  // Overlap subnet: /24 vs /16 yang memuatnya.
  check('V8 subnet overlap terdeteksi', (findSubnetOverlap('192.168.1.0/24', ['192.168.0.0/16']) ?? '').includes('tumpang tindih'), '');
  check('V8 subnet duplikat terdeteksi', (findSubnetOverlap('10.1.0.0/16', ['10.1.0.0/16']) ?? '').includes('duplikat'), '');
  check('V8 subnet tidak overlap ok', findSubnetOverlap('10.1.0.0/16', ['192.168.0.0/16']) === null, '');

  console.log(`VENDOR INTEROP: ${rep.passed} passed, ${rep.failed} failed`);
  return rep;
}
