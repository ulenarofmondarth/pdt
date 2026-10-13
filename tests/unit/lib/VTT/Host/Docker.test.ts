import { beforeEach, describe, expect, test, vi } from 'vitest';
import DockerHost from '@lib/VTT/Host/Docker.js';
import { createHostMock } from '@tests/unit/mocks/vttHost.js';
import {
  createContainerMock,
  createDockerMock,
  dockerError,
  inspectInfo,
  type ContainerMock,
  type DockerMock,
} from '@tests/unit/mocks/dockerode.js';
import FoundryVTTServer from '@lib/VTT/Server/FoundryVTTServer.js';

import type { DockerHostConfig } from '@lib/VTT/Host/Docker.js';

const mocks = vi.hoisted(() => ({ Docker: vi.fn() }));

// No test in this file may reach a real Docker engine.
vi.mock('dockerode', () => ({ default: mocks.Docker }));

const HOST_CONFIG: DockerHostConfig = { type: 'docker', socketPath: '/var/run/docker.sock' };
const IMAGE = 'felddy/foundryvtt:12';
const CONTAINER_NAME = 'interesting-name';

describe('DockerHost', () => {
  let container: ContainerMock;
  let docker: DockerMock;
  let server: FoundryVTTServer;

  beforeEach(() => {
    container = createContainerMock();
    docker = createDockerMock(container);
    mocks.Docker.mockReset();
    mocks.Docker.mockImplementation(function () {
      return docker;
    });
    server = new FoundryVTTServer({ type: 'foundry', name: 'test-server', version: '12', hostname: 'h', port: '1' });
    server.host = createHostMock();
  });

  test('connects to the Docker engine with the options it was given', () => {
    new DockerHost(HOST_CONFIG);

    expect(mocks.Docker).toHaveBeenCalledExactlyOnceWith(HOST_CONFIG);
  });

  describe('isAccessible', () => {
    test('is true when the Docker engine answers a ping', async () => {
      const host = new DockerHost(HOST_CONFIG);

      await expect(host.isAccessible()).resolves.toBe(true);
      expect(docker.ping).toHaveBeenCalledOnce();
    });

    test('is false when the Docker engine cannot be reached', async () => {
      docker.ping.mockRejectedValue(new Error('connect ENOENT /bad/path'));
      const host = new DockerHost({ type: 'docker', socketPath: '/bad/path' });

      await expect(host.isAccessible()).resolves.toBe(false);
    });
  });

  describe('isRunning', () => {
    test('is true when the container is running', async () => {
      container.inspect.mockResolvedValue(inspectInfo(true));
      const host = new DockerHost(HOST_CONFIG);

      await expect(host.isRunning(server)).resolves.toBe(true);
      expect(docker.getContainer).toHaveBeenCalledWith(CONTAINER_NAME);
    });

    test('is false when the container exists but is stopped', async () => {
      container.inspect.mockResolvedValue(inspectInfo(false));
      const host = new DockerHost(HOST_CONFIG);

      await expect(host.isRunning(server)).resolves.toBe(false);
    });

    test('is false when the container does not exist', async () => {
      container.inspect.mockRejectedValue(dockerError(404));
      const host = new DockerHost(HOST_CONFIG);

      await expect(host.isRunning(server)).resolves.toBe(false);
    });
  });

  describe('start', () => {
    test('pulls the server image before touching the container', async () => {
      container.inspect.mockResolvedValue(inspectInfo(true));
      const host = new DockerHost(HOST_CONFIG);

      await host.start(server);

      expect(docker.pull).toHaveBeenCalledExactlyOnceWith(IMAGE, {});
      expect(docker.pull.mock.invocationCallOrder[0]).toBeLessThan(container.inspect.mock.invocationCallOrder[0]!);
    });

    test('leaves an already running container alone', async () => {
      container.inspect.mockResolvedValue(inspectInfo(true));
      const host = new DockerHost(HOST_CONFIG);

      await host.start(server);

      expect(container.start).not.toHaveBeenCalled();
      expect(docker.createContainer).not.toHaveBeenCalled();
    });

    test('starts an existing container that is stopped', async () => {
      container.inspect.mockResolvedValue(inspectInfo(false));
      const host = new DockerHost(HOST_CONFIG);

      await host.start(server);

      expect(container.start).toHaveBeenCalledOnce();
      expect(docker.createContainer).not.toHaveBeenCalled();
    });

    test('creates and starts the container when it does not exist', async () => {
      const created = createContainerMock();
      container.inspect.mockRejectedValue(dockerError(404));
      docker.createContainer.mockResolvedValue(created);
      const host = new DockerHost(HOST_CONFIG);

      await host.start(server);

      expect(docker.createContainer).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: CONTAINER_NAME, Image: IMAGE }),
      );
      expect(created.start).toHaveBeenCalledOnce();
    });

    test('fails with the cause when the container cannot be created', async () => {
      const cause = dockerError(500);
      container.inspect.mockRejectedValue(dockerError(404));
      docker.createContainer.mockRejectedValue(cause);
      const host = new DockerHost(HOST_CONFIG);

      await expect(host.start(server)).rejects.toMatchObject({
        message: `Could not start server ${CONTAINER_NAME} on Docker Host`,
        cause,
      });
    });

    test('fails with the cause when the container cannot be inspected', async () => {
      const cause = dockerError(500);
      container.inspect.mockRejectedValue(cause);
      const host = new DockerHost(HOST_CONFIG);

      await expect(host.start(server)).rejects.toMatchObject({
        message: `Could not start server ${CONTAINER_NAME} on Docker Host`,
        cause,
      });
      expect(docker.createContainer).not.toHaveBeenCalled();
    });

    test.todo('fails when a newly created container cannot be started');
    test.todo('names the container and image after the server it is given');
  });

  test.todo('stop stops the server container');
  test.todo('restart restarts the server container');
});
