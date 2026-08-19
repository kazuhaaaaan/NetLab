// Katalog model perangkat per vendor.
// Dipakai untuk: pemilihan model di Inspector, panduan di halaman utama,
// dan output "show version" di simulator.

import { PortSpec } from '../types';

export type ModelDeviceType =
  | 'router'
  | 'switch'
  | 'firewall'
  | 'pc'
  | 'server'
  | 'wireless'
  | 'windows-client';

export interface PortDef {
  /** nama port; pakai {n} untuk nomor berurutan, mis. ether{n} → ether1, ether2 */
  name: string;
  speedMbps: number;
  type?: 'copper' | 'fiber' | 'serial' | 'radio';
  /** jumlah port (default 1) */
  count?: number;
  /** nomor awal untuk placeholder {n} (default 1) */
  start?: number;
}

export interface DeviceModel {
  id: string;
  label: string;
  /** jenis perangkat yang cocok dengan model ini */
  types: ModelDeviceType[];
  /** penjelasan singkat, bahasa awam */
  description: string;
  specs: {
    cpu: string;
    ram: string;
    flash?: string;
    ports?: string;
  };
  /** layout port asli perangkat (untuk canvas) */
  ports: PortDef[];
}

const p = (
  name: string,
  speedMbps: number,
  type: 'copper' | 'fiber' | 'serial' | 'radio' = 'copper',
  count = 1,
  start = 1
): PortDef[] =>
  Array.from({ length: count }, (_, i) => ({
    name: name.replace('{n}', String(i + start)),
    speedMbps,
    type,
  }));

/** Bangun PortSpec (dengan MAC unik) dari daftar PortDef sebuah model. */
export function getPortsForModel(vendorId: string, modelLabel: string): PortSpec[] {
  const model = (DEVICE_MODELS[vendorId] || []).find((m) => m.label === modelLabel);
  const defs: PortDef[] = model?.ports || getFallbackPorts(vendorId);
  const ports = defs.flatMap((d, di) =>
    Array.from({ length: d.count ?? 1 }, (_, i) => {
      const name = d.name.replace('{n}', String((d.start ?? 1) + i));
      // MAC deterministik + unik per port (hash nama + indeks vendor + model)
      const seedStr = `${vendorId}|${modelLabel}|${name}|${di}|${i}`;
      let h = 2166136261;
      for (const ch of seedStr) {
        h ^= ch.charCodeAt(0);
        h = Math.imul(h, 16777619);
      }
      const hex = (h >>> 0).toString(16).padStart(8, '0');
      const mac = `52:54:${hex.slice(0, 2)}:${hex.slice(2, 4)}:${hex.slice(4, 6)}:${hex.slice(6, 8)}`;
      return {
        id: name,
        name,
        speedMbps: d.speedMbps,
        // status = admin state (default UP untuk semua port). Status operasional
        // (kabel ada/tidak, link down, admin shutdown via CLI) TIDAK disimpan di
        // sini — diturunkan Port Inspector dari edges + state CLI (shutdownIfaces).
        status: 'up' as const,
        type: d.type || 'copper',
        macAddress: mac,
      };
    })
  );
  return ports;
}

