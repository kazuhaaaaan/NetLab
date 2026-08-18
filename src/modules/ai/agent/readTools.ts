// ============================================================
// readTools — tool baca state (READ ONLY).
// Semua data dibaca dari state AKTUAL simulator (NetworkStateReader
// + getter engine), bukan dari konteks/riwayat lama.
// ============================================================

import type { ToolResult, ToolExecCtx } from './types';

function ok(message: string, data?: Record<string, unknown>, evidence?: string[]): ToolResult {
  return { ok: true, message, data, evidence };
}

export function toolGetTopology(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const reader = ctx.runtime.sim as import('../../../engine/net/core/NetworkSimulator').NetworkSimulator;
  const project = ctx.runtime.getProject();
  const devices = reader.getDevices().map((d) => ({
    id: d.id,
    name: d.name,
    deviceType: d.deviceType,
    vendor: d.vendor,
    powered: d.powered,
  }));
  const links = reader.topology.links.all.map((l) => ({
    id: l.id,
    a: l.a.nodeId,
    aPort: l.a.port,
    b: l.b.nodeId,
    bPort: l.b.port,
  }));
  return ok(
    `${devices.length} perangkat, ${links.length} kabel${project ? ` (proyek: ${project.metadata.name})` : ''}`,
    { devices, links, projectName: project?.metadata.name ?? null }
  );
}

export function toolGetDevices(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const sim = ctx.runtime.sim;
  const devices = sim.getDevices().map((d) => ({
    id: d.id,
    name: d.name,
    deviceType: d.deviceType,
    vendor: d.vendor ?? d.deviceType,
    kind: d.kind,
    powered: d.powered,
    ip: d.getIpAddress(),
  }));
  return ok(`${devices.length} perangkat`, { devices });
}

export function toolGetDevice(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const sim = ctx.runtime.sim;
  const dev = sim.getDevice(p['deviceId'] as string) ?? sim.getDeviceByName(p['deviceId'] as string);
  if (!dev) return { ok: false, message: `device tidak ditemukan: ${p['deviceId']}`, error: 'device-not-found' };
  const stats = sim.getDeviceStats(dev.id);
  return ok(
    `${dev.name} (${dev.deviceType}, ${dev.vendor ?? '?'}) ${dev.powered ? 'ON' : 'OFF'}`,
    {
      id: dev.id,
      name: dev.name,
      deviceType: dev.deviceType,
      vendor: dev.vendor,
      powered: dev.powered,
      ip: dev.getIpAddress(),
      interfaces: stats?.interfaces ?? [],
    }
  );
}

export function toolGetInterfaces(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const sim = ctx.runtime.sim;
  const dev = sim.getDevice(p['deviceId'] as string) ?? sim.getDeviceByName(p['deviceId'] as string);
  if (!dev) return { ok: false, message: `device tidak ditemukan: ${p['deviceId']}`, error: 'device-not-found' };
  const stats = sim.getDeviceStats(dev.id);
  const ifaces = (stats?.interfaces ?? []).map((i) => ({
    name: i.name,
    mac: i.mac,
    ip: i.ip,
    ipv6: i.ipv6,
    up: i.up,
    linked: i.linked,
    operational: i.operational,
  }));
  return ok(`${dev.name}: ${ifaces.length} interface`, { deviceId: dev.id, interfaces: ifaces });
}

export function toolGetInterface(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const sim = ctx.runtime.sim;
  const dev = sim.getDevice(p['deviceId'] as string) ?? sim.getDeviceByName(p['deviceId'] as string);
  if (!dev) return { ok: false, message: `device tidak ditemukan: ${p['deviceId']}`, error: 'device-not-found' };
  const stats = sim.getDeviceStats(dev.id);
  const iface = stats?.interfaces.find((i) => i.name === p['interfaceId'] || i.name.toLowerCase() === String(p['interfaceId']).toLowerCase());
  if (!iface) return { ok: false, message: `interface tidak ditemukan: ${p['interfaceId']}`, error: 'interface-not-found' };
  return ok(`${dev.name}:${iface.name} ${iface.up ? 'up' : 'down'}`, { deviceId: dev.id, interface: iface });
}

