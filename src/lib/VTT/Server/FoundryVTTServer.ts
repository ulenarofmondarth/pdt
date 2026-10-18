import VTTServer, { VTTServerConfig } from '@lib/VTT/VTTServer.js';
import VTTHost from '@lib/VTT/VTTHost.js';

import type { VTTServerConfig as ServerSettings } from '@schema/config.js';

export type FoundryVTTServerConfig = VTTServerConfig & {
  version: string;
  hostname?: string;
  port?: string;
};

export default class FoundryVTTServer extends VTTServer {
  _type = 'foundry';
  _name: string;
  _version: string;
  _hostname: string;
  _port: string;
  _host?: VTTHost;

  /**
   * @param vttConfig - The server; a value it leaves empty is taken from `configured`
   * @param configured - The server's settings in the configuration, if it has any
   */
  constructor(vttConfig: FoundryVTTServerConfig, configured?: ServerSettings) {
    super();

    this._name = vttConfig.name;
    this._version = vttConfig.version || configured?.version || '';
    this._hostname = vttConfig.hostname || configured?.hostname || '';
    this._port = vttConfig.port || configured?.port || '';
  }

  get name(): string {
    return this._name;
  }

  get version(): string {
    return this._version ?? '';
  }

  async start(): Promise<void> {
    if (!this._host) {
      throw new Error('No host environment provided');
    }
    await this._host.start(this);
  }

  stop() {}
  restart() {}

  set host(newHost: VTTHost) {
    this._host = newHost;
  }

  async isRunning(): Promise<boolean> {
    if (!this._host) return false;
    return await this._host.isRunning(this);
  }
}
