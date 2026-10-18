/**
 * Reads pdt's configuration.
 *
 * The configuration starts from the defaults shipped with pdt. Each configuration file that exists
 * is merged over it in turn, then the environment variables, and the result is validated. Later
 * sources win: an object is merged key by key, anything else, lists included, is replaced whole.
 *
 * Nothing here depends on the running process, so callers say which files and variables to use.
 */
import fs from 'node:fs';
import path from 'node:path';
import defaults from '@/pdt-internal-config/default.json' with { type: 'json' };
import { config as configSchema, type Config } from '@schema/config.js';
import { m } from '@i18n/messages.js';

import type { PdtPaths } from '@util/runtime-config.js';

/** Name of the configuration file in each configuration directory. */
export const CONFIG_FILENAME = 'config.json';

/** The configuration cannot be used. */
export class ConfigError extends Error {
  /**
   * @param message - What is wrong, for the user
   * @param problems - Each invalid setting, as `<path> <what is wrong with it>`
   * @param options - The underlying error, if any
   */
  constructor(
    message: string,
    readonly problems: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ConfigError';
  }
}

/** Where the configuration comes from, in addition to the shipped defaults. */
export interface ConfigSources {
  /** Configuration files, earliest first; a file that does not exist is skipped. */
  files: readonly string[];
  /** Environment variables. */
  env: Readonly<Record<string, string | undefined>>;
}

/** Settings that environment variables override, by variable name. */
const ENVIRONMENT_SETTINGS: Readonly<Record<string, readonly [string, ...string[]]>> = {
  PDT_LOG_LEVEL: ['Logging', 'level'],
};

type Settings = Record<string, unknown>;

function isSettings(value: unknown): value is Settings {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Merge `over` onto `base`, without changing either. */
function merge(base: Settings, over: Settings): Settings {
  const merged: Settings = { ...base };
  for (const [key, value] of Object.entries(over)) {
    // JSON.parse makes "__proto__" an ordinary key; assigning it would replace the prototype.
    if (key === '__proto__') continue;
    const current = merged[key];
    merged[key] = isSettings(current) && isSettings(value) ? merge(current, value) : value;
  }
  return merged;
}

/** A single setting at `keys`, as settings to merge. */
function nested(keys: readonly [string, ...string[]], value: string): Settings {
  return keys.reduceRight<unknown>((inner, key) => ({ [key]: inner }), value) as Settings;
}

/**
 * The settings in a configuration file, or none if it does not exist.
 *
 * @throws {ConfigError} When the file cannot be read, is not JSON, or does not hold an object
 */
function readFile(file: string): Settings {
  let content: unknown;
  try {
    content = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    const reason = error instanceof Error ? error.message : String(error);
    throw new ConfigError(m['error.config.unreadable']({ file, reason }), [], { cause: error });
  }
  if (!isSettings(content)) {
    throw new ConfigError(m['error.config.notAnObject']({ file }));
  }
  return content;
}

/**
 * Read and validate the configuration.
 *
 * @param sources - The files and environment variables to read
 * @returns The validated configuration
 * @throws {ConfigError} When a file cannot be used or the configuration is invalid
 */
export function loadConfig({ files, env }: ConfigSources): Config {
  let settings: Settings = defaults;

  for (const file of files) {
    settings = merge(settings, readFile(file));
  }
  for (const [variable, keys] of Object.entries(ENVIRONMENT_SETTINGS)) {
    const value = env[variable];
    if (value) settings = merge(settings, nested(keys, value));
  }

  const result = configSchema.safeParse(settings);
  if (!result.success) {
    const problems = result.error.issues.map(issue => `${issue.path.join('.')} ${issue.message}`);
    throw new ConfigError(m['error.config.invalid'](), problems, { cause: result.error });
  }
  return result.data;
}

/**
 * The configuration files for a set of directories: the user's, then the project's.
 *
 * @param paths - The user configuration directory, and the project's `.pdt` directory if there is one
 */
export function configFiles({ userConfigDir, pdtConfigDir }: Pick<PdtPaths, 'userConfigDir' | 'pdtConfigDir'>) {
  const dirs = pdtConfigDir === undefined ? [userConfigDir] : [userConfigDir, pdtConfigDir];
  return dirs.map(dir => path.join(dir, CONFIG_FILENAME));
}
