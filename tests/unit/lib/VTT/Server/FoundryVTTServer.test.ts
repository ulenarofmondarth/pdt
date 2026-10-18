import { describe, expect, test } from 'vitest';
import FoundryVTTServer from '@lib/VTT/Server/FoundryVTTServer.js';
import VTTServer from '@lib/VTT/VTTServer.js';
import { createHostMock } from '@tests/unit/mocks/vttHost.js';

import type { FoundryServerSettings } from '@schema/config.js';

const SETTINGS: FoundryServerSettings = { type: 'foundry', version: '12', hostname: 'vtt.example', port: '8080' };

describe('FoundryVTTServer', () => {
  test('is a VTTServer', () => {
    expect(new FoundryVTTServer('unit-test-vtt', SETTINGS, createHostMock())).toBeInstanceOf(VTTServer);
  });

  test('has its name, host and settings', () => {
    const host = createHostMock();

    const server = new FoundryVTTServer('unit-test-vtt', SETTINGS, host);

    expect(server).toMatchObject({ name: 'unit-test-vtt', host, version: '12', hostname: 'vtt.example', port: '8080' });
  });

  test('has no port when its settings set none', () => {
    const withoutPort: FoundryServerSettings = { ...SETTINGS };
    delete withoutPort.port;

    expect(new FoundryVTTServer('unit-test-vtt', withoutPort, createHostMock()).port).toBeUndefined();
  });

  describe.each(['start', 'stop', 'restart'] as const)('%s', action => {
    test('asks its host, for itself', async () => {
      const host = createHostMock();
      const server = new FoundryVTTServer('unit-test-vtt', SETTINGS, host);

      await server[action]();

      expect(host[action]).toHaveBeenCalledExactlyOnceWith(server);
    });

    test('waits for its host', async () => {
      const host = createHostMock();
      let finished = false;
      host[action].mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        finished = true;
      });
      const server = new FoundryVTTServer('unit-test-vtt', SETTINGS, host);

      await server[action]();

      expect(finished).toBe(true);
    });

    // Regression: the host's start was not awaited, so its failure was an unhandled rejection.
    test('fails when its host fails', async () => {
      const host = createHostMock();
      const cause = new Error('the host said no');
      host[action].mockRejectedValue(cause);
      const server = new FoundryVTTServer('unit-test-vtt', SETTINGS, host);

      await expect(server[action]()).rejects.toBe(cause);
    });
  });

  describe('isRunning', () => {
    test.each([true, false])('reports %s when its host reports %s', async running => {
      const host = createHostMock();
      host.isRunning.mockResolvedValue(running);
      const server = new FoundryVTTServer('unit-test-vtt', SETTINGS, host);

      await expect(server.isRunning()).resolves.toBe(running);
      expect(host.isRunning).toHaveBeenCalledExactlyOnceWith(server);
    });
  });
});
