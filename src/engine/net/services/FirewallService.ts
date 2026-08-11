// ============================================================
// FirewallService — evaluasi ACL/filter rule terhadap sebuah paket
// ============================================================

import { NetworkDevice } from '../devices/NetworkDevice';
import { Packet } from '../core/types';
import { parseCidr, networkOf } from '../core/ip';

/**
 * True ketika paket DIBLOKIR (ada rule deny yang cocok). First-match wins.
 * `inPort` adalah port/interface tempat paket masuk, `outName` interface
 * keluar (hanya diketahui setelah routing — forwarding pass). Rule dengan
 * outInterface hanya dipertimbangkan saat outName tersedia & cocok, agar
 * rule "deny out-interface=wan" tidak memblokir trafik yang keluar lewat
 * interface lain.
 */
export function aclBlocks(device: NetworkDevice, pkt: Packet, inPort?: string, outName?: string): boolean {
  const rules = device.aclRules;
  if (!rules || rules.length === 0) return false;
  const inIface = inPort ? device.getIfaceByPortId(inPort) || device.getIfaceByName(inPort) : null;
  const inName = inIface?.name || inPort || '';
  for (const rule of rules) {
    if (rule.outInterface) {
      // Rule keluar: hanya berlaku bila interface keluar sudah diketahui
      // (pass kedua setelah routing) dan namanya cocok.
      if (!outName) continue;
      if (!matchesIfaceName(rule.outInterface, outName)) continue;
    }
    const protoOk =
      !rule.proto ||
      rule.proto === 'any' ||
      rule.proto === 'ip' ||
      rule.proto.toLowerCase() === pkt.protocol;
    if (!protoOk) continue;
    const srcOk = addrMatches(rule.src, pkt.srcIp);
    const dstOk = addrMatches(rule.dst, pkt.dstIp);
    if (!srcOk || !dstOk) continue;
    const inOk = !rule.inInterface || matchesIfaceName(rule.inInterface, inName);
    if (!inOk) continue;
    // Port hanya dipertimbangkan untuk tcp/udp (icmp/arp tidak punya port).
    if (pkt.protocol === 'tcp' || pkt.protocol === 'udp') {
      if (!portMatches(rule.srcPort, pkt.srcPort)) continue;
      if (!portMatches(rule.dstPort, pkt.dstPort)) continue;
    }
    return rule.action === 'deny';
  }
  return false;
}

function addrMatches(pattern: string | undefined, ip: string): boolean {
  if (!pattern || pattern === 'any') return true;
  // Bentuk "ip wildcard" (Huawei ACL / Fortinet address) → CIDR, mis. "192.168.1.0 0.0.0.255".
  const m = pattern.trim().match(/^(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)$/);
  if (m) {
    const bits = m[2].split('.').map(Number).reduce((acc, o) => acc + (o.toString(2).match(/1/g) || []).length, 0);
    return addrMatches(`${m[1]}/${32 - bits}`, ip);
  }
  if (pattern.includes('/')) {
    const c = parseCidr(pattern);
    if (!c) return false;
    return networkOf(ip, c.prefix) === networkOf(c.address, c.prefix);
  }
  return pattern === ip;
}

/** Cocokkan spesifikasi interface ('ether1' | 'ether*') dengan nama sebenarnya. */
function matchesIfaceName(pattern: string, name: string): boolean {
  if (!name) return false;
  if (pattern.includes('*')) {
    const re = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
    return re.test(name);
  }
  return pattern === name;
}

function portMatches(spec: string | undefined, port: number): boolean {
  if (!spec || spec === 'any') return true;
  const m = String(spec).trim().match(/^(\d+)(?:-(\d+))?$/);
  if (!m) return false;
  const lo = parseInt(m[1], 10);
  const hi = m[2] ? parseInt(m[2], 10) : lo;
  return port >= lo && port <= hi;
}
