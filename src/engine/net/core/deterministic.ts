// ============================================================
// Primitif deterministik untuk simulasi — pengganti Math.random /
// Date.now() di jalur yang mempengaruhi hasil simulasi (audit
// PHASE 1). UI boleh tetap memakai randomness sendiri.
// ============================================================

/** FNV-1a 32-bit — hash stabil lintas proses (tidak seperti String.hashCode V8). */
export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * DHCP transaction-id deterministik: turunan identitas perangkat + interface +
 * urutan transaksi. Same device + same sequence = same xid, sehingga dua run
 * simulasi identik menghasilkan packet byte yang identik (determinism rule).
 */
const dhcpSeq = new WeakMap<object, number>();

export function nextDhcpXid(deviceId: string, ifaceName: string, owner: object): number {
  const seq = (dhcpSeq.get(owner) ?? 0) + 1;
  dhcpSeq.set(owner, seq);
  return fnv1a32(`${deviceId}|${ifaceName}|dhcp|${seq}`) % 0xffffffff;
}
