/**
 * A set of sources, working together: building a universe from what they list, and loading
 * listed releases from their manifests as resolving in rounds needs them.
 */
import { normaliseManifest } from '../manifest/normalise.js';
import { packageKey } from '../universe.js';
import { isNewerVersion } from '../version/foundry.js';
import { namesVersion, sameVersion, unprefixed } from '../version/same.js';
import { tagVersion } from './repository.js';

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
  /**
   * Manifest URLs declared for packages, by package key, such as those in pdt's configuration. The
   * relationships of loaded releases declare more as they are loaded.
   */
  readonly manifests?: Readonly<Record<PackageKey, readonly string[]>>;
  /**
   * The source whose listing says which releases a package offers: Foundry VTT's index by default.
   */
  readonly listing?: string;
  /**
   * What to do with releases of a listed package, from other sources, that are newer than the newest
   * the listing offers, such as a line its author publishes on GitLab but not on Foundry VTT's
   * listing. Older ones always fill in its history, and a package not listed keeps every release.
   *
   * - `exclude` (the default): leave them out, as Foundry VTT's users cannot install them from it.
   * - `last`: keep them, marked `unlisted`, so that one is chosen only when no listed version fits.
   * - `include`: keep them as they are.
   */
  readonly unlisted?: 'exclude' | 'last' | 'include';
  /**
   * Whether a listed release with no core bounds, such as one from GitHub or GitLab, whose release
   * lists give none, takes them from its manifest when it is listed: `true` by default. It costs a
   * request for each such release, once, as its manifest is kept; loading it later costs none.
   * Without them, `check` gives such a release Foundry's `UNKNOWN` verdict, and `resolve` cannot
   * rule it out before loading it.
   */
  readonly manifestBounds?: boolean;
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

/**
 * Whether a manifest's version is that of the release listed: the same version, or the version a
 * tag gives, for a release listed from a tag such as `release-1.1.4`.
 */
const isListedVersion = (manifestVersion: string, listed: string) =>
  sameVersion(manifestVersion, listed) || tagVersion(manifestVersion) === listed;

/** A release's manifest URL for its version alone: the one it has, or its manifest URL if that names the version. */
const versionManifestOf = (release: Release): string | undefined =>
  release.versionManifest ??
  (release.manifest !== undefined && namesVersion(release.manifest, release.version) ? release.manifest : undefined);

