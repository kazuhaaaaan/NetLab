/**
 * Validasi struktur proyek (.mlab / LabProject) sebelum digunakan.
 * Semua kegagalan menghasilkan error terstruktur { code, message, path }
 * — tidak pernah crash.
 */
import { getModelsForVendor } from '../data/deviceModels';
import { validateIpv4, validateIpv4Cidr, validateIpv6 } from './validation';

export interface ValidationError {
  code: string;
  message: string;
  path: string;
}

export type ValidationResult =
  | { ok: true; project: any }
  | { ok: false; error: ValidationError };

const KNOWN_VENDORS = [
  'mikrotik',
  'cisco_ios',
  'cisco_nxos',
  'juniper',
  'huawei',
  'ubiquiti',
  'vyos',
  'fortinet',
  'aruba',
  'openwrt',
  'linux',
  'windows',
];

export const SCHEMA_VERSION = '1.0';

/** Versi engine sim (state versioning .mlab). */
export const ENGINE_VERSION = '1.0.0';

/** true bila `obj` berupa string non-kosong. */
function isStr(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/** Ambil proyek dari file .mlab (raw LabProject ATAU wrapper { project, deviceConfigs }). */
export function unwrapProjectFile(parsed: any): { project: any; deviceConfigs?: Record<string, any>; schemaVersion?: number } {
  // Envelope baru: { schemaVersion, project, deviceConfigs } — ditulis exportProjectAsFile.
  if (parsed && parsed.project && typeof parsed.project === 'object') {
    const schemaVersion =
      typeof parsed.schemaVersion === 'number'
        ? parsed.schemaVersion
        : typeof parsed.version === 'string' && parsed.version !== ''
          ? 1
          : undefined;
    return { project: parsed.project, deviceConfigs: parsed.deviceConfigs, schemaVersion };
  }
  // Envelope alternatif { devices, links, configuration } → migrasi ke nodes/edges.
  if (parsed && Array.isArray(parsed.devices) && Array.isArray(parsed.links)) {
    const migrated = {
      ...parsed,
      nodes: parsed.devices,
      edges: parsed.links,
      version: SCHEMA_VERSION,
    };
    delete migrated.devices;
    delete migrated.links;
    delete migrated.configuration;
    return {
      project: migrated,
      deviceConfigs: parsed.configuration,
      schemaVersion: typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : 1,
    };
  }
  return { project: parsed, schemaVersion: undefined };
}

export function validateProject(input: any): ValidationResult {
  const fail = (code: string, message: string, path: string): ValidationResult => ({
    ok: false,
    error: { code, message, path },
  });

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return fail('INVALID_PROJECT', 'Project harus berupa objek JSON', '$');
  }

  // Schema version — terima tanpa version (proyek lama) tapi tolak versi tidak dikenal.
  if (input.version !== undefined && input.version !== SCHEMA_VERSION) {
    return fail(
      'UNSUPPORTED_SCHEMA_VERSION',
      `Schema version "${String(input.version)}" tidak didukung (harus "${SCHEMA_VERSION}")`,
      'version'
    );
  }
  if (!Array.isArray(input.nodes)) {
    return fail('MISSING_NODES', 'Project tidak memiliki array "nodes"', 'nodes');
  }
  if (!Array.isArray(input.edges)) {
    return fail('MISSING_EDGES', 'Project tidak memiliki array "edges"', 'edges');
  }

  const nodeIds = new Set<string>();
  const nodePorts = new Map<string, Set<string>>();
  const edgeIds = new Set<string>();

  for (let i = 0; i < input.nodes.length; i++) {
    const n = input.nodes[i];
    const np = `nodes[${i}]`;
    if (n === null || typeof n !== 'object') {
      return fail('INVALID_NODE', 'Node harus berupa objek', np);
    }
    if (!isStr(n.id)) return fail('INVALID_NODE_ID', 'Node harus punya "id" string', `${np}.id`);
    if (!isStr(n.name)) return fail('INVALID_NODE_NAME', 'Node harus punya "name" string', `${np}.name`);
    if (nodeIds.has(n.id)) {
      return fail('DUPLICATE_NODE_ID', `Duplicate node id "${n.id}"`, `${np}.id`);
    }
    nodeIds.add(n.id);

    if (!KNOWN_VENDORS.includes(n.vendor)) {
      return fail('UNKNOWN_VENDOR', `Vendor "${String(n.vendor)}" tidak dikenal`, `${np}.vendor`);
    }
    if (typeof n.model !== 'string' || !getModelsForVendor(n.vendor).some((m) => m.label === n.model)) {
      return fail(
        'UNKNOWN_MODEL',
        `Model "${String(n.model)}" tidak dikenal untuk vendor ${n.vendor}`,
        `${np}.model`
      );
    }
    if (!Array.isArray(n.ports)) {
      return fail('MISSING_PORTS', `Node "${n.id}" tidak memiliki array "ports"`, `${np}.ports`);
    }
    const portIds = new Set<string>();
    for (let j = 0; j < n.ports.length; j++) {
      const p = n.ports[j];
      const pp = `${np}.ports[${j}]`;
      if (p === null || typeof p !== 'object' || !isStr(p.id)) {
        return fail('INVALID_PORT', 'Port harus berupa objek dengan "id" string', pp);
      }
      if (portIds.has(p.id)) {
        return fail('DUPLICATE_PORT_ID', `Duplicate port id "${p.id}" di node "${n.id}"`, `${pp}.id`);
      }
      portIds.add(p.id);
      const rawIp = (p as any).ipAddress;
      if (rawIp !== undefined && rawIp !== null && rawIp !== '') {
        const ipStr = String(rawIp);
        const cidr = ipStr.includes('/');
        if (cidr ? !validateIpv4Cidr(ipStr) : !(validateIpv4(ipStr) || validateIpv6(ipStr))) {
          return fail('INVALID_PORT_IP', `IP "${ipStr}" tidak valid di port`, pp);
        }
      }
    }
    nodePorts.set(n.id, portIds);
  }

  for (let i = 0; i < input.edges.length; i++) {
    const e = input.edges[i];
    const ep = `edges[${i}]`;
    if (e === null || typeof e !== 'object') {
      return fail('INVALID_EDGE', 'Edge harus berupa objek', ep);
    }
    if (!isStr(e.id)) return fail('INVALID_EDGE_ID', 'Edge harus punya "id" string', `${ep}.id`);
    if (edgeIds.has(e.id)) {
      return fail('DUPLICATE_EDGE_ID', `Duplicate edge id "${e.id}"`, `${ep}.id`);
    }
    edgeIds.add(e.id);

    for (const side of ['source', 'target'] as const) {
      const nid = e[`${side}NodeId`];
      const pid = e[`${side}PortId`];
      if (!isStr(nid)) return fail('INVALID_EDGE_ENDPOINT', `Edge "${e.id}" tanpa "${side}NodeId"`, `${ep}.${side}NodeId`);
      if (!isStr(pid)) return fail('INVALID_EDGE_ENDPOINT', `Edge "${e.id}" tanpa "${side}PortId"`, `${ep}.${side}PortId`);
      if (!nodeIds.has(nid)) {
        return fail('EDGE_MISSING_NODE', `Edge "${e.id}" merujuk node "${nid}" yang tidak ada`, `${ep}.${side}NodeId`);
      }
      const ports = nodePorts.get(nid);
      if (ports && !ports.has(pid)) {
        return fail('EDGE_MISSING_PORT', `Edge "${e.id}" merujuk port "${pid}" yang tidak ada di node "${nid}"`, `${ep}.${side}PortId`);
      }
    }

    // self-loop: node+port yang sama di kedua ujung.
    if (e.sourceNodeId === e.targetNodeId && e.sourcePortId === e.targetPortId) {
      return fail('SELF_LOOP_EDGE', `Edge "${e.id}" menghubungkan port ke dirinya sendiri`, ep);
    }
    // duplicate edge: dua kabel identik antara port yang sama.
    const key = [e.sourceNodeId, e.sourcePortId, e.targetNodeId, e.targetPortId].join('|');
    const keyRev = [e.targetNodeId, e.targetPortId, e.sourceNodeId, e.sourcePortId].join('|');
    let seen = false;
    for (let k = 0; k < i; k++) {
      const p = input.edges[k];
      const kk = [p.sourceNodeId, p.sourcePortId, p.targetNodeId, p.targetPortId].join('|');
      if (kk === key || kk === keyRev) {
        seen = true;
        break;
      }
    }
    if (seen) {
      return fail('DUPLICATE_EDGE', `Edge "${e.id}" duplikat dari kabel yang sudah ada`, ep);
    }
  }

  return { ok: true, project: input };
}

/** Ringkas semua masalah proyek untuk tampilan UI (tanpa throw). */
export function summarizeProject(input: any): { valid: boolean; errors: ValidationError[] } {
  const res = validateProject(input);
  if ('error' in res) return { valid: false, errors: [res.error] };
}
