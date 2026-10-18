import VTTServer from './VTTServer.js';

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
   */
  abstract start(server: VTTServer): Promise<void>;

  /**
   * Stop `server` on this host, and wait until it has stopped.
   */
  abstract stop(server: VTTServer): Promise<void>;

  /**
   * Restart `server` on this host, and wait until it has started again.
   */
  abstract restart(server: VTTServer): Promise<void>;

  /**
   * Check if server is running on host
   *
   * Note: This does not guarantee that the server is accessible, only that it is running on the host.
   */
  abstract isRunning(server: VTTServer): Promise<boolean>;
}
