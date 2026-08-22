// GENERATED — helper IP/prefix (diekstraksi dari index.ts lama).

export const isPrefix = (input: string | undefined, target: string) => !!input && target.startsWith(input.toLowerCase());

export function resolveIfaceName(ports: Array<Record<string, unknown>>, name: string | undefined): string | null {
  if (!name) return null;
  const found = (ports || []).find(
    (p: Record<string, unknown>) => String(p.name).toLowerCase() === name.toLowerCase()
  );
  return found ? String(found.name) : name;
}

export function isValidIpv4(ip: string): boolean {
  const parts = String(ip || '').split('.');
  if (parts.length !== 4) return false;
  return parts.every((o) => /^\d{1,3}$/.test(o) && Number(o) >= 0 && Number(o) <= 255);
}

/**
 * Validasi IPv6 ketat — selaras dengan engine core (src/engine/net/core/ipv6.ts):
 * - bracket [..] dan zone %iface diizinkan (dibuang sebelum cek)
 * - '::' maksimal satu, menggantikan minimal satu group nol
 * - bentuk penuh = tepat 8 group hex 1-4 digit
 * Menolak '2001:db8:::1', '1::2::3', ':1:2', '1:2:', group > 8, hex tak sah.
 */
export function isValidIpv6(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return false;
  let s = ip.trim().replace(/^\[|\]$/g, '');
  const zone = s.match(/%[a-zA-Z0-9]+$/);
  if (zone) s = s.slice(0, -zone[0].length);
  if (!s || s.includes('.') || !s.includes(':')) return false;
  if (/[^0-9a-fA-F:]/.test(s)) return false;
  if ((s.match(/::/g)?.length ?? 0) > 1) return false;

  const validGroup = (g: string): boolean => /^[0-9a-fA-F]{1,4}$/.test(g);
  const compress = s.split('::');

  if (compress.length === 2) {
    // Terkompresi: group kosong di head/tail ('1::2:' → tail ['','2']) gagal validGroup.
    const [head, tail] = compress;
    const groups = [...(head ? head.split(':') : []), ...(tail ? tail.split(':') : [])];
    if (!groups.every(validGroup)) return false;
    // '::' menggantikan minimal satu group → eksplisit harus < 8.
    return groups.length < 8;
  }
  const groups = s.split(':');
  return groups.length === 8 && groups.every(validGroup);
}

/** Mask dotted-quad kontigu: '255.255.0.0' valid; '255.255.0.1' / '255.0.255.0' tidak. */
export function isContiguousMask(mask: string): boolean {
  const m = String(mask || '').match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const octets = m.slice(1).map(Number);
  if (octets.some((o) => o < 0 || o > 255)) return false;
  const bits = octets.reduce((acc, o) => acc + (o.toString(2).match(/1/g) || []).length, 0);
  const expected = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (octets.reduce((acc, o) => (acc << 8) + o, 0) >>> 0) === expected;
}

/** Prefix numerik murni tanpa sampul: '24' sah; '24x', '-1', '' tidak. */
export function isStrictPrefix(p: string | undefined, max: number): boolean {
  if (p === undefined || p === '') return false;
  if (!/^\d{1,3}$/.test(String(p))) return false;
  const v = Number(p);
  return Number.isInteger(v) && v >= 0 && v <= max;
}

/** dst rute IPv4: 'A.B.C.D/M', pasangan IOS 'A.B.C.D M.M.M.M', atau IP polos (/32). */
export function isValidIpv4RouteDst(dst: string): boolean {
  const s = String(dst || '').trim();
  if (!s) return false;
  if (s.includes(' ')) {
    const [ip, mask] = s.split(/\s+/);
    return isValidIpv4(ip) && isContiguousMask(mask);
  }
  if (s.includes('/')) {
    const [ip, p] = s.split('/');
    return isValidIpv4(ip) && isStrictPrefix(p, 32);
  }
  return isValidIpv4(s);
}

/** dst rute IPv6: '<alamat>/M' dengan prefix 0..128. */
export function isValidIpv6RouteDst(dst: string): boolean {
  const s = String(dst || '').trim();
  if (!s || !s.includes('/')) return false;
  const slash = s.lastIndexOf('/');
  return isValidIpv6(s.slice(0, slash)) && isStrictPrefix(s.slice(slash + 1), 128);
}

/** Gateway/route-next-hop: alamat IP valid sesuai keluarga (v6 bila mengandung ':'). */
export function isValidRouteGateway(gw: string): boolean {
  const s = String(gw || '').trim();
  if (!s) return false;
  return s.includes(':') ? isValidIpv6(s) : isValidIpv4(s);
}

export function isValidPrefix(n: string | undefined, v6: boolean): boolean {
  if (n === undefined || n === '') return true;
  if (!/^\d{1,3}$/.test(String(n))) return false;
  const v = Number(n);
  return Number.isInteger(v) && v >= 0 && v <= (v6 ? 128 : 32);
}

