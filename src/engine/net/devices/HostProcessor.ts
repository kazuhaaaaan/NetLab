// ============================================================
// HostProcessor — perilaku perangkat akhir (PC / Server):
// ARP client, DHCP client (DORA), ICMP echo, DNS, TCP web server.
// Meneruskan handler L3 ke RouterProcessor tapi TIDAK mem-forward.
// ============================================================

import { NetworkDevice } from './NetworkDevice';
import { RouterProcessor } from './RouterProcessor';
import { SimulatorCore } from './DeviceProcessor';
import { arpResolveAndSend } from './sendUtils';
import { Packet, MAC_BROADCAST } from '../core/types';
import { buildLease } from '../services/DhcpService';
import { UDP_BOOTPC } from '../layer4/Udp';
import { inSameSubnet } from '../core/ip';
import { isIpv6Address, inSameIpv6Subnet } from '../core/ipv6';
import { ndpResolveAndSend } from './ndpUtils';

export class HostProcessor extends RouterProcessor {
  constructor(device: NetworkDevice) {
    super(device);
  }

  /** Kirim paket IP dari host: pilih interface, tentukan next-hop (dst langsung / default gateway). */
  send(pkt: Packet, traceId: string, core: SimulatorCore): boolean {
    const dev = this.device;
    if (isIpv6Address(pkt.dstIp)) return this.send6(pkt, traceId, core);
    const iface = dev.getInterfaces().find((i) => i.up && i.ip) || dev.getInterfaces().find((i) => i.up);
    if (!iface || !iface.mac) return false;
    pkt.srcMac = iface.mac;
    if (iface.ip) pkt.srcIp = iface.ip.address;
    const nextHop = this.nextHopFor(dev, iface, pkt.dstIp);
    if (!nextHop) return false;
    return arpResolveAndSend(dev, pkt, iface.name, nextHop, core, traceId);
  }

  private send6(pkt: Packet, traceId: string, core: SimulatorCore): boolean {
    const dev = this.device;
    const iface = dev.getInterfaces().find((i) => i.up && i.ipv6) || dev.getInterfaces().find((i) => i.up && i.ip);
    if (!iface || !iface.ipv6 || !iface.mac) return false;
    pkt.srcMac = iface.mac;
    pkt.srcIp = iface.ipv6.address;
    let nextHop: string | null = null;
    if (inSameIpv6Subnet(iface.ipv6.address, iface.ipv6.prefix, pkt.dstIp)) {
      nextHop = pkt.dstIp;
    } else {
      const def = dev.ipv6StaticRoutes.find((r) => r.dst === '::/0' || r.dst === '::0');
      nextHop = def?.gateway || null;
    }
    if (!nextHop) return false;
    return ndpResolveAndSend(dev, pkt, iface.name, nextHop, core, traceId);
  }

  private nextHopFor(dev: NetworkDevice, iface: { ip?: { address: string; prefix: number } | null; name: string }, dstIp: string): string | null {
    if (iface.ip && inSameSubnet(iface.ip.address, iface.ip.prefix, dstIp)) return dstIp;
    const def = dev
      .getRoutes()
      .find((r) => r.kind === 'static' && r.active !== false && (r.dst === '0.0.0.0/0' || r.dst === '0.0.0.0'));
    if (def?.gateway) return def.gateway;
    const lease = dev.leases.get(iface.name);
    if (lease?.gateway) return lease.gateway;
    return null;
  }

  /** Mulai DORA: host mengirim DHCP Discover. Return true jika bisa. */
  startDhcp(traceId: string, core: SimulatorCore): boolean {
    const dev = this.device;
    const iface = this.pickClientIface();
    if (!iface) return false;
    const xid = Math.floor(Math.random() * 0xffffffff) >>> 0;
    dev.dhcpClient = { xid, state: 'discover', ifaceName: iface.name };
    const discover = core.createPacket({
      protocol: 'udp',
      srcMac: iface.mac,
      dstMac: MAC_BROADCAST,
      srcIp: '0.0.0.0',
      dstIp: '255.255.255.255',
      srcPort: 68,
      dstPort: 67,
      ttl: 64,
      traceId,
      payload: { type: 'discover', xid },
    });
    core.emit('DHCP_DISCOVER', traceId, { xid, mac: iface.mac }, dev.id, iface.name);
    core.transmit(dev, discover, iface.name, traceId);
    return true;
  }

  /** Renew (T1): host mengirim DHCPREQUEST dengan requestedIp miliknya.
   *  Server menjawab ACK (perpanjang) — NAK hanya bila IP diambil klien lain. */
  startDhcpRenew(traceId: string, core: SimulatorCore, lease: { ip: string; gateway?: string; prefix?: number }): boolean {
    const dev = this.device;
    const iface = this.pickClientIface();
    if (!iface || !iface.ip) return false;
    const xid = Math.floor(Math.random() * 0xffffffff) >>> 0;
    dev.dhcpClient = { xid, state: 'renew', ifaceName: iface.name, offered: { ip: lease.ip, gateway: String(lease.gateway || ''), prefix: Number(lease.prefix) || 24 } };
    const req = core.createPacket({
      protocol: 'udp',
      srcMac: iface.mac,
      dstMac: MAC_BROADCAST,
      srcIp: iface.ip.address,
      dstIp: '255.255.255.255',
      srcPort: 68,
      dstPort: 67,
      ttl: 64,
      traceId,
      payload: { type: 'request', xid, requestedIp: lease.ip, renew: true },
    });
    core.emit('DHCP_REQUEST', traceId, { xid, renew: true, ip: lease.ip }, dev.id, iface.name);
    core.transmit(dev, req, iface.name, traceId);
    return true;
  }

