/**
 * Sets of versions of one package.
 *
 * A range is plain data, a union of intervals, so that it can be saved with a universe. The
 * operations on ranges need the package's {@link VersionOrder}, and come from {@link rangeOps}.
 */
import type { VersionOrder } from '../version/order.js';

/** One end of an interval. */
export interface Bound {
  readonly version: string;
  readonly inclusive: boolean;
}

/** The versions between two bounds; a missing bound leaves that end open. */
export interface Interval {
  readonly lower?: Bound;
  readonly upper?: Bound;
}

/**
 * A set of versions of one package: a union of intervals.
 *
 * Ranges made by {@link rangeOps} are normalised: their intervals are non-empty, sorted, and
 * neither overlap nor touch. So two ranges of the same versions have the same intervals.
 */
export interface Range {
  readonly intervals: readonly Interval[];
}

/** The operations on ranges of versions in one order. */
export interface RangeOps {
  /** Every version. */
  readonly any: Range;
  /** No version. */
  readonly none: Range;
  /** Exactly one version. */
  exactly(version: string): Range;
  /** The versions between two bounds; a missing bound leaves that end open. */
  between(lower: Bound | undefined, upper: Bound | undefined): Range;
  /** Whether `version` is in the range. */
  contains(range: Range, version: string): boolean;
  /** The versions in either range. */
  union(a: Range, b: Range): Range;
  /** The versions in both ranges. */
  intersect(a: Range, b: Range): Range;
  /** The versions not in the range. */
  complement(range: Range): Range;
  /** The versions in `a` but not in `b`. */
  difference(a: Range, b: Range): Range;
  /** Whether every version in `a` is in `b`. */
  isSubset(a: Range, b: Range): boolean;
  /** Whether the range has no versions. */
  isEmpty(range: Range): boolean;
  /** Whether the range has every version. */
  isAny(range: Range): boolean;
  /** Whether two ranges have the same versions. */
  equals(a: Range, b: Range): boolean;
}

/** Builds an interval, leaving out the bounds that are missing. */
function interval(lower: Bound | undefined, upper: Bound | undefined): Interval {
  return { ...(lower && { lower }), ...(upper && { upper }) };
}

/** The same version on the other side: the end of a gap that a bound begins. */
function flip(bound: Bound): Bound {
  return { version: bound.version, inclusive: !bound.inclusive };
}

/**
 * The operations on ranges of versions in `order`.
 *
 * Versions are taken to be dense: between any two versions there may be another, so an interval
 * that ends before `2.0` and one that starts after it do not touch.
 */
export function rangeOps(order: VersionOrder): RangeOps {
  /** Orders lower bounds; a missing one is lowest, and an inclusive one is lower than an exclusive one. */
  function compareLower(a: Bound | undefined, b: Bound | undefined): number {
    if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? -1 : 1;
    return order.compare(a.version, b.version) || (a.inclusive === b.inclusive ? 0 : a.inclusive ? -1 : 1);
  }

  /** Orders upper bounds; a missing one is highest, and an inclusive one is higher than an exclusive one. */
  function compareUpper(a: Bound | undefined, b: Bound | undefined): number {
    if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? 1 : -1;
    return order.compare(a.version, b.version) || (a.inclusive === b.inclusive ? 0 : a.inclusive ? 1 : -1);
  }

  /** Whether `version` is above `lower`. */
  function aboveLower(lower: Bound | undefined, version: string): boolean {
    if (lower === undefined) return true;
    const compared = order.compare(version, lower.version);
    return compared > 0 || (compared === 0 && lower.inclusive);
  }

  /** Whether `version` is below `upper`. */
  function belowUpper(upper: Bound | undefined, version: string): boolean {
    if (upper === undefined) return true;
    const compared = order.compare(version, upper.version);
    return compared < 0 || (compared === 0 && upper.inclusive);
  }

  function isEmptyInterval({ lower, upper }: Interval): boolean {
    if (lower === undefined || upper === undefined) return false;
    const compared = order.compare(lower.version, upper.version);
    return compared > 0 || (compared === 0 && !(lower.inclusive && upper.inclusive));
  }

  /** Whether an interval ending at `upper` overlaps or touches one starting at `lower`. */
  function joins(upper: Bound | undefined, lower: Bound | undefined): boolean {
    if (upper === undefined || lower === undefined) return true;
    const compared = order.compare(upper.version, lower.version);
    return compared > 0 || (compared === 0 && (upper.inclusive || lower.inclusive));
  }

  /** Sorts intervals, drops the empty ones, and merges those that overlap or touch. */
  function normalise(intervals: Interval[]): Range {
    const sorted = intervals.filter(i => !isEmptyInterval(i)).sort((a, b) => compareLower(a.lower, b.lower));
    const merged: Interval[] = [];
    for (const next of sorted) {
      const last = merged.at(-1);
      if (last !== undefined && joins(last.upper, next.lower)) {
        const upper = compareUpper(last.upper, next.upper) >= 0 ? last.upper : next.upper;
        merged[merged.length - 1] = interval(last.lower, upper);
      } else {
        merged.push(next);
      }
    }
    return { intervals: merged };
  }

  function intersect(a: Range, b: Range): Range {
    const pieces: Interval[] = [];
    for (const x of a.intervals) {
      for (const y of b.intervals) {
        const lower = compareLower(x.lower, y.lower) >= 0 ? x.lower : y.lower;
        const upper = compareUpper(x.upper, y.upper) <= 0 ? x.upper : y.upper;
        pieces.push(interval(lower, upper));
      }
    }
    return normalise(pieces);
  }

  /** The gaps between a normalised range's intervals, and before and after them. */
  function complement(range: Range): Range {
    const gaps: Interval[] = [];
    let start: Bound | undefined;
    for (const { lower, upper } of range.intervals) {
      if (lower !== undefined) gaps.push(interval(start, flip(lower)));
      if (upper === undefined) return normalise(gaps);
      start = flip(upper);
    }
    gaps.push(interval(start, undefined));
    return normalise(gaps);
  }

  const isEmpty = (range: Range) => range.intervals.length === 0;
  const difference = (a: Range, b: Range) => intersect(a, complement(b));

  return {
    any: { intervals: [{}] },
    none: { intervals: [] },
    exactly: version => ({ intervals: [{ lower: { version, inclusive: true }, upper: { version, inclusive: true } }] }),
    between: (lower, upper) => normalise([interval(lower, upper)]),
    contains: (range, version) =>
      range.intervals.some(({ lower, upper }) => aboveLower(lower, version) && belowUpper(upper, version)),
    union: (a, b) => normalise([...a.intervals, ...b.intervals]),
    intersect,
    complement,
    difference,
    isSubset: (a, b) => isEmpty(difference(a, b)),
    isEmpty,
    isAny: range => range.intervals.length === 1 && range.intervals.every(i => !i.lower && !i.upper),
    equals: (a, b) => isEmpty(difference(a, b)) && isEmpty(difference(b, a)),
  };
}