/** Nilai konfigurasi alamat interface: "<ip>" atau "<ip>/<prefix>" — ketat.
 *  Menolak oktet/group di luar rentang, prefix sampah, dan prefix > maks. */
export function isValidIpCidrValue(value: string): boolean {
  const t = String(value ?? '').trim();
  if (!t) return false;
  const slash = t.indexOf('/');
  const addr = slash >= 0 ? t.slice(0, slash) : t;
  const prefix = slash >= 0 ? t.slice(slash + 1) : null;
  const v6 = addr.includes(':');
  if (prefix !== null && !isValidPrefix(prefix, v6)) return false;
  return v6 ? isValidIpv6(addr) : isValidIpv4(addr);
}

export function bitsToMask(bits: number): string {
  let mask = 0;
  for (let i = 0; i < 32; i++) {
    mask = (mask << 1) | (i < bits ? 1 : 0);
  }
  return [24, 16, 8, 0].map((s) => ((mask >>> s) & 255)).join('.');
}

export function broadcastOf(ip: string, prefix: number): string {
  const octets = String(ip || '').split('.').map(Number);
  if (octets.length !== 4 || octets.some((n) => isNaN(n))) return '0.0.0.0';
  let mask = 0;
  for (let i = 0; i < 32; i++) mask = (mask << 1) | (i < prefix ? 1 : 0);
  const inv = (0xffffffff ^ mask) >>> 0;
  return octets.map((o, k) => ((o & (((mask >>> ((3 - k) * 8)) & 255))) | ((inv >>> ((3 - k) * 8)) & 255))).join('.');
}

export function isKnownInterface(ports: Array<Record<string, unknown>>, name: string | undefined): boolean {
  if (!name) return false;
  const n = String(name).toLowerCase();
  if ((ports || []).some((p: Record<string, unknown>) => String(p.name || '').toLowerCase() === n || String(p.id || '').toLowerCase() === n)) return true;
  // Subinterface: "ether1.10" / "Gi0/0.10" — diizinkan walau belum terdaftar.
  const dot = n.indexOf('.');
  if (dot > 0 && dot < n.length - 1) return true;
  return false;
}

export function cidrOf(entry: string): string {
  if (!entry) return '';
  const s = entry.trim();
  if (s.includes('/')) return s;
  const parts = s.split(/\s+/);
  if (parts.length >= 2) {
    return `${String(parts[0])}/${String(maskToBits(parts[1]))}`;
  }
  return s;
}

export function maskToBits(mask: string): number {
  const octets = mask.split('.').map(Number);
  let bits = 0;
  for (const o of octets) {
    if (o === 255) bits += 8;
    else if (o === 254) bits += 7;
    else if (o === 252) bits += 6;
    else if (o === 248) bits += 5;
    else if (o === 240) bits += 4;
    else if (o === 224) bits += 3;
    else if (o === 192) bits += 2;
    else if (o === 128) bits += 1;
    else break;
  }
  return bits;
}

export function wildcardToCidr(net: string): string {
  const parts = String(net || '').trim().split(/\s+/);
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(parts[0] || '')) return net;
  if (parts.length === 1) return cidrOf(net);
  const mask = parts[1];
  if (/^\d+\.\d+\.\d+\.\d+$/.test(mask) && mask.startsWith('255')) return cidrOf(net);
  let bits = 0;
  for (const g of mask.split('.').map(Number)) bits += maskToBits(String((~g) & 255));
  return `${String(parts[0])}/${String(bits)}`;
}

export function wildcardOf(entry: string): string {
  const c = wildcardToCidr(entry);
  const [ip, prefixStr] = c.split('/');
  const prefix = Number(prefixStr);
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip || '') || isNaN(prefix)) return entry;
  const wc = prefix >= 32 ? 0 : (0xffffffff >>> prefix);
  return `${String(ip)} ${String([24, 16, 8, 0].map((s) => ((wc >>> s) & 255)).join('.'))}`;
}

export function maskedPair(entry: string): string {
  const c = cidrOf(entry);
  const [ip, prefixStr] = c.split('/');
  const prefix = Number(prefixStr);
  const full = prefix >= 32 ? 0xffffffff : (0xffffffff << (32 - prefix)) >>> 0;
  const mask = [24, 16, 8, 0].map((s) => (full >>> s) & 255).join('.');
  return `${String(ip)} ${String(mask)}`;
}

export function networkOfMask(ip: string, mask: string): string | null {
  const i = ip.split('.').map(Number);
  const m = mask.split('.').map(Number);
  if (i.length !== 4 || m.length !== 4 || i.some((n) => isNaN(n)) || m.some((n) => isNaN(n))) return null;
  const net = i.map((o, k) => o & m[k]);
  let prefix = 0;
  for (const o of m) {
    if (o === 255) {
      prefix += 8;
      continue;
    }
    for (let b = 7; b >= 0; b--) {
      if (((o >> b) & 1) === 1) prefix++;
      else break;
    }
    break;
  }
  return `${String(net.join('.'))}/${String(prefix)}`;
}
