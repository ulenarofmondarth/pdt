/**
 * Configuration keys: dot separated references to settings, such as `Logging.level`, checked
 * against the configuration schema.
 */
import { z } from 'zod/v4';
import { config as configSchema } from '@schema/config.js';
import { m } from '@i18n/messages.js';

/** A key, split at its dots. */
export type ConfigKey = readonly [string, ...string[]];

/** A setting that is not a group of settings, and where it is. */
export interface ConfigLeaf {
  key: ConfigKey;
  value: unknown;
}

type Settings = Record<string, unknown>;

/** Whether `value` is a group of settings, as opposed to a value (lists included). */
export function isSettings(value: unknown): value is Settings {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Split a dot separated key.
 *
 * @throws {Error} When the key, or any part of it, is empty
 */
export function parseKey(key: string): ConfigKey {
  const [first, ...rest] = key.split('.');
  if (first === undefined || first === '' || rest.includes('')) {
    throw new Error(m['error.config.badKey']({ key }));
  }
  return [first, ...rest];
}

function unwrap(schema: z.core.$ZodType): z.core.$ZodType {
  let current = schema;
  while (current instanceof z.ZodOptional || current instanceof z.ZodDefault) current = current.unwrap();
  return current;
}

function child(schema: z.core.$ZodType, key: string): z.core.$ZodType | undefined {
  const current = unwrap(schema);
  if (current instanceof z.ZodObject) return Object.hasOwn(current.shape, key) ? current.shape[key] : undefined;
  if (current instanceof z.ZodRecord) return current.valueType;
  if (current instanceof z.ZodUnion) {
    for (const option of current.options) {
      const found = child(option, key);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/**
 * The part of the schema a key refers to, or undefined when the schema has no such setting.
 *
 * A key may name a group of settings (`Logging`) as well as a single setting (`Logging.level`).
 * Below a record, such as `VTT`, any name is a setting the schema allows.
 */
export function schemaAt(key: ConfigKey, schema: z.core.$ZodType = configSchema): z.core.$ZodType | undefined {
  let current: z.core.$ZodType | undefined = schema;
  for (const part of key) {
    current = child(current, part);
    if (current === undefined) return undefined;
  }
  return current;
}

/**
 * Split a key that must name a setting, or a group of settings, the schema has.
 *
 * @throws {Error} When the key is empty, or the schema has no such setting
 */
export function settingKey(key: string): ConfigKey {
  const keys = parseKey(key);
  if (schemaAt(keys) === undefined) throw new Error(m['error.config.unknownKey']({ key }));
  return keys;
}

/** `settings` without the value at `key`, and without any group the removal leaves empty. */
export function withoutKey(settings: Settings, key: ConfigKey): Settings {
  const [first, second, ...more] = key;
  if (!Object.hasOwn(settings, first)) return settings;
  const { [first]: inner, ...others } = settings;
  if (second === undefined) return others;
  if (!isSettings(inner)) return settings;
  const remaining = withoutKey(inner, [second, ...more]);
  return Object.keys(remaining).length === 0 ? others : { ...others, [first]: remaining };
}

/** The value at `key` in `settings`, or undefined when there is none. */
export function valueAt(settings: unknown, key: ConfigKey): unknown {
  let current = settings;
  for (const part of key) {
    if (!isSettings(current) || !Object.hasOwn(current, part)) return undefined;
    current = current[part];
  }
  return current;
}

/** Every value in `value`, with its key, in order; `value` itself when it is not a group. */
export function leaves(value: unknown, key: readonly string[] = []): ConfigLeaf[] {
  if (!isSettings(value)) {
    const [first, ...rest] = key;
    return first === undefined ? [] : [{ key: [first, ...rest], value }];
  }
  return Object.entries(value).flatMap(([part, inner]) => leaves(inner, [...key, part]));
}

/**
 * The value to store at `key`, given as text.
 *
 * Text the setting accepts as it is stays text, so `warn` sets a string. Anything else is read as
 * JSON, so `8080` sets a number and `[...]` a list. Whether the result is valid is decided when the
 * whole configuration is validated.
 *
 * @throws {Error} When the schema has no such setting
 */
export function parseValue(key: ConfigKey, text: string): unknown {
  const schema = schemaAt(key);
  if (schema === undefined) throw new Error(m['error.config.unknownKey']({ key: key.join('.') }));
  if (z.safeParse(schema, text).success) return text;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
