/**
 * Local packages: manifests the caller has read itself, such as the working copy of the package
 * under development. They take part as they are, whatever has been published.
 */
import { normaliseManifest } from '../manifest/normalise.js';

import type { ManifestProblem } from '../manifest/normalise.js';
import type { Release } from '../release.js';
import type { ReleaseSource } from './types.js';

/** A manifest the caller has read. */
export interface LocalManifest {
  /** The manifest, as parsed from JSON. */
  readonly json: unknown;
  /** Where it was read from, such as its path. */
  readonly origin: string;
  readonly type: 'module' | 'system';
}

export interface LocalSource extends ReleaseSource {
  /** The manifests that could not be read, and why. */
  readonly problems: readonly { readonly origin: string; readonly problems: readonly ManifestProblem[] }[];
}

/** A source of the releases the given manifests describe, each loaded. */
export function localSource(manifests: readonly LocalManifest[]): LocalSource {
  const releases: Release[] = [];
  const problems: { origin: string; problems: readonly ManifestProblem[] }[] = [];
  for (const { json, origin, type } of manifests) {
    const read = normaliseManifest(json, { origin, type });
    if (read.ok) releases.push(read.release);
    else problems.push({ origin, problems: read.problems });
  }
  return {
    name: 'local',
    problems,
    releases: ref =>
      Promise.resolve({
        ok: true,
        value: releases.filter(release => release.package.type === ref.type && release.package.id === ref.id),
      }),
  };
}
