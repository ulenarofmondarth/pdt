/**
 * Base class for all VTT Servers these are created using {@link lib/VTT/VTTServerFactory.createServer | createServer}
 *
 * VTT Srevers generally represent the application that runs your VTT. VTTCServers run inside a {@link lib/VTT/VTTHost.VTTHost | VTTHost}.
 */
import VTTHost from '@lib/VTT/VTTHost.js';

export type VTTServerConfig = {
  type: string;
  name: string;
  version?: string;
};

export default abstract class VTTServer {
  abstract start(): void;

  abstract stop(): void;

  abstract restart(): void;

  abstract isRunning(): Promise<boolean>;

  abstract set host(newHost: VTTHost);
}
