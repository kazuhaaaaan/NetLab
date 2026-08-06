// ============================================================
// ArpCache — cache ARP per perangkat dengan aging
// ============================================================

export interface ArpEntry {
  ip: string;
  mac: string;
  iface: string;
  lastSeen: number;
}

export class ArpCache {
  private entries = new Map<string, ArpEntry>();
  agingMs: number;

  constructor(agingMs = 120_000) {
    this.agingMs = agingMs;
  }

  learn(ip: string, mac: string, iface: string, now: number): boolean {
    const changed = !this.entries.has(ip) || this.entries.get(ip)!.mac !== mac;
    this.entries.set(ip, { ip, mac, iface, lastSeen: now });
    return changed;
  }

  resolve(ip: string): ArpEntry | null {
    return this.entries.get(ip) || null;
  }

  age(now: number): string[] {
    const aged: string[] = [];
    for (const [ip, e] of this.entries) {
      if (now - e.lastSeen > this.agingMs) {
        this.entries.delete(ip);
        aged.push(ip);
      }
    }
    return aged;
  }

  entriesList(): ArpEntry[] {
    return [...this.entries.values()];
  }

  clear(): void {
    this.entries.clear();
  }
}
