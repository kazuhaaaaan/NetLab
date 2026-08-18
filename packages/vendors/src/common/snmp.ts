// GENERATED — engine SNMP (diekstraksi dari index.ts lama).

import type { NodeMemory, VendorContext, CommandResult } from './types';

export function snmpCommand(raw: string, vendorId: string, mem: NodeMemory, context: VendorContext): CommandResult | undefined {
  const t = raw.trim();
  let m: RegExpMatchArray | null;

  // ── Query tools (Linux / OpenWrt) ──────────────────────────────
  if ((vendorId === 'linux' || vendorId === 'openwrt') && context && typeof context.snmpQueryProvider === 'function') {
    const q = matchSnmpQuery(t);
    if (q) {
      const host = q.host;
      const community = q.community || 'public';
      const oid = String(q.oid || '.1.3.6.1.2.1.1.1.0');
      const opts = { walk: q.walk, setValue: q.value };
      const res = context.snmpQueryProvider(host, community, oid, opts);
      return { type: 'snmp_query', result: res, host, oid, community, tool: q.tool, numeric: q.numeric, setValue: q.value };
    }
  }

  // ── MikroTik: /snmp set enabled=yes community=public / /snmp print ──
  if (vendorId === 'mikrotik' && /^\/snmp/i.test(t)) {
    if (/\/snmp\s+print/i.test(t) || /^\/snmp\s*$/i.test(t)) return { type: 'snmp_print', snmp: mem.snmp };
    if (/^\/snmp\s+set/i.test(t)) {
      const ok = setSnmpPairs(t, mem);
      return ok ? { type: 'snmp_ok' } : { raw: '% Usage: /snmp set enabled=yes community=<community>' };
    }
    return undefined;
  }

  // ── Cisco IOS / NX-OS / Aruba / Huawei ios-style ───────────────
  if ((vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba' || vendorId === 'huawei') && /^snmp[- ](agent|server)/i.test(t) && vendorId !== 'huawei') {
    m = t.match(/^snmp[- ]server\s+community\s+(\S+)\s+(ro|rw|read[-\s]?only|read[-\s]?write)/i) ||
        t.match(/^snmp[- ]server\s+community\s+(\S+)\s*$/i);
    if (m) {
      const comm = m[1];
      const right = String(m[2] || 'ro').toLowerCase();
      mem.snmp.enabled = true;
      mem.snmp.community = comm;
      if (right.includes('rw') || right.includes('write')) mem.snmp.communityRW = comm;
      return { type: 'snmp_print', snmp: mem.snmp };
    }
    return { type: 'snmp_print', snmp: mem.snmp };
  }
  // Huawei VRP
  if (vendorId === 'huawei' && /^snmp[- ]?agent/i.test(t)) {
    m = t.match(/^snmp[- ]?agent\s+community\s+(read|write)\s+(\S+)/i) ||
        t.match(/^snmp[- ]agent\s+sys[- ]?info\s+(contact|location)\s+(.+)/i);
    if (m) {
      if (m[1].toLowerCase() === 'read') {
        mem.snmp.enabled = true;
        mem.snmp.community = m[2];
      } else if (m[1].toLowerCase() === 'write') {
        mem.snmp.enabled = true;
        mem.snmp.communityRW = m[2];
      } else {
        mem.snmp[m[1].toLowerCase()] = m[2];
      }
      return { type: 'snmp_print', snmp: mem.snmp };
    }
    if (/^snmp[- ]?agent\s*$/i.test(t)) {
      mem.snmp.enabled = true;
      return { type: 'snmp_print', snmp: mem.snmp };
    }
  }

  // ── Juniper: set snmp ... ──────────────────────────────────────
  if ((vendorId === 'juniper' || vendorId === 'vyos' || vendorId === 'ubiquiti') && t.toLowerCase().includes(' snmp')) {
    if (/^set\s+snmp\s*$/i.test(t)) {
      mem.snmp.enabled = true;
      return { type: 'snmp_print', snmp: mem.snmp };
    }
    if (/^set\s+snmp\s+community\s+(\S+)\s+authorization\s+(read-only|read-write)/i.test(t)) {
      m = t.match(/^set\s+snmp\s+community\s+(\S+)\s+authorization\s+(read-only|read-write)/i);
      if (m) {
        mem.snmp.enabled = true;
        mem.snmp.community = m[1];
        if (m[2].toLowerCase() === 'read-write') mem.snmp.communityRW = m[1];
        return { type: 'snmp_print', snmp: mem.snmp };
      }
    }
    if (/^set\s+snmp\s+community\s+(\S+)/i.test(t)) {
      m = t.match(/^set\s+snmp\s+community\s+(\S+)/i);
      if (m) {
        mem.snmp.enabled = true;
        mem.snmp.community = m[1];
        return { type: 'snmp_print', snmp: mem.snmp };
      }
    }
    if (/^set\s+snmp\s+(contact|location)\s+\"?([^"]+)\"?$/i.test(t)) {
      m = t.match(/^set\s+snmp\s+(contact|location)\s+\"?([^"]+)\"?$/i);
      if (m) {
        mem.snmp.enabled = true;
        mem.snmp[m[1].toLowerCase() === 'contact' ? 'sysContact' : 'sysLocation'] = m[2];
        return { type: 'snmp_print', snmp: mem.snmp };
      }
    }
    if (/^(?:set\s+)?service\s+snmp\s*$/i.test(t)) {
      mem.snmp.enabled = true;
      return { type: 'snmp_print', snmp: mem.snmp };
    }
    if (/^show\s+(configuration\s+)?snmp/i.test(t) || /^run\s+show\s+service\s+snmp/i.test(t) || /^show\s+service\s+snmp/i.test(t)) {
      return { type: 'snmp_print', snmp: mem.snmp };
    }
  }

  // ── VyOS: set service snmp community <c> ... / show service snmp ──
  if ((vendorId === 'vyos' || vendorId === 'ubiquiti') && /^set\s+service\s+snmp/i.test(t)) {
    m = t.match(/^set\s+service\s+snmp\s+community\s+(\S+)\s*(authorization\s+(read-only|read-write))?/i);
    if (m) mem.snmp.community = m[1];
    if (m && m[3] && /write/.test(m[3])) mem.snmp.communityRW = m[1];
    if (m) mem.snmp.enabled = true;
    m = t.match(/^set\s+service\s+snmp\s+(contact|location)\s+(.+)/i);
    if (m) mem.snmp[m[1].toLowerCase() === 'contact' ? 'sysContact' : 'sysLocation'] = m[2];
    if (m) mem.snmp.enabled = true;
    return { type: 'snmp_print', snmp: mem.snmp };
  }
  if ((vendorId === 'vyos' || vendorId === 'ubiquiti') && /^show\s+service\s+snmp/i.test(t)) {
    return { type: 'snmp_print', snmp: mem.snmp };
  }

  // ── OpenWrt: uci snmpd ─────────────────────────────────────────
  if (vendorId === 'openwrt' && /^uci\s+set\s+snmpd/i.test(t)) {
    const v = t.replace(/^uci\s+set\s+snmpd\./, '');
    const eq = v.indexOf('=');
    if (eq > 0) {
      const k = v.slice(0, eq).toLowerCase();
      const val = v.slice(eq + 1);
      if (k === 'community') mem.snmp.community = val;
      else if (k === 'contact') mem.snmp.sysContact = val;
      else if (k === 'location') mem.snmp.sysLocation = val;
      else if (k.endsWith('enabled') || k.endsWith('enable')) mem.snmp.enabled = val === '1' || val === 'yes';
      if (mem.snmp.community) mem.snmp.enabled = true;
    }
    return { raw: '' };
  }
  if (vendorId === 'openwrt' && /^uci\s+commit\s+snmpd/i.test(t)) return { raw: '' };
  if (vendorId === 'openwrt' && /^(uci\s+show\s+snmpd|cat\s+\/etc\/snmp\/snmpd\.conf)/i.test(t)) {
    return { type: 'snmp_print', snmp: mem.snmp };
  }
  if (vendorId === 'openwrt' && /^(\/etc\/init\.d\/snmpd\s+(?:enable|start)|service\s+snmpd\s+(?:start|restart|enable))/i.test(t)) {
    mem.snmp.enabled = true;
    return { raw: '' };
  }

  // ── Linux: /etc/snmp/snmpd.conf + service snmpd ────────────────
  if (vendorId === 'linux') {
    m = t.match(/^echo\s+["']?(\w+(?:ro|rw)community\s+\S+)["']?\s+(>>|>)\s*\/etc\/snmp\/snmpd\.conf/i);
    if (m) {
      const directive = m[1].toLowerCase();
      const comm = m[1].split(/\s+/)[1] || '';
      if (directive.includes('rocommunity')) {
        mem.snmp.enabled = true;
        mem.snmp.community = comm;
      } else if (directive.includes('rwcommunity')) {
        mem.snmp.enabled = true;
        mem.snmp.communityRW = comm;
      }
      return { raw: '' };
    }
    if (/^(service\s+snmpd\s+(start|restart)|systemctl\s+(start|enable|restart)\s+snmpd)/i.test(t)) {
      mem.snmp.enabled = true;
      return { raw: '' };
    }
    if (/^cat\s+\/etc\/snmp\/snmpd\.conf/i.test(t) || /^(service\s+snmpd\s+status|systemctl\s+status\s+snmpd)/i.test(t)) {
      return { type: 'snmp_print', snmp: mem.snmp };
    }
  }

  // ── View SNMP lintas vendor ────────────────────────────────────
  if (/^(show\s+snmp|display\s+snmp[- ]?agent|get\s+system\s+snmp\s+status)/i.test(t)) {
    return { type: 'snmp_print', snmp: mem.snmp };
  }

  return undefined;
}

export function setSnmpPairs(t: string, mem: NodeMemory): boolean {
  const body = t.replace(/^\/snmp\s+set/i, '').trim();
  const pairs = body.split(/\s+/).filter(Boolean);
  let any = false;
  for (const p of pairs) {
    const eq = p.indexOf('=');
    if (eq <= 0) continue;
    const k = p.slice(0, eq).toLowerCase();
    const v = p.slice(eq + 1);
    if (k === 'enabled') {
      mem.snmp.enabled = /^(yes|true|1|enabled|on)$/i.test(v);
    } else if (k === 'community') {
      mem.snmp.community = v;
      mem.snmp.enabled = true;
    } else if (k === 'contact') {
      mem.snmp.sysContact = v;
    } else if (k === 'location') {
      mem.snmp.sysLocation = v;
    } else {
      return false;
    }
    any = true;
  }
  return any;
}

export function matchSnmpQuery(t: string): {
  tool: string;
  host: string;
  community: string;
  oid: string;
  walk: boolean;
  numeric: boolean;
  value?: string;
} | null {
  const head = /^(snmpget|snmpgetnext|snmpwalk|snmpset)\b/i.exec(t);
  if (!head) return null;
  const tool = head[1].toLowerCase();
  const rest = t.slice(head[0].length);
  let community = 'public';
  let numeric = false;
  const cleaned = rest.replace(/-c\s+("([^"]*)"|\S+)/i, (_m, _x, quoted) => {
    community = (quoted !== undefined ? quoted : _m.split(/\s+/)[1] || 'public').replace(/"/g, '');
    return '';
  });
  const tokens = (cleaned.match(/"([^"]*)"|\S+/g) || []).map((tk) => tk.replace(/^"|"$/g, ''));
  const args = tokens.filter((tk) => {
    if (!tk.startsWith('-')) return true;
    if (tk.includes('n') || tk.includes('v')) numeric = true;
    return false;
  });
  const host = args[0] || '';
  if (!host) return null;
  const oid = args[1] || '.1.3.6.1.2.1.1.1.0';
  const value = tool === 'snmpset' ? args.slice(2).join(' ') : undefined;
  return { tool, host, community, oid, walk: tool === 'snmpwalk' || tool === 'snmpgetnext', numeric, value };
}
