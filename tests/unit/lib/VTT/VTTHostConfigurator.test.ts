import { describe, expect, test } from 'vitest';
import createVTTConfiguration from '@lib/VTT/VTTHostConfigurator.js';
import FoundryVTTServer from '@lib/VTT/Server/FoundryVTTServer.js';
import { createHostMock } from '@tests/unit/mocks/vttHost.js';

describe('createVTTConfiguration', () => {
  test('returns a configuration object for a host and a server', () => {
    const server = new FoundryVTTServer({
      type: 'foundry',
      name: 'unit-test-vtt',
      version: '12',
      hostname: 'h',
      port: '1',
    });

    expect(createVTTConfiguration(createHostMock(), server)).toBeTypeOf('object');
  });

  // The configurator is still a stub. This is the behaviour it is meant to have:
  // { name: <server name>, Image: 'felddy/foundryvtt:<version>', AttachStdin: false, AttachStdout: false,
  //   AttachStderr: false, Tty: false, HostConfig: { AutoRemove: false } }
  test.todo('describes the container a Docker host needs to run a given server');
});
