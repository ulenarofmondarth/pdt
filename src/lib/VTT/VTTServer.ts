/**
 * Base class for all VTT Servers these are created using {@link lib/VTT/VTTServerFactory.createServer | createServer}
 *
 * VTT Servers generally represent the application that runs your VTT. VTTServers run inside a {@link lib/VTT/VTTHost.VTTHost | VTTHost},
 * which does the starting and stopping.
 */
import VTTHost from '@lib/VTT/VTTHost.js';

export default abstract class VTTServer {
  /**
   * @param name - Name of this server, unique among the servers of a project
   * @param host - Where the server runs
   */
  constructor(
    readonly name: string,
    readonly host: VTTHost,
  ) {}

  /**
   * Version of the VTT application this server runs, or an empty string when none is known.
   */
  abstract get version(): string;

  /** Start on the server's host, and wait until it has started. */
  start(): Promise<void> {
    return this.host.start(this);
  }

  /** Stop on the server's host, and wait until it has stopped. */
  stop(): Promise<void> {
    return this.host.stop(this);
  }

  /** Restart on the server's host, and wait until it has started again. */
  restart(): Promise<void> {
    return this.host.restart(this);
  }

  /** Whether the server is running on its host. */
  isRunning(): Promise<boolean> {
    return this.host.isRunning(this);
  }
}
