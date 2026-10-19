import { beforeEach, describe, expect, test } from 'vitest';
import DockerHost, { dockerOptions } from '@lib/VTT/Host/Docker.js';
import { createHostMock } from '@tests/unit/mocks/vttHost.js';
import {
  asDocker,
  createContainerMock,
  createDockerMock,
  createImageMock,
  dockerError,
  failingPullStream,
  inspectInfo,
  pullStream,
  type ContainerMock,
  type DockerMock,
  type ImageMock,
} from '@tests/unit/mocks/dockerode.js';
import FoundryVTTServer from '@lib/VTT/Server/FoundryVTTServer.js';
import { m } from '@i18n/messages.js';

import type { DockerHostSettings, FoundryServerSettings } from '@schema/config.js';
import type { ImageInspectInfo } from 'dockerode';

const HOST_CONFIG: DockerHostSettings = {
  type: 'docker',
  socketPath: '/var/run/docker.sock',
  image: 'felddy/foundryvtt',
};
const SERVER: FoundryServerSettings = { type: 'foundry', version: '12', hostname: 'h', port: 'auto' };
const IMAGE = 'felddy/foundryvtt:12';
const CONTAINER_NAME = 'pdt-test';
const RUN = { name: CONTAINER_NAME, port: 30001 };
const HANDLE = { id: 'container-id' };