export function toolGetRoutes(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const sim = ctx.runtime.sim;
  const dev = sim.getDevice(p['deviceId'] as string) ?? sim.getDeviceByName(p['deviceId'] as string);
  if (!dev) return { ok: false, message: `device tidak ditemukan: ${p['deviceId']}`, error: 'device-not-found' };
  const stats = sim.getDeviceStats(dev.id);
  const routes = (stats?.routes ?? []).map((r) => ({
    dst: r.dst,
    gateway: r.gateway ?? null,
    iface: r.iface ?? null,
    kind: r.kind,
    active: r.active,
  }));
  return ok(`${dev.name}: ${routes.length} rute`, { deviceId: dev.id, routes });
}

export function toolGetIpv6Routes(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const sim = ctx.runtime.sim;
  const dev = sim.getDevice(p['deviceId'] as string) ?? sim.getDeviceByName(p['deviceId'] as string);
  if (!dev) return { ok: false, message: `device tidak ditemukan: ${p['deviceId']}`, error: 'device-not-found' };
  const info = sim.getIpv6Info(dev.id);
  const routes = (info?.routes ?? []).map((r) => ({
    dst: r.dst,
    gateway: r.gateway ?? null,
    kind: r.dst.startsWith('::') || r.dst === 'default' ? 'dynamic' : 'connected',
  }));
  return ok(`${dev.name}: ${routes.length} rute IPv6`, { deviceId: dev.id, routes });
}

export function toolGetArp(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const sim = ctx.runtime.sim;
  const dev = sim.getDevice(p['deviceId'] as string) ?? sim.getDeviceByName(p['deviceId'] as string);
  if (!dev) return { ok: false, message: `device tidak ditemukan: ${p['deviceId']}`, error: 'device-not-found' };
  const arp = dev.arpCache.entriesList().map((e) => ({ ip: e.ip, mac: e.mac }));
  return ok(`${dev.name}: ${arp.length} entri ARP`, { deviceId: dev.id, arp });
}

export function toolGetNdp(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const sim = ctx.runtime.sim;
  const dev = sim.getDevice(p['deviceId'] as string) ?? sim.getDeviceByName(p['deviceId'] as string);
  if (!dev) return { ok: false, message: `device tidak ditemukan: ${p['deviceId']}`, error: 'device-not-found' };
  const info = sim.getIpv6Info(dev.id);
  const neighbors = (info?.neighbors ?? []).map((n) => ({ ip: n.ip, mac: n.mac, iface: n.iface }));
  return ok(`${dev.name}: ${neighbors.length} entri NDP`, { deviceId: dev.id, neighbors });
}

export function toolGetMacTable(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const sim = ctx.runtime.sim;
  const dev = sim.getDevice(p['deviceId'] as string) ?? sim.getDeviceByName(p['deviceId'] as string);
  if (!dev) return { ok: false, message: `device tidak ditemukan: ${p['deviceId']}`, error: 'device-not-found' };
  const macs = dev.macTable.entriesList().map((e) => ({ mac: e.mac, port: e.port }));
  return ok(`${dev.name}: ${macs.length} entri MAC`, { deviceId: dev.id, macTable: macs });
}

export function toolGetVlanTable(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const sim = ctx.runtime.sim;
  const dev = sim.getDevice(p['deviceId'] as string) ?? sim.getDeviceByName(p['deviceId'] as string);
  if (!dev) return { ok: false, message: `device tidak ditemukan: ${p['deviceId']}`, error: 'device-not-found' };
  const vlanMap = sim.getNodePortVlans(dev.id);
  const trunks = sim.getNodeTrunkPorts(dev.id);
  const vlans = sim.getNodeVlans(dev.id);
  const evidence: string[] = [];
  for (const [iface, vlan] of vlanMap) evidence.push(`${iface} → VLAN ${vlan}`);
  for (const t of trunks) evidence.push(`${t} → trunk`);
  return ok(`${dev.name}: ${evidence.length} konfigurasi VLAN`, {
    deviceId: dev.id,
    accessPorts: Object.fromEntries(vlanMap),
    trunkPorts: [...trunks],
    vlans: vlans.map((v) => ({ id: v.id, name: v.name })),
  });
}

export function toolGetDhcpLeases(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const sim = ctx.runtime.sim;
  const leases = sim.getLeases().map((l) => ({
    nodeId: l.nodeId,
    ip: l.ip,
    gateway: l.gateway,
    prefix: l.prefix,
    poolNodeId: l.poolNodeId,
  }));
  return ok(`${leases.length} lease aktif`, { leases });
}

