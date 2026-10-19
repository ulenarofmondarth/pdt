/**
 * Reads pdt's configuration.
 *
 * The configuration starts from the defaults shipped with pdt. Each configuration file that exists
 * is merged over it in turn, then the environment variables, then the settings given on the command
 * line, and the result is validated. Later sources win: an object is merged key by key, anything
 * else, lists included, is replaced whole. Which source each value came from is kept.
 *
 * Nothing here depends on the running process, so callers say which files and variables to use.
 */
import fs from 'node:fs';
import path from 'node:path';
import defaults from '@/pdt-internal-config/default.json' with { type: 'json' };
import { config as configSchema, type Config } from '@schema/config.js';
import { isSettings, leaves, parseKey, parseValue, type ConfigKey } from '@util/config-keys.js';
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

/** Where a value in the configuration came from. */
export type ConfigSource = 'default' | 'user' | 'project' | 'environment' | 'cli';

/** A configuration file, and which of the sources it is. */
export interface ConfigFile {
  path: string;
  source: 'user' | 'project';
}

/** A setting given on the command line, as `--config <key>=<value>`. */
export interface ConfigOverride {
  key: string;
  value: string;
}

/** Where the configuration comes from, in addition to the shipped defaults. */
export interface ConfigSources {
  /** Configuration files, earliest first; a file that does not exist is skipped. */
  files: readonly ConfigFile[];
  /** Environment variables. */
  env: Readonly<Record<string, string | undefined>>;
  /** Settings given on the command line, earliest first. */
  overrides?: readonly ConfigOverride[];
}

/** The configuration, and where each of its values came from. */
export interface ResolvedConfig {
  config: Config;
  /** Where the value at `key` came from; a value no source set is a default of the schema. */
  sourceOf(key: readonly string[]): ConfigSource;
}

/** Settings that environment variables override, by variable name. */
const ENVIRONMENT_SETTINGS: Readonly<Record<string, readonly [string, ...string[]]>> = {
  PDT_LOG_LEVEL: ['Logging', 'level'],
};

type Settings = Record<string, unknown>;

/** Settings from one source. */
interface Layer {
  source: ConfigSource;
  settings: Settings;
}

/** Where each value came from, by its dot separated key. */
type Origins = Map<string, ConfigSource>;

/** Record that every value in `value`, at `key`, came from `source`, replacing what was there. */
function setOrigins(origins: Origins, key: readonly string[], value: unknown, source: ConfigSource) {
  const prefix = key.join('.');
  for (const known of [...origins.keys()]) {
    if (known === prefix || known.startsWith(`${prefix}.`)) origins.delete(known);
  }
  for (const leaf of leaves(value, key)) origins.set(leaf.key.join('.'), source);
}

/**
 * Merge `over` onto `base`, without changing either, recording in `origins` that what `over` sets
 * came from `source`.
 */
function merge(base: Settings, over: Settings, source?: ConfigSource, origins?: Origins, at: string[] = []): Settings {
  const merged: Settings = { ...base };
  for (const [key, value] of Object.entries(over)) {
    // JSON.parse makes "__proto__" an ordinary key; assigning it would replace the prototype.
    if (key === '__proto__') continue;
    const current = merged[key];
    if (isSettings(current) && isSettings(value)) {
      merged[key] = merge(current, value, source, origins, [...at, key]);
    } else {
      merged[key] = value;
      if (origins && source) setOrigins(origins, [...at, key], value, source);
    }
  }
  return merged;
}

