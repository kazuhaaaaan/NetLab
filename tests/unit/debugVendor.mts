import { VendorDispatcher } from '../../packages/vendors/src/index';

const dis = new VendorDispatcher();
const ctx = { nodeId: 'n1', name: 'N1', ports: [{ id: 'ether1', name: 'ether1', status: 'up' }, { id: 'ether2', name: 'ether2', status: 'up' }] };

const mem = dis.getNodeMemory('n1');

// cisco_ios
dis.dispatch('cisco_ios', 'interface ether1', ctx);
const o1 = dis.dispatch('cisco_ios', 'ip address 10.0.1.1 255.255.255.252', ctx);
dis.dispatch('cisco_ios', 'exit', ctx);
dis.dispatch('cisco_ios', 'ip route 10.99.0.0 255.255.255.0 10.0.1.2', ctx);
console.log('cisco ips:', JSON.stringify(mem.configuredIps), 'routes:', JSON.stringify(mem.routes));

// openwrt
const mem2 = dis.getNodeMemory('n2');
const ctx2 = { ...ctx, nodeId: 'n2' };
dis.dispatch('openwrt', 'uci set network.ether1.ipaddr=10.0.1.1', ctx2);
dis.dispatch('openwrt', 'uci set network.ether1.netmask=255.255.255.252', ctx2);
dis.dispatch('openwrt', 'uci set network.ether1.proto=static', ctx2);
console.log('openwrt no-commit ips:', JSON.stringify(mem2.configuredIps), 'pending:', JSON.stringify(mem2.uciPending));
dis.dispatch('openwrt', 'uci commit network', ctx2);
console.log('openwrt after commit ips:', JSON.stringify(mem2.configuredIps));

// cisco_nxos
const mem3 = dis.getNodeMemory('n3');
const ctx3 = { ...ctx, nodeId: 'n3' };
dis.dispatch('cisco_nxos', 'interface ether1', ctx3);
dis.dispatch('cisco_nxos', 'ip address 10.0.1.1/30', ctx3);
console.log('nxos ips:', JSON.stringify(mem3.configuredIps), 'routes:', JSON.stringify(mem3.routes));
dis.dispatch('cisco_nxos', 'ip route 10.99.0.0/24 10.0.1.2', ctx3);
console.log('nxos routes after:', JSON.stringify(mem3.routes));
