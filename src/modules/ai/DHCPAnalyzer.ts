// ============================================================
// DHCPAnalyzer — discover/offer gagal, lease habis, pool salah
// ============================================================

import { AnalyzerCtx, AnalyzerIssue, DeviceState, NetworkState } from './types';
import { parseCidr } from '../../engine/net/core/ip';
import { ipInt } from './NetworkStateReader';

/** Node-node yang berada pada broadcast domain yang sama dengan seed (hanya menembus switch). */
function l2Reach(state: NetworkState, seedNodeId: string): Set<string> {
  const visited = new Set<string>([seedNodeId]);
  let frontier = [seedNodeId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const n of frontier) {
      const dev = state.byId.get(n);
      if (!dev || !dev.isSwitch) continue;
      for (const l of state.links) {
        const adj = l.a.nodeId === n ? l.b.nodeId : l.b.nodeId === n ? l.a.nodeId : null;
        if (adj && !visited.has(adj)) {
          visited.add(adj);
          next.push(adj);
        }
      }
    }
    frontier = next;
  }
  return visited;
}

/** Apakah ada DHCP server dengan pool pada segmen L2 yang sama dengan host. */
function poolOnSameSegment(state: NetworkState, host: DeviceState): string[] {
  const found: string[] = [];
  for (const srv of state.devices) {
    if (srv.dhcpPools.length === 0) continue;
    for (const pool of srv.dhcpPools) {
      const iface = srv.interfaces.find((i) => i.name === pool.iface);
      if (!iface) continue;
      const link = state.links.find(
        (l) => (l.a.nodeId === srv.nodeId && l.a.portId === iface.portId) ||
               (l.b.nodeId === srv.nodeId && l.b.portId === iface.portId)
      );
      if (!link) continue;
      const peerId = link.a.nodeId === srv.nodeId ? link.b.nodeId : link.a.nodeId;
      const domain = l2Reach(state, peerId);
      if (domain.has(host.nodeId)) found.push(`${srv.name}:${pool.name ?? pool.iface}`);
    }
  }
  return found;
}

