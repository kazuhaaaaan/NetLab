// ============================================================
// SwitchProcessor — L2 forwarding:
// MAC learning (per VLAN), flood, broadcast, unknown unicast, aging
// VLAN classification: access port, trunk (allowed-list + native)
// ============================================================

import { NetworkDevice } from './NetworkDevice';
import { DeviceProcessor, SimulatorCore } from './DeviceProcessor';
import { MAC_BROADCAST, Packet } from '../core/types';
import { isBroadcastMac } from '../layer2/EthernetFrame';
import { isPortForwarding } from '../services/StpService';
import { applyAclDeny } from '../services/FirewallService';

type NetIface = ReturnType<NetworkDevice['getInterfaces']>[number];

/** Batas hop frame broadcast/unicast-unknown lewat switch (loop guard). */
const L2_MAX_HOPS = 24;

export class SwitchProcessor implements DeviceProcessor {
  constructor(private device: NetworkDevice) {}

  handlePacket(pkt: Packet, inPort: string, core: SimulatorCore, traceId: string): void {
    const dev = this.device;
    if (!dev.powered) {
      core.emit('PACKET_DROPPED', traceId, { reason: 'power' }, dev.id, inPort);
      core.drop(dev, pkt, 'power', traceId);
      return;
    }
    // Perlindungan loop L2 (tanpa STP): frame yang berputar melebihi batas
    // hop di-buang supaya topologi loop tidak menggantung simulasi.
    if (pkt.hops.length > L2_MAX_HOPS) {
      core.emit('PACKET_DROPPED', traceId, { reason: 'l2-loop' }, dev.id, inPort);
      core.drop(dev, pkt, 'l2-loop', traceId);
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

    // ACL/firewall pada lalu lintas L2: rule (access-list vendor / filter
    // rule) dievaluasi per frame — deny memblokir forwarding, bukan hanya
    // tampil di print CLI. DHCP (udp 67/68) tidak dikecualikan di switch.
    if (applyAclDeny(core, dev, pkt, traceId, inPort)) {
      return;
    }

    core.emit('PACKET_RECEIVED', traceId, { packetId: pkt.id }, dev.id, inPort);

    // VLAN ingress classification:
    // - Access port: frame tak-bertag dianggap milik access-VLAN port tsb.
    // - Trunk port : frame bertag memakai tag di paket; frame tak-bertag
    //   diklasifikasikan ke native-VLAN trunk (default 1).
    // - Tanpa konfigurasi VLAN sama sekali: flat network (VLAN 1).
    const inName = inIface.name;
    const trunkIn = dev.trunkPorts.has(inName);
    const hasVlanConfig = dev.portVlans.size > 0 || dev.trunkPorts.size > 0;
    let frameVlan: number;
    if (!hasVlanConfig) {
      frameVlan = 1;
    } else if (trunkIn) {
      const native = dev.trunkNativeVlans.get(inName);
      frameVlan = pkt.vlan ?? native ?? 1;
    } else {
      frameVlan = dev.portVlans.get(inName) ?? pkt.vlan ?? inIface.vlanId ?? 1;
    }
    // Bawa VLAN frame ke hop berikutnya (trunk/router) agar reply bisa dikembalikan ke VLAN yang sama.
    const ingressTag = pkt.vlan;
    pkt.vlan = frameVlan;

    // Ingress enforcement (hardening):
    // - Trunk: frame (bertag/untagged) hanya diterima bila VLAN-nya terdaftar
    //   di allowed-list trunk; daftar KOSONG (`allowed vlan none`) menolak
    //   SEMUA VLAN; tanpa allowed-list = semua VLAN boleh (compat).
    // - Port non-trunk (access): frame BERTAG ditolak — access port hanya
    //   menerima frame untagged (802.1Q nyata); tag asing tidak diabaikan.
    if (hasVlanConfig && trunkIn) {
      const allowed = dev.trunkAllowedVlans.get(inName);
      if (allowed !== undefined && !allowed.includes(frameVlan)) {
        core.emit('PACKET_DROPPED', traceId, { reason: 'vlan', vlan: frameVlan }, dev.id, inPort);
        core.drop(dev, pkt, 'vlan', traceId);
        return;
      }
    } else if (hasVlanConfig && ingressTag != null && !trunkIn) {
      core.emit('PACKET_DROPPED', traceId, { reason: 'vlan', vlan: ingressTag }, dev.id, inPort);
      core.drop(dev, pkt, 'vlan', traceId);
      return;
    }

    // Database VLAN otoritatif (VlanTable): bila perangkat punya VLAN yang
    // didaftarkan via CLI (`vlan 10` / `/interface vlan add` / `set vlans …`),
    // frame untuk VLAN yang TIDAK terdaftar atau suspended DITOLAK — database
    // bukan sekadar dekorasi print, melainkan sumber kebenaran klasifikasi.
    if (dev.vlanTable.list().length > 0 && !dev.vlanTable.isActive(frameVlan)) {
      core.emit('PACKET_DROPPED', traceId, { reason: 'vlan', vlan: frameVlan }, dev.id, inPort);
      core.drop(dev, pkt, 'vlan', traceId);
      return;
    }

    // 1) MAC learning (per VLAN, dengan aging)
    const changed = dev.macTable.learn(pkt.srcMac, inPort, frameVlan, core.now);
    if (changed) core.emit('MAC_LEARNED', traceId, { mac: pkt.srcMac, port: inPort, vlan: frameVlan }, dev.id, inPort);
    const aged = dev.macTable.age(core.now);
    if (aged.length > 0) core.emit('MAC_AGED', traceId, { macs: aged }, dev.id);

    // 1b) Port-security: batasi MAC yang boleh lewat per port (enforcement di sini
    // sebelum forwarding agar frame dari MAC "asing" di atas limit tidak diteruskan).
    const ps = dev.portSecurityCfg[inName];
    if (ps && ps.limit && ps.limit > 0) {
      const known = ps.learned.includes(pkt.srcMac);
      if (!known) {
        if (ps.learned.length >= ps.limit) {
          core.emit('PACKET_DROPPED', traceId, { reason: 'port-security-violation' }, dev.id, inPort);
          core.drop(dev, pkt, 'port-security-violation', traceId);
          return;
        }
        ps.learned.push(pkt.srcMac);
      }
    }

    // 2) Keputusan forwarding
    const broadcast = isBroadcastMac(pkt.dstMac);
    if (broadcast) {
      this.flood(pkt, inPort, inName, frameVlan, trunkIn, core, traceId);
      return;
    }

    const entry = dev.macTable.lookup(pkt.dstMac, frameVlan);
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
      // Tagging egress: frame native VLAN keluar trunk TANPA tag (802.1Q),
      // frame non-native keluar trunk DENGAN tag; access egress selalu untagged.
      this.applyEgressTag(pkt, frameVlan, egressIface, dev);
      // forwarded unicast
      core.emit('PACKET_FORWARDED', traceId, { packetId: pkt.id, dstMac: pkt.dstMac, vlan: pkt.vlan ?? null }, dev.id, entry.port);
      core.transmit(dev, pkt, entry.port, traceId);
      return;
    }
    if (entry && entry.port === inPort) {
      // frame datang dan keluar port sama → drop
      core.emit('PACKET_DROPPED', traceId, { reason: 'same-port' }, dev.id, inPort);
      core.drop(dev, pkt, 'same-port', traceId);
      return;
    }

    // unknown unicast → flood (tetap terikat domain broadcast VLAN)
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
      this.applyEgressTag(pkt, vlan, iface, dev);
      core.emit('PACKET_FORWARDED', traceId, { packetId: pkt.id, dstMac: pkt.dstMac, vlan: pkt.vlan ?? null, flood: true }, dev.id, port);
      if (core.transmit(dev, pkt, port, traceId)) sent++;
    }
    if (sent === 0) core.drop(dev, pkt, 'flood-empty', traceId);
  }

  /**
   * Set/clear tag 802.1Q pada frame untuk hop berikutnya:
   * - Trunk egress: frame milik native VLAN dikirim UNTAGGED (penerima
   *   mengklasifikasikannya lewat native-nya sendiri); frame lain bertag.
   * - Access egress: selalu untagged (receiver mengklasifikasi ulang).
   * Tanpa native trunk → semua frame bertag (default model).
   */
  private applyEgressTag(pkt: Packet, frameVlan: number, iface: NetIface, dev: NetworkDevice): void {
    if (dev.trunkPorts.has(iface.name)) {
      const native = dev.trunkNativeVlans.get(iface.name);
      pkt.vlan = native !== undefined && frameVlan === native ? null : frameVlan;
    } else {
      pkt.vlan = null;
    }
  }

  /**
   * Apakah frame VLAN `frameVlan` boleh KELUAR lewat `iface`?
   * - Tanpa konfigurasi VLAN → semua port menerima semua (compat lama).
   * - Trunk: allowed-list (bila ada) adalah SATU-SATUNYA sumber kebenaran —
   *   native VLAN TIDAK bypass allowed-list (harus didaftarkan juga);
   *   daftar kosong (`allowed vlan none`) menolak semua VLAN.
   * - Access: hanya access-VLAN port itu sendiri (frame dari VLAN lain
   *   tidak bocor, termasuk frame bertag dari trunk lain).
   */
  private vlanAllows(frameVlan: number, iface: NetIface, _trunkIn: boolean, dev: NetworkDevice): boolean {
    if (dev.portVlans.size === 0 && dev.trunkPorts.size === 0) return true;
    if (dev.trunkPorts.has(iface.name)) {
      const allowed = dev.trunkAllowedVlans.get(iface.name);
      if (allowed !== undefined) return allowed.includes(frameVlan);
      return true; // trunk tanpa allowed-list = semua VLAN
    }
    // Egress port access/akses: frame hanya boleh keluar bila VLAN-nya cocok
    // dengan access-VLAN port (berlaku juga untuk frame bertag dari trunk).
    const outVlan = dev.portVlans.get(iface.name) ?? iface.vlanId ?? 1;
    return frameVlan === outVlan;
  }
}