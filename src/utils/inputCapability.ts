/**
 * Deteksi kapabilitas input perangkat — dipakai untuk fitur keyboard yang
 * hanya masuk akal di desktop (TAB completion, dsb.).
 *
 * BUKAN deteksi lebar layar: memakai capability query (hover & pointer fine)
 * sebagaimana praktik responsive design. Perangkat sentuh modern (mis. tablet
 * dengan trackpad) bisa punya pointer fine — tetap dianggap capable.
 */
export function hasFinePointer(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  try {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  } catch {
    return true;
  }
}