export function analyzeDhcp(state: NetworkState, ctx: AnalyzerCtx): AnalyzerIssue[] {
  const issues: AnalyzerIssue[] = [];
  const ev = state.events;

  const discovers = ev.filter((e) => e.type === 'DHCP_DISCOVER');
  const offers = ev.filter((e) => e.type === 'DHCP_OFFER');
  const acks = ev.filter((e) => e.type === 'DHCP_ACK');
  const noPoolDrops = ev.filter((e) => e.type === 'PACKET_DROPPED' && (e.data as { reason?: string }).reason === 'dhcp-no-pool');
  const poolFull = ev.filter((e) => e.type === 'PACKET_DROPPED' && (e.data as { reason?: string }).reason === 'dhcp-pool-full');

  // ── Alur DHCP dari event engine ──────────────────────────────
  if (discovers.length > 0 && offers.length === 0) {
    issues.push({
      id: 'dhcp-discover-fail',
      category: 'dhcp',
      severity: 'critical',
      title: 'DHCP Discover Gagal',
      rootCause: 'DHCP DISCOVER dikirim tetapi tidak ada OFFER. Tidak ada DHCP server pada segmen tersebut.',
      evidence: [`DHCP DISCOVER ${discovers.length}x tanpa OFFER`, noPoolDrops.length > 0 ? 'drop: dhcp-no-pool' : 'tidak ada server dengan pool di segmen'],
      affectedDeviceId: discovers[0].nodeId,
      affectedDeviceName: discovers[0].nodeId ? state.byId.get(discovers[0].nodeId!)?.name : undefined,
      recommendation: 'Buat DHCP server + pool pada router/interface segmen yang sama dengan client.',
      commands: [],
      confidence: 0.95,
      fixKey: 'dhcp-pool',
    });
  }
  if (offers.length > 0 && acks.length === 0) {
    issues.push({
      id: 'dhcp-offer-fail',
      category: 'dhcp',
      severity: 'critical',
      title: 'DHCP Offer Tanpa ACK',
      rootCause: 'Server menawarkan IP (OFFER) tetapi client tidak menyelesaikan REQUEST/ACK — kemungkinan client tidak menerima offer.',
      evidence: [`DHCP OFFER ${offers.length}x tanpa ACK`],
      recommendation: 'Periksa jalur L2 client↔server dan pastikan interface client up.',
      commands: [],
      confidence: 0.9,
      fixKey: 'dhcp-client',
    });
  }
  if (poolFull.length > 0) {
    issues.push({
      id: 'dhcp-pool-full',
      category: 'dhcp',
      severity: 'warning',
      title: 'DHCP Pool Penuh',
      rootCause: 'Semua alamat di pool DHCP telah terpakai.',
      evidence: [`drop: dhcp-pool-full (${poolFull.length}x)`],
      recommendation: 'Perluas range pool atau tambah pool baru.',
      commands: [],
      confidence: 0.95,
      fixKey: 'dhcp-pool',
    });
  }

  // ── Per perangkat (state + lease) ─────────────────────────────
  for (const dev of state.devices) {
    const isHost = dev.kind === 'pc' || dev.kind === 'server';
    if (!isHost) continue;
    const cabled = dev.interfaces.some((i) => i.cable);

    // Lease habis
    for (const l of dev.leases) {
      if (l.expiresAt > 0 && l.expiresAt < state.now) {
        issues.push({
          id: `dhcp-expired-${dev.nodeId}`,
          category: 'dhcp',
          severity: 'warning',
          title: 'DHCP Lease Habis',
          rootCause: `Lease IP ${l.ip} pada ${dev.name} sudah kedaluwarsa (expiresAt=${l.expiresAt} < now=${state.now}).`,
          evidence: [`${dev.name}: ${l.iface} → ${l.ip} expired`],
          affectedDeviceId: dev.nodeId,
          affectedDeviceName: dev.name,
          recommendation: 'Perbarui lease (renew) atau pastikan lease time tidak terlalu pendek.',
          commands: [],
          confidence: 0.97,
          fixKey: 'dhcp-client',
        });
      }
    }

    // Client dalam fase discover/request tanpa lease
    if (dev.dhcpClientState && dev.dhcpClientState !== 'bound' && dev.leases.length === 0) {
      issues.push({
        id: `dhcp-client-stuck-${dev.nodeId}`,
        category: 'dhcp',
        severity: 'critical',
        title: 'DHCP Client Gagal (tidak bound)',
        rootCause: `${dev.name} berada dalam fase '${dev.dhcpClientState}' tetapi tidak pernah mendapat lease.`,
        evidence: [`${dev.name} dhcp-client state=${dev.dhcpClientState}`, 'lease tidak ada'],
        affectedDeviceId: dev.nodeId,
        affectedDeviceName: dev.name,
        recommendation: 'Pastikan ada DHCP server di segmen yang sama (lihat "DHCP Network Belum Dibuat").',
        commands: [],
        confidence: 0.92,
        fixKey: 'dhcp-client',
      });
    } else if (cabled && !dev.ip && dev.leases.length === 0 && dev.dhcpClientState === null) {
      const pools = poolOnSameSegment(state, dev);
      if (pools.length === 0) {
        issues.push({
          id: `dhcp-noserver-${dev.nodeId}`,
          category: 'dhcp',
          severity: 'critical',
          title: 'DHCP Server Tidak Ada di Segmen',
          rootCause: `${dev.name} butuh IP (belum punya) tetapi tidak ada DHCP pool di segmen L2 yang sama.`,
          evidence: [`${dev.name} ip=none`, 'Tidak ada pool pada segmen yang sama'],
          affectedDeviceId: dev.nodeId,
          affectedDeviceName: dev.name,
          recommendation: 'Konfigurasi DHCP server+pool pada router segmen, atau set IP statis.',
          commands: [],
          confidence: 0.88,
          fixKey: 'dhcp-pool',
          params: { iface: dev.interfaces.find((i) => i.cable)?.name },
        });
      }
    }

    // ── Pemeriksaan sisi server ────────────────────────────────
    for (const srv of state.devices) {
      if (srv.dhcpPools.length === 0) continue;
      for (const pool of srv.dhcpPools) {
        const iface = srv.interfaces.find((i) => i.name === pool.iface);
        if (pool.iface && iface) {
          if (iface.shutdown || !iface.up) {
            issues.push({
              id: `dhcp-pool-iface-${srv.nodeId}-${pool.iface}`,
              category: 'dhcp',
              severity: 'critical',
              title: 'Pool Interface Down',
              rootCause: `Pool DHCP pada ${srv.name} menunjuk ke interface ${pool.iface} yang sedang down/shutdown.`,
              evidence: [`${srv.name} pool=${pool.name ?? pool.iface}`, `Interface ${pool.iface} ${iface.shutdown ? 'shutdown' : 'down'}`],
              affectedDeviceId: srv.nodeId,
              affectedDeviceName: srv.name,
              ifaceName: pool.iface,
              recommendation: 'Nyalakan interface atau pindahkan pool ke interface yang up.',
              commands: [],
              confidence: 0.96,
              fixKey: 'iface-up',
              params: { iface: pool.iface },
            });
          }
          if (pool.network) {
            const p = parseCidr(pool.network);
            const ip = iface.ip ? parseCidr(iface.ip) : null;
            if (p && ip) {
              const mask = (0xffffffff << (32 - p.prefix)) >>> 0;
              const sameNet = (ipInt(p.address) & mask) === (ipInt(ip.address) & mask);
              if (!sameNet) {
                issues.push({
                  id: `dhcp-pool-net-${srv.nodeId}-${pool.name ?? pool.iface}`,
                  category: 'dhcp',
                  severity: 'warning',
                  title: 'DHCP Network Tidak Sesuai',
                  rootCause: `Network pool ${pool.network} tidak berada pada subnet interface ${pool.iface} (${ip.address}/${ip.prefix}).`,
                  evidence: [`pool network=${pool.network}`, `iface ${pool.iface}=${ip.address}/${ip.prefix}`],
                  affectedDeviceId: srv.nodeId,
                  affectedDeviceName: srv.name,
                  ifaceName: pool.iface,
                  recommendation: 'Samakan network pool dengan subnet interface.',
                  commands: [],
                  confidence: 0.9,
                  fixKey: 'dhcp-pool',
                  params: { iface: pool.iface },
                });
              }
            }
          }
        }
      }
    }
  }

  return issues;
}
