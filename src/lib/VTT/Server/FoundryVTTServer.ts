import VTTServer from '@lib/VTT/VTTServer.js';
import VTTHost from '@lib/VTT/VTTHost.js';

import type { FoundryServerSettings } from '@schema/config.js';

/** The port Foundry VTT serves on, by default. */
export const FOUNDRY_PORT = 30000;

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

  /** The port to serve on, or `auto` for the first free one. */
  get port(): FoundryServerSettings['port'] {
    return this.settings.port;
  }

  /** Foundry VTT serves on 30000 unless told otherwise. */
  get internalPort(): number {
    return FOUNDRY_PORT;
  }

  urlAt(port: number): string {
    return `http://${this.hostname}:${port}`;
  }
}
