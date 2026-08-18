// ============================================================
// FirewallService — evaluasi ACL/filter rule terhadap sebuah paket
// ============================================================

import { NetworkDevice } from '../devices/NetworkDevice';
import { Packet, AclRule } from '../core/types';
import { SimulatorCore } from '../devices/DeviceProcessor';
import { parseCidr, networkOf } from '../core/ip';

/** Hasil evaluasi rule: deny/allow + asal rule (ACL vendor vs firewall filter). */
export interface AclVerdict {
  deny: boolean;
  kind: 'acl' | 'firewall';
  /** aksi rule pemenang: 'deny' (drop senyap) atau 'reject' (balas RST/ICMP). */
  action?: 'deny' | 'reject';
}

/**
 * True ketika paket DIBLOKIR (ada rule deny yang cocok). First-match wins.
 * `inPort` adalah port/interface tempat paket masuk, `outName` interface
 * keluar (hanya diketahui setelah routing — forwarding pass). Rule dengan
 * outInterface hanya dipertimbangkan saat outName tersedia & cocok, agar
 * rule "deny out-interface=wan" tidak memblokir trafik yang keluar lewat
 * interface lain.
 *
 * Asal rule ditentukan dari bentuknya: rule ACL vendor (Cisco/Huawei/H3C)
 * membawa `aclId`, sisanya (MikroTik filter, Fortinet policy, VyOS, ...)
 * diperlakukan sebagai firewall filter.
 */
export function aclBlocks(device: NetworkDevice, pkt: Packet, inPort?: string, outName?: string): AclVerdict {
  const rules = device.aclRules;
  if (!rules || rules.length === 0) return { deny: false, kind: 'firewall' };
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
    if (rule.action === 'deny') {
      return { deny: true, kind: (rule as AclRule & { aclId?: unknown }).aclId != null ? 'acl' : 'firewall', action: 'deny' };
    }
    if (rule.action === 'reject') {
      return { deny: true, kind: (rule as AclRule & { aclId?: unknown }).aclId != null ? 'acl' : 'firewall', action: 'reject' };
    }
    // Rule permit pertama yang cocok menang — first-match-wins, evaluasi berhenti.
    return { deny: false, kind: 'firewall' };
  }
  // Tidak ada rule yang cocok → default permit.
  return { deny: false, kind: 'firewall' };
}

/**
 * Evaluasi ACL/firewall untuk sebuah paket; bila deny → emit FIREWALL_BLOCK,
 * gagalkan run (reason 'blocked') dan drop paket dengan alasan deterministik
 * ('acl-deny' → ACL_DENY, 'firewall' → FIREWALL_DENY). Return true bila
 * diblokir. Dipakai router (ingress + forward pass) DAN switch/wireless
 * (ACL pada lalu lintas L2 — rule harus memengaruhi forwarding, bukan hanya
 * tampil di print CLI).
 */
export function applyAclDeny(
  core: SimulatorCore,
  device: NetworkDevice,
  pkt: Packet,
  traceId: string,
  inPort: string,
  outName?: string
): boolean {
  const verdict = aclBlocks(device, pkt, inPort, outName);
  if (!verdict.deny) return false;
  const reason = verdict.kind === 'acl' ? 'acl-deny' : 'firewall';
  if (verdict.action === 'reject') {
    // Reject ≠ drop senyap: pengirim dibalas RST (TCP) / ICMP unreachable
    // (UDP/ICMP) — sisi pengirim melihat koneksi ditolak, bukan timeout.
    core.emit('FIREWALL_REJECT', traceId, { dstIp: pkt.dstIp, srcIp: pkt.srcIp, outInterface: outName }, device.id, inPort);
    const inIface = device.getIfaceByPortId(inPort) || device.getIfaceByName(inPort);
    if (inIface) {
      if (pkt.protocol === 'tcp') {
        const seg = (pkt.payload ?? {}) as Record<string, unknown> & { seq?: number; ack?: number; flags?: number };
        const rst = core.createPacket({
          protocol: 'tcp',
          srcMac: inIface.mac,
          dstMac: pkt.srcMac,
          srcIp: pkt.dstIp,
          dstIp: pkt.srcIp,
          srcPort: pkt.dstPort,
          dstPort: pkt.srcPort,
          ttl: 64,
          traceId,
          payload: {
            seq: 0,
            ack: (seg.seq ?? 0) + 1,
            ackNum: (seg.ack ?? 0) + 1,
            flags: 4,
          },
        });
        rst.vlan = pkt.vlan;
        core.transmit(device, rst, inIface.name, traceId);
      } else if (pkt.protocol === 'icmp' || pkt.protocol === 'udp') {
        const unreach = core.createPacket({
          protocol: 'icmp',
          srcMac: inIface.mac,
          dstMac: pkt.srcMac,
          srcIp: pkt.dstIp,
          dstIp: pkt.srcIp,
          ttl: 64,
          traceId,
          payload: { type: 3, code: 13, seq: 0, id: 0, detail: 'communication-administratively-prohibited' },
        });
        unreach.vlan = pkt.vlan;
        core.transmit(device, unreach, inIface.name, traceId);
      }
    }
    const run = core.getRun(traceId);
    if (run && run.status === 'running') {
      run.blocked = true;
      run.status = 'fail';
      run.reason = 'rejected';
    }
    core.drop(device, pkt, 'firewall-reject', traceId);
    return true;
  }
  core.emit('FIREWALL_BLOCK', traceId, { dstIp: pkt.dstIp, srcIp: pkt.srcIp, outInterface: outName }, device.id, inPort);
  const run = core.getRun(traceId);
  if (run && run.status === 'running') {
    run.blocked = true;
    run.status = 'fail';
    run.reason = 'blocked';
  }
  core.drop(device, pkt, reason, traceId);
  return true;
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
