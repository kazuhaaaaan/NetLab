// ============================================================
// Nat — sesi translasi NAT (masquerade & dstnat)
// ============================================================

import { Packet } from '../core/types';
import { NatRule } from '../core/types';
import { parseCidr, networkOf } from '../core/ip';

export interface NatSession {
  key: string;
  /** alamat asli yang diterjemahkan */
  original: { ip: string; port: number };
  translated: { ip: string; port: number };
  outInterface: string;
  /** 'masquerade' = PAT (port ephemeral), 'static' = srcnat one-to-one to-addresses. */
  kind: 'masquerade' | 'static';
}

export class NatTranslator {
  private sessions = new Map<string, NatSession>();
  /** session.key → waktu virtual terakhir dipakai (untuk aging). */
  private lastUsed = new Map<string, number>();

  /** Masa hidup sesi NAT (ms waktu virtual) — lebih dari ini di-prune. */
  static readonly SESSION_TTL_MS = 10 * 60 * 1000;

  /** Bersihkan sesi yang sudah tidak dipakai selama SESSION_TTL_MS. */
  prune(now: number): void {
    for (const [key, at] of this.lastUsed) {
      if (now - at > NatTranslator.SESSION_TTL_MS) {
        this.sessions.delete(key);
        this.lastUsed.delete(key);
      }
    }
  }

  /** Cari rule srcnat yang cocok: chain, action, out-interface dan (jika ada)
   *  src-address — paket yang tidak berasal dari subnet rule TIDAK kena NAT
   *  (sesuai perilaku RouterOS). Action valid: 'masquerade' (PAT dinamis) dan
   *  'srcnat' dengan to-addresses (static one-to-one). */
  static srcnatRule(rules: NatRule[], outInterface: string, srcIp: string): NatRule | null {
    for (const r of rules) {
      if (r.chain !== 'srcnat') continue;
      if (r.action !== 'masquerade' && !(r.action === 'srcnat' && r.toAddresses)) continue;
      if (r.outInterface && r.outInterface !== outInterface) continue;
      if (r.srcAddress && !addrInSpec(srcIp, r.srcAddress)) continue;
      return r;
    }
    return null;
  }

  /** Cari rule dstnat untuk (dstIp, dstPort). Rule dengan src-address
   *  hanya berlaku bila srcIp paket berada dalam subnet tsb. */
  static dstnatRule(rules: NatRule[], dstIp: string, dstPort: number, protocol: string, srcIp?: string): NatRule | null {
    for (const r of rules) {
      if (r.chain !== 'dstnat') continue;
      if (!r.toAddresses) continue;
      if (r.protocol && r.protocol !== protocol && r.protocol !== 'any' && r.protocol !== 'ip') continue;
      if (r.dstAddress && !addrInSpec(dstIp, r.dstAddress)) continue;
      if (r.srcAddress && (!srcIp || !addrInSpec(srcIp, r.srcAddress))) continue;
      if (r.dstPort && !portInRange(dstPort, r.dstPort)) continue;
      return r;
    }
    return null;
  }

  static toAddresses(rule: NatRule): string {
    return (rule.toAddresses || '').split(',')[0].trim();
  }

  static toPort(rule: NatRule, originalPort: number): number {
    if (!rule.toPorts) return originalPort;
    const m = rule.toPorts.split('-');
    const lo = parseInt(m[0].trim(), 10);
    return isNaN(lo) ? originalPort : lo;
  }

  /** Catat sesi translasi untuk dipakai membalik trafik reply. */
  record(session: NatSession, now?: number): void {
    this.sessions.set(session.key, session);
    this.lastUsed.set(session.key, now ?? 0);
  }

  lookup(key: string): NatSession | null {
    return this.sessions.get(key) || null;
  }

  forget(key: string): void {
    this.sessions.delete(key);
    this.lastUsed.delete(key);
  }

