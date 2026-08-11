// ============================================================
// Running-Config Export & Validasi Topologi (fitur "Export Config")
// - Membangun ulang running-config per node dari state dispatcher
//   (termasuk config yang dibuat lewat CLI) dengan format per vendor.
// - Validasi jaringan: duplicate IP, same-subnet beda prefix,
//   VLAN tanpa switch, netmask mismatch antar ujung kabel,
//   dan port yang belum dikonfigurasi.
// ============================================================

import JSZip from 'jszip';
import type { LabProject, LabNode, LabEdge, VendorType } from '../types';

export interface ExportWarning {
  severity: 'error' | 'warn' | 'info';
  message: string;
  nodeId?: string;
  nodeName?: string;
}

export interface NodeExportEntry {
  nodeId: string;
  nodeName: string;
  vendor: VendorType;
  hostname: string;
  filename: string;
  content: string;
  portCount: number;
  ipCount: number;
  lineCount: number;
}

/** Antarmuka minimal dispatcher agar modul ini tidak bergantung pada kelas konkret. */
export interface ConfigSource {
  exportRunningConfig: (vendorId: string, context: any) => string;
  getNodeMemory: (nodeId: string) => any;
}

/**
 * Peta status kabel per port: portId|name → true (terhubung & up),
 * 'down' (kabel sengaja dimatikan), atau ABSEN (tidak ada kabel).
 * Dipakai untuk menghias port sebelum dikirim ke dispatcher supaya
 * "show interface" menampilkan "not connected" untuk port tanpa kabel.
 */
export function portLinksOfNode(node: LabNode, edges: LabEdge[]): Record<string, boolean | 'down'> {
  const map: Record<string, boolean | 'down'> = {};
  for (const edge of edges) {
    if (edge.sourceNodeId === node.id) {
      map[edge.sourcePortId] = edge.down ? 'down' : true;
    }
    if (edge.targetNodeId === node.id) {
      map[edge.targetPortId] = edge.down ? 'down' : true;
    }
  }
  return map;
}

// ── helpers IP ─────────────────────────────────────────────

function prefixToMask(prefix: number): string {
  const p = Math.max(0, Math.min(32, prefix));
  let mask = 0;
  for (let i = 0; i < 32; i++) mask = (mask << 1) | (i < p ? 1 : 0);
  return [24, 16, 8, 0].map((s) => ((mask >>> s) & 255).toString()).join('.');
}

function maskOf(cidr: string): string {
  const p = cidr.split('/')[1];
  return prefixToMask(Number(p) || 24);
}

function networkOf(ip: string, mask: string): string | null {
  const i = ip.split('.').map(Number);
  const m = mask.split('.').map(Number);
  if (i.length !== 4 || m.length !== 4 || i.some((n) => isNaN(n)) || m.some((n) => isNaN(n))) return null;
  return i.map((o, k) => o & m[k]).join('.');
}

function prefixOf(cidr: string): number {
  const p = Number(String(cidr || '').split('/')[1]);
  return Number.isInteger(p) && p >= 0 && p <= 32 ? p : -1;
}

interface PortIp {
  nodeId: string;
  nodeName: string;
  portName: string;
  ip: string;
  prefix: number;
  network: string | null;
}

/** Kumpulkan semua IP antarmuka (dari topologi + hasil konfigurasi CLI via dispatcher memori). */
function collectPortIps(project: LabProject, source: ConfigSource): PortIp[] {
  const out: PortIp[] = [];
  for (const node of project.nodes) {
    const mem = source.getNodeMemory(node.id);
    const configured = mem?.configuredIps || {};
    const seen = new Set<string>();
    for (const port of node.ports) {
      const cidr = port.ipAddress || configured[port.name] || configured[port.id];
      if (!cidr) continue;
      const ip = String(cidr).split('/')[0];
      if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip) || seen.has(ip)) continue;
      seen.add(ip);
      const prefix = prefixOf(String(cidr)) < 0 ? 24 : prefixOf(String(cidr));
      out.push({
        nodeId: node.id,
        nodeName: node.name,
        portName: port.name,
        ip,
        prefix,
        network: networkOf(ip, prefixToMask(prefix)),
      });
      seen.add(ip);
    }
  }
  return out;
}

/**
 * Validasi topologi + running-config. Mengembalikan daftar temuan
 * (error/warn/info) untuk ditampilkan di modal Export Config.
 */
