/**
 * The resolver's explanations in pdt's messages, so that they are in the user's language.
 *
 * The resolver writes an explanation from phrases, each a function of the phrases inside it; this
 * gives it pdt's message for each. Lists are joined as the locale joins them ("a, b or c").
 */
import { CORE, REQUIREMENTS, WORLD_SYSTEM } from '@mondarth/fvtt-resolver';
import { m } from '@i18n/messages.js';
import { getLocale } from '@i18n/runtime.js';

import type { ExplanationMessages } from '@mondarth/fvtt-resolver';

/** Items joined as the locale joins them, with "or" or with "and". */
function joined(items: readonly string[], type: 'disjunction' | 'conjunction'): string {
  return new Intl.ListFormat(getLocale(), { type }).format(items);
}

/** The resolver's explanation phrases, in pdt's messages. */
export function explanationMessages(): ExplanationMessages {
  return {
    name(key) {
      if (key === CORE) return m['explain.name.core']();
      if (key === REQUIREMENTS) return m['explain.name.requirements']();
      if (key === WORLD_SYSTEM) return m['explain.name.worldSystem']();
      const colon = key.indexOf(':');
      return colon === -1 ? key : key.slice(colon + 1);
    },
    term: (name, versions) => (versions === undefined ? name : m['explain.term']({ name, versions })),
    world: systems => (systems === undefined ? m['explain.worldAny']() : m['explain.world']({ systems })),
    system: (id, versions) => (versions === undefined ? id : m['explain.system']({ id, versions })),

    exactly: version => version,
    from: (version, inclusive) =>
      inclusive ? m['explain.fromInclusive']({ version }) : m['explain.fromExclusive']({ version }),
    to: (version, inclusive) =>
      inclusive ? m['explain.toInclusive']({ version }) : m['explain.toExclusive']({ version }),
    between(lower, lowerInclusive, upper, upperInclusive) {
      if (lowerInclusive) {
        return upperInclusive
          ? m['explain.betweenInclusive']({ lower, upper })
          : m['explain.betweenUpperExclusive']({ lower, upper });
      }
      return upperInclusive
        ? m['explain.betweenLowerExclusive']({ lower, upper })
        : m['explain.betweenExclusive']({ lower, upper });
    },
    otherThan: versions => m['explain.otherThan']({ versions }),
    otherSystems: systems => m['explain.otherSystems']({ systems }),
    get none() {
      return m['explain.none']();
    },
    or: parts => joined(parts, 'disjunction'),

    dependsOn: (release, on) => m['explain.dependsOn']({ release, on }),
    conflictsWith: (release, on) => m['explain.conflictsWith']({ release, on }),
    runsIn: (release, systems) => m['explain.runsIn']({ release, systems }),
    unusable: release => m['explain.unusable']({ release }),
    excluded: (release, reason) => m['explain.excluded']({ release, reason }),
    excludedWith: (release, on, reason) => m['explain.excludedWith']({ release, on, reason }),
    overridden: (text, reason) => m['explain.overridden']({ text, reason }),
    coreLimit: (core, reason) => m['explain.coreLimit']({ core, reason }),
    requirement: on => m['explain.requirement']({ on }),
    pin: on => m['explain.pin']({ on }),
    setupNeeds: what => m['explain.setupNeeds']({ what }),
    worldSystem: system => m['explain.worldSystem']({ system }),
    noVersions: term => m['explain.noVersions']({ term }),
    noSystem: systems => (systems === undefined ? m['explain.noSystemAny']() : m['explain.noSystem']({ systems })),

    get failed() {
      return m['explain.failed']();
    },
    get wanted() {
      return m['explain.wanted']();
    },
    forbidden: term => m['explain.forbidden']({ term }),
    needed: term => m['explain.needed']({ term }),
    needs: (term, needed) => m['explain.needs']({ term, needed }),
    requirementsNeed: needed => m['explain.requirementsNeed']({ needed }),
    incompatible: (a, b) => m['explain.incompatible']({ a, b }),
    either: terms => m['explain.either']({ terms: joined(terms, 'disjunction') }),
    ifThen: (given, then) =>
      m['explain.ifThen']({ given: joined(given, 'conjunction'), then: joined(then, 'disjunction') }),

    because: (a, b, conclusion) => m['explain.because']({ a, b, conclusion }),
    andBecause: (a, conclusion, so) =>
      so ? m['explain.soBecause']({ a, conclusion }) : m['explain.andBecause']({ a, conclusion }),
    andBecauseBoth: (a, b, conclusion, so) =>
      so ? m['explain.soBecauseBoth']({ a, b, conclusion }) : m['explain.andBecauseBoth']({ a, b, conclusion }),
    thus: conclusion => m['explain.thus']({ conclusion }),
    sentence: text =>
      m['explain.sentence']({ text: `${text.charAt(0).toLocaleUpperCase(getLocale())}${text.slice(1)}` }),
    see: (phrase, number) => m['explain.see']({ phrase, number: String(number) }),
  };
}
