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
}

export class NatTranslator {
  private sessions = new Map<string, NatSession>();

  /** Cari rule srcnat masquerade yang cocok untuk interface keluar. */
  static srcnatRule(rules: NatRule[], outInterface: string): NatRule | null {
    for (const r of rules) {
      if (r.chain !== 'srcnat') continue;
      if (r.action !== 'masquerade') continue;
      if (r.outInterface && r.outInterface !== outInterface) continue;
      return r;
    }
    return null;
  }

  /** Cari rule dstnat untuk (dstIp, dstPort). */
  static dstnatRule(rules: NatRule[], dstIp: string, dstPort: number, protocol: string): NatRule | null {
    for (const r of rules) {
      if (r.chain !== 'dstnat') continue;
      if (!r.toAddresses) continue;
      if (r.protocol && r.protocol !== protocol && r.protocol !== 'any' && r.protocol !== 'ip') continue;
      if (r.dstAddress && !addrInSpec(dstIp, r.dstAddress)) continue;
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
  record(session: NatSession): void {
    this.sessions.set(session.key, session);
  }

  lookup(key: string): NatSession | null {
    return this.sessions.get(key) || null;
  }

  forget(key: string): void {
    this.sessions.delete(key);
  }

  /** Terapkan masquerade pada paket keluar: ganti srcIp ke IP interface egress. */
  masquerade(pkt: Packet, egressIp: string, egressIface: string): boolean {
    if (pkt.srcIp === egressIp) return false;
    // Sesi dicatat dengan tuple TERJEMAHAN (src=egressIp) agar reply
    // yang datang ke egressIp bisa dibalik lewat natKeyReverse().
    const key = `${egressIp}:${pkt.srcPort}->${pkt.dstIp}:${pkt.dstPort}|${pkt.protocol}`;
    this.record({
      key,
      original: { ip: pkt.srcIp, port: pkt.srcPort },
      translated: { ip: egressIp, port: pkt.srcPort },
      outInterface: egressIface,
    });
    pkt.srcIp = egressIp;
    return true;
  }

  /** Balikkan masquerade untuk trafik yang menuju IP hasil NAT. */
  unmasquerade(pkt: Packet): boolean {
    const key = natKeyReverse(pkt);
    const session = this.sessions.get(key);
    if (!session) return false;
    pkt.dstIp = session.original.ip;
    pkt.dstPort = session.original.port;
    return true;
  }
}

function natKeyReverse(pkt: Packet): string {
  return `${pkt.dstIp}:${pkt.dstPort}->${pkt.srcIp}:${pkt.srcPort}|${pkt.protocol}`;
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
