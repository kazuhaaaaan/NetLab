// ============================================================
// SwitchProcessor — L2 forwarding:
// MAC learning, flood, broadcast, unknown unicast, aging
// ============================================================

import { NetworkDevice } from './NetworkDevice';
import { DeviceProcessor, SimulatorCore } from './DeviceProcessor';
import { MAC_BROADCAST, Packet } from '../core/types';
import { isBroadcastMac } from '../layer2/EthernetFrame';
import { isPortForwarding } from '../services/StpService';

type NetIface = ReturnType<NetworkDevice['getInterfaces']>[number];

export class SwitchProcessor implements DeviceProcessor {
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

    // STP: port blocking/alternate tidak menerima frame (loop protection).
    if (!isPortForwarding(dev, inIface.portId)) {
      core.emit('PACKET_DROPPED', traceId, { reason: 'stp' }, dev.id, inPort);
      core.drop(dev, pkt, 'stp', traceId);
      return;
    }

    core.emit('PACKET_RECEIVED', traceId, { packetId: pkt.id }, dev.id, inPort);

    // VLAN ingress (portId → nama interface untuk lookup config).
    // Frame tak-bertag yang masuk access port dianggap milik access-VLAN port tsb;
    // frame bertag (dari trunk/router) memakai tag di paket.
    const inName = inIface.name;
    const trunkIn = dev.trunkPorts.has(inName);
    const hasVlanConfig = dev.portVlans.size > 0 || dev.trunkPorts.size > 0;
    const frameVlan = hasVlanConfig ? dev.portVlans.get(inName) ?? pkt.vlan ?? inIface.vlanId ?? 1 : 1;
    // Bawa VLAN frame ke hop berikutnya (trunk/router) agar reply bisa dikembalikan ke VLAN yang sama.
    pkt.vlan = frameVlan;

    // 1) MAC learning (dengan aging)
    const changed = dev.macTable.learn(pkt.srcMac, inPort, frameVlan, core.now);
    if (changed) core.emit('MAC_LEARNED', traceId, { mac: pkt.srcMac, port: inPort }, dev.id, inPort);
    const aged = dev.macTable.age(core.now);
    if (aged.length > 0) core.emit('MAC_AGED', traceId, { macs: aged }, dev.id);

    // 2) Keputusan forwarding
    const broadcast = isBroadcastMac(pkt.dstMac);
    if (broadcast) {
      this.flood(pkt, inPort, inName, frameVlan, trunkIn, core, traceId);
      return;
    }

    const entry = dev.macTable.lookup(pkt.dstMac);
    if (entry && entry.port && entry.port !== inPort) {
      const egressIface = dev.getIfaceByPortId(entry.port) || dev.getIfaceByName(entry.port);
      if (!egressIface || !isPortForwarding(dev, egressIface.portId)) {
        core.emit('PACKET_DROPPED', traceId, { reason: 'stp' }, dev.id, entry.port);
        core.drop(dev, pkt, 'stp', traceId);
        return;
      }
      if (!egressIface || !this.vlanAllows(frameVlan, egressIface, trunkIn, dev)) {
        core.emit('PACKET_DROPPED', traceId, { reason: 'vlan' }, dev.id, entry.port);
        core.drop(dev, pkt, 'vlan', traceId);
        return;
      }
      // forwarded unicast
      core.transmit(dev, pkt, entry.port, traceId);
      return;
    }
    if (entry && entry.port === inPort) {
      // frame datang dan keluar port sama → drop
      core.emit('PACKET_DROPPED', traceId, { reason: 'same-port' }, dev.id, inPort);
      core.drop(dev, pkt, 'same-port', traceId);
      return;
    }

    // unknown unicast → flood
    this.flood(pkt, inPort, inName, frameVlan, trunkIn, core, traceId);
  }

  private flood(pkt: Packet, inPort: string, inName: string, vlan: number, trunkIn: boolean, core: SimulatorCore, traceId: string): void {
    const dev = this.device;
    let sent = 0;
    for (const iface of dev.getInterfaces()) {
      const port = iface.portId;
      if (port === inPort || iface.name === inName) continue;
      if (!isPortForwarding(dev, port)) continue;
      if (!this.vlanAllows(vlan, iface, trunkIn, dev)) continue;
      if (core.transmit(dev, pkt, port, traceId)) sent++;
    }
    if (sent === 0) core.drop(dev, pkt, 'flood-empty', traceId);
  }

  private vlanAllows(frameVlan: number, iface: NetIface, trunkIn: boolean, dev: NetworkDevice): boolean {
    if (dev.portVlans.size === 0 && dev.trunkPorts.size === 0) return true;
    if (dev.trunkPorts.has(iface.name)) return true; // trunk egress membawa semua VLAN
    const inVlan = frameVlan;
    const outVlan = dev.portVlans.get(iface.name) ?? 1;
    if (trunkIn) return true; // ingress trunk → egress bebas
    return inVlan === outVlan;
  }
}
