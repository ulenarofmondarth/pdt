import VTTServer from '@lib/VTT/VTTServer.js';

import FoundryVTTServer from '@lib/VTT/Server/FoundryVTTServer.js';

import type { FoundryVTTServerConfig } from '@lib/VTT/Server/FoundryVTTServer.js';
import type { VTTServerConfig } from '@lib/VTT/VTTServer.js';

/**
 * Magic mapppens
 *
 * @param host The nost
 *
 *
 *
 */
export default function createServer(vttOptions: VTTServerConfig): VTTServer {
  switch (vttOptions.type) {
    case 'foundry':
      return new FoundryVTTServer(vttOptions as FoundryVTTServerConfig);
    default:
      throw new Error(`Unknown VTT type (${vttOptions.type})`);
  }
}
