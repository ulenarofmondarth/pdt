import fs from 'node:fs';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  describeIncompatibility,
  describeReason,
  englishMessages,
  explain,
  explanationText,
  formatExplanation,
} from '../src/explain.js';
import { normaliseManifest } from '../src/manifest/normalise.js';
import { rangeOps } from '../src/range/range.js';
import { REQUIREMENTS, resolve } from '../src/resolve.js';
import { solve } from '../src/solver/solver.js';
import { foundryOrder } from '../src/version/foundry.js';
import { WORLD_SYSTEM, worldSystemOrder, worldSystemRange } from '../src/world-system.js';
import { makeRelease } from './helpers.js';
import { provider } from './solver/registry.js';

import type { Constraint } from '../src/constraints.js';
import type { ExplanationMessages } from '../src/explain.js';
import type { Reason } from '../src/resolve.js';
import type { Cause, Incompatibility } from '../src/solver/solver.js';
import type { Term } from '../src/solver/term.js';
import type { Registry } from './solver/registry.js';

const ops = rangeOps(foundryOrder);
const systems = rangeOps(worldSystemOrder(() => foundryOrder));
const between = (lower: string, upper: string, upperInclusive = true) =>
  ops.between({ version: lower, inclusive: true }, { version: upper, inclusive: upperInclusive });

/** Explains the failure of a pub-style registry, whose incompatibilities carry their own words. */
function explainRegistry(registry: Registry): string {
  const result = solve(provider(registry), { package: 'root', version: '1.0.0' });
  if (result.ok) throw new Error('Expected a failure');
  return explanationText(formatExplanation(result.failure, words => words));
}

const midiQol = (() => {
  const json: unknown = JSON.parse(
    fs.readFileSync(new URL('fixtures/manifests/midi-qol-14.0.15.module.json', import.meta.url), 'utf8'),
  );
  const read = normaliseManifest(json, { origin: 'midi-qol', type: 'module' });
  if (!read.ok) throw new Error('midi-qol should read');
  return read.release;
})();

describe('explain', () => {
  const dnd5e = makeRelease({
    package: { type: 'system', id: 'dnd5e' },
    version: '6.0.6',
    compatibility: { minimum: '14.367' },
  });
  const support = ['socketlib', 'lib-wrapper', 'dae'].map(id =>
    makeRelease({ id, version: '14.0.18', compatibility: { minimum: '13' } }),
  );
  const universe = {
    core: [{ version: '14.368', generation: 14, channel: 'stable' as const }],
    releases: [midiQol, dnd5e, ...support],
  };

  it('explains why midi-qol cannot be installed with only a dnd5e outside its range', () => {
    const result = resolve(
      universe,
      { require: [{ package: 'module:midi-qol' }] },
      { policy: { systemCompatibility: 'require' } },
    );
    if (result.ok || 'needs' in result) throw new Error('Expected a failure');
    expect(explanationText(explain(result.failure))).toBe(
      [
        'Because no version of midi-qol other than 14.0.15 is available and midi-qol 14.0.15 runs only in dnd5e 5.3.0 to 5.9.99, midi-qol needs a world with dnd5e 5.3.0 to 5.9.99.',
        'So, because no system in dnd5e 5.3.0 to 5.9.99 is available and the requirements need midi-qol, the requirements cannot be met. (1)',
      ].join('\n'),
    );
  });

  it('explains a pin that the universe has no release of', () => {
    const result = resolve(universe, {
      require: [{ package: 'module:midi-qol' }],
      pins: [{ package: 'core', version: '13.351' }],
    });
    if (result.ok || 'needs' in result) throw new Error('Expected a failure');
    expect(explain(result.failure)).toEqual([
      {
        text: 'Because no version of Foundry VTT 13.351 is available and Foundry VTT 13.351 is pinned, the requirements cannot be met.',
        number: 1,
      },
    ]);
  });

  it('words an explanation in the messages given', () => {
    const result = resolve(universe, { require: [{ package: 'module:ghost' }] });
    if (result.ok || 'needs' in result) throw new Error('Expected a failure');
    const shouting: ExplanationMessages = { ...englishMessages, name: key => englishMessages.name(key).toUpperCase() };
    expect(explanationText(explain(result.failure, shouting))).toBe(
      'Because no version of GHOST is available and the requirements need GHOST, the requirements cannot be met. (1)',
    );
  });
});

