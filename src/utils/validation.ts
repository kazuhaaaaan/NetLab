// ============================================================
// Form validation helpers (Tugas 2 — Validasi Data)
// Validator murni (tanpa DOM) supaya bisa dipakai di form React,
// config generator, maupun parser file topologi.
// Setiap validator mengembalikan null = VALID, string = pesan error.
// ============================================================

const IPV4_OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
export const IPV4_RE = new RegExp(`^${IPV4_OCTET}\\.${IPV4_OCTET}\\.${IPV4_OCTET}\\.${IPV4_OCTET}$`);

/** /C IDR prefix yang sah (0–32). */
export const CIDR_RE = /^\d{1,2}$/;

/** IP + CIDR lengkap, mis. 192.168.10.10/24 */
export const IPV4_CIDR_RE = new RegExp(`^${IPV4_OCTET}\\.${IPV4_OCTET}\\.${IPV4_OCTET}\\.${IPV4_OCTET}/(?:3[0-2]|[0-2]?\\d)$`);

/** Alamat IPv6 standar RFC 4291 (compressed form, tanpa zone id). */
export const IPV6_RE =
  /^((?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?:(?::[0-9a-fA-F]{1,4}){1,6})|:(?:(?::[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(?::[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(?:ffff(?::0{1,4}){0,1}:){0,1}(?:(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3}(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9])|(?:[0-9a-fA-F]{1,4}:){1,4}:(?:(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3}(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

/** Subnet mask titik-titik, mis. 255.255.255.0 (harus kontigu 1 bit). */
export const SUBNET_MASK_RE = /^(?:255\.){3}255$|^(?:255\.){2}255\.(?:0|128|192|224|240|248|252|254)$|^255\.255\.(?:0|128|192|224|240|248|252|254)\.(?:0|128|192|224|240|248|252|254)$|^255\.(?:0|128|192|224|240|248|252|254)\.(?:0|128|192|224|240|248|252|254)\.(?:0|128|192|224|240|248|252|254)$|^(?:0|128|192|224|240|248|252|254)\.(?:0|128|192|224|240|248|252|254)\.(?:0|128|192|224|240|248|252|254)\.(?:0|128|192|224|240|248|252|254)$/;

/** MAC address XX:XX:XX:XX:XX:XX (juga terima pemisah - dan .). */
export const MAC_RE = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

/** Hostname perangkat (RFC 1123): huruf/angka/tanda hubung, 1–63 karakter. */
export const HOSTNAME_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,62})$/;

export interface ValidationResult {
  valid: boolean;
  error: string | null;
}

/** Wrapper seragam untuk dipakai useState pada form. */
export function validateWith(validator: (v: string) => string | null, value: string): ValidationResult {
  const error = validator(value);
  return { valid: error === null, error };
}

export function validateIpv4(v: string): string | null {
  if (!v.trim()) return 'Alamat IPv4 wajib diisi.';
  if (!IPV4_RE.test(v.trim())) return 'Alamat IPv4 tidak valid — contoh: 192.168.1.1';
  return null;
}

export function validateIpv4Cidr(v: string): string | null {
  const t = v.trim();
  if (!t) return 'Alamat wajib diisi.';
  if (!IPV4_CIDR_RE.test(t)) return 'Format harus IP/prefix — contoh: 192.168.10.10/24';
  return null;
}

export function validateIpv6(v: string): string | null {
  if (!v.trim()) return 'Alamat IPv6 wajib diisi.';
  if (!IPV6_RE.test(v.trim())) return 'Alamat IPv6 tidak valid — contoh: fe80::1';
  return null;
}

export function validateSubnetMask(v: string): string | null {
  const t = v.trim();
  if (!t) return 'Subnet mask wajib diisi.';
  if (!IPV4_RE.test(t)) return 'Subnet mask tidak valid — harus 4 oktet angka.';
  const octets = t.split('.').map(Number);
  let seenZero = false;
  for (const o of octets) {
    if (seenZero && o !== 0) return `Subnet mask ${t} tidak kontigu — contoh valid: 255.255.255.0`;
    if (o === 0) seenZero = true;
    else if (o !== 255 && ![128, 192, 224, 240, 248, 252, 254].includes(o)) {
      return `Oktet ${o} tidak valid di subnet mask — contoh valid: 255.255.255.0`;
    }
  }
  return null;
}

export function validateMac(v: string): string | null {
  const t = v.trim();
  if (!t) return 'MAC address wajib diisi.';
  if (!MAC_RE.test(t)) return 'Format MAC tidak valid — contoh: 02:42:AC:11:00:01';
  return null;
}

export function validateVlanId(v: string): string | null {
  const t = v.trim();
  if (!t) return 'VLAN ID wajib diisi.';
  if (!/^\d{1,4}$/.test(t)) return 'VLAN ID harus angka 1–4094.';
  const id = parseInt(t, 10);
  if (id < 1 || id > 4094) return 'VLAN ID harus berada di rentang 1–4094.';
  return null;
}

export function validateHostname(v: string): string | null {
  const t = v.trim();
  if (!t) return 'Hostname wajib diisi.';
  if (t.length > 63) return 'Hostname maksimal 63 karakter.';
  if (!HOSTNAME_RE.test(t)) return 'Hostname hanya boleh huruf, angka, dan tanda hubung (tidak boleh diawali/Diakhiri -)';
  return null;
}

export function validatePortNumber(v: string): string | null {
  const t = v.trim();
  if (!t) return 'Port wajib diisi.';
  if (!/^\d{1,5}$/.test(t)) return 'Port harus angka 1–65535.';
  const p = parseInt(t, 10);
  if (p < 1 || p > 65535) return 'Port harus berada di rentang 1–65535.';
  return null;
}

/** Cek duplikat IP dalam daftar (mis. antar interface). Mengembalikan pesan error atau null. */
export function findDuplicateIp(ipv4: string, existing: string[]): string | null {
  const t = ipv4.trim();
  if (!t) return null;
  const hit = existing.find((e) => e.split('/')[0] === t);
  if (hit) return `Alamat ${t} sudah dipakai (${hit}) — gunakan alamat lain.`;
  return null;
}

/** Ubah subnet mask titik-titik → panjang prefix (255.255.255.0 → 24). */
export function maskToPrefix(mask: string): number | null {
  if (SUBNET_MASK_RE.test(mask.trim()) !== true && validateSubnetMask(mask) !== null) return null;
  let bits = 0;
  let seenZero = false;
  for (const octet of mask.split('.')) {
    const o = parseInt(octet, 10);
    if (isNaN(o) || o < 0 || o > 255) return null;
    if (o === 0) {
      seenZero = true;
      continue;
    }
    if (seenZero) return null; // oktet nol lalu 1 lagi = tidak kontigu
    const bin = o.toString(2).padStart(8, '0');
    const leading = (bin.match(/^1+/) ?? [''])[0].length;
    if (leading !== 8 && bin.slice(leading).includes('1')) return null; // 1010xxxx
    bits += leading;
    if (leading !== 8) seenZero = true;
  }
  return bits;
}

/** Hitung nomor prefix (network) dan broadcast dari IP + prefix. */
export function ipv4Network(ip: string, prefix: number): string | null {
  const m = ip.match(IPV4_RE);
  if (!m || prefix < 0 || prefix > 32) return null;
  const octets = ip.split('.').map(Number);
  let acc = 0;
  for (const o of octets) acc = (acc << 8) | o;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const network = (acc & mask) >>> 0;
  return [24, 16, 8, 0].map((s, i) => ((network >>> s) & 255).toString()).join('.');
}

export function ipv4Broadcast(ip: string, prefix: number): string | null {
  const m = ip.match(IPV4_RE);
  if (!m || prefix < 0 || prefix > 32) return null;
  const octets = ip.split('.').map(Number);
  let acc = 0;
  for (const o of octets) acc = (acc << 8) | o;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const broadcast = (acc | ~mask) >>> 0;
  return [24, 16, 8, 0].map((s, i) => ((broadcast >>> s) & 255).toString()).join('.');
}

/** Apakah `ip/prefix` adalah alamat network atau broadcast dari subnet-nya
 *  (tidak sah dipakai sebagai host — /31 dan /32 dikecualikan: p2p/host route). */
export function isReservedAddress(ip: string, prefix: number): boolean {
  if (!IPV4_RE.test(ip)) return false;
  if (prefix >= 31) return false;
  const net = ipv4Network(ip, prefix);
  const bcast = ipv4Broadcast(ip, prefix);
  return ip === net || ip === bcast;
}

/** Cek apakah alamat host `ip/prefix` sah sebagai host (bukan network/broadcast). */
export function validateHostIp(ip: string, prefix: number): string | null {
  if (!IPV4_RE.test(ip)) return `Alamat IPv4 tidak valid — contoh: 192.168.1.1`;
  if (isReservedAddress(ip, prefix)) {
    return prefix <= 30
      ? `Alamat ${ip} adalah alamat network/broadcast dari /${prefix} — tidak bisa dipakai host.`
      : `Alamat ${ip}/${prefix} tidak punya ruang host.`;
  }
  return null;
}

/** Gateway harus berada di subnet yang sama dengan IP interface (CIDR). */
export function validateGatewayInSubnet(gateway: string, hostCidr: string): string | null {
  const g = gateway.trim();
  if (!g) return null;
  if (!IPV4_RE.test(g)) return null;
  const parts = hostCidr.trim().split('/');
  if (parts.length !== 2) return null;
  const prefix = parseInt(parts[1], 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return null;
  const gwNet = ipv4Network(g, prefix);
  const hostNet = ipv4Network(parts[0], prefix);
  if (gwNet === null || hostNet === null || gwNet !== hostNet) {
    return `Gateway ${g} berada di luar subnet ${hostCidr} — gateway harus satu subnet dengan IP interface.`;
  }
  return null;
}

/** Deteksi tumpang-tindih subnet antara `cidr` dan daftar subnet lain (CIDR).
 *  Mengembalikan pesan error bila salah satu subnet memuat alamat subnet lain. */
export function findSubnetOverlap(cidr: string, existing: string[]): string | null {
  const c = cidr.trim();
  const parse = (v: string): { ip: string; prefix: number } | null => {
    const p = v.split('/');
    if (p.length !== 2) return null;
    const prefix = parseInt(p[1], 10);
    if (isNaN(prefix) || prefix < 0 || prefix > 32 || !IPV4_RE.test(p[0])) return null;
    return { ip: p[0], prefix };
  };
  const a = parse(c);
  if (!a) return null;
  for (const other of existing) {
    const o = parse(other);
    if (!o) continue;
    const aNet = ipv4Network(a.ip, a.prefix);
    const oNet = ipv4Network(o.ip, o.prefix);
    if (aNet === null || oNet === null) continue;
    // Subnet sama persis, atau salah satu memuat yang lain.
    if (aNet === oNet && a.prefix === o.prefix) return `Subnet ${c} duplikat dengan ${other}.`;
    const narrower = a.prefix > o.prefix ? a : o; // prefix besar = subnet lebih kecil
    const wider = narrower === a ? o : a;
    const widerNet = ipv4Network(wider.ip, wider.prefix);
    // Subnet kecil ada DI DALAM subnet besar bila alamat network-nya, setelah
    // dimask dengan prefix subnet besar, jatuh pada network subnet besar itu.
    const maskedNarrower = ipv4Network(narrower.ip, wider.prefix);
    if (widerNet !== null && maskedNarrower === widerNet) return `Subnet ${c} tumpang tindih dengan ${other}.`;
  }
  return null;
}