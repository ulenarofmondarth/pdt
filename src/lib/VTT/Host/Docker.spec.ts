import { describe, test, expect, beforeAll, afterEach, vi } from 'vitest';
import DockerHost from './Docker.js';
import VTTServer from '../VTTServer.js';
import createServer from '../VTTServerFactory.js';
import Docker from 'dockerode';

import type { VTTServerConfig } from '../VTTServer.js';

describe('DockerHost', () => {
  let server: VTTServer;

  beforeAll(() => {
    const standardServer: VTTServerConfig = { type: 'foundry', name: 'docker-test-server' };
    server = createServer(standardServer);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('isAccessible true if Docker Engine accessible', async () => {
    const spy = vi.spyOn(Docker.prototype, 'ping').mockImplementation(() => Promise.resolve({}));
    const docker = new DockerHost({ type: 'docker', socketPath: '/var/run/docker.sock' });

    await expect(docker.isAccessible()).resolves.toBeTruthy();
    expect(spy).toHaveBeenCalled();
  });

  test('throws an error if Docker Engine is not accessible', async () => {
    const spy = vi.spyOn(Docker.prototype, 'ping').mockImplementation(() => Promise.reject(new Error('fail')));
    const docker = new DockerHost({ type: 'docker', socketPath: '/bad/path' });

    await expect(docker.isAccessible()).resolves.toBeFalsy();
    expect(spy).toHaveBeenCalled();
  });

  test('isRunning false for non-existant server', async () => {
    const noServer = server;
    const docker = new DockerHost({ type: 'docker', socketPath: '/var/run/docker.sock' });

    await expect(docker.isRunning(noServer)).resolves.toBeFalsy();
  });

  test.skip('runs new VTTServer container on start()', async () => {
    const docker = new DockerHost({ type: 'docker', socketPath: '/var/run/docker.sock' });

    await docker.start(server);

    await expect(server.isRunning()).resolves.toBeTruthy();
  }, 30000);
});
