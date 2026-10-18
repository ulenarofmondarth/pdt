import VTTServer from '@lib/VTT/VTTServer.js';
import VTTHost from '@lib/VTT/VTTHost.js';

import type { FoundryServerSettings } from '@schema/config.js';

/** A Foundry VTT server. */
export default class FoundryVTTServer extends VTTServer {
  /**
   * @param name - Name of this server, unique among the servers of a project
   * @param settings - The server's settings, as in the configuration
   * @param host - Where the server runs
   */
  constructor(
    name: string,
    readonly settings: FoundryServerSettings,
    host: VTTHost,
  ) {
    super(name, host);
  }

  get version(): string {
    return this.settings.version;
  }

  get hostname(): string {
    return this.settings.hostname;
  }

  /** The port to serve on, or undefined when it is not set. */
  get port(): string | undefined {
    return this.settings.port;
  }
}
