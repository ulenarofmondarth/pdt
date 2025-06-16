import VTTServer from './VTTServer.js';

export type VTTHostConfig = {
  type: string;
};

/**
 * Base class for all VTT Hosts these are created using {@link lib/VTT/VTTHostFactory.createHost | createHost}
 *
 * A VTT Host reresents the environment in which a {@link lib/VTT/VTTServer.VTTServer | VTTServer} runs.
 */
export default abstract class VTTHost {
  /**
   * Test whether the host is accessible.
   */
  abstract isAccessible(): Promise<boolean>;

  /**
   * Start the host environment
   */
  abstract start(server: VTTServer): void;

  /**
   * Stop the host environment
   */
  abstract stop(): void;

  /**
   * Restart the host environment
   */
  abstract restart(): void;

  /**
   * Check if server is running on host
   *
   * Note: This does not guarantee that the server is accessible, only that it is running on the hosr.
   */
  abstract isRunning(server: VTTServer): Promise<boolean>;
}
