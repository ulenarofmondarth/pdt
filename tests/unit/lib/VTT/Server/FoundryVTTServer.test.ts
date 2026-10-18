import { describe, expect, test } from 'vitest';
import FoundryVTTServer from '@lib/VTT/Server/FoundryVTTServer.js';
import VTTServer from '@lib/VTT/VTTServer.js';
import { createHostMock } from '@tests/unit/mocks/vttHost.js';

import type { FoundryVTTServerConfig } from '@lib/VTT/Server/FoundryVTTServer.js';

const FULL_CONFIG: FoundryVTTServerConfig = {
  type: 'foundry',
  name: 'unit-test-vtt',
  version: '12',
  hostname: 'vtt.example',
  port: '8080',
};

/** The server's settings in the configuration. */
const CONFIGURED = { type: 'foundry', version: '13', hostname: 'configured.example', port: 'auto' } as const;

describe('FoundryVTTServer', () => {
  test('is a VTTServer', () => {
    expect(new FoundryVTTServer(FULL_CONFIG)).toBeInstanceOf(VTTServer);
  });

  describe('configuration', () => {
    test('uses the values it is given without consulting the configuration', () => {
      const server = new FoundryVTTServer(FULL_CONFIG);

      expect(server).toMatchObject({ _name: 'unit-test-vtt', _version: '12', _hostname: 'vtt.example', _port: '8080' });
    });

    test('prefers the values it is given to the configuration', () => {
      const server = new FoundryVTTServer(FULL_CONFIG, CONFIGURED);

      expect(server).toMatchObject({ _version: '12', _hostname: 'vtt.example', _port: '8080' });
    });

    test('falls back to the configuration for values that are not given', () => {
      const server = new FoundryVTTServer({ type: 'foundry', name: 'unit-test-vtt', version: '' }, CONFIGURED);

      expect(server).toMatchObject({ _version: '13', _hostname: 'configured.example', _port: 'auto' });
    });

    test('leaves empty what neither it is given nor the configuration has', () => {
      const server = new FoundryVTTServer({ type: 'foundry', name: 'unit-test-vtt', version: '' });

      expect(server).toMatchObject({ _version: '', _hostname: '', _port: '' });
      expect(server.version).toBe('');
    });
  });

  describe('start', () => {
    test('asks its host to start it', async () => {
      const host = createHostMock();
      const server = new FoundryVTTServer(FULL_CONFIG);
      server.host = host;

      await server.start();

      expect(host.start).toHaveBeenCalledExactlyOnceWith(server);
    });

    test('fails when it has no host', async () => {
      const server = new FoundryVTTServer(FULL_CONFIG);

      await expect(server.start()).rejects.toThrow('No host environment provided');
    });
  });

  describe('isRunning', () => {
    test('is false when it has no host', async () => {
      const server = new FoundryVTTServer(FULL_CONFIG);

      await expect(server.isRunning()).resolves.toBe(false);
    });

    test.each([true, false])('reports %s when its host reports %s', async running => {
      const host = createHostMock();
      host.isRunning.mockResolvedValue(running);
      const server = new FoundryVTTServer(FULL_CONFIG);
      server.host = host;

      await expect(server.isRunning()).resolves.toBe(running);
      expect(host.isRunning).toHaveBeenCalledExactlyOnceWith(server);
    });
  });

  test.todo('stop asks its host to stop it');
  test.todo('restart asks its host to restart it');
});
