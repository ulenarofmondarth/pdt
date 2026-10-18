/**
 * Base class for all VTT Servers these are created using {@link lib/VTT/VTTServerFactory.createServer | createServer}
 *
 * VTT Servers generally represent the application that runs your VTT. VTTServers run inside a {@link lib/VTT/VTTHost.VTTHost | VTTHost}.
 */
import VTTHost from '@lib/VTT/VTTHost.js';

export type VTTServerConfig = {
  type: string;
  name: string;
  version?: string;
};

export default abstract class VTTServer {
  /**
   * Name of this server, unique among the servers of a project.
   */
  abstract get name(): string;

  /**
   * Version of the VTT application this server runs, or an empty string when none is known.
   */
  abstract get version(): string;

  /** Start on the server's host, and wait until it has started. */
  abstract start(): Promise<void>;

  abstract stop(): void;

  abstract restart(): void;

  abstract isRunning(): Promise<boolean>;

  abstract set host(newHost: VTTHost);
}
