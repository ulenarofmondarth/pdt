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
 * @param load - Loads listed releases from their manifests. It returns the releases it loaded, in
 *   any order, and may leave out any it could not load. It may also return releases the universe
 *   does not have yet, such as the listings of packages a loaded release names, which are added.
 */
export async function resolveInRounds(
  universe: Universe,
  requirements: Requirements,
  load: (needs: readonly Release[]) => Promise<readonly Release[]>,
  { maxRounds = 10, ...options }: RoundsOptions = {},
): Promise<RoundsResult> {
  let current = universe;
  const unloaded: PackageVersion[] = [];
  const keyOfRelease = (release: Release) => keyOf(packageKey(release.package), release.version);
  for (let rounds = 1; ; rounds++) {
    const resolution = resolve(current, requirements, options);
    if (!('needs' in resolution) || rounds >= maxRounds) return { resolution, universe: current, rounds, unloaded };

    const needed = new Set(resolution.needs.map(need => keyOf(need.package, need.version)));
    const listed = new Map<string, Release>();
    for (const release of current.releases) {
      const key = keyOfRelease(release);
      if (release.detail === 'listed' && needed.has(key) && !listed.has(key)) listed.set(key, release);
    }
    const returned = await load([...listed.values()]);
    const loaded = new Map(
      returned
        .filter(release => release.detail === 'loaded' && needed.has(keyOfRelease(release)))
        .map(release => [keyOfRelease(release), release]),
    );
    const known = new Set(current.releases.map(keyOfRelease));
    const added = returned.filter(release => !known.has(keyOfRelease(release)));
    for (const need of resolution.needs) {
      if (!loaded.has(keyOf(need.package, need.version))) unloaded.push(need);
    }
    current = {
      ...current,
      releases: [
        ...current.releases.map(release => {
          const key = keyOfRelease(release);
          if (!needed.has(key) || release.detail !== 'listed') return release;
          // A release that could not be loaded stays listed, marked so that it is not asked for again.
          const found = loaded.get(key);
          if (found === undefined) return { ...release, loadFailed: true };
          // What the listing said stays with the release: its bounds, for the listingCompatibility
          // policy, and whether it offers the release at all.
          const listing = found.listing ?? release.listing;
          const unlisted = found.unlisted ?? release.unlisted;
          return { ...found, ...(listing && { listing }), ...(unlisted !== undefined && { unlisted }) };
        }),
        ...added,
      ],
    };
  }
}
