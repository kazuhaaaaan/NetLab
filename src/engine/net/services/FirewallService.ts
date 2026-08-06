// ============================================================
// FirewallService — evaluasi ACL/filter rule terhadap sebuah paket
// ============================================================

import { NetworkDevice } from '../devices/NetworkDevice';
import { Packet } from '../core/types';
import { parseCidr, networkOf } from '../core/ip';

/** True ketika paket DIBLOKIR (ada rule deny yang cocok). First-match wins. */
export function aclBlocks(device: NetworkDevice, pkt: Packet): boolean {
  const rules = device.aclRules;
  if (!rules || rules.length === 0) return false;
  for (const rule of rules) {
    const protoOk =
      !rule.proto ||
      rule.proto === 'any' ||
      rule.proto === 'ip' ||
      rule.proto.toLowerCase() === pkt.protocol;
    if (!protoOk) continue;
    const srcOk = addrMatches(rule.src, pkt.srcIp);
    const dstOk = addrMatches(rule.dst, pkt.dstIp);
    if (srcOk && dstOk) return rule.action === 'deny';
  }
  return false;
}

function addrMatches(pattern: string | undefined, ip: string): boolean {
  if (!pattern || pattern === 'any') return true;
  if (pattern.includes('/')) {
    const c = parseCidr(pattern);
    if (!c) return false;
    return networkOf(ip, c.prefix) === networkOf(c.address, c.prefix);
  }
  return pattern === ip;
}
