import { describe, expect, test } from 'vitest';
import createServer from '@lib/VTT/VTTServerFactory.js';
import FoundryVTTServer from '@lib/VTT/Server/FoundryVTTServer.js';
import VTTServer from '@lib/VTT/VTTServer.js';

import type { Config } from '@schema/config.js';

describe('createServer', () => {
  test('creates a Foundry VTT server for the foundry type', () => {
    const server = createServer({ type: 'foundry', name: 'unit-test-vtt', version: '12' });

    expect(server).toBeInstanceOf(FoundryVTTServer);
    expect(server).toBeInstanceOf(VTTServer);
  });

  test("gives the server its settings from the configured VTTs, by the server's name", () => {
    const vtts: Config['VTT'] = {
      'unit-test-vtt': {
        server: { type: 'foundry', version: '13', hostname: 'configured.example' },
        host: { type: 'docker', image: 'felddy/foundryvtt', version: '13', ports: [] },
      },
    };

    const server = createServer({ type: 'foundry', name: 'unit-test-vtt', version: '' }, vtts);

    expect(server.version).toBe('13');
  });

  test('rejects an unknown VTT type, naming it', () => {
    expect(() => createServer({ type: 'unknown', name: 'unit-test-vtt', version: '12' })).toThrow(
      'Unknown VTT type (unknown)',
    );
  });
});
