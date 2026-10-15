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

import type { ContainerCreateOptions } from 'dockerode';
import type { VTTHostConfig } from '../VTTHost.js';

export type DockerHostConfig = VTTHostConfig & {
  /** Docker engine socket; dockerode's default when not given. */
  socketPath?: string;
  /** Registry to pull the image from; Docker Hub when not given. */
  repository?: string;
  /** Image to run, without a tag. */
  image?: string;
  /** Present in the configuration but not used: the image tag is the server's version. */
  version?: string;
};

/** Image run when the host configuration does not name one. */
export const DEFAULT_IMAGE = 'felddy/foundryvtt';

export default class DockerHost extends VTTHost {
  options: DockerHostConfig;
  docker: Docker;

  constructor(options: DockerHostConfig) {
    super();

    this.options = options;
    // Only connection settings go to dockerode, which would read other keys, such as `version`, as its own.
    this.docker = new Docker(options.socketPath === undefined ? {} : { socketPath: options.socketPath });
  }

  /**
   * Full reference of the image that runs `server`.
   *
   * @param server - Server whose version tags the image
   * @throws When the server has no version, since an untagged pull would fetch every tag
   */
  imageFor(server: VTTServer): string {
    if (!server.version) {
      throw new Error(`Server ${server.name} has no version to run on Docker Host`);
    }
    const image = this.options.image ?? DEFAULT_IMAGE;
    const registry = this.options.repository ? `${this.options.repository}/` : '';
    return `${registry}${image}:${server.version}`;
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

  async start(server: VTTServer) {
    // Ask server for dataFactory
    // Ask dataFactory for Docker config
    // Check if running
    // If not then start container
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
    const container: Container = this.docker.getContainer(serverOptions.name);

    await container
      .inspect()
      .then(info => {
        // info details https://docs.docker.com/reference/api/engine/version/v1.37/#tag/Container/operation/ContainerCreate
        if (!info.State.Running) {
          container.start();
        }
      })
      .catch(async err => {
        if (err.statusCode === 404) {
          // Container does not exist
          await this.docker
            .createContainer(serverOptions)
            .then(async container => {
              container.start().catch(err => {
                throw new Error(`Could not start server ${serverOptions.name} on Docker Host`, { cause: err });
              });
            })
            .catch(err => {
              throw new Error(`Could not start server ${serverOptions.name} on Docker Host`, { cause: err });
            });
        } else {
          throw new Error(`Could not start server ${serverOptions.name} on Docker Host`, { cause: err });
        }
      });
  }

  async stop() {}

  async restart() {}

  /**
   * Pulls `image` and waits until Docker has finished.
   *
   * Docker reports progress as newline-delimited JSON, and a chunk of the stream can hold several
   * messages or part of one, so the stream is read with dockerode's `followProgress`.
   *
   * @param image - Full image reference, including the tag
   * @throws When the stream fails, or when Docker reports an error in the progress
   */
  async _pullImageIfMissing(image: string): Promise<void> {
    const pullStream = await this.docker.pull(image, {});
    const progress = await new Promise<unknown[]>((resolve, reject) => {
      this.docker.modem.followProgress(pullStream, (err: Error | null, output: unknown[]) =>
        err ? reject(err) : resolve(output),
      );
    });
    // A failed pull can still end normally, with the failure as a message in the stream.
    const failure = progress.find(
      (message): message is { error: unknown } => typeof message === 'object' && message !== null && 'error' in message,
    );
    if (failure) {
      throw new Error(`Could not pull ${image}: ${String(failure.error)}`);
    }
  }
}