/** A single setting at `keys`, as settings to merge. */
function nested(keys: ConfigKey, value: unknown): Settings {
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
 * A setting given on the command line, as settings to merge.
 *
 * @throws {ConfigError} When it is not `<key>=<value>`, or the key is not a setting
 */
function overrideSettings({ key, value }: ConfigOverride): Settings {
  try {
    const keys = parseKey(key);
    return nested(keys, parseValue(keys, value));
  } catch (error) {
    throw new ConfigError((error as Error).message, [], { cause: error });
  }
}

/** The settings from each source, earliest first, starting with the shipped defaults. */
function readLayers({ files, env, overrides = [] }: ConfigSources): Layer[] {
  const layers: Layer[] = [{ source: 'default', settings: defaults }];
  for (const file of files) {
    layers.push({ source: file.source, settings: readFile(file.path) });
  }
  for (const [variable, keys] of Object.entries(ENVIRONMENT_SETTINGS)) {
    const value = env[variable];
    if (value) layers.push({ source: 'environment', settings: nested(keys, value) });
  }
  for (const override of overrides) {
    layers.push({ source: 'cli', settings: overrideSettings(override) });
  }
  return layers;
}

/**
 * Merge the layers in order and validate the result.
 *
 * @throws {ConfigError} When the configuration is invalid
 */
function resolve(layers: readonly Layer[]): ResolvedConfig {
  const origins: Origins = new Map();
  let settings: Settings = {};
  for (const { source, settings: over } of layers) {
    settings = merge(settings, over, source, origins);
  }

  const result = configSchema.safeParse(settings);
  if (!result.success) {
    const problems = result.error.issues.map(issue => `${issue.path.join('.')} ${issue.message}`);
    throw new ConfigError(m['error.config.invalid'](), problems, { cause: result.error });
  }
  return { config: result.data, sourceOf: key => origins.get(key.join('.')) ?? 'default' };
}

/**
 * Read and validate the configuration, keeping where each value came from.
 *
 * @param sources - The files, environment variables and command line settings to read
 * @throws {ConfigError} When a file or a command line setting cannot be used, or the configuration
 *   is invalid
 */
export function resolveConfig(sources: ConfigSources): ResolvedConfig {
  return resolve(readLayers(sources));
}

/**
 * Read and validate the configuration.
 *
 * @param sources - The files, environment variables and command line settings to read
 * @returns The validated configuration
 * @throws {ConfigError} When a file or a command line setting cannot be used, or the configuration
 *   is invalid
 */
export function loadConfig(sources: ConfigSources): Config {
  return resolveConfig(sources).config;
}

/**
 * Set a value in one of the configuration files, creating the file if there is none.
 *
 * The value is read as {@link parseValue} reads it. Nothing is written unless the whole
 * configuration, with the change, is valid.
 *
 * @param sources - The configuration's sources; the file written is one of them
 * @param target - Which file to write
 * @param key - The dot separated key of the setting
 * @param value - The value, as text
 * @returns The file written
 * @throws {ConfigError} When the key is not a setting, a file cannot be read, or the change would
 *   make the configuration invalid
 */
export function writeSetting(sources: ConfigSources, target: ConfigFile['source'], key: string, value: string): string {
  const file = sources.files.find(candidate => candidate.source === target);
  if (file === undefined) throw new Error(m['error.config.noFile']({ target }));
  const changed = merge(readFile(file.path), overrideSettings({ key, value }));

  resolve(readLayers(sources).map(layer => (layer.source === target ? { source: target, settings: changed } : layer)));

  fs.mkdirSync(path.dirname(file.path), { recursive: true });
  fs.writeFileSync(file.path, `${JSON.stringify(changed, null, 2)}\n`);
  return file.path;
}

/**
 * The configuration files for a set of directories: the user's, then the project's.
 *
 * @param paths - The user configuration directory, and the project's `.pdt` directory if there is one
 */
export function configFiles({
  userConfigDir,
  pdtConfigDir,
}: Pick<PdtPaths, 'userConfigDir' | 'pdtConfigDir'>): ConfigFile[] {
  const user: ConfigFile = { path: path.join(userConfigDir, CONFIG_FILENAME), source: 'user' };
  return pdtConfigDir === undefined
    ? [user]
    : [user, { path: path.join(pdtConfigDir, CONFIG_FILENAME), source: 'project' }];
}
