import { describe, expect, test } from 'vitest';
import FoundryVTTServer, { FOUNDRY_PORT } from '@lib/VTT/Server/FoundryVTTServer.js';
import VTTServer from '@lib/VTT/VTTServer.js';
import { createHostMock } from '@tests/unit/mocks/vttHost.js';

import type { FoundryServerSettings } from '@schema/config.js';

const RUN = { name: 'pdt-x', port: 30001, environment: {}, mounts: [] };
const SETTINGS: FoundryServerSettings = {
  type: 'foundry',
  version: '12',
  hostname: 'vtt.example',
  port: 8080,
  ready: { timeout: 600 },
};

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

  test('keeps its data in /data, and finds modules in /data/Data/modules, as the felddy/foundryvtt image has it', () => {
    const server = new FoundryVTTServer('unit-test-vtt', SETTINGS, createHostMock());

    expect(server.dataPath).toBe('/data');
    expect(server.modulePath('my-module')).toBe('/data/Data/modules/my-module');
  });

  describe('environment', () => {
    test('has the account, licence key, administrator password and owner, in the variables the image reads', () => {
      const server = new FoundryVTTServer('unit-test-vtt', { ...SETTINGS, admin_key: 'adm1n' }, createHostMock(), {
        username: 'me',
        password: 'hunter2',
        license_key: 'ABCD',
      });

      expect(server.environment({ uid: 1000, gid: 100 })).toEqual({
        FOUNDRY_USERNAME: 'me',
        FOUNDRY_PASSWORD: 'hunter2',
        FOUNDRY_LICENSE_KEY: 'ABCD',
        FOUNDRY_ADMIN_KEY: 'adm1n',
        FOUNDRY_UID: '1000',
        FOUNDRY_GID: '100',
      });
    });

    test('has only what is set', () => {
      const server = new FoundryVTTServer('unit-test-vtt', SETTINGS, createHostMock(), { license_key: 'ABCD' });

      expect(server.environment()).toEqual({ FOUNDRY_LICENSE_KEY: 'ABCD' });
    });

    test('is empty without an account', () => {
      expect(new FoundryVTTServer('unit-test-vtt', SETTINGS, createHostMock()).environment()).toEqual({});
    });
  });

  describe('start', () => {
    test('asks its host to run it, as told, and gives back how to find it', async () => {
      const host = createHostMock();
      const server = new FoundryVTTServer('unit-test-vtt', SETTINGS, host);

      await expect(server.start(RUN)).resolves.toEqual({ id: 'container-id' });

      expect(host.start).toHaveBeenCalledExactlyOnceWith(server, RUN);
    });

    // Regression: the host's start was not awaited, so its failure was an unhandled rejection.
    test('fails when its host fails', async () => {
      const host = createHostMock();
      const cause = new Error('the host said no');
      host.start.mockRejectedValue(cause);
      const server = new FoundryVTTServer('unit-test-vtt', SETTINGS, host);

      await expect(server.start(RUN)).rejects.toBe(cause);
    });
  });
});
