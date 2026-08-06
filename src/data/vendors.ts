import { VendorInfo, VendorType } from '../types';

export const VENDOR_MAP: Record<VendorType, VendorInfo> = {
  mikrotik: {
    id: 'mikrotik',
    name: 'MikroTik',
    osName: 'RouterOS v7',
    defaultPrompt: '[admin@MikroTik] > ',
    badgeColor: 'bg-red-600 border-red-500 text-white',
    description: 'High-performance routing and wireless OS with syntax menu trees like /ip/address and /interface/bridge.'
  },
  cisco_ios: {
    id: 'cisco_ios',
    name: 'Cisco IOS',
    osName: 'IOS-XE 17.x',
    defaultPrompt: 'Router#',
    badgeColor: 'bg-blue-600 border-blue-500 text-white',
    description: 'Industry-standard enterprise CLI with exec and privileged configuration modes.'
  },
  cisco_nxos: {
    id: 'cisco_nxos',
    name: 'Cisco NX-OS',
    osName: 'NX-OS 9.3',
    defaultPrompt: 'nexus-sw#',
    badgeColor: 'bg-cyan-600 border-cyan-500 text-white',
    description: 'Data center switch OS optimized for high-density Nexus fabrics.'
  },
  juniper: {
    id: 'juniper',
    name: 'Juniper',
    osName: 'JunOS 22.2',
    defaultPrompt: 'admin@JunOS> ',
    badgeColor: 'bg-emerald-600 border-emerald-500 text-white',
    description: 'Structured candidate configuration system with set/commit/rollback workflow.'
  },
  huawei: {
    id: 'huawei',
    name: 'Huawei',
    osName: 'VRP v8',
    defaultPrompt: '<Huawei-VRP>',
    badgeColor: 'bg-rose-700 border-rose-600 text-white',
    description: 'Versatile Routing Platform with display/system-view syntax.'
  },
  ubiquiti: {
    id: 'ubiquiti',
    name: 'Ubiquiti',
    osName: 'EdgeOS v2',
    defaultPrompt: 'ubnt@EdgeRouter:~$ ',
    badgeColor: 'bg-sky-600 border-sky-500 text-white',
    description: 'Vyatta-based Linux routing platform with intuitive set/show interfaces.'
  },
  vyos: {
    id: 'vyos',
    name: 'VyOS',
    osName: 'VyOS 1.4',
    defaultPrompt: 'vyos@router:~$ ',
    badgeColor: 'bg-purple-600 border-purple-500 text-white',
    description: 'Open-source network operating system based on Debian GNU/Linux.'
  },
  fortinet: {
    id: 'fortinet',
    name: 'Fortinet',
    osName: 'FortiOS 7.2',
    defaultPrompt: 'FortiGate-60E # ',
    badgeColor: 'bg-amber-600 border-amber-500 text-white',
    description: 'Next-generation firewall CLI with config system interface hierarchy.'
  },
  aruba: {
    id: 'aruba',
    name: 'Aruba',
    osName: 'ArubaOS-CX',
    defaultPrompt: 'Aruba-CX-6300# ',
    badgeColor: 'bg-orange-600 border-orange-500 text-white',
    description: 'Modern campus network switch operating system with cloud-native design.'
  },
  openwrt: {
    id: 'openwrt',
    name: 'OpenWrt',
    osName: 'OpenWrt 23.05',
    defaultPrompt: 'root@OpenWrt:~# ',
    badgeColor: 'bg-teal-600 border-teal-500 text-white',
    description: 'Extensible Linux distribution for embedded routers with UCI syntax.'
  },
  linux: {
    id: 'linux',
    name: 'Debian Linux',
    osName: 'Debian GNU/Linux 12',
    defaultPrompt: 'root@server:~#',
    badgeColor: 'bg-orange-700 border-orange-600 text-white',
    description: 'Debian GNU/Linux server with standard networking tools (ip, ss, systemctl, apt).'
  }
};
