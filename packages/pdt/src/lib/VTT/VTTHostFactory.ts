import DockerHost from './Host/Docker.js';
import VTTHost from './VTTHost.js';
import { m } from '@i18n/messages.js';

import type { HostSettings } from '@schema/config.js';

/**
 * Create a VTT host.
 *
 * @param settings - The host's settings; their type picks the kind of host
 * @throws {Error} When the type is not one pdt knows
 */
export default function createHost(settings: HostSettings): VTTHost {
  switch (settings.type) {
    case 'docker':
      return new DockerHost(settings);
    default: {
      // The configuration schema admits no other type; this guards settings made some other way.
      const { type } = settings as { type: string };
      throw new Error(m['error.vtt.unknownHostType']({ type }));
    }
  }
}
