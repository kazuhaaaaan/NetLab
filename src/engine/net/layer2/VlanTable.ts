// ============================================================
// VlanTable — database VLAN otoritatif per perangkat.
//
// Satu-satunya representasi network state untuk VLAN: id unik 1..4094,
// nama, dan state aktif/suspended. CLI vendor menulis NORMALIZED intent ke
// sini (lewat NetworkSimulator.setVlans); SwitchProcessor membaca di sini
// saat mengklasifikasikan frame ingress/egress (access/trunk/native).
// ============================================================

import { Vlan } from '../core/types';

export const VLAN_ID_MIN = 1;
export const VLAN_ID_MAX = 4094;

export function isValidVlanId(id: number): boolean {
  return Number.isInteger(id) && id >= VLAN_ID_MIN && id <= VLAN_ID_MAX;
}

/** Bentuk input normalisasi dari memori vendor (id boleh string, mis. '10'). */
export interface VlanInput {
  id: number | string;
  name?: string;
  state?: string;
}

function toVlanId(id: number | string): number {
  const n = typeof id === 'string' ? parseInt(id, 10) : id;
  return Number.isNaN(n) ? NaN : n;
}

export class VlanTable {
  private vlans = new Map<number, Vlan>();

  get(id: number): Vlan | undefined {
    return this.vlans.get(id);
  }

  has(id: number): boolean {
    return this.vlans.has(id);
  }

  list(): Vlan[] {
    return [...this.vlans.values()].sort((a, b) => a.id - b.id);
  }

  /** Hapus semua VLAN (diganti saat sync konfigurasi dari CLI). */
  clear(): void {
    this.vlans.clear();
  }

  /**
   * Ganti seluruh isi database dengan daftar yang diberikan (normalisasi
   * dari representasi vendor). Entri dengan id tidak valid dibuang; id
   * duplikat disatukan (entri terakhir menang) — TIDAK pernah ada dua objek
   * VLAN dengan id sama. Mengembalikan jumlah VLAN UNIK yang berhasil dimuat.
   */
  replace(vlans: VlanInput[]): number {
    this.vlans.clear();
    let loaded = 0;
    for (const v of vlans) {
      const id = toVlanId(v.id);
      if (!isValidVlanId(id)) continue;
      if (this.vlans.has(id)) {
        // Duplikat: entri terakhir menang secara SET/upsert semantics — id
        // sudah dihitung, jangan dihitung dua kali.
        this.vlans.set(id, {
          id,
          name: v.name && v.name.trim() !== '' ? v.name.trim() : `VLAN${id}`,
          state: v.state === 'suspended' ? 'suspended' : 'active',
        });
        continue;
      }
      this.vlans.set(id, {
        id,
        name: v.name && v.name.trim() !== '' ? v.name.trim() : `VLAN${id}`,
        state: v.state === 'suspended' ? 'suspended' : 'active',
      });
      loaded++;
    }
    return loaded;
  }

  /**
   * Tambah VLAN baru bila belum ada. False tanpa efek samping bila id tidak
   * valid atau VLAN sudah ada (tidak akan pernah membuat duplikat).
   */
  add(id: number, name?: string): boolean {
    if (!isValidVlanId(id) || this.vlans.has(id)) return false;
    this.vlans.set(id, { id, name: name && name.trim() !== '' ? name.trim() : `VLAN${id}`, state: 'active' });
    return true;
  }

  /** Buat bila belum ada; bila sudah ada kembalikan entri yang ada. */
  getOrCreate(id: number, name?: string): Vlan | null {
    if (!isValidVlanId(id)) return null;
    const existing = this.vlans.get(id);
    if (existing) return existing;
    const created: Vlan = { id, name: name && name.trim() !== '' ? name.trim() : `VLAN${id}`, state: 'active' };
    this.vlans.set(id, created);
    return created;
  }

  /**
   * Ganti nama VLAN. False bila VLAN tidak ada atau nama kosong/invalid
   * (nama ber-whitespace di-strip; nama tidak boleh kosong setelah strip).
   */
  rename(id: number, name: string): boolean {
    const v = this.vlans.get(id);
    if (!v) return false;
    const trimmed = (name || '').trim();
    if (trimmed === '') return false;
    v.name = trimmed;
    return true;
  }

  /** Hapus VLAN. False bila id tidak ada. */
  remove(id: number): boolean {
    return this.vlans.delete(id);
  }

  /** Apakah VLAN ada & aktif (frame boleh diklasifikasikan ke VLAN ini). */
  isActive(id: number): boolean {
    return this.vlans.get(id)?.state === 'active';
  }
}