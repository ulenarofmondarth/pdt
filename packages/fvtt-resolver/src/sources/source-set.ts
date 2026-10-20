/**
 * A set of sources, working together: building a universe from what they list, and loading
 * listed releases from their manifests as resolving in rounds needs them.
 */
import { normaliseManifest } from '../manifest/normalise.js';
import { packageKey } from '../universe.js';
import { isNewerVersion } from '../version/foundry.js';

import type { PackageRef, Release } from '../release.js';
import type { CoreRelease, PackageKey, Universe } from '../universe.js';
import type { HttpClient } from './http.js';
import type { ReleaseSource, SourceGap } from './types.js';

export interface SourceSetOptions {
  /** The sources, in order: where two list the same version, the first is used. */
  readonly sources: readonly ReleaseSource[];
  /** The client manifests are loaded with. */
  readonly http: HttpClient;
  /** The core releases of interest. Releases whose `minimum` is newer than all of them are left out. */
  readonly core: readonly CoreRelease[];
}

export interface SourceSet {
  /** A universe of the core releases and the releases of these packages. */
  universe(packages: readonly PackageRef[]): Promise<Universe>;
  /**
   * Loads listed releases from their manifests, for `resolveInRounds`. It also lists the packages
   * the loaded releases require or run in that are not yet known, and returns their releases too.
   */
  load(needs: readonly Release[]): Promise<Release[]>;
  /** What could not be fetched or read so far. */
  gaps(): readonly SourceGap[];
}

const MANIFEST_SOURCE = 'manifest';

/** A version without a leading `v` or `V`. */
const bare = (version: string) => version.replace(/^[vV]/, '');

/** Sources working together. */
export function sourceSet({ sources, http, core }: SourceSetOptions): SourceSet {
  const known = new Set<PackageKey>();
  const gaps: SourceGap[] = [];
  const newestCore = core
    .map(c => c.version)
    .reduce<string | undefined>(
      (newest, version) => (newest === undefined || isNewerVersion(version, newest) ? version : newest),
      undefined,
    );
  /** Whether a release could work with some core of interest. */
  const possible = ({ compatibility: { minimum } }: Release) =>
    newestCore === undefined || minimum === undefined || !isNewerVersion(minimum, newestCore);

  /** Every release of a package that the sources list, the first source's where they list the same version. */
  async function list(ref: PackageRef): Promise<Release[]> {
    known.add(packageKey(ref));
    const versions = new Map<string, Release>();
    for (const source of sources) {
      const found = await source.releases(ref);
      if (!found.ok) {
        gaps.push(found.gap);
        continue;
      }
      for (const release of found.value) {
        if (!versions.has(release.version) && possible(release)) versions.set(release.version, release);
      }
    }
    return [...versions.values()];
  }

  /** Loads one listed release from its manifest, keeping the listing's bounds. */
  async function loadOne(release: Release): Promise<Release | undefined> {
    const key = packageKey(release.package);
    const gap = (url: string, reason: SourceGap['reason'], status?: number): undefined => {
      gaps.push({
        source: MANIFEST_SOURCE,
        url,
        reason,
        package: key,
        version: release.version,
        ...(status !== undefined && { status }),
      });
      return undefined;
    };
    if (release.manifest === undefined || release.package.type === 'world')
      return gap(release.manifest ?? release.origin, 'invalid');
    const fetched = await http.getJson(release.manifest, { maxAge: Infinity });
    if (!fetched.ok) return gap(fetched.gap.url, fetched.gap.reason, fetched.gap.status);
    const read = normaliseManifest(fetched.value, { origin: release.manifest, type: release.package.type });
    if (!read.ok || read.release.package.id !== release.package.id) return gap(release.manifest, 'invalid');
    // A manifest of another version than the one listed is not this release, but a leading "v" is
    // not another version: Foundry's listing gives `v1.1.4` as `1.1.4`. The release keeps the
    // listed version, so that it stays the release the solver asked for.
    if (bare(read.release.version) !== bare(release.version)) return gap(release.manifest, 'invalid');
    return { ...read.release, version: release.version, ...(release.listing && { listing: release.listing }) };
  }

  return {
    async universe(packages) {
      const releases = await Promise.all(packages.map(list));
      return { core, releases: releases.flat() };
    },

    async load(needs) {
      const loaded = (await Promise.all(needs.map(loadOne))).filter(release => release !== undefined);
      const named = new Map<PackageKey, PackageRef>();
      for (const release of loaded) {
        const { requires, systems } = release.relationships;
        for (const { package: ref } of [...requires, ...systems]) {
          if (ref.type !== 'world' && !known.has(packageKey(ref))) named.set(packageKey(ref), ref);
        }
      }
      const listed = await Promise.all([...named.values()].map(list));
      return [...loaded, ...listed.flat()];
    },

    gaps: () => [...gaps],
  };
}
