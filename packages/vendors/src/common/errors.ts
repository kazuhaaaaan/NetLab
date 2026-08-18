// ============================================================
// Pesan error vendor — kontrak "unknown command" dan "known unsupported".
// Dipindahkan verbatim dari VendorDispatcher lama.
// ============================================================

/** Format pesan per vendor untuk perintah yang tidak dikenal. */
export function unknownCommand(vendorId: string, rawInput: string): string {
  const first = (rawInput.trim().split(/\s+/)[0] || '').replace(/^\//, '');
  switch (vendorId) {
    case 'mikrotik':
      return `bad command name ${first || '""'} (line 1 column 1)`;
    case 'juniper':
      return 'syntax error, expecting <command>';
    case 'huawei':
      return `% Unrecognized command found at '^' position.`;
    case 'linux':
    case 'openwrt':
      return `bash: ${first || '""'}: command not found`;
    default:
      return `% Invalid input detected at '^' marker.`;
  }
}

/**
 * Perintah yang SINTAKSNYA VALID di vendor asli, tetapi perilakunya tidak
 * disimulasikan oleh engine NetLab. Jangan pernah pura-pura sukses —
 * kembalikan pesan eksplisit sesuai kontrak "unsupported features".
 */
export function knownUnsupported(vendorId: string, rawInput: string): string | null {
  const t = rawInput.trim().toLowerCase();
  const msg = `Command recognized, but this protocol behavior is not currently simulated by the NetLab simulation engine.`;
  switch (vendorId) {
    case 'aruba':
      // ArubaOS-CX: NAT (ip nat inside/outside) tidak disimulasikan.
      if (/^ip\s+nat\s+(inside|outside)\b/.test(t)) return msg;
      return null;
    case 'openwrt':
      // OpenWrt: BGP (Quagga/BIRD) tidak disimulasikan.
      if (/^(?:router\s+bgp\b|\/routing\s+bgp\b)/.test(t)) return msg;
      return null;
    case 'linux':
      // Linux: OSPF/BGP (Quagga/FRR) tidak disimulasikan.
      if (/^(?:router\s+(?:ospf|bgp)\b|\/routing\s+(?:ospf|bgp)\b)/.test(t)) return msg;
      return null;
    default:
      return null;
  }
}