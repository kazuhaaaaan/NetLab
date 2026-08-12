/**
 * Tipe bersama untuk pipeline CLI facade NetLab: lexer → parser → vendor adapter.
 *
 * Facade ini lapisan tipis di atas engine nyata (VendorDispatcher +
 * NetworkSimulator); tipe di sini hanya untuk klasifikasi perintah murni dan
 * tidak menyentuh state perangkat.
 */

/** Jenis token hasil tokenisasi CLI. */
export type TokenType = 'COMMAND' | 'FLAG' | 'VALUE' | 'EQUALS' | 'SLASH';

/** Satu token hasil tokenizer. */
export interface Token {
  type: TokenType;
  value: string;
}

/** Vendor yang punya grammar adapter di facade ini. */
export type FacadeVendor = 'mikrotik' | 'cisco';

/**
 * Aksi ternormalisasi hasil parsing. Dipetakan ke mutasi state oleh executor
 * dan ke output vendor-autentik oleh bridge (engine nyata).
 */
export type CommandAction =
  | 'ADD_IP_ADDRESS'
  | 'SHOW_IP_ADDRESSES'
  | 'SHOW_INTERFACES'
  | 'SET_INTERFACE_STATE'
  | 'ADD_ROUTE'
  | 'PING'
  | 'SET_HOSTNAME'
  | 'ENABLE_MODE'
  | 'CONFIG_MODE'
  | 'ENTER_INTERFACE'
  | 'SHOW_ROUTES'
  | 'UNKNOWN';

/** Hasil parsing satu baris perintah (CommandObject). */
export interface CommandObject {
  vendor: FacadeVendor | 'unknown';
  action: CommandAction;
  target?: string;
  params: Record<string, string>;
  raw: string;
}

/** Mengembalikan nilai param, atau fallback bila tidak ada. */
export function paramValue(obj: CommandObject, key: string, fallback = ''): string {
  const v = obj.params[key];
  return v === undefined || v === '' ? fallback : v;
}