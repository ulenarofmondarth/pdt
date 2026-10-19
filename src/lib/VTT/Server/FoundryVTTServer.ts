import path from 'node:path';
import VTTServer, { type Owner } from '@lib/VTT/VTTServer.js';
import VTTHost from '@lib/VTT/VTTHost.js';

import type { FoundryAccount, FoundryServerSettings } from '@schema/config.js';

/** The port Foundry VTT serves on, by default. */
export const FOUNDRY_PORT = 30000;

/** Where Foundry VTT keeps its data, inside its host, as the felddy/foundryvtt image has it. */
export const FOUNDRY_DATA_PATH = '/data';

/**
 * A Foundry VTT server.
 *
 * What it needs from its host follows the felddy/foundryvtt image: its data in `/data`, and its
 * account, licence and administrator password in `FOUNDRY_*` variables.
 */
export default class FoundryVTTServer extends VTTServer {
  /**
   * @param name - Name of this server, unique among the servers of a project
   * @param settings - The server's settings, as in the configuration
   * @param host - Where the server runs
   * @param account - The Foundry VTT account to download and license Foundry VTT with
   */
  constructor(
    name: string,
    readonly settings: FoundryServerSettings,
    host: VTTHost,
    readonly account: FoundryAccount = {},
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

  get dataPath(): string {
    return FOUNDRY_DATA_PATH;
  }

  modulePath(id: string): string {
    return path.posix.join(FOUNDRY_DATA_PATH, 'Data', 'modules', id);
  }

  /**
   * The account, licence key and administrator password that are set, and the user to own the
   * data as, in the variables the felddy/foundryvtt image reads.
   */
  environment(owner?: Owner): Record<string, string> {
    const variables: Record<string, string | undefined> = {
      FOUNDRY_USERNAME: this.account.username,
      FOUNDRY_PASSWORD: this.account.password,
      FOUNDRY_LICENSE_KEY: this.account.license_key,
      FOUNDRY_ADMIN_KEY: this.settings.admin_key,
      FOUNDRY_UID: owner === undefined ? undefined : String(owner.uid),
      FOUNDRY_GID: owner === undefined ? undefined : String(owner.gid),
    };
    return Object.fromEntries(
      Object.entries(variables).filter((entry): entry is [string, string] => entry[1] !== undefined),
    );
  }
}
