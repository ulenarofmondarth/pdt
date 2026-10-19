import createHost from './VTTHostFactory.js';
import createServer from './VTTServerFactory.js';

import type VTTServer from './VTTServer.js';
import type { VttSettings } from '@schema/config.js';

/**
 * Create a VTT: its server, on a host of its own.
 *
 * @param name - Name of the VTT, its key under `VTT` in the configuration
 * @param settings - The VTT's settings, as in the configuration
 * @throws {Error} When the server or host type is not one pdt knows
 */
export function createVtt(name: string, settings: VttSettings): VTTServer {
  return createServer(name, settings.server, createHost(settings.host));
}