/** Sources working together. */
export function sourceSet({
  sources,
  http,
  core,
  manifests = {},
  listing = 'foundry-index',
  unlisted = 'exclude',
  manifestBounds = true,
}: SourceSetOptions): SourceSet {
  const known = new Set<PackageKey>();
  const declared = new Map<PackageKey, Set<string>>(
    Object.entries(manifests).map(([key, urls]) => [key, new Set(urls)]),
  );
  const declare = (key: PackageKey, url: string | undefined) => {
    if (url !== undefined) declared.set(key, new Set([...(declared.get(key) ?? []), url]));
  };
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

  /**
   * Every release of a package that the sources list, the first source's where they list the same
   * version, a leading `v` aside. Each takes the first manifest URL for its version alone that any
   * source gives, so that a listing whose URL gives the newest release still gets a forge's.
   */
  async function list(ref: PackageRef): Promise<Release[]> {
    const key = packageKey(ref);
    known.add(key);
    const versions = new Map<string, Release>();
    // The manifest URLs earlier sources listed, which later sources may find the package by.
    const seen = new Set<string>();
    // The newest version the listing offers, if it lists the package.
    let newestListed: string | undefined;
    const fromListing = new Set<Release>();
    // The first manifest URL for each version alone, from any source.
    const versionManifests = new Map<string, string>();
    for (const source of sources) {
      const found = await source.releases(ref, { declared: [...(declared.get(key) ?? [])], seen: [...seen] });
      if (!found.ok) {
        gaps.push(found.gap);
        continue;
      }
      for (const release of found.value) {
        if (release.manifest !== undefined) seen.add(release.manifest);
        if (source.name === listing) {
          fromListing.add(release);
          if (newestListed === undefined || isNewerVersion(unprefixed(release.version), unprefixed(newestListed)))
            newestListed = release.version;
        }
        const version = unprefixed(release.version);
        const own = versionManifestOf(release);
        if (own !== undefined && !versionManifests.has(version)) versionManifests.set(version, own);
        if (!versions.has(version) && possible(release)) versions.set(version, release);
      }
    }
    const kept = [...versions.values()].flatMap((listed): Release[] => {
      const own = versionManifests.get(unprefixed(listed.version));
      const release = own === undefined ? listed : { ...listed, versionManifest: own };
      if (unlisted === 'include' || newestListed === undefined || fromListing.has(listed)) return [release];
      // A version the listing gives without a leading "v" is listed, however the source writes it.
      if (!isNewerVersion(unprefixed(release.version), unprefixed(newestListed))) return [release];
      return unlisted === 'last' ? [{ ...release, unlisted: true }] : [];
    });
    if (!manifestBounds) return kept;
    // With their bounds, releases no core of interest can run are left out, as listed ones are.
    return (await Promise.all(kept.map(withManifestBounds))).filter(possible);
  }

  /**
   * A listed release with no core bounds, with its manifest's. One whose manifest cannot be read is
   * marked so, as `resolveInRounds` marks one it cannot load, and is not asked for again.
   */
  async function withManifestBounds(release: Release): Promise<Release> {
    const { minimum, verified, maximum } = release.compatibility;
    if (release.detail !== 'listed' || minimum !== undefined || verified !== undefined || maximum !== undefined) {
      return release;
    }
    const read = await readListed(release);
    // Only the bounds: the release stays listed, its relationships unknown until it is loaded.
    return read === undefined ? { ...release, loadFailed: true } : { ...release, compatibility: read.compatibility };
  }

  /**
   * Loads one listed release from its manifest, keeping the listing's bounds, with a manifest URL
   * for its version alone if one can be found.
   */
  async function loadOne(release: Release): Promise<Release | undefined> {
    const read = await readListed(release);
    return read === undefined || read.versionManifest !== undefined ? read : withManifestBeside(read);
  }

  /**
   * A loaded release with the manifest beside its download, when that names the version and is of
   * this release. Releases on GitHub usually attach the manifest beside the zip, so that a release
   * whose sources give only a URL for the newest still gets its own. What cannot be found here is
   * not a gap: the release is loaded either way.
   */
  async function withManifestBeside(release: Release): Promise<Release> {
    let beside: string;
    try {
      beside = new URL(`${release.package.type}.json`, release.download).href;
    } catch {
      return release;
    }
    if (!namesVersion(beside, release.version)) return release;
    const fetched = await http.getJson(beside, { maxAge: Infinity });
    if (!fetched.ok) return release;
    const read = normaliseManifest(fetched.value, {
      origin: beside,
      type: release.package.type as 'module' | 'system',
    });
    if (
      !read.ok ||
      read.release.package.id !== release.package.id ||
      !isListedVersion(read.release.version, release.version)
    )
      return release;
    return { ...release, versionManifest: beside };
  }

  /** Reads one listed release from its manifest, keeping the listing's bounds. */
  async function readListed(release: Release): Promise<Release | undefined> {
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
    // not another version (Foundry's listing gives `v1.1.4` as `1.1.4`), nor is the text before the
    // number when the release was listed from a tag such as `release-1.1.4`. The release keeps the
    // listed version, so that it stays the release the solver asked for.
    if (!isListedVersion(read.release.version, release.version)) return gap(release.manifest, 'invalid');
    const own = versionManifestOf(release) ?? read.release.versionManifest;
    return {
      ...read.release,
      version: release.version,
      ...(own !== undefined && { versionManifest: own }),
      ...(release.listing && { listing: release.listing }),
      ...(release.unlisted === true && { unlisted: true }),
    };
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
        for (const { package: ref, manifest } of [...requires, ...systems]) {
          declare(packageKey(ref), manifest);
          if (ref.type !== 'world' && !known.has(packageKey(ref))) named.set(packageKey(ref), ref);
        }
      }
      const listed = await Promise.all([...named.values()].map(list));
      return [...loaded, ...listed.flat()];
    },

    gaps: () => [...gaps],
  };
}
