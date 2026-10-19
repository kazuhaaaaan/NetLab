// ============================================================
// linkAutoFix — generate config yang benar di KEDUA ujung kabel
// berdasarkan hasil LinkReadiness (tanpa mengarang syntax: hanya
// vendor dengan generator terverifikasi di configTools).
//
// Alur (dipakai App.handleAutoFixEdge):
//   const plan = planLinkAutoFix(sim, dispatcher, edgeId);
//   for (const fix of plan.fixes) → jalankan perintah via runCliCommand
//   → syncNodeToEngine → badge canvas jadi "connected".
// ============================================================

import type { NetworkSimulator } from '../engine/net/core/NetworkSimulator';
import type { VendorDispatcher } from '../../packages/vendors/src/dispatcher/VendorDispatcher';
import { evaluateLinkReadiness } from '../engine/net/core/LinkReadiness';
import { ipCommand, accessVlanCommand, ospfCommand, bgpCommand, normalizeVendor, type ConfigVendor } from '../modules/ai/agent/configTools';
import { inSameSubnet, networkOf, intToIp, ipToInt } from '../engine/net/core/ip';

export interface LinkFixCommand {
  nodeId: string;
  nodeName: string;
  vendor: string;
  commands: string[];
}

export interface LinkFixPlan {
  edgeId: string;
  /** true = tidak perlu perbaikan (sudah connected). */
  alreadyConnected: boolean;
  /** node yang vendornya tidak punya generator → dilaporkan jujur. */
  unsupported: { nodeId: string; nodeName: string; reason: string }[];
  fixes: LinkFixCommand[];
  /** Catatan manusia (mis. masalah fisik tak bisa diperbaiki via config). */
  notes: string[];
}

function vendorOf(sim: NetworkSimulator, nodeId: string): { raw: string; gen: ConfigVendor | null } {
  const dev = sim.getDevice(nodeId);
  const raw = dev?.vendor ?? dev?.deviceType ?? '';
  return { raw, gen: normalizeVendor(raw) };
}

/** Semua IP yang sudah dipakai di lab (untuk menghindari tabrakan saat memilih IP baru). */
function collectUsedIps(sim: NetworkSimulator): Set<string> {
  const used = new Set<string>();
  for (const dev of sim.getDevices()) {
    for (const iface of dev.getInterfaces()) {
      if (iface.ip) used.add(iface.ip.address);
    }
  }
  return used;
}

/** Host berikutnya dalam sebuah subnet yang belum terpakai. */
function nextFreeHost(prefix: number, baseIp: string, used: Set<string>): string {
  const net = networkOf(baseIp, prefix);
  for (let h = 1; h < 1024; h++) {
    const cand = intToIp((net + h) >>> 0);
    if (!used.has(cand)) return cand;
  }
  return intToIp((net + 1) >>> 0);
}

/**
 * Rencana perbaikan config untuk satu edge.
 * - Selaras IP: bila salah satu ujung sudah punya IP di link, ujung lain
 *   diberi IP di subnet yang sama. Bila keduanya punya tapi beda subnet,
 *   ujung B diselaraskan ke subnet ujung A.
 * - OSPF: network statement + area diselaraskan (area default 0).
 * - BGP: remote-as diselaraskan.
 * - VLAN: access VLAN diselaraskan ke nilai ujung A (bila ada).
 */