describe('formatExplanation, on pub’s examples', () => {
  it('explains a linear failure step by step', () => {
    expect(
      explainRegistry({
        root: { '1.0.0': { foo: '^1.0.0', baz: '^1.0.0' } },
        foo: { '1.0.0': { bar: '^2.0.0' } },
        bar: { '2.0.0': { baz: '^3.0.0' } },
        baz: { '1.0.0': {}, '3.0.0': {} },
      }),
    ).toMatchSnapshot();
  });

  it('numbers a step that a later one refers back to', () => {
    const text = explainRegistry({
      root: { '1.0.0': { foo: '^1.0.0' } },
      foo: { '1.0.0': { a: '^1.0.0', b: '^1.0.0' }, '1.1.0': { x: '^1.0.0', y: '^1.0.0' } },
      a: { '1.0.0': { b: '^2.0.0' } },
      b: { '1.0.0': {}, '2.0.0': {} },
      x: { '1.0.0': { y: '^2.0.0' } },
      y: { '1.0.0': {}, '2.0.0': {} },
    });
    expect(text).toMatchSnapshot();
    expect(text).toMatch(/\(1\)\n[\s\S]*cannot be used \(1\),/);
  });

  it('writes a well-formed explanation for any failure', () => {
    const versions = ['1.0.0', '2.0.0', '3.0.0'];
    const spec = fc
      .tuple(fc.constantFrom('any', '^1.0.0', '^2.0.0', '>=2.0.0', '<2.0.0'), fc.boolean())
      .map(([range, conflict]) => (conflict ? `!${range}` : range));
    const dependencies = fc.dictionary(fc.constantFrom('a', 'b', 'c', 'd'), spec, { maxKeys: 3 });
    const registry: fc.Arbitrary<Registry> = fc
      .record({
        root: dependencies,
        a: fc.dictionary(fc.constantFrom(...versions), dependencies, { maxKeys: 3 }),
        b: fc.dictionary(fc.constantFrom(...versions), dependencies, { maxKeys: 3 }),
        c: fc.dictionary(fc.constantFrom(...versions), dependencies, { maxKeys: 3 }),
        d: fc.dictionary(fc.constantFrom(...versions), dependencies, { maxKeys: 3 }),
      })
      .map(({ root, ...rest }) => ({ root: { '1.0.0': root }, ...rest }));
    fc.assert(
      fc.property(registry, given => {
        const result = solve(provider(given), { package: 'root', version: '1.0.0' });
        if (result.ok) return;
        const lines = formatExplanation(result.failure, words => words);
        expect(lines.length).toBeGreaterThan(0);
        expect(lines.at(-1)?.number ?? (lines.length === 1 ? 0 : undefined)).toBeDefined();
        const seen = new Set<number>();
        for (const { text, number } of lines) {
          for (const [, referred] of text.matchAll(/\((\d+)\)/g)) expect(seen.has(Number(referred))).toBe(true);
          if (number !== undefined) seen.add(number);
        }
      }),
      { numRuns: 3000 },
    );
  });

  describe('on derivations built by hand', () => {
    const given = (words: string): Incompatibility<string> => ({ terms: [], cause: { kind: 'external', data: words } });
    const derive = (
      name: string,
      conflict: Incompatibility<string>,
      other: Incompatibility<string>,
    ): Incompatibility<string> => ({
      terms: [{ package: `module:${name}`, range: ops.any, positive: true }],
      cause: { kind: 'derived', conflict, other },
    });
    const text = (failure: Incompatibility<string>) => explanationText(formatExplanation(failure, words => words));

    it('folds a step into the sentence that uses it', () => {
      const inner = derive('inner', given('e3'), given('e4'));
      const middle = derive('middle', inner, given('e2'));
      expect(text(derive('top', middle, given('e1')))).toBe(
        ['Because e3 and e4, inner cannot be used.', 'So, because e2 and e1, top cannot be used. (1)'].join('\n'),
      );
    });

    it('refers back to a numbered step and explains the other', () => {
      const shared = derive('shared', given('e1'), given('e2'));
      const left = derive('left', shared, given('e5'));
      const rest = derive('rest', given('e3'), given('e4'));
      const right = derive('right', shared, rest);
      expect(text(derive('top', left, right))).toBe(
        [
          'Because e1 and e2, shared cannot be used. (1)',
          'So, because e5, left cannot be used. (2)',
          'Because e3 and e4, rest cannot be used.',
          'And because shared cannot be used (1), right cannot be used.',
          'So, because left cannot be used (2), top cannot be used. (3)',
        ].join('\n'),
      );
    });
  });

  describe('on more derivations built by hand', () => {
    const given = (words: string): Incompatibility<string> => ({ terms: [], cause: { kind: 'external', data: words } });
    const derive = (
      name: string,
      conflict: Incompatibility<string>,
      other: Incompatibility<string>,
    ): Incompatibility<string> => ({
      terms: [{ package: `module:${name}`, range: ops.any, positive: true }],
      cause: { kind: 'derived', conflict, other },
    });
    const text = (failure: Incompatibility<string>) => explanationText(formatExplanation(failure, words => words));

    it('refers back to two numbered steps at once', () => {
      const first = derive('first', given('e1'), given('e2'));
      const second = derive('second', given('e3'), given('e4'));
      expect(text(derive('top', derive('left', first, second), derive('right', first, second)))).toBe(
        [
          'Because e1 and e2, first cannot be used. (1)',
          'Because e3 and e4, second cannot be used. (2)',
          'Thus, left cannot be used. (3)',
          'Because first cannot be used (1) and second cannot be used (2), right cannot be used.',
          'So, because left cannot be used (3), top cannot be used. (4)',
        ].join('\n'),
      );
    });

    it('refers back to a numbered step that is the other cause, and explains the first', () => {
      const shared = derive('shared', given('e1'), given('e2'));
      const left = derive('left', shared, given('e5'));
      const rest = derive('rest', given('e3'), given('e4'));
      expect(text(derive('top', left, derive('right', rest, shared)))).toBe(
        [
          'Because e1 and e2, shared cannot be used. (1)',
          'So, because e5, left cannot be used. (2)',
          'Because e3 and e4, rest cannot be used.',
          'And because shared cannot be used (1), right cannot be used.',
          'So, because left cannot be used (2), top cannot be used. (3)',
        ].join('\n'),
      );
    });

    it('does not fold a step whose own causes are both derived', () => {
      const middle = derive('middle', derive('a', given('e2'), given('e3')), derive('b', given('e4'), given('e5')));
      expect(text(derive('top', middle, given('e1')))).toBe(
        [
          'Because e2 and e3, a cannot be used.',
          'Because e4 and e5, b cannot be used.',
          'Thus, middle cannot be used.',
          'So, because e1, top cannot be used. (1)',
        ].join('\n'),
      );
    });

    it('refers back to a numbered step beside a given one', () => {
      const shared = derive('shared', given('e1'), given('e2'));
      expect(text(derive('top', derive('left', shared, given('e6')), derive('right', shared, given('e5'))))).toBe(
        [
          'Because e1 and e2, shared cannot be used. (1)',
          'So, because e6, left cannot be used. (2)',
          'Because e5 and shared cannot be used (1), right cannot be used.',
          'So, because left cannot be used (2), top cannot be used. (3)',
        ].join('\n'),
      );
    });
  });

  it('gives a failure the solver was given, not derived, as a sentence', () => {
    const broken = {
      orderOf: () => foundryOrder,
      versions: () => [],
      incompatibilities: () => [
        { terms: [{ package: 'root', range: ops.exactly('1.0.0'), positive: true }], data: 'root is broken' },
      ],
    };
    const result = solve(broken, { package: 'root', version: '1.0.0' });
    if (result.ok) throw new Error('Expected a failure');
    expect(formatExplanation(result.failure, words => words)).toEqual([{ text: 'Root is broken.' }]);
  });
});

