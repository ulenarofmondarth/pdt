/**
 * Reading a package manifest, however old or untidy, into a {@link Release}.
 *
 * It follows how Foundry VTT 14.368 reads manifests where Foundry has a rule, and records a warning
 * for everything it had to interpret. It refuses only a manifest it cannot identify: no usable id,
 * a version Foundry would refuse, or a manifest of another type of package.
 */
import { z } from 'zod';

import type { Compatibility } from '../range/compatibility.js';
import type { PackageType, Relationship, Relationships, Release } from '../release.js';

/** Something normalisation had to interpret. The `field` is a path into the manifest. */
export type ManifestWarning =
  /** A field from before Foundry VTT v10, read as its replacement. */
  | { readonly code: 'legacy-field'; readonly field: string; readonly replacement: string }
  /** No version was given, so the release is read as version `"0"`, as Foundry reads it. */
  | { readonly code: 'missing-version' }
  /** A `requires` entry that is not a module, which Foundry does not check. */
  | { readonly code: 'requires-not-module'; readonly id: string; readonly type: PackageType }
  /** A `compatibility` given as a list, of which the first entry is read. */
  | { readonly code: 'compatibility-array'; readonly field: string }
  /** A value that could not be read, and is left out. */
  | { readonly code: 'ignored-field'; readonly field: string };

/** Why a manifest could not be read. */
export type ManifestProblem =
  | { readonly code: 'not-an-object' }
  | { readonly code: 'missing-id' }
  /** An id Foundry would refuse: anything but letters, digits, `-` and `_`, or a reserved name. */
  | { readonly code: 'invalid-id'; readonly id: string }
  /** A version that is not text or a number, or contains `'`, `"`, `<`, `>` or `&`. */
  | { readonly code: 'invalid-version'; readonly version: string }
  /** The manifest declares itself a package of another type. */
  | { readonly code: 'wrong-type'; readonly expected: PackageType; readonly found: string };

/** What normalising a manifest gives. */
export type ManifestResult =
  | { readonly ok: true; readonly release: Release; readonly warnings: readonly ManifestWarning[] }
  | { readonly ok: false; readonly problems: readonly ManifestProblem[] };

/** Where a manifest came from, and what it should describe. */
export interface ManifestSource {
  /** Where it was read from, such as its URL or path. */
  readonly origin: string;
  /** The type of package expected: a `module.json` describes a module, a `system.json` a system. */
  readonly type: 'module' | 'system';
}

const object = z.record(z.string(), z.unknown());
const text = z.union([z.string(), z.number()]).transform(String);

const PACKAGE_TYPES: readonly string[] = ['module', 'system', 'world'] satisfies PackageType[];
const RELATIONSHIP_KINDS = ['requires', 'systems', 'conflicts', 'recommends'] as const;

/** Pre-v10 core bounds, and the `compatibility` field each became. */
const LEGACY_BOUNDS = [
  ['minimumCoreVersion', 'minimum'],
  ['compatibleCoreVersion', 'verified'],
  ['maximumCoreVersion', 'maximum'],
] as const;

/** Whether Foundry VTT accepts an id: letters, digits, `-` and `_`, and not a name an OS reserves. */
function isValidId(id: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(id) && !/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(id);
}

/**
 * A value as text for a problem report: text as it is, anything else as JSON. `String` would throw
 * for an object whose `toString` is not a function, such as `{"toString": 0}` from a manifest.
 */
