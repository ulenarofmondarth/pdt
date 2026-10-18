/**
 * A restricted Docker hosting, limited to a container from the felddy/foundryvtt image.
 *
 * Each server runs in a container named after the server, from the image tagged with the server's version.
 * The image and its registry can be configured.
 *
 * Root directory for data can be set. Each container will map a <root>/<instance name>/foundry-data directory to /data in the container
 */
import VTTHost from '@lib/VTT/VTTHost.js';
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

  async isRunning(server: VTTServer): Promise<boolean> {
    return this.docker
      .getContainer(server.name)
      .inspect()
      .then(info => info.State.Running)
      .catch(() => false);
  }

  /**
   * Run `server` in its container, creating the container if there is none, and wait until it has
   * started. A container that is already running is left alone.
   *
   * @throws When the image cannot be pulled, or the container cannot be inspected, created or started
   */
  async start(server: VTTServer): Promise<void> {
    const image = this.imageFor(server);
    await this._pullImageIfMissing(image);

    const serverOptions = {
      name: server.name,
      Image: image,
      AttachStdin: false,
      AttachStdout: false,
      AttachStderr: false,
      Tty: false,
      HostConfig: {
        AutoRemove: false,
      },
    } satisfies ContainerCreateOptions;
    const failed = (cause: unknown) => new Error(m['error.vtt.startFailed']({ server: server.name }), { cause });

    let container: Container = this.docker.getContainer(serverOptions.name);
    try {
      // https://docs.docker.com/reference/api/engine/version/v1.37/#tag/Container/operation/ContainerInspect
      const info = await container.inspect();
      if (info.State.Running) return;
    } catch (error) {
      if ((error as { statusCode?: unknown }).statusCode !== 404) throw failed(error);
      // There is no such container yet.
      try {
        container = await this.docker.createContainer(serverOptions);
      } catch (error) {
        throw failed(error);
      }
    }

    try {
      await container.start();
    } catch (error) {
      throw failed(error);
    }
  }

  /** Not supported yet. */
  async stop(server: VTTServer): Promise<void> {
    throw new Error(m['error.vtt.stopUnsupported']({ server: server.name }));
  }

  /** Not supported yet. */
  async restart(server: VTTServer): Promise<void> {
    throw new Error(m['error.vtt.restartUnsupported']({ server: server.name }));
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
