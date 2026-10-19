// ============================================================
// shortcuts — lapisan penyederhanaan CLI (vendor-aware).
//
// Dipakai runCliCommand SEBELUM resolusi abbreviation. Hanya
// memperluas kata-kerja ramah (qip/qroute) ke syntax vendor ASLI
// yang sudah terbukti diproses adapter. Tidak pernah mengarang
// syntax: vendor yang tak punya pemetaan → null (perilaku lama).
//
// Contoh:
//   linux     : qip 10.0.0.1/24 eth0   → ip addr add 10.0.0.1/24 dev eth0
//   mikrotik  : qip 10.0.0.1/24 ether1 → /ip address add address=10.0.0.1/24 interface=ether1
//   linux     : qroute 10.1.0.0/24 via 10.0.0.1 → ip route add 10.1.0.0/24 via 10.0.0.1
//   mikrotik  : qroute 10.1.0.0/24 via 10.0.0.1 → /ip route add dst-address=10.1.0.0/24 gateway=10.0.0.1
// ============================================================

/** Keluarga CLI untuk pemetaan shortcut. */
function cliFamily(vendor: string): 'linux' | 'mikrotik' | 'other' {
  if (vendor === 'linux' || vendor === 'openwrt') return 'linux';
  if (vendor === 'mikrotik') return 'mikrotik';
  return 'other';
}

/**
 * Perluas perintah shortcut menjadi syntax vendor asli.
 * Return null bila input bukan shortcut atau vendor tidak didukung.
 */
export function normalizeCliShortcut(vendor: string, input: string): string | null {
  const tokens = input.trim().split(/\s+/);
  if (tokens.length === 0) return null;
  const verb = tokens[0].toLowerCase();
  const family = cliFamily(vendor);
  if (family === 'other') return null;

  // qip <ip/prefix> <iface>
  if ((verb === 'qip' || verb === 'qsetip') && tokens.length === 3) {
    const addr = tokens[1];
    const iface = tokens[2];
    if (!/^[\d.]+(\/\d+)?$/.test(addr)) return null;
    if (family === 'linux') return `ip addr add ${addr} dev ${iface}`;
    return `/ip address add address=${addr} interface=${iface}`;
  }

  // qroute <dst> [via] <gw>
  if (verb === 'qroute' && (tokens.length === 4 || tokens.length === 3)) {
    const dst = tokens[1];
    const gw = tokens[tokens.length - 1];
    if (tokens.length === 4 && tokens[2].toLowerCase() !== 'via') return null;
    if (!/^[\d.]+(\/\d+)?$/.test(dst) || !/^[\d.]+$/.test(gw)) return null;
    if (family === 'linux') return `ip route add ${dst} via ${gw}`;
    return `/ip route add dst-address=${dst} gateway=${gw}`;
  }

  return null;
}
