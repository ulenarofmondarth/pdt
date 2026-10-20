/**
 * Works out which versions of Foundry VTT, game systems and modules can be installed together.
 *
 * This is the start of the core: how versions are ordered, sets of versions, reading manifests,
 * and the constraints releases declare under a policy.
 *
 * @packageDocumentation
 */

/** The name this package is published under. */
export const packageName = '@mondarth/fvtt-resolver';

export type { VersionOrder } from './version/order.js';
export { foundryOrder, isNewerVersion, foundryDisagreements } from './version/foundry.js';
export { semverOrder } from './version/semver.js';
export { chooseOrder, type ChosenOrder, type VersionOrderName } from './version/choose.js';
export { rangeOps, type Bound, type Interval, type Range, type RangeOps } from './range/range.js';
export {
  coreRange,
  coreVerifiedRange,
  relationshipRange,
  type Compatibility,
  type RelationshipBounds,
} from './range/compatibility.js';
export type { PackageRef, PackageType, Relationship, Relationships, Release } from './release.js';
export {
  normaliseManifest,
  type ManifestProblem,
  type ManifestResult,
  type ManifestSource,
  type ManifestWarning,
} from './manifest/normalise.js';
export { DEFAULT_POLICY, withDefaults, type Policy } from './policy.js';
export {
  CORE,
  chooseOrders,
  packageKey,
  type CoreChannel,
  type CoreRelease,
  type OrderWarning,
  type Orders,
  type PackageKey,
  type Universe,
} from './universe.js';
export {
  releaseConstraints,
  universeConstraints,
  type Advisory,
  type Choice,
  type Constraint,
  type ConstraintContext,
  type Dependency,
  type Exclusion,
  type Preference,
  type Provenance,
  type ReleaseRef,
  type Unusable,
} from './constraints.js';
