// ============================================================
// WirelessProcessor — L2 forwarding untuk perangkat wireless.
// AP: hanya menerima frame dari station yang terasosiasi,
//      unicast ke station hanya keluar lewat interface wlan miliknya.
// Station: terhubung ke AP (wirelessState.link) → meneruskan
//      frame wired ↔ wlan; tanpa asosiasi frame dibuang.
// ============================================================

import { NetworkDevice } from './NetworkDevice';
import { DeviceProcessor, SimulatorCore } from './DeviceProcessor';
import { Packet } from '../core/types';
import { isBroadcastMac } from '../layer2/EthernetFrame';
import { isPortForwarding } from '../services/StpService';
import { isWlanIfaceName, isStationMode, WirelessState } from '../services/WirelessService';
import { applyAclDeny } from '../services/FirewallService';

type NetIface = ReturnType<NetworkDevice['getInterfaces']>[number];

export class WirelessProcessor implements DeviceProcessor {
  constructor(private device: NetworkDevice) {}

  handlePacket(pkt: Packet, inPort: string, core: SimulatorCore, traceId: string): void {
    const dev = this.device;
    if (!dev.powered) {
      core.emit('PACKET_DROPPED', traceId, { reason: 'power' }, dev.id, inPort);
      core.drop(dev, pkt, 'power', traceId);
      return;
    }
    const inIface = dev.getIfaceByPortId(inPort) || dev.getIfaceByName(inPort);
    if (!inIface || !inIface.up) {
      core.emit('PACKET_DROPPED', traceId, { reason: 'iface-down' }, dev.id, inPort);
      core.drop(dev, pkt, 'iface-down', traceId);
      return;
    }
    if (!isPortForwarding(dev, inIface.portId)) {
      core.emit('PACKET_DROPPED', traceId, { reason: 'stp' }, dev.id, inPort);
      core.drop(dev, pkt, 'stp', traceId);
      return;
    }

    // ACL/firewall: rule deny dievaluasi per frame (L2 forwarding path).
    if (applyAclDeny(core, dev, pkt, traceId, inPort)) {
      return;
    }

    const inWlan = isWlanIfaceName(inIface.name);
    const wstate = dev.wirelessState || { ap: true, associations: [], link: null };

    core.emit('PACKET_RECEIVED', traceId, { packetId: pkt.id }, dev.id, inPort);

    if (inWlan) {
      this.handleWlanIn(pkt, inIface, wstate, core, traceId);
    } else {
      this.handleWiredIn(pkt, inIface, wstate, core, traceId);
    }
  }

  /** Frame masuk lewat radio. */
  private handleWlanIn(pkt: Packet, inIface: NetIface, wstate: WirelessState, core: SimulatorCore, traceId: string): void {
    const dev = this.device;

    if (isStationMode(dev, inIface.name)) {
      // ── Sisi station ──
      if (!wstate.link) {
        core.emit('PACKET_DROPPED', traceId, { reason: 'no-assoc' }, dev.id, inIface.portId);
        core.drop(dev, pkt, 'no-assoc', traceId);
        return;
      }
      // Belajar MAC AP, teruskan ke port wired.
      dev.macTable.learn(pkt.srcMac, inIface.portId, pkt.vlan ?? 1, core.now);
      this.floodWired(pkt, inIface.portId, inIface.name, core, traceId);
      return;
    }

    // ── Sisi AP ──
    const assoc = wstate.associations.find((a) => a.stationMac === pkt.srcMac);
    // Frame boleh masuk bila src = station terasosiasi, ATAU ada station
    // terasosiasi di radio ini (bridging client di belakang station).
    const hasAssocOnIface = wstate.associations.some((a) => a.iface === inIface.name);
    if (!assoc && !hasAssocOnIface) {
      const secured = devHasSecurity(dev);
      core.emit('PACKET_DROPPED', traceId, { reason: secured ? 'auth' : 'no-assoc' }, dev.id, inIface.portId);
      core.drop(dev, pkt, secured ? 'auth' : 'no-assoc', traceId);
      return;
    }
    dev.macTable.learn(pkt.srcMac, inIface.portId, pkt.vlan ?? 1, core.now);

    if (isBroadcastMac(pkt.dstMac)) {
      this.floodAll(pkt, inIface.portId, inIface.name, core, traceId);
      return;
    }
    // unicast: ke station lain lewat radio, atau ke wired.
    const dstAssoc = wstate.associations.find((a) => a.stationMac === pkt.dstMac);
    if (dstAssoc) {
      const egress = dev.getIfaceByName(dstAssoc.iface);
      if (egress && egress.portId !== inIface.portId) {
        core.transmit(dev, pkt, egress.name, traceId);
      } else {
        core.drop(dev, pkt, 'same-port', traceId);
      }
      return;
    }
    const entry = dev.macTable.lookup(pkt.dstMac, pkt.vlan ?? 1);
    if (entry && entry.port && entry.port !== inIface.portId) {
      core.transmit(dev, pkt, entry.port, traceId);
      return;
    }
    if (entry && entry.port === inIface.portId) {
      core.drop(dev, pkt, 'same-port', traceId);
      return;
    }
    this.floodWired(pkt, inIface.portId, inIface.name, core, traceId);
  }