describe('describeIncompatibility', () => {
  const term = (key: string, range = ops.any, positive = true): Term => ({ package: key, range, positive });
  const derived: Cause<string> = {
    kind: 'derived',
    conflict: { terms: [], cause: { kind: 'root' } },
    other: { terms: [], cause: { kind: 'root' } },
  };
  const say = (terms: Term[], cause: Cause<string> = derived) =>
    describeIncompatibility({ terms, cause } as Incompatibility<string>, words => words);

  it.each([
    [[], 'the requirements cannot be met'],
    [[term(REQUIREMENTS, ops.exactly('0'))], 'the requirements cannot be met'],
    [[term('module:dae', between('1', '2'))], 'dae 1 to 2 cannot be used'],
    [[term('module:dae', ops.any, false)], 'dae is needed'],
    [[term(REQUIREMENTS), term('core', ops.exactly('14.368'), false)], 'the requirements need Foundry VTT 14.368'],
    [[term('module:a'), term('module:b', ops.exactly('1'), false)], 'a needs b 1'],
    [[term('module:a'), term('module:b')], 'a cannot be used with b'],
    [[term('module:a', ops.any, false), term('module:b', ops.any, false)], 'either a or b is needed'],
    [
      [term(REQUIREMENTS, ops.exactly('0'), false), term('module:b', ops.any, false)],
      'either the requirements or b is needed',
    ],
    [[term('module:a'), term('module:b'), term('module:c', ops.any, false)], 'if a and b are used, then c is needed'],
  ])('describes %j as “%s”', (terms, words) => {
    expect(say(terms)).toBe(words);
  });

  it('describes the solver’s own causes', () => {
    expect(say([term(REQUIREMENTS, ops.exactly('0'), false)], { kind: 'root' })).toBe('the requirements are wanted');
    expect(
      say([term('module:dae', ops.between(undefined, { version: '1', inclusive: false }))], { kind: 'no-versions' }),
    ).toBe('no version of dae earlier than 1 is available');
    expect(say([term(WORLD_SYSTEM, systems.any)], { kind: 'no-versions' })).toBe('no system is available');
  });

  it('writes sets of versions', () => {
    const v = (range: Parameters<typeof term>[1]) => say([term('module:m', range)]);
    expect(v(ops.none)).toBe('m no version cannot be used');
    expect(v(ops.between({ version: '1', inclusive: false }, undefined))).toBe('m later than 1 cannot be used');
    expect(v(ops.between(undefined, { version: '2', inclusive: true }))).toBe('m 2 or earlier cannot be used');
    expect(v(ops.between({ version: '1', inclusive: false }, { version: '2', inclusive: false }))).toBe(
      'm after 1 up to but not including 2 cannot be used',
    );
    expect(v(ops.union(ops.exactly('1'), ops.exactly('3')))).toBe('m 1 or 3 cannot be used');
    expect(v(ops.complement(ops.exactly('2')))).toBe('m other than 2 cannot be used');
    expect(
      v(
        ops.union(
          ops.between(undefined, { version: '1', inclusive: false }),
          ops.between({ version: '3', inclusive: false }, undefined),
        ),
      ),
    ).toBe('m other than 1 to 3 cannot be used');
  });

  it('writes sets of systems for the world', () => {
    const order = worldSystemOrder(() => foundryOrder);
    const world = (range: Parameters<typeof term>[1]) => say([term('module:m'), term(WORLD_SYSTEM, range, false)]);
    const dnd5e = worldSystemRange(order, 'system:dnd5e', between('5.3.0', '5.9.99'));
    const pf2e = worldSystemRange(order, 'system:pf2e', ops.any);
    expect(world(systems.union(dnd5e, pf2e))).toBe('m needs a world with dnd5e 5.3.0 to 5.9.99 or pf2e');
    expect(world(worldSystemRange(order, 'system:dnd5e', ops.exactly('5.3.3')))).toBe(
      'm needs a world with dnd5e 5.3.3',
    );
    expect(
      world(worldSystemRange(order, 'system:dnd5e', ops.between({ version: '5', inclusive: true }, undefined))),
    ).toBe('m needs a world with dnd5e 5 or later');
    expect(world(systems.none)).toBe('m needs a world with no version');
    expect(world(systems.any)).toBe('m needs a world with a system');
    expect(
      world(systems.between({ version: 'dnd5e@5.3.3', inclusive: false }, { version: 'pf2e@7.2.0', inclusive: true })),
    ).toBe('m needs a world with after dnd5e 5.3.3 to pf2e 7.2.0');
    expect(
      world(systems.between({ version: 'dnd5e@', inclusive: true }, { version: 'pf2e@7.2.0', inclusive: true })),
    ).toBe('m needs a world with dnd5e to pf2e 7.2.0');
    expect(world(systems.complement(dnd5e))).toBe('m needs a world with a system other than dnd5e 5.3.0 to 5.9.99');
  });
});

