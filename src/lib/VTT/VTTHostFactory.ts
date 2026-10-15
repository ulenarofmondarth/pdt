import DockerHost from './Host/Docker.js';

import type { VTTHostConfig } from './VTTHost.js';

export default function createHost(config: VTTHostConfig) {
  switch (config.type) {
    case 'docker':
      return new DockerHost(config);
    default:
      throw new Error(`Unknown VTT Host type (${config.type})`);
  }
}
