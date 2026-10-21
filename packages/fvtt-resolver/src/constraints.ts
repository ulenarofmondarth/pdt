/**
 * Constraints: what the solver must respect, built from releases under a policy.
 *
 * Hard constraints (dependencies, exclusions, choices, unusable releases) decide which setups are
 * valid. Soft ones (preferences, advisories) decide which valid setup is best, and what is reported.
 * Every constraint carries its provenance, so that an explanation can say where it came from.
 */
import { overridesFor } from './declarations.js';
import { coreRange, coreVerifiedRange, relationshipRange } from './range/compatibility.js';
import { rangeOps } from './range/range.js';
import { CORE, packageKey } from './universe.js';
import { foundryOrder } from './version/foundry.js';

import type { CompatibilityOverride, IndexedOverride, Override } from './declarations.js';
import type { Policy } from './policy.js';
import type { Compatibility } from './range/compatibility.js';
import type { Range } from './range/range.js';
import type { Relationship, Release } from './release.js';
import type { Orders, PackageKey } from './universe.js';

/** One release, as the solver names it. */
export interface ReleaseRef {
  readonly package: PackageKey;
  readonly version: string;
}

/**
 * Where a constraint came from: a field of a release's manifest, the policy setting that shaped it,
 * if any, and the override that declared or changed it, if any.
 */
export interface Provenance {
  /** Where the manifest was read from. */
  readonly origin: string;
  /**
   * The field of the normalised release, such as `compatibility` or `relationships.requires[0]`, or
   * the override that declared it, such as `overrides[2]`.
   */
  readonly field: string;
  readonly policy?: keyof Policy;
  /** The override that declared the constraint or changed its bounds: its place in the overrides, and its reason. */
  readonly override?: { readonly index: number; readonly reason: string };
}

interface Common {
  /** The release that declares it. */
  readonly from: ReleaseRef;
  readonly provenance: Provenance;
}

/** If `from` is used, `on` must be used, at a version in `range`. */
export interface Dependency extends Common {
  readonly kind: 'dependency';
  readonly on: PackageKey;
  readonly range: Range;
}

/** `from` and `on` at a version in `range` must not both be used. */
export interface Exclusion extends Common {
  readonly kind: 'exclusion';
  readonly on: PackageKey;
  readonly range: Range;
}

/** If `from` is used, the world's system must be one of the options, at a version in its range. */
export interface Choice extends Common {
  readonly kind: 'choice';
  readonly options: readonly { readonly on: PackageKey; readonly range: Range }[];
}

/** `from` cannot be used at all: it declares no core compatibility and the policy rejects that, or an override says so. */
export interface Unusable extends Common {
  readonly kind: 'unusable';
  readonly reason: 'missing-compatibility' | 'override';
}

/** If `from` and `on` are both used, a version of `on` in `range` is better. */
export interface Preference extends Common {
  readonly kind: 'preference';
  readonly reason: 'verified' | 'system-compatibility';
  readonly on: PackageKey;
  readonly range: Range;
}

/** Reported, but not enforced: a conflict the policy only warns about, or a recommendation. */
export interface Advisory extends Common {
  readonly kind: 'advisory';
  readonly reason: 'conflict' | 'recommends';
  readonly on: PackageKey;
  readonly range: Range;
}

export type Constraint = Dependency | Exclusion | Choice | Unusable | Preference | Advisory;

/** The order of each package's versions, the policy and the overrides that a release's constraints are built under. */
export interface ConstraintContext {
  readonly orders: Orders;
  readonly policy: Policy;
  readonly overrides?: readonly Override[];
}

/** Every version: the range of a system option whose own range is not enforced. */
const ANY = rangeOps(foundryOrder).any;

/**
 * The core compatibility a release is judged by: its manifest's, with the listing's `minimum` and
 * `verified` in their place when the release has them and the `listingCompatibility` policy
 * prefers them. The `maximum` is always the manifest's, since listings do not give one.
 */
