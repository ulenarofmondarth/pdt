/**
 * Resolving in rounds: resolve over the universe as it is, load the listed releases the answer
 * depends on, and resolve again, until the answer is final.
 *
 * Loading is the caller's: the core does no I/O, so `load` is given, and may fetch, read a cache
 * or anything else. Each round is a pure resolution of its universe.
 */
import { packageKey } from './universe.js';
import { resolve } from './resolve.js';

import type { Release } from './release.js';
import type { PackageVersion, Requirements, Resolution, ResolveOptions } from './resolve.js';
import type { Universe } from './universe.js';

export interface RoundsOptions extends ResolveOptions {
  /** The most rounds to run before giving up with the last, incomplete answer. 10 by default. */
  readonly maxRounds?: number;
}

export interface RoundsResult {
  /** The final answer, or the last incomplete one if the rounds ran out. */
  readonly resolution: Resolution;
  /** The universe with the releases loaded, to save or to resolve against again. */
  readonly universe: Universe;
  readonly rounds: number;
  /**
   * The listed releases `load` could not load. They are kept as they are listed, without their
   * relationships or `maximum`, so the answer may be wrong about them.
   */
  readonly unloaded: readonly PackageVersion[];
}

const keyOf = (key: string, version: string) => `${key}@${version}`;

/**
 * Resolves, loading listed releases as the answer needs them.
 *
 * @param load - Loads releases from their manifests. It returns the releases it loaded, in any order,
 *   and may leave out any it could not load
 */
export async function resolveInRounds(
  universe: Universe,
  requirements: Requirements,
  load: (needs: readonly PackageVersion[]) => Promise<readonly Release[]>,
  { maxRounds = 10, ...options }: RoundsOptions = {},
): Promise<RoundsResult> {
  let current = universe;
  const unloaded: PackageVersion[] = [];
  for (let rounds = 1; ; rounds++) {
    const resolution = resolve(current, requirements, options);
    if (!('needs' in resolution) || rounds >= maxRounds) return { resolution, universe: current, rounds, unloaded };

    const loaded = new Map(
      (await load(resolution.needs))
        .filter(release => release.detail === 'loaded')
        .map(release => [keyOf(packageKey(release.package), release.version), release]),
    );
    const needed = new Set(resolution.needs.map(need => keyOf(need.package, need.version)));
    for (const need of resolution.needs) {
      if (!loaded.has(keyOf(need.package, need.version))) unloaded.push(need);
    }
    current = {
      ...current,
      releases: current.releases.map(release => {
        const key = keyOf(packageKey(release.package), release.version);
        if (!needed.has(key) || release.detail !== 'listed') return release;
        // A release that could not be loaded is used as listed, so that it is not asked for again.
        const found = loaded.get(key);
        if (found === undefined) return { ...release, detail: 'loaded' };
        // The listing's bounds stay with the release, for the listingCompatibility policy.
        const listing = found.listing ?? release.listing;
        return listing === undefined ? found : { ...found, listing };
      }),
    };
  }
}
