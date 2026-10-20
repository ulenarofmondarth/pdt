/**
 * Works out which versions of Foundry VTT, game systems and modules can be installed together.
 *
 * This is the start of the core: how versions are ordered, and sets of versions.
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
