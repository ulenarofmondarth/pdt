import type { createModule, Prompter } from '@lib/ModuleGenerator.js';
import type { createVtt } from '@lib/VTT/createVtt.js';
import type { Owner } from '@lib/VTT/VTTServer.js';
import type { Config } from '@schema/config.js';
import type { ConfigFile, ConfigSource } from '@util/load-config.js';
import type { PdtPaths } from '@util/runtime-config.js';

/** Where a command reports what it is doing. */
export interface CommandLog {
  error(message: string): void;
  warn(message: string): void;
  info(message: string): void;
  debug(message: string): void;
  /** Send all further file output to the log file in `dir`. */
  setDirectory(dir: string): void;
}

/**
 * Everything a command depends on. `main()` builds it for each run; tests build their own.
 */
export interface CommandContext {
  /** The directories pdt uses. */
  paths: PdtPaths;
  /** The validated configuration. */
  config: Config;
  /** Where the value at a key of the configuration comes from. */
  sourceOf(key: readonly string[]): ConfigSource;
  /**
   * Set a value in the user's or the project's configuration, and return the files written: its
   * `config.json`, its `secrets.conf` for a secret value, or both for a group holding some. Nothing
   * is written unless the configuration with the change is valid.
   *
   * @throws {ConfigError} When the key is not a setting, or the change would make the
   *   configuration invalid
   */
  writeConfig(target: 'user' | 'project', key: string, value: string): string[];
  /** The configuration files pdt reads, the user's first, each `config.json` before its `secrets.conf`; a file need not exist. */
  configFiles: readonly ConfigFile[];
  /**
   * The configuration files that set a value at a key.
   *
   * @throws When the key is not a setting
   */
  filesSetting(key: string): ConfigFile[];
  /**
   * Remove the value at a key from configuration files, and return the files written. Nothing is
   * written unless the configuration with the change is valid.
   *
   * @throws When the key is not a setting, or the change would make the configuration invalid
   */
  clearConfig(targets: readonly ConfigFile['source'][], key: string): string[];
  log: CommandLog;
  /** Writes what the user asked for, or the progress of what they asked for. */
  out(text: string): void;
  /** How to ask the user questions; absent when nobody can be asked. */
  prompter?: Prompter;
  /** Creates a new Foundry VTT module project. */
  createModule: typeof createModule;
  /** Creates a VTT, from its settings in the configuration. */
  createVtt: typeof createVtt;
  /** Whether a port on the machine pdt runs on is free. */
  isPortFree(port: number): Promise<boolean>;
  /** Whether anything answers at a URL. */
  isUrlReachable(url: string): Promise<boolean>;
  /** The user pdt runs as, to own the files a VTT writes; absent where users have no numeric ids. */
  owner?: Owner;
}
