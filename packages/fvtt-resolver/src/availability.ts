/**
 * Foundry VTT's package availability: the verdict its setup screen shows for a package.
 *
 * Written from the rules of Foundry VTT 14.368 (`BasePackage.testAvailability` and the dependency
 * and system tests that follow it), not from its code. See the resolver's domain documentation.
 */
import { isNewerVersion } from './version/foundry.js';

import type { Compatibility } from './range/compatibility.js';
import type { CoreRelease } from './universe.js';

/** Foundry VTT's `CONST.PACKAGE_AVAILABILITY_CODES`, as in 14.368. */
export const AVAILABILITY = Object.freeze({
  UNKNOWN: 0,
  VERIFIED: 1,
  UNVERIFIED_BUILD: 2,
  UNVERIFIED_SYSTEM: 3,
  UNVERIFIED_GENERATION: 4,
  MISSING_SYSTEM: 5,
  MISSING_DEPENDENCY: 6,
  REQUIRES_CORE_DOWNGRADE: 7,
  REQUIRES_CORE_UPGRADE_STABLE: 8,
  REQUIRES_CORE_UPGRADE_UNSTABLE: 9,
  REQUIRES_CORE_UPGRADE_UNKNOWN: 10,
  REQUIRES_DEPENDENCY_UPDATE: 11,
});

export type Availability = (typeof AVAILABILITY)[keyof typeof AVAILABILITY];

/** Whether Foundry counts a package with this availability as unusable: any code above 4. */
export function isUnavailable(availability: Availability): boolean {
  return availability > AVAILABILITY.UNVERIFIED_GENERATION;
}

/** The generation a version names: its first part, as a number. */
const generationOf = (version: string) => Number(version.split('.')[0]);

/**
 * Whether `a` is newer than `b`, comparing only generations when `bound` is a whole number, as
 * Foundry reads a `maximum` or `verified` of `"13"` as all of generation 13.
 */
function isNewerThanBound(a: string, bound: string): boolean {
  return Number.isInteger(Number(bound))
    ? isNewerVersion(a.split('.')[0] as string, bound.split('.')[0] as string)
    : isNewerVersion(a, bound);
}

/**
 * A package's availability on a core release, from its core compatibility alone.
 *
 * In Foundry's order: a `minimum` the core is older than needs an upgrade, stable or not as the
 * known core releases say; a `maximum` it is newer than needs a downgrade; then `verified` decides
 * between verified and unverified. With none of them, the package's availability is unknown, which
 * Foundry still lets it be used with.
 *
 * @param core - The core release, such as `"14.368"`
 * @param known - The core releases known, which say which generations are stable
 */
export function coreAvailability(
  { minimum, maximum, verified }: Compatibility,
  core: string,
  known: readonly CoreRelease[],
): Availability {
  if (minimum !== undefined && isNewerVersion(minimum, core)) {
    const generation = generationOf(minimum);
    const generations = (releases: readonly CoreRelease[]) => Math.max(0, ...releases.map(r => r.generation));
    if (generation <= generations(known.filter(r => r.channel === 'stable'))) {
      return AVAILABILITY.REQUIRES_CORE_UPGRADE_STABLE;
    }
    return generation <= generations(known)
      ? AVAILABILITY.REQUIRES_CORE_UPGRADE_UNSTABLE
      : AVAILABILITY.REQUIRES_CORE_UPGRADE_UNKNOWN;
  }
  if (maximum !== undefined && isNewerThanBound(core, maximum)) return AVAILABILITY.REQUIRES_CORE_DOWNGRADE;
  if (verified !== undefined) {
    if (!isNewerThanBound(core, verified)) return AVAILABILITY.VERIFIED;
    return generationOf(core) === generationOf(verified)
      ? AVAILABILITY.UNVERIFIED_BUILD
      : AVAILABILITY.UNVERIFIED_GENERATION;
  }
  return AVAILABILITY.UNKNOWN;
}

/**
 * Whether a version is within a relationship's bounds, as Foundry tests a dependency or a system:
 * exactly, with no generation form, and without reading `verified`.
 */
export function withinRelationship({ minimum, maximum }: Compatibility, version: string): boolean {
  if (minimum !== undefined && isNewerVersion(minimum, version)) return false;
  return maximum === undefined || !isNewerVersion(version, maximum);
}
