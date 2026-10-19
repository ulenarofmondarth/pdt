import type { createModule, Prompter } from '@lib/ModuleGenerator.js';
import type { createVtt } from '@lib/VTT/createVtt.js';
import type { Config } from '@schema/config.js';
import type { ConfigSource } from '@util/load-config.js';
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
   * Set a value in the user or the project configuration file, and return the file. Nothing is
   * written unless the configuration with the change is valid.
   *
   * @throws {ConfigError} When the key is not a setting, or the change would make the
   *   configuration invalid
   */
  writeConfig(target: 'user' | 'project', key: string, value: string): string;
  log: CommandLog;
  /** Writes what the user asked for, or the progress of what they asked for. */
  out(text: string): void;
  /** How to ask the user questions; absent when nobody can be asked. */
  prompter?: Prompter;
  /** Creates a new Foundry VTT module project. */
  createModule: typeof createModule;
  /** Creates a VTT, from its settings in the configuration. */
  createVtt: typeof createVtt;
}
