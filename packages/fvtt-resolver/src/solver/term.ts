/**
 * Terms: statements about one package that the solver reasons with.
 *
 * A positive term "P in R" holds when a version of P in R is chosen. A negative term "not P in R"
 * holds when no version of P in R is chosen, which includes choosing no version of P at all. So a
 * term stands for a set of states of its package: a version, or absent.
 */
import type { Range, RangeOps } from '../range/range.js';
import type { PackageKey } from '../universe.js';

export interface Term {
  readonly package: PackageKey;
  readonly range: Range;
  readonly positive: boolean;
}

/** How what is known about a package bears on a term. */
export type Relation = 'satisfied' | 'contradicted' | 'inconclusive';

/** The term that holds exactly when `term` does not. */
export function negate(term: Term): Term {
  return { ...term, positive: !term.positive };
}

/**
 * The operations on terms about packages whose versions are ordered by `opsOf`.
 *
 * Terms combined by these operations must be about the same package.
 */
export function termOps(opsOf: (key: PackageKey) => RangeOps) {
  /** The states both terms allow. */
  function intersect(a: Term, b: Term): Term {
    const ops = opsOf(a.package);
    const { package: key } = a;
    if (a.positive && b.positive) return { package: key, range: ops.intersect(a.range, b.range), positive: true };
    if (a.positive) return { package: key, range: ops.difference(a.range, b.range), positive: true };
    if (b.positive) return { package: key, range: ops.difference(b.range, a.range), positive: true };
    return { package: key, range: ops.union(a.range, b.range), positive: false };
  }

  /** Whether every state `a` allows, `b` allows too. */
  function isSubset(a: Term, b: Term): boolean {
    const ops = opsOf(a.package);
    if (a.positive && b.positive) return ops.isSubset(a.range, b.range);
    if (a.positive) return ops.isEmpty(ops.intersect(a.range, b.range));
    if (b.positive) return false;
    return ops.isSubset(b.range, a.range);
  }

  /** Whether no state is allowed by both. Both negative terms allow the package to be absent. */
  function isDisjoint(a: Term, b: Term): boolean {
    const ops = opsOf(a.package);
    if (a.positive && b.positive) return ops.isEmpty(ops.intersect(a.range, b.range));
    if (a.positive) return ops.isSubset(a.range, b.range);
    if (b.positive) return ops.isSubset(b.range, a.range);
    return false;
  }

  return {
    intersect,
    isSubset,
    isDisjoint,

    /** How `known`, everything known about a package, bears on `term`. */
    relation(known: Term, term: Term): Relation {
      if (isSubset(known, term)) return 'satisfied';
      if (isDisjoint(known, term)) return 'contradicted';
      return 'inconclusive';
    },

    /** The states `a` allows that `b` does not, or `undefined` when there are none. */
    difference(a: Term, b: Term): Term | undefined {
      const rest = intersect(a, negate(b));
      return rest.positive && opsOf(a.package).isEmpty(rest.range) ? undefined : rest;
    },
  };
}

export type TermOps = ReturnType<typeof termOps>;
