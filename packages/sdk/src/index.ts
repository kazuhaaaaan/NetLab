import { IVendorAdapter } from '../../vendors/src/index';

export interface MikroLabPlugin {
  id: string;
  name: string;
  version: string;
  vendorAdapters?: IVendorAdapter[];
  onInit?(): void;
}