describe('describeReason', () => {
  const from = { package: 'module:midi-qol', version: '14.0.15' };
  const provenance = { origin: 'midi-qol', field: 'relationships' };
  const constraint = (c: Partial<Constraint>) =>
    ({ kind: 'constraint', constraint: { from, provenance, ...c } as Constraint }) as const;
  it.each<[Reason, string]>([
    [{ kind: 'requirement', package: 'module:midi-qol', range: ops.any }, 'the requirements need midi-qol'],
    [{ kind: 'requirement', package: WORLD_SYSTEM, range: systems.any }, 'the requirements need a world with a system'],
    [{ kind: 'pin', package: 'system:dnd5e', version: '5.3.3' }, 'dnd5e 5.3.3 is pinned'],
    [{ kind: 'setup', package: 'core' }, 'a setup needs Foundry VTT'],
    [{ kind: 'setup', package: WORLD_SYSTEM }, 'a setup needs a world with a system'],
    [
      { kind: 'world-system', system: 'system:dnd5e', version: '5.3.3' },
      'dnd5e 5.3.3 is the world’s system exactly when it is installed',
    ],
    [
      constraint({
        kind: 'dependency',
        on: 'module:dae',
        range: ops.between({ version: '14.0.18', inclusive: true }, undefined),
      }),
      'midi-qol 14.0.15 depends on dae 14.0.18 or later',
    ],
    [constraint({ kind: 'exclusion', on: 'module:other', range: ops.any }), 'midi-qol 14.0.15 conflicts with other'],
    [
      constraint({
        kind: 'choice',
        options: [
          { on: 'system:dnd5e', range: between('5.3.0', '5.9.99') },
          { on: 'system:pf2e', range: ops.any },
        ],
      }),
      'midi-qol 14.0.15 runs only in dnd5e 5.3.0 to 5.9.99 or pf2e',
    ],
    [
      constraint({ kind: 'unusable', reason: 'missing-compatibility' }),
      'midi-qol 14.0.15 declares no Foundry VTT compatibility, which the policy does not accept',
    ],
  ])('describes %j', (reason, words) => {
    expect(describeReason(reason)).toBe(words);
  });

  it('names packages', () => {
    expect(['core', REQUIREMENTS, WORLD_SYSTEM, 'module:dae', 'root'].map(key => englishMessages.name(key))).toEqual([
      'Foundry VTT',
      'the requirements',
      'the world’s system',
      'dae',
      'root',
    ]);
    expect(englishMessages.or(['a', 'b', 'c'])).toBe('a, b or c');
  });
});
