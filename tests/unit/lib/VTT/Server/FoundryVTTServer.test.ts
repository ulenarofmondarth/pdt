import { describe, expect, test } from 'vitest';
import FoundryVTTServer, { FOUNDRY_PORT } from '@lib/VTT/Server/FoundryVTTServer.js';
import VTTServer from '@lib/VTT/VTTServer.js';
import { createHostMock } from '@tests/unit/mocks/vttHost.js';

import type { FoundryServerSettings } from '@schema/config.js';

const SETTINGS: FoundryServerSettings = { type: 'foundry', version: '12', hostname: 'vtt.example', port: 8080 };

describe('FoundryVTTServer', () => {
  test('is a VTTServer', () => {
    expect(new FoundryVTTServer('unit-test-vtt', SETTINGS, createHostMock())).toBeInstanceOf(VTTServer);
  });

  test('has its name, host and settings', () => {
    const host = createHostMock();

    const server = new FoundryVTTServer('unit-test-vtt', SETTINGS, host);

    expect(server).toMatchObject({ name: 'unit-test-vtt', host, version: '12', hostname: 'vtt.example', port: 8080 });
  });

  test("serves on Foundry VTT's own port inside its host", () => {
    expect(new FoundryVTTServer('unit-test-vtt', SETTINGS, createHostMock()).internalPort).toBe(FOUNDRY_PORT);
    expect(FOUNDRY_PORT).toBe(30000);
  });

  test('is reached at its hostname, on the port it is published on', () => {
    expect(new FoundryVTTServer('unit-test-vtt', SETTINGS, createHostMock()).urlAt(30001)).toBe(
      'http://vtt.example:30001',
    );
  });

  describe('start', () => {
    test('asks its host to run it, as told, and gives back how to find it', async () => {
      const host = createHostMock();
      const server = new FoundryVTTServer('unit-test-vtt', SETTINGS, host);

      await expect(server.start({ name: 'pdt-x', port: 30001 })).resolves.toEqual({ id: 'container-id' });

      expect(host.start).toHaveBeenCalledExactlyOnceWith(server, { name: 'pdt-x', port: 30001 });
    });

    // Regression: the host's start was not awaited, so its failure was an unhandled rejection.
    test('fails when its host fails', async () => {
      const host = createHostMock();
      const cause = new Error('the host said no');
      host.start.mockRejectedValue(cause);
      const server = new FoundryVTTServer('unit-test-vtt', SETTINGS, host);

      await expect(server.start({ name: 'pdt-x', port: 30001 })).rejects.toBe(cause);
    });
  });
});
