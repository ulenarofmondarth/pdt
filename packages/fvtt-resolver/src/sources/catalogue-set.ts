/**
 * The catalogue alone, as a source set: a client such as EMMA asks the catalogue for everything, in as few requests
 * as it can, and nothing else, whose releases the catalogue has loaded, so there is nothing left to load. It is a
 * {@link SourceSet}, so `resolveInRounds` and what else takes one take it as they take `sourceSet`; and it says what
 * the catalogue said of each package beside its releases: how fresh it is, what is pending, what could not be
 * reached. When the catalogue cannot be reached, nothing is found, and its gap says so: a client then has only what
 * is installed, and should say the catalogue is unreachable.
 */
import { packageKey } from '../universe.js';

import type {
  LookupPackage,
  LookupPackageRequest,
  OwnManifest,
  PendingPackage,
} from '@mondarth/fvtt-package-catalogue-contract';
import type { PackageRef, Release } from '../release.js';
import type { CoreRelease, PackageKey, Universe } from '../universe.js';
import type { Catalogue } from './catalogue.js';
import type { SourceSet } from './source-set.js';
import type { SourceGap, UnavailablePackage } from './types.js';

export interface CatalogueSetOptions {
  readonly catalogue: Catalogue;
  /**
   * The generation of Foundry VTT to look from: releases that cannot run on a build of it or later are left out, but
   * for the versions installed. Every release by default.
   */
  readonly fromGeneration?: number;
}

/** What the catalogue says of a package it holds, beside its releases. */
export interface CataloguePackage {
  readonly package: PackageRef;
  /** Its title, as Foundry VTT's listing gives it; null if it is not listed. */
  readonly title: string | null;
  /** The newest version, where Foundry VTT's listing gives it. */
  readonly latest: string | null;
  readonly premium: boolean;
  /** When its releases were last brought up to date, as an ISO 8601 time; null if never. */
  readonly syncedAt: string | null;
  /** What its own manifest last gave, and when it was read and checked. */
  readonly own: OwnManifest;
}

/** What a lookup found. */
export interface CatalogueLookup {
  /** Foundry VTT's builds and the releases found. */
  readonly universe: Universe;
  /** What the catalogue says of each package it holds that was looked up or needed, in the order it gave them. */
  readonly packages: readonly CataloguePackage[];
  /** The packages it does not hold yet: they are queued, so look them up again after `retryAfter` seconds. */
  readonly pending: readonly PendingPackage[];
}

export interface CatalogueSet extends SourceSet {
  /**
   * Looks up packages, with the versions installed and the manifest URLs they were installed from, by which a package
   * the catalogue does not hold is found. `universe` is this with only the packages.
   */
  lookUp(packages: readonly LookupPackageRequest[]): Promise<CatalogueLookup>;
  /** What the catalogue said of a package, by key, in the latest lookup that gave it. */
  packageOf(key: PackageKey): CataloguePackage | undefined;
  /** The packages pending in the latest lookup that named them, and not given by one since. */
  pending(): readonly PendingPackage[];
  /** The packages whose sources the catalogue could not all list, so may have newer versions it does not hold. */
  unreached(): readonly PackageRef[];
  /** Foundry VTT's builds, as the latest lookup gave them; none before one. */
  core(): readonly CoreRelease[];
}

const NOTHING: CatalogueLookup = { universe: { core: [], releases: [] }, packages: [], pending: [] };

/**
 * The catalogue alone, as a source set.
 *
 * @param options - The catalogue, and the generation to look from
 * @returns The set
 */
export function catalogueSet({ catalogue, fromGeneration }: CatalogueSetOptions): CatalogueSet {
  const gaps: SourceGap[] = [];
  const unavailable = new Map<PackageKey, UnavailablePackage>();
  const unreached = new Map<PackageKey, PackageRef>();
  const pending = new Map<PackageKey, PendingPackage>();
  const packages = new Map<PackageKey, CataloguePackage>();
  let core: readonly CoreRelease[] = [];

  async function lookUp(asked: readonly LookupPackageRequest[]): Promise<CatalogueLookup> {
    if (asked.length === 0) return NOTHING;
    const found = await catalogue.lookup({
      packages: [...asked],
      ...(fromGeneration !== undefined && { fromGeneration }),
    });
    if (!found.ok) {
      gaps.push(found.gap);
      return NOTHING;
    }
    const { value } = found;
    core = value.core;
    for (const gone of value.unavailable) unavailable.set(packageKey(gone.package), gone);
    for (const ref of value.unreached) unreached.set(packageKey(ref), ref);
    for (const queued of value.pending) pending.set(packageKey(queued.package), queued);
    const given = value.packages.map(describe);
    for (const pkg of given) {
      packages.set(packageKey(pkg.package), pkg);
      pending.delete(packageKey(pkg.package));
    }
    return {
      universe: { core: value.core, releases: value.packages.flatMap(releasesOf) },
      packages: given,
      pending: value.pending,
    };
  }

  return {
    lookUp,
    async universe(refs) {
      return (await lookUp(refs.map(({ type, id }) => ({ type, id })))).universe;
    },
    // The catalogue gives every release it could load, loaded: what it could not, nothing here can.
    load: () => Promise.resolve([]),
    gaps: () => [...gaps],
    unavailable: () => [...unavailable.values()],
    packageOf: key => packages.get(key),
    pending: () => [...pending.values()],
    unreached: () => [...unreached.values()],
    core: () => core,
  };
}

/** What the catalogue says of a package, beside its releases. */
function describe({ package: ref, title, latest, premium, syncedAt, own }: LookupPackage): CataloguePackage {
  return { package: ref, title, latest, premium, syncedAt, own };
}

/** A package's releases, each with its package, as the resolver reads them. */
function releasesOf({ package: ref, releases }: LookupPackage): Release[] {
  return releases.map(release => ({ ...release, package: ref }));
}
