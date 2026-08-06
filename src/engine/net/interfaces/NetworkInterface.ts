// ============================================================
// NetworkInterface — port abstrak (ethernet/wireless/vlan/bridge/loopback)
// ============================================================

import { IfaceType, IpConfig } from '../core/types';

export class NetworkInterfaceModel {
  portId: string;
  name: string;
  mac: string;
  ip?: IpConfig;
  up: boolean;
  type: IfaceType;
  vlanId?: number;
  parentPort?: string;
  speedMbps: number;
  mtu: number;

  constructor(opts: {
    portId: string;
    name: string;
    mac: string;
    ip?: IpConfig;
    up?: boolean;
    type?: IfaceType;
    vlanId?: number;
    parentPort?: string;
    speedMbps?: number;
    mtu?: number;
  }) {
    this.portId = opts.portId;
    this.name = opts.name;
    this.mac = opts.mac;
    this.ip = opts.ip;
    this.up = opts.up ?? false;
    this.type = opts.type ?? 'ethernet';
    this.vlanId = opts.vlanId;
    this.parentPort = opts.parentPort;
    this.speedMbps = opts.speedMbps ?? 1000;
    this.mtu = opts.mtu ?? 1500;
  }

  isVirtual(): boolean {
    return this.type === 'vlan';
  }

  /** Interface ini membawa VLAN tertentu (access atau subinterface). */
  effectiveVlan(frameVlan: number | null): number {
    if (frameVlan != null) return frameVlan;
    return this.vlanId ?? 1;
  }
}
