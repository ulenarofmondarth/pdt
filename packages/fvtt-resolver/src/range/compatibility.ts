/**
 * Ranges from a manifest's `compatibility` blocks.
 *
 * Core bounds and relationship bounds are read differently, as Foundry VTT 14.368 reads them (see
 * the resolver's domain documentation).
 */
import { foundryOrder } from '../version/foundry.js';
import { rangeOps } from './range.js';

import type { VersionOrder } from '../version/order.js';
import type { Bound, Range } from './range.js';

/** A manifest's `compatibility` block, with its versions as strings. */
export interface Compatibility {
  readonly minimum?: string;
  readonly maximum?: string;
  readonly verified?: string;
}

/** How a relationship's bounds are read: the `relationshipBounds` policy. */
export type RelationshipBounds = 'foundry' | 'prefix';

const core = rangeOps(foundryOrder);

const inclusive = (version: string): Bound => ({ version, inclusive: true });
const exclusive = (version: string): Bound => ({ version, inclusive: false });

/**
 * The upper bound on core versions that a `maximum` or `verified` gives.
 *
 * A whole number names a generation, and admits every build of it: `"13"` (or `"13.0"`) admits
 * `13.351`, so the range ends before generation 14. Anything else admits up to that version.
 */
function coreUpper(bound: string): Bound {
  const generation = Number(bound);
  return Number.isInteger(generation) ? exclusive(String(generation + 1)) : inclusive(bound);
}

/**
 * The core versions a release works with, from its `minimum` and `maximum`.
 *
 * A `minimum` admits that version and everything after it, so `"13"` admits every 13.x build. A
 * `maximum` admits up to that version, or to the end of a generation it names. With neither, it
 * admits every core version (the `missingCompatibility: any` policy, which is Foundry's).
 */
export function coreRange({ minimum, maximum }: Compatibility): Range {
  return core.between(
    minimum === undefined ? undefined : inclusive(minimum),
    maximum === undefined ? undefined : coreUpper(maximum),
  );
}

/**
 * The core versions a release is verified on, from its `verified`, which is read like a `maximum`.
 *
 * @returns The range, or `undefined` when the release names no verified version
 */
export function coreVerifiedRange({ verified }: Compatibility): Range | undefined {
  return verified === undefined ? undefined : core.between(undefined, coreUpper(verified));
}

/**
 * The versions of a package a relationship admits, from the relationship's `minimum` and
 * `maximum`. Its `verified` is not read, as Foundry does not read it.
 *
 * Read as `foundry`, both bounds are exact: `maximum: "4"` admits `4` but not `4.1.0`. Read as
 * `prefix`, a `maximum` admits every version it is a prefix of: `"4"` admits every `4.x`. A
 * `maximum` that does not end in a number is read exactly either way.
 *
 * @param order - The order of the related package's versions
 * @returns The range, or `undefined` when `order` cannot read a bound
 */
export function relationshipRange(
  order: VersionOrder,
  { minimum, maximum }: Compatibility,
  reading: RelationshipBounds,
): Range | undefined {
  const lower = minimum === undefined ? undefined : order.read(minimum);
  const upper = maximum === undefined ? undefined : order.read(maximum);
  if ((minimum !== undefined && lower === undefined) || (maximum !== undefined && upper === undefined)) {
    return undefined;
  }
  const end = reading === 'prefix' && maximum !== undefined ? order.prefixEnd(maximum) : undefined;
  return rangeOps(order).between(
    lower === undefined ? undefined : inclusive(lower),
    end !== undefined ? exclusive(end) : upper === undefined ? undefined : inclusive(upper),
  );
}
