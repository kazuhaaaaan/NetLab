export interface HardwareSpec {
  modelName: string;
  vendor: string;
  defaultPorts: Array<{ name: string; speedMbps: number }>;
  ramMb: number;
  cpuCores: number;
}

export const ROUTERBOARD_3011_SPEC: HardwareSpec = {
  modelName: 'RB3011UiAS-RM',
  vendor: 'MikroTik',
  defaultPorts: [
    { name: 'ether1', speedMbps: 1000 },
    { name: 'ether2', speedMbps: 1000 },
    { name: 'ether3', speedMbps: 1000 },
    { name: 'ether4', speedMbps: 1000 },
    { name: 'sfp1', speedMbps: 1250 }
  ],
  ramMb: 1024,
  cpuCores: 2
};
