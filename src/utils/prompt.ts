// ============================================================
// Prompt CLI per vendor — murni, tidak bergantung React, agar teruji unit.
//
// Prompt dibangun dari IDENTITAS PERANGKAT NYATA (state device):
//   hostname hasil konfigurasi CLI (hostname R1 / /system identity set …)
//   + deviceType/model (switch → Switch#, router → Router#) + mode CLI.
// Tanpa hostname → identitas default vendor/deviceType. Hostname yang
// terkonfigurasi MENANG atas identitas default mana pun.
// ============================================================

import { VENDOR_MAP } from '../data/vendors';
import type { CliMode } from '../engine/cli/commandTree';

export function promptFor(
  vendor: string,
  name: string,
  hostname: string | undefined,
  deviceType: string | undefined,
  model: string | undefined,
  mode: CliMode,
  iface?: string
): string {
  const def = VENDOR_MAP[vendor as keyof typeof VENDOR_MAP]?.defaultPrompt;
  const eff = (hostname && hostname.trim().length > 0 ? hostname : name) || name;
  if (!def) return `${eff}#`;
  if (vendor === 'cisco_ios' || vendor === 'cisco' || vendor === 'cisco_nxos' || vendor === 'aruba') {
    // Identity default per deviceType: switch → Switch#, router → Router#.
    // Hostname terkonfigurasi menang atas default apa pun.
    const isSwitch =
      (deviceType && String(deviceType).toLowerCase() === 'switch') ||
      (model && String(model).toLowerCase().includes('switch'));
    let base: string;
    if (hostname && hostname.trim().length > 0) base = `${eff}#`;
    else if (vendor === 'cisco_nxos' && !isSwitch) base = 'Router#';
    else if (isSwitch) base = 'Switch#';
    else base = def.replace(/#\s*$/, '#');
    if (mode === 'exec') return base.replace(/#$/, '#');
    if (mode === 'config') return base.replace(/#$/, '(config)#');
    return base.replace(/#$/, '(config-if)#');
  }
  if (vendor === 'juniper') {
    const base = def.replace('JunOS', eff);
    if (mode === 'config') return base.replace(/>$/, '#');
    return base;
  }
  if (vendor === 'vyos' || vendor === 'ubiquiti') {
    const base = def.replace('router', eff);
    if (mode === 'config') return base.replace(/:~\$$/, '#');
    return base;
  }
  if (vendor === 'huawei') {
    const base = def.replace('Huawei-VRP', eff);
    if (mode === 'exec') return base;
    if (mode === 'config') return base.replace(/^</, '[').replace(/>$/, ']');
    const shown = iface || 'GigabitEthernet0/0/0';
    return `[${base.replace(/^<|>$/g, '')}-${shown}]`;
  }
  if (vendor === 'mikrotik') return def.replace('MikroTik', eff);
  if (vendor === 'linux' || vendor === 'openwrt') return def.replace('server', eff).replace('OpenWrt', eff);
  if (vendor === 'fortinet') return def.replace('FortiGate-60E', eff);
  return def;
}