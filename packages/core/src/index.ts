export interface DeviceEntity {
  id: string;
  name: string;
  vendor: string;
  deviceType: 'router' | 'switch' | 'firewall' | 'pc' | 'server';
  ports: DevicePort[];
  status: 'powered_on' | 'powered_off' | 'rebooting';
}

export interface DevicePort {
  id: string;
  name: string;
  speedMbps: number;
  macAddress: string;
  connectedEdgeId?: string;
}

export class CoreTopologyEngine {
  private devices: Map<string, DeviceEntity> = new Map();

  public addDevice(device: DeviceEntity): void {
    this.devices.set(device.id, device);
  }

  public getDevice(id: string): DeviceEntity | undefined {
    return this.devices.get(id);
  }
}
