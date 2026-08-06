// ============================================================
// EventScheduler — binary min-heap atas (waktu virtual, urutan)
// ============================================================

import { SimEvent } from './types';

export class EventScheduler {
  private heap: SimEvent[] = [];
  private seq = 0;

  /** Jadwalkan sebuah event pada waktu virtual tertentu (ms). */
  schedule(event: Omit<SimEvent, 'id' | 'time'>, at: number): SimEvent {
    const id = `evt-${at}-${this.seq}`;
    this.seq += 1;
    const evt: SimEvent = {
      ...event,
      id,
      time: at,
      data: event.data || {},
    };
    this.push(evt);
    return evt;
  }

  private push(evt: SimEvent): void {
    const h = this.heap;
    h.push(evt);
    let i = h.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.less(h[i], h[parent])) {
        const tmp = h[i];
        h[i] = h[parent];
        h[parent] = tmp;
        i = parent;
      } else break;
    }
  }

  private less(a: SimEvent, b: SimEvent): boolean {
    if (a.time !== b.time) return a.time < b.time;
    return a.id < b.id;
  }

  /** Ambil event dengan waktu virtual terkecil, atau null bila kosong. */
  pop(): SimEvent | null {
    const h = this.heap;
    if (h.length === 0) return null;
    const top = h[0];
    const last = h.pop() as SimEvent;
    if (h.length > 0) {
      h[0] = last;
      let i = 0;
      const n = h.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < n && this.less(h[l], h[smallest])) smallest = l;
        if (r < n && this.less(h[r], h[smallest])) smallest = r;
        if (smallest === i) break;
        const tmp = h[i];
        h[i] = h[smallest];
        h[smallest] = tmp;
        i = smallest;
      }
    }
    return top;
  }

  peek(): SimEvent | null {
    return this.heap.length > 0 ? this.heap[0] : null;
  }

  get size(): number {
    return this.heap.length;
  }

  clear(): void {
    this.heap = [];
    this.seq = 0;
  }
}