describe('DockerHost', () => {
  let container: ContainerMock;
  let docker: DockerMock;
  let server: FoundryVTTServer;
  let created: ContainerMock;
  let image: ImageMock;

  beforeEach(() => {
    container = createContainerMock();
    // No container of the name exists, until a test says one does.
    container.inspect.mockRejectedValue(dockerError(404));
    created = createContainerMock('created-id');
    image = createImageMock();
    docker = createDockerMock(container, image);
    docker.createContainer.mockResolvedValue(created);
    server = new FoundryVTTServer('test-server', SERVER, createHostMock());
  });

  /** A host using the mock engine. */
  function hostWith(settings: DockerHostSettings = HOST_CONFIG): DockerHost {
    return new DockerHost(settings, asDocker(docker));
  }

  describe('connection to the Docker engine', () => {
    test('is through the socket the settings name', () => {
      expect(dockerOptions(HOST_CONFIG)).toEqual({ socketPath: '/var/run/docker.sock' });
    });

    test("is dockerode's default when the settings name no socket", () => {
      const noSocket: DockerHostSettings = { ...HOST_CONFIG };
      delete noSocket.socketPath;

      expect(dockerOptions(noSocket)).toEqual({});
    });

    test('is given none of the image settings', () => {
      // dockerode reads `version` as the Docker API version, not the image tag.
      expect(dockerOptions({ ...HOST_CONFIG, repository: 'ghcr.io', version: '12' })).toEqual({
        socketPath: '/var/run/docker.sock',
      });
    });

    // Creating a client does not connect to anything.
    test('is a client of its own when it is not given one', () => {
      const host = new DockerHost(HOST_CONFIG);

      // docker-modem's type declarations leave out the socket it keeps.
      expect(host.docker.modem).toMatchObject({ socketPath: '/var/run/docker.sock' });
    });

    test('is the client it is given', () => {
      expect(hostWith().docker).toBe(docker);
    });
  });

  describe('isAccessible', () => {
    test('is true when the Docker engine answers a ping', async () => {
      const host = hostWith();

      await expect(host.isAccessible()).resolves.toBe(true);
      expect(docker.ping).toHaveBeenCalledOnce();
    });

    test('is false when the Docker engine cannot be reached', async () => {
      docker.ping.mockRejectedValue(new Error('connect ENOENT /bad/path'));
      const host = hostWith({ ...HOST_CONFIG, socketPath: '/bad/path' });

      await expect(host.isAccessible()).resolves.toBe(false);
    });
  });

  describe('isRunning', () => {
    test('is true when the container is running', async () => {
      container.inspect.mockResolvedValue(inspectInfo(true));

      await expect(hostWith().isRunning(HANDLE)).resolves.toBe(true);
      expect(docker.getContainer).toHaveBeenCalledWith('container-id');
    });

    test('is false when the container exists but is stopped', async () => {
      container.inspect.mockResolvedValue(inspectInfo(false));

      await expect(hostWith().isRunning(HANDLE)).resolves.toBe(false);
    });

    test('is false when the container does not exist', async () => {
      await expect(hostWith().isRunning(HANDLE)).resolves.toBe(false);
    });
  });

  describe('start', () => {
    test('waits for a pull whose progress messages are split across chunks', async () => {
      docker.pull.mockResolvedValue(
        pullStream('{"status":"Pulling fr', 'om library/image"}\n{"status":"Downloaded"}\n{"sta', 'tus":"Done"}\n'),
      );
      const host = hostWith();

      await expect(host.start(server, RUN)).resolves.toEqual({ id: 'created-id' });
    });

    test('fails naming the image when the pull is refused, such as for a tag the registry does not have', async () => {
      const cause = Object.assign(dockerError(404), { message: 'manifest unknown' });
      docker.pull.mockRejectedValue(cause);
      const host = hostWith();

      await expect(host.start(server, RUN)).rejects.toMatchObject({
        message: m['error.vtt.pullFailed']({ image: IMAGE, reason: 'manifest unknown' }),
        cause,
      });
      expect(container.inspect).not.toHaveBeenCalled();
    });

    test('fails when the image pull stream fails', async () => {
      const cause = new Error('connection reset');
      docker.pull.mockResolvedValue(failingPullStream(cause));
      const host = hostWith();

      await expect(host.start(server, RUN)).rejects.toMatchObject({
        message: m['error.vtt.pullFailed']({ image: IMAGE, reason: 'connection reset' }),
        cause,
      });
      expect(container.inspect).not.toHaveBeenCalled();
    });

    test('fails when Docker reports an error in the pull progress', async () => {
      docker.pull.mockResolvedValue(
        pullStream('{"status":"Pulling from library/image"}\n{"error":"unauthorized: authentication required"}\n'),
      );
      const host = hostWith();

      await expect(host.start(server, RUN)).rejects.toThrow(
        m['error.vtt.pullFailed']({ image: IMAGE, reason: 'unauthorized: authentication required' }),
      );
      expect(container.inspect).not.toHaveBeenCalled();
    });

    test('does not pull an image the engine already has', async () => {
      image.inspect.mockResolvedValue({} as ImageInspectInfo);
      const host = hostWith();

      await host.start(server, RUN);

      expect(docker.getImage).toHaveBeenCalledExactlyOnceWith(IMAGE);
      expect(docker.pull).not.toHaveBeenCalled();
    });

    test('fails with the cause when it cannot tell whether the engine has the image', async () => {
      const cause = dockerError(500);
      image.inspect.mockRejectedValue(cause);
      const host = hostWith();

      await expect(host.start(server, RUN)).rejects.toBe(cause);
      expect(docker.pull).not.toHaveBeenCalled();
      expect(container.inspect).not.toHaveBeenCalled();
    });

    test('pulls the server image before touching the container', async () => {
      await hostWith().start(server, RUN);

      expect(docker.pull).toHaveBeenCalledExactlyOnceWith(IMAGE, {});
      expect(docker.pull.mock.invocationCallOrder[0]).toBeLessThan(container.inspect.mock.invocationCallOrder[0]!);
    });

    test('creates and starts a container of the name it is given, and gives back its id', async () => {
      await expect(hostWith().start(server, RUN)).resolves.toEqual({ id: 'created-id' });

      expect(docker.getContainer).toHaveBeenCalledWith(CONTAINER_NAME);
      expect(docker.createContainer).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: CONTAINER_NAME, Image: IMAGE }),
      );
      expect(created.start).toHaveBeenCalledOnce();
    });

    test("publishes the server's port on the port it is given", async () => {
      await hostWith().start(server, RUN);

      expect(docker.createContainer).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          ExposedPorts: { '30000/tcp': {} },
          HostConfig: expect.objectContaining({ PortBindings: { '30000/tcp': [{ HostPort: '30001' }] } }),
        }),
      );
    });

    test('removes a stopped container of the name, left from an earlier run, and creates it afresh', async () => {
      container.inspect.mockResolvedValue(inspectInfo(false));

      await hostWith().start(server, RUN);

      expect(container.remove).toHaveBeenCalledOnce();
      expect(container.remove.mock.invocationCallOrder[0]).toBeLessThan(
        docker.createContainer.mock.invocationCallOrder[0]!,
      );
      expect(created.start).toHaveBeenCalledOnce();
    });

    test('refuses, touching nothing, when a container of the name is running', async () => {
      container.inspect.mockResolvedValue(inspectInfo(true));

      await expect(hostWith().start(server, RUN)).rejects.toThrow(
        m['error.vtt.containerRunning']({ container: CONTAINER_NAME }),
      );
      expect(container.remove).not.toHaveBeenCalled();
      expect(docker.createContainer).not.toHaveBeenCalled();
    });

    test('tags the image with the server version', async () => {
      const other = new FoundryVTTServer('other-server', { ...SERVER, version: '13.351' }, createHostMock());

      await hostWith().start(other, RUN);

      expect(docker.pull).toHaveBeenCalledExactlyOnceWith('felddy/foundryvtt:13.351', {});
      expect(docker.createContainer).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ Image: 'felddy/foundryvtt:13.351' }),
      );
    });

    test.each([
      [{ image: 'example/foundry' }, 'example/foundry:12'],
      [{ image: 'felddy/foundryvtt', repository: 'ghcr.io' }, 'ghcr.io/felddy/foundryvtt:12'],
    ])('uses the image configured for the host (%o)', async (imageConfig, expected) => {
      await hostWith({ ...HOST_CONFIG, ...imageConfig }).start(server, RUN);

      expect(docker.pull).toHaveBeenCalledExactlyOnceWith(expected, {});
      expect(docker.createContainer).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ Image: expected }));
    });

    test('fails without touching Docker when the server has no version', async () => {
      const unversioned = new FoundryVTTServer('test-server', { ...SERVER, version: '' }, createHostMock());

      await expect(hostWith().start(unversioned, RUN)).rejects.toThrow(
        m['error.vtt.noVersion']({ server: 'test-server' }),
      );
      expect(docker.pull).not.toHaveBeenCalled();
    });

    test('creates the container detached from all standard streams', async () => {
      await hostWith().start(server, RUN);

      const [options] = docker.createContainer.mock.calls[0]!;
      expect(options).toMatchObject({ AttachStdin: false, AttachStdout: false, AttachStderr: false });
    });

    test.each([
      ['inspected', () => container.inspect],
      ['removed', () => container.remove, () => container.inspect.mockResolvedValue(inspectInfo(false))],
      ['created', () => docker.createContainer],
      ['started', () => created.start],
    ] as const)('fails with the cause when the container cannot be %s', async (_case, failing, arrange?) => {
      const cause = dockerError(500);
      arrange?.();
      (failing() as { mockRejectedValue(value: unknown): void }).mockRejectedValue(cause);

      await expect(hostWith().start(server, RUN)).rejects.toMatchObject({
        message: m['error.vtt.startFailed']({ server: 'test-server', reason: cause.message }),
        cause,
      });
    });

    // Regression: the start was not awaited, so its failure was an unhandled rejection.
    test('waits until the container has started', async () => {
      let finished = false;
      created.start.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        finished = true;
      });

      await hostWith().start(server, RUN);

      expect(finished).toBe(true);
    });
  });

  describe('stop', () => {
    test('stops the container, then removes it', async () => {
      await hostWith().stop(HANDLE);

      expect(docker.getContainer).toHaveBeenCalledWith('container-id');
      expect(container.stop).toHaveBeenCalledOnce();
      expect(container.remove).toHaveBeenCalledOnce();
      expect(container.stop.mock.invocationCallOrder[0]).toBeLessThan(container.remove.mock.invocationCallOrder[0]!);
    });

    test('removes a container that has stopped already', async () => {
      container.stop.mockRejectedValue(dockerError(304));

      await hostWith().stop(HANDLE);

      expect(container.remove).toHaveBeenCalledOnce();
    });

    test('is done when the container is gone', async () => {
      container.stop.mockRejectedValue(dockerError(404));
      container.remove.mockRejectedValue(dockerError(404));

      await expect(hostWith().stop(HANDLE)).resolves.toBeUndefined();
    });

    test.each([
      ['stopped', () => container.stop],
      ['removed', () => container.remove],
    ] as const)('fails with the cause when the container cannot be %s', async (_case, failing) => {
      const cause = dockerError(500);
      failing().mockRejectedValue(cause);

      await expect(hostWith().stop(HANDLE)).rejects.toMatchObject({
        message: m['error.vtt.stopFailed']({ container: 'container-id', reason: cause.message }),
        cause,
      });
    });
  });
});
