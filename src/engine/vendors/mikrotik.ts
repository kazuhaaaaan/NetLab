/**
 * Adapter grammar MikroTik RouterOS — murni, tanpa efek samping.
 *
 * Membaca Token hasil lexer dan mengembalikan CommandObject bila pola
 * dikenali; null bila tidak. Eksekusi tetap ditangani engine nyata
 * (VendorDispatcher) lewat bridge — adapter ini hanya klasifikasi.
 */

import type { CommandObject, Token } from '../cli/types';

/** Perintah yang dikenali — untuk autocomplete masa depan. */
export const SUPPORTED_COMMANDS: string[] = [
  '/ip address add address=<ip> interface=<iface>',
  '/ip address print',
  '/interface print',
  '/interface set name=<iface> disabled=yes|no',
  '/ip route add dst-address=<network> gateway=<gw>',
  '/ping <ip>',
  '/system identity set name=<hostname>',
];

/** Path RouterOS (SLASH + COMMAND beruntun di awal baris). */
function pathOf(tokens: Token[]): string[] {
  const path: string[] = [];
  for (const t of tokens) {
    if (t.type === 'SLASH') continue;
    if (t.type === 'COMMAND') path.push(t.value);
    else break;
  }
  return path;
}

/** Params key=value dari seluruh baris (FLAG + EQUALS + VALUE). */
function flagsOf(tokens: Token[]): Record<string, string> {
  const params: Record<string, string> = {};
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'FLAG' && tokens[i + 1]?.type === 'EQUALS') {
      params[t.value] = tokens[i + 2]?.type === 'VALUE' ? tokens[i + 2].value : '';
    }
  }
  return params;
}

/** Apakah path baris diawali urutan kata tertentu (slash diabaikan). */
function hasPath(tokens: Token[], expected: string[]): boolean {
  const path = pathOf(tokens);
  if (path.length < expected.length) return false;
  return expected.every((word, i) => path[i].toLowerCase() === word);
}

/** Argumen posisional terakhir (target ping) — token COMMAND non-path. */
function lastArgument(tokens: Token[], afterWord: string): string | undefined {
  const words = tokens.filter((t) => t.type === 'COMMAND').map((t) => t.value);
  const idx = words.lastIndexOf(afterWord);
  if (idx >= 0 && idx < words.length - 1) return words[words.length - 1];
  return undefined;
}

/**
 * Parse token RouterOS → CommandObject (atau null bila tak dikenali).
 */
export function parseMikroTik(tokens: Token[], raw: string): CommandObject | null {
  // /ping <target>
  if (hasPath(tokens, ['ping'])) {
    const target = lastArgument(tokens, 'ping');
    if (target) return { vendor: 'mikrotik', action: 'PING', params: { target }, raw };
    return null;
  }

  // /ip address print
  if (hasPath(tokens, ['ip', 'address', 'print'])) {
    return { vendor: 'mikrotik', action: 'SHOW_IP_ADDRESSES', params: flagsOf(tokens), raw };
  }

  // /ip address add address=X interface=Y
  if (hasPath(tokens, ['ip', 'address', 'add'])) {
    const f = flagsOf(tokens);
    return {
      vendor: 'mikrotik',
      action: 'ADD_IP_ADDRESS',
      params: {
        address: f['address'] || '',
        interface: f['interface'] || '',
      },
      raw,
    };
  }

  // /interface print
  if (hasPath(tokens, ['interface', 'print'])) {
    return { vendor: 'mikrotik', action: 'SHOW_INTERFACES', params: flagsOf(tokens), raw };
  }

  // /interface set name=X disabled=yes|no
  if (hasPath(tokens, ['interface', 'set'])) {
    const f = flagsOf(tokens);
    return {
      vendor: 'mikrotik',
      action: 'SET_INTERFACE_STATE',
      params: {
        interface: f['name'] || '',
        disabled: f['disabled'] === '' ? 'no' : f['disabled'],
      },
      raw,
    };
  }

  // /ip route add dst-address=X gateway=Y
  if (hasPath(tokens, ['ip', 'route', 'add'])) {
    const f = flagsOf(tokens);
    return {
      vendor: 'mikrotik',
      action: 'ADD_ROUTE',
      params: { dst: f['dst-address'] || '', gateway: f['gateway'] || '' },
      raw,
    };
  }

  // /system identity set name=X
  if (hasPath(tokens, ['system', 'identity', 'set'])) {
    const f = flagsOf(tokens);
    return {
      vendor: 'mikrotik',
      action: 'SET_HOSTNAME',
      params: { hostname: f['name'] || '' },
      raw,
    };
  }

  return null;
}