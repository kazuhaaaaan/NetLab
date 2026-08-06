// ============================================================
// MacTable — tabel belajar MAC switch dengan aging
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

  learn(mac: string, port: string, vlan: number | null, now: number): boolean {
    const prev = this.entries.get(mac);
    const changed = !prev || prev.port !== port;
    this.entries.set(mac, { mac, port, vlan, lastSeen: now });
    return changed;
  }

  lookup(mac: string): MacEntry | null {
    const e = this.entries.get(mac);
    return e || null;
  }

  /** Hapus entri yang tidak terpakai selama agingMs. */
  age(now: number): string[] {
    const aged: string[] = [];
    for (const [mac, e] of this.entries) {
      if (now - e.lastSeen > this.agingMs) {
        this.entries.delete(mac);
        aged.push(mac);
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