export function coreCompatibility(
  release: Release,
  policy: Pick<Policy, 'listingCompatibility'>,
): { compatibility: Compatibility; fromListing: boolean } {
  const { listing } = release;
  if (policy.listingCompatibility !== 'prefer' || listing === undefined) {
    return { compatibility: release.compatibility, fromListing: false };
  }
  const { minimum, verified } = listing;
  if (minimum === undefined && verified === undefined)
    return { compatibility: release.compatibility, fromListing: false };
  return {
    compatibility: { ...release.compatibility, ...(minimum && { minimum }), ...(verified && { verified }) },
    fromListing: true,
  };
}

/** Compatibility with an override's bounds in place: a bound given replaces, `null` removes. */
function corrected(compatibility: Compatibility, bounds: CompatibilityOverride['compatibility']): Compatibility {
  const field = (name: 'minimum' | 'verified' | 'maximum') => {
    const bound = bounds[name] === undefined ? compatibility[name] : bounds[name];
    return bound === undefined || bound === null ? {} : { [name]: bound };
  };
  return { ...field('minimum'), ...field('verified'), ...field('maximum') };
}

/**
 * The constraints one release declares, under a policy, as the overrides correct them.
 *
 * @throws When a bound cannot be read in the order given for its package, which
 *   {@link chooseOrders} rules out: the orders do not belong to the release's universe
 */
