// ============================================================
// NATAnalyzer — masquerade hilang / out-interface salah / dst-nat
// ============================================================

import { AnalyzerCtx, AnalyzerIssue, DeviceState, NetworkState } from './types';
import { parseCidr } from '../../engine/net/core/ip';
import { defaultRouteOf, ipInt, isPrivateIp } from './NetworkStateReader';

/** Interface keluar yang dipakai untuk mencapai gateway default. */
function egressIface(dev: DeviceState): { name: string } | null {
  const dr = defaultRouteOf(dev);
  if (!dr?.gateway) return null;
  for (const i of dev.interfaces) {
    if (!i.up || !i.ip) continue;
    const p = parseCidr(i.ip);
    if (!p) continue;
    const mask = (0xffffffff << (32 - p.prefix)) >>> 0;
    if ((ipInt(dr.gateway) & mask) === (ipInt(p.address) & mask)) return { name: i.name };
  }
  return null;
}

export function analyzeNat(state: NetworkState, ctx: AnalyzerCtx): AnalyzerIssue[] {
  const issues: AnalyzerIssue[] = [];

  for (const dev of state.devices) {
    if (!dev.isL3) continue;
    const masquerades = dev.natRules.filter(
      (r) => r.chain === 'srcnat' && r.action === 'masquerade'
    );
    const hasPrivate = dev.interfaces.some(
      (i) => i.ip && isPrivateIp(i.ip.split('/')[0])
    );
    const dr = defaultRouteOf(dev);

    // ── Missing masquerade ──────────────────────────────────────
    if (dr?.gateway && hasPrivate && masquerades.length === 0) {
      const exit = egressIface(dev);
      issues.push({
        id: `nat-masq-missing-${dev.nodeId}`,
        category: 'nat',
        severity: 'warning',
        title: 'NAT Masquerade Missing',
        rootCause: `${dev.name} memiliki subnet pribadi (RFC1918) dan rute default, tapi tidak ada rule chain=srcnat action=masquerade. Trafik ke jaringan luar akan dikirim dengan source IP pribadi yang tidak bisa di-routing balik.`,
        evidence: [
          `Default route via ${dr.gateway}`,
          'Missing: /ip firewall nat add chain=srcnat action=masquerade',
          'Subnet pribadi terdeteksi',
        ],
        affectedDeviceId: dev.nodeId,
        affectedDeviceName: dev.name,
        ifaceName: exit?.name,
        recommendation: 'Tambahkan rule NAT masquerade pada interface keluar (out-interface).',
        commands: [],
        confidence: 0.92,
        fixKey: 'nat-masquerade',
        params: { iface: exit?.name ?? '' },
      });
    }

    // ── Wrong out-interface ─────────────────────────────────────
    for (const r of masquerades) {
      if (!r.outInterface) continue;
      const exit = egressIface(dev);
      if (exit && exit.name.toLowerCase() !== r.outInterface.toLowerCase()) {
        issues.push({
          id: `nat-iface-${dev.nodeId}-${r.outInterface}`,
          category: 'nat',
          severity: 'warning',
          title: 'NAT Out-Interface Salah',
          rootCause: `Rule masquerade memakai out-interface=${r.outInterface}, padahal trafik keluar lewat ${exit.name}.`,
          evidence: [
            `nat: ${r.chain} out-interface=${r.outInterface} action=${r.action}`,
            `Egress sebenarnya: ${exit.name}`,
          ],
          affectedDeviceId: dev.nodeId,
          affectedDeviceName: dev.name,
          ifaceName: exit.name,
          recommendation: `Ubah out-interface rule menjadi ${exit.name}.`,
          commands: [],
          confidence: 0.9,
          fixKey: 'nat-masquerade',
          params: { iface: exit.name },
        });
      }
    }

    // ── dst-nat alamat tidak sesuai ──────────────────────────────
    for (const r of dev.natRules) {
      if (r.chain !== 'dstnat') continue;
      if (r.dstAddress && !dev.interfaces.some((i) => i.ip && ipInt(i.ip.split('/')[0]) === ipInt(r.dstAddress!))) {
        issues.push({
          id: `nat-dstnat-${dev.nodeId}`,
          category: 'nat',
          severity: 'info',
          title: 'dst-nat Alamat Tidak Sesuai',
          rootCause: `Rule dst-nat menunjuk ${r.dstAddress} yang tidak dimiliki ${dev.name}.`,
          evidence: [`dstnat: ${r.dstAddress} → ${r.toAddresses ?? '?'}`],
          affectedDeviceId: dev.nodeId,
          affectedDeviceName: dev.name,
          recommendation: 'Pastikan dst-address sesuai IP interface (WAN) yang benar.',
          commands: [],
          confidence: 0.75,
          fixKey: 'nat-dstnat',
        });
      }
    }
  }

  return issues;
}
