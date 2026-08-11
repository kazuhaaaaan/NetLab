// ============================================================
// RoutingProtocolEngine — OSPF/RIP/EIGRP & BGP (distance-vector)
// Diport dari engine lama agar CLI routing tetap berfungsi.
// ============================================================

import { NetworkDevice } from '../devices/NetworkDevice';
import { LinkTable } from '../core/Topology';
import { inSameSubnet, intToIp, ipToInt, networkOf, parseCidr } from '../core/ip';
import { DhcpPool } from '../core/types';

interface TableEntry {
  dst: string;
  gateway: string;
  metric: number;
  /** AS-path BGP (kosong untuk rute origin lokal / non-BGP). */
  asPath?: number[];
}

/** Protokol distance-vector aktif sebuah perangkat (satu protokol pada satu waktu). */
function protoOf(cfg: NetworkDevice['routingCfg']): 'ospf' | 'rip' | 'eigrp' | null {
  if (cfg?.ospf?.enabled) return 'ospf';
  if (cfg?.rip?.enabled) return 'rip';
  if (cfg?.eigrp?.enabled) return 'eigrp';
  return null;
}

export class RoutingProtocolEngine {
  compute(devices: NetworkDevice[], links: LinkTable): void {
    for (const dev of devices) dev.clearDynamicRoutes();

    // Perlindungan power-off: perangkat yang mati tidak menyebarkan rute
    // dan tidak boleh menjadi asal / penerima rute dinamis.
    const alive = devices.filter((d) => d.powered);
    if (alive.length < devices.length) {
      for (const dev of devices) {
        if (!dev.powered) dev.clearDynamicRoutes();
      }
    }
    const segments = this.buildSegments(alive, links);
    this.computeProtocolRoutes(alive, links, segments);
    this.computeBgpRoutes(alive, links);
  }

  private isSwitch(dev: NetworkDevice): boolean {
    return dev.isSwitch;
  }

  private buildSegments(devices: NetworkDevice[], links: LinkTable): Map<string, string> {
    const parent = new Map<string, string>();
    const find = (a: string): string => {
      let r = parent.get(a) || a;
      if (parent.has(r)) {
        r = find(r);
        parent.set(a, r);
      }
      return r;
    };
    const union = (a: string, b: string) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    };

    const isSwitchNode = (id: string) => devices.find((d) => d.id === id)?.isSwitch ?? false;
    for (const link of links.all) {
      // Link yang sengaja dimatikan (failure injection) TIDAK menyatukan segmen:
      // switch-switch yang hanya terhubung lewat link down berada di segmen berbeda.
      if (link.down) continue;
      if (isSwitchNode(link.a.nodeId) && isSwitchNode(link.b.nodeId)) {
        union(link.a.nodeId, link.b.nodeId);
      }
    }

    const keyOfPort = (devId: string, portName: string): string => {
      const link = links.linkOn(devId, portName);
      if (!link) return `unplugged:${devId}:${portName}`;
      // Link down (failure injection) = tidak ada adjacency lintas link ini.
      if (link.down) return `unplugged:${devId}:${portName}`;
      const aSw = isSwitchNode(link.a.nodeId);
      const bSw = isSwitchNode(link.b.nodeId);
      if (aSw || bSw) return `cloud:${find(aSw ? link.a.nodeId : link.b.nodeId)}`;
      return `ptp:${link.id}`;
    };