function asText(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** Whether Foundry VTT accepts a version: anything without `'`, `"`, `<`, `>` or `&`. */
function isValidVersion(version: string): boolean {
  return !/['"<>&]/.test(version);
}

/**
 * Reads a manifest into a release.
 *
 * @param json - The manifest, as parsed from JSON
 * @param source - Where it came from, and the type of package it should describe
 */
export function normaliseManifest(json: unknown, source: ManifestSource): ManifestResult {
  const warnings: ManifestWarning[] = [];
  const problems: ManifestProblem[] = [];

  /** Reads text or a number as text; anything else, or blank text, is left out with a warning. */
  function readText(value: unknown, field: string): string | undefined {
    if (value === undefined) return undefined;
    const read = text.safeParse(value);
    if (read.success && read.data !== '') return read.data;
    warnings.push({ code: 'ignored-field', field });
    return undefined;
  }

  /** Reads a version bound, leaving out one Foundry would refuse. */
  function readBound(value: unknown, field: string): string | undefined {
    const bound = readText(value, field);
    if (bound === undefined || isValidVersion(bound)) return bound;
    warnings.push({ code: 'ignored-field', field });
    return undefined;
  }

  function readCompatibility(value: unknown, field: string): Compatibility {
    if (value === undefined) return {};
    let block = value;
    if (Array.isArray(block)) {
      warnings.push({ code: 'compatibility-array', field });
      block = block[0] ?? {};
    }
    const read = object.safeParse(block);
    if (!read.success) {
      warnings.push({ code: 'ignored-field', field });
      return {};
    }
    const minimum = readBound(read.data['minimum'], `${field}.minimum`);
    const maximum = readBound(read.data['maximum'], `${field}.maximum`);
    const verified = readBound(read.data['verified'], `${field}.verified`);
    return { ...(minimum && { minimum }), ...(maximum && { maximum }), ...(verified && { verified }) };
  }

  /** Reads a list; a single entry is read as a list of one, as Foundry reads it. */
  function readList(value: unknown, field: string): unknown[] {
    if (value === undefined) return [];
    if (Array.isArray(value)) return value;
    if (object.safeParse(value).success) return [value];
    warnings.push({ code: 'ignored-field', field });
    return [];
  }

  function readRelationship(
    entry: unknown,
    field: string,
    kind: (typeof RELATIONSHIP_KINDS)[number],
  ): Relationship | undefined {
    const read = object.safeParse(entry);
    const id = read.success ? readText(read.data['id'], `${field}.id`) : undefined;
    if (!read.success || id === undefined || !isValidId(id)) {
      warnings.push({ code: 'ignored-field', field });
      return undefined;
    }
    const declared = read.data['type'] ?? (kind === 'systems' ? 'system' : 'module');
    if (
      typeof declared !== 'string' ||
      !PACKAGE_TYPES.includes(declared) ||
      (kind === 'systems' && declared !== 'system')
    ) {
      warnings.push({ code: 'ignored-field', field });
      return undefined;
    }
    const type = declared as PackageType;
    if (kind === 'requires' && type !== 'module') warnings.push({ code: 'requires-not-module', id, type });
    const manifest = readText(read.data['manifest'], `${field}.manifest`);
    const reason = readText(read.data['reason'], `${field}.reason`);
    return {
      package: { type, id },
      compatibility: readCompatibility(read.data['compatibility'], `${field}.compatibility`),
      ...(manifest && { manifest }),
      ...(reason && { reason }),
    };
  }

  function readRelationships(manifest: Record<string, unknown>): Relationships {
    let declared: Record<string, unknown> = {};
    if (manifest['relationships'] !== undefined) {
      const read = object.safeParse(manifest['relationships']);
      if (read.success) declared = read.data;
      else warnings.push({ code: 'ignored-field', field: 'relationships' });
    }

    const lists = Object.fromEntries(
      RELATIONSHIP_KINDS.map(kind => {
        const entries = readList(declared[kind], `relationships.${kind}`);
        const read = entries.map((entry, i) => readRelationship(entry, `relationships.${kind}[${i}]`, kind));
        return [kind, read.filter(relationship => relationship !== undefined)];
      }),
    ) as Record<(typeof RELATIONSHIP_KINDS)[number], Relationship[]>;

    // Before v10, `systems` was a list of system ids. Foundry v14 still reads it.
    if (manifest['systems'] !== undefined) {
      warnings.push({ code: 'legacy-field', field: 'systems', replacement: 'relationships.systems' });
      if (declared['systems'] === undefined) {
        lists.systems = readList(manifest['systems'], 'systems')
          .map((entry, i) =>
            readRelationship(typeof entry === 'string' ? { id: entry } : entry, `systems[${i}]`, 'systems'),
          )
          .filter(relationship => relationship !== undefined);
      }
    }

    // Before v10, `dependencies` named required packages by `name`. Foundry v14 ignores them, but
    // releases that declare them were written for cores that read them.
    if (manifest['dependencies'] !== undefined) {
      warnings.push({ code: 'legacy-field', field: 'dependencies', replacement: 'relationships.requires' });
      const required = new Set(lists.requires.map(relationship => relationship.package.id));
      for (const [i, entry] of readList(manifest['dependencies'], 'dependencies').entries()) {
        const named = object.safeParse(entry);
        const withId =
          named.success && named.data['id'] === undefined ? { ...named.data, id: named.data['name'] } : entry;
        const relationship = readRelationship(withId, `dependencies[${i}]`, 'requires');
        if (relationship && !required.has(relationship.package.id)) lists.requires.push(relationship);
      }
    }

    return lists;
  }

  const read = object.safeParse(json);
  if (!read.success) return { ok: false, problems: [{ code: 'not-an-object' }] };
  const manifest = read.data;

  // Identity: the id (or, before v10, the name), the type, and the version.
  let rawId = manifest['id'];
  if (rawId === undefined && manifest['name'] !== undefined) {
    warnings.push({ code: 'legacy-field', field: 'name', replacement: 'id' });
    rawId = manifest['name'];
  }
  const id = typeof rawId === 'string' ? rawId : undefined;
  if (rawId === undefined) problems.push({ code: 'missing-id' });
  else if (id === undefined || !isValidId(id)) problems.push({ code: 'invalid-id', id: asText(rawId) });

  const type = manifest['type'];
  if (type !== undefined && type !== source.type) {
    problems.push({ code: 'wrong-type', expected: source.type, found: asText(type) });
  }

  let version = '0';
  const rawVersion = manifest['version'];
  if (rawVersion === undefined || rawVersion === null || rawVersion === '') {
    warnings.push({ code: 'missing-version' });
  } else {
    const parsed = text.safeParse(rawVersion);
    if (parsed.success && isValidVersion(parsed.data)) version = parsed.data;
    else problems.push({ code: 'invalid-version', version: JSON.stringify(rawVersion) });
  }

  // Core compatibility, with the bounds from before v10 where the current ones are not given.
  let compatibility = readCompatibility(manifest['compatibility'], 'compatibility');
  for (const [legacy, field] of LEGACY_BOUNDS) {
    if (manifest[legacy] === undefined) continue;
    warnings.push({ code: 'legacy-field', field: legacy, replacement: `compatibility.${field}` });
    const bound = readBound(manifest[legacy], legacy);
    if (compatibility[field] === undefined && bound !== undefined) compatibility = { ...compatibility, [field]: bound };
  }

  const relationships = readRelationships(manifest);
  const manifestUrl = readText(manifest['manifest'], 'manifest');
  const download = readText(manifest['download'], 'download');

  if (problems.length > 0 || id === undefined) return { ok: false, problems };
  return {
    ok: true,
    release: {
      package: { type: source.type, id },
      version,
      compatibility,
      relationships,
      ...(manifestUrl && { manifest: manifestUrl }),
      ...(download && { download }),
      protected: manifest['protected'] === true,
      origin: source.origin,
      detail: 'loaded',
    },
    warnings,
  };
}
