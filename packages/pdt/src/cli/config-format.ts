/**
 * Writes configuration values for `pdt config get`.
 */
import YAML from 'yaml';
import { isSettings, leaves } from '@util/config-keys.js';

import type { ConfigSource } from '@util/load-config.js';

/** The formats a group of settings can be written in. */
export const CONFIG_FORMATS = ['flat', 'tree', 'json', 'yml'] as const;

export type ConfigFormat = (typeof CONFIG_FORMATS)[number];

export interface FormatOptions {
  format: ConfigFormat;
  /** Where the value at a key comes from; when given, flat and tree note it after each value. */
  sourceOf?: (key: readonly string[]) => ConfigSource;
}

/** A value as it appears in flat and tree: strings quoted, anything else as JSON. */
function literal(value: unknown): string {
  return JSON.stringify(value);
}

function noteFor(sourceOf: FormatOptions['sourceOf']) {
  return (key: readonly string[]) => (sourceOf === undefined ? '' : ` [${sourceOf(key)}]`);
}

/** The lines below a group in a tree, each prefixed with `prefix`. */
function branches(
  group: Record<string, unknown>,
  prefix: string,
  at: readonly string[],
  note: (key: readonly string[]) => string,
): string[] {
  const entries = Object.entries(group);
  return entries.flatMap(([name, value], index) => {
    const last = index === entries.length - 1;
    const line = `${prefix}${last ? '└── ' : '├── '}${name}`;
    const key = [...at, name];
    return isSettings(value)
      ? [line, ...branches(value, `${prefix}${last ? '    ' : '│   '}`, key, note)]
      : [`${line}: ${literal(value)}${note(key)}`];
  });
}

/** A tree of `group`; headed by its key, unless it is the whole configuration. */
function tree(group: Record<string, unknown>, at: readonly string[], note: (key: readonly string[]) => string) {
  if (at.length > 0) return [at.join('.'), ...branches(group, '', at, note)];
  return Object.entries(group).flatMap(([name, value]) =>
    isSettings(value) ? [name, ...branches(value, '', [name], note)] : [`${name}: ${literal(value)}${note([name])}`],
  );
}

/**
 * A group of settings, as text.
 *
 * - `flat`: a line for each value, its full key then the value: `Logging.level "warn"`
 * - `tree`: the keys as a tree, each value after its name
 * - `json`, `yml`: the group serialised; sources are not shown
 *
 * @param group - The settings
 * @param at - The key of the group; empty for the whole configuration
 */
export function formatSettings(
  group: Record<string, unknown>,
  at: readonly string[],
  { format, sourceOf }: FormatOptions,
): string {
  const note = noteFor(sourceOf);
  switch (format) {
    case 'flat':
      return leaves(group, at)
        .map(({ key, value }) => `${key.join('.')} ${literal(value)}${note(key)}`)
        .join('\n');
    case 'tree':
      return tree(group, at, note).join('\n');
    case 'json':
      return JSON.stringify(group, null, 2);
    case 'yml':
      return YAML.stringify(group).trimEnd();
  }
}

/**
 * A single value, as text: in flat and tree the value alone, strings unquoted, so that it can be
 * used as it is; in json and yml the value serialised.
 *
 * @param value - The value
 * @param key - Its key
 */
export function formatValue(value: unknown, key: readonly string[], { format, sourceOf }: FormatOptions): string {
  switch (format) {
    case 'flat':
    case 'tree':
      return `${typeof value === 'string' ? value : literal(value)}${noteFor(sourceOf)(key)}`;
    case 'json':
      return JSON.stringify(value, null, 2);
    case 'yml':
      return YAML.stringify(value).trimEnd();
  }
}
