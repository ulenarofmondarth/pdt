import { describe, expect, test, vi } from 'vitest';
import createServer from '@lib/VTT/VTTServerFactory.js';
import FoundryVTTServer from '@lib/VTT/Server/FoundryVTTServer.js';
import VTTServer from '@lib/VTT/VTTServer.js';

// A Foundry server reads the values it is not given from the configuration.
vi.mock('@util/config.js', () => ({ default: { VTT: {} } }));

describe('createServer', () => {
  test('creates a Foundry VTT server for the foundry type', () => {
    const server = createServer({ type: 'foundry', name: 'unit-test-vtt', version: '12' });

    expect(server).toBeInstanceOf(FoundryVTTServer);
    expect(server).toBeInstanceOf(VTTServer);
  });

  test('rejects an unknown VTT type, naming it', () => {
    expect(() => createServer({ type: 'unknown', name: 'unit-test-vtt', version: '12' })).toThrow(
      'Unknown VTT type (unknown)',
    );
  });
});