  /** Frame masuk lewat port wired. */
  private handleWiredIn(pkt: Packet, inIface: NetIface, wstate: WirelessState, core: SimulatorCore, traceId: string): void {
    const dev = this.device;
    dev.macTable.learn(pkt.srcMac, inIface.portId, pkt.vlan ?? 1, core.now);

    if (isStationMode(dev, inIface.name)) {
      // Station: wired → wlan bila terasosiasi.
      if (!wstate.link) {
        core.emit('PACKET_DROPPED', traceId, { reason: 'no-assoc' }, dev.id, inIface.portId);
        core.drop(dev, pkt, 'no-assoc', traceId);
        return;
      }
      const wlanIface = dev.getIfaceByName(wstate.link.iface);
      if (!wlanIface || !wlanIface.up) {
        core.drop(dev, pkt, 'iface-down', traceId);
        return;
      }
      core.transmit(dev, pkt, wlanIface.name, traceId);
      return;
    }

    // AP: wired → wired (switch biasa) atau wired → station (via radio).
    const broadcast = isBroadcastMac(pkt.dstMac);
    if (broadcast) {
      this.floodAll(pkt, inIface.portId, inIface.name, core, traceId);
      return;
    }
    const dstAssoc = wstate.associations.find((a) => a.stationMac === pkt.dstMac);
    if (dstAssoc) {
      const egress = dev.getIfaceByName(dstAssoc.iface);
      if (egress) {
        core.emit('PACKET_FORWARDED', traceId, { packetId: pkt.id, dstMac: pkt.dstMac, wireless: true }, dev.id, egress.portId);
        core.transmit(dev, pkt, egress.name, traceId);
        return;
      }
    }
    const entry = dev.macTable.lookup(pkt.dstMac, pkt.vlan ?? 1);
    if (entry && entry.port && entry.port !== inIface.portId) {
      core.emit('PACKET_FORWARDED', traceId, { packetId: pkt.id, dstMac: pkt.dstMac }, dev.id, entry.port);
      core.transmit(dev, pkt, entry.port, traceId);
      return;
    }
    if (entry && entry.port === inIface.portId) {
      core.drop(dev, pkt, 'same-port', traceId);
      return;
    }
    this.floodAll(pkt, inIface.portId, inIface.name, core, traceId);
  }

  /** Flood hanya ke port wired (dipakai station & AP dari wlan). */
  private floodWired(pkt: Packet, inPort: string, inName: string, core: SimulatorCore, traceId: string): void {
    const dev = this.device;
    let sent = 0;
    for (const iface of dev.getInterfaces()) {
      if (iface.type === 'vlan') continue;
      if (iface.portId === inPort || iface.name === inName) continue;
      if (isWlanIfaceName(iface.name)) continue;
      if (!isPortForwarding(dev, iface.portId)) continue;
      core.emit('PACKET_FORWARDED', traceId, { packetId: pkt.id, dstMac: pkt.dstMac, wireless: true, flood: true }, dev.id, iface.portId);
      if (core.transmit(dev, pkt, iface.name, traceId)) sent++;
    }
    if (sent === 0) core.drop(dev, pkt, 'flood-empty', traceId);
  }

  /** Flood semua port (wired + wlan) kecuali ingress. */
  private floodAll(pkt: Packet, inPort: string, inName: string, core: SimulatorCore, traceId: string): void {
    const dev = this.device;
    let sent = 0;
    for (const iface of dev.getInterfaces()) {
      if (iface.type === 'vlan') continue;
      if (iface.portId === inPort || iface.name === inName) continue;
      if (!isPortForwarding(dev, iface.portId)) continue;
      core.emit('PACKET_FORWARDED', traceId, { packetId: pkt.id, dstMac: pkt.dstMac, wireless: true, flood: true }, dev.id, iface.portId);
      if (core.transmit(dev, pkt, iface.name, traceId)) sent++;
    }
    if (sent === 0) core.drop(dev, pkt, 'flood-empty', traceId);
  }
}

/** AP punya keamanan (wpa2-psk dll)? */
function devHasSecurity(dev: NetworkDevice): boolean {
  for (const cfg of Object.values(dev.wirelessCfg)) {
    if (cfg.security) return true;
    if (cfg.securityProfile && dev.wirelessSecurityProfiles[cfg.securityProfile]) return true;
  }
  return false;
}
