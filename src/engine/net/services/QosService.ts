// ============================================================
// QosService — mangle (mark-packet/change-mss) + simple queue
// (token bucket) yang benar-benar diterapkan pada lalu lintas.
// Dipanggil di jalur transmit (NetworkSimulator.transmit).
// ============================================================

import { NetworkDevice } from '../devices/NetworkDevice';
import { Packet } from '../core/types';
import { parseCidr, networkOf } from '../core/ip';

export interface MangleRule {
  chain: string;
  protocol?: string;
  srcAddress?: string;
  dstAddress?: string;
  action?: string;
  newPacketMark?: string;
  packetMark?: string;
  newMss?: string;
}

export interface SimpleQueue {
  name: string;
  target: string;
  maxLimit: string;
}

export interface QosCounter {
  bytes: number;
  packets: number;
  dropped: number;
}

export interface QosState {
  /** queueName → token tersisa (byte) */
  tokens: Map<string, number>;
  /** queueName → tick terakhir refill */
  lastRefill: Map<string, number>;
  counters: Map<string, QosCounter>;
}

export function freshQosState(): QosState {
  return { tokens: new Map(), lastRefill: new Map(), counters: new Map() };
}

/** Parse "10M/10M" | "512k" | "1G" → bit/detik. 0 bila tak terbatas. */
export function parseRate(s: string | undefined): number {
  if (!s) return 0;
  const part = String(s).split('/')[0].trim().toLowerCase();
  if (!part || part === '0') return 0;
  const m = part.match(/^(\d+(?:\.\d+)?)\s*([kmgt]?)(b?)$/);
  if (!m) return 0;
  let rate = parseFloat(m[1]);
  switch (m[2]) {
    case 'k': rate *= 1e3; break;
    case 'm': rate *= 1e6; break;
    case 'g': rate *= 1e9; break;
    case 't': rate *= 1e12; break;
    default: rate *= 1e6; // tanpa satuan → Mbps
  }
  if (m[3] === 'b') rate *= 8; // byte → bit
  return Math.max(0, rate);
}

function addrMatchesPattern(pattern: string | undefined, ip: string): boolean {
  if (!pattern || pattern === 'any' || pattern === '0.0.0.0/0' || pattern === '::/0') return true;
  if (pattern.includes('/')) {
    const c = parseCidr(pattern);
    if (c) return networkOf(ip, c.prefix) === networkOf(c.address, c.prefix);
    return pattern === ip;
  }
  return pattern === ip;
}

/** Terapkan mangle → set mark / ubah MSS. */
export function applyMangle(dev: NetworkDevice, pkt: Packet): void {
  for (const rule of dev.mangleRules) {
    if (rule.protocol && rule.protocol.toLowerCase() !== 'any' && rule.protocol.toLowerCase() !== pkt.protocol) continue;
    if (rule.packetMark && rule.packetMark !== pkt.flags['packetMark']) continue;
    if (!addrMatchesPattern(rule.srcAddress, pkt.srcIp)) continue;
    if (!addrMatchesPattern(rule.dstAddress, pkt.dstIp)) continue;
    const action = (rule.action || 'mark-packet').toLowerCase();
    if (action === 'mark-packet' && rule.newPacketMark) {
      pkt.flags['packetMark'] = rule.newPacketMark;
    } else if (action === 'change-mss') {
      const mss = parseInt(String(rule.newMss || '1360'), 10);
      if (pkt.protocol === 'tcp' && pkt.size > mss + 40) pkt.size = mss + 40;
    }
  }
}

function queueTargetMatches(target: string, pkt: Packet): boolean {
  const t = String(target || '');
  if (t.startsWith('packet-mark=')) return pkt.flags['packetMark'] === t.slice('packet-mark='.length);
  if (!t || t === '0.0.0.0/0' || t === 'any' || t === 'all') return true;
  if (addrMatchesPattern(t, pkt.dstIp)) return true;
  if (addrMatchesPattern(t, pkt.srcIp)) return true;
  return false;
}

/**
 * Evaluasi simple queue pada paket egress. Mengembalikan false bila
 * paket DIBUANG (token bucket habis). Pertama cocokkan mangle mark.
 */
export function applyQos(dev: NetworkDevice, pkt: Packet, now: number): boolean {
  if (!dev.queues || dev.queues.length === 0) return true;
  for (const q of dev.queues) {
    const rate = parseRate(q.maxLimit);
    if (rate <= 0) continue; // 0 = tanpa batas
    if (!queueTargetMatches(q.target, pkt)) continue;

    const st = dev.qosState;
    const key = q.name || 'q';
    const burst = Math.max(rate / 500, 1); // token awal & burst (byte) = 2 detik rate
    let tokens = st.tokens.get(key) ?? burst;
    const last = st.lastRefill.get(key) ?? now;
    const elapsed = Math.max(0, now - last);
    // refill rate/8 byte per detik (rate dalam bit/detik)
    tokens = Math.min(burst, tokens + (rate / 8) * (elapsed / 1000));
    st.lastRefill.set(key, now);

    const counter = st.counters.get(key) || { bytes: 0, packets: 0, dropped: 0 };
    if (tokens >= pkt.size) {
      tokens -= pkt.size;
      counter.bytes += pkt.size;
      counter.packets += 1;
      st.tokens.set(key, tokens);
      st.counters.set(key, counter);
      return true;
    }
    counter.dropped += 1;
    st.counters.set(key, counter);
    return false;
  }
  return true;
}

/** Statistik live per queue (provider `/queue simple print`). */
export function qosStatsOf(dev: NetworkDevice): { name: string; bytes: number; packets: number; dropped: number }[] {
  return dev.queues.map((q) => ({
    name: q.name,
    ...(dev.qosState.counters.get(q.name) || { bytes: 0, packets: 0, dropped: 0 }),
  }));
}