function getFallbackPorts(vendorId: string): PortDef[] {
  if (vendorId === 'mikrotik') return [...p('ether{n}', 1000, 'copper', 4), ...p('sfp1', 10000, 'fiber')];
  if (vendorId === 'linux' || vendorId === 'openwrt') return [...p('eth{n}', 1000, 'copper', 4)];
  if (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba')
    return [...p('Gi0/{n}', 1000, 'copper', 4)];
  return [...p('port{n}', 1000, 'copper', 4)];
}

export const DEVICE_MODELS: Record<string, DeviceModel[]> = {
  mikrotik: [
    {
      id: 'hex_rb750gr3',
      label: 'hEX (RB750Gr3)',
      types: ['router', 'switch'],
      description: 'Router mini yang murah dan paling banyak dipakai untuk kantor kecil / rumah.',
      specs: { cpu: 'MT7621A 880MHz dual-core', ram: '256MB', flash: '16MB', ports: '5x Gigabit Ethernet' },
      ports: [...p('ether{n}', 1000, 'copper', 5)],
    },
    {
      id: 'hap_ac2',
      label: 'hAP ac2',
      types: ['router', 'wireless'],
      description: 'Router + WiFi untuk rumah/kantor kecil. Ada antena 2.4GHz dan 5GHz.',
      specs: { cpu: 'IPQ4018 717MHz quad-core', ram: '128MB', flash: '16MB', ports: '5x Gigabit Ethernet' },
      ports: [...p('ether{n}', 1000, 'copper', 5), ...p('wlan{n}', 300, 'radio', 2)],
    },
    {
      id: 'rb3011uias',
      label: 'RB3011UiAS-RM',
      types: ['router'],
      description: 'Router enterprise untuk kantor menengah: 10 port Gigabit + 1 SFP.',
      specs: { cpu: 'PPC 1.4GHz dual-core', ram: '1GB', flash: '512MB', ports: '10x Gigabit + 1x SFP' },
      ports: [...p('ether{n}', 1000, 'copper', 10), ...p('sfp1', 1250, 'fiber')],
    },
    {
      id: 'crs326',
      label: 'CRS326-24G-2S+',
      types: ['switch'],
      description: 'Switch unggulan MikroTik: 24 port Gigabit + 2 port SFP+ 10G.',
      specs: { cpu: '98DX3236 ARM', ram: '512MB', flash: '16MB', ports: '24x GbE + 2x SFP+' },
      ports: [...p('ether{n}', 1000, 'copper', 24), ...p('sfp{n}', 10000, 'fiber', 2)],
    },
    {
      id: 'ccr2004',
      label: 'CCR2004-1G-12S+2XS',
      types: ['router'],
      description: 'Cloud Core Router: sangat kencang, buat ISP atau jaringan besar.',
      specs: { cpu: 'AL3242 ARM 1.7GHz 4-core', ram: '2GB', flash: '256MB', ports: '1x GbE + 12x SFP+ 10G' },
      ports: [...p('ether1', 1000, 'copper'), ...p('sfp{n}', 10000, 'fiber', 12)],
    },
    {
      id: 'mikrotik_virtual',
      label: 'CHR (Cloud Hosted Router)',
      types: ['router', 'switch', 'wireless'],
      description: 'MikroTik virtual yang jalan di atas komputer server — bebas bereksperimen.',
      specs: { cpu: 'Virtual x86-64', ram: '256MB+', ports: 'Tidak terbatas' },
      ports: [...p('ether{n}', 1000, 'copper', 8), ...p('wlan{n}', 300, 'radio', 2)],
    },
  ],
  cisco_ios: [
    {
      id: 'cisco_isr4331',
      label: 'ISR 4331',
      types: ['router'],
      description: 'Router kantor menengah: 3 slot untuk kabel LAN/WAN, bisa VPN dan firewall.',
      specs: { cpu: 'x86 2-core', ram: '4GB', flash: '8GB', ports: '3x GbE built-in' },
      ports: [...p('Gi0/0/{n}', 1000, 'copper', 3, 0)],
    },
    {
      id: 'cisco_c1111',
      label: 'C1111-4P ISR',
      types: ['router'],
      description: 'Router kecil untuk kantor cabang: 4 port LAN + WAN 4G/LTE opsional.',
      specs: { cpu: 'ARM64', ram: '1GB', flash: '4GB', ports: '4x GbE' },
      ports: [...p('Gi0/0/{n}', 1000, 'copper', 4, 0)],
    },
    {
      id: 'cisco_2960x',
      label: 'Catalyst 2960-X',
      types: ['switch'],
      description: 'Switch akses standar kantor: banyak port Gigabit untuk menghubungkan komputer.',
      specs: { cpu: 'ARM', ram: '512MB', flash: '128MB', ports: '24x/48x GbE' },
      ports: [...p('Gi0/{n}', 1000, 'copper', 24), ...p('Te0/1/{n}', 10000, 'fiber', 2)],
    },
    {
      id: 'cisco_9200',
      label: 'Catalyst 9200',
      types: ['switch'],
      description: 'Switch generasi baru: cepat, mendukung PoE untuk WiFi dan IP camera.',
      specs: { cpu: 'x86 2-core', ram: '4GB', flash: '8GB', ports: '24x/48x GbE' },
      ports: [...p('Gi1/0/{n}', 1000, 'copper', 24), ...p('Te1/1/{n}', 10000, 'fiber', 4)],
    },
    {
      id: 'cisco_asr900',
      label: 'ASR 900 Series',
      types: ['router'],
      description: 'Router operator (ISP) yang sangat kuat untuk jaringan besar.',
      specs: { cpu: 'x86 4-core', ram: '16GB', flash: '32GB', ports: 'Modular' },
      ports: [...p('Gi0/0/{n}', 1000, 'copper', 4, 0), ...p('Te0/2/{n}', 10000, 'fiber', 2, 0)],
    },
  ],
  cisco_nxos: [
    {
      id: 'nxos_3048',
      label: 'Nexus 3048',
      types: ['switch'],
      description: 'Switch data center: port 10G untuk server, mendukung VXLAN dan fabric.',
      specs: { cpu: 'x86', ram: '8GB', flash: '8GB', ports: '48x SFP+ 10G' },
      ports: [...p('Eth1/{n}', 10000, 'fiber', 48)],
    },
    {
      id: 'nxos_93180yc',
      label: 'Nexus 93180YC-EX',
      types: ['switch'],
      description: 'Switch top-of-rack 25G: koneksi cepat antar server di rak server.',
      specs: { cpu: 'x86 2-core', ram: '16GB', flash: '16GB', ports: '48x 25G + 6x 100G' },
      ports: [...p('Eth1/{n}', 25000, 'fiber', 24), ...p('Eth1/{n}', 100000, 'fiber', 4, 49)],
    },
    {
      id: 'nxos_9364c',
      label: 'Nexus 9364C',
      types: ['switch'],
      description: 'Switch spine 100G untuk data center kelas besar.',
      specs: { cpu: 'x86 4-core', ram: '32GB', flash: '32GB', ports: '64x 100G' },
      ports: [...p('Eth1/{n}', 100000, 'fiber', 16)],
    },
  ],
  juniper: [
    {
      id: 'juniper_srx300',
      label: 'SRX300',
      types: ['router', 'firewall'],
      description: 'Firewall/router kecil kantor cabang: 8 port Gigabit, bisa VPN.',
      specs: { cpu: 'ARM 4-core', ram: '2GB', flash: '8GB', ports: '8x GbE' },
      ports: [...p('ge-0/0/{n}', 1000, 'copper', 8)],
    },
    {
      id: 'juniper_ex2300',
      label: 'EX2300',
      types: ['switch'],
      description: 'Switch akses kantor: 24 port Gigabit + uplink untuk ke router.',
      specs: { cpu: 'ARM', ram: '1GB', flash: '1GB', ports: '24x GbE + 4x SFP' },
      ports: [...p('ge-0/0/{n}', 1000, 'copper', 24), ...p('ge-0/1/{n}', 10000, 'fiber', 2)],
    },
    {
      id: 'juniper_mx240',
      label: 'MX240',
      types: ['router'],
      description: 'Router operator: pemrosesan paket super cepat untuk ISP.',
      specs: { cpu: 'Junos Trio', ram: '16GB', flash: '16GB', ports: 'Modular' },
      ports: [...p('ge-0/0/{n}', 1000, 'copper', 2), ...p('xe-0/0/{n}', 10000, 'fiber', 2)],
    },
    {
      id: 'juniper_mx480',
      label: 'MX480',
      types: ['router'],
      description: 'Router core operator yang lebih besar dari MX240.',
      specs: { cpu: 'Junos Trio', ram: '32GB', flash: '16GB', ports: 'Modular' },
      ports: [...p('ge-0/0/{n}', 1000, 'copper', 2), ...p('xe-0/0/{n}', 10000, 'fiber', 4)],
    },
  ],
  huawei: [
    {
      id: 'huawei_ar6120',
      label: 'AR6120',
      types: ['router'],
      description: 'Router kantor cabang Huawei: 8 port Gigabit, bisa jadi gateway WAN.',
      specs: { cpu: 'x86 2-core', ram: '1GB', flash: '512MB', ports: '8x GbE' },
      ports: [...p('GigabitEthernet0/0/{n}', 1000, 'copper', 8)],
    },
    {
      id: 'huawei_ar3260',
      label: 'AR3260',
      types: ['router'],
      description: 'Router menengah-besar untuk kantor utama atau ISP kecil.',
      specs: { cpu: 'x86 4-core', ram: '4GB', flash: '1GB', ports: 'Modular' },
      ports: [...p('GigabitEthernet0/0/{n}', 1000, 'copper', 4)],
    },
    {
      id: 'huawei_s5720',
      label: 'S5720',
      types: ['switch'],
      description: 'Switch kantor paling umum di Indonesia: 48 port + 4 uplink 10G.',
      specs: { cpu: 'ARM', ram: '512MB', flash: '128MB', ports: '48x GbE + 4x 10G' },
      ports: [...p('GigabitEthernet0/0/{n}', 1000, 'copper', 48), ...p('XGigabitEthernet0/0/{n}', 10000, 'fiber', 4, 1)],
    },
    {
      id: 'huawei_usg6300',
      label: 'USG6300',
      types: ['firewall'],
      description: 'Firewall Huawei untuk melindungi jaringan kantor dari serangan.',
      specs: { cpu: 'x86', ram: '2GB', flash: '512MB', ports: '4x GbE' },
      ports: [...p('GigabitEthernet0/0/{n}', 1000, 'copper', 4)],
    },
  ],
  ubiquiti: [
    {
      id: 'ubiquiti_erx',
      label: 'EdgeRouter X',
      types: ['router'],
      description: 'Router kantor/rumah favorit: 5 port Gigabit, harganya ramah.',
      specs: { cpu: 'MT7621A 880MHz dual-core', ram: '256MB', flash: '256MB', ports: '5x GbE' },
      ports: [...p('eth{n}', 1000, 'copper', 5, 0)],
    },
    {
      id: 'ubiquiti_er4',
      label: 'EdgeRouter 4',
      types: ['router'],
      description: 'Router yang lebih kencang: 4 port, cocok untuk koneksi 1Gbps penuh.',
      specs: { cpu: 'MT7621A 880MHz dual-core', ram: '1GB', flash: '4GB', ports: '4x GbE' },
      ports: [...p('eth{n}', 1000, 'copper', 4, 0)],
    },
    {
      id: 'ubiquiti_er12',
      label: 'EdgeRouter 12',
      types: ['router', 'switch'],
      description: 'Router 12 port: sekaligus bisa jadi switch untuk kantor kecil.',
      specs: { cpu: 'MT7621A 880MHz dual-core', ram: '1GB', flash: '4GB', ports: '12x GbE + 2x SFP' },
      ports: [...p('eth{n}', 1000, 'copper', 12, 0), ...p('sfp{n}', 10000, 'fiber', 2, 1)],
    },
    {
      id: 'ubiquiti_usgpro',
      label: 'USG-Pro-4',
      types: ['firewall', 'router'],
      description: 'Firewall gateway untuk dikontrol lewat dashboard UniFi.',
      specs: { cpu: 'x86', ram: '1GB', flash: '4GB', ports: '4x GbE + 2x SFP' },
      ports: [...p('eth{n}', 1000, 'copper', 4, 0), ...p('sfp{n}', 10000, 'fiber', 2, 1)],
    },
  ],
  vyos: [
    {
      id: 'vyos_1_4',
      label: 'VyOS 1.4 LTS (Rolling)',
      types: ['router', 'firewall', 'switch'],
      description: 'Router open-source berbasis Linux, sering dipakai di lab dan cloud.',
      specs: { cpu: 'Virtual x86-64', ram: '512MB+', flash: '8GB', ports: 'Tidak terbatas' },
      ports: [...p('eth{n}', 1000, 'copper', 4)],
    },
    {
      id: 'vyos_1_3',
      label: 'VyOS 1.3 LTS',
      types: ['router', 'firewall'],
      description: 'Versi stabil lama VyOS yang masih banyak dipakai.',
      specs: { cpu: 'Virtual x86-64', ram: '512MB+', flash: '8GB', ports: 'Tidak terbatas' },
      ports: [...p('eth{n}', 1000, 'copper', 4)],
    },
  ],
  fortinet: [
    {
      id: 'fortigate_60e',
      label: 'FortiGate 60E',
      types: ['firewall', 'router'],
      description: 'Firewall kecil untuk kantor cabang: 5 port + WiFi opsional.',
      specs: { cpu: 'SOC3', ram: '1GB', flash: '256MB', ports: '5x GbE' },
      ports: [...p('port{n}', 1000, 'copper', 6), ...p('wan1', 1000, 'copper')],
    },
    {
      id: 'fortigate_80f',
      label: 'FortiGate 80F',
      types: ['firewall', 'router'],
      description: 'Firewall kantor menengah dengan performa tinggi.',
      specs: { cpu: 'SOC4', ram: '2GB', flash: '256MB', ports: '10x GbE' },
      ports: [...p('port{n}', 1000, 'copper', 10)],
    },
    {
      id: 'fortigate_200e',
      label: 'FortiGate 200E',
      types: ['firewall', 'router'],
      description: 'Firewall untuk kantor besar / gedung bertingkat.',
      specs: { cpu: 'SOC3', ram: '4GB', flash: '256MB', ports: '22x GbE + 2x SFP+' },
      ports: [...p('port{n}', 1000, 'copper', 10), ...p('sfp{n}', 10000, 'fiber', 2)],
    },
    {
      id: 'fortigate_100d',
      label: 'FortiGate 100D',
      types: ['firewall', 'router'],
      description: 'Firewall lawas tapi masih banyak dipakai di perusahaan.',
      specs: { cpu: 'x86', ram: '8GB', flash: '128MB', ports: '20x GbE' },
      ports: [...p('port{n}', 1000, 'copper', 20)],
    },
  ],
  aruba: [
    {
      id: 'aruba_2930f',
      label: 'Aruba 2930F',
      types: ['switch'],
      description: 'Switch akses kantor dari HPE: handal dan mudah diatur.',
      specs: { cpu: 'ARM', ram: '512MB', flash: '1GB', ports: '24x/48x GbE' },
      ports: [...p('1/1/{n}', 1000, 'copper', 24)],
    },
    {
      id: 'aruba_6300m',
      label: 'Aruba 6300M-48G4X',
      types: ['switch'],
      description: 'Switch inti/data center dengan 4 port 10G uplink.',
      specs: { cpu: 'x86', ram: '4GB', flash: '8GB', ports: '48x GbE + 4x 10G SFP+' },
      ports: [...p('1/1/{n}', 1000, 'copper', 48), ...p('1/2/{n}', 10000, 'fiber', 4)],
    },
    {
      id: 'aruba_8325',
      label: 'Aruba 8325-32C',
      types: ['switch', 'router'],
      description: 'Switch spine 100G untuk data center besar.',
      specs: { cpu: 'x86', ram: '16GB', flash: '32GB', ports: '32x 100G' },
      ports: [...p('1/1/{n}', 100000, 'fiber', 8)],
    },
  ],
  openwrt: [
    {
      id: 'openwrt_x86',
      label: 'OpenWrt x86-64',
      types: ['router', 'switch', 'wireless'],
      description: 'OpenWrt versi PC: fleksibel, bisa jadi router apa saja.',
      specs: { cpu: 'Virtual x86-64', ram: '256MB+', flash: '128MB+', ports: 'Tidak terbatas' },
      ports: [...p('eth{n}', 1000, 'copper', 4)],
    },
    {
      id: 'glinet_glmt1300',
      label: 'GL.iNet GL-MT1300',
      types: ['router', 'wireless'],
      description: 'Router mini yang langsung support OpenWrt, sering buat VPN.',
      specs: { cpu: 'MT7621A 880MHz', ram: '256MB', flash: '16MB', ports: '3x GbE' },
      ports: [...p('eth{n}', 1000, 'copper', 3), ...p('wlan{n}', 300, 'radio', 2)],
    },
    {
      id: 'tplink_archerc7',
      label: 'TP-Link Archer C7 v4',
      types: ['router', 'wireless'],
      description: 'Router WiFi rumahan yang umum di-flash OpenWrt.',
      specs: { cpu: 'QCA9558 720MHz', ram: '128MB', flash: '16MB', ports: '4x GbE' },
      ports: [...p('eth{n}', 1000, 'copper', 4), ...p('wlan{n}', 300, 'radio', 2)],
    },
  ],
  linux: [
    {
      id: 'debian_12',
      label: 'Debian 12 (Bookworm)',
      types: ['server', 'pc'],
      description: 'Sistem Linux stabil, favorit untuk server kantor.',
      specs: { cpu: 'Virtual x86-64', ram: '1GB+', flash: '20GB', ports: 'Tidak terbatas' },
      ports: [...p('eth{n}', 1000, 'copper', 4)],
    },
    {
      id: 'ubuntu_2204',
      label: 'Ubuntu Server 22.04 LTS',
      types: ['server', 'pc'],
      description: 'Server Ubuntu paling populer untuk aplikasi web.',
      specs: { cpu: 'Virtual x86-64', ram: '1GB+', flash: '20GB', ports: 'Tidak terbatas' },
      ports: [...p('eth{n}', 1000, 'copper', 4)],
    },
    {
      id: 'raspios',
      label: 'Raspberry Pi OS (64-bit)',
      types: ['pc', 'server'],
      description: 'Linux untuk Raspberry Pi: kecil, hemat listrik.',
      specs: { cpu: 'ARM Cortex-A72 1.8GHz', ram: '1-8GB', flash: 'SD Card 32GB', ports: '1x GbE' },
      ports: [...p('eth0', 1000, 'copper')],
    },
  ],
  windows: [
    {
      id: 'windows_11',
      label: 'Windows 11 Pro',
      types: ['windows-client'],
      description: 'Windows 11 desktop: NetBrowser, Network Settings, Website Editor, File Explorer & Notepad.',
      specs: { cpu: 'Virtual x86-64 4-core', ram: '8GB', flash: '256GB', ports: '1x GbE' },
      ports: [...p('eth0', 1000, 'copper')],
    },
    {
      id: 'windows_10',
      label: 'Windows 10 Enterprise',
      types: ['windows-client'],
      description: 'Windows 10 enterprise: sama dengan Windows 11, model lama.',
      specs: { cpu: 'Virtual x86-64 2-core', ram: '4GB', flash: '128GB', ports: '1x GbE' },
      ports: [...p('eth0', 1000, 'copper')],
    },
  ],
};

/** Ambil daftar model untuk satu vendor. */
export function getModelsForVendor(vendorId: string): DeviceModel[] {
  return DEVICE_MODELS[vendorId] || [];
}

/** Ambil model default untuk vendor + jenis perangkat. */
export function getDefaultModel(vendorId: string, deviceType: string): string {
  const models = DEVICE_MODELS[vendorId] || [];
  const match = models.find((m) => m.types.includes(deviceType as ModelDeviceType));
  return (match || models[0])?.label || `${vendorId} virtual`;
}