export function validateConfigExport(project: LabProject, source: ConfigSource): ExportWarning[] {
  const warnings: ExportWarning[] = [];
  const ips = collectPortIps(project, source);

  // 1) Duplicate IP di dua antarmuka berbeda (node sama atau beda).
  const byIp = new Map<string, PortIp[]>();
  for (const p of ips) {
    const arr = byIp.get(p.ip) || [];
    arr.push(p);
    byIp.set(p.ip, arr);
  }
  for (const [ip, arr] of byIp) {
    if (arr.length > 1) {
      const where = arr.map((p) => `${p.nodeName}:${p.portName}`).join(', ');
      warnings.push({
        severity: 'error',
        message: `IP duplikat ${ip} dipakai oleh ${where}. Kedua antarmuka tidak boleh memakai IP yang sama.`,
        nodeId: arr[0].nodeId,
      });
    }
  }

  // 2) IP sama subnet tapi beda prefix (network sama, mask beda) → konflik.
  const byNet = new Map<string, PortIp[]>();
  for (const p of ips) {
    if (!p.network) continue;
    const arr = byNet.get(p.network) || [];
    arr.push(p);
    byNet.set(p.network, arr);
  }
  for (const [net, arr] of byNet) {
    const prefixes = new Set(arr.map((p) => p.prefix));
    if (prefixes.size > 1) {
      const where = arr.map((p) => `${p.nodeName}:${p.portName}${p.ip}/${p.prefix}`).join(', ');
      warnings.push({
        severity: 'warn',
        message: `Subnet ${net} dipakai dengan prefix berbeda (${where}). Router akan menganggap dua subnet terpisah.`,
        nodeId: arr[0].nodeId,
      });
    }
  }

  // 3) VLAN dikonfigurasi di perangkat yang bukan switch (router-on-a-stick tanpa switch).
  for (const node of project.nodes) {
    const mem = source.getNodeMemory(node.id);
    const vlans = mem?.vlans?.length || 0;
    if (vlans > 0) {
      const hasSwitchNeighbor = project.edges.some(
        (e) =>
          e.sourceNodeId === node.id &&
          project.nodes.find((n) => n.id === e.targetNodeId)?.deviceType === 'switch'
      );
      if (!hasSwitchNeighbor) {
        warnings.push({
          severity: 'warn',
          nodeId: node.id,
          nodeName: node.name,
          message: `VLAN (${vlans} buah) dikonfigurasi di ${node.name} namun tidak ada switch di ujung kabelnya. Access port VLAN butuh switch di sisi lain.`,
        });
      }
    }
  }

  // 4) Netmask mismatch antara dua ujung kabel yang terhubung langsung.
  const byPort = new Map<string, PortIp>();
  for (const p of ips) byPort.set(`${p.nodeId}|${p.portName}`, p);
  for (const edge of project.edges) {
    const a = byPort.get(`${edge.sourceNodeId}|${edge.sourcePortId}`);
    const b = byPort.get(`${edge.targetNodeId}|${edge.targetPortId}`);
    if (a && b && a.prefix !== b.prefix) {
      warnings.push({
        severity: 'warn',
        message: `Netmask mismatch pada kabel ${edge.id}: ${a.nodeName}:${a.portName} /${a.prefix} ↔ ${b.nodeName}:${b.portName} /${b.prefix}. Paket antar subnet bisa gagal.`,
        nodeId: edge.sourceNodeId,
      });
    }
  }

  // 5) Info: port tanpa IP (belum dikonfigurasi) — per node cukup satu peringatan ringkas.
  for (const node of project.nodes) {
    const mem = source.getNodeMemory(node.id);
    const configured = mem?.configuredIps || {};
    const unconfigured = node.ports.filter((p) => !p.ipAddress && !configured[p.name] && !configured[p.id]);
    if (unconfigured.length > 0) {
      warnings.push({
        severity: 'info',
        nodeId: node.id,
        nodeName: node.name,
        message: `${node.name}: ${unconfigured.length} port belum dikonfigurasi (${unconfigured[0].name}${unconfigured.length > 1 ? ', …' : ''}).`,
      });
    }
  }

  return warnings;
}

function slug(name: string): string {
  return (name || 'device').toLowerCase().replace(/[^a-z0-9_-]+/g, '_') || 'device';
}

/** Build running-config per node sesuai vendor (lewat dispatcher). */
export function buildNodeExports(project: LabProject, source: ConfigSource): NodeExportEntry[] {
  return project.nodes.map((node) => {
    const mem = source.getNodeMemory(node.id);
    const hostname = mem?.hostname || node.name || 'Device';
    const context = {
      nodeId: node.id,
      name: node.name,
      ports: node.ports,
      portLinks: portLinksOfNode(node, project.edges),
    };
    const content = source.exportRunningConfig(node.vendor, context);
    const ipCount = node.ports.filter((p: any) => p.ipAddress || (mem?.configuredIps && (mem.configuredIps[p.name] || mem.configuredIps[p.id]))).length;
    return {
      nodeId: node.id,
      nodeName: node.name,
      vendor: node.vendor,
      hostname,
      filename: `${slug(hostname)}.${node.vendor === 'mikrotik' ? 'rsc' : 'txt'}`,
      content,
      portCount: node.ports.length,
      ipCount,
      lineCount: content.split('\n').length,
    };
  });
}

/** Unduh satu file teks ke perangkat lokal. */
export function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Unduh semua running-config sebagai satu arsip ZIP. */
export async function downloadZip(entries: NodeExportEntry[]): Promise<void> {
  const zip = new JSZip();
  for (const e of entries) zip.file(e.filename, e.content);
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'netlab-config-export.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}