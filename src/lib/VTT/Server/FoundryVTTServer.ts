import config from '@util/config.js';
import VTTServer, { VTTServerConfig } from '@lib/VTT/VTTServer.js';
import VTTHost from '@lib/VTT/VTTHost.js';

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

  constructor(vttConfig: FoundryVTTServerConfig) {
    super();

    this._name = vttConfig.name;
    const configured = config.VTT[this._name]?.server;
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

  async start() {
    if (!this._host) {
      throw new Error('No host environment provided');
    }
    this._host?.start(this);
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
