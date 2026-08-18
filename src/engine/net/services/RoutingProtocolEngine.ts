// ============================================================
// RoutingProtocolEngine — OSPF (LSDB+SPF), RIP/EIGRP (distance-vector),
// BGP (FSM + best-path). Port dari engine lama agar CLI routing
// tetap berfungsi — namun dengan state protokol deterministik.
//
// Model deterministik (tanpa packet-level fiksi):
// - OSPF adjacency: state machine 7 fase (Down/Init/2-Way/ExStart/
//   Exchange/Loading/Full) yang maju SATU fase per "protocol round".
//   compute() konvergen (rounds=0) menjalankan round sampai stabil;
//   compute({rounds:n}) menjalankan tepat n round untuk observasi transisi.
// - Full HANYA tercapai bila seluruh kondisi kompatibilitas nyata terpenuhi:
//   kedua sisi hidup, interface up, link up, bukan passive, network
//   statement mencakup segmen, AREA sama, timer sehat (dead > hello).
// - LSDB: Router-LSA per router (stub network + link adjacency + cost);
//   rute dihitung via SPF Dijkstra — TIDAK langsung dari keberadaan tetangga.
// - BGP: FSM Idle/Connect/Active/OpenSent/OpenConfirm/Established, juga
//   berbasis round; pertukaran prefix HANYA via session Established;
//   withdrawal = session gagal → prefix tidak pernah dipasang lagi.
// - Best-path BGP deterministik: LOCAL_PREF > AS_PATH > eBGP/iBGP > ORIGIN
//   > router-id (tie-break).
// - Semua rute dipasang lewat sistem routing otoritatif perangkat
//   (addDynamicRoute) — tidak ada tabel tersembunyi.
// ============================================================

import { NetworkDevice } from '../devices/NetworkDevice';
import { LinkTable } from '../core/Topology';
import { inSameSubnet, intToIp, ipToInt, networkOf, parseCidr } from '../core/ip';

export type OspfPhase = 'Init' | '2-Way' | 'ExStart' | 'Exchange' | 'Loading' | 'Full';

/** State adjacency OSPF persisten (lintas recompute). */
export interface OspfSession {
  peerDevId: string;
  peerRouterId: string;
  myIface: string;
  peerIface: string;
  myIp: string;
  peerIp: string;
  area: number;
  rounds: number;
  state: OspfPhase;
}

export type BgpFsmState = 'Idle' | 'Connect' | 'Active' | 'OpenSent' | 'OpenConfirm' | 'Established';

/** State sesi BGP persisten (lintas recompute). */
export interface BgpSession {
  peerDevId: string;
  rounds: number;
  state: BgpFsmState;
}

/** Entry loc-RIB BGP sebuah router (hasil best-path selection). */
export interface BgpRibEntry {
  dst: string;
  gateway: string;
  asPath: number[];
  localPref: number;
  origin: 'i' | 'e' | '?';
  ebgp: boolean;
  advertiserRid: string;
  local: boolean;
  /** Rute dipelajari dari session iBGP → tidak boleh diiklankan ke iBGP lain. */
  viaIbgp: boolean;
}

export interface OspfLsaStub {
  network: string;
  cost: number;
}
export interface OspfLsaLink {
  neighbor: string;
  cost: number;
  iface: string;
}
export interface OspfLsa {
  advertiser: string;
  area: number;
  stubs: OspfLsaStub[];
  links: OspfLsaLink[];
}

export interface OspfNeighborView {
  routerId: string;
  ip: string;
  iface: string;
  state: string;
}

export interface BgpPeerView {
  remoteAddr: string;
  remoteAs: number;
  state: BgpFsmState;
  prefixes: number;
}

/** Tetangga EIGRP (adjacency berbasis segmen fisik + ASN cocok). */
export interface EigrpNeighborView {
  neighborId: string;
  iface: string;
  ip: string;
  asn?: number;
}

/** Baris tabel topologi DUAL: successor + feasible successor + FD/RD. */
export interface EigrpTopologyEntry {
  dst: string;
  /** Successor (next-hop terbaik); null = rute dalam state active (query). */
  successor: string | null;
  /** Feasible successor: tetangga dengan RD < FD (kandidat backup). */
  feasibleSuccessors: string[];
  /** Feasible distance: metric terbaik via successor. */
  fd: number;
  /** Reported distance dari successor. */
  rd: number;
  /** passive = konvergen; active = menunggu update (tanpa successor). */
  state: 'passive' | 'active';
}

/** Round protokol tempat fase transisi ke Full/Established tercapai. */
const OSPF_FULL_ROUND = 6;
const BGP_ESTABLISHED_ROUND = 5;
const MAX_CONVERGE_ROUNDS = 12;

function ospfPhaseFor(rounds: number): OspfPhase {
  if (rounds <= 1) return 'Init';
  if (rounds === 2) return '2-Way';
  if (rounds === 3) return 'ExStart';
  if (rounds === 4) return 'Exchange';
  if (rounds === 5) return 'Loading';
  return 'Full';
}

function bgpFsmFor(rounds: number): BgpFsmState {
  if (rounds <= 0) return 'Idle';
  if (rounds === 1) return 'Connect';
  if (rounds === 2) return 'Active';
  if (rounds === 3) return 'OpenSent';
  if (rounds === 4) return 'OpenConfirm';
  return 'Established';
}

function hasOspf(dev: NetworkDevice): boolean {
  return !!dev.routingCfg?.ospf?.enabled;
}

/** Router-ID: nilai konfigurasi menang; selain itu IP interface pertama. */
function routerIdOf(dev: NetworkDevice): string {
  return dev.routingCfg?.ospf?.routerId || dev.bgpCfg?.routerId || dev.getIpAddress() || dev.id;
}

function ifaceNameOf(dev: NetworkDevice, port: string): string {
  return dev.getIfaceByPortId(port)?.name || dev.getIfaceByName(port)?.name || port;
}

export class RoutingProtocolEngine {
  /** Ses-session OSPF persisten, kunci `${devId}|${peerRouterId}`. */
  private ospfSessions = new Map<string, OspfSession>();
  /** Session BGP persisten, kunci `${devId}|${peerAddr}`. */
  private bgpSessions = new Map<string, BgpSession>();
  /** Hasil komputasi terakhir per perangkat. */
  private ospfViews = new Map<string, OspfNeighborView[]>();
  private bgpViews = new Map<string, BgpPeerView[]>();
  private ospfLsdb = new Map<string, OspfLsa[]>();
  private bgpRib = new Map<string, BgpRibEntry[]>();

