// GENERATED — adapter vendor vyos (diekstraksi dari index.ts lama).
import { CLIParser } from '../../../cli/src/index';
import type { NormalizedCommand } from '../../../cli/src/index';
import type { CommandResult, VendorAdapter as _IV } from '../common/types';

import { UbiquitiVendorAdapter } from '../ubiquiti/adapter';


export class VyosVendorAdapter extends UbiquitiVendorAdapter {
  vendorId = 'vyos';
  vendorName = 'VyOS';
  promptTemplate = 'vyos@router:~$';
}
