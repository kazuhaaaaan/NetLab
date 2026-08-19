// ============================================================
// topologyTools — AI dapat membuat/mengubah topologi.
//
// Seluruh mutasi mengubah LabProject (source of truth canvas),
// lalu runtime.applyProject → engine sync → canvas sync.
// Tidak ada mutasi langsung ke React/Canvas.
//
// Rollback topologi = restore proyek snapshot (lihat transaction.ts).
// ============================================================

import type { ToolResult, ToolExecCtx } from './types';
import type { LabProject, LabNode, LabEdge, PortSpec } from '../../../types';
import { cloneProject, uid } from './runtime';
import { getPortsForModel, getDefaultModel } from '../../../data/deviceModels';
import { inferCableType } from '../../../connection';

const DEVICE_TYPES = ['router', 'switch', 'firewall', 'pc', 'server', 'wireless', 'windows-client'] as const;
type DeviceType = (typeof DEVICE_TYPES)[number];

const VENDORS = ['mikrotik', 'cisco_ios', 'cisco_nxos', 'juniper', 'huawei', 'ubiquiti', 'vyos', 'fortinet', 'aruba', 'openwrt', 'linux', 'windows'] as const;
type VendorId = (typeof VENDORS)[number];

function projectOf(ctx: ToolExecCtx): { project: LabProject } | { error: ToolResult } {
  const p = ctx.runtime.getProject();
  if (!p) {
    return {
      error: {
        ok: false,
        message: 'Tidak ada proyek aktif — buat proyek dulu.',
        error: 'no-project',
      },
    };
  }
  return { project: cloneProject(p) };
}

function isBusy(project: LabProject, nodeId: string, portId: string): boolean {
  return project.edges.some(
    (e) =>
      (e.sourceNodeId === nodeId && e.sourcePortId === portId) ||
      (e.targetNodeId === nodeId && e.targetPortId === portId)
  );
}

function nodeOf(project: LabProject, ref: string): LabNode | undefined {
  return project.nodes.find((n) => n.id === ref || n.name.toLowerCase() === ref.toLowerCase());
}

function portOf(node: LabNode, ref: string): PortSpec | undefined {
  return node.ports.find((p) => p.id === ref || p.name.toLowerCase() === ref.toLowerCase());
}

/** Buat perangkat baru di proyek. */
export function toolCreateDevice(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const deviceType = p['type'] as DeviceType;
  const vendor = p['vendor'] as VendorId;
  const name = (p['name'] as string | undefined) ?? `${vendor.split('_')[0].toUpperCase()}-${deviceType.toUpperCase()}`;
  const id = (p['id'] as string | undefined) ?? uid('node', p['seed'] as string | undefined);
  const position = (p['position'] as { x: number; y: number } | undefined) ?? {
    x: 200 + Math.floor(Math.random() * 400),
    y: 200 + Math.floor(Math.random() * 300),
  };

  const base = projectOf(ctx);
  if ('error' in base) return base.error;
  const project = base.project;

  if (project.nodes.some((n) => n.id === id)) {
    return { ok: false, message: `device dengan id "${id}" sudah ada`, error: 'duplicate-id' };
  }
  if (project.nodes.some((n) => n.name.toLowerCase() === name.toLowerCase())) {
    return { ok: false, message: `nama "${name}" sudah dipakai`, error: 'duplicate-name' };
  }

  const model = getDefaultModel(vendor, deviceType);
  const basePorts = getPortsForModel(vendor, model);

  let ports: PortSpec[];
  if (deviceType === 'wireless') {
    ports = [
      ...basePorts.slice(0, 2),
      { id: 'wlan1', name: 'wlan1', speedMbps: 300, status: 'up', macAddress: `52:54:00:AA:BB:02`, type: 'copper' },
      { id: 'wlan2', name: 'wlan2', speedMbps: 300, status: 'down', macAddress: `52:54:00:AA:BB:03`, type: 'copper' },
    ];
  } else if (deviceType === 'pc' || deviceType === 'server' || deviceType === 'windows-client') {
    ports = basePorts.slice(0, 1);
  } else {
    ports = basePorts;
  }

  const node: LabNode = {
    id,
    name,
    vendor,
    model,
    deviceType,
    position,
    ports,
    powered: true,
  };

  ctx.runtime.dispatcher.setNodeModelLabel(id, model);
  const next: LabProject = { ...project, nodes: [...project.nodes, node] };
  ctx.runtime.applyProject(next);
  ctx.runtime.persistMemory();

  return {
    ok: true,
    message: `Perangkat ${name} (${deviceType}, ${vendor}) dibuat dengan ${ports.length} port.`,
    data: { deviceId: id, name, deviceType, vendor, model, ports: ports.map((x) => x.id) },
    evidence: [`model=${model}`, `ports=${ports.map((x) => x.id).join(',')}`],
  };
}