  /**
   * Terapkan masquerade pada paket keluar: ganti srcIp ke IP interface egress.
   * PAT: bila tuple terjemahan sudah dipakai sesi lain (dua host internal
   * dengan srcPort sama ke tujuan sama), alokasikan port ephemeral baru
   * agar reply tidak tertukar antar klien.
   */
  masquerade(pkt: Packet, egressIp: string, egressIface: string, now?: number): boolean {
    if (pkt.srcIp === egressIp) return false;
    let port = pkt.srcPort;
    let key = natKey(egressIp, port, pkt.dstIp, pkt.dstPort, pkt.protocol);
    const occupied = this.sessions.get(key);
    if (occupied && occupied.original.ip !== pkt.srcIp) {
      // Konflik port → cari port ephemeral bebas (1024..65535).
      const base = (pkt.srcPort || 10000) % 60000;
      let found = false;
      for (let i = 1; i <= 60000; i++) {
        port = 1024 + ((base + i * 53) % 60000);
        key = natKey(egressIp, port, pkt.dstIp, pkt.dstPort, pkt.protocol);
        const occ = this.sessions.get(key);
        if (!occ || (occ.original.ip === pkt.srcIp && occ.original.port === pkt.srcPort)) {
          found = true;
          break;
        }
      }
      if (!found) return false;
    }
    this.record({
      key,
      original: { ip: pkt.srcIp, port: pkt.srcPort },
      translated: { ip: egressIp, port },
      outInterface: egressIface,
      kind: 'masquerade',
    }, now);
    pkt.srcIp = egressIp;
    pkt.srcPort = port;
    return true;
  }

  /**
   * Static one-to-one srcnat: ganti srcIp ke alamat tetap (to-addresses),
   * port TIDAK berubah. Sesi dicatat dengan key yang sama seperti masquerade
   * (hanya ip yang berubah), sehingga trafik balik yang menuju alamat hasil
   * translasi di-balikkan oleh unmasquerade() tanpa penyesuaian tambahan.
   */
  translateStatic(pkt: Packet, toIp: string, outIface: string, now?: number): boolean {
    if (pkt.srcIp === toIp) return false;
    const key = natKey(toIp, pkt.srcPort, pkt.dstIp, pkt.dstPort, pkt.protocol);
    this.record({
      key,
      original: { ip: pkt.srcIp, port: pkt.srcPort },
      translated: { ip: toIp, port: pkt.srcPort },
      outInterface: outIface,
      kind: 'static',
    }, now);
    pkt.srcIp = toIp;
    return true;
  }

  /** Balikkan masquerade untuk trafik yang menuju IP hasil NAT. */
  unmasquerade(pkt: Packet, now?: number): boolean {
    const key = natKeyReverse(pkt);
    const session = this.sessions.get(key);
    if (!session) return false;
    if (now !== undefined) this.lastUsed.set(key, now);
    pkt.dstIp = session.original.ip;
    pkt.dstPort = session.original.port;
    return true;
  }
}

function natKey(srcIp: string, srcPort: number, dstIp: string, dstPort: number, protocol: string): string {
  return `${srcIp}:${srcPort}->${dstIp}:${dstPort}|${protocol}`;
}

function natKeyReverse(pkt: Packet): string {
  return natKey(pkt.dstIp, pkt.dstPort, pkt.srcIp, pkt.srcPort, pkt.protocol);
}

function addrInSpec(ip: string, spec: string): boolean {
  const c = parseCidr(spec);
  if (!c) return false;
  return networkOf(ip, c.prefix) === networkOf(c.address, c.prefix);
}

function portInRange(port: number, spec: string): boolean {
  const m = spec.trim().match(/^(\d+)(?:-(\d+))?$/);
  if (!m) return false;
  const lo = parseInt(m[1], 10);
  const hi = m[2] ? parseInt(m[2], 10) : lo;
  return port >= lo && port <= hi;
}
