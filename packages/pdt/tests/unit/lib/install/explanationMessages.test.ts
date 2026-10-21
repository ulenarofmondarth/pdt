import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { CORE, englishMessages, REQUIREMENTS, WORLD_SYSTEM } from '@mondarth/fvtt-resolver';
import { explanationMessages } from '@lib/install/explanationMessages.js';

import type { ExplanationMessages } from '@mondarth/fvtt-resolver';

const messages = explanationMessages();
const text = fc.string({ minLength: 1, maxLength: 12 });

/** Every phrase of the messages, with the arguments to call it with. */
type Calls = { [K in keyof ExplanationMessages]: ExplanationMessages[K] extends (...args: infer A) => string ? A : [] };

describe('explanationMessages, in English', () => {
  test('words every phrase as the resolver’s English does', () => {
    fc.assert(
      fc.property(text, text, text, fc.boolean(), fc.boolean(), fc.integer({ min: 1, max: 99 }), (a, b, c, x, y, n) => {
        const calls: Partial<Calls> = {
          term: [a, b],
          world: [a],
          system: [a, b],
          exactly: [a],
          from: [a, x],
          to: [a, x],
          between: [a, x, b, y],
          otherThan: [a],
          otherSystems: [a],
          dependsOn: [a, b],
          conflictsWith: [a, b],
          runsIn: [a, b],
          unusable: [a],
          excluded: [a, b],
          excludedWith: [a, b, c],
          overridden: [a, b],
          coreLimit: [a, b],
          requirement: [a],
          pin: [a],
          setupNeeds: [a],
          worldSystem: [a],
          noVersions: [a],
          noSystem: [a],
          forbidden: [a],
          needed: [a],
          needs: [a, b],
          requirementsNeed: [a],
          incompatible: [a, b],
          because: [a, b, c],
          andBecause: [a, b, x],
          andBecauseBoth: [a, b, c, x],
          thus: [a],
          see: [a, n],
        };
        for (const [phrase, args] of Object.entries(calls)) {
          const ours = (messages[phrase as keyof ExplanationMessages] as (...given: unknown[]) => string)(...args);
          const theirs = (englishMessages[phrase as keyof ExplanationMessages] as (...given: unknown[]) => string)(
            ...args,
          );
          expect(ours, phrase).toBe(theirs);
        }
      }),
    );
  });

  test('words the phrases without arguments, and those whose arguments may be missing, as the resolver does', () => {
    for (const key of [CORE, REQUIREMENTS, WORLD_SYSTEM, 'module:midi-qol', 'odd'])
      expect(messages.name(key)).toBe(englishMessages.name(key));
    expect([messages.none, messages.failed, messages.wanted]).toEqual([
      englishMessages.none,
      englishMessages.failed,
      englishMessages.wanted,
    ]);
    expect(messages.term('dae')).toBe('dae');
    expect(messages.world()).toBe(englishMessages.world());
    expect(messages.system('dnd5e')).toBe('dnd5e');
    expect(messages.noSystem()).toBe(englishMessages.noSystem());
    expect(messages.sentence('the requirements cannot be met')).toBe('The requirements cannot be met.');
  });

  test('joins lists as English does', () => {
    expect(messages.or(['a'])).toBe('a');
    expect(messages.or(['a', 'b'])).toBe('a or b');
    expect(messages.or(['a', 'b', 'c'])).toBe('a, b, or c');
    expect(messages.either(['a', 'b'])).toBe('either a or b is needed');
    expect(messages.ifThen(['a', 'b'], ['c', 'd'])).toBe('if a and b are used, then c or d is needed');
  });
});
