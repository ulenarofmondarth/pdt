import { describe, test, expect } from 'vitest';
import DockerHost from './Host/Docker.js';
import createServer from './VTTServerFactory.js';
import createVTTConfiguration from './VTTHostConfigurator.js';

import type { DockerHostConfig } from './Host/Docker.js';
import type { VTTServerConfig } from './VTTServer.js';

describe('createVTTConfiguration', () => {
  test.skip('given a Host and a Server return a Host configuration for that server', () => {
    const hostConfig: DockerHostConfig = { type: 'docker' };
    const dockerHost = new DockerHost(hostConfig);
    const serverConfig: VTTServerConfig = { type: 'foundry', name: 'VTTConfigurator-test' };
    const server = createServer(serverConfig);

    const expectedConfig = {
      name: 'VTTConfigurator-test',
      Image: 'felddy/foundryvtt:12',
      AttachStdin: false,
      AttackStdout: false,
      AttachStderr: false,
      Tty: false,
      HostConfig: {
        AutoRemove: false,
      },
    };

    const vttConfig = createVTTConfiguration(dockerHost, server);

    expect(vttConfig).toMatchObject(expectedConfig);
  });
});
