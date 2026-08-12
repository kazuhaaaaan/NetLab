/**
 * Parser CLI NetLab — membangun CommandObject dari token hasil lexer.
 *
 * Murni: tidak membaca/menulis state. Vendor adapter menentukan grammar
 * (src/engine/vendors/*.ts); parser hanya mengarungi hasil adapter.
 */

import type { CommandObject, FacadeVendor, Token } from './types';
import { tokenize } from './lexer';
import { parseMikroTik } from '../vendors/mikrotik';
import { parseCisco } from '../vendors/cisco';

/** Daftar vendor yang dikenal facade beserta adapter grammarnya. */
export const FACADE_VENDORS: FacadeVendor[] = ['mikrotik', 'cisco'];

/**
 * Menjalankan adaptor vendor yang sesuai dan mengembalikan CommandObject.
 * Vendor tak dikenal atau perintah tak dikenali → CommandObject UNKNOWN
 * (raw tetap dipertahankan supaya executor bisa meneruskannya ke engine nyata).
 */
export function parseCommandObject(
  tokens: Token[],
  raw: string,
  vendor: FacadeVendor | string
): CommandObject {
  let parsed: CommandObject | null = null;
  if (vendor === 'mikrotik') parsed = parseMikroTik(tokens, raw);
  else if (vendor === 'cisco') parsed = parseCisco(tokens, raw);

  if (parsed) return parsed;
  return {
    vendor: FACADE_VENDORS.includes(vendor as FacadeVendor) ? (vendor as FacadeVendor) : 'unknown',
    action: 'UNKNOWN',
    params: {},
    raw,
  };
}

/**
 * Pipeline satu langkah: tokenize → parse. Titik masuk facade untuk terminal.
 */
export function parseCommand(raw: string, vendor: FacadeVendor | string): CommandObject {
  return parseCommandObject(tokenize(raw), raw, vendor);
}