    const segments = new Map<string, string>();
    for (const dev of devices) {
      for (const iface of dev.getInterfaces()) {
        // Kunci pakai portId (bukan nama interface): konsultasi segmen selalu
        // memakai port id dari link, sehingga konfigurasi port yang id != nama
        // tetap membentuk adjacency yang benar.
        segments.set(`${dev.id}:${iface.portId}`, keyOfPort(dev.id, iface.portId));
      }
    }
    return segments;
  }

  private ipOnSegment(dev: NetworkDevice, key: string, segments: Map<string, string>, links: LinkTable): string | null {
    for (const link of links.linksOf(dev.id)) {
      if (link.down) continue;
      const myPort = link.a.nodeId === dev.id ? link.a.port : link.b.port;
      const segKey = segments.get(`${dev.id}:${myPort}`);
      if (segKey !== key) continue;
      // myPort adalah port id dari link; cari interface lewat portId dulu,
      // baru nama (kompatibel untuk port yang id != nama).
      const iface = dev.getIfaceByPortId(myPort) || dev.getIfaceByName(myPort) || dev.getVirtualByParentPort(myPort);
      // Interface harus HIDUP: adjacency tidak terbentuk lewat interface
      // shutdown/down (rute tidak lagi dipertukarkan di segmen ini).
      if (iface?.ip && iface.up) return iface.ip.address;
    }
    return null;
  }

  /** Cost OSPF sebuah interface: override CLI ("ip ospf cost") menang,
   *  selain itu otomatis dari bandwidth (referensi 100 Mbps). */
  private ospfIfaceCost(dev: NetworkDevice, iface: { name: string; speedMbps?: number } | null): number {
    if (!iface) return 1;
    const override = ((dev.routingCfg as any).ospf?.interfaceCosts || {})[iface.name];
    if (override && override > 0) return override;
    const speed = iface.speedMbps || 100;
    return Math.max(1, Math.round(100 / speed));
  }

  /**
   * Argumen kedua statement network bisa berupa netmask (255.255.255.0 → /24)
   * ATAU wildcard Cisco (0.0.0.255 → /24). Deteksi arah kontiguitas bit:
   * ones berjejer dari kanan (LSB) = wildcard → prefix = 32 - jumlah ones;
   * selain itu dianggap netmask → prefix = jumlah ones.
   */
  private maskOrWildcardToPrefix(maskStr: string): number {
    const n = ipToInt(maskStr);
    let ones = 0;
    for (let bit = 0; bit < 32; bit++) if (((n >>> bit) & 1) === 1) ones++;
    if (n !== 0 && (n & (n + 1)) === 0) {
      // 0.0.0.255 / 0.0.0.0 (host) / 255.255.255.255 (any) — wildcard Cisco
      return 32 - ones;
    }
    return ones;
  }

  private normalizeNetworkEntry(dev: NetworkDevice, entry: string): string | null {
    const trimmed = entry.trim();
    // Dua token "ip mask" / "ip wildcard" — musti ditangani SEBELUM parseCidr
    // karena parseCidr mengganti spasi dengan '/' lalu menganggap argumen kedua
    // sebagai netmask (wildcard 0.0.0.255 jadi /0, bukan /24).
    const two = trimmed.match(/^(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)$/);
    if (two) {
      return `${two[1]}/${this.maskOrWildcardToPrefix(two[2])}`;
    }
    const parsed = parseCidr(trimmed);
    if (parsed) {
      return `${parsed.address}/${parsed.prefix}`;
    }
    const iface = dev.getIfaceByName(trimmed);
    if (iface?.ip) {
      return `${intToIp(networkOf(iface.ip.address, iface.ip.prefix))}/${iface.ip.prefix}`;
    }
    return null;
  }

  private computeProtocolRoutes(devices: NetworkDevice[], links: LinkTable, segments: Map<string, string>): void {
    const tables = new Map<string, TableEntry[]>();
    const l3 = devices.filter((d) => !d.isSwitch);

    for (const dev of l3) {
      const cfg = dev.routingCfg;
      const proto = protoOf(cfg);
      if (!proto) continue;
      const nets = (cfg[proto]?.networks || []).map((n) => this.normalizeNetworkEntry(dev, n)).filter((n): n is string => !!n);
      if (nets.length === 0) continue;
      const entries: TableEntry[] = [];
      for (const iface of dev.getInterfaces()) {
        if (!iface.ip || !iface.up) continue;
        const subnet = `${intToIp(networkOf(iface.ip.address, iface.ip.prefix))}/${iface.ip.prefix}`;
        const participates = nets.some((net) => {
          const parsed = parseCidr(net);
          if (!parsed) return false;
          const pa = Math.min(iface.ip.prefix, parsed.prefix);
          return inSameSubnet(iface.ip.address, pa, parsed.address);
        });
        if (participates) entries.push({ dst: subnet, gateway: '', metric: 0 });
      }
      if (entries.length > 0) tables.set(dev.id, entries);
    }

    for (let round = 0; round < l3.length; round++) {
      const candidates: { peerId: string; dst: string; gateway: string; metric: number }[] = [];
      for (const dev of l3) {
        const myEntries = tables.get(dev.id);
        if (!myEntries) continue;
        const proto = protoOf(dev.routingCfg);
        if (!proto) continue;
        const myKeys = new Set<string>();
        for (const link of links.linksOf(dev.id)) {
          const myPort = link.a.nodeId === dev.id ? link.a.port : link.b.port;
          myKeys.add(segments.get(`${dev.id}:${myPort}`) || `ptp:${link.id}`);
        }
        for (const key of myKeys) {
          const myIp = this.ipOnSegment(dev, key, segments, links);
          if (!myIp) continue;
          // passive-interface OSPF: interface lokal di segmen ini tidak
          // membentuk adjacency → subnet tetap diiklankan, tapi tidak
          // ada pertukaran rute lewat segmen ini.
          const localIface = dev.getInterfaces().find((i) => i.ip && i.ip.address === myIp) || null;
          const myPassive =
            proto === 'ospf' &&
            !!localIface &&
            ((dev.routingCfg as any).ospf?.passiveInterfaces || []).includes(localIface.name);
          if (myPassive) continue;
          // Cost OSPF interface (eksplisit via CLI atau auto dari bandwidth).
          const hopCost = proto === 'ospf' ? this.ospfIfaceCost(dev, localIface) : 1;
          for (const other of l3) {
            if (other.id === dev.id) continue;
            // Isolasi protokol: adjacency hanya terbentuk antar perangkat
            // yang menjalankan protokol SAMA (OSPF↔OSPF, RIP↔RIP, ...).
            if (protoOf(other.routingCfg) !== proto) continue;
            const otherIp = this.ipOnSegment(other, key, segments, links);
            if (!otherIp) continue;
            // Sisi penerima juga passive → adjacency tidak terbentuk.
            const otherIface = other.getInterfaces().find((i) => i.ip && i.ip.address === otherIp);
            if (
              otherIface &&
              proto === 'ospf' &&
              ((other.routingCfg as any).ospf?.passiveInterfaces || []).includes(otherIface.name)
            ) {
              continue;
            }
            for (const e of myEntries) {
              candidates.push({ peerId: other.id, dst: e.dst, gateway: myIp, metric: e.metric + hopCost });
            }
          }
        }
      }
      if (candidates.length === 0) break;
      let changed = false;
      for (const c of candidates) {
        const peer = devices.find((d) => d.id === c.peerId);
        if (!peer) continue;
        if (peer.hasIp(c.gateway)) continue;
        // RIP: metric maksimum 15 hop (16 = infinity) — rute > 15 hop tidak
        // diadopsi dan tidak disebarkan (loop prevention jarak terbatas).
        const originProto = protoOf(peer.routingCfg);
        if (originProto === 'rip' && c.metric > 15) continue;
        const list = tables.get(c.peerId) || [];
        const existing = list.find((t) => t.dst === c.dst);
        if (!existing || c.metric < existing.metric) {
          if (!existing) list.push({ dst: c.dst, gateway: c.gateway, metric: c.metric });
          else {
            existing.gateway = c.gateway;
            existing.metric = c.metric;
          }
          tables.set(c.peerId, list);
          changed = true;
        }
      }
      if (!changed) break;
    }

    for (const [devId, entries] of tables) {
      const dev = devices.find((d) => d.id === devId);
      if (!dev) continue;
      for (const e of entries) {
        if (e.gateway) dev.addDynamicRoute(e.dst, e.gateway);
      }
    }
  }

  private computeBgpRoutes(devices: NetworkDevice[], links: LinkTable): void {
    const bgpRouters = devices.filter((d) => d.bgpCfg && d.bgpCfg.asn && d.bgpCfg.peers.length > 0);
    if (bgpRouters.length === 0) return;
    const segments = this.buildSegments(devices, links);

    const tables = new Map<string, TableEntry[]>();
    for (const dev of bgpRouters) {
      const cfg = dev.bgpCfg!;
      const entries: TableEntry[] = [];
      for (const iface of dev.getInterfaces()) {
        if (iface.ip && iface.up) {
          entries.push({ dst: `${intToIp(networkOf(iface.ip.address, iface.ip.prefix))}/${iface.ip.prefix}`, gateway: '', metric: 0, asPath: [] });
        }
      }
      for (const n of cfg.networks || []) {
        const norm = this.normalizeNetworkEntry(dev, n);
        if (norm && !entries.some((e) => e.dst === norm)) entries.push({ dst: norm, gateway: '', metric: 0, asPath: [] });
      }
      tables.set(dev.id, entries);
    }

    const deviceById = (ip: string) => devices.find((d) => d.hasIp(ip)) || null;
    const peerRouterOf = (p: { remoteAs: number; remoteAddr: string }): { id: string; asn: number } | null => {
      const peerId = deviceById(p.remoteAddr)?.id;
      if (!peerId || !bgpRouters.some((b) => b.id === peerId)) return null;
      return { id: peerId, asn: bgpRouters.find((b) => b.id === peerId)!.bgpCfg!.asn };
    };

    for (let round = 0; round < bgpRouters.length; round++) {
      const candidates: { peerId: string; dst: string; gateway: string; metric: number; asPath: number[] }[] = [];
      for (const dev of bgpRouters) {
        const myEntries = tables.get(dev.id);
        if (!myEntries) continue;
        const myAsn = dev.bgpCfg!.asn;
        for (const p of dev.bgpCfg!.peers) {
          const peerRouter = peerRouterOf(p);
          if (!peerRouter) continue;
          // iBGP bila AS sama, eBGP bila berbeda.
          const sameAs = peerRouter.asn === myAsn;
          // Next-hop BGP = IP interface yang menghadap peer (langsung atau via path),
          // bukan IP pertama perangkat — kalau tidak, rute belajar mengarah ke
          // gateway yang tidak terjangkau.
          const nextHop = this.egressIpToward(dev, p.remoteAddr, devices, links, segments) || dev.getIpAddress();
          if (!nextHop) continue;
          for (const e of myEntries) {
            // Loop prevention: jangan iklankan kembali ke AS yang sudah ada di path.
            if (e.asPath && e.asPath.includes(peerRouter.asn)) continue;
            // iBGP: rute yang dipelajari dari iBGP tidak diiklankan ke iBGP lain
            // (hanya origin lokal atau rute eBGP yang diteruskan).
            if (sameAs && e.asPath && e.asPath.length > 0) continue;
            const asPath = sameAs ? [...(e.asPath || [])] : [myAsn, ...(e.asPath || [])];
            candidates.push({ peerId: peerRouter.id, dst: e.dst, gateway: nextHop, metric: e.metric + 1, asPath });
          }
        }
      }
      if (candidates.length === 0) break;
      let changed = false;
      for (const c of candidates) {
        const peer = devices.find((d) => d.id === c.peerId);
        if (!peer || peer.hasIp(c.gateway)) continue;
        const list = tables.get(c.peerId) || [];
        const existing = list.find((t) => t.dst === c.dst);
        if (!existing || c.metric < existing.metric) {
          if (!existing) list.push({ dst: c.dst, gateway: c.gateway, metric: c.metric, asPath: c.asPath });
          else {
            existing.gateway = c.gateway;
            existing.metric = c.metric;
            existing.asPath = c.asPath;
          }
          tables.set(c.peerId, list);
          changed = true;
        }
      }
      if (!changed) break;
    }

    for (const [devId, entries] of tables) {
      const dev = devices.find((d) => d.id === devId);
      if (!dev) continue;
      for (const e of entries) {
        if (e.gateway) dev.addDynamicRoute(e.dst, e.gateway);
      }
    }
  }

  /**
   * IP lokal `dev` yang tepat untuk dijadikan next-hop menuju `targetIp`
   * (peer BGP):
   * 1. Jika peer di subnet langsung → IP interface pada subnet itu.
   * 2. Jika peer trans-it (iBGP multi-hop) → IP interface pada segmen
   *    pertama jalur menuju peer (via BFS di topologi).
   */
  private egressIpToward(
    dev: NetworkDevice,
    targetIp: string,
    devices: NetworkDevice[],
    links: LinkTable,
    segments: Map<string, string>
  ): string | null {
    for (const iface of dev.getInterfaces()) {
      if (iface.ip && iface.up && inSameSubnet(iface.ip.address, iface.ip.prefix, targetIp)) return iface.ip.address;
    }
    const parent = new Map<string, string>();
    const visited = new Set<string>([dev.id]);
    const queue: string[] = [dev.id];
    let foundId: string | null = null;
    while (queue.length > 0) {
      const id = queue.shift()!;
      for (const link of links.linksOf(id)) {
        if (link.down) continue;
        const nb = link.a.nodeId === id ? link.b.nodeId : link.a.nodeId;
        if (visited.has(nb)) continue;
        visited.add(nb);
        parent.set(nb, id);
        const nd = devices.find((x) => x.id === nb);
        if (nd && nd.hasIp(targetIp)) {
          foundId = nb;
          break;
        }
        queue.push(nb);
      }
      if (foundId) break;
    }
    if (!foundId) return null;
    let cur = foundId;
    while (parent.get(cur) !== dev.id && parent.has(cur)) cur = parent.get(cur)!;
    if (parent.get(cur) !== dev.id) return null;
    for (const link of links.linksOf(dev.id)) {
      const nb = link.a.nodeId === dev.id ? link.b.nodeId : link.a.nodeId;
      if (nb !== cur) continue;
      const myPort = link.a.nodeId === dev.id ? link.a.port : link.b.port;
      const seg = segments.get(`${dev.id}:${myPort}`);
      if (!seg) continue;
      const ip = this.ipOnSegment(dev, seg, segments, links);
      if (ip) return ip;
    }
    return null;
  }
}
