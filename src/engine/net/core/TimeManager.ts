// ============================================================
// TimeManager — virtual clock simulator (BUKAN Date.now)
// ============================================================

export class TimeManager {
  private current = 0;

  reset(): void {
    this.current = 0;
  }

  now(): number {
    return this.current;
  }

  /** Majukan waktu virtual (dipanggil saat event dengan timestamp lebih besar diproses). */
  advanceTo(time: number): void {
    if (time > this.current) this.current = time;
  }

  advance(deltaMs: number): void {
    this.current += deltaMs;
  }

  /** Format "MM:SS.mmm" — contoh 00:00.015 */
  format(time = this.current): string {
    const totalSec = Math.floor(time / 1000);
    const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');
    const ms = String(Math.floor(time % 1000)).padStart(3, '0');
    return `${mm}:${ss}.${ms}`;
  }
}
