/**
 * A restricted Docker hosting, limited to a container from the felddy/foundryvtt image.
 *
 * Each server runs in a container of the name it is given, from the image tagged with the server's
 * version, with the server's port published on the port it is given. Stopping a server removes its
 * container, so that each start creates one afresh from the settings.
 * The image and its registry can be configured.
 *
 * Root directory for data can be set. Each container will map a <root>/<instance name>/foundry-data directory to /data in the container
 */
import VTTHost, { type RunHandle, type RunOptions } from '@lib/VTT/VTTHost.js';
import Docker, { Container } from 'dockerode';
import VTTServer from '../VTTServer.js';
import { m } from '@i18n/messages.js';

import type { ContainerCreateOptions, DockerOptions } from 'dockerode';
import type { DockerHostSettings } from '@schema/config.js';

/**
 * How to reach the Docker engine for a host.
 *
 * Only connection settings go to dockerode, which would read other keys, such as `version`, as its own.
 */
export function dockerOptions(settings: DockerHostSettings): DockerOptions {
  return settings.socketPath === undefined ? {} : { socketPath: settings.socketPath };
}

export default class DockerHost extends VTTHost {
  /**
   * @param settings - The host's settings, as in the configuration
   * @param docker - Client for the Docker engine; by default one for the engine the settings name
   */
  constructor(
    readonly settings: DockerHostSettings,
    readonly docker: Docker = new Docker(dockerOptions(settings)),
  ) {
    super();
  }

  /**
   * Full reference of the image that runs `server`.
   *
   * @param server - Server whose version tags the image
   * @throws When the server has no version, since an untagged pull would fetch every tag
   */
  imageFor(server: VTTServer): string {
    if (!server.version) {
      throw new Error(m['error.vtt.noVersion']({ server: server.name }));
    }
    const registry = this.settings.repository ? `${this.settings.repository}/` : '';
    return `${registry}${this.settings.image}:${server.version}`;
  }

  async isAccessible(): Promise<boolean> {
    return this.docker
      .ping()
      .then(() => true)
      .catch(() => false);
  }

  async isRunning(handle: RunHandle): Promise<boolean> {
    return this.docker
      .getContainer(handle.id)
      .inspect()
      .then(info => info.State.Running)
      .catch(() => false);
  }

  /**
   * Run `server` in a new container named `name`, publishing its port on `port`, with its
   * `environment` and `mounts` (bind mounts of directories on the machine pdt runs on), and wait
   * until the container has started. A stopped container of that name, left from an earlier run, is removed first; a
   * running one is not touched.
   *
   * @throws When the image cannot be pulled, a container of that name is running, or the container
   *   cannot be created or started
   */
  async start(server: VTTServer, { name, port, environment, mounts }: RunOptions): Promise<RunHandle> {
    const image = this.imageFor(server);
    await this._pullImageIfMissing(image);

    const failed = (cause: unknown) =>
      new Error(
        m['error.vtt.startFailed']({
          server: server.name,
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
        { cause },
      );

    const existing = this.docker.getContainer(name);
    // Whether a container of that name is running; undefined when there is none, as is wanted.
    let running: boolean | undefined;
    try {
      // https://docs.docker.com/reference/api/engine/version/v1.37/#tag/Container/operation/ContainerInspect
      running = (await existing.inspect()).State.Running;
    } catch (error) {
      if ((error as { statusCode?: unknown }).statusCode !== 404) throw failed(error);
    }
    if (running === true) throw new Error(m['error.vtt.containerRunning']({ container: name }));
    if (running === false) await existing.remove().catch((error: unknown) => Promise.reject(failed(error)));

    const internal = `${server.internalPort}/tcp`;
    const options = {
      name,
      Image: image,
      AttachStdin: false,
      AttachStdout: false,
      AttachStderr: false,
      Tty: false,
      ExposedPorts: { [internal]: {} },
      // Given to the container only: never written anywhere, as the values may be secret.
      Env: Object.entries(environment).map(([variable, value]) => `${variable}=${value}`),
      HostConfig: {
        AutoRemove: false,
        PortBindings: { [internal]: [{ HostPort: String(port) }] },
        Mounts: mounts.map(({ source, target }) => ({ Type: 'bind' as const, Source: source, Target: target })),
      },
    } satisfies ContainerCreateOptions;

    let container: Container;
    try {
      container = await this.docker.createContainer(options);
      await container.start();
    } catch (error) {
      throw failed(error);
    }
    return { id: container.id };
  }

  /**
   * Stop the container `handle` names, and remove it. A container that has stopped, or is gone, is
   * not an error.
   *
   * @throws When the container cannot be stopped or removed
   */
  async stop(handle: RunHandle): Promise<void> {
    const container = this.docker.getContainer(handle.id);
    const settled =
      (...codes: number[]) =>
      (error: unknown) => {
        if (!codes.includes((error as { statusCode?: unknown }).statusCode as number)) throw error;
      };
    try {
      // 304: it has stopped already; 404: it is gone.
      await container.stop().catch(settled(304, 404));
      await container.remove().catch(settled(404));
    } catch (error) {
      throw new Error(
        m['error.vtt.stopFailed']({
          container: handle.id,
          reason: error instanceof Error ? error.message : String(error),
        }),
        { cause: error },
      );
    }
  }

  /**
   * Pulls `image`, unless the engine already has it, and waits until Docker has finished.
   *
   * An image is pulled once: the server's version names a fixed release, so a later pull would
   * fetch the same image, and a start does not need the network once the image is there.
   *
   * Docker reports progress as newline-delimited JSON, and a chunk of the stream can hold several
   * messages or part of one, so the stream is read with dockerode's `followProgress`.
   *
   * @param image - Full image reference, including the tag
   * @throws When the engine cannot be asked about the image, the stream fails, or Docker reports an
   *   error in the progress
   */
  async _pullImageIfMissing(image: string): Promise<void> {
    try {
      await this.docker.getImage(image).inspect();
      return;
    } catch (error) {
      if ((error as { statusCode?: unknown }).statusCode !== 404) throw error;
    }

    const pullFailed = (reason: string, cause?: unknown) =>
      new Error(m['error.vtt.pullFailed']({ image, reason }), { cause });

    let progress: unknown[];
    try {
      const pullStream = await this.docker.pull(image, {});
      progress = await new Promise<unknown[]>((resolve, reject) => {
        this.docker.modem.followProgress(pullStream, (err: Error | null, output: unknown[]) =>
          err ? reject(err) : resolve(output),
        );
      });
    } catch (error) {
      // Refused outright (an unknown tag, a registry that cannot be reached), or the stream broke.
      throw pullFailed(error instanceof Error ? error.message : String(error), error);
    }
    // A failed pull can still end normally, with the failure as a message in the stream.
    const failure = progress.find(
      (message): message is { error: unknown } => typeof message === 'object' && message !== null && 'error' in message,
    );
    if (failure) {
      throw pullFailed(String(failure.error));
    }
  }
}
