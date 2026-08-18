// ============================================================
// SnmpService — MIB per perangkat (OID → nilai/tipe) + lookup.
// OID mengikuti struktur standar:
//   .1.3.6.1.2.1.1  = system   (sysDescr, sysUpTime, sysName, ...)
//   .1.3.6.1.2.1.2  = interfaces (tabel ifTable)
//   .1.3.6.1.2.1.4  = ip (ipRouteTable)
// Nilai dibangun dinamis dari state perangkat (interfaces/routes/time)
// sehingga snmpget dari host lain menampilkan data nyata.
// ============================================================

import { NetworkDevice } from '../devices/NetworkDevice';

const PREFIX = '.1.3.6.1.2.1';
const SYS = `${PREFIX}.1`;
const IF = `${PREFIX}.2.2.1`;
const RT = `${PREFIX}.4.21.1`;

export interface MibEntry {
  value: string;
  type: string;
}

/** Tipe untuk nilai OID (ASN.1 SNMP). */
const TYPE_STRING = 'STRING';
const TYPE_INTEGER = 'INTEGER';
const TYPE_TIMETICKS = 'Timeticks';
const TYPE_IPADDRESS = 'IpAddress';
const TYPE_GAUGE = 'Gauge32';

/** Bandingkan dua OID secara lexicographic (baris komponen integer). */
export function compareOid(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  const n = Math.min(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return pa.length - pb.length;
}

/** Bangun snapshot MIB perangkat dari state nyata. `now` = waktu virtual (ms). */
export function buildMib(dev: NetworkDevice, now: number): Map<string, MibEntry> {
  const mib = new Map<string, MibEntry>();

  // system
  mib.set(`${SYS}.1.0`, { value: `NetLab Network Simulator - ${dev.deviceType} ${dev.name} (${dev.vendor})`, type: TYPE_STRING });
  mib.set(`${SYS}.2.0`, { value: '1.3.6.1.4.1.999999.1', type: TYPE_STRING });
  // sysUpTime berdetak mengikuti waktu virtual sejak agent diaktifkan.
  // sysUpTime: berdetak sejak agent aktif (snmpUptimeBase); tanpa agent → 0.
  const base = dev.snmpUptimeBase ?? now;
  const ticks = Math.max(0, Math.floor((now - base) / 100));
  const h = Math.floor(ticks / 36000) % 24;
  const m = Math.floor(ticks / 600) % 60;
  const s = Math.floor(ticks / 100) % 60;
  mib.set(`${SYS}.3.0`, { value: `(${ticks}) ${h}:${m}:${s}.00`, type: TYPE_TIMETICKS });
  mib.set(`${SYS}.4.0`, { value: dev.snmpAgent?.sysContact || '', type: TYPE_STRING });
  mib.set(`${SYS}.5.0`, { value: dev.name, type: TYPE_STRING });
  mib.set(`${SYS}.6.0`, { value: dev.snmpAgent?.sysLocation || '', type: TYPE_STRING });

  // interfaces (ifTable) — termasuk penghitung RFC 1213 (kolom 10/11/14/15).
  let idx = 1;
  for (const iface of dev.getInterfaces()) {
    const i = idx++;
    const c = dev.ifaceCounters.get(iface.name) || { inPkts: 0, outPkts: 0, inOctets: 0, outOctets: 0 };
    mib.set(`${IF}.1.${i}`, { value: String(i), type: TYPE_INTEGER });
    mib.set(`${IF}.2.${i}`, { value: iface.name, type: TYPE_STRING });
    mib.set(`${IF}.3.${i}`, { value: '6', type: TYPE_INTEGER });
    mib.set(`${IF}.6.${i}`, { value: macOid(iface.mac), type: TYPE_STRING });
    mib.set(`${IF}.7.${i}`, { value: iface.up ? '1' : '2', type: TYPE_INTEGER });
    mib.set(`${IF}.8.${i}`, { value: iface.up ? '1' : '2', type: TYPE_INTEGER });
    mib.set(`${IF}.5.${i}`, { value: String(iface.speedMbps ? iface.speedMbps * 1_000_000 : 10_000_000), type: TYPE_GAUGE });
    mib.set(`${IF}.10.${i}`, { value: String(c.inOctets), type: TYPE_GAUGE });
    mib.set(`${IF}.11.${i}`, { value: String(c.inPkts), type: TYPE_GAUGE });
    mib.set(`${IF}.14.${i}`, { value: String(c.outOctets), type: TYPE_GAUGE });
    mib.set(`${IF}.15.${i}`, { value: String(c.outPkts), type: TYPE_GAUGE });
  }

  // ipRouteTable (iap route: dest + next-hop)
  for (const r of dev.getRoutes()) {
    const dst = r.dst.split('/')[0];
    const root = `${RT}.${dst}`;
    mib.set(`${root}.1`, { value: dst, type: TYPE_IPADDRESS });
    mib.set(`${root}.7`, { value: r.gateway || dst, type: TYPE_IPADDRESS });
  }

  return mib;
}

/** Lookup OID → nilai. Untuk getNext/walk: OID berikutnya setelah `oid` (lexicographic). */
export function mibLookup(mib: Map<string, MibEntry>, oid: string, walk = false): { oid: string; entry: MibEntry } | null {
  if (!walk) {
    const e = mib.get(oid);
    return e ? { oid, entry: e } : null;
  }
  let best: { oid: string; entry: MibEntry } | null = null;
  for (const [k, entry] of mib) {
    if (compareOid(k, oid) > 0 && (!best || compareOid(k, best.oid) < 0)) {
      best = { oid: k, entry };
    }
  }
  return best;
}

/** Normalisasi OID input pasien: bersihkan spasi, awalan 'iso', 'iso.org', dan titik. */
export function normalizeOid(oid: string): string {
  let o = oid.trim().replace(/\s+/g, '').replace(/[A-Za-z]+/g, '');
  while (o.length > 1 && o.endsWith('.')) o = o.slice(0, -1);
  if (!o.startsWith('.')) o = '.' + o;
  if (!/^(\.[0-9]+)+$/.test(o)) return `${SYS}.1.0`;
  return o;
}

function macOid(mac: string): string {
  const clean = mac.replace(/[.:-]/g, '');
  const bytes = clean.match(/.{1,2}/g) || [];
  return bytes.map((b) => String(parseInt(b, 16))).join('.');
}