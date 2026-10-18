import VTTServer from '@lib/VTT/VTTServer.js';
import VTTHost from '@lib/VTT/VTTHost.js';
import FoundryVTTServer from '@lib/VTT/Server/FoundryVTTServer.js';
import { m } from '@i18n/messages.js';

import type { ServerSettings } from '@schema/config.js';

/**
 * Create a VTT server.
 *
 * @param name - Name of the server, unique among the servers of a project
 * @param settings - The server's settings; their type picks the kind of server
 * @param host - Where the server runs
 * @throws {Error} When the type is not one pdt knows
 */
export default function createServer(name: string, settings: ServerSettings, host: VTTHost): VTTServer {
  switch (settings.type) {
    case 'foundry':
      return new FoundryVTTServer(name, settings, host);
    default: {
      // The configuration schema admits no other type; this guards settings made some other way.
      const { type } = settings as { type: string };
      throw new Error(m['error.vtt.unknownServerType']({ type }));
    }
  }
}
