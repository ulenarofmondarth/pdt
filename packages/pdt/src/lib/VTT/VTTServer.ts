/**
 * Base class for all VTT Servers these are created using {@link lib/VTT/VTTServerFactory.createServer | createServer}
 *
 * VTT Servers generally represent the application that runs your VTT. VTTServers run inside a {@link lib/VTT/VTTHost.VTTHost | VTTHost},
 * which does the starting and stopping.
 */
import VTTHost, { type RunHandle, type RunOptions } from '@lib/VTT/VTTHost.js';

/** A user, by the numeric ids files are owned by. */
export interface Owner {
  uid: number;
  gid: number;
}

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

  /** The port the application serves on inside its host, such as in its container. */
  abstract get internalPort(): number;

  /** The address to reach the server at, when it serves on `port`. */
  abstract urlAt(port: number): string;

  /** Where the application keeps its data, inside its host, such as in its container. */
  abstract get dataPath(): string;

  /** Where the application finds the module `id`, inside its host. */
  abstract modulePath(id: string): string;

  /** The variables the application is to be started with, which may hold secrets. */
  abstract environment(): Record<string, string>;

  /** Start on the server's host, and wait until it has started. */
  start(options: RunOptions): Promise<RunHandle> {
    return this.host.start(this, options);
  }
}
