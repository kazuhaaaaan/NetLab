// ============================================================
// cliContext — SATU implementasi pembangun VendorContext.
//
// Digunakan oleh:
//   - Terminal manusia (App.tsx handleSendTerminalCommand)
//   - AI Agent (execute_cli tool)
//
// Tujuan: menjamin Human CLI dan AI CLI berperilaku IDENTIK —
// keduanya melewati VendorDispatcher → NetworkSimulator dengan
// provider yang sama. Tidak ada dua jalur konfigurasi.
// ============================================================

import type { NetworkSimulator } from '../engine/net/core/NetworkSimulator';
import type { LabProject, LabNode, LabEdge } from '../types';
import { formatPingOutput, formatTracerouteOutput } from '../engine/net';
import type { VendorContext } from '../../packages/vendors/src/common/types';
import { portLinksOfNode } from './configExport';

export interface CliContextInput {
  node: LabNode;
  project: LabProject;
  sim: NetworkSimulator;
}

/** Bangun VendorContext lengkap untuk sebuah node (sama untuk manusia & AI). */
export function buildCliContext({ node, project, sim }: CliContextInput): VendorContext {
  const nodeId = node.id;
  return {
    nodeId,
    name: node.name,
    ports: node.ports.map((p) => ({ ...p })),
    portLinks: portLinksOfNode(node, project.edges),
    pingSimulator: (host: string, vendorId: string, size?: number) => {
      const result = sim.simulatePing(nodeId, host, size);
      return formatPingOutput(vendorId, host, result);
    },
    tracerouteSimulator: (host: string, vendorId: string) => {
      const result = sim.simulateTraceroute(nodeId, host);
      return formatTracerouteOutput(vendorId, host, result);
    },
    routeProvider: () => sim.getDeviceStats(nodeId)?.routes || [],
    dhcpClientGrant: (iface: string, addDefaultRoute: boolean) => {
      const granted = sim.grantDhcpLease(nodeId, iface);
      return granted
        ? { ip: granted.ip, gateway: granted.gateway, prefix: granted.prefix, poolNodeId: granted.poolNodeId }
        : null;
    },
    connectivitySimulator: (host: string, vendorId: string, port?: number) => {
      let target = host;
      let label = host;
      if (!/^\d+\.\d+\.\d+\.\d+$/.test(host || '')) {
        const res = sim.resolveHostname(nodeId, host);
        if (!res.resolved) return `curl: (6) Could not resolve host: ${host}`;
        target = res.resolved;
        label = host;
      }
      const conn = sim.simulateTcpConnect(nodeId, target, port || 80);
      if (!conn.ok) {
        const reason = conn.reason;
        if (reason === 'no-ip') return 'curl: (6) Could not resolve host: ' + host;
        if (reason === 'ttl') return 'curl: (28) Timeout: TTL exceeded menuju ' + label;
        return `curl: (7) Failed to connect to ${label} port ${port || 80} after 3000 ms: Connection refused`;
      }
      const body =
        conn.body ||
        `<html><head><title>Welcome to ${label}</title></head><body><h1>It works!</h1></body></html>`;
      return `HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: ${body.length}\r\n\r\n${body}`;
    },
    dnsResolver: (name: string) => ({ ...sim.resolveHostname(nodeId, name) }),
    neighborProvider: (proto: 'cdp' | 'lldp') => sim.getLldpNeighbors(nodeId),
    ospfNeighborProvider: () => sim.getOspfNeighbors(nodeId),
    fhrpProvider: () => sim.getFhrpInfo(nodeId),
    ipv6Provider: () => sim.getIpv6Info(nodeId),
    bgpNeighborProvider: () => sim.getBgpNeighborStates(nodeId),
    tcpProvider: () => sim.getTcpConnections(nodeId),
    arpProvider: () => sim.getDeviceStats(nodeId)?.arp || [],
    macTableProvider: () => sim.getDeviceStats(nodeId)?.macTable || [],
    stpProvider: () => sim.getStpInfo(nodeId),
    wirelessProvider: () => sim.getWirelessInfo(nodeId),
    qosProvider: () => sim.getQosStats(nodeId),
    snmpQueryProvider: (host: string, community: string, oid: string, opts?: { walk?: boolean; setValue?: string }) => {
      let target = host;
      if (!/^\d+\.\d+\.\d+\.\d+$/.test(host || '')) {
        const res = sim.resolveHostname(nodeId, host);
        if (!res.resolved) return { ok: false, reason: 'not-found' };
        target = res.resolved;
      }
      return sim.simulateSnmpQuery(nodeId, target, community, oid, opts || {});
    },
  };
}

/** Konversi daftar LabEdge menjadi edge map per node (dipakai portLinksOfNode). */
export function edgesOfProject(project: LabProject): LabEdge[] {
  return project.edges;
}