import type { NodeMemory, MemoryRegistry } from './types';

// ============================================================
// MemoryRegistry — state per-node (running-config + startup-config).
// Dipindahkan dari VendorDispatcher lama; dispatcher baru hanya memakai
// instance registry ini (memenuhi interface MemoryRegistry di types.ts).
// ============================================================

/** State mentah default sebuah node (running-config kosong). */
export function blankNodeMemory(): NodeMemory {
  return {
    configuredIps: {},
    routes: [],
    bgp: { asn: '', routerId: '', peers: [] },
    snmp: { enabled: false, community: 'public', communityRW: 'private', sysContact: '', sysLocation: '' },
    hostname: '',
    modelLabel: '',
    vlans: [],
    dnsServers: [],
    dnsRecords: [],
    webServer: { enabled: true, port: 80, content: '' },
    dhcpPools: [],
    dhcpClients: [],
    natRules: [],
    acls: [],
    portVlans: {},
    routing: {
      ospf: { enabled: false, networks: [], interfaceCosts: {}, passiveInterfaces: [], areas: {} },
      rip: { enabled: false, networks: [] },
      eigrp: { enabled: false, asn: 0, networks: [] },
    },
    shutdownIfaces: [],
    subinterfaces: [],
    trunkPorts: [],
    trunkAllowed: {},
    trunkNative: {},
    queues: [],
    mangleRules: [],
    wireless: {},
    wirelessSecurityProfiles: {},
    stp: { enabled: true, priority: 32768, mode: 'rstp' },
    currentSsid: '',
    currentStaticDst: '',
    currentDhcpPool: '',
    currentProto: '',
    currentIface: '',
    currentVlan: '',
    natInsideIfaces: [],
    natOutsideIfaces: [],
    natAcls: {},
    currentDhcpSection: '',
    currentDhcpRange: false,
    bgpGroups: {},
    currentOspfArea: -1,
    currentOspfAreaView: false,
    configuredIps6: {},
    routes6: [],
    fhrpGroups: [],
    dhcpRelays: {},
    portSecurity: {},
    ipv6DhcpClients: [],
    fortiPath: [],
    fortiInRange: false,
    fortiDhcpIdx: 0,
    fortiRangeIdx: 0,
    fortiPendingVlan: 0,
    fortiAddresses: {},
    fortiDraft: {},
    fortiBgpPeer: '',
    fortiDhcpClient: '',
    currentAclId: '',
    natSrcDraft: {},
    natDstDraft: {},
    juniperSrcNat: {},
    juniperDstPool: {},
    uciPending: {},
    uciRedirects: {},
    ifaceSettings: {},
    juniperFilters: {},
    fortiAddrName: '',
    juniperCommitted: null,
  };
}

/** Snapshot konfigurasi Junos (tanpa field snapshot itu sendiri). */
export function juniperSnapshot(mem: NodeMemory): NodeMemory {
  const copy = JSON.parse(JSON.stringify(mem)) as NodeMemory;
  delete copy.juniperCommitted;
  return copy;
}

/** Restore konfigurasi Junos dari snapshot commit terakhir. */
export function restoreJuniper(mem: NodeMemory, snap: NodeMemory): void {
  const restored = JSON.parse(JSON.stringify(snap)) as NodeMemory;
  delete restored.juniperCommitted;
  Object.assign(mem, restored);
}

export class MemoryRegistryImpl implements MemoryRegistry {
  private nodeMemory: Map<string, NodeMemory> = new Map();
  private startupConfigs: Map<string, NodeMemory> = new Map();

  getNodeMemory(nodeId: string): NodeMemory {
    if (!this.nodeMemory.has(nodeId)) {
      this.nodeMemory.set(nodeId, blankNodeMemory());
    }
    return this.nodeMemory.get(nodeId) as NodeMemory;
  }

  forgetNodeMemory(nodeId: string): void {
    this.nodeMemory.delete(nodeId);
    this.startupConfigs.delete(nodeId);
  }

  /** Snapshot of all node configs — used to persist CLI state across refreshes. */
  serializeMemory(): Record<string, NodeMemory> {
    const out: Record<string, NodeMemory> = {};
    this.nodeMemory.forEach((mem, nodeId) => {
      out[nodeId] = JSON.parse(JSON.stringify(mem)) as NodeMemory;
    });
    return out;
  }