  // ── Akses hasil (dipakai NetworkSimulator.getters / CLI) ──────────
  getOspfNeighbors(nodeId: string): OspfNeighborView[] {
    return this.ospfViews.get(nodeId) || [];
  }

  getBgpPeerViews(nodeId: string): BgpPeerView[] {
    return this.bgpViews.get(nodeId) || [];
  }

  getOspfLsdb(nodeId: string): OspfLsa[] {
    return this.ospfLsdb.get(nodeId) || [];
  }

  getBgpRib(nodeId: string): BgpRibEntry[] {
    return this.bgpRib.get(nodeId) || [];
  }

  /**
   * Hitung ulang rute protokol.
   * @param rounds 0 = konvergen (jalankan round sampai stabil — perilaku
   *   default lama), n>0 = tepat n protocol round (untuk observasi transisi
   *   state machine: Init → 2-Way → ... → Full).
   */
  compute(devices: NetworkDevice[], links: LinkTable, rounds = 0): void {
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

    // Rute OSPF/RIP di-refresh DI DALAM loop round: bgpRound memakai
    // ipReachable yang mengikuti tabel routing otoritatif, sehingga peer
    // trans-it (mis. iBGP multi-hop lewat IGP) harus melihat rute IGP yang
    // baru terbentuk pada round yang sama — bukan menunggu compute berikutnya.
    const refreshIgp = () => {
      this.computeOspfRoutes(alive, links, segments);
      this.computeRipEigrpRoutes(alive, links, segments);
      this.computeEigrpRoutes(alive, links, segments);
    };
    if (rounds > 0) {
      for (let i = 0; i < rounds; i++) {
        this.ospfRound(alive, links, segments);
        refreshIgp();
        this.bgpRound(alive, links, segments);
      }
    } else {
      let guard = 0;
      let changed = true;
      while (changed && guard < MAX_CONVERGE_ROUNDS) {
        const a = this.ospfRound(alive, links, segments);
        refreshIgp();
        const b = this.bgpRound(alive, links, segments);
        changed = a || b;
        guard++;
      }
    }

    // Rute: OSPF via LSDB+SPF, RIP/EIGRP via flooding, BGP via RIB.
    this.computeBgpRoutes(alive, links, segments);
  }

  // ── OSPF ──────────────────────────────────────────────────────────