export function toolGetNatSessions(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const sim = ctx.runtime.sim;
  const dev = sim.getDevice(p['deviceId'] as string) ?? sim.getDeviceByName(p['deviceId'] as string);
  if (!dev) return { ok: false, message: `device tidak ditemukan: ${p['deviceId']}`, error: 'device-not-found' };
  const rules = sim.getNodeNats(dev.id).map((r) => ({
    chain: r.chain,
    action: r.action,
    protocol: r.protocol,
    srcAddress: r.srcAddress,
    dstAddress: r.dstAddress,
    dstPort: r.dstPort,
    outInterface: r.outInterface,
    toAddresses: r.toAddresses,
    toPorts: r.toPorts,
  }));
  return ok(`${dev.name}: ${rules.length} rule NAT`, { deviceId: dev.id, natRules: rules });
}

export function toolGetFirewallRules(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const sim = ctx.runtime.sim;
  const dev = sim.getDevice(p['deviceId'] as string) ?? sim.getDeviceByName(p['deviceId'] as string);
  if (!dev) return { ok: false, message: `device tidak ditemukan: ${p['deviceId']}`, error: 'device-not-found' };
  const rules = sim.getNodeAcls(dev.id).map((r) => ({
    action: r.action,
    protocol: r.proto,
    src: r.src,
    dst: r.dst,
    srcPort: r.srcPort,
    dstPort: r.dstPort,
    inInterface: r.inInterface,
  }));
  return ok(`${dev.name}: ${rules.length} rule firewall`, { deviceId: dev.id, rules });
}

export function toolGetOspfNeighbors(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const sim = ctx.runtime.sim;
  const dev = sim.getDevice(p['deviceId'] as string) ?? sim.getDeviceByName(p['deviceId'] as string);
  if (!dev) return { ok: false, message: `device tidak ditemukan: ${p['deviceId']}`, error: 'device-not-found' };
  const neighbors = sim.getOspfNeighbors(dev.id);
  return ok(`${dev.name}: ${neighbors.length} tetangga OSPF`, {
    deviceId: dev.id,
    neighbors: neighbors.map((n) => ({ routerId: n.routerId, ip: n.ip, iface: n.iface, state: n.state })),
  });
}

export function toolGetOspfDatabase(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const sim = ctx.runtime.sim;
  const dev = sim.getDevice(p['deviceId'] as string) ?? sim.getDeviceByName(p['deviceId'] as string);
  if (!dev) return { ok: false, message: `device tidak ditemukan: ${p['deviceId']}`, error: 'device-not-found' };
  const lsdb = sim.getOspfLsdb(dev.id);
  return ok(`${dev.name}: ${lsdb.length} LSA di LSDB`, {
    deviceId: dev.id,
    lsas: lsdb.map((l) => ({
      advertiser: l.advertiser,
      area: l.area,
      stubs: l.stubs.length,
      links: l.links.length,
    })),
  });
}

export function toolGetBgpNeighbors(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const sim = ctx.runtime.sim;
  const dev = sim.getDevice(p['deviceId'] as string) ?? sim.getDeviceByName(p['deviceId'] as string);
  if (!dev) return { ok: false, message: `device tidak ditemukan: ${p['deviceId']}`, error: 'device-not-found' };
  const peers = sim.getBgpNeighborStates(dev.id);
  return ok(`${dev.name}: ${peers.length} peer BGP`, {
    deviceId: dev.id,
    peers: peers.map((x) => ({ remoteAddr: x.remoteAddr, remoteAs: x.remoteAs, state: x.state, prefixes: x.prefixes })),
  });
}

export function toolGetBgpRoutes(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const sim = ctx.runtime.sim;
  const dev = sim.getDevice(p['deviceId'] as string) ?? sim.getDeviceByName(p['deviceId'] as string);
  if (!dev) return { ok: false, message: `device tidak ditemukan: ${p['deviceId']}`, error: 'device-not-found' };
  const rib = sim.getBgpRib(dev.id);
  return ok(`${dev.name}: ${rib.length} rute BGP`, {
    deviceId: dev.id,
    routes: rib.map((r) => ({ dst: r.dst, gateway: r.gateway, asPath: r.asPath, localPref: r.localPref, origin: r.origin })),
  });
}