  /** Restore previously saved node configs (merges into existing memory). */
  restoreMemory(data: Record<string, unknown> | null | undefined): void {
    if (!data) return;
    for (const [nodeId, mem] of Object.entries(data)) {
      if (!mem || typeof mem !== 'object') continue;
      const target = this.getNodeMemory(nodeId);
      const m = mem as Record<string, unknown>;
      target.configuredIps = { ...target.configuredIps, ...((m.configuredIps as Record<string, unknown> | undefined) || {}) } as Record<string, string>;
      target.routes = [...((m.routes as RouteEntryLike[] | undefined) || [])] as typeof target.routes;
      target.bgp = { asn: '', routerId: '', peers: [], ...((m.bgp as Record<string, unknown> | undefined) || {}) };
      target.snmp = { enabled: false, community: 'public', communityRW: 'private', sysContact: '', sysLocation: '', ...((m.snmp as Record<string, unknown> | undefined) || {}) };
      if (typeof m.hostname === 'string') target.hostname = m.hostname;
      if (typeof m.modelLabel === 'string') target.modelLabel = m.modelLabel;
      if (Array.isArray(m.vlans)) target.vlans = m.vlans as NodeMemory['vlans'];
      if (Array.isArray(m.dnsServers)) target.dnsServers = m.dnsServers as string[];
      if (Array.isArray(m.dnsRecords)) target.dnsRecords = m.dnsRecords as NodeMemory['dnsRecords'];
      if (m.webServer && typeof m.webServer === 'object') target.webServer = { ...target.webServer, ...(m.webServer as Record<string, unknown>) } as NodeMemory['webServer'];
      if (Array.isArray(m.files)) target.files = m.files as NodeMemory['files'];
      if (Array.isArray(m.websites)) target.websites = m.websites as NodeMemory['websites'];
      if (Array.isArray(m.dhcpPools)) target.dhcpPools = m.dhcpPools as NodeMemory['dhcpPools'];
      if (Array.isArray(m.dhcpClients)) target.dhcpClients = m.dhcpClients as NodeMemory['dhcpClients'];
      if (typeof m.dhcpEnabled === 'boolean') target.dhcpEnabled = m.dhcpEnabled;
      if (Array.isArray(m.natRules)) target.natRules = m.natRules as NodeMemory['natRules'];
      if (Array.isArray(m.acls)) target.acls = m.acls as NodeMemory['acls'];
      if (m.portVlans && typeof m.portVlans === 'object') target.portVlans = { ...target.portVlans, ...(m.portVlans as Record<string, number>) };
      if (m.routing && typeof m.routing === 'object') {
        const r = m.routing as Record<string, unknown>;
        target.routing = {
          ospf: { enabled: false, networks: [], interfaceCosts: {}, passiveInterfaces: [], areas: {}, ...((r.ospf as Record<string, unknown> | undefined) || {}) },
          rip: { enabled: false, networks: [], ...((r.rip as Record<string, unknown> | undefined) || {}) },
          eigrp: { enabled: false, asn: 0, networks: [], ...((r.eigrp as Record<string, unknown> | undefined) || {}) },
        } as NodeMemory['routing'];
      }
      if (typeof m.currentStaticDst === 'string') target.currentStaticDst = m.currentStaticDst;
      if (typeof m.currentDhcpPool === 'string') target.currentDhcpPool = m.currentDhcpPool;
      if (typeof m.currentIface === 'string') target.currentIface = m.currentIface as string;
      if (typeof m.currentProto === 'string') target.currentProto = m.currentProto;
      if (Array.isArray(m.shutdownIfaces)) target.shutdownIfaces = m.shutdownIfaces as string[];
      if (Array.isArray(m.subinterfaces)) target.subinterfaces = m.subinterfaces as NodeMemory['subinterfaces'];
      if (Array.isArray(m.trunkPorts)) target.trunkPorts = m.trunkPorts as string[];
      if (m.trunkAllowed && typeof m.trunkAllowed === 'object') target.trunkAllowed = { ...(m.trunkAllowed as Record<string, number[]>) };
      if (m.trunkNative && typeof m.trunkNative === 'object') target.trunkNative = { ...(m.trunkNative as Record<string, number>) };
      if (Array.isArray(m.queues)) target.queues = m.queues as NodeMemory['queues'];
      if (Array.isArray(m.mangleRules)) target.mangleRules = m.mangleRules as NodeMemory['mangleRules'];
      if (m.wireless && typeof m.wireless === 'object') target.wireless = { ...target.wireless, ...(m.wireless as Record<string, unknown>) } as NodeMemory['wireless'];
      if (m.wirelessSecurityProfiles && typeof m.wirelessSecurityProfiles === 'object') target.wirelessSecurityProfiles = { ...(m.wirelessSecurityProfiles as Record<string, Record<string, unknown>>) };
      if (typeof m.currentSsid === 'string') target.currentSsid = m.currentSsid;
      if (m.stp && typeof m.stp === 'object') target.stp = { enabled: true, priority: 32768, mode: 'rstp', ...(m.stp as Record<string, unknown>) } as NodeMemory['stp'];
      if (m.configuredIps6 && typeof m.configuredIps6 === 'object') target.configuredIps6 = { ...target.configuredIps6, ...(m.configuredIps6 as Record<string, unknown>) } as Record<string, string>;
      if (Array.isArray(m.routes6)) target.routes6 = m.routes6 as NodeMemory['routes6'];
      if (Array.isArray(m.fhrpGroups)) target.fhrpGroups = m.fhrpGroups as NodeMemory['fhrpGroups'];
      if (m.dhcpRelays && typeof m.dhcpRelays === 'object') target.dhcpRelays = { ...target.dhcpRelays, ...(m.dhcpRelays as Record<string, unknown>) };
      if (m.portSecurity && typeof m.portSecurity === 'object') target.portSecurity = { ...(m.portSecurity as Record<string, unknown>) } as NodeMemory['portSecurity'];
      if (Array.isArray(m.ipv6DhcpClients)) target.ipv6DhcpClients = m.ipv6DhcpClients as NodeMemory['ipv6DhcpClients'];
      if (Array.isArray(m.natInsideIfaces)) target.natInsideIfaces = m.natInsideIfaces as string[];
      if (Array.isArray(m.natOutsideIfaces)) target.natOutsideIfaces = m.natOutsideIfaces as string[];
      if (m.natAcls && typeof m.natAcls === 'object') target.natAcls = { ...target.natAcls, ...(m.natAcls as Record<string, unknown>) };
      if (typeof m.currentDhcpSection === 'string') target.currentDhcpSection = m.currentDhcpSection;
      if (typeof m.currentDhcpRange === 'boolean') target.currentDhcpRange = m.currentDhcpRange;
      if (m.bgpGroups && typeof m.bgpGroups === 'object') target.bgpGroups = { ...target.bgpGroups, ...(m.bgpGroups as Record<string, unknown>) };
      if (Array.isArray(m.fortiPath)) target.fortiPath = m.fortiPath as string[];
      if (typeof m.fortiInRange === 'boolean') target.fortiInRange = m.fortiInRange;
      if (typeof m.fortiDhcpIdx === 'number') target.fortiDhcpIdx = m.fortiDhcpIdx;
      if (typeof m.fortiRangeIdx === 'number') target.fortiRangeIdx = m.fortiRangeIdx;
      if (typeof m.fortiPendingVlan === 'number') target.fortiPendingVlan = m.fortiPendingVlan;
      if (m.fortiAddresses && typeof m.fortiAddresses === 'object') target.fortiAddresses = { ...(m.fortiAddresses as Record<string, string>) };
      if (m.fortiDraft && typeof m.fortiDraft === 'object') target.fortiDraft = { ...(m.fortiDraft as Record<string, unknown>) };
      if (typeof m.fortiBgpPeer === 'string') target.fortiBgpPeer = m.fortiBgpPeer;
      if (typeof m.fortiDhcpClient === 'string') target.fortiDhcpClient = m.fortiDhcpClient;
      if (typeof m.currentAclId === 'string') target.currentAclId = m.currentAclId;
      if (m.natSrcDraft && typeof m.natSrcDraft === 'object') target.natSrcDraft = { ...(m.natSrcDraft as Record<string, Record<string, string>>) };
      if (m.natDstDraft && typeof m.natDstDraft === 'object') target.natDstDraft = { ...(m.natDstDraft as Record<string, Record<string, string>>) };
      if (m.juniperSrcNat && typeof m.juniperSrcNat === 'object') target.juniperSrcNat = { ...(m.juniperSrcNat as Record<string, unknown>) };
      if (m.juniperDstPool && typeof m.juniperDstPool === 'object') target.juniperDstPool = { ...(m.juniperDstPool as Record<string, unknown>) };
      if (m.uciPending && typeof m.uciPending === 'object') target.uciPending = { ...(m.uciPending as Record<string, string>) };
      if (m.uciRedirects && typeof m.uciRedirects === 'object') target.uciRedirects = { ...(m.uciRedirects as Record<string, Record<string, string>>) };
      if (m.juniperFilters && typeof m.juniperFilters === 'object') target.juniperFilters = { ...(m.juniperFilters as Record<string, unknown>) };
      if (typeof m.fortiAddrName === 'string') target.fortiAddrName = m.fortiAddrName;
      if (m.juniperCommitted && typeof m.juniperCommitted === 'object') {
        target.juniperCommitted = JSON.parse(JSON.stringify(m.juniperCommitted)) as NodeMemory;
      }
    }
  }

  setNodeModelLabel(nodeId: string, label: string): void {
    const mem = this.getNodeMemory(nodeId);
    mem.modelLabel = label;
  }

  /** Snapshot running-config node menjadi startup-config (write memory / save). */
  saveStartupConfig(nodeId: string): void {
    const mem = this.nodeMemory.get(nodeId);
    if (mem) this.startupConfigs.set(nodeId, JSON.parse(JSON.stringify(mem)) as NodeMemory);
  }

  /** Restore node dari startup-config (reload) — tanpa snapshot → default bersih. */
  reloadFromStartupConfig(nodeId: string): boolean {
    const saved = this.startupConfigs.get(nodeId);
    if (saved) this.nodeMemory.set(nodeId, JSON.parse(JSON.stringify(saved)) as NodeMemory);
    else this.nodeMemory.set(nodeId, blankNodeMemory());
    return !!saved;
  }
}

type RouteEntryLike = Record<string, unknown>;