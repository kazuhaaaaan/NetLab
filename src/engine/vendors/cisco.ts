/**
 * Adapter grammar Cisco IOS — murni, tanpa efek samping.
 *
 * Mengenali perintah mode user/privileged/config dasar. Eksekusi tetap
 * ditangani engine nyata (VendorDispatcher) lewat bridge.
 */

import type { CommandObject, Token } from '../cli/types';

/** Perintah yang dikenali — untuk autocomplete masa depan. */
export const SUPPORTED_COMMANDS: string[] = [
  'enable',
  'configure terminal',
  'interface <name>',
  'ip address <ip> <mask>',
  'no shutdown',
  'show interfaces',
  'show ip interface brief',
  'show ip route',
  'ping <ip>',
  'hostname <name>',
];

/** Kata-kata COMMAND/VALUE posisional (tanpa EQUALS/FLAG). */
function words(tokens: Token[]): string[] {
  return tokens.filter((t) => t.type === 'COMMAND' || t.type === 'VALUE').map((t) => t.value);
}

/** Kata COMMAND saja (posisi kata perintah, bukan nilai). */
function commandOnly(tokens: Token[]): string[] {
  return tokens.filter((t) => t.type === 'COMMAND').map((t) => t.value);
}

/** Apakah baris dimulai dengan urutan kata (case-insensitive). */
function startsWith(tokens: Token[], expected: string[]): boolean {
  const cmd = commandOnly(tokens);
  if (cmd.length < expected.length) return false;
  return expected.every((word, i) => cmd[i].toLowerCase() === word);
}

/**
 * Parse token Cisco IOS → CommandObject (atau null bila tak dikenali).
 */
export function parseCisco(tokens: Token[], raw: string): CommandObject | null {
  const cmd = commandOnly(tokens);

  if (startsWith(tokens, ['enable']) && cmd.length === 1) {
    return { vendor: 'cisco', action: 'ENABLE_MODE', params: {}, raw };
  }

  if (startsWith(tokens, ['configure', 'terminal'])) {
    return { vendor: 'cisco', action: 'CONFIG_MODE', params: {}, raw };
  }

  if (startsWith(tokens, ['interface'])) {
    const name = cmd.slice(1).join(' ');
    if (name) {
      return { vendor: 'cisco', action: 'ENTER_INTERFACE', params: { interface: name }, raw };
    }
  }

  if (startsWith(tokens, ['ip', 'address'])) {
    const rest = cmd.slice(2);
    if (rest.length >= 2) {
      return {
        vendor: 'cisco',
        action: 'ADD_IP_ADDRESS',
        params: { address: rest[0], mask: rest[1] },
        raw,
      };
    }
  }

  if (startsWith(tokens, ['no', 'shutdown']) || startsWith(tokens, ['no', 'shut'])) {
    return {
      vendor: 'cisco',
      action: 'SET_INTERFACE_STATE',
      params: { disabled: 'no' },
      raw,
    };
  }

  if (startsWith(tokens, ['show', 'interfaces']) || startsWith(tokens, ['show', 'ip', 'interface', 'brief'])) {
    return { vendor: 'cisco', action: 'SHOW_INTERFACES', params: {}, raw };
  }

  if (startsWith(tokens, ['show', 'ip', 'route'])) {
    return { vendor: 'cisco', action: 'SHOW_ROUTES', params: {}, raw };
  }

  if (startsWith(tokens, ['ping'])) {
    const target = words(tokens).slice(1).join(' ');
    if (target) return { vendor: 'cisco', action: 'PING', params: { target }, raw };
  }

  if (startsWith(tokens, ['hostname'])) {
    const name = cmd.slice(1).join(' ');
    if (name) {
      return { vendor: 'cisco', action: 'SET_HOSTNAME', params: { hostname: name }, raw };
    }
  }

  return null;
}