// ============================================================
// schemas — validasi input tool yang TYPED (tanpa `any`).
//
// Setiap tool punya schema tetap; output LLM/pengguna diperlakukan
// sebagai input UNTRUSTED. Validator menolak tipe/struktur tak dikenal.
// ============================================================

import type { ToolValidation } from './types';

export type Validator<T> = (value: unknown, key: string) => T | null;

export const vStr: Validator<string> = (value, key) => {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return null;
};

export const vStrOrEmpty: Validator<string> = (value, key) => {
  if (typeof value === 'string') return value.trim();
  return null;
};

export const vInt: Validator<number> = (value, key) => {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return parseInt(value, 10);
  return null;
};

export const vBool: Validator<boolean> = (value, key) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 'yes') return true;
  if (value === 'false' || value === 'no') return false;
  return null;
};

export const vNum: Validator<number> = (value, key) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) return parseFloat(value);
  return null;
};

/** pilih dari daftar literal. */
export function vEnum<T extends string>(allowed: readonly T[]): Validator<T> {
  return (value, key) => {
    if (typeof value !== 'string') return null;
    const hit = allowed.find((a) => a === value.trim());
    return hit ?? null;
  };
}

export const vPos: Validator<{ x: number; y: number }> = (value, key) => {
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const x = typeof o.x === 'number' ? o.x : null;
    const y = typeof o.y === 'number' ? o.y : null;
    if (x != null && y != null) return { x, y };
  }
  return null;
};

/** build hasil validasi dari daftar field. */
export function validate(
  input: Record<string, unknown>,
  spec: Record<string, { optional?: boolean; check: Validator<unknown>; label: string }>
): ToolValidation {
  const errors: string[] = [];
  const params: Record<string, unknown> = {};

  for (const key of Object.keys(input)) {
    if (!(key in spec)) {
      errors.push(`parameter tak dikenal: "${key}"`);
    }
  }

  for (const [key, def] of Object.entries(spec)) {
    const raw = input[key];
    if (raw === undefined || raw === null) {
      if (def.optional) continue;
      errors.push(`parameter wajib hilang: "${key}" (${def.label})`);
      continue;
    }
    const parsed = def.check(raw, key);
    if (parsed === null) {
      errors.push(`parameter invalid: "${key}" (${def.label})`);
      continue;
    }
    params[key] = parsed;
  }

  return { ok: errors.length === 0, errors, params };
}

/** validasi ringkas: true bila setiap field ada & valid. */
export function isValid(input: Record<string, unknown>, spec: Record<string, { optional?: boolean; check: Validator<unknown>; label: string }>): boolean {
  return validate(input, spec).ok;
}