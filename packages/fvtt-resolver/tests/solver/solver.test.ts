import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { solve } from '../../src/solver/solver.js';
import { leaves, ops, provider, range } from './registry.js';

import type { Registry } from './registry.js';

const root = { package: 'root', version: '1.0.0' };

/** Solves a registry, giving the versions chosen, or the leaves of the explanation. */
function run(registry: Registry) {
  const result = solve(provider(registry), root);
  return result.ok
    ? { versions: Object.fromEntries(result.versions) }
    : { leaves: [...new Set(leaves(result.failure))].sort() };
}

describe('solve, on the examples in pub’s solver documentation', () => {
  it('solves with no conflicts', () => {
    expect(
      run({
        root: { '1.0.0': { foo: '^1.0.0' } },
        foo: { '1.0.0': { bar: '^1.0.0' } },
        bar: { '1.0.0': {}, '2.0.0': {} },
      }),
    ).toEqual({ versions: { root: '1.0.0', foo: '1.0.0', bar: '1.0.0' } });
  });

  it('avoids a conflict while deciding', () => {
    expect(
      run({
        root: { '1.0.0': { foo: '^1.0.0', bar: '^1.0.0' } },
        foo: { '1.1.0': { bar: '^2.0.0' }, '1.0.0': {} },
        bar: { '1.0.0': {}, '1.1.0': {}, '2.0.0': {} },
      }),
    ).toEqual({ versions: { root: '1.0.0', foo: '1.0.0', bar: '1.1.0' } });
  });

  it('resolves a conflict', () => {
    expect(
      run({
        root: { '1.0.0': { foo: '>=1.0.0' } },
        foo: { '2.0.0': { bar: '^1.0.0' }, '1.0.0': {} },
        bar: { '1.0.0': { foo: '^1.0.0' } },
      }),
    ).toEqual({ versions: { root: '1.0.0', foo: '1.0.0' } });
  });

  it('resolves a conflict with a partial satisfier', () => {
    expect(
      run({
        root: { '1.0.0': { foo: '^1.0.0', target: '^2.0.0' } },
        foo: { '1.1.0': { left: '^1.0.0', right: '^1.0.0' }, '1.0.0': {} },
        left: { '1.0.0': { shared: '>=1.0.0' } },
        right: { '1.0.0': { shared: '<2.0.0' } },
        shared: { '2.0.0': {}, '1.0.0': { target: '^1.0.0' } },
        target: { '2.0.0': {}, '1.0.0': {} },
      }),
    ).toEqual({ versions: { root: '1.0.0', foo: '1.0.0', target: '2.0.0' } });
  });

  it('explains a linear failure from the dependencies that cause it', () => {
    expect(
      run({
        root: { '1.0.0': { foo: '^1.0.0', baz: '^1.0.0' } },
        foo: { '1.0.0': { bar: '^2.0.0' } },
        bar: { '2.0.0': { baz: '^3.0.0' } },
        baz: { '1.0.0': {}, '3.0.0': {} },
      }),
    ).toEqual({
      // pub states a dependency for every version that shares it; this solver, for one version,
      // and adds that there is no other.
      leaves: [
        '(no-versions of bar)',
        '(no-versions of foo)',
        'bar 2.0.0 depends on baz ^3.0.0',
        'foo 1.0.0 depends on bar ^2.0.0',
        'root 1.0.0 depends on baz ^1.0.0',
        'root 1.0.0 depends on foo ^1.0.0',
      ],
    });
  });

  it('explains a branching failure from both branches', () => {
    const { leaves: found = [] } = run({
      root: { '1.0.0': { foo: '^1.0.0' } },
      foo: { '1.0.0': { a: '^1.0.0', b: '^1.0.0' }, '1.1.0': { x: '^1.0.0', y: '^1.0.0' } },
      a: { '1.0.0': { b: '^2.0.0' } },
      b: { '1.0.0': {}, '2.0.0': {} },
      x: { '1.0.0': { y: '^2.0.0' } },
      y: { '1.0.0': {}, '2.0.0': {} },
    });
    expect(found).toEqual(
      expect.arrayContaining([
        'a 1.0.0 depends on b ^2.0.0',
        'foo 1.0.0 depends on a ^1.0.0',
        'foo 1.0.0 depends on b ^1.0.0',
        'foo 1.1.0 depends on x ^1.0.0',
        'foo 1.1.0 depends on y ^1.0.0',
        'root 1.0.0 depends on foo ^1.0.0',
        'x 1.0.0 depends on y ^2.0.0',
      ]),
    );
  });
});

