// Chain commands vendor aruba (AOS-CX) — sintaks autentik AOS-CX.
//
// VRRP di AOS-CX memakai blok bertingkat di bawah interface view:
//   interface 1/1/1
//      ip vrrp <1-255>
//         address-family ipv4
//            virtual-ip <ip> [primary]
//         enable
// BGP di AOS-CX mengiklankan prefix dengan bentuk CIDR:
//   router bgp <asn>
//      neighbor <ip> remote-as <asn>
//      network <prefix/cidr>
import type { CommandResult, ChainEntry } from '../common/types';
import { registerEntries } from '../common/chain';
import { isValidIpv4 } from '../common/ip';

const ARUBA = 'aruba';

export const arubaEntries: ChainEntry[] = [
  {
    // "ip vrrp <1-255>" — buat/masuk grup VRRP pada interface aktif (AOS-CX).
    name: 'a-vrrp-enter',
    order: 36,
    vendors: 'all',
    cap: 'vrrp',
    match: ({ rawInput, vendorId, mem }) =>
      vendorId === ARUBA &&
      /^ip\s+vrrp\s+\d+$/i.test(rawInput.trim()) &&
      !!mem.currentIface,
    run: ({ rawInput, mem }) => {
      const m = rawInput.trim().match(/^ip\s+vrrp\s+(\d+)$/i);
      const vrid = parseInt(m![1], 10);
      if (!(vrid >= 1 && vrid <= 255)) {
        return { raw: '% Invalid VRRP identifier (valid range 1-255).' } as CommandResult;
      }
      let g = (mem.fhrpGroups as Array<Record<string, unknown>>).find(
        (x) => x.vrid === vrid && x.interface === mem.currentIface,
      );
      if (!g) {
        g = { interface: mem.currentIface, vrid, priority: 100, virtualAddress: '', enabled: false };
        mem.fhrpGroups.push(g);
      }
      mem.currentVrrp = vrid;
      return { raw: '' };
    },
  },
  {
    // "address-family ipv4" di dalam konteks VRRP (wajib sebelum virtual-ip).
    name: 'a-vrrp-af',
    order: 36,
    vendors: 'all',
    cap: 'vrrp',
    match: ({ rawInput, vendorId, mem }) =>
      vendorId === ARUBA &&
      mem.currentVrrp !== undefined &&
      /^address-family\s+ipv4$/i.test(rawInput.trim()),
    run: () => ({ raw: '' }),
  },
  {
    // "virtual-ip <ip> [primary]" — alamat virtual grup (strict IPv4).
    name: 'a-vrrp-vip',
    order: 36,
    vendors: 'all',
    cap: 'vrrp',
    match: ({ rawInput, vendorId, mem }) =>
      vendorId === ARUBA &&
      mem.currentVrrp !== undefined &&
      /^virtual-ip\s+\S+(\s+primary)?$/i.test(rawInput.trim()),
    run: ({ rawInput, mem }) => {
      const m = rawInput.trim().match(/^virtual-ip\s+(\S+)(\s+primary)?$/i);
      const ip = m![1];
      if (!isValidIpv4(ip)) {
        return { raw: `% Invalid IP address: ${ip}` } as CommandResult;
      }
      const g = (mem.fhrpGroups as Array<Record<string, unknown>>).find((x) => x.vrid === mem.currentVrrp && x.interface === mem.currentIface);
      if (!g) return { raw: '% No VRRP context.' } as CommandResult;
      g.virtualAddress = `${ip}/24`;
      return { raw: '' };
    },
  },
  {
    // "enable" — aktifkan grup VRRP aktif (konteks VRRP saja).
    name: 'a-vrrp-enable',
    order: 36,
    vendors: 'all',
    cap: 'vrrp',
    match: ({ rawInput, vendorId, mem }) =>
      vendorId === ARUBA &&
      mem.currentVrrp !== undefined &&
      /^enable$/i.test(rawInput.trim()),
    run: ({ mem }) => {
      const g = (mem.fhrpGroups as Array<Record<string, unknown>>).find((x) => x.vrid === mem.currentVrrp && x.interface === mem.currentIface);
      if (!g) return { raw: '% No VRRP context.' } as CommandResult;
      g.enabled = true;
      return { raw: '' };
    },
  },
  {
    // "priority" dalam konteks VRRP: "priority <1-254>" (AOS-CX).
    name: 'a-vrrp-prio',
    order: 36,
    vendors: 'all',
    cap: 'vrrp',
    match: ({ rawInput, vendorId, mem }) =>
      vendorId === ARUBA &&
      mem.currentVrrp !== undefined &&
      /^priority\s+\d+$/i.test(rawInput.trim()),
    run: ({ rawInput, mem }) => {
      const prio = parseInt(rawInput.trim().match(/^priority\s+(\d+)$/i)![1], 10);
      if (!(prio >= 1 && prio <= 254)) {
        return { raw: '% Invalid priority (valid range 1-254).' } as CommandResult;
      }
      const g = (mem.fhrpGroups as Array<Record<string, unknown>>).find((x) => x.vrid === mem.currentVrrp && x.interface === mem.currentIface);
      if (!g) return { raw: '% No VRRP context.' } as CommandResult;
      g.priority = prio;
      return { raw: '' };
    },
  },
  {
    // "exit"/"end" saat berada di konteks VRRP: exit = naik satu level ke
    // interface view; end = keluar total. Berjalan sebelum handler exit/end
    // generik (b113) khusus untuk konteks VRRP.
    name: 'a-vrrp-exit',
    order: 112,
    vendors: 'all',
    match: ({ rawInput, vendorId, mem }) =>
      vendorId === ARUBA &&
      mem.currentVrrp !== undefined &&
      /^(?:exit|end)\b/i.test(rawInput.trim()),
    run: ({ rawInput, mem }) => {
      delete mem.currentVrrp;
      if (/^end\b/i.test(rawInput.trim())) {
        mem.currentProto = '';
        mem.currentDhcpSection = '';
        mem.currentAclId = '';
        mem.currentVlan = '';
      }
      return { raw: '' };
    },
  },
  {
    // "network <prefix/cidr>" di mode router bgp (bentuk CIDR AOS-CX).
    name: 'a-bgp-network-cidr',
    order: 855,
    vendors: 'all',
    cap: 'bgp',
    match: ({ rawInput, vendorId, mem }) =>
      vendorId === ARUBA &&
      mem.currentProto === 'bgp' &&
      /^network\s+\d+\.\d+\.\d+\.\d+\/\d{1,2}$/i.test(rawInput.trim()),
    run: ({ rawInput, mem }) => {
      const m = rawInput.trim().match(/^network\s+(\d+\.\d+\.\d+\.\d+)\/(\d{1,2})$/i);
      const ip = m![1];
      const bits = parseInt(m![2], 10);
      if (!isValidIpv4(ip) || bits > 32) {
        return { raw: '% Invalid input detected at \'^\' marker.' } as CommandResult;
      }
      mem.bgp.networks = mem.bgp.networks || [];
      const entry = `${ip}/${bits}`;
      if (!mem.bgp.networks.includes(entry)) mem.bgp.networks.push(entry);
      return { raw: '' };
    },
  },
];

registerEntries('aruba', arubaEntries);
