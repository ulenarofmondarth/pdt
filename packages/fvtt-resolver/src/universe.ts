/**
 * The universe: every release the resolver may choose from, and how each package's versions are
 * ordered within it.
 */
import { chooseOrder } from './version/choose.js';
import { foundryDisagreements, foundryOrder } from './version/foundry.js';

import type { Override } from './declarations.js';
import type { Policy } from './policy.js';
import type { PackageRef, Release } from './release.js';
import type { VersionOrder } from './version/order.js';

/** The release channels of Foundry VTT's builds. */
export type CoreChannel = 'stable' | 'testing' | 'development' | 'prototype';

/** One Foundry VTT build. */
export interface CoreRelease {
  /** `<generation>.<build>`, such as `"14.368"`. */
  readonly version: string;
  readonly generation: number;
  readonly channel: CoreChannel;
}

/** Everything the solver may choose from. Plain data, so that it can be saved and replayed. */
export interface Universe {
  readonly core: readonly CoreRelease[];
  readonly releases: readonly Release[];
}

/**
 * A package as the solver names it: `core` for Foundry VTT itself, or `<type>:<id>` for a package,
 * such as `module:midi-qol`.
 */
export type PackageKey = string;

/** The key for Foundry VTT itself. */
export const CORE: PackageKey = 'core';

/** The key for a package. */
export function packageKey({ type, id }: PackageRef): PackageKey {
  return `${type}:${id}`;
}

/** Something about how a package's versions are ordered that a user may need to know. */
export type OrderWarning =
  /** SemVer was asked for, but these versions or bounds are not SemVer, so Foundry's order is used. */
  | { readonly code: 'semver-unreadable'; readonly package: PackageKey; readonly versions: readonly string[] }
  /** These pairs `[older, newer]` are ordered differently from Foundry VTT's own comparison. */
  | {
      readonly code: 'foundry-disagreement';
      readonly package: PackageKey;
      readonly pairs: readonly (readonly [string, string])[];
    };

/** How each package's versions are ordered in a universe. */
export interface Orders {
  /** The order for a package; Foundry's for a package the universe does not know. */
  orderOf(key: PackageKey): VersionOrder;
  readonly warnings: readonly OrderWarning[];
}

/**
 * Chooses how each package's versions are ordered.
 *
 * A package is ordered one way throughout, so the order is chosen from all its versions in the
 * universe and every bound that any release, or any override, places on it. Core is always in Foundry's order,
 * which for its all-numeric versions is exactly Foundry's.
 */
export function chooseOrders(
  universe: Universe,
  policy: Pick<Policy, 'versionOrder'>,
  overrides: readonly Override[] = [],
): Orders {
  const versions = new Map<PackageKey, string[]>();
  const bounds = new Map<PackageKey, string[]>();
  const add = (map: Map<PackageKey, string[]>, key: PackageKey, version: string | undefined) => {
    if (version === undefined) return;
    const listed = map.get(key);
    if (listed === undefined) map.set(key, [version]);
    else listed.push(version);
  };

  for (const release of universe.releases) {
    add(versions, packageKey(release.package), release.version);
    const { requires, systems, conflicts, recommends } = release.relationships;
    for (const relationship of [...requires, ...systems, ...conflicts, ...recommends]) {
      const key = packageKey(relationship.package);
      add(bounds, key, relationship.compatibility.minimum);
      add(bounds, key, relationship.compatibility.maximum);
      if (!versions.has(key)) versions.set(key, []);
    }
  }

  // An override's bounds must be readable in the order chosen, as a relationship's must.
  for (const override of overrides) {
    if (override.kind !== 'exclude' || override.with === undefined || override.with.package === CORE) continue;
    const { package: key, minimum, maximum } = override.with;
    add(bounds, key, minimum);
    add(bounds, key, maximum);
    if (!versions.has(key)) versions.set(key, []);
  }

  const orders = new Map<PackageKey, VersionOrder>();
  const unreadable = new Map<PackageKey, readonly string[]>();
  for (const [key, packageVersions] of versions) {
    const chosen = chooseOrder(policy.versionOrder, [...packageVersions, ...(bounds.get(key) ?? [])]);
    orders.set(key, chosen.order);
    if (chosen.unreadable.length > 0) unreadable.set(key, chosen.unreadable);
  }

  // The warnings compare every pair of each package's versions, which a universe with every version of many
  // packages makes slow, and `check` hands them on without reading them: so they are worked out when first read.
  let warnings: readonly OrderWarning[] | undefined;
  return {
    orderOf: key => orders.get(key) ?? foundryOrder,
    get warnings() {
      warnings ??= [...versions].flatMap(([key, packageVersions]): OrderWarning[] => {
        const found: OrderWarning[] = [];
        const versionsUnreadable = unreadable.get(key);
        if (versionsUnreadable !== undefined) {
          found.push({ code: 'semver-unreadable', package: key, versions: versionsUnreadable });
        }
        const pairs = orders.get(key) === foundryOrder ? foundryDisagreements(packageVersions) : [];
        if (pairs.length > 0) found.push({ code: 'foundry-disagreement', package: key, pairs });
        return found;
      });
      return warnings;
    },
  };
}
