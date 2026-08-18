// ============================================================
// IPv4 utilities — self-contained untuk engine baru
// ============================================================

export function isValidIp(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every((o) => /^\d{1,3}$/.test(o) && parseInt(o, 10) >= 0 && parseInt(o, 10) <= 255);
}

export function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, o) => (acc << 8) | parseInt(o, 10), 0) >>> 0;
}

export function intToIp(n: number): string {
  return [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
}

export function prefixToMask(prefix: number): number {
  if (prefix <= 0) return 0;
  return (~0 << (32 - prefix)) >>> 0;
}

export function maskToPrefix(mask: number): number {
  let prefix = 0;
  let m = mask >>> 0;
  while (m & 0x80000000) {
    prefix++;
    m = (m << 1) >>> 0;
  }
  return prefix;
}

export function networkOf(ip: string, prefix: number): number {
  // >>> 0 penting: bitwise AND menghasilkan int bertanda; tanpa ini nilai
  // network di luar 127.x menjadi negatif dan perbandingan dengan ipToInt
  // (unsigned) gagal — alamat network tidak terdeteksi.
  return (ipToInt(ip) & prefixToMask(prefix)) >>> 0;
}

export function inSameSubnet(ipA: string, prefixA: number, ipB: string): boolean {
  return networkOf(ipA, prefixA) === networkOf(ipB, prefixA);
}

export function networkString(ip: string, prefix: number): string {
  return `${intToIp(networkOf(ip, prefix))}/${prefix}`;
}

/** Parse '192.168.1.1/24' | '192.168.1.1 255.255.255.0' | '192.168.1.1' → { address, prefix } */
export function parseCidr(cidr: string): { address: string; prefix: number } | null {
  const cleaned = cidr.trim().replace(/\s+/, '/');
  const [ip, p] = cleaned.split('/');
  if (!isValidIp(ip)) return null;
  if (p === undefined) return { address: ip, prefix: 24 };
  if (isValidIp(p)) return { address: ip, prefix: maskToPrefix(ipToInt(p)) };
  const prefix = parseInt(p, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return null;
  return { address: ip, prefix };
}

/** Prefix dengan hostBit bit tersedia (bukan /31 & /32, tidak bisa dipakai host). */
export function hasHostAddressSpace(prefix: number): boolean {
  return prefix <= 30;
}

/** True bila `ip/prefix` adalah alamat network dari subnet-nya (bukan host valid). */
export function isNetworkAddress(ip: string, prefix: number): boolean {
  if (!isValidIp(ip)) return false;
  return ipToInt(ip) === networkOf(ip, prefix);
}

/** True bila `ip/prefix` adalah alamat broadcast subnet-nya (bukan host valid). */
export function isBroadcastAddress(ip: string, prefix: number): boolean {
  if (!isValidIp(ip) || !hasHostAddressSpace(prefix)) return false;
  const mask = prefixToMask(prefix);
  return ipToInt(ip) === (networkOf(ip, prefix) | (~mask >>> 0)) >>> 0;
}

/** Validasi alamat HOST yang sah: format benar, bukan network/broadcast address.
 *  Pengecualian: /31 (point-to-point, RFC 3021) dan /32 (loopback) — keduanya
 *  alamat host yang sah; /32 dipakai untuk loopback di router. */
export function isValidHostIp(ip: string, prefix: number): boolean {
  if (!isValidIp(ip)) return false;
  if (!hasHostAddressSpace(prefix)) {
    if (prefix === 31 || prefix === 32) return true;
    return false;
  }
  if (isNetworkAddress(ip, prefix)) return false;
  if (isBroadcastAddress(ip, prefix)) return false;
  return true;
}
