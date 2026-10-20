/**
 * A version solver: the PubGrub algorithm (Natalie Weizenbaum, 2018), as described in the
 * documentation of Dart's pub (`doc/solver.md`).
 *
 * It knows nothing of Foundry VTT. It chooses at most one version of each package, so that no
 * incompatibility holds in full, starting from a root that must be chosen. When there is no such
 * choice, the incompatibility it derives to prove so is the explanation, as a tree whose leaves are
 * the incompatibilities it was given.
 */
import { rangeOps } from '../range/range.js';
import { negate, termOps } from './term.js';

import type { RangeOps } from '../range/range.js';
import type { PackageKey } from '../universe.js';
import type { VersionOrder } from '../version/order.js';
import type { Term } from './term.js';

/** Why an incompatibility holds. */
export type Cause<C> =
  /** The root must be chosen. */
  | { readonly kind: 'root' }
  /** No candidate version of the term's package is in its range. */
  | { readonly kind: 'no-versions' }
  /** Given by the provider, with its own data, such as the constraint it encodes. */
  | { readonly kind: 'external'; readonly data: C }
  /** Derived from two others during conflict resolution. */
  | { readonly kind: 'derived'; readonly conflict: Incompatibility<C>; readonly other: Incompatibility<C> };

/** A set of terms that cannot all hold. */
export interface Incompatibility<C> {
  readonly terms: readonly Term[];
  readonly cause: Cause<C>;
}

/** What the solver needs to know about the packages. */
export interface Provider<C> {
  /** How a package's versions are ordered. */
  orderOf(key: PackageKey): VersionOrder;
  /** The versions of a package that may be chosen, most preferred first. */
  versions(key: PackageKey): readonly string[];
  /**
   * What choosing a version brings: its dependencies, exclusions and so on, each as terms that
   * cannot all hold, one of them being the version itself.
   */
  incompatibilities(key: PackageKey, version: string): readonly { readonly terms: readonly Term[]; readonly data: C }[];
}

/** The outcome of solving. */
export type Solution<C> =
  | { readonly ok: true; readonly versions: ReadonlyMap<PackageKey, string> }
  /** The incompatibility that proves there is no solution: the root of the explanation. */
  | { readonly ok: false; readonly failure: Incompatibility<C> };

/** One step of the partial solution: a version decided on, or a term derived from an incompatibility. */
interface Assignment<C> {
  readonly term: Term;
  readonly decisionLevel: number;
  readonly index: number;
  /** The incompatibility it was derived from; none for a decision. */
  readonly cause?: Incompatibility<C>;
}

/**
 * Finds a version of each package needed, starting from the root.
 *
 * @param provider - The packages' versions and incompatibilities
 * @param root - The package that must be chosen, at the one version given
 */
