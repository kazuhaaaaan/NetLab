// ============================================================
// EventBus — publish/subscribe untuk event simulasi.
// Dipakai debug engine, plugin hook, dan (opsional) UI.
// ============================================================

import { SimEvent, SimEventType } from './types';

type Listener = (evt: SimEvent) => void;

export class EventBus {
  private listeners = new Map<SimEventType | 'ALL', Set<Listener>>();

  on(type: SimEventType | 'ALL', fn: Listener): () => void {
    const set = this.listeners.get(type) || new Set<Listener>();
    set.add(fn);
    this.listeners.set(type, set);
    return () => set.delete(fn);
  }

  emit(evt: SimEvent): void {
    const all = this.listeners.get('ALL');
    if (all) for (const fn of all) fn(evt);
    const typed = this.listeners.get(evt.type);
    if (typed) for (const fn of typed) fn(evt);
  }

  clear(): void {
    this.listeners.clear();
  }
}
