/**
 * Works out which versions of Foundry VTT, game systems and modules can be installed together.
 *
 * The core so far: how versions are ordered, sets of versions, reading manifests, the constraints
 * releases declare under a policy and the caller's declarations, resolving them into the best
 * setup, checking a setup, and explaining in words why there is no setup.
 *
 * @packageDocumentation
 */

/** The name this package is published under. */
export const packageName = '@mondarth/fvtt-resolver';

export type { VersionOrder } from './version/order.js';
export { foundryOrder, isNewerVersion, foundryDisagreements } from './version/foundry.js';
export { semverOrder } from './version/semver.js';
export { namesVersion, sameVersion } from './version/same.js';
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
  overridesFor,
  type CompatibilityOverride,
  type CoreLimit,
  type Declarations,
  type ExcludeOverride,
  type IndexedOverride,
  type Override,
  type RelationshipOverride,
} from './declarations.js';
export { resolveInRounds, type RoundsOptions, type RoundsResult } from './rounds.js';
export {
  coreCompatibility,
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
export {
  REQUIREMENTS,
  WORLD_SYSTEM,
  looksLikePrerelease,
  resolve,
  worldSystemVersion,
  type PackageVersion,
  type Reason,
  type Requirement,
  type Requirements,
  type Resolution,
  type ResolveOptions,
  type Setup,
} from './resolve.js';
export {
  AVAILABILITY,
  coreAvailability,
  isUnavailable,
  withinRelationship,
  type Availability,
} from './availability.js';
export { check, type CheckOptions, type CheckResult, type ReleaseCheck, type SetupSpec } from './check.js';
export {
  describeIncompatibility,
  describeReason,
  englishMessages,
  explain,
  explanationText,
  formatExplanation,
  type ExplanationLine,
  type ExplanationMessages,
} from './explain.js';
export type { Cause, Incompatibility } from './solver/solver.js';
export type { Term } from './solver/term.js';
