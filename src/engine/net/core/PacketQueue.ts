// ============================================================
// PacketQueue — antrian kedatangan paket pada waktu virtual.
// Setiap entri adalah event PACKET_RECEIVED di sebuah device.
// ============================================================

import { EventScheduler } from './EventScheduler';
import { Packet, SimEvent } from './types';

export interface PacketArrival {
  packet: Packet;
  nodeId: string;
  port: string;
}

export class PacketQueue {
  private arrivals: PacketArrival[] = [];
  private scheduledAt = new Map<string, number>();
  private pending = new Map<string, Packet>();

  get size(): number {
    return this.arrivals.length;
  }

  /** Simpan paket yang sedang menunggu tiba di sebuah device. */
  enqueue(arrival: PacketArrival, at: number): void {
    this.arrivals.push(arrival);
    this.scheduledAt.set(arrival.packet.id, at);
    this.pending.set(arrival.packet.id, arrival.packet);
    // sort berdasarkan waktu kedatangan
    this.arrivals.sort(
      (a, b) => (this.scheduledAt.get(a.packet.id) ?? 0) - (this.scheduledAt.get(b.packet.id) ?? 0)
    );
  }

  /** Ambil kedatangan dengan waktu tercepat. */
  dequeueNext(): PacketArrival | null {
    const a = this.arrivals.shift();
    if (!a) return null;
    this.scheduledAt.delete(a.packet.id);
    this.pending.delete(a.packet.id);
    return a;
  }

  nextArrivalTime(): number | null {
    if (this.arrivals.length === 0) return null;
    return this.scheduledAt.get(this.arrivals[0].packet.id) ?? null;
  }

  clear(): void {
    this.arrivals = [];
    this.scheduledAt.clear();
    this.pending.clear();
  }

  /** Hapus semua paket milik sebuah flow (mis. saat dihancurkan). */
  removeByCorrelation(correlationId: string): void {
    this.arrivals = this.arrivals.filter((a) => {
      if (a.packet.correlationId === correlationId) {
        this.scheduledAt.delete(a.packet.id);
        this.pending.delete(a.packet.id);
        return false;
      }
      return true;
    });
  }

  /** Event stub agar scheduler & queue saling terpisah (dipakai klien untuk log). */
  static toEvent(arrival: PacketArrival, time: number, traceId: string): SimEvent {
    return {
      id: `arr-${arrival.packet.id}-${time}`,
      traceId,
      type: 'PACKET_RECEIVED',
      time,
      nodeId: arrival.nodeId,
      port: arrival.port,
      packetId: arrival.packet.id,
      data: { packet: arrival.packet },
    };
  }
}
