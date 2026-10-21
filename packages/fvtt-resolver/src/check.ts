/**
 * Check: is this setup valid? For a core release, a system release and module releases, as one
 * world would use them, it gives each release Foundry VTT's verdict, and what the resolver finds:
 * every hard constraint the setup breaks, every preference it misses, and every advisory that
 * applies, with the caller's overrides, and whether the caller can run its core. The resolver is
 * stricter than Foundry, so a setup Foundry would allow can be invalid.
 */
import { AVAILABILITY, coreAvailability, isUnavailable, withinRelationship } from './availability.js';
import { coreCompatibility, releaseConstraints } from './constraints.js';
import { withDefaults } from './policy.js';
import { rangeOps } from './range/range.js';
import { CORE, chooseOrders, packageKey } from './universe.js';
import { sameVersion } from './version/same.js';

import type { Availability } from './availability.js';
import type { Advisory, Constraint, Preference } from './constraints.js';
import type { CoreLimit, Declarations } from './declarations.js';
import type { Policy } from './policy.js';
import type { Range } from './range/range.js';
import type { Release } from './release.js';
import type { PackageVersion } from './resolve.js';
import type { OrderWarning, PackageKey, Universe } from './universe.js';

/** A setup to check: the versions of its core, its system and its modules. */
export interface SetupSpec {
  readonly core: string;
  readonly system: PackageVersion;
  readonly modules?: readonly PackageVersion[];
}

/** What checking found about one release in the setup. */
export interface ReleaseCheck {
  readonly release: Release;
  /** The verdict Foundry VTT's setup screen would give it. */
  readonly availability: Availability;
  /** The hard constraints of the release that the setup breaks. */
  readonly broken: readonly Constraint[];
  /** The preferences of the release that the setup does not meet. */
  readonly missed: readonly Preference[];
  /** The advisories of the release that apply: a conflict only warned about, a recommendation not installed. */
  readonly advisories: readonly Advisory[];
}

export interface CheckResult {
  /** Whether every release is known, no hard constraint is broken, and the caller can run the core. */
  readonly valid: boolean;
  readonly releases: readonly ReleaseCheck[];
  /** The versions in the setup that the universe has no release of, so cannot be checked. */
  readonly unknown: readonly PackageVersion[];
  /**
   * The versions in the setup known only from a listing, so checked without their relationships
   * or `maximum`: those not yet loaded, and those whose manifest could not be loaded (`loadFailed`).
   * Load them for a full check.
   */
  readonly listed: readonly PackageVersion[];
  readonly warnings: readonly OrderWarning[];
  /** The core limits the setup's core build is under: empty when the caller can run it. */
  readonly coreLimits: readonly CoreLimit[];
}

export interface CheckOptions {
  readonly policy?: Partial<Policy>;
  /**
   * Overrides and core limits, beyond what the manifests declare. Overrides change what the resolver
   * finds, not Foundry's verdicts: Foundry knows nothing of them.
   */
  readonly declarations?: Declarations;
}

/**
 * Checks a setup.
 *
 * Foundry's verdicts follow its rules in its order: the core bounds; then `MISSING_DEPENDENCY` when
 * a required module is absent, outside the required range or itself unusable on this core; then,
 * for a module, `UNVERIFIED_SYSTEM` when the setup's system is not one it lists, or is outside the
 * listed range. Foundry also uses a dependency's own verdict after that dependency's dependencies
 * are tested, which depends on the order it loads packages in; this uses the dependency's verdict
 * from its core bounds, so the answer does not depend on order. The world verdicts,
 * `MISSING_SYSTEM` and `REQUIRES_DEPENDENCY_UPDATE`, need a world manifest, and are not given.
 */
export function check(universe: Universe, setup: SetupSpec, options: CheckOptions = {}): CheckResult {
  const policy = withDefaults(options.policy);
  const { overrides = [], coreLimits = [] } = options.declarations ?? {};
  const orders = chooseOrders(universe, policy, overrides);

  const wanted = [setup.system, ...(setup.modules ?? [])];
  const releaseOf = ({ package: key, version }: PackageVersion) =>
    universe.releases.find(release => packageKey(release.package) === key && sameVersion(release.version, version));
  const releases = wanted.flatMap(spec => {
    const release = releaseOf(spec);
    return release === undefined ? [] : [release];
  });
  const unknown = wanted.filter(spec => releaseOf(spec) === undefined);

  // Each version as its release writes it, which may differ by a leading "v" from the setup's.
  const chosen = new Map<PackageKey, string>([
    [CORE, setup.core],
    ...wanted.map(s => [s.package, releaseOf(s)?.version ?? s.version] as const),
  ]);
  /** Whether the setup has a version of a package in a range. */
  const has = (key: PackageKey, range: Range) => {
    const version = chosen.get(key);
    return version !== undefined && rangeOps(orders.orderOf(key)).contains(range, version);
  };

  const coreOnly = new Map(
    releases.map(r => [
      packageKey(r.package),
      coreAvailability(coreCompatibility(r, policy).compatibility, setup.core, universe.core),
    ]),
  );
  const systemRelease = releases.find(release => release.package.type === 'system');

  function availability(release: Release): Availability {
    let found = coreOnly.get(packageKey(release.package)) as Availability;
    const dependenciesMet = release.relationships.requires.every(({ package: required, compatibility }) => {
      if (required.type !== 'module') return true;
      const version = chosen.get(packageKey(required));
      if (version === undefined || !withinRelationship(compatibility, version)) return false;
      return !isUnavailable(coreOnly.get(packageKey(required)) as Availability);
    });
    if (!dependenciesMet) found = AVAILABILITY.MISSING_DEPENDENCY;
    const { systems } = release.relationships;
    if (release.package.type === 'module' && systems.length > 0) {
      const listed = systems.find(s => systemRelease !== undefined && s.package.id === systemRelease.package.id);
      const supported =
        listed !== undefined &&
        systemRelease !== undefined &&
        withinRelationship(listed.compatibility, systemRelease.version) &&
        !isUnavailable(coreOnly.get(packageKey(systemRelease.package)) as Availability);
      if (!supported) found = AVAILABILITY.UNVERIFIED_SYSTEM;
    }
    return found;
  }

  function isBroken(constraint: Constraint): boolean {
    switch (constraint.kind) {
      case 'dependency':
        return !has(constraint.on, constraint.range);
      case 'exclusion':
        return has(constraint.on, constraint.range);
      case 'choice':
        return !constraint.options.some(option => has(option.on, option.range));
      case 'unusable':
        return true;
      default:
        return false;
    }
  }

  const checked = releases.map((release): ReleaseCheck => {
    const constraints = releaseConstraints(release, { orders, policy, overrides });
    return {
      release,
      availability: availability(release),
      broken: constraints.filter(isBroken),
      missed: constraints.filter(
        (c): c is Preference => c.kind === 'preference' && chosen.has(c.on) && !has(c.on, c.range),
      ),
      advisories: constraints.filter(
        (c): c is Advisory =>
          c.kind === 'advisory' && (c.reason === 'conflict' ? has(c.on, c.range) : !chosen.has(c.on)),
      ),
    };
  });

  const limits = coreLimits.filter(limit => limit.version === setup.core);
  return {
    valid: unknown.length === 0 && limits.length === 0 && checked.every(c => c.broken.length === 0),
    releases: checked,
    unknown,
    listed: releases
      .filter(release => release.detail === 'listed')
      .map(release => ({ package: packageKey(release.package), version: release.version })),
    warnings: orders.warnings,
    coreLimits: limits,
  };
}