export function toolGetEigrp(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const sim = ctx.runtime.sim;
  const dev = sim.getDevice(p['deviceId'] as string) ?? sim.getDeviceByName(p['deviceId'] as string);
  if (!dev) return { ok: false, message: `device tidak ditemukan: ${p['deviceId']}`, error: 'device-not-found' };
  const info = sim.getEigrpInfo(dev.id);
  return ok(`${dev.name}: ${info.neighbors.length} tetangga EIGRP, ${info.topology.length} entri topologi`, {
    deviceId: dev.id,
    neighbors: info.neighbors.map((n) => ({ neighborId: n.neighborId, ip: n.ip, iface: n.iface, asn: n.asn })),
    topology: info.topology.map((t) => ({
      dst: t.dst,
      successor: t.successor,
      fd: t.fd,
      rd: t.rd,
      state: t.state,
    })),
  });
}

export function toolGetStp(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const sim = ctx.runtime.sim;
  const dev = sim.getDevice(p['deviceId'] as string) ?? sim.getDeviceByName(p['deviceId'] as string);
  if (!dev) return { ok: false, message: `device tidak ditemukan: ${p['deviceId']}`, error: 'device-not-found' };
  const stp = sim.getStpInfo(dev.id);
  if (!stp) return ok(`${dev.name}: STP tidak aktif`, { deviceId: dev.id, enabled: false });
  return ok(`${dev.name}: root=${stp.rootName}, ${stp.ports.length} port`, {
    deviceId: dev.id,
    enabled: stp.enabled,
    root: stp.rootName,
    ports: stp.ports.map((x) => ({ port: x.port, role: x.role, state: x.state })),
  });
}

export function toolGetFhrp(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const sim = ctx.runtime.sim;
  const dev = sim.getDevice(p['deviceId'] as string) ?? sim.getDeviceByName(p['deviceId'] as string);
  if (!dev) return { ok: false, message: `device tidak ditemukan: ${p['deviceId']}`, error: 'device-not-found' };
  const fhrp = sim.getFhrpInfo(dev.id);
  return ok(
    fhrp && fhrp.length > 0 ? `${dev.name}: ${fhrp.length} grup VRRP` : `${dev.name}: tanpa grup VRRP`,
    { deviceId: dev.id, groups: fhrp ?? [] }
  );
}

export function toolGetWirelessClients(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const sim = ctx.runtime.sim;
  const dev = sim.getDevice(p['deviceId'] as string) ?? sim.getDeviceByName(p['deviceId'] as string);
  if (!dev) return { ok: false, message: `device tidak ditemukan: ${p['deviceId']}`, error: 'device-not-found' };
  const info = sim.getWirelessInfo(dev.id);
  return ok(
    info ? `${dev.name}: ${info.associations.length} asosiasi (${info.ssid || '-'})` : `${dev.name}: bukan perangkat wireless`,
    { deviceId: dev.id, info }
  );
}

export function toolGetInterfaceStatistics(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const sim = ctx.runtime.sim;
  const dev = sim.getDevice(p['deviceId'] as string) ?? sim.getDeviceByName(p['deviceId'] as string);
  if (!dev) return { ok: false, message: `device tidak ditemukan: ${p['deviceId']}`, error: 'device-not-found' };
  const stats = sim.getDeviceStats(dev.id);
  const qos = sim.getQosStats(dev.id);
  return ok(`${dev.name}: statistik tersedia`, {
    deviceId: dev.id,
    interfaces: stats?.interfaces ?? [],
    qos: qos.map((q) => ({ name: q.name, bytes: q.bytes, packets: q.packets, dropped: q.dropped })),
  });
}

export function toolGetQosStats(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const sim = ctx.runtime.sim;
  const dev = sim.getDevice(p['deviceId'] as string) ?? sim.getDeviceByName(p['deviceId'] as string);
  if (!dev) return { ok: false, message: `device tidak ditemukan: ${p['deviceId']}`, error: 'device-not-found' };
  const stats = sim.getQosStats(dev.id);
  return ok(`${dev.name}: ${stats.length} antrean QoS`, {
    deviceId: dev.id,
    queues: stats.map((q) => ({ name: q.name, bytes: q.bytes, packets: q.packets, dropped: q.dropped })),
  });
}

export function toolGetSnmp(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const sim = ctx.runtime.sim;
  const dev = sim.getDevice(p['deviceId'] as string) ?? sim.getDeviceByName(p['deviceId'] as string);
  if (!dev) return { ok: false, message: `device tidak ditemukan: ${p['deviceId']}`, error: 'device-not-found' };
  const snmp = dev.snmpAgent ?? { enabled: false };
  return ok(`${dev.name}: agent SNMP ${snmp.enabled ? 'aktif' : 'nonaktif'}`, {
    deviceId: dev.id,
    snmp: { enabled: snmp.enabled, community: 'community' in snmp ? snmp.community : undefined },
  });
}

