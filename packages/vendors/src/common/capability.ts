import { getVendorCapabilities, CAPABILITY_LABELS, VENDOR_NAMES } from '../capabilities';
import type { CapabilityKey, CapabilityStatus } from '../capabilities';
import type { CommandResult } from './types';

/**
 * Guard kapabilitas — penegakan SUMBER KEBENARAN (capabilities.ts) di level chain.
 *
 * Status 'not-supported' dan 'parser-only' diblokir: CLI harus menjawab jujur,
 * TIDAK boleh ada mutasi state / sukses palsu. Status 'partial' diizinkan
 * (behavior terbatas sesuai yang memang tersedia), 'supported' diizinkan penuh.
 */
export function capabilityStatus(vendorId: string, cap: CapabilityKey): CapabilityStatus | null {
  const reg = getVendorCapabilities(vendorId);
  return reg ? reg.caps[cap] : null;
}

export function isCapabilityBlocked(vendorId: string, cap: CapabilityKey): boolean {
  const st = capabilityStatus(vendorId, cap);
  return st === 'not-supported' || st === 'parser-only';
}

export function capabilityErrorMessage(vendorId: string, cap: CapabilityKey): string {
  const label = CAPABILITY_LABELS[cap] || cap;
  const name = VENDOR_NAMES[vendorId] || vendorId;
  return `Feature '${label}' is not supported on ${name}.`;
}

/** CommandResult penolakan jujur — tidak menyentuh state perangkat. */
export function blockedCapabilityResult(vendorId: string, cap: CapabilityKey): CommandResult {
  return { raw: capabilityErrorMessage(vendorId, cap) };
}