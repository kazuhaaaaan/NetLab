// ============================================================
// IPv6 utilities — self-contained, tanpa dependency luar.
// Perbandingan jaringan berbasis 8 group 16-bit.
// ============================================================

export function isIpv6Address(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return false;
  let s = ip.replace(/^\[|\]$/g, '');
  if (s.includes('.') || !s.includes(':')) return false;
  s = s.replace(/%[a-zA-Z0-9]+$/, '');
  return /^[0-9a-fA-F:]*$/.test(s) && s.length >= 2;
}

/** Uraikan alamat v6 → 8 group 16-bit (angka). Tangani '::'. */
export function ipv6ToGroups(ip: string): number[] {
  let s = ip.replace(/^\[|\]$/g, '').replace(/%[a-zA-Z0-9]+$/, '');
  const fill = (part: string) =>
    part === ''
      ? []
      : part.split(':').map((g) => parseInt(g === '' ? '0' : g, 16) || 0);
  const headTail = s.split('::');
  if (headTail.length === 2) {
    const head = fill(headTail[0]);
    const tail = fill(headTail[1]);
    const missing = Math.max(0, 8 - head.length - tail.length);
    const groups = [...head, ...Array(missing).fill(0), ...tail];
    while (groups.length < 8) groups.push(0);
    return groups.slice(0, 8);
  }
  const groups = fill(s);
  while (groups.length < 8) groups.push(0);
  return groups.slice(0, 8);
}

/** Kompresi kanonik: '2001:0db8:0000:0000:0000:0000:0000:0001' → '2001:db8::1' */
export function ipv6ToString(groups: number[]): string {
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;
  for (let i = 0; i < groups.length; i++) {
    if (groups[i] === 0) {
      if (curStart < 0) curStart = i;
      curLen++;
      if (curLen > bestLen) {
        bestLen = curLen;
        bestStart = curStart;
      }
    } else {
      curStart = -1;
      curLen = 0;
    }
  }
  if (bestLen < 2) bestStart = -1;
  const hex = groups.map((g) => g.toString(16));
  if (bestStart < 0) return hex.join(':');
  const before = hex.slice(0, bestStart);
  const after = hex.slice(bestStart + bestLen);
  let s = before.join(':');
  s += '::';
  if (after.length > 0) s += after.join(':');
  return s;
}

/** 16 byte alamat → string mac. */
export function ipv6Bytes(groups: number[]): number[] {
  const out: number[] = [];
  for (const g of groups) {
    out.push((g >> 8) & 0xff, g & 0xff);
  }
  return out;
}

/** Group yang sudah di-mask prefix. */
export function ipv6NetworkGroups(ip: string, prefix: number): number[] {
  const g = ipv6ToGroups(ip);
  const out: number[] = [];
  let bits = prefix;
  for (let i = 0; i < 8; i++) {
    if (bits >= 16) {
      out.push(g[i]);
      bits -= 16;
    } else if (bits <= 0) {
      out.push(0);
    } else {
      const mask = (0xffff << (16 - bits)) & 0xffff;
      out.push(g[i] & mask);
      bits = 0;
    }
  }
  return out;
}

/** Network address yang dikompresi, mis. 2001:db8:1::/64 → '2001:db8:1:0::' */
export function ipv6NetworkString(ip: string, prefix: number): string {
  return ipv6ToString(ipv6NetworkGroups(ip, prefix));
}

export function inSameIpv6Subnet(a: string, prefixA: number, b: string): boolean {
  const ga = ipv6NetworkGroups(a, prefixA);
  const gb = ipv6NetworkGroups(b, prefixA);
  for (let i = 0; i < 8; i++) if (ga[i] !== gb[i]) return false;
  return true;
}

/** Parse '2001:db8::1/64' | '2001:db8::1' → { address, prefix } (default 64). */
export function parseIpv6Cidr(cidr: string): { address: string; prefix: number } | null {
  const [addr, p] = String(cidr || '').trim().replace(/\s+/, '/').split('/');
  if (!isIpv6Address(addr)) return null;
  if (p === undefined || p === '') return { address: ipv6ToString(ipv6ToGroups(addr)), prefix: 64 };
  const prefix = parseInt(p, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 128) return null;
  return { address: ipv6ToString(ipv6ToGroups(addr)), prefix };
}

/** fe80::/10 */
export function isLinkLocal(ip: string): boolean {
  if (!isIpv6Address(ip)) return false;
  return (ipv6ToGroups(ip)[0] & 0xffc0) === 0xfe80;
}

/** ff00::/8 */
export function isIpv6Multicast(ip: string): boolean {
  if (!isIpv6Address(ip)) return false;
  return (ipv6ToGroups(ip)[0] & 0xff00) === 0xff00;
}

/** MAC solicited-node multicast 33:33:ff:xx:xx:xx (24 bit terakhir). */
export function solicitedNodeMac(ip: string): string {
  const bytes = ipv6Bytes(ipv6ToGroups(ip));
  return `33:33:ff:${[bytes[13], bytes[14], bytes[15]].map((b) => b.toString(16).padStart(2, '0')).join(':')}`;
}

/**
 * Alamat global dari EUI-64: MAC 48-bit → IID dengan U/L dibalik dan
 * ff:fe di tengah. Ditempelkan ke jaringan `network` dengan `prefix`
 * (harus ≤ 96 agar IID muat).
 */
export function macToIpv6(mac: string, network: string, prefix: number): string {
  const bytes = (mac || '').split(':').map((b) => parseInt(b, 16));
  if (bytes.length < 6 || bytes.some(isNaN)) return '';
  bytes[0] ^= 0x02;
  const iid = [
    (bytes[0] << 8) | bytes[1],
    (bytes[2] << 8) | 0xff,
    (0xfe << 8) | bytes[3],
    (bytes[4] << 8) | bytes[5],
  ];
  const g = ipv6NetworkGroups(network, prefix);
  const offset = Math.min(Math.ceil(prefix / 16), 4);
  for (let i = 0; i < 4; i++) g[offset + i] = iid[i];
  return ipv6ToString(g);
}
