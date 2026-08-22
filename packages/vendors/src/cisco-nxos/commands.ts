// GENERATED — branch handler vendor cisco-nxos (diekstraksi dari dispatch() lama).
import type { CommandResult, ChainEntry, ChainEnv } from '../common/types';
import { registerEntries } from '../common/chain';
import { isValidIpv4RouteDst, isValidRouteGateway } from '../common/ip';



export const cisconxosEntries: ChainEntry[] = [
  {
    name: 'b49',
    order: 49,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem, context, normalized, payload }) => (vendorId === 'cisco_nxos' && /^ip\s+route\s+\S+\s+\S+$/i.test(rawInput.trim())),
    run: ({ rawInput, vendorId, mem, context, normalized, nodeId, payload, registry }) => {
    let cmdResult: CommandResult | undefined;

    // NX-OS: "ip route 10.0.0.0/8 10.0.1.2" (CIDR form, dua token)
          const m = rawInput.trim().match(/^ip\s+route\s+(\S+)\s+(\S+)$/i);
          if (m) {
            if (!isValidIpv4RouteDst(String(m[1]))) {
              cmdResult = { raw: `% Invalid input detected at '^' marker.\n% Error: invalid route destination "${String(m[1])}"` };
            } else if (!isValidRouteGateway(String(m[2]))) {
              cmdResult = { raw: `% Invalid input detected at '^' marker.\n% Error: invalid next-hop "${String(m[2])}"` };
            } else {
              mem.routes.push({ dst: m[1], gateway: m[2], distance: 1 });
              cmdResult = { raw: '' };
            }
          } else {
            cmdResult = { raw: '% Usage: ip route <destination>/<mask> <next-hop>' };
          }
        
    return cmdResult;
  },
  },
];

registerEntries('cisco_nxos', cisconxosEntries);