/** Hapus perangkat + semua kabelnya. */
export function toolDeleteDevice(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const ref = p['deviceId'] as string;
  const base = projectOf(ctx);
  if ('error' in base) return base.error;
  const project = base.project;
  const node = nodeOf(project, ref);
  if (!node) return { ok: false, message: `device tidak ditemukan: ${ref}`, error: 'device-not-found' };

  const next: LabProject = {
    ...project,
    nodes: project.nodes.filter((n) => n.id !== node.id),
    edges: project.edges.filter((e) => e.sourceNodeId !== node.id && e.targetNodeId !== node.id),
  };
  ctx.runtime.dispatcher.forgetNodeMemory(node.id);
  ctx.runtime.applyProject(next);
  ctx.runtime.persistMemory();
  return {
    ok: true,
    message: `Perangkat ${node.name} dihapus (termasuk ${project.edges.length - next.edges.length} kabel).`,
    data: { deviceId: node.id, removed: true },
  };
}

/** Ganti nama perangkat. */
export function toolRenameDevice(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const ref = p['deviceId'] as string;
  const name = p['name'] as string;
  const base = projectOf(ctx);
  if ('error' in base) return base.error;
  const project = base.project;
  const node = nodeOf(project, ref);
  if (!node) return { ok: false, message: `device tidak ditemukan: ${ref}`, error: 'device-not-found' };
  if (project.nodes.some((n) => n.id !== node.id && n.name.toLowerCase() === name.toLowerCase())) {
    return { ok: false, message: `nama "${name}" sudah dipakai`, error: 'duplicate-name' };
  }

  const next: LabProject = {
    ...project,
    nodes: project.nodes.map((n) => (n.id === node.id ? { ...n, name } : n)),
  };
  ctx.runtime.applyProject(next);
  return { ok: true, message: `Perangkat ${node.name} diubah namanya menjadi ${name}.`, data: { deviceId: node.id, name } };
}

/** Pindahkan perangkat (posisi canvas). */
export function toolMoveDevice(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const ref = p['deviceId'] as string;
  const pos = p['position'] as { x: number; y: number };
  const base = projectOf(ctx);
  if ('error' in base) return base.error;
  const project = base.project;
  const node = nodeOf(project, ref);
  if (!node) return { ok: false, message: `device tidak ditemukan: ${ref}`, error: 'device-not-found' };

  const next: LabProject = {
    ...project,
    nodes: project.nodes.map((n) => (n.id === node.id ? { ...n, position: pos } : n)),
  };
  ctx.runtime.applyProject(next);
  return { ok: true, message: `Perangkat ${node.name} dipindah ke (${pos.x}, ${pos.y}).`, data: { deviceId: node.id, position: pos } };
}