export function toolGetTcpConnections(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const sim = ctx.runtime.sim;
  const dev = sim.getDevice(p['deviceId'] as string) ?? sim.getDeviceByName(p['deviceId'] as string);
  if (!dev) return { ok: false, message: `device tidak ditemukan: ${p['deviceId']}`, error: 'device-not-found' };
  const conns = sim.getTcpConnections(dev.id);
  return ok(`${dev.name}: ${conns.length} koneksi TCP`, {
    deviceId: dev.id,
    connections: conns.map((c) => ({
      localIp: c.localIp,
      localPort: c.localPort,
      remoteIp: c.remoteIp,
      remotePort: c.remotePort,
      state: c.state,
    })),
  });
}

export function toolGetPacketTrace(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const sim = ctx.runtime.sim;
  const source = String(p['source']);
  const destination = String(p['destination']);
  const srcDev = sim.getDevice(source) ?? sim.getDeviceByName(source);
  if (!srcDev) return { ok: false, message: `sumber tidak ditemukan: ${source}`, error: 'source-not-found' };

  const before = sim.eventHistory.length;
  const result = sim.simulatePing(srcDev.id, destination);
  const events = sim.eventHistory.slice(before);

  const hops = result.path.map((name) => ({ device: name, status: 'forwarded' }));
  if (!result.success) {
    const stop = events
      .slice()
      .reverse()
      .find((e) => e.type === 'PACKET_DROPPED' || e.type === 'TTL_EXCEEDED' || e.type === 'FIREWALL_BLOCK' || e.type === 'ICMP_ERROR');
    if (stop) {
      const stopName = sim.getDevice(stop.nodeId ?? '')?.name ?? stop.nodeId;
      const idx = hops.findIndex((h) => h.device === stopName);
      if (idx >= 0) hops[idx] = { device: stopName, status: 'blocked' };
      else hops.push({ device: stopName ?? '?', status: 'blocked' });
    }
  }

  return ok(`Packet trace ${source} → ${destination}: ${result.success ? 'success' : `gagal (${result.reason})`}`, {
    source,
    destination,
    success: result.success,
    reason: result.reason ?? null,
    hops,
    events: events.map((e) => ({
      type: e.type,
      nodeId: e.nodeId,
      data: e.data,
    })),
  });
}

export function toolGetPingResult(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const sim = ctx.runtime.sim;
  const source = String(p['source']);
  const destination = String(p['destination']);
  const srcDev = sim.getDevice(source) ?? sim.getDeviceByName(source);
  if (!srcDev) return { ok: false, message: `sumber tidak ditemukan: ${source}`, error: 'source-not-found' };
  const result = sim.simulatePing(srcDev.id, destination);
  return ok(
    result.success ? `ping ${source} → ${destination}: sukses` : `ping ${source} → ${destination}: gagal (${result.reason})`,
    {
      source,
      destination,
      success: result.success,
      path: result.path,
      rttMs: result.rttMs,
      reason: result.reason,
      ttlAtDestination: result.ttlAtDestination,
    }
  );
}

export function toolGetTracerouteResult(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const sim = ctx.runtime.sim;
  const source = String(p['source']);
  const destination = String(p['destination']);
  const srcDev = sim.getDevice(source) ?? sim.getDeviceByName(source);
  if (!srcDev) return { ok: false, message: `sumber tidak ditemukan: ${source}`, error: 'source-not-found' };
  const result = sim.simulateTraceroute(srcDev.id, destination);
  return ok(result.ok ? 'traceroute selesai' : `traceroute gagal (${result.reason})`, {
    source,
    destination,
    ok: result.ok,
    hops: result.hops.map((h) => ({ ttl: h.ttl, name: h.name, ip: h.ip })),
  });
}

export function toolGetVerificationHistory(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const history = ctx.verification.all();
  return ok(`${history.length} entri verifikasi`, {
    entries: history.map((h) => ({
      id: h.id,
      testType: h.testType,
      source: h.source,
      destination: h.destination,
      success: h.success,
      reason: h.reason,
      label: h.label,
      timestamp: h.timestamp,
    })),
  });
}