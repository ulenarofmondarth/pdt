import { describe, expect, test } from 'vitest';
import { createVtt } from '@lib/VTT/createVtt.js';
import DockerHost from '@lib/VTT/Host/Docker.js';
import FoundryVTTServer from '@lib/VTT/Server/FoundryVTTServer.js';

import type { VttSettings } from '@schema/config.js';

const SETTINGS: VttSettings = {
  server: { type: 'foundry', version: '13', hostname: 'localhost', port: 'auto' },
  host: { type: 'docker', image: 'felddy/foundryvtt', socketPath: '/nonexistent/docker.sock' },
};

describe('createVtt', () => {
  test('creates the server named, on a host made from its host settings', () => {
    const server = createVtt('unit-test-vtt', SETTINGS);

    expect(server).toBeInstanceOf(FoundryVTTServer);
    expect(server).toMatchObject({ name: 'unit-test-vtt', settings: SETTINGS.server });
    expect(server.host).toBeInstanceOf(DockerHost);
    expect(server.host).toMatchObject({ settings: SETTINGS.host });
  });
});
