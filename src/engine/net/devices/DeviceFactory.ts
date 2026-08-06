// ============================================================
// DeviceFactory — Factory Pattern: PortSpec/LabNode → NetworkDevice
// ============================================================

import { DeviceKind } from '../core/types';
import { NetworkDevice } from './NetworkDevice';

export interface NodeLike {
  id: string;
  name: string;
  vendor: string;
  model: string;
  deviceType: string;
  ports: { id: string; name: string; macAddress?: string; status?: string; ipAddress?: string; speedMbps?: number }[];
}

export function kindOfDeviceType(deviceType: string): DeviceKind {
  switch (deviceType) {
    case 'router':
      return 'router';
    case 'firewall':
      return 'firewall';
    case 'switch':
      return 'switch';
    case 'wireless':
      return 'wireless';
    case 'pc':
      return 'pc';
    case 'server':
      return 'server';
    default:
      return 'generic';
  }
}

export class DeviceFactory {
  create(node: NodeLike): NetworkDevice {
    const kind = kindOfDeviceType(node.deviceType);
    const dev = new NetworkDevice(node.id, node.name, node.deviceType, kind, node.vendor);
    dev.syncPorts(node.ports);
    return dev;
  }
}