/** Hubungkan dua perangkat via port (validasi okupansi + tipe port). */
export function toolConnectDevices(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const sourceRef = p['sourceDeviceId'] as string;
  const targetRef = p['targetDeviceId'] as string;
  const sourcePort = (p['sourceInterfaceId'] as string | undefined) ?? '';
  const targetPort = (p['targetInterfaceId'] as string | undefined) ?? '';
  const edgeId = (p['id'] as string | undefined) ?? uid('edge', p['seed'] as string | undefined);

  const base = projectOf(ctx);
  if ('error' in base) return base.error;
  const project = base.project;

  const src = nodeOf(project, sourceRef);
  const tgt = nodeOf(project, targetRef);
  if (!src) return { ok: false, message: `device sumber tidak ditemukan: ${sourceRef}`, error: 'source-not-found' };
  if (!tgt) return { ok: false, message: `device tujuan tidak ditemukan: ${targetRef}`, error: 'target-not-found' };
  if (src.id === tgt.id) return { ok: false, message: 'Tidak bisa menghubungkan device ke dirinya sendiri.', error: 'self-connect' };

  const srcPort = sourcePort ? portOf(src, sourcePort) : undefined;
  const tgtPort = targetPort ? portOf(tgt, targetPort) : undefined;
  if (sourcePort && !srcPort) return { ok: false, message: `port "${sourcePort}" tidak ada di ${src.name}`, error: 'port-not-found' };
  if (targetPort && !tgtPort) return { ok: false, message: `port "${targetPort}" tidak ada di ${tgt.name}`, error: 'port-not-found' };

  const pickFreePort = (node: LabNode, other: LabNode, preferred?: PortSpec): PortSpec | undefined => {
    if (preferred && !isBusy(project, node.id, preferred.id)) return preferred;
    const candidates = node.ports.filter((port) => !isBusy(project, node.id, port.id));
    const sameType = candidates.find((port) => port.type === other.ports.find((x) => x.id === preferred?.id)?.type);
    return sameType ?? candidates[0];
  };

  const chosenSrc = srcPort && !isBusy(project, src.id, srcPort.id) ? srcPort : pickFreePort(src, tgt, srcPort);
  const chosenTgt = tgtPort && !isBusy(project, tgt.id, tgtPort.id) ? tgtPort : pickFreePort(tgt, src, tgtPort);

  if (!chosenSrc) return { ok: false, message: `semua port ${src.name} sudah terpakai`, error: 'no-free-port' };
  if (!chosenTgt) return { ok: false, message: `semua port ${tgt.name} sudah terpakai`, error: 'no-free-port' };
  if (isBusy(project, src.id, chosenSrc.id)) return { ok: false, message: `port ${src.name}:${chosenSrc.name} sudah terpakai`, error: 'port-busy' };
  if (isBusy(project, tgt.id, chosenTgt.id)) return { ok: false, message: `port ${tgt.name}:${chosenTgt.name} sudah terpakai`, error: 'port-busy' };
  if (chosenSrc.type !== chosenTgt.type) {
    return { ok: false, message: `tipe port tidak cocok: ${chosenSrc.type} vs ${chosenTgt.type}`, error: 'type-mismatch' };
  }

  const cableType = inferCableType(src.deviceType, tgt.deviceType, chosenSrc.type, chosenTgt.type);
  const edge: LabEdge = {
    id: edgeId,
    sourceNodeId: src.id,
    sourcePortId: chosenSrc.id,
    targetNodeId: tgt.id,
    targetPortId: chosenTgt.id,
    cableType,
  };

  const exists = project.edges.some(
    (e) =>
      (e.sourceNodeId === src.id && e.sourcePortId === chosenSrc.id) ||
      (e.targetNodeId === src.id && e.targetPortId === chosenSrc.id)
  );
  if (exists) return { ok: false, message: `port ${src.name}:${chosenSrc.name} sudah terpakai`, error: 'port-busy' };

  const next: LabProject = { ...project, edges: [...project.edges, edge] };
  ctx.runtime.applyProject(next);
  return {
    ok: true,
    message: `Kabel ${cableType}: ${src.name}:${chosenSrc.name} ↔ ${tgt.name}:${chosenTgt.name}`,
    data: { edgeId, sourceDeviceId: src.id, sourceInterfaceId: chosenSrc.id, targetDeviceId: tgt.id, targetInterfaceId: chosenTgt.id, cableType },
  };
}

