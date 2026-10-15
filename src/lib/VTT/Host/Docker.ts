/**
 * A restricted Docker hosting, limited to a container from the felddy/foundryvtt-docker image.
 *
 * User can vary the version.
 *
 * Root directory for data can be set. Each container will map a <root>/<instance name>/foundry-data directory to /data in the container
 */
import VTTHost from '@lib/VTT/VTTHost.js';
import Docker, { Container } from 'dockerode';
import VTTServer from '../VTTServer.js';

import type { ContainerCreateOptions } from 'dockerode';
import type { VTTHostConfig } from '../VTTHost.js';

export type DockerHostConfig = VTTHostConfig & {
  socketPath?: string;
  version?: string;
};

export default class DockerHost extends VTTHost {
  options: DockerHostConfig;
  docker: Docker;

  constructor(options: DockerHostConfig) {
    super();

    this.options = options;
    this.docker = new Docker(this.options);
  }

  async isAccessible(): Promise<boolean> {
    return this.docker
      .ping()
      .then(() => true)
      .catch(() => false);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async isRunning(server: VTTServer): Promise<boolean> {
    return this.docker
      .getContainer('interesting-name')
      .inspect()
      .then(info => info.State.Running)
      .catch(() => false);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async start(server: VTTServer) {
    // Ask server for dataFactory
    // Ask dataFactory for Docker config
    // Check if running
    // If not then start container
    await this._pullImageIfMissing('felddy/foundryvtt:12');

    const serverOptions = {
      name: 'interesting-name',
      Image: 'felddy/foundryvtt:12',
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

  async _pullImageIfMissing(image: string): Promise<NodeJS.ReadableStream> {
    const pullStream = await this.docker.pull(image, {});
    return new Promise(resolve => {
      pullStream
        .on('data', chunk => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const data = JSON.parse(chunk.toString());
          //  console.log(data.status)
        })
        .on('end', resolve);
    });
  }
}