export function planLinkAutoFix(sim: NetworkSimulator, dispatcher: VendorDispatcher, edgeId: string): LinkFixPlan {
  const r = evaluateLinkReadiness(sim, edgeId);
  const notes: string[] = [];
  const unsupported: LinkFixPlan['unsupported'] = [];
  const fixes: LinkFixCommand[] = [];

  if (r.status === 'connected') {
    return { edgeId, alreadyConnected: true, unsupported, fixes, notes: ['Link sudah siap — tidak ada perbaikan.'] };
  }

  const localIp = r.local.ip ? ipFromCidr(r.local.ip) : null;
  const peerIp = r.peer.ip ? ipFromCidr(r.peer.ip) : null;
  const localGen = vendorOf(sim, r.local.nodeId);
  const peerGen = vendorOf(sim, r.peer.nodeId);
  const used = collectUsedIps(sim);
  const linkSubnet: { base: string; prefix: number } | null = localIp
    ? { base: localIp.address, prefix: localIp.prefix }
    : peerIp
      ? { base: peerIp.address, prefix: peerIp.prefix }
      : null;

  // ── IP / L3 ───────────────────────────────────────────────────────
  const ipMismatch = !r.ipConnected && (localIp || peerIp || r.checks.some((c) => c.id === 'l3-subnet' && c.status !== 'na'));
  if (ipMismatch && r.local.ifaceName && r.peer.ifaceName) {
    // Pilih subnet: pakai yang ada, atau default 192.168.1.0/24 bila kosong.
    let prefix = linkSubnet?.prefix ?? 24;
    let anchor = linkSubnet?.base ?? '192.168.1.1';

    // Tentukan IP final kedua ujung di subnet yang sama.
    const finalLocal = localIp && inSameSubnet(localIp.address, Math.min(localIp.prefix, prefix), anchor) ? localIp.address : nextFreeHost(prefix, anchor, used);
    used.add(finalLocal);
    let finalPeer: string;
    if (peerIp && inSameSubnet(finalLocal, Math.min(prefix, peerIp.prefix), peerIp.address)) {
      finalPeer = peerIp.address;
    } else {
      finalPeer = nextFreeHost(prefix, finalLocal, used);
    }
    used.add(finalPeer);

    // Terapkan hanya ke sisi yang perlu berubah.
    if (!localIp || localIp.address !== finalLocal || localIp.prefix !== prefix) {
      if (localGen.gen) {
        fixes.push({ nodeId: r.local.nodeId, nodeName: r.local.name, vendor: localGen.raw, commands: ipCommand(localGen.gen, r.local.ifaceName, `${finalLocal}/${prefix}`, false) });
      } else {
        unsupported.push({ nodeId: r.local.nodeId, nodeName: r.local.name, reason: `vendor ${localGen.raw} tanpa generator IP` });
      }
    }
    if (!peerIp || peerIp.address !== finalPeer || peerIp.prefix !== prefix) {
      if (peerGen.gen) {
        fixes.push({ nodeId: r.peer.nodeId, nodeName: r.peer.name, vendor: peerGen.raw, commands: ipCommand(peerGen.gen, r.peer.ifaceName, `${finalPeer}/${prefix}`, false) });
      } else {
        unsupported.push({ nodeId: r.peer.nodeId, nodeName: r.peer.name, reason: `vendor ${peerGen.raw} tanpa generator IP` });
      }
    }
    notes.push(`Selaraskan L3: ${r.local.name}=${finalLocal}/${prefix}, ${r.peer.name}=${finalPeer}/${prefix}`);
  }

  if (r.status === 'down') {
    notes.push('Link fisik/administratif down (kabel off, interface shutdown, atau device mati) — perbaiki di panel edge/CLI "no shutdown".');
  }

  // ── OSPF ──────────────────────────────────────────────────────────
  const ospfCheck = r.checks.find((c) => c.id === 'ospf');
  if (ospfCheck && ospfCheck.status === 'fail' && linkSubnet && r.local.ifaceName && r.peer.ifaceName) {
    const area = 0;
    const netCidr = `${intToIp(linkSubnet.base ? networkOf(linkSubnet.base, linkSubnet.prefix) : 0)}/${linkSubnet.prefix}`;
    for (const [side, gen] of [[r.local, localGen] as const, [r.peer, peerGen] as const]) {
      if (gen.gen) {
        const cmds = ospfCommand(gen.gen, netCidr, area);
        if (cmds.length > 0) fixes.push({ nodeId: side.nodeId, nodeName: side.name, vendor: gen.raw, commands: cmds });
        else unsupported.push({ nodeId: side.nodeId, nodeName: side.name, reason: `vendor ${gen.raw} tanpa generator OSPF` });
      } else {
        unsupported.push({ nodeId: side.nodeId, nodeName: side.name, reason: `vendor ${gen.raw} tanpa generator OSPF` });
      }
    }
    notes.push(`Selaraskan OSPF: network ${netCidr} area ${area} di kedua router.`);
  }

  // ── BGP ───────────────────────────────────────────────────────────
  const bgpCheck = r.checks.find((c) => c.id === 'bgp');
  if (bgpCheck && bgpCheck.status === 'fail' && localIp && peerIp) {
    const a = sim.getDevice(r.local.nodeId);
    const b = sim.getDevice(r.peer.nodeId);
    if (a?.bgpCfg && b?.bgpCfg && localGen.gen && peerGen.gen) {
      const aPeer = a.bgpCfg.peers.find((p) => p.remoteAddr === peerIp.address);
      const bPeer = b.bgpCfg.peers.find((p) => p.remoteAddr === localIp.address);
      const cmds: LinkFixCommand[] = [];
      if (!aPeer || aPeer.remoteAs !== b.bgpCfg.asn) {
        cmds.push({ nodeId: r.local.nodeId, nodeName: r.local.name, vendor: localGen.raw, commands: bgpCommand(localGen.gen, a.bgpCfg.asn, peerIp.address, b.bgpCfg.asn) });
      }
      if (!bPeer || bPeer.remoteAs !== a.bgpCfg.asn) {
        cmds.push({ nodeId: r.peer.nodeId, nodeName: r.peer.name, vendor: peerGen.raw, commands: bgpCommand(peerGen.gen, b.bgpCfg.asn, localIp.address, a.bgpCfg.asn) });
      }
      fixes.push(...cmds);
      notes.push('Selaraskan BGP: neighbor + remote-as timbal-balik.');
    } else {
      notes.push('BGP mismatch: belum bisa auto-generate (butuh AS di kedua sisi). Konfigurasikan manual.');
    }
  }

  // ── VLAN / L2 ─────────────────────────────────────────────────────
  const l2Check = r.checks.find((c) => c.id === 'l2-vlan');
  if (l2Check && l2Check.status === 'fail' && r.local.ifaceName && r.peer.ifaceName) {
    const vlan = accessVlanOf(sim, r.local.nodeId, r.local.portId, r.local.ifaceName) ?? accessVlanOf(sim, r.peer.nodeId, r.peer.portId, r.peer.ifaceName) ?? 10;
    for (const [side, gen] of [[r.local, localGen] as const, [r.peer, peerGen] as const]) {
      if (gen.gen) {
        const cmds = accessVlanCommand(gen.gen, side.ifaceName!, vlan);
        if (cmds.length > 0) fixes.push({ nodeId: side.nodeId, nodeName: side.name, vendor: gen.raw, commands: cmds });
        else unsupported.push({ nodeId: side.nodeId, nodeName: side.name, reason: `vendor ${gen.raw} tanpa generator access VLAN` });
      }
    }
    notes.push(`Selaraskan access VLAN ${vlan} di ${r.local.name} & ${r.peer.name}.`);
  }

  return { edgeId, alreadyConnected: false, unsupported, fixes, notes };
}

function ipFromCidr(cidr: string): { address: string; prefix: number } | null {
  const [address, p] = cidr.split('/');
  const prefix = Number(p);
  if (!address || !Number.isFinite(prefix)) return null;
  return { address, prefix };
}

function accessVlanOf(sim: NetworkSimulator, nodeId: string, portId: string, ifaceName: string): number | null {
  const pv = sim.getNodePortVlans(nodeId);
  if (pv.has(ifaceName)) return pv.get(ifaceName)!;
  if (pv.has(portId)) return pv.get(portId)!;
  return null;
}