describe('solve', () => {
  it('chooses the root alone when it depends on nothing', () => {
    expect(run({ root: { '1.0.0': {} } })).toEqual({ versions: { root: '1.0.0' } });
  });

  it('explains that no version of a dependency exists', () => {
    expect(run({ root: { '1.0.0': { foo: '^2.0.0' } }, foo: { '1.0.0': {} } })).toEqual({
      leaves: ['(no-versions of foo)', 'root 1.0.0 depends on foo ^2.0.0'],
    });
  });

  it('prefers the versions the provider lists first', () => {
    const registry: Registry = { root: { '1.0.0': { foo: 'any' } }, foo: { '1.0.0': {}, '2.0.0': {} } };
    const oldestFirst = { ...provider(registry), versions: (key: string) => Object.keys(registry[key] ?? {}) };
    const result = solve(oldestFirst, root);
    expect(result.ok && result.versions.get('foo')).toBe('1.0.0');
  });

  it('tells the provider what is decided, so that a preference can depend on it', () => {
    const registry: Registry = {
      root: { '1.0.0': { foo: 'any', bar: 'any' } },
      foo: { '1.0.0': {} },
      bar: { '1.0.0': {}, '2.0.0': {} },
    };
    const seen: string[][] = [];
    const base = provider(registry);
    const result = solve(
      {
        ...base,
        versions: (key, decided) => {
          seen.push([...decided.keys()]);
          // Once foo is decided, bar 1.0.0 is preferred.
          return key === 'bar' && decided.has('foo') ? ['1.0.0', '2.0.0'] : base.versions(key, decided);
        },
      },
      root,
    );
    expect(seen[0]).toEqual(['root']);
    expect(result.ok && Object.fromEntries(result.versions)).toEqual({ root: '1.0.0', foo: '1.0.0', bar: '1.0.0' });
  });

  it('respects a conflict: a version and a range that must not both be chosen', () => {
    expect(
      run({
        root: { '1.0.0': { foo: 'any', bar: 'any' } },
        foo: { '2.0.0': {}, '1.0.0': {} },
        bar: { '1.0.0': { foo: '!^2.0.0' } },
      }),
    ).toEqual({ versions: { root: '1.0.0', foo: '1.0.0', bar: '1.0.0' } });
  });

  it('ignores a dependency that can never fail, on a range of the version’s own package that includes it', () => {
    expect(run({ root: { '1.0.0': { a: 'any' } }, a: { '1.0.0': { a: '^1.0.0' } } })).toEqual({
      versions: { root: '1.0.0', a: '1.0.0' },
    });
  });

  describe('against every possible choice, on small registries', () => {
    const versions = ['1.0.0', '2.0.0', '3.0.0'];
    const packages = ['a', 'b', 'c'];
    const spec = fc
      .tuple(fc.constantFrom('any', '^1.0.0', '^2.0.0', '^3.0.0', '>=2.0.0', '<2.0.0'), fc.boolean())
      .map(([range, conflict]) => (conflict ? `!${range}` : range));
    const dependencies = fc.dictionary(fc.constantFrom(...packages), spec, { maxKeys: 2 });
    const registry: fc.Arbitrary<Registry> = fc
      .record({
        root: dependencies,
        a: fc.dictionary(fc.constantFrom(...versions), dependencies, { maxKeys: 3 }),
        b: fc.dictionary(fc.constantFrom(...versions), dependencies, { maxKeys: 3 }),
        c: fc.dictionary(fc.constantFrom(...versions), dependencies, { maxKeys: 3 }),
      })
      .map(({ root: rootDependencies, ...rest }) => ({ root: { '1.0.0': rootDependencies }, ...rest }));

    /** Whether a choice of versions meets every dependency and conflict of every version chosen. */
    const valid = (registry: Registry, chosen: Record<string, string | undefined>) =>
      Object.entries(chosen).every(
        ([key, version]) =>
          version === undefined ||
          Object.entries(registry[key]?.[version] ?? {}).every(([other, s]) => {
            const picked = chosen[other];
            if (s.startsWith('!')) return picked === undefined || !ops.contains(range(s.slice(1)), picked);
            return picked !== undefined && ops.contains(range(s), picked);
          }),
      );

    /** Whether any choice of versions, with the root, is valid. */
    function solvable(registry: Registry): boolean {
      const options = (key: string) => [undefined, ...Object.keys(registry[key] ?? {})];
      for (const a of options('a'))
        for (const b of options('b'))
          for (const c of options('c')) if (valid(registry, { root: '1.0.0', a, b, c })) return true;
      return false;
    }

    it('finds a valid choice exactly when there is one, and otherwise proves there is none', () => {
      fc.assert(
        fc.property(registry, given => {
          const result = solve(provider(given), root);
          expect(result.ok).toBe(solvable(given));
          if (result.ok) {
            expect(result.versions.get('root')).toBe('1.0.0');
            expect(valid(given, Object.fromEntries(result.versions))).toBe(true);
          } else {
            const { terms } = result.failure;
            expect(terms.length === 0 || (terms.length === 1 && terms[0]?.package === 'root')).toBe(true);
          }
        }),
        { numRuns: 3000 },
      );
    });
  });
});