export function solve<C>(provider: Provider<C>, root: { package: PackageKey; version: string }): Solution<C> {
  const opsCache = new Map<PackageKey, RangeOps>();
  const opsOf = (key: PackageKey): RangeOps => {
    let ops = opsCache.get(key);
    if (ops === undefined) {
      ops = rangeOps(provider.orderOf(key));
      opsCache.set(key, ops);
    }
    return ops;
  };
  const terms = termOps(opsOf);

  /** The incompatibilities known, by each package they mention. */
  const incompatibilities = new Map<PackageKey, Incompatibility<C>[]>();
  const about = (key: PackageKey) => incompatibilities.get(key) ?? [];
  /** The incompatibilities each version brings, asked for once. */
  const brought = new Map<string, Incompatibility<C>[]>();

  // The partial solution.
  const assignments: Assignment<C>[] = [];
  const decisions = new Map<PackageKey, string>();
  const positive = new Map<PackageKey, Term>();
  const negative = new Map<PackageKey, Term>();

  /** Makes an incompatibility, merging terms about the same package. */
  function incompatibility(given: readonly Term[], cause: Cause<C>): Incompatibility<C> {
    // The root is always chosen, so a derived incompatibility need not say so.
    const relevant =
      cause.kind === 'derived' && given.length > 1
        ? given.filter(term => !(term.positive && term.package === root.package))
        : given;
    const merged = new Map<PackageKey, Term>();
    for (const term of relevant) {
      const existing = merged.get(term.package);
      merged.set(term.package, existing === undefined ? term : terms.intersect(existing, term));
    }
    return { terms: [...merged.values()], cause };
  }

  function addIncompatibility(added: Incompatibility<C>): void {
    for (const term of added.terms) {
      incompatibilities.set(term.package, [...about(term.package), added]);
    }
  }

  function register(term: Term): void {
    const known = positive.get(term.package);
    if (known !== undefined) {
      positive.set(term.package, terms.intersect(known, term));
      return;
    }
    const excluded = negative.get(term.package);
    const combined = excluded === undefined ? term : terms.intersect(term, excluded);
    if (combined.positive) {
      negative.delete(term.package);
      positive.set(term.package, combined);
    } else {
      negative.set(term.package, combined);
    }
  }

  function assign(term: Term, cause?: Incompatibility<C>): void {
    const assignment = { term, decisionLevel: decisions.size, index: assignments.length, ...(cause && { cause }) };
    assignments.push(assignment);
    register(term);
  }

  function relation(term: Term): 'satisfied' | 'contradicted' | 'inconclusive' {
    const known = positive.get(term.package) ?? negative.get(term.package);
    return known === undefined ? 'inconclusive' : terms.relation(known, term);
  }

  /** The earliest assignment after which `term` is satisfied. */
  function satisfier(term: Term): Assignment<C> {
    let known: Term | undefined;
    for (const assignment of assignments) {
      if (assignment.term.package !== term.package) continue;
      known = known === undefined ? assignment.term : terms.intersect(known, assignment.term);
      if (terms.isSubset(known, term)) return assignment;
    }
    /* v8 ignore next -- conflict resolution only asks about terms the partial solution satisfies */
    throw new Error(`Nothing satisfies a term on ${term.package}`);
  }

  function backtrack(level: number): void {
    const undone = new Set<PackageKey>();
    while (assignments.length > 0 && (assignments[assignments.length - 1] as Assignment<C>).decisionLevel > level) {
      const removed = assignments.pop() as Assignment<C>;
      undone.add(removed.term.package);
      if (removed.cause === undefined) decisions.delete(removed.term.package);
    }
    for (const key of undone) {
      positive.delete(key);
      negative.delete(key);
    }
    for (const assignment of assignments) {
      if (undone.has(assignment.term.package)) register(assignment.term);
    }
  }

  const isFailure = ({ terms: found }: Incompatibility<C>) => {
    const [first] = found;
    return first === undefined || (found.length === 1 && first.positive && first.package === root.package);
  };

  /**
   * Derives, from an incompatibility that the partial solution satisfies, one it does not, by
   * resolving it against the causes of its satisfiers; then backtracks to where the new one
   * becomes almost satisfied.
   *
   * @returns The new incompatibility, or a failure when it proves there is no solution
   */
  function resolveConflict(conflict: Incompatibility<C>): Incompatibility<C> | { failure: Incompatibility<C> } {
    let current = conflict;
    let derived = false;
    while (!isFailure(current)) {
      let mostRecentTerm: Term | undefined;
      let mostRecentSatisfier: Assignment<C> | undefined;
      let difference: Term | undefined;
      let previousLevel = 1;

      for (const term of current.terms) {
        const found = satisfier(term);
        if (mostRecentSatisfier === undefined || mostRecentSatisfier.index < found.index) {
          if (mostRecentSatisfier !== undefined) {
            previousLevel = Math.max(previousLevel, mostRecentSatisfier.decisionLevel);
          }
          mostRecentTerm = term;
          mostRecentSatisfier = found;
          // The satisfier may satisfy the term only together with an earlier assignment.
          difference = terms.difference(found.term, term);
          if (difference !== undefined) {
            previousLevel = Math.max(previousLevel, satisfier(negate(difference)).decisionLevel);
          }
        } else {
          previousLevel = Math.max(previousLevel, found.decisionLevel);
        }
      }

      const term = mostRecentTerm as Term;
      const satisfying = mostRecentSatisfier as Assignment<C>;
      if (previousLevel < satisfying.decisionLevel || satisfying.cause === undefined) {
        backtrack(previousLevel);
        if (derived) addIncompatibility(current);
        return current;
      }

      const priorCause = satisfying.cause;
      const combined = [
        ...current.terms.filter(t => t !== term),
        ...priorCause.terms.filter(t => t.package !== satisfying.term.package),
        ...(difference === undefined ? [] : [negate(difference)]),
      ];
      current = incompatibility(combined, { kind: 'derived', conflict: current, other: priorCause });
      derived = true;
    }
    return { failure: current };
  }

  /**
   * Derives what follows from the incompatibilities about a package, and from what that changes.
   *
   * @returns A failure when there is no solution
   */
  function propagate(start: PackageKey): Incompatibility<C> | undefined {
    const changed = [start];
    while (changed.length > 0) {
      const key = changed.pop() as PackageKey;
      const known = about(key);
      for (let i = known.length - 1; i >= 0; i--) {
        const incompat = known[i] as Incompatibility<C>;
        const result = propagateIncompatibility(incompat);
        if (result === 'conflict') {
          const resolved = resolveConflict(incompat);
          if ('failure' in resolved) return resolved.failure;
          changed.length = 0;
          changed.push(propagateIncompatibility(resolved) as PackageKey);
          break;
        }
        if (result !== undefined) changed.push(result);
      }
    }
    return undefined;
  }

  /**
   * When all but one of an incompatibility's terms are satisfied, derives that the last one is not.
   *
   * @returns The package derived about, `'conflict'` when every term is satisfied, or nothing
   */
  function propagateIncompatibility(incompat: Incompatibility<C>): PackageKey | 'conflict' | undefined {
    let unsatisfied: Term | undefined;
    for (const term of incompat.terms) {
      const found = relation(term);
      if (found === 'contradicted') return undefined;
      if (found === 'inconclusive') {
        if (unsatisfied !== undefined) return undefined;
        unsatisfied = term;
      }
    }
    if (unsatisfied === undefined) return 'conflict';
    assign(negate(unsatisfied), incompat);
    return unsatisfied.package;
  }

  /**
   * Decides on a version of a package that must be chosen and is not yet, preferring the package
   * with the fewest versions left, so that a dead end is found early.
   *
   * @returns The package decided on or learned about, or nothing when every package is decided
   */
  function decide(): PackageKey | undefined {
    let chosen: { key: PackageKey; versions: string[] } | undefined;
    for (const [key, term] of positive) {
      if (decisions.has(key)) continue;
      const ops = opsOf(key);
      const candidates = key === root.package ? [root.version] : provider.versions(key);
      const versions = candidates.filter(version => ops.contains(term.range, version));
      if (chosen === undefined || versions.length < chosen.versions.length) chosen = { key, versions };
    }
    if (chosen === undefined) return undefined;

    const { key, versions } = chosen;
    const term = positive.get(key) as Term;
    const [version] = versions;
    if (version === undefined) {
      addIncompatibility(incompatibility([term], { kind: 'no-versions' }));
      return key;
    }

    let incompats = brought.get(`${key}@${version}`);
    if (incompats === undefined) {
      incompats = provider
        .incompatibilities(key, version)
        .map(({ terms: given, data }) => incompatibility(given, { kind: 'external', data }));
      incompats.forEach(addIncompatibility);
      brought.set(`${key}@${version}`, incompats);
    }
    // Deciding on a version whose incompatibilities already hold would only be undone. One with a
    // term no state allows, such as a version depending on a range of its own package that
    // includes it, can never hold.
    const conflicts = incompats.some(
      added =>
        !added.terms.some(t => t.positive && opsOf(t.package).isEmpty(t.range)) &&
        added.terms.every(t => t.package === key || relation(t) === 'satisfied'),
    );
    if (!conflicts) {
      decisions.set(key, version);
      assign({ package: key, range: opsOf(key).exactly(version), positive: true });
    }
    return key;
  }

  addIncompatibility(
    incompatibility([{ package: root.package, range: opsOf(root.package).exactly(root.version), positive: false }], {
      kind: 'root',
    }),
  );
  let next: PackageKey | undefined = root.package;
  while (next !== undefined) {
    const failure = propagate(next);
    if (failure !== undefined) return { ok: false, failure };
    next = decide();
  }
  return { ok: true, versions: new Map(decisions) };
}
