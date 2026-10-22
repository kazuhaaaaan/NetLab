// GENERATED — branch handler vendor ubiquiti (diekstraksi dari dispatch() lama).
import type { CommandResult, ChainEntry, ChainEnv } from '../common/types';
import { registerEntries } from '../common/chain';



export const ubiquitiEntries: ChainEntry[] = [
  {
    name: 'b-vrrp-ubnt',
    order: 165,
    vendors: 'all',
    cap: 'vrrp',
    match: ({ rawInput, vendorId }) => ((vendorId === 'ubiquiti' || vendorId === 'vyos') && /vrrp\s+vrrp-group/i.test(rawInput)),
    run: ({ rawInput, vendorId, mem }) => {
      let cmdResult: CommandResult | undefined;
      const mGrp = rawInput.match(/vrrp-group\s+(\d+)/i);
      const mVip = rawInput.match(/virtual-address\s+(\S+)/i);
      const mPri = rawInput.match(/priority\s+(\d+)/i);
      const mIface = rawInput.match(/interfaces\s+ethernet\s+(\S+)/i) || rawInput.match(/interface\s+(\S+)/i);
      const iface = mIface ? (mIface[1].startsWith('ether') ? mIface[1] : mIface[1]) : mem.currentIface;
      if (mGrp && iface) {
        const vrid = parseInt(mGrp[1], 10);
        let g = mem.fhrpGroups.find((x) => x.vrid === vrid && x.interface === iface);
        if (!g) {
          g = { virtualAddress: '0.0.0.0/24', interface: iface, vrid, priority: 100 };
          mem.fhrpGroups.push(g);
        }
        if (mVip) g.virtualAddress = mVip[1].includes('/') ? mVip[1] : `${mVip[1]}/24`;
        if (mPri) g.priority = parseInt(mPri[1], 10);
        cmdResult = { raw: '' };
      }
      return cmdResult;
    },
  },
];

registerEntries('ubiquiti', ubiquitiEntries);


