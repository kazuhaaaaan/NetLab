// ============================================================
// WirelessService — komputasi asosiasi AP ↔ station.
// Perangkat 'wireless' bertindak sebagai AP (mode ap-bridge)
// atau station (mode station). Asosiasi terjadi bila SSID cocok
// dan autentikasi (wpa2-psk) cocok. Hasil ditulis ke
// device.wirelessState untuk dipakai WirelessProcessor.
// ============================================================

import { NetworkDevice } from '../devices/NetworkDevice';
import { LinkTable } from '../core/Topology';

export interface WirelessIfaceCfg {
  ssid?: string;
  mode?: string;
  band?: string;
  securityProfile?: string;
  security?: string;
  key?: string;
}

export interface WirelessProfileCfg {
  authenticationTypes?: string;
  key?: string;
}

export interface WirelessAssociation {
  stationMac: string;
  stationId: string;
  stationName: string;
  ssid: string;
  iface: string;
  signal: number;
}

export interface WirelessState {
  /** perangkat ini AP? */
  ap: boolean;
  /** station yang terasosiasi (sisi AP) */
  associations: WirelessAssociation[];
  /** info link station → AP (sisi station) */
  link: { apId: string; apName: string; iface: string; ssid: string } | null;
}

export function isWlanIfaceName(name: string): boolean {
  const n = name.toLowerCase();
  return n.startsWith('wlan') || n.startsWith('wifi') || n.startsWith('dot11radio') || n.startsWith('radio') || n.startsWith('ath') || n.includes('wireless');
}

export function wirelessCfgOf(dev: NetworkDevice, ifaceName: string): WirelessIfaceCfg {
  return dev.wirelessCfg[ifaceName] || {};
}

/** Resolve profil keamanan → { security?, key? } */
export function resolveSecurity(
  ifaceCfg: WirelessIfaceCfg,
  profiles: Record<string, WirelessProfileCfg>
): { security: string | null; key: string | null } {
  if (ifaceCfg.securityProfile && profiles[ifaceCfg.securityProfile]) {
    const p = profiles[ifaceCfg.securityProfile];
    const auth = (p.authenticationTypes || '').toLowerCase();
    const security = auth.includes('wpa2') || auth.includes('wpa3') ? 'wpa2-psk' : auth.includes('wpa') ? 'wpa-psk' : null;
    return { security, key: p.key || null };
  }
  if (ifaceCfg.security) return { security: ifaceCfg.security, key: ifaceCfg.key || null };
  return { security: null, key: null };
}

/** Apakah perangkat bertindak sebagai station (mode=station*)? */
export function isStationMode(dev: NetworkDevice, ifaceName: string): boolean {
  const mode = (wirelessCfgOf(dev, ifaceName).mode || '').toLowerCase();
  return mode.startsWith('station');
}

export function computeWireless(
  devices: NetworkDevice[],
  links: LinkTable,
  isPowered: (id: string) => boolean
): Map<string, WirelessState> {
  const byId = new Map(devices.map((d) => [d.id, d]));
  const out = new Map<string, WirelessState>();
  const wireless = devices.filter((d) => d.kind === 'wireless');

  const ensure = (id: string): WirelessState => {
    let s = out.get(id);
    if (!s) {
      s = { ap: true, associations: [], link: null };
      out.set(id, s);
    }
    return s;
  };

  for (const link of links.all) {
    const a = byId.get(link.a.nodeId);
    const b = byId.get(link.b.nodeId);
    if (!a || !b || a.kind !== 'wireless' || b.kind !== 'wireless') continue;
    if (!isPowered(a.id) || !isPowered(b.id)) continue;
    const aIface = a.getIfaceByPortId(link.a.port);
    const bIface = b.getIfaceByPortId(link.b.port);
    if (!aIface || !bIface || !aIface.up || !bIface.up) continue;
    if (!isWlanIfaceName(aIface.name) || !isWlanIfaceName(bIface.name)) continue;

    const aCfg = wirelessCfgOf(a, aIface.name);
    const bCfg = wirelessCfgOf(b, bIface.name);
    const aStation = isStationMode(a, aIface.name);
    const bStation = isStationMode(b, bIface.name);

    // Pasangan AP↔station (atau AP↔AP untuk WDS).
    let ap: NetworkDevice;
    let apIface: typeof aIface;
    let st: NetworkDevice | null;
    let stIface: typeof bIface;
    if (aStation && !bStation) {
      ap = b; apIface = bIface; st = a; stIface = aIface;
    } else if (bStation && !aStation) {
      ap = a; apIface = aIface; st = b; stIface = bIface;
    } else {
      ap = a; apIface = aIface; st = null; stIface = bIface; // AP-AP (WDS)
    }

    const apCfg = wirelessCfgOf(ap, apIface.name);
    const stCfg = st ? wirelessCfgOf(st, stIface.name) : null;
    const apSec = resolveSecurity(apCfg, ap.wirelessSecurityProfiles);

    // AP tanpa SSID → terbuka (kompatibilitas: wireless apa adanya).
    const apSsid = apCfg.ssid;
    let ok = true;
    let reason: 'no-ssid' | 'auth' | null = null;
    if (st) {
      if (apSsid && stCfg?.ssid && apSsid !== stCfg.ssid) { ok = false; reason = 'no-ssid'; }
      else if (apSsid && !stCfg?.ssid) { ok = false; reason = 'no-ssid'; }
      else if (apSec.security && apSec.key) {
        const stSec = resolveSecurity(stCfg || {}, st?.wirelessSecurityProfiles || {});
        if (stSec.key !== apSec.key) { ok = false; reason = 'auth'; }
      }
    }
    if (!ok) continue;

    // Asosiasi berhasil
    const signal = -(40 + ((a.id.length + b.id.length) % 30));
    if (st) {
      const stMac = stIface.mac || st.getInterfaces()[0]?.mac || '';
      const assoc: WirelessAssociation = {
        stationMac: stMac,
        stationId: st.id,
        stationName: st.name,
        ssid: apSsid || '(open)',
        iface: apIface.name,
        signal,
      };
      const apState = ensure(ap.id);
      if (!apState.associations.some((x) => x.stationId === st.id)) apState.associations.push(assoc);
      const stState = ensure(st.id);
      stState.ap = false;
      stState.link = { apId: ap.id, apName: ap.name, iface: stIface.name, ssid: apSsid || '(open)' };
    } else {
      // AP-AP (WDS): kedua sisi saling asosiasi
      const aAssoc: WirelessAssociation = {
        stationMac: bIface.mac || '',
        stationId: b.id,
        stationName: b.name,
        ssid: aCfg.ssid || bCfg.ssid || '(open)',
        iface: aIface.name,
        signal,
      };
      const bAssoc: WirelessAssociation = {
        stationMac: aIface.mac || '',
        stationId: a.id,
        stationName: a.name,
        ssid: aCfg.ssid || bCfg.ssid || '(open)',
        iface: bIface.name,
        signal,
      };
      const as = ensure(a.id);
      if (!as.associations.some((x) => x.stationId === b.id)) as.associations.push(aAssoc);
      const bs = ensure(b.id);
      if (!bs.associations.some((x) => x.stationId === a.id)) bs.associations.push(bAssoc);
    }
  }

  for (const dev of wireless) {
    const state = out.get(dev.id);
    if (!state) out.set(dev.id, { ap: true, associations: [], link: null });
  }
  return out;
}
