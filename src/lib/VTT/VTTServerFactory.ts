import VTTServer from '@lib/VTT/VTTServer.js';

import FoundryVTTServer from '@lib/VTT/Server/FoundryVTTServer.js';

import type { FoundryVTTServerConfig } from '@lib/VTT/Server/FoundryVTTServer.js';
import type { VTTServerConfig } from '@lib/VTT/VTTServer.js';
import type { Config } from '@schema/config.js';

/**
 * Create the server for a VTT.
 *
 * @param vttOptions - The server; its type picks the kind of server
 * @param vtts - The configured VTTs; the one with the server's name fills in what `vttOptions` leaves empty
 * @throws {Error} When the type is not one pdt knows
 */
export default function createServer(vttOptions: VTTServerConfig, vtts: Config['VTT'] = {}): VTTServer {
  switch (vttOptions.type) {
    case 'foundry':
      return new FoundryVTTServer(vttOptions as FoundryVTTServerConfig, vtts[vttOptions.name]?.server);
    default:
      throw new Error(`Unknown VTT type (${vttOptions.type})`);
  }
}
