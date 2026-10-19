import VTTServer from './VTTServer.js';

/** How a host is to run a server. */
export interface RunOptions {
  /** What to call what runs the server on the host, such as a container's name. */
  name: string;
  /** The port, on the machine pdt runs on, to serve on. */
  port: number;
}

/** How a host finds a server it started again, to check on or stop it. */
export interface RunHandle {
  /** The host's own id for what runs the server, such as a container's id. */
  id: string;
}

/**
 * Base class for all VTT Hosts these are created using {@link lib/VTT/VTTHostFactory.createHost | createHost}
 *
 * A VTT Host represents the environment in which a {@link lib/VTT/VTTServer.VTTServer | VTTServer} runs.
 */
export default abstract class VTTHost {
  /**
   * Test whether the host is accessible.
   */
  abstract isAccessible(): Promise<boolean>;

  /**
   * Start `server` on this host, and wait until it has started.
   *
   * @returns How to find it again
   */
  abstract start(server: VTTServer, options: RunOptions): Promise<RunHandle>;

  /**
   * Stop what `handle` names, and remove it, so that the next start begins afresh from the
   * settings. What has stopped or is gone already is not an error.
   */
  abstract stop(handle: RunHandle): Promise<void>;

  /**
   * Check whether what `handle` names is running.
   *
   * Note: This does not guarantee that the server is accessible, only that it is running on the host.
   */
  abstract isRunning(handle: RunHandle): Promise<boolean>;
}