export function releaseConstraints(
  release: Release,
  { orders, policy, overrides = [] }: ConstraintContext,
): Constraint[] {
  const from: ReleaseRef = { package: packageKey(release.package), version: release.version };
  const corrections = overridesFor(release, overrides);
  const provenance = (field: string, setting?: keyof Policy, by?: IndexedOverride): Provenance => ({
    origin: release.origin,
    field,
    ...(setting && { policy: setting }),
    ...(by && { override: { index: by.index, reason: by.override.reason } }),
  });
  const constraints: Constraint[] = [];

  /** The versions of `on` that bounds admit, read as a relationship's under the policy. */
  function boundsRange(on: PackageKey, bounds: Compatibility, field: string): Range {
    const range = relationshipRange(orders.orderOf(on), bounds, policy.relationshipBounds);
    if (range === undefined)
      throw new Error(`${field} of ${from.package}@${from.version}: a bound on ${on} cannot be read`);
    return range;
  }
  const rangeOf = (relationship: Relationship, field: string) =>
    boundsRange(packageKey(relationship.package), relationship.compatibility, field);

  // Overrides that exclude the release: from everything, or from another package's versions.
  for (const correction of corrections) {
    const { index, override } = correction;
    if (override.kind !== 'exclude') continue;
    const field = `overrides[${index}]`;
    if (override.with === undefined) {
      constraints.push({
        kind: 'unusable',
        reason: 'override',
        from,
        provenance: provenance(field, undefined, correction),
      });
      continue;
    }
    const { package: on, minimum, maximum } = override.with;
    const bounds = { ...(minimum !== undefined && { minimum }), ...(maximum !== undefined && { maximum }) };
    const range = on === CORE ? coreRange(bounds) : boundsRange(on, bounds, field);
    constraints.push({ kind: 'exclusion', from, on, range, provenance: provenance(field, undefined, correction) });
  }

  // Relationships an override says to ignore.
  const dropped = new Set(
    corrections.flatMap(({ override }) => (override.kind === 'relationship' ? [override.drop] : [])),
  );
  const kept = (relationship: Relationship) => !dropped.has(packageKey(relationship.package));

  // Core compatibility: the manifest's, or the listing's where the policy prefers it, as overrides correct it.
  const listed = coreCompatibility(release, policy);
  const { fromListing } = listed;
  let { compatibility } = listed;
  let coreOverride: IndexedOverride | undefined;
  for (const correction of corrections) {
    if (correction.override.kind !== 'compatibility') continue;
    compatibility = corrected(compatibility, correction.override.compatibility);
    coreOverride = correction;
  }
  const coreField = fromListing ? 'listing' : 'compatibility';
  const coreSetting = fromListing ? 'listingCompatibility' : undefined;
  if (
    compatibility.minimum === undefined &&
    compatibility.maximum === undefined &&
    compatibility.verified === undefined
  ) {
    if (policy.missingCompatibility === 'reject') {
      constraints.push({
        kind: 'unusable',
        reason: 'missing-compatibility',
        from,
        provenance: provenance('compatibility', 'missingCompatibility', coreOverride),
      });
    }
  }
  if (compatibility.minimum !== undefined || compatibility.maximum !== undefined) {
    constraints.push({
      kind: 'dependency',
      from,
      on: CORE,
      range: coreRange(compatibility),
      provenance: provenance(coreField, coreSetting, coreOverride),
    });
  }
  const verified = coreVerifiedRange(compatibility);
  if (verified !== undefined && policy.verified === 'prefer') {
    constraints.push({
      kind: 'preference',
      reason: 'verified',
      from,
      on: CORE,
      range: verified,
      provenance: provenance(fromListing ? 'listing.verified' : 'compatibility.verified', 'verified', coreOverride),
    });
  }
  if (verified !== undefined && policy.verified === 'require') {
    constraints.push({
      kind: 'dependency',
      from,
      on: CORE,
      range: verified,
      provenance: provenance(fromListing ? 'listing.verified' : 'compatibility.verified', 'verified', coreOverride),
    });
  }

  // Required modules. Foundry checks no other type of requirement.
  for (const [i, relationship] of release.relationships.requires.entries()) {
    if (relationship.package.type !== 'module' || !kept(relationship)) continue;
    const field = `relationships.requires[${i}]`;
    constraints.push({
      kind: 'dependency',
      from,
      on: packageKey(relationship.package),
      range: rangeOf(relationship, field),
      provenance: provenance(field),
    });
  }

  // Systems: the id is a hard choice; each entry's range is as the policy says.
  const systems = release.relationships.systems.flatMap((relationship, i) => {
    if (!kept(relationship)) return [];
    const field = `relationships.systems[${i}]`;
    return [{ on: packageKey(relationship.package), range: rangeOf(relationship, field), field }];
  });
  if (systems.length > 0) {
    const required = policy.systemCompatibility === 'require';
    constraints.push({
      kind: 'choice',
      from,
      options: systems.map(({ on, range }) => ({ on, range: required ? range : ANY })),
      provenance: provenance('relationships.systems', required ? 'systemCompatibility' : undefined),
    });
  }
  for (const { on, range, field } of systems) {
    if (policy.systemCompatibility !== 'prefer' || rangeOps(orders.orderOf(on)).isAny(range)) continue;
    constraints.push({
      kind: 'preference',
      reason: 'system-compatibility',
      from,
      on,
      range,
      provenance: provenance(field, 'systemCompatibility'),
    });
  }

  // Conflicts: excluded, or only reported.
  for (const [i, relationship] of release.relationships.conflicts.entries()) {
    if (!kept(relationship)) continue;
    const field = `relationships.conflicts[${i}]`;
    const on = packageKey(relationship.package);
    const range = rangeOf(relationship, field);
    constraints.push(
      policy.conflicts === 'enforce'
        ? { kind: 'exclusion', from, on, range, provenance: provenance(field) }
        : { kind: 'advisory', reason: 'conflict', from, on, range, provenance: provenance(field, 'conflicts') },
    );
  }

  // Recommendations are reported. Installing them is not built yet.
  for (const [i, relationship] of release.relationships.recommends.entries()) {
    if (!kept(relationship)) continue;
    const field = `relationships.recommends[${i}]`;
    constraints.push({
      kind: 'advisory',
      reason: 'recommends',
      from,
      on: packageKey(relationship.package),
      range: rangeOf(relationship, field),
      provenance: provenance(field),
    });
  }

  return constraints;
}

/** Every constraint the releases of a universe declare. */
export function universeConstraints(releases: readonly Release[], context: ConstraintContext): Constraint[] {
  return releases.flatMap(release => releaseConstraints(release, context));
}
