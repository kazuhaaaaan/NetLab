# Usage Examples for @mikrolab/vendors

```typescript
import { VendorDispatcher } from './packages/vendors/src';

const dis = new VendorDispatcher();

// Dispatch CLI command — mutasi state per node.
dis.dispatch('mikrotik', '/ip address add address=192.168.1.1/24 interface=ether1', ctx);
dis.dispatch('cisco_ios', 'ip route 10.99.0.0 255.255.255.0 10.0.1.2', ctx);

// Baca state.
const mem = dis.getNodeMemory('r1');
console.log(mem.configuredIps, mem.routes);

// Serialisasi penuh (NodeMemory utuh per node).
const all = dis.serializeMemory(); // Record<string, NodeMemory>

// Sync ke engine — SATU-SATUNYA jalur resmi (dari root app).
import { syncNodeToEngine, syncDhcpPools } from './src/utils/cliSync';
syncNodeToEngine(sim, dis, 'r1');
syncDhcpPools(sim, dis);
```

`ctx` = `VendorContext`: `{ nodeId, name, ports, portLinks?, pingSimulator?, tracerouteSimulator?, connectivitySimulator? }`.