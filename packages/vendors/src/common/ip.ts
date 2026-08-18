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

export function isValidIpv6(ip: string): boolean {
  const s = String(ip || '').trim();
  if (!s || s.includes('.')) return false;
  if (!/^[0-9a-fA-F:]+$/.test(s)) return false;
  const groups = s.split(':');
  if (groups.length < 2 || groups.length > 8) return false;
  if (s.includes('::') && s.split('::').length > 2) return false;
  return groups.every((g) => g === '' || (g.length <= 4 && /^[0-9a-fA-F]*$/.test(g)));
}

export function isValidPrefix(n: string | undefined, v6: boolean): boolean {
  if (n === undefined || n === '') return true;
  if (!/^\d{1,3}$/.test(String(n))) return false;
  const v = Number(n);
  return Number.isInteger(v) && v >= 0 && v <= (v6 ? 128 : 32);
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
