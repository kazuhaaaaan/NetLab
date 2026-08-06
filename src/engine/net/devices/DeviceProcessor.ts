// ============================================================
// DeviceProcessor — Strategy pattern untuk perilaku perangkat.
// Data tinggal di NetworkDevice; perilaku hidup di sini.
// ============================================================

import { NetworkDevice } from './NetworkDevice';
import { Packet, RunResult, SimEvent, SimEventType } from '../core/types';

/** Subset simulator yang boleh dipakai processor (dependency injection ringan). */
export interface SimulatorCore {
  readonly now: number;
  emit(type: SimEventType, traceId: string, data: Record<string, unknown>, nodeId?: string, port?: string): void;
  createPacket(opts: Partial<Packet> & { protocol: Packet['protocol']; traceId: string }): Packet;
  transmit(device: NetworkDevice, pkt: Packet, outPort: string, traceId: string): boolean;
  drop(device: NetworkDevice, pkt: Packet, reason: string, traceId: string): void;
  /** Simpan paket sambil menunggu ARP reply untuk `targetIp`. */
  bufferForArp(device: NetworkDevice, targetIp: string, pkt: Packet, outPort: string, traceId: string): void;
  /** Setelah ARP reply diterima, lanjutkan paket yang menunggu targetIp. */
  flushArp(device: NetworkDevice, ip: string, mac: string, traceId: string): void;
  /** Daftar IP yang sudah terpakai di seluruh topologi (untuk alokasi DHCP). */
  usedIps(): Set<string>;
  /** Status flow yang sedang berjalan (dibaca processor untuk menandai sukses/gagal). */
  getRun(traceId: string): RunResult;
}

export interface DeviceProcessor {
  handlePacket(pkt: Packet, inPort: string, core: SimulatorCore, traceId: string): void;
  /** Inisiasi DHCP client (hanya host). */
  startDhcp?(traceId: string, core: SimulatorCore): boolean;
}

export function processorKind(device: NetworkDevice): string {
  switch (device.kind) {
    case 'switch':
      return 'switch';
    case 'wireless':
      return 'wireless';
    case 'router':
    case 'firewall':
      return 'router';
    case 'pc':
    case 'server':
      return 'host';
    default:
      return 'generic';
  }
}

/** Label perangkat untuk trace/debug. */
export function deviceLabel(device: NetworkDevice): string {
  return device.name || device.id;
}

export function isEventInfo(evt: SimEvent): boolean {
  return ['PACKET_CREATED', 'PACKET_SEND', 'PACKET_FORWARDED', 'PACKET_DROPPED'].includes(evt.type);
}
