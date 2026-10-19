import { describe, expect, test } from 'vitest';
import createVTTConfiguration from '@lib/VTT/VTTHostConfigurator.js';
import FoundryVTTServer from '@lib/VTT/Server/FoundryVTTServer.js';
import { createHostMock } from '@tests/unit/mocks/vttHost.js';

describe('createVTTConfiguration', () => {
  test('returns a configuration object for a host and a server', () => {
    const host = createHostMock();
    const server = new FoundryVTTServer(
      'unit-test-vtt',
      { type: 'foundry', version: '12', hostname: 'h', port: 'auto' },
      host,
    );

    expect(createVTTConfiguration(host, server)).toBeTypeOf('object');
  });

  // The configurator is still a stub. This is the behaviour it is meant to have:
  // { name: <server name>, Image: 'felddy/foundryvtt:<version>', AttachStdin: false, AttachStdout: false,
  //   AttachStderr: false, Tty: false, HostConfig: { AutoRemove: false } }
  test.todo('describes the container a Docker host needs to run a given server');
});
