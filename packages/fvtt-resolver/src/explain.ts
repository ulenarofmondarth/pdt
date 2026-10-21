/**
 * Explanations in words: why there is no valid setup.
 *
 * The solver proves there is none by deriving an incompatibility, and keeps how. This walks that
 * derivation as pub's documentation describes for its error reports, writing a sentence for each
 * step and numbering the steps that later steps refer back to. The wording comes from an
 * {@link ExplanationMessages} object, so that a caller can replace it, for example to translate it;
 * {@link englishMessages} is the default.
 */
import { REQUIREMENTS } from './resolve.js';
import { CORE } from './universe.js';
import { SYSTEM_END, SYSTEM_START, WORLD_SYSTEM, splitWorldSystem } from './world-system.js';

import type { Constraint } from './constraints.js';
import type { Bound, Interval, Range } from './range/range.js';
import type { Reason } from './resolve.js';
import type { Incompatibility } from './solver/solver.js';
import type { Term } from './solver/term.js';
import type { PackageKey } from './universe.js';

/** One sentence of an explanation, numbered when a later sentence refers back to it. */
export interface ExplanationLine {
  readonly text: string;
  readonly number?: number;
}

/**
 * The wording of explanations. Every phrase is a function of the phrases inside it, so that word
 * order can follow the language. Versions arrive already written, as `"14.0.18 or later"`.
 */
export interface ExplanationMessages {
  /** A package by its key: `core`, `module:midi-qol`, `system:dnd5e`. */
  name(key: PackageKey): string;
  /** A package in a set of versions, such as `"dae 14.0.18 or later"`; all versions when `versions` is missing. */
  term(name: string, versions?: string): string;
  /** A world whose system is one of these, such as `"dnd5e 5.3.0 to 5.9.99"`; any system when missing. */
  world(systems?: string): string;
  /** A system and some of its versions, as the world's system; any version when `versions` is missing. */
  system(id: string, versions?: string): string;

  exactly(version: string): string;
  from(version: string, inclusive: boolean): string;
  to(version: string, inclusive: boolean): string;
  between(lower: string, lowerInclusive: boolean, upper: string, upperInclusive: boolean): string;
  /** Every version but these. */
  otherThan(versions: string): string;
  /** Every system but these. */
  otherSystems(systems: string): string;
  none: string;
  or(parts: readonly string[]): string;

  /** The reasons the resolver gives the solver. */
  dependsOn(release: string, on: string): string;
  conflictsWith(release: string, on: string): string;
  runsIn(release: string, systems: string): string;
  unusable(release: string): string;
  /** An override's reasons: a release that cannot be used at all, or with `on`. */
  excluded(release: string, reason: string): string;
  excludedWith(release: string, on: string, reason: string): string;
  /** A reason that leans on an override that changed a release's bounds. */
  overridden(text: string, reason: string): string;
  /** A core build the caller cannot run. */
  coreLimit(core: string, reason: string): string;
  requirement(on: string): string;
  pin(on: string): string;
  setupNeeds(what: string): string;
  worldSystem(system: string): string;
  noVersions(term: string): string;
  noSystem(systems?: string): string;

  /** What follows: the shapes a derived incompatibility can have. */
  failed: string;
  wanted: string;
  forbidden(term: string): string;
  needed(term: string): string;
  needs(term: string, needed: string): string;
  requirementsNeed(needed: string): string;
  incompatible(a: string, b: string): string;
  either(terms: readonly string[]): string;
  ifThen(given: readonly string[], then: readonly string[]): string;

  /** Sentences. `so` is true for a conclusion that later sentences may refer back to. */
  because(a: string, b: string, conclusion: string): string;
  andBecause(a: string, conclusion: string, so: boolean): string;
  andBecauseBoth(a: string, b: string, conclusion: string, so: boolean): string;
  thus(conclusion: string): string;
  /** A phrase on its own, as a sentence. */
  sentence(text: string): string;
  /** A phrase that refers back to a numbered sentence. */
  see(phrase: string, number: number): string;
}