  /** Release: host mengirim DHCPRELEASE; server menghapus lease, IP kembali ke pool. */
  startDhcpRelease(traceId: string, core: SimulatorCore, lease: { ip: string }): boolean {
    const dev = this.device;
    const iface = this.pickClientIface();
    if (!iface) return false;
    dev.dhcpClient = { xid: Math.floor(Math.random() * 0xffffffff) >>> 0, state: 'released', ifaceName: iface.name };
    const rel = core.createPacket({
      protocol: 'udp',
      srcMac: iface.mac,
      dstMac: MAC_BROADCAST,
      srcIp: lease.ip,
      dstIp: '255.255.255.255',
      srcPort: 68,
      dstPort: 67,
      ttl: 64,
      traceId,
      payload: { type: 'release', xid: Math.floor(Math.random() * 0xffffffff) >>> 0, ip: lease.ip },
    });
    core.emit('DHCP_RELEASE', traceId, { ip: lease.ip, mac: iface.mac }, dev.id, iface.name);
    core.transmit(dev, rel, iface.name, traceId);
    return true;
  }

  protected override handleUdpLocal(
    pkt: Packet,
    inPort: string,
    iface: { name: string; mac: string },
    core: SimulatorCore,
    traceId: string
  ): void {
    if (pkt.dstPort === UDP_BOOTPC) {
      this.handleDhcpClient(pkt, inPort, iface, core, traceId);
      return;
    }
    super.handleUdpLocal(pkt, inPort, iface, core, traceId);
  }

  private handleDhcpClient(
    pkt: Packet,
    inPort: string,
    iface: { name: string; mac: string },
    core: SimulatorCore,
    traceId: string
  ): void {
    const dev = this.device;
    const p = (pkt.payload ?? {}) as Record<string, unknown> & { type?: string; xid?: number; ip?: string; gateway?: string; prefix?: number; poolNodeId?: string };
    const state = dev.dhcpClient;

    if (p.type === 'offer' && state && state.state === 'discover' && p.xid === state.xid) {
      dev.dhcpClient = {
        ...state,
        state: 'request',
        offered: { ip: String(p.ip), gateway: String(p.gateway), prefix: Number(p.prefix) || 24, poolNodeId: String(p.poolNodeId) },
      };
      const req = core.createPacket({
        protocol: 'udp',
        srcMac: iface.mac,
        dstMac: pkt.srcMac,
        srcIp: '0.0.0.0',
        dstIp: pkt.srcIp,
        srcPort: 68,
        dstPort: 67,
        ttl: 64,
        traceId,
        payload: { type: 'request', xid: p.xid, requestedIp: p.ip },
      });
      core.emit('DHCP_REQUEST', traceId, { xid: p.xid, requestedIp: p.ip }, dev.id, iface.name);
      core.transmit(dev, req, iface.name, traceId);
      core.drop(dev, pkt, 'dhcp-consumed', traceId);
      return;
    }

    if (p.type === 'ack' && state && state.offered && p.xid === state.xid && p.ip === state.offered.ip) {
      const target = dev.getIfaceByName(state.ifaceName || iface.name);
      if (target) {
        target.ip = { address: String(p.ip), prefix: Number(p.prefix) || state.offered.prefix };
        target.up = true;
        const lease = buildLease(target.name, state.offered, core.now, Number(p.leaseTimeMs) || undefined);
        dev.leases.set(target.name, { ...lease, poolNodeId: state.offered.poolNodeId || lease.poolNodeId });
        // DNS server dari option 6 — klien memakainya untuk resolve hostname.
        if (Array.isArray(p.dnsServers) && (p.dnsServers as unknown[]).length > 0) {
          dev.dnsServers = (p.dnsServers as string[]).filter((s) => typeof s === 'string');
        }
        dev.dhcpClient = { ...state, state: 'bound' };
      }
      const run = core.getRun(traceId);
      if (run && run.status === 'running') {
        run.status = 'ok';
        run.reason = 'dhcp-bound';
      }
      core.emit('DHCP_ACK', traceId, { ip: p.ip }, dev.id, iface.name);
      core.drop(dev, pkt, 'dhcp-consumed', traceId);
      return;
    }

    core.drop(dev, pkt, 'dhcp-ignored', traceId);
  }

  private pickClientIface() {
    const dev = this.device;
    return dev.getInterfaces().find((i) => i.up && !i.ip) || dev.getInterfaces().find((i) => i.up) || null;
  }
}