  /** Satu protocol round OSPF: majukan FSM adjacency satu fase. Return true bila ada state berubah. */
  private ospfRound(devices: NetworkDevice[], links: LinkTable, segments: Map<string, string>): boolean {
    const ospfRouters = devices.filter(hasOspf);
    const powered = new Set(devices.filter((d) => d.powered).map((d) => d.id));

    // Peta iface OSPF per device: segmen → { iface, area, ip, passive }.
    // Ikut serta bila network statement mencakup subnet interface.
    const part = new Map<string, Map<string, { iface: string; area: number; ip: string; passive: boolean }>>();
    for (const dev of ospfRouters) {
      const bySeg = new Map<string, { iface: string; area: number; ip: string; passive: boolean }>();
      for (const iface of dev.getInterfaces()) {
        if (!iface.ip || !iface.up) continue;
        const seg = segments.get(`${dev.id}:${iface.portId}`);
        if (!seg) continue;
        if (!this.ospfParticipates(dev, iface)) continue;
        bySeg.set(seg, {
          iface: iface.name,
          area: this.ospfAreaOf(dev, iface),
          ip: iface.ip.address,
          passive: (dev.routingCfg?.ospf?.passiveInterfaces || []).includes(iface.name),
        });
      }
      part.set(dev.id, bySeg);
    }

    // Prune session untuk perangkat yang tidak lagi OSPF / mati.
    const liveIds = new Set(ospfRouters.map((d) => d.id));
    for (const key of [...this.ospfSessions.keys()]) {
      const devId = key.split('|')[0];
      const s = this.ospfSessions.get(key)!;
      if (!liveIds.has(devId) || !powered.has(devId) || !powered.has(s.peerDevId)) {
        this.ospfSessions.delete(key);
      }
    }

    let changed = false;

    // Tentukan adjacency per pasangan yang berbagi segmen fisik.
    const seenPairs = new Set<string>();
    for (const link of links.all) {
      const a = devices.find((d) => d.id === link.a.nodeId);
      const b = devices.find((d) => d.id === link.b.nodeId);
      if (!a || !b || a.isSwitch || b.isSwitch) continue;
      if (!hasOspf(a) || !hasOspf(b)) continue;
      const aIface = ifaceNameOf(a, link.a.port);
      const bIface = ifaceNameOf(b, link.b.port);
      const aPassive = (a.routingCfg?.ospf?.passiveInterfaces || []).includes(aIface);
      const bPassive = (b.routingCfg?.ospf?.passiveInterfaces || []).includes(bIface);
      // passive di salah satu sisi → tidak ada adjacency sama sekali
      // (konsisten dengan perilaku lama: tidak muncul di neighbor list).
      if (aPassive || bPassive) continue;
      if (!powered.has(a.id) || !powered.has(b.id)) continue;
      const peerA = b.getIpAddress();
      if (!peerA || !a.getIpAddress()) continue;

      for (const [me, peer] of [
        [a, b],
        [b, a],
      ] as const) {
        const pairKey = `${me.id}|${routerIdOf(peer)}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);
        const sessionKey = pairKey;

        const mySeg = segments.get(`${me.id}:${link.a.nodeId === me.id ? link.a.port : link.b.port}`);
        const peerSeg = segments.get(`${peer.id}:${link.a.nodeId === peer.id ? link.a.port : link.b.port}`);
        if (!mySeg || !peerSeg || mySeg !== peerSeg) continue;

        const myInfo = part.get(me.id)?.get(mySeg);
        const peerInfo = part.get(peer.id)?.get(peerSeg);
        const linkUp = !link.down;

        // Kompatibilitas adjacency (seluruh kondisi harus terpenuhi):
        // network statement kedua sisi mencakup segmen, area sama, link up.
        const compatible = !!myInfo && !!peerInfo && myInfo.area === peerInfo.area && linkUp;
        if (!compatible) {
          if (this.ospfSessions.delete(sessionKey)) changed = true;
          continue;
        }

        let s = this.ospfSessions.get(sessionKey);
        if (!s) {
          s = {
            peerDevId: peer.id,
            peerRouterId: routerIdOf(peer),
            myIface: myInfo.iface,
            peerIface: peerInfo.iface,
            myIp: myInfo.ip,
            peerIp: peerInfo.ip,
            area: myInfo.area,
            rounds: 0,
            state: 'Init',
          };
          this.ospfSessions.set(sessionKey, s);
          changed = true;
        }
        s.rounds++;
        // Timer sehat: dead interval WAJIB lebih besar dari hello interval
        // (kalau tidak, peer "mati" sebelum hello berikutnya → adjacency
        // macet di 2-Way, tidak pernah Full).
        const timersOk =
          (me.routingCfg?.ospf?.deadInterval ?? 40000) > (me.routingCfg?.ospf?.helloInterval ?? 10000) &&
          (peer.routingCfg?.ospf?.deadInterval ?? 40000) > (peer.routingCfg?.ospf?.helloInterval ?? 10000);
        const phase = ospfPhaseFor(s.rounds);
        const next = !timersOk && (phase === 'ExStart' || phase === 'Exchange' || phase === 'Loading' || phase === 'Full') ? '2-Way' : phase;
        if (next !== s.state) {
          s.state = next;
          changed = true;
        }
        this.ospfSessions.set(sessionKey, s);
      }
    }

    // Adjacency lintas switch: router-router yang berbagi segmen cloud
    // (topologi R1–SW–R2) membentuk adjacency multi-access seperti OSPF di
    // jaringan broadcast — setiap pasangan router di segmen yang sama.
    const cloudMembers = new Map<string, { dev: NetworkDevice; info: { iface: string; area: number; ip: string; passive: boolean } }[]>();
    for (const dev of ospfRouters) {
      const bySeg = part.get(dev.id);
      if (!bySeg) continue;
      for (const [seg, info] of bySeg) {
        if (!seg.startsWith('cloud:')) continue;
        let arr = cloudMembers.get(seg) || [];
        arr.push({ dev, info });
        cloudMembers.set(seg, arr);
      }
    }
    for (const [seg, members] of cloudMembers) {
      if (members.length < 2) continue;
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          for (const [me, peer] of [
            [members[i], members[j]],
            [members[j], members[i]],
          ] as const) {
            const pairKey = `${me.dev.id}|${routerIdOf(peer.dev)}`;
            if (seenPairs.has(pairKey)) continue;
            seenPairs.add(pairKey);
            const sessionKey = pairKey;
            if (me.info.passive || peer.info.passive) {
              if (this.ospfSessions.delete(sessionKey)) changed = true;
              continue;
            }
            const compatible = me.info.area === peer.info.area;
            if (!compatible) {
              if (this.ospfSessions.delete(sessionKey)) changed = true;
              continue;
            }
            let s = this.ospfSessions.get(sessionKey);
            if (!s) {
              s = {
                peerDevId: peer.dev.id,
                peerRouterId: routerIdOf(peer.dev),
                myIface: me.info.iface,
                peerIface: peer.info.iface,
                myIp: me.info.ip,
                peerIp: peer.info.ip,
                area: me.info.area,
                rounds: 0,
                state: 'Init',
              };
              this.ospfSessions.set(sessionKey, s);
              changed = true;
            }
            s.rounds++;
            const timersOk =
              (me.dev.routingCfg?.ospf?.deadInterval ?? 40000) > (me.dev.routingCfg?.ospf?.helloInterval ?? 10000) &&
              (peer.dev.routingCfg?.ospf?.deadInterval ?? 40000) > (peer.dev.routingCfg?.ospf?.helloInterval ?? 10000);
            const phase = ospfPhaseFor(s.rounds);
            const next = !timersOk && (phase === 'ExStart' || phase === 'Exchange' || phase === 'Loading' || phase === 'Full') ? '2-Way' : phase;
            if (next !== s.state) {
              s.state = next;
              changed = true;
            }
            this.ospfSessions.set(sessionKey, s);
          }
        }
      }
    }

    // Hapus session yang tidak lagi valid (link hilang / pasangan tak lagi di
    // topologi) — dijalankan SETELAH semua pasangan (p2p + cloud) dicatat di
    // seenPairs, agar session cloud tidak dihapus lalu dibuat ulang tiap round.
    for (const key of [...this.ospfSessions.keys()]) {
      if (!seenPairs.has(key)) this.ospfSessions.delete(key);
    }

    // Bangun view neighbor per perangkat (termasuk yang gagal → state Down).
    this.buildOspfViews(devices, links, segments, part);
    return changed;
  }

  private buildOspfViews(
    devices: NetworkDevice[],
    links: LinkTable,
    segments: Map<string, string>,
    part: Map<string, Map<string, { iface: string; area: number; ip: string; passive: boolean }>>
  ): void {
    const ospfRouters = devices.filter(hasOspf);
    const views = new Map<string, OspfNeighborView[]>();
    const powered = new Set(devices.filter((d) => d.powered).map((d) => d.id));

    for (const link of links.all) {
      const a = devices.find((d) => d.id === link.a.nodeId);
      const b = devices.find((d) => d.id === link.b.nodeId);
      if (!a || !b || a.isSwitch || b.isSwitch) continue;
      if (!hasOspf(a) || !hasOspf(b)) continue;
      if (!powered.has(a.id) || !powered.has(b.id)) continue;
      const aIface = ifaceNameOf(a, link.a.port);
      const bIface = ifaceNameOf(b, link.b.port);
      const aPassive = (a.routingCfg?.ospf?.passiveInterfaces || []).includes(aIface);
      const bPassive = (b.routingCfg?.ospf?.passiveInterfaces || []).includes(bIface);
      if (aPassive || bPassive) continue;
      if (!a.getIpAddress() || !b.getIpAddress()) continue;
      const aSeg = segments.get(`${a.id}:${link.a.port}`);
      const bSeg = segments.get(`${b.id}:${link.b.port}`);
      if (!aSeg || !bSeg || aSeg !== bSeg) continue;

      for (const [me, peer, mePort, peerPort] of [
        [a, b, link.a.port, link.b.port],
        [b, a, link.b.port, link.a.port],
      ] as const) {
        const key = `${me.id}|${routerIdOf(peer)}`;
        const session = this.ospfSessions.get(key);
        const peerIface = peer.getIfaceByPortId(peerPort) || peer.getIfaceByName(peerPort);
        const peerIp = peerIface?.ip?.address || peer.getIpAddress() || '';
        const list = views.get(me.id) || [];
        list.push({
          routerId: routerIdOf(peer),
          ip: peerIp,
          iface: ifaceNameOf(me, mePort),
          state: session && session.state === 'Full' ? 'Full' : session ? session.state : 'Down',
        });
        views.set(me.id, list);
      }
    }
    // Pastikan setiap router OSPF punya entri (kosong bila tidak ada tetangga).
    for (const dev of ospfRouters) {
      if (!views.has(dev.id)) views.set(dev.id, []);
    }

    // View lintas switch: pasangan router pada segmen cloud yang sama
    // (status dari session; tanpa session → Down).
    for (const dev of ospfRouters) {
      const bySeg = part.get(dev.id);
      if (!bySeg) continue;
      for (const [seg, myInfo] of bySeg) {
        if (!seg.startsWith('cloud:') || myInfo.passive) continue;
        for (const other of ospfRouters) {
          if (other.id === dev.id) continue;
          const otherInfo = part.get(other.id)?.get(seg);
          if (!otherInfo || otherInfo.passive) continue;
          const key = `${dev.id}|${routerIdOf(other)}`;
          const session = this.ospfSessions.get(key);
          const list = views.get(dev.id) || [];
          list.push({
            routerId: routerIdOf(other),
            ip: otherInfo.ip,
            iface: myInfo.iface,
            state: session && session.state === 'Full' ? 'Full' : session ? session.state : 'Down',
          });
          views.set(dev.id, list);
        }
      }
    }
    this.ospfViews = views;
  }

  /** Rute OSPF via LSDB → SPF Dijkstra → install ke tabel routing otoritatif. */
  private computeOspfRoutes(devices: NetworkDevice[], links: LinkTable, segments: Map<string, string>): void {
    const ospfRouters = devices.filter(hasOspf);
    const byId = new Map(devices.map((d) => [d.id, d]));
    const ridToDev = new Map<string, NetworkDevice>();
    for (const dev of ospfRouters) ridToDev.set(routerIdOf(dev), dev);

    // ── LSDB: Router-LSA per perangkat ──
    const lsdb = new Map<string, OspfLsa>();
    for (const dev of ospfRouters) {
      const stubs: OspfLsaStub[] = [];
      for (const iface of dev.getInterfaces()) {
        if (!iface.ip || !iface.up) continue;
        if (!this.ospfParticipates(dev, iface)) continue;
        const net = `${intToIp(networkOf(iface.ip.address, iface.ip.prefix))}/${iface.ip.prefix}`;
        if (!stubs.some((x) => x.network === net)) stubs.push({ network: net, cost: 0 });
      }
      lsdb.set(dev.id, { advertiser: routerIdOf(dev), area: 0, stubs, links: [] });
    }
    // Link adjacency HANYA dari session Full.
    for (const [key, s] of this.ospfSessions) {
      if (s.state !== 'Full') continue;
      const me = byId.get(key.split('|')[0]);
      const peer = ridToDev.get(s.peerRouterId);
      if (!me || !peer) continue;
      const lsa = lsdb.get(me.id);
      if (!lsa) continue;
      lsa.links.push({
        neighbor: s.peerRouterId,
        cost: this.ospfIfaceCost(me, me.getIfaceByName(s.myIface)),
        iface: s.myIface,
      });
      lsdb.set(me.id, lsa);
    }
    this.ospfLsdb = new Map();
    for (const dev of ospfRouters) this.ospfLsdb.set(dev.id, [lsdb.get(dev.id)!]);

    // ── SPF per router root ──
    // Biaya edge (u→v) = cost interface v pada segmen bersama (model biaya
    // advertiser: metric flooding lama = cost sisi pengiklan). Dijkstra
    // memakai biaya masuk ke node tujuan.
    for (const root of ospfRouters) {
      const rootLsa = lsdb.get(root.id)!;
      const rootConnected = new Set<string>();
      for (const iface of root.getInterfaces()) {
        if (!iface.ip) continue;
        rootConnected.add(`${intToIp(networkOf(iface.ip.address, iface.ip.prefix))}/${iface.ip.prefix}`);
      }

      const dist = new Map<string, number>();
      const firstHop = new Map<string, string>(); // nodeId → routerId hop pertama
      const parent = new Map<string, string>();
      const visited = new Set<string>();
      const order = [...lsdb.keys()].sort();
      dist.set(root.id, 0);
      firstHop.set(root.id, '');

      for (;;) {
        let best: string | null = null;
        let bestD = Infinity;
        for (const n of order) {
          if (visited.has(n)) continue;
          const d = dist.get(n);
          if (d !== undefined && d < bestD) {
            bestD = d;
            best = n;
          }
        }
        if (best === null) break;
        visited.add(best);
        const curLsa = lsdb.get(best)!;
        for (const link of curLsa.links) {
          const nb = ridToDev.get(link.neighbor);
          if (!nb) continue;
          const nbId = nb.id;
          if (visited.has(nbId)) continue;
          const nbLsa = lsdb.get(nbId);
          if (!nbLsa) continue;
          // Biaya masuk ke nb = cost interface nb pada segmen dengan best.
          const nbLink = nbLsa.links.find((l) => l.neighbor === routerIdOf(byId.get(best)!));
          const edgeCost = nbLink ? nbLink.cost : 1;
          const nd = bestD + edgeCost;
          if (nd < (dist.get(nbId) ?? Infinity)) {
            dist.set(nbId, nd);
            parent.set(nbId, best);
            firstHop.set(nbId, best === root.id ? link.neighbor : firstHop.get(best)!);
          }
        }
      }

      // Kumpulkan rute stub terbaik per network.
      const bestRoute = new Map<string, { d: number; gateway: string; tie: string }>();
      for (const n of order) {
        if (n === root.id || !dist.has(n) || !parent.has(n)) continue;
        const d = dist.get(n)!;
        const fh = firstHop.get(n)!;
        const fhDev = ridToDev.get(fh);
        if (!fhDev) continue;
        // Gateway = IP interface hop pertama pada segmen bersama root.
        const gw = this.peerIpOnSegmentWith(root, fhDev, segments);
        if (!gw) continue;
        for (const stub of lsdb.get(n)!.stubs) {
          if (rootConnected.has(stub.network)) continue;
          const total = d + stub.cost;
          const cur = bestRoute.get(stub.network);
          if (!cur || total < cur.d || (total === cur.d && fh < cur.tie)) {
            bestRoute.set(stub.network, { d: total, gateway: gw, tie: fh });
          }
        }
      }
      for (const [net, r] of bestRoute) {
        root.addDynamicRoute(net, r.gateway);
      }
    }
  }

  /** IP interface peer pada segmen yang sama dengan root (untuk next-hop). */
  private peerIpOnSegmentWith(root: NetworkDevice, peer: NetworkDevice, segments: Map<string, string>): string | null {
    const rootSegs = new Set<string>();
    for (const iface of root.getInterfaces()) {
      const seg = segments.get(`${root.id}:${iface.portId}`);
      if (seg) rootSegs.add(seg);
    }
    for (const iface of peer.getInterfaces()) {
      const seg = segments.get(`${peer.id}:${iface.portId}`);
      if (seg && rootSegs.has(seg) && iface.ip && iface.up) return iface.ip.address;
    }
    return null;
  }

  /** Interface ikut OSPF bila network statement mencakup subnet-nya. */
  private ospfParticipates(dev: NetworkDevice, iface: { ip?: { address: string; prefix: number }; up: boolean }): boolean {
    if (!iface.ip || !iface.up) return false;
    const nets = (dev.routingCfg?.ospf?.networks || []).map((n) => this.normalizeNetworkEntry(dev, n)).filter((n): n is string => !!n);
    return nets.some((net) => {
      const parsed = parseCidr(net);
      if (!parsed) return false;
      const pa = Math.min(iface.ip!.prefix, parsed.prefix);
      return inSameSubnet(iface.ip!.address, pa, parsed.address);
    });
  }

  /** Area sebuah interface = area dari network statement yang cocok (default 0). */
  private ospfAreaOf(dev: NetworkDevice, iface: { ip?: { address: string; prefix: number } }): number {
    const areas = dev.routingCfg?.ospf?.areas || {};
    const nets = dev.routingCfg?.ospf?.networks || [];
    if (iface.ip) {
      for (const raw of nets) {
        const norm = this.normalizeNetworkEntry(dev, raw);
        if (!norm) continue;
        const parsed = parseCidr(norm);
        if (!parsed) continue;
        const pa = Math.min(iface.ip.prefix, parsed.prefix);
        if (inSameSubnet(iface.ip.address, pa, parsed.address)) {
          const area = areas[raw];
          if (typeof area === 'number') return area;
          const areaNorm = areas[norm];
          if (typeof areaNorm === 'number') return areaNorm;
          return 0;
        }
      }
    }
    return 0;
  }

  // ── BGP ───────────────────────────────────────────────────────────

  /** Satu protocol round BGP: majukan FSM peer satu fase. Return true bila berubah. */
  private bgpRound(devices: NetworkDevice[], links: LinkTable, segments: Map<string, string>): boolean {
    const powered = new Set(devices.filter((d) => d.powered).map((d) => d.id));
    const bgpRouters = devices.filter((d) => d.bgpCfg && d.bgpCfg.asn && d.bgpCfg.peers.length > 0);
    const byIp = new Map<string, NetworkDevice>();
    for (const dev of devices) {
      for (const iface of dev.getInterfaces()) {
        if (iface.ip) byIp.set(iface.ip.address, dev);
      }
    }
    let changed = false;

    for (const dev of bgpRouters) {
      for (const p of dev.bgpCfg!.peers) {
        const key = `${dev.id}|${p.remoteAddr}`;
        const peerDev = byIp.get(p.remoteAddr);
        const peerOk = !!peerDev && !!peerDev.bgpCfg && peerDev.bgpCfg.asn > 0 && powered.has(dev.id) && powered.has(peerDev.id);
        if (!peerOk) {
          if (this.bgpSessions.delete(key)) changed = true;
          continue;
        }
        let s = this.bgpSessions.get(key);
        if (!s) {
          s = { peerDevId: peerDev!.id, rounds: 0, state: 'Idle' };
          this.bgpSessions.set(key, s);
          changed = true;
        }
        if (peerDev!.bgpCfg!.asn !== p.remoteAs) {
          // AS remote tidak cocok → session di Active selamanya (TCP terbuka,
          // open tidak diterima).
          if (s.state !== 'Active') {
            s.state = 'Active';
            changed = true;
          }
          s.rounds = 0;
        } else if (!this.ipReachable(dev, p.remoteAddr, devices, segments)) {
          // Peer tidak terjangkau lewat tabel routing (no-route / egress
          // down / ARP gagal) → tetap di Connect (retry TCP).
          if (s.state !== 'Connect') {
            s.state = 'Connect';
            changed = true;
          }
          s.rounds = 0;
        } else {
          s.rounds++;
          const next = bgpFsmFor(s.rounds);
          if (next !== s.state) {
            s.state = next;
            changed = true;
          }
        }
        this.bgpSessions.set(key, s);
      }
    }

    // Prune session untuk peer yang tidak lagi dikonfigurasi.
    const cfgKeys = new Set<string>();
    for (const dev of bgpRouters) {
      for (const p of dev.bgpCfg!.peers) cfgKeys.add(`${dev.id}|${p.remoteAddr}`);
    }
    for (const key of [...this.bgpSessions.keys()]) {
      if (!cfgKeys.has(key)) this.bgpSessions.delete(key);
    }

    // View per perangkat (termasuk peer yang gagal → Idle/Connect/Active).
    const views = new Map<string, BgpPeerView[]>();
    for (const dev of bgpRouters) {
      const list: BgpPeerView[] = [];
      for (const p of dev.bgpCfg!.peers) {
        const s = this.bgpSessions.get(`${dev.id}|${p.remoteAddr}`);
        const peerDev = byIp.get(p.remoteAddr);
        const prefixes = peerDev ? peerDev.getRoutes().filter((r) => r.kind === 'dynamic').length : 0;
        list.push({ remoteAddr: p.remoteAddr, remoteAs: p.remoteAs, state: s ? s.state : 'Idle', prefixes });
      }
      views.set(dev.id, list);
    }
    this.bgpViews = views;
    return changed;
  }

  /**
   * Keterjangkauan IP peer SECARA ROUTING (bukan sekadar ada link fisik):
   * simulasi hop-by-hop lewat tabel routing otoritatif (RoutingTable.lookup)
   * — persis seperti cara paket TCP/179 menemukan jalurnya:
   * 1. lookup(peerIp) → no-route = tidak terjangkau.
   * 2. Egess interface harus up; untuk rute non-connected, resolveEgressIface.
   * 3. Next-hop (= peerIp untuk connected, gateway untuk routed) harus dimiliki
   *    perangkat hidup yang berbagi SEGMEN dengan egress (syarat ARP).
   * 4. Lanjut dari pemilik next-hop sampai target tercapai / max-hop.
   * Interface shutdown menghapus rute connected → sesi BGP putus (Connect),
   * sama seperti TCP yang tidak bisa dibangun di atas interface down.
   */
  private ipReachable(
    src: NetworkDevice,
    dstIp: string,
    devices: NetworkDevice[],
    segments: Map<string, string>
  ): boolean {
    if (src.hasIp(dstIp)) return true;
    const powered = new Set(devices.filter((d) => d.powered).map((d) => d.id));
    if (!powered.has(src.id)) return false;
    const maxHops = 32;
    let cur = src;
    const visited = new Set<string>([src.id]);
    for (let hop = 0; hop < maxHops; hop++) {
      const nh = cur.routing.lookup(dstIp);
      if (!nh) return false;
      const egressName = nh.iface || (nh.gateway ? cur.resolveEgressIface(nh.gateway)?.name || null : null);
      const egress = egressName ? cur.getIfaceByName(egressName) || cur.getIfaceByPortId(egressName) : null;
      if (!egress || !egress.up) return false;
      const nextHopIp = nh.gateway || dstIp;
      const owner = devices.find((d) => d.id !== cur.id && powered.has(d.id) && d.hasIp(nextHopIp));
      if (!owner) return false;
      const ownerIface =
        owner.getInterfaces().find((i) => i.up && i.ip?.address === nextHopIp) ||
        (owner.virtualIps.includes(nextHopIp) ? owner.getInterfaces().find((i) => i.up) : null);
      const mySeg = segments.get(`${cur.id}:${egress.portId}`);
      const ownerSeg = ownerIface ? segments.get(`${owner.id}:${ownerIface.portId}`) : null;
      if (!mySeg || !ownerSeg || mySeg !== ownerSeg) return false;
      if (owner.hasIp(dstIp)) return true;
      if (visited.has(owner.id)) return false;
      visited.add(owner.id);
      cur = owner;
    }
    return false;
  }

  /** Pertukaran prefix via session Established + best-path selection → install. */
  private computeBgpRoutes(devices: NetworkDevice[], links: LinkTable, segments: Map<string, string>): void {
    const bgpRouters = devices.filter((d) => d.bgpCfg && d.bgpCfg.asn && d.bgpCfg.peers.length > 0);
    const byIp = new Map<string, NetworkDevice>();
    for (const dev of devices) {
      for (const iface of dev.getInterfaces()) {
        if (iface.ip) byIp.set(iface.ip.address, dev);
      }
    }

    // Loc-RIB awal: rute lokal (subnet interface + network statement).
    const rib = new Map<string, Map<string, BgpRibEntry>>();
    for (const dev of bgpRouters) {
      const entries = new Map<string, BgpRibEntry>();
      for (const iface of dev.getInterfaces()) {
        if (!iface.ip || !iface.up) continue;
        const dst = `${intToIp(networkOf(iface.ip.address, iface.ip.prefix))}/${iface.ip.prefix}`;
        const inNetworks = (dev.bgpCfg!.networks || []).some((n) => {
          const norm = this.normalizeNetworkEntry(dev, n);
          return norm === dst;
        });
        entries.set(dst, {
          dst, gateway: '', asPath: [], localPref: 100,
          origin: inNetworks ? 'i' : '?', ebgp: false, advertiserRid: routerIdOf(dev), local: true, viaIbgp: false,
        });
      }
      for (const n of dev.bgpCfg!.networks || []) {
        const norm = this.normalizeNetworkEntry(dev, n);
        if (norm && !entries.has(norm)) {
          entries.set(norm, {
            dst: norm, gateway: '', asPath: [], localPref: 100,
            origin: 'i', ebgp: false, advertiserRid: routerIdOf(dev), local: true, viaIbgp: false,
          });
        }
      }
      rib.set(dev.id, entries);
    }

    // Propagasi via session Established saja — dengan loop prevention &
    // best-path selection deterministik.
    for (let round = 0; round < bgpRouters.length; round++) {
      let changed = false;
      for (const dev of bgpRouters) {
        const myEntries = rib.get(dev.id);
        if (!myEntries) continue;
        const myAsn = dev.bgpCfg!.asn;
        for (const p of dev.bgpCfg!.peers) {
          const s = this.bgpSessions.get(`${dev.id}|${p.remoteAddr}`);
          if (!s || s.state !== 'Established') continue;
          const peerDev = byIp.get(p.remoteAddr);
          if (!peerDev || !peerDev.bgpCfg) continue;
          const sameAs = peerDev.bgpCfg.asn === myAsn;
          // LOCAL_PREF ditentukan oleh PENERIMA (peerDev): preferensi rute
          // yang dipelajari dari session ini (bukan pengiklan).
          const recvPeerCfg = (peerDev.bgpCfg.peers || []).find((pp) => byIp.get(pp.remoteAddr)?.id === dev.id);
          const recvPref = recvPeerCfg?.localPref ?? 100;
          const nextHop = this.egressIpToward(dev, p.remoteAddr, devices, segments) || dev.getIpAddress();
          if (!nextHop) continue;
          const peerRib = rib.get(peerDev.id);
          if (!peerRib) continue;
          for (const e of myEntries.values()) {
            // Loop prevention: jangan iklankan kembali ke AS yang sudah ada
            // di AS-path (prefix asal AS ini tidak akan kembali ke sini).
            if (e.asPath.includes(peerDev.bgpCfg.asn)) continue;
            // iBGP non-transit: rute yang dipelajari dari session iBGP tidak
            // diiklankan ke peer iBGP lain (rute lokal & eBGP boleh transit iBGP).
            if (sameAs && e.viaIbgp) continue;
            const cand: BgpRibEntry = {
              dst: e.dst,
              gateway: nextHop,
              asPath: sameAs ? [...e.asPath] : [myAsn, ...e.asPath],
              localPref: recvPref,
              origin: e.origin,
              ebgp: !sameAs,
              advertiserRid: routerIdOf(dev),
              local: false,
              viaIbgp: sameAs,
            };
            const cur = peerRib.get(e.dst);
            if (!cur) {
              peerRib.set(e.dst, cand);
              changed = true;
            } else if (!cur.local && this.betterBgp(cand, cur)) {
              peerRib.set(e.dst, cand);
              changed = true;
            }
          }
        }
      }
      if (!changed) break;
    }

    this.bgpRib = new Map();
    for (const [devId, entries] of rib) {
      const dev = devices.find((d) => d.id === devId);
      if (!dev) continue;
      this.bgpRib.set(devId, [...entries.values()]);
      for (const e of entries.values()) {
        if (e.local || !e.gateway) continue;
        dev.addDynamicRoute(e.dst, e.gateway);
      }
    }
  }

  /**
   * Best-path BGP deterministik:
   * LOCAL_PREF tinggi menang → AS-path pendek menang → eBGP > iBGP →
   * ORIGIN ('i' < 'e' < '?') → router-id advertiser terkecil (tie-break).
   * MED tidak dimodelkan (tidak ada jalur konfigurasi) — tidak diklaim.
   */
  private betterBgp(a: BgpRibEntry, b: BgpRibEntry): boolean {
    if (a.localPref !== b.localPref) return a.localPref > b.localPref;
    if (a.asPath.length !== b.asPath.length) return a.asPath.length < b.asPath.length;
    if (a.ebgp !== b.ebgp) return a.ebgp;
    const oi = (o: string) => (o === 'i' ? 0 : o === 'e' ? 1 : 2);
    if (oi(a.origin) !== oi(b.origin)) return oi(a.origin) < oi(b.origin);
    if (a.advertiserRid !== b.advertiserRid) return a.advertiserRid < b.advertiserRid;
    return false; // stabil: rute yang ada dipertahankan
  }

  // ── RIP/EIGRP (distance-vector flooding, perilaku lama) ────────────

  private computeRipEigrpRoutes(devices: NetworkDevice[], links: LinkTable, segments: Map<string, string>): void {
    const l3 = devices.filter((d) => !d.isSwitch);
    const protoOf = (dev: NetworkDevice): 'rip' | 'eigrp' | null =>
      dev.routingCfg?.rip?.enabled ? 'rip' : dev.routingCfg?.eigrp?.enabled ? 'eigrp' : null;

    // EIGRP kini ditangani DUAL sendiri (metric komposit), RIP tetap hop-count.
    const ripOnly = (dev: NetworkDevice): boolean => protoOf(dev) === 'rip';

    const tables = new Map<string, TableEntry[]>();
    for (const dev of l3) {
      if (!ripOnly(dev)) continue;
      const nets = (dev.routingCfg.rip?.networks || []).map((n) => this.normalizeNetworkEntry(dev, n)).filter((n): n is string => !!n);
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
        const proto = protoOf(dev);
        if (!proto) continue;
        const myKeys = new Set<string>();
        for (const link of links.linksOf(dev.id)) {
          const myPort = link.a.nodeId === dev.id ? link.a.port : link.b.port;
          myKeys.add(segments.get(`${dev.id}:${myPort}`) || `ptp:${link.id}`);
        }
        for (const key of myKeys) {
          const myIp = this.ipOnSegment(dev, key, segments, links);
          if (!myIp) continue;
          for (const other of l3) {
            if (other.id === dev.id) continue;
            if (protoOf(other) !== proto) continue;
            const otherIp = this.ipOnSegment(other, key, segments, links);
            if (!otherIp) continue;
            for (const e of myEntries) {
              candidates.push({ peerId: other.id, dst: e.dst, gateway: myIp, metric: e.metric + 1 });
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
        const originProto = protoOf(peer);
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

  // ── EIGRP (educational DUAL subset) ─────────────────────────────
  // Metric komposit K1/K3 (default): metric = 256 * (10^7 / BW_kbps + delay_unit)
  // dengan delay per-hop = 1 unit (10µs). Successor = tetangga dengan
  // feasible distance terkecil; feasible successor = tetangga lain dengan
  // reported distance (RD) < FD (feasibility condition). State passive =
  // konvergen; active = query (tidak ada successor, menunggu update).

  /** Tetangga EIGRP terakhir per perangkat (view observasi). */
  private eigrpNeighbors = new Map<string, EigrpNeighborView[]>();
  /** Tabel topologi DUAL terakhir per perangkat (view observasi). */
  private eigrpTopology = new Map<string, EigrpTopologyEntry[]>();

  getEigrpNeighbors(nodeId: string): EigrpNeighborView[] {
    return this.eigrpNeighbors.get(nodeId) || [];
  }

  getEigrpTopology(nodeId: string): EigrpTopologyEntry[] {
    return this.eigrpTopology.get(nodeId) || [];
  }

  /** Biaya link EIGRP dari interface (BW + delay tetap 1 unit). */
  private eigrpLinkCost(iface: { speedMbps?: number }): number {
    const bwKbps = Math.max((iface.speedMbps || 100) * 1000, 1);
    return 256 * (Math.floor(10_000_000 / bwKbps) + 1);
  }

  private computeEigrpRoutes(devices: NetworkDevice[], links: LinkTable, segments: Map<string, string>): void {
    const l3 = devices.filter((d) => !d.isSwitch && d.powered);
    const eigrpDevs = l3.filter((d) => d.routingCfg?.eigrp?.enabled);
    const asnOf = (dev: NetworkDevice): number | null => dev.routingCfg?.eigrp?.asn ?? null;

    const dist = new Map<string, Map<string, number>>(); // devId → dst → metric
    const via = new Map<string, Map<string, string>>(); // devId → dst → gateway
    const neighbors = new Map<string, EigrpNeighborView[]>();

    // Seed: subnet lokal yang ikut network statement.
    for (const dev of eigrpDevs) {
      const nets = (dev.routingCfg?.eigrp?.networks || []).map((n) => this.normalizeNetworkEntry(dev, n)).filter((n): n is string => !!n);
      const mine = new Map<string, number>();
      for (const iface of dev.getInterfaces()) {
        if (!iface.ip || !iface.up) continue;
        const subnet = `${intToIp(networkOf(iface.ip.address, iface.ip.prefix))}/${iface.ip.prefix}`;
        const parsed = nets.map((net) => parseCidr(net)).filter((c): c is NonNullable<typeof c> => !!c);
        const participates = parsed.some((c) => {
          const pa = Math.min(iface.ip.prefix, c.prefix);
          return inSameSubnet(iface.ip.address, pa, c.address);
        });
        if (participates) mine.set(subnet, 0);
      }
      dist.set(dev.id, mine);
      via.set(dev.id, new Map());
    }

    // Deteksi adjacency: berbagi segmen fisik + ASN cocok (bila keduanya set).
    for (const link of links.all) {
      const a = devices.find((d) => d.id === link.a.nodeId);
      const b = devices.find((d) => d.id === link.b.nodeId);
      if (!a || !b || a.isSwitch || b.isSwitch) continue;
      if (!eigrpDevs.includes(a) || !eigrpDevs.includes(b)) continue;
      const aAsn = asnOf(a);
      const bAsn = asnOf(b);
      if (aAsn != null && bAsn != null && aAsn !== bAsn) continue;
      const aIface = ifaceNameOf(a, link.a.port);
      const bIface = ifaceNameOf(b, link.b.port);
      const aIp = this.ipOnSegment(a, segments.get(`${a.id}:${link.a.port}`) || `ptp:${link.id}`, segments, links);
      const bIp = this.ipOnSegment(b, segments.get(`${b.id}:${link.b.port}`) || `ptp:${link.id}`, segments, links);
      if (!aIp || !bIp) continue;
      const nbA = neighbors.get(a.id) || [];
      if (!nbA.some((n) => n.neighborId === b.id)) {
        nbA.push({ neighborId: b.id, iface: aIface, ip: bIp, asn: bAsn ?? undefined });
        neighbors.set(a.id, nbA);
      }
      const nbB = neighbors.get(b.id) || [];
      if (!nbB.some((n) => n.neighborId === a.id)) {
        nbB.push({ neighborId: a.id, iface: bIface, ip: aIp, asn: aAsn ?? undefined });
        neighbors.set(b.id, nbB);
      }
    }

    // DUAL: iterate advertised distance antar-tetangga sampai stabil.
    // RD (reported distance) dari tetangga n ke dst = dist(n, dst) — jarak
    // yang diiklankan n; FD (feasible distance) = min(RD + biaya link ke n).
    for (let round = 0; round < l3.length; round++) {
      let changed = false;
      for (const dev of eigrpDevs) {
        const nb = neighbors.get(dev.id) || [];
        const myDist = dist.get(dev.id)!;
        const myVia = via.get(dev.id)!;
        for (const n of nb) {
          const peer = devices.find((d) => d.id === n.neighborId);
          if (!peer) continue;
          const peerDist = dist.get(peer.id);
          if (!peerDist) continue;
          const devIface = dev.getIfaceByName(n.iface) || dev.getInterfaces().find((i) => i.name === n.iface);
          const cost = this.eigrpLinkCost(devIface || {});
          for (const [dst, reported] of peerDist) {
            if (this.isOwnSubnet(dev, dst)) continue;
            const candidate = reported + cost;
            if ((myDist.get(dst) ?? Infinity) > candidate) {
              myDist.set(dst, candidate);
              myVia.set(dst, peer.id);
              changed = true;
            }
          }
        }
      }
      if (!changed) break;
    }

    // Prune rute yang successor-nya hilang (link putus / perangkat mati):
    // rute tidak boleh menempel via tetangga yang tidak lagi adjacency.
    for (const dev of eigrpDevs) {
      const nbIds = new Set((neighbors.get(dev.id) || []).map((n) => n.neighborId));
      const myVia = via.get(dev.id)!;
      for (const [dst, gw] of [...myVia.entries()]) {
        if (!nbIds.has(gw)) {
          myVia.delete(dst);
          dist.get(dev.id)!.delete(dst);
        }
      }
    }

    // Topology table + pemasangan rute successor.
    const topology = new Map<string, EigrpTopologyEntry[]>();
    for (const dev of eigrpDevs) {
      const myDist = dist.get(dev.id)!;
      const myVia = via.get(dev.id)!;
      const nb = neighbors.get(dev.id) || [];
      const entries: EigrpTopologyEntry[] = [];
      for (const [dst, fd] of myDist) {
        if (fd === 0) continue; // connected, bukan hasil DUAL
        const succ = myVia.get(dst);
        const succNb = nb.find((n) => n.neighborId === succ);
        // RD = reported distance successor (jarak successor ke dst).
        const rdVal = succ ? dist.get(succ)?.get(dst) ?? fd : fd;
        // Feasibility condition: RD < FD → kandidat backup (feasible successor).
        const fs: string[] = [];
        for (const n of nb) {
          if (n.neighborId === succ) continue;
          const r = dist.get(n.neighborId)?.get(dst);
          if (r != null && r < fd) fs.push(n.neighborId);
        }
        entries.push({
          dst,
          successor: succ || null,
          feasibleSuccessors: fs,
          fd,
          rd: rdVal,
          state: succ ? 'passive' : 'active',
        });
        if (succ) {
          // Next-hop = IP tetangga di segmen yang sama (bukan interface milik
          // peer — `n.iface` adalah interface KITA menuju tetangga).
          const succPeer = devices.find((d) => d.id === succ);
          const gw = succNb?.ip || succPeer?.getIpAddress() || null;
          if (gw) dev.addDynamicRoute(dst, gw);
        }
      }
      topology.set(dev.id, entries);
    }

    this.eigrpNeighbors = neighbors;
    this.eigrpTopology = topology;
  }

  /** True bila `subnet` adalah subnet langsung milik dev (tolak update loop-back). */
  private isOwnSubnet(dev: NetworkDevice, subnet: string): boolean {
    for (const iface of dev.getInterfaces()) {
      if (!iface.ip) continue;
      const own = `${intToIp(networkOf(iface.ip.address, iface.ip.prefix))}/${iface.ip.prefix}`;
      if (own === subnet) return true;
    }
    return false;
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
    const override = (dev.routingCfg.ospf?.interfaceCosts || {})[iface.name];
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

  /**
   * IP lokal `dev` yang tepat untuk dijadikan next-hop menuju `targetIp`
   * (peer BGP):
   * 1. Jika peer di subnet langsung → IP interface pada subnet itu.
   * 2. Jika peer trans-it (mis. iBGP multi-hop) → IP interface pada segmen
   *    pertama jalur ROUTING menuju peer (via RoutingTable.lookup, bukan
   *    BFS fisik — mengikuti pilihan jalur forwarding yang sebenarnya).
   */
  private egressIpToward(
    dev: NetworkDevice,
    targetIp: string,
    devices: NetworkDevice[],
    segments: Map<string, string>
  ): string | null {
    for (const iface of dev.getInterfaces()) {
      if (iface.ip && iface.up && inSameSubnet(iface.ip.address, iface.ip.prefix, targetIp)) return iface.ip.address;
    }
    let cur = dev;
    const visited = new Set<string>([dev.id]);
    for (let hop = 0; hop < 32; hop++) {
      const nh = cur.routing.lookup(targetIp);
      if (!nh) return null;
      const egressName = nh.iface || (nh.gateway ? cur.resolveEgressIface(nh.gateway)?.name || null : null);
      const egress = egressName ? cur.getIfaceByName(egressName) : null;
      if (!egress || !egress.up || !egress.ip) return null;
      if (cur === dev) {
        // Segmen pertama dari pengiklan = next-hop yang diiklankan
        // (IP interface egress itu sendiri).
        return egress.ip.address;
      }
      const nextHopIp = nh.gateway || targetIp;
      const owner = devices.find((d) => d.id !== cur.id && d.powered && d.hasIp(nextHopIp));
      if (!owner) return null;
      if (visited.has(owner.id)) return null;
      visited.add(owner.id);
      cur = owner;
    }
    return null;
  }
}

interface TableEntry {
  dst: string;
  gateway: string;
  metric: number;
}