const list = (parts: readonly string[], word: string) =>
  parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} ${word} ${parts.slice(-1).join('')}`;

/** The default, English wording. */
export const englishMessages: ExplanationMessages = {
  name(key) {
    if (key === CORE) return 'Foundry VTT';
    if (key === REQUIREMENTS) return 'the requirements';
    if (key === WORLD_SYSTEM) return 'the world’s system';
    const colon = key.indexOf(':');
    return colon === -1 ? key : key.slice(colon + 1);
  },
  term: (name, versions) => (versions === undefined ? name : `${name} ${versions}`),
  world: systems => (systems === undefined ? 'a world with a system' : `a world with ${systems}`),
  system: (id, versions) => (versions === undefined ? id : `${id} ${versions}`),

  exactly: version => version,
  from: (version, inclusive) => (inclusive ? `${version} or later` : `later than ${version}`),
  to: (version, inclusive) => (inclusive ? `${version} or earlier` : `earlier than ${version}`),
  between: (lower, lowerInclusive, upper, upperInclusive) =>
    `${lowerInclusive ? lower : `after ${lower}`} ${upperInclusive ? 'to' : 'up to but not including'} ${upper}`,
  otherThan: versions => `other than ${versions}`,
  otherSystems: systems => `a system other than ${systems}`,
  none: 'no version',
  or: parts => list(parts, 'or'),

  dependsOn: (release, on) => `${release} depends on ${on}`,
  conflictsWith: (release, on) => `${release} conflicts with ${on}`,
  runsIn: (release, systems) => `${release} runs only in ${systems}`,
  unusable: release => `${release} declares no Foundry VTT compatibility, which the policy does not accept`,
  excluded: (release, reason) => `${release} cannot be used (override: ${reason})`,
  excludedWith: (release, on, reason) => `${release} cannot be used with ${on} (override: ${reason})`,
  overridden: (text, reason) => `${text} (override: ${reason})`,
  coreLimit: (core, reason) => `${core} cannot be used: ${reason}`,
  requirement: on => `the requirements need ${on}`,
  pin: on => `${on} is pinned`,
  setupNeeds: what => `a setup needs ${what}`,
  worldSystem: system => `${system} is the world’s system exactly when it is installed`,
  noVersions: term => `no version of ${term} is available`,
  noSystem: systems => (systems === undefined ? 'no system is available' : `no system in ${systems} is available`),

  failed: 'the requirements cannot be met',
  wanted: 'the requirements are wanted',
  forbidden: term => `${term} cannot be used`,
  needed: term => `${term} is needed`,
  needs: (term, needed) => `${term} needs ${needed}`,
  requirementsNeed: needed => `the requirements need ${needed}`,
  incompatible: (a, b) => `${a} cannot be used with ${b}`,
  either: terms => `either ${list(terms, 'or')} is needed`,
  ifThen: (given, then) => `if ${list(given, 'and')} are used, then ${list(then, 'or')} is needed`,

  because: (a, b, conclusion) => `Because ${a} and ${b}, ${conclusion}.`,
  andBecause: (a, conclusion, so) => `${so ? 'So, because' : 'And because'} ${a}, ${conclusion}.`,
  andBecauseBoth: (a, b, conclusion, so) => `${so ? 'So, because' : 'And because'} ${a} and ${b}, ${conclusion}.`,
  thus: conclusion => `Thus, ${conclusion}.`,
  sentence: text => `${text.charAt(0).toUpperCase()}${text.slice(1)}.`,
  see: (phrase, number) => `${phrase} (${number})`,
};

/** Writes sets of versions, packages and terms in a message set's words. */
function wording(messages: ExplanationMessages) {
  const interval = ({ lower, upper }: Interval, show: (bound: Bound) => string): string | undefined => {
    if (lower === undefined && upper === undefined) return undefined;
    if (lower === undefined) return messages.to(show(upper as Bound), (upper as Bound).inclusive);
    if (upper === undefined) return messages.from(show(lower), lower.inclusive);
    if (lower.version === upper.version) return messages.exactly(show(lower));
    return messages.between(show(lower), lower.inclusive, show(upper), upper.inclusive);
  };

  /**
   * A range in words, from the words for each of its intervals, or `undefined` for every version.
   * A range open at both ends with gaps in it is written as what it leaves out: "other than 2".
   */
  function described(
    range: Range,
    part: (interval: Interval) => string | undefined,
    otherThan: (gaps: string) => string,
  ) {
    const { intervals } = range;
    const first = intervals[0];
    const last = intervals.at(-1);
    if (first === undefined || last === undefined) return messages.none;
    if (intervals.length > 1 && first.lower === undefined && last.upper === undefined) {
      const gaps = intervals.slice(1).map((next, i) => ({
        lower: { ...(intervals[i]?.upper as Bound), inclusive: !(intervals[i]?.upper as Bound).inclusive },
        upper: { ...(next.lower as Bound), inclusive: !(next.lower as Bound).inclusive },
      }));
      return otherThan(messages.or(gaps.map(part) as string[]));
    }
    const parts = intervals.map(part);
    return parts.includes(undefined) ? undefined : messages.or(parts as string[]);
  }

  /** A range of a package's versions, or `undefined` for every version. */
  const versions = (range: Range) => described(range, i => interval(i, b => b.version), messages.otherThan);

  /** A range of world-system versions: the systems and their versions. */
  function systems(range: Range): string | undefined {
    const part = (i: Interval) => {
      const lower = i.lower && splitWorldSystem(i.lower.version);
      const upper = i.upper && splitWorldSystem(i.upper.version);
      if (lower === undefined || upper === undefined || lower.system !== upper.system) {
        const show = (bound: Bound) => {
          const { system, version } = splitWorldSystem(bound.version);
          const id = messages.name(system);
          return version === SYSTEM_START || version === SYSTEM_END ? id : messages.system(id, version);
        };
        return interval(i, show);
      }
      const id = messages.name(lower.system);
      const sub: Interval = {
        ...(lower.version !== SYSTEM_START && {
          lower: { version: lower.version, inclusive: (i.lower as Bound).inclusive },
        }),
        ...(upper.version !== SYSTEM_END && {
          upper: { version: upper.version, inclusive: (i.upper as Bound).inclusive },
        }),
      };
      return messages.system(
        id,
        interval(sub, b => b.version),
      );
    };
    return described(range, part, messages.otherSystems);
  }

  /** A term as a phrase, read positively: the package in its versions. */
  function phrase(term: Term): string {
    if (term.package === REQUIREMENTS) return messages.name(REQUIREMENTS);
    if (term.package === WORLD_SYSTEM) return messages.world(systems(term.range));
    return messages.term(messages.name(term.package), versions(term.range));
  }

  return { versions, systems, phrase };
}

/**
 * The words for one of the resolver's reasons.
 */
export function describeReason(reason: Reason, messages: ExplanationMessages = englishMessages): string {
  const { versions, systems } = wording(messages);
  const package_ = (key: PackageKey, range: Range) =>
    key === WORLD_SYSTEM ? messages.world(systems(range)) : messages.term(messages.name(key), versions(range));
  const release = (constraint: Constraint) =>
    messages.term(messages.name(constraint.from.package), messages.exactly(constraint.from.version));

  /** What a release declares, in words. */
  const declared = (constraint: Constraint) => {
    switch (constraint.kind) {
      case 'dependency':
        return messages.dependsOn(release(constraint), package_(constraint.on, constraint.range));
      case 'exclusion':
        return messages.conflictsWith(release(constraint), package_(constraint.on, constraint.range));
      case 'choice':
        return messages.runsIn(
          release(constraint),
          messages.or(constraint.options.map(option => package_(option.on, option.range))),
        );
      default:
        return messages.unusable(release(constraint));
    }
  };

  switch (reason.kind) {
    case 'requirement':
      return messages.requirement(package_(reason.package, reason.range));
    case 'pin':
      return messages.pin(messages.term(messages.name(reason.package), messages.exactly(reason.version)));
    case 'setup':
      return messages.setupNeeds(reason.package === CORE ? messages.name(CORE) : messages.world());
    case 'world-system':
      return messages.worldSystem(messages.term(messages.name(reason.system), messages.exactly(reason.version)));
    case 'core-limit':
      return messages.coreLimit(messages.term(messages.name(CORE), messages.exactly(reason.version)), reason.reason);
    case 'constraint': {
      const { constraint } = reason;
      const override = constraint.provenance.override;
      if (override === undefined) return declared(constraint);
      // An override declared the constraint, or changed the bounds the release declared.
      if (constraint.kind === 'exclusion')
        return messages.excludedWith(release(constraint), package_(constraint.on, constraint.range), override.reason);
      if (constraint.kind === 'unusable' && constraint.reason === 'override')
        return messages.excluded(release(constraint), override.reason);
      return messages.overridden(declared(constraint), override.reason);
    }
  }
}

/**
 * The words for an incompatibility: its reason when the solver was given it, or what it says
 * when the solver derived it.
 *
 * @param external - The words for the data of an incompatibility the solver was given
 */
export function describeIncompatibility<C>(
  incompatibility: Incompatibility<C>,
  external: (data: C) => string,
  messages: ExplanationMessages = englishMessages,
): string {
  const { phrase, systems } = wording(messages);
  const { cause, terms } = incompatibility;
  if (cause.kind === 'external') return external(cause.data);
  if (cause.kind === 'root') return messages.wanted;
  if (cause.kind === 'no-versions') {
    const [term] = terms as [Term];
    return term.package === WORLD_SYSTEM ? messages.noSystem(systems(term.range)) : messages.noVersions(phrase(term));
  }

  const positive = terms.filter(t => t.positive);
  const negative = terms.filter(t => !t.positive);
  if (terms.length === 0) return messages.failed;
  if (terms.length === 1) {
    const [term] = terms as [Term];
    if (!term.positive) return messages.needed(phrase(term));
    return term.package === REQUIREMENTS ? messages.failed : messages.forbidden(phrase(term));
  }
  if (terms.length === 2 && positive.length === 1) {
    const [given] = positive as [Term];
    const [then] = negative as [Term];
    return given.package === REQUIREMENTS
      ? messages.requirementsNeed(phrase(then))
      : messages.needs(phrase(given), phrase(then));
  }
  if (terms.length === 2 && positive.length === 2) {
    const [a, b] = positive as [Term, Term];
    return messages.incompatible(phrase(a), phrase(b));
  }
  if (positive.length === 0) return messages.either(negative.map(phrase));
  return messages.ifThen(positive.map(phrase), negative.map(phrase));
}

/**
 * Explains a failure, as numbered sentences.
 *
 * @param failure - The incompatibility the solver failed with
 * @param external - The words for the data of an incompatibility the solver was given
 * @param messages - The wording; English by default
 */
export function formatExplanation<C>(
  failure: Incompatibility<C>,
  external: (data: C) => string,
  messages: ExplanationMessages = englishMessages,
): ExplanationLine[] {
  const say = (incompatibility: Incompatibility<C>) => describeIncompatibility(incompatibility, external, messages);
  if (failure.cause.kind !== 'derived') return [{ text: messages.sentence(say(failure)) }];

  // How often each derived step is used: a step used more than once is numbered, to refer back to.
  const derivations = new Map<Incompatibility<C>, number>();
  const count = (incompatibility: Incompatibility<C>): void => {
    const seen = derivations.get(incompatibility);
    derivations.set(incompatibility, (seen ?? 0) + 1);
    if (seen === undefined && incompatibility.cause.kind === 'derived') {
      count(incompatibility.cause.conflict);
      count(incompatibility.cause.other);
    }
  };
  count(failure);

  const lines: ExplanationLine[] = [];
  const numbers = new Map<Incompatibility<C>, number>();
  const write = (incompatibility: Incompatibility<C>, text: string, numbered: boolean) => {
    if (!numbered) {
      lines.push({ text });
      return;
    }
    const number = numbers.size + 1;
    numbers.set(incompatibility, number);
    lines.push({ text, number });
  };
  const isDerived = (incompatibility: Incompatibility<C>) => incompatibility.cause.kind === 'derived';
  const causes = (incompatibility: Incompatibility<C>) =>
    incompatibility.cause as { conflict: Incompatibility<C>; other: Incompatibility<C> };
  /** Whether both of a step's causes were given, not derived, so it reads as one sentence. */
  const isSingleLine = (incompatibility: Incompatibility<C>) =>
    !isDerived(causes(incompatibility).conflict) && !isDerived(causes(incompatibility).other);
  /** Whether a step can be folded into the sentence that uses it. */
  const isCollapsible = (incompatibility: Incompatibility<C>) => {
    if ((derivations.get(incompatibility) as number) > 1) return false;
    const { conflict, other } = causes(incompatibility);
    if (isDerived(conflict) === isDerived(other)) return false;
    return !numbers.has(isDerived(conflict) ? conflict : other);
  };
  /** A numbered step, referred back to. */
  const ref = (incompatibility: Incompatibility<C>) =>
    messages.see(say(incompatibility), numbers.get(incompatibility) as number);

  function visit(incompatibility: Incompatibility<C>, conclusion = false): void {
    const numbered = conclusion || (derivations.get(incompatibility) as number) > 1;
    const { conflict, other } = causes(incompatibility);
    const text = say(incompatibility);

    if (isDerived(conflict) && isDerived(other)) {
      const conflictNumber = numbers.get(conflict);
      const otherNumber = numbers.get(other);
      if (conflictNumber !== undefined && otherNumber !== undefined) {
        write(incompatibility, messages.because(ref(conflict), ref(other), text), numbered);
      } else if (conflictNumber !== undefined || otherNumber !== undefined) {
        const [withNumber, without] = conflictNumber !== undefined ? [conflict, other] : [other, conflict];
        visit(without);
        write(incompatibility, messages.andBecause(ref(withNumber), text, numbered), numbered);
      } else if (isSingleLine(conflict) || isSingleLine(other)) {
        const [first, second] = isSingleLine(other) ? [conflict, other] : [other, conflict];
        visit(first);
        visit(second);
        write(incompatibility, messages.thus(text), numbered);
      } else {
        visit(conflict, true);
        visit(other);
        write(incompatibility, messages.andBecause(ref(conflict), text, numbered), numbered);
      }
      return;
    }

    if (isDerived(conflict) || isDerived(other)) {
      const [derived, given] = isDerived(conflict) ? [conflict, other] : [other, conflict];
      if (numbers.has(derived)) {
        write(incompatibility, messages.because(say(given), ref(derived), text), numbered);
      } else if (isCollapsible(derived)) {
        const inner = causes(derived);
        const [collapsed, collapsedGiven] = isDerived(inner.conflict)
          ? [inner.conflict, inner.other]
          : [inner.other, inner.conflict];
        visit(collapsed);
        write(incompatibility, messages.andBecauseBoth(say(collapsedGiven), say(given), text, numbered), numbered);
      } else {
        visit(derived);
        write(incompatibility, messages.andBecause(say(given), text, numbered), numbered);
      }
      return;
    }

    write(incompatibility, messages.because(say(conflict), say(other), text), numbered);
  }

  visit(failure, true);
  return lines;
}

/** Explains a failure of {@link resolve}, as numbered sentences. */
export function explain(
  failure: Incompatibility<Reason>,
  messages: ExplanationMessages = englishMessages,
): ExplanationLine[] {
  return formatExplanation(failure, reason => describeReason(reason, messages), messages);
}

/** An explanation as text, one sentence to a line, each numbered sentence ending with its number. */
export function explanationText(lines: readonly ExplanationLine[]): string {
  return lines.map(({ text, number }) => (number === undefined ? text : `${text} (${number})`)).join('\n');
}
