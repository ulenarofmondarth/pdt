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
  ports: [],
};
const SERVER: FoundryServerSettings = { type: 'foundry', version: '12', hostname: 'h', port: '1' };
const IMAGE = 'felddy/foundryvtt:12';
const CONTAINER_NAME = 'test-server';

describe('DockerHost', () => {
  let container: ContainerMock;
  let docker: DockerMock;
  let server: FoundryVTTServer;
  let created: ContainerMock;
  let image: ImageMock;

  beforeEach(() => {
    container = createContainerMock();
    created = createContainerMock();
    image = createImageMock();
    docker = createDockerMock(container, image);
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
      const host = hostWith();

      await expect(host.isRunning(server)).resolves.toBe(true);
      expect(docker.getContainer).toHaveBeenCalledWith(CONTAINER_NAME);
    });

    test('is false when the container exists but is stopped', async () => {
      container.inspect.mockResolvedValue(inspectInfo(false));
      const host = hostWith();

      await expect(host.isRunning(server)).resolves.toBe(false);
    });

    test('is false when the container does not exist', async () => {
      container.inspect.mockRejectedValue(dockerError(404));
      const host = hostWith();

      await expect(host.isRunning(server)).resolves.toBe(false);
    });
  });

  describe('start', () => {
    test('waits for a pull whose progress messages are split across chunks', async () => {
      container.inspect.mockResolvedValue(inspectInfo(true));
      docker.pull.mockResolvedValue(
        pullStream('{"status":"Pulling fr', 'om library/image"}\n{"status":"Downloaded"}\n{"sta', 'tus":"Done"}\n'),
      );
      const host = hostWith();

      await expect(host.start(server)).resolves.toBeUndefined();
    });

    test('fails naming the image when the pull is refused, such as for a tag the registry does not have', async () => {
      const cause = Object.assign(dockerError(404), { message: 'manifest unknown' });
      docker.pull.mockRejectedValue(cause);
      const host = hostWith();

      await expect(host.start(server)).rejects.toMatchObject({
        message: m['error.vtt.pullFailed']({ image: IMAGE, reason: 'manifest unknown' }),
        cause,
      });
      expect(container.inspect).not.toHaveBeenCalled();
    });

    test('fails when the image pull stream fails', async () => {
      const cause = new Error('connection reset');
      docker.pull.mockResolvedValue(failingPullStream(cause));
      const host = hostWith();

      await expect(host.start(server)).rejects.toMatchObject({
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

      await expect(host.start(server)).rejects.toThrow(
        m['error.vtt.pullFailed']({ image: IMAGE, reason: 'unauthorized: authentication required' }),
      );
      expect(container.inspect).not.toHaveBeenCalled();
    });

    test('does not pull an image the engine already has', async () => {
      container.inspect.mockResolvedValue(inspectInfo(true));
      image.inspect.mockResolvedValue({} as ImageInspectInfo);
      const host = hostWith();

      await host.start(server);

      expect(docker.getImage).toHaveBeenCalledExactlyOnceWith(IMAGE);
      expect(docker.pull).not.toHaveBeenCalled();
    });

    test('fails with the cause when it cannot tell whether the engine has the image', async () => {
      const cause = dockerError(500);
      image.inspect.mockRejectedValue(cause);
      const host = hostWith();

      await expect(host.start(server)).rejects.toBe(cause);
      expect(docker.pull).not.toHaveBeenCalled();
      expect(container.inspect).not.toHaveBeenCalled();
    });

    test('pulls the server image before touching the container', async () => {
      container.inspect.mockResolvedValue(inspectInfo(true));
      const host = hostWith();

      await host.start(server);

      expect(docker.pull).toHaveBeenCalledExactlyOnceWith(IMAGE, {});
      expect(docker.pull.mock.invocationCallOrder[0]).toBeLessThan(container.inspect.mock.invocationCallOrder[0]!);
    });

    test('leaves an already running container alone', async () => {
      container.inspect.mockResolvedValue(inspectInfo(true));
      const host = hostWith();

      await host.start(server);

      expect(container.start).not.toHaveBeenCalled();
      expect(docker.createContainer).not.toHaveBeenCalled();
    });

    test('starts an existing container that is stopped', async () => {
      container.inspect.mockResolvedValue(inspectInfo(false));
      const host = hostWith();

      await host.start(server);

      expect(container.start).toHaveBeenCalledOnce();
      expect(docker.createContainer).not.toHaveBeenCalled();
    });

    test('creates and starts the container when it does not exist', async () => {
      const created = createContainerMock();
      container.inspect.mockRejectedValue(dockerError(404));
      docker.createContainer.mockResolvedValue(created);
      const host = hostWith();

      await host.start(server);

      expect(docker.createContainer).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: CONTAINER_NAME, Image: IMAGE }),
      );
      expect(created.start).toHaveBeenCalledOnce();
    });

    test('names the container after the server and tags the image with its version', async () => {
      container.inspect.mockRejectedValue(dockerError(404));
      const other = new FoundryVTTServer('other-server', { ...SERVER, version: '13.351' }, createHostMock());
      const host = hostWith();

      await host.start(other);

      expect(docker.pull).toHaveBeenCalledExactlyOnceWith('felddy/foundryvtt:13.351', {});
      expect(docker.getContainer).toHaveBeenCalledWith('other-server');
      expect(docker.createContainer).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: 'other-server', Image: 'felddy/foundryvtt:13.351' }),
      );
    });

    test.each([
      [{ image: 'example/foundry' }, 'example/foundry:12'],
      [{ image: 'felddy/foundryvtt', repository: 'ghcr.io' }, 'ghcr.io/felddy/foundryvtt:12'],
    ])('uses the image configured for the host (%o)', async (imageConfig, expected) => {
      container.inspect.mockRejectedValue(dockerError(404));
      const host = hostWith({ ...HOST_CONFIG, ...imageConfig });

      await host.start(server);

      expect(docker.pull).toHaveBeenCalledExactlyOnceWith(expected, {});
      expect(docker.createContainer).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ Image: expected }));
    });

    test('fails without touching Docker when the server has no version', async () => {
      const unversioned = new FoundryVTTServer('test-server', { ...SERVER, version: '' }, createHostMock());
      const host = hostWith();

      await expect(host.start(unversioned)).rejects.toThrow(m['error.vtt.noVersion']({ server: 'test-server' }));
      expect(docker.pull).not.toHaveBeenCalled();
    });

    test('creates the container detached from all standard streams', async () => {
      container.inspect.mockRejectedValue(dockerError(404));
      const host = hostWith();

      await host.start(server);

      const [options] = docker.createContainer.mock.calls[0]!;
      expect(options).toMatchObject({ AttachStdin: false, AttachStdout: false, AttachStderr: false });
      expect(options).not.toHaveProperty('AttackStdout');
    });

    test('fails with the cause when the container cannot be created', async () => {
      const cause = dockerError(500);
      container.inspect.mockRejectedValue(dockerError(404));
      docker.createContainer.mockRejectedValue(cause);
      const host = hostWith();

      await expect(host.start(server)).rejects.toMatchObject({
        message: m['error.vtt.startFailed']({ server: CONTAINER_NAME, reason: cause.message }),
        cause,
      });
    });

    test('fails with the cause when the container cannot be inspected', async () => {
      const cause = dockerError(500);
      container.inspect.mockRejectedValue(cause);
      const host = hostWith();

      await expect(host.start(server)).rejects.toMatchObject({
        message: m['error.vtt.startFailed']({ server: CONTAINER_NAME, reason: cause.message }),
        cause,
      });
      expect(docker.createContainer).not.toHaveBeenCalled();
    });

    // Regression: the start was not awaited, so its failure was an unhandled rejection.
    test('fails with the cause when a newly created container cannot be started', async () => {
      const cause = dockerError(500);
      const created = createContainerMock();
      created.start.mockRejectedValue(cause);
      container.inspect.mockRejectedValue(dockerError(404));
      docker.createContainer.mockResolvedValue(created);
      const host = hostWith();

      await expect(host.start(server)).rejects.toMatchObject({
        message: m['error.vtt.startFailed']({ server: CONTAINER_NAME, reason: cause.message }),
        cause,
      });
    });

    test('fails with the cause when a stopped container cannot be started', async () => {
      const cause = dockerError(500);
      container.inspect.mockResolvedValue(inspectInfo(false));
      container.start.mockRejectedValue(cause);
      const host = hostWith();

      await expect(host.start(server)).rejects.toMatchObject({
        message: m['error.vtt.startFailed']({ server: CONTAINER_NAME, reason: cause.message }),
        cause,
      });
    });

    test.each([
      ['a stopped container', () => container.inspect.mockResolvedValue(inspectInfo(false)), () => container],
      [
        'a new container',
        () => {
          container.inspect.mockRejectedValue(dockerError(404));
          docker.createContainer.mockResolvedValue(created);
        },
        () => created,
      ],
    ])('waits until %s has started', async (_case, arrange, started) => {
      arrange();
      let finished = false;
      started().start.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        finished = true;
      });
      const host = hostWith();

      await host.start(server);

      expect(finished).toBe(true);
    });
  });

  // Not built yet; saying so is better than reporting a stop or restart that did not happen.
  test('cannot stop a server yet', async () => {
    await expect(hostWith().stop(server)).rejects.toThrow(m['error.vtt.stopUnsupported']({ server: CONTAINER_NAME }));
  });

  test('cannot restart a server yet', async () => {
    await expect(hostWith().restart(server)).rejects.toThrow(
      m['error.vtt.restartUnsupported']({ server: CONTAINER_NAME }),
    );
  });
});