/** Putuskan kabel antara dua device (atau seluruh kabel ke satu device). */
export function toolDisconnectDevices(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const sourceRef = p['sourceDeviceId'] as string;
  const targetRef = (p['targetDeviceId'] as string | undefined) ?? '';
  const base = projectOf(ctx);
  if ('error' in base) return base.error;
  const project = base.project;

  const src = nodeOf(project, sourceRef);
  if (!src) return { ok: false, message: `device tidak ditemukan: ${sourceRef}`, error: 'device-not-found' };

  let removed = 0;
  let edges = project.edges;
  if (targetRef) {
    const tgt = nodeOf(project, targetRef);
    if (!tgt) return { ok: false, message: `device tidak ditemukan: ${targetRef}`, error: 'target-not-found' };
    const before = edges.length;
    edges = edges.filter(
      (e) =>
        !(
          (e.sourceNodeId === src.id && e.targetNodeId === tgt.id) ||
          (e.sourceNodeId === tgt.id && e.targetNodeId === src.id)
        )
    );
    removed = before - edges.length;
  } else {
    removed = edges.filter((e) => e.sourceNodeId === src.id || e.targetNodeId === src.id).length;
    edges = edges.filter((e) => e.sourceNodeId !== src.id && e.targetNodeId !== src.id);
  }

  if (removed === 0) {
    return { ok: false, message: `tidak ada kabel ${targetRef ? `antara ${src.name} dan ${targetRef}` : `ke ${src.name}`}`, error: 'no-link' };
  }

  const next: LabProject = { ...project, edges };
  ctx.runtime.applyProject(next);
  return { ok: true, message: `${removed} kabel dilepas.`, data: { removed } };
}

/** Perbarui properti perangkat (powered). */
export function toolUpdateDeviceProperties(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const ref = p['deviceId'] as string;
  const powered = p['powered'] as boolean | undefined;
  const base = projectOf(ctx);
  if ('error' in base) return base.error;
  const project = base.project;
  const node = nodeOf(project, ref);
  if (!node) return { ok: false, message: `device tidak ditemukan: ${ref}`, error: 'device-not-found' };

  const next: LabProject = {
    ...project,
    nodes: project.nodes.map((n) =>
      n.id === node.id ? { ...n, powered: powered ?? n.powered } : n
    ),
  };
  ctx.runtime.applyProject(next);
  return {
    ok: true,
    message: `${node.name}: powered=${powered ?? node.powered}`,
    data: { deviceId: node.id, powered: powered ?? node.powered },
  };
}

/** Perbarui properti interface (ipAddress di UI, dipakai display awal). */
export function toolUpdateInterfaceProperties(ctx: ToolExecCtx, p: Record<string, unknown>): ToolResult {
  const ref = p['deviceId'] as string;
  const ifaceRef = p['interfaceId'] as string;
  const ip = (p['ipAddress'] as string | undefined) ?? null;
  const base = projectOf(ctx);
  if ('error' in base) return base.error;
  const project = base.project;
  const node = nodeOf(project, ref);
  if (!node) return { ok: false, message: `device tidak ditemukan: ${ref}`, error: 'device-not-found' };
  const port = portOf(node, ifaceRef);
  if (!port) return { ok: false, message: `interface tidak ditemukan: ${ifaceRef}`, error: 'interface-not-found' };

  const next: LabProject = {
    ...project,
    nodes: project.nodes.map((n) =>
      n.id === node.id
        ? {
            ...n,
            ports: n.ports.map((x) =>
              x.id === port.id ? { ...x, ipAddress: ip === null ? undefined : ip } : x
            ),
          }
        : n
    ),
  };
  ctx.runtime.applyProject(next);
  return { ok: true, message: `${node.name}:${port.name} ip=${ip ?? '(hapus)'}`, data: { deviceId: node.id, interfaceId: port.id, ipAddress: ip } };
}