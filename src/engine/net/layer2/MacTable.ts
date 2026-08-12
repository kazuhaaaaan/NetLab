// ============================================================
// MacTable — tabel belajar MAC switch dengan aging.
//
// Daftar MAC PER VLAN: kunci internal "vlan|mac" sehingga satu MAC yang
// sama boleh dipelajari di VLAN berbeda (mis. AA:BB:CC:DD:EE:FF di VLAN 10
// dan VLAN 20) tanpa saling menimpa — lookup selalu memerlukan VLAN.
// ============================================================

export interface MacEntry {
  mac: string;
  port: string;
  vlan: number | null;
  lastSeen: number;
}

export class MacTable {
  private entries = new Map<string, MacEntry>();
  agingMs: number;

  constructor(agingMs = 30_000) {
    this.agingMs = agingMs;
  }

  static keyOf(vlan: number | null, mac: string): string {
    return `${vlan ?? 1}|${mac.toLowerCase()}`;
  }

  /** Pelajari MAC pada (vlan, port). Mengembalikan true bila posisi berubah. */
  learn(mac: string, port: string, vlan: number | null, now: number): boolean {
    const key = MacTable.keyOf(vlan, mac);
    const prev = this.entries.get(key);
    const changed = !prev || prev.port !== port;
    this.entries.set(key, { mac, port, vlan, lastSeen: now });
    return changed;
  }

  /** Cari MAC dalam konteks VLAN tertentu (lookup TANPA VLAN tidak sah di
   *  simulasi VLAN — selalu panggil dengan vlan yang sedang diproses). */
  lookup(mac: string, vlan: number | null): MacEntry | null {
    const e = this.entries.get(MacTable.keyOf(vlan, mac));
    return e || null;
  }

  /** Hapus entri seorang MAC pada VLAN tertentu (mis. saat port berpindah). */
  remove(mac: string, vlan: number | null): boolean {
    return this.entries.delete(MacTable.keyOf(vlan, mac));
  }

  /** Hapus semua entri milik sebuah VLAN (mis. VLAN dihapus). */
  removeVlan(vlan: number): void {
    for (const [key, e] of this.entries) {
      if ((e.vlan ?? 1) === vlan) this.entries.delete(key);
    }
  }

  /** Hapus entri yang tidak terpakai selama agingMs. */
  age(now: number): string[] {
    const aged: string[] = [];
    for (const [key, e] of this.entries) {
      if (now - e.lastSeen > this.agingMs) {
        this.entries.delete(key);
        aged.push(e.mac);
      }
    }
    return aged;
  }

  entriesList(): MacEntry[] {
    return [...this.entries.values()];
  }

  clear(): void {
    this.entries.clear();
  }
}