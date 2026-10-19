/**
 * Reads pdt's configuration.
 *
 * The configuration starts from the defaults shipped with pdt. Each configuration file that exists
 * is merged over it in turn, then the environment variables, then the settings given on the command
 * line, and the result is validated. Later sources win: an object is merged key by key, anything
 * else, lists included, is replaced whole. Which source each value came from is kept.
 *
 * Secret settings live in a `secrets.conf` next to each `config.json`, read straight after it, so
 * that a configuration file can be shared, or committed, without them.
 *
 * Nothing here depends on the running process, so callers say which files and variables to use.
 */
import fs from 'node:fs';
import path from 'node:path';
import defaults from '@/pdt-internal-config/default.json' with { type: 'json' };
import { config as configSchema, type Config } from '@schema/config.js';
import {
  isSettings,
  leaves,
  parseKey,
  parseValue,
  settingKey,
  splitSecrets,
  valueAt,
  withoutKey,
  type ConfigKey,
} from '@util/config-keys.js';
import { m } from '@i18n/messages.js';

import type { PdtPaths } from '@util/runtime-config.js';

/** Name of the configuration file in each configuration directory. */
export const CONFIG_FILENAME = 'config.json';

/** Name of the file of secret settings in each configuration directory. */
export const SECRETS_FILENAME = 'secrets.conf';

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
export type ConfigSource = 'default' | 'user' | 'user-secrets' | 'project' | 'project-secrets' | 'environment' | 'cli';

/** A configuration file, whose it is, and whether it is the file of secret settings. */
export interface ConfigFile {
  path: string;
  source: 'user' | 'project';
  secrets: boolean;
}

/** The source a configuration file's values come from. */
function sourceOfFile({ source, secrets }: ConfigFile): ConfigSource {
  return secrets ? `${source}-secrets` : source;
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
 * The settings in a configuration file, or none if it does not exist.
 *
 * @throws {ConfigError} When the file cannot be read, is not JSON, does not hold an object, or is a
 *   `config.json` that holds a secret setting
 */
function readSettings(file: ConfigFile): Settings {
  const settings = readFile(file.path);
  if (file.secrets) return settings;
  const { secret } = splitSecrets(settings);
  if (secret !== undefined) {
    const keys = leaves(secret).map(leaf => leaf.key.join('.'));
    const secrets = path.join(path.dirname(file.path), SECRETS_FILENAME);
    throw new ConfigError(m['error.config.secretInConfig']({ file: file.path, keys: keys.join(', '), secrets }));
  }
  return settings;
}

/** Write `settings` to `file`, which only its owner may read if it holds secrets. */
function writeSettings(file: ConfigFile, settings: Settings) {
  fs.mkdirSync(path.dirname(file.path), { recursive: true });
  fs.writeFileSync(file.path, `${JSON.stringify(settings, null, 2)}\n`, file.secrets ? { mode: 0o600 } : {});
  // The mode is only given to a new file; one made some other way may be readable by others.
  if (file.secrets) fs.chmodSync(file.path, 0o600);
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
    layers.push({ source: sourceOfFile(file), settings: readSettings(file) });
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
 * Set a value in the user's or the project's configuration, creating the files if there are none.
 * Secret values go to the `secrets.conf`, the rest to the `config.json`: a group of settings may be
 * split between them.
 *
 * The value is read as {@link parseValue} reads it. Nothing is written unless the whole
 * configuration, with the change, is valid.
 *
 * @param sources - The configuration's sources; the files written are among them
 * @param target - Whose files to write
 * @param key - The dot separated key of the setting
 * @param value - The value, as text
 * @returns The files written
 * @throws {ConfigError} When the key is not a setting, a file cannot be read, or the change would
 *   make the configuration invalid
 */
export function writeSetting(
  sources: ConfigSources,
  target: ConfigFile['source'],
  key: string,
  value: string,
): string[] {
  const split = splitSecrets(overrideSettings({ key, value }));
  const changes = new Map<ConfigSource, { file: ConfigFile; settings: Settings }>();
  for (const [secrets, over] of [
    [false, split.plain],
    [true, split.secret],
  ] as const) {
    if (over === undefined) continue;
    const file = sources.files.find(candidate => candidate.source === target && candidate.secrets === secrets);
    if (file === undefined) throw new Error(m['error.config.noFile']({ target }));
    changes.set(sourceOfFile(file), { file, settings: merge(readFile(file.path), over) });
  }

  resolve(
    readLayers(sources).map(layer => ({ ...layer, settings: changes.get(layer.source)?.settings ?? layer.settings })),
  );

  return [...changes.values()].map(({ file, settings }) => {
    writeSettings(file, settings);
    return file.path;
  });
}

/**
 * The configuration files that set a value at `key`, in the order they are read.
 *
 * @throws {Error} When the key is not a setting
 * @throws {ConfigError} When a file cannot be read
 */
export function filesSetting(sources: ConfigSources, key: string): ConfigFile[] {
  const keys = settingKey(key);
  return sources.files.filter(file => valueAt(readFile(file.path), keys) !== undefined);
}

/**
 * Remove the value at `key` from the user's or the project's configuration files, with any group
 * the removal leaves empty. Both the `config.json` and the `secrets.conf` are cleared: a group of
 * settings may be split between them.
 *
 * Nothing is written unless the whole configuration, with the change, is valid.
 *
 * @param sources - The configuration's sources; the files changed are among them
 * @param targets - Whose files to change
 * @param key - The dot separated key of the setting, or group of settings
 * @returns The files written: those that set a value at `key`
 * @throws {Error} When the key is not a setting
 * @throws {ConfigError} When a file cannot be read, or the change would make the configuration
 *   invalid
 */
export function clearSetting(sources: ConfigSources, targets: readonly ConfigFile['source'][], key: string): string[] {
  const keys = settingKey(key);
  const changes = new Map<ConfigSource, { file: ConfigFile; settings: Settings }>();
  for (const target of new Set(targets)) {
    const files = sources.files.filter(candidate => candidate.source === target);
    if (files.length === 0) throw new Error(m['error.config.noFile']({ target }));
    for (const file of files) {
      const settings = readFile(file.path);
      if (valueAt(settings, keys) !== undefined) {
        changes.set(sourceOfFile(file), { file, settings: withoutKey(settings, keys) });
      }
    }
  }

  resolve(
    readLayers(sources).map(layer => ({ ...layer, settings: changes.get(layer.source)?.settings ?? layer.settings })),
  );

  return [...changes.values()].map(({ file, settings }) => {
    writeSettings(file, settings);
    return file.path;
  });
}

/**
 * The configuration files for a set of directories: the user's, then the project's, each
 * `config.json` followed by its `secrets.conf`.
 *
 * @param paths - The user configuration directory, and the project's `.pdt` directory if there is one
 */
export function configFiles({
  userConfigDir,
  pdtConfigDir,
}: Pick<PdtPaths, 'userConfigDir' | 'pdtConfigDir'>): ConfigFile[] {
  const filesIn = (dir: string, source: ConfigFile['source']): ConfigFile[] => [
    { path: path.join(dir, CONFIG_FILENAME), source, secrets: false },
    { path: path.join(dir, SECRETS_FILENAME), source, secrets: true },
  ];
  return pdtConfigDir === undefined
    ? filesIn(userConfigDir, 'user')
    : [...filesIn(userConfigDir, 'user'), ...filesIn(pdtConfigDir, 'project')];
}
