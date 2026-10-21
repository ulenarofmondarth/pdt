import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { check } from '../src/check.js';
import { releaseConstraints } from '../src/constraints.js';
import { overridesFor } from '../src/declarations.js';
import { explain, explanationText } from '../src/explain.js';
import { withDefaults } from '../src/policy.js';
import { coreRange, relationshipRange } from '../src/range/compatibility.js';
import { resolve } from '../src/resolve.js';
import { chooseOrders } from '../src/universe.js';
import { foundryOrder } from '../src/version/foundry.js';
import { makeRelease } from './helpers.js';

import type { CheckResult } from '../src/check.js';
import type { Constraint } from '../src/constraints.js';
import type { CompatibilityOverride, CoreLimit, Override } from '../src/declarations.js';
import type { Policy } from '../src/policy.js';
import type { Relationship, Release } from '../src/release.js';
import type { Resolution } from '../src/resolve.js';
import type { CoreRelease, Universe } from '../src/universe.js';

const origin = 'https://example.org/my-module/module.json';
const from = { package: 'module:my-module', version: '1.0.0' };
const related = (type: 'module' | 'system', id: string, compatibility: Relationship['compatibility'] = {}) => ({
  package: { type, id },
  compatibility,
});
const relationships = (lists: Partial<Release['relationships']>): Release['relationships'] => ({
  requires: [],
  systems: [],
  conflicts: [],
  recommends: [],
  ...lists,
});

/** The constraints of a release, in a universe of it and others, under a policy and overrides. */
function constraintsOf(
  release: Release,
  overrides: Override[],
  policy: Partial<Policy> = {},
  others: Release[] = [],
): Constraint[] {
  const full = withDefaults(policy);
  const orders = chooseOrders({ core: [], releases: [release, ...others] }, full, overrides);
  return releaseConstraints(release, { orders, policy: full, overrides });
}

describe('overridesFor', () => {
  const release = makeRelease({ version: '2.0.0' });

  it('finds the overrides of the release’s package and version, or of every version, with their places', () => {
    const overrides: Override[] = [
      { kind: 'exclude', package: 'module:my-module', versions: ['2.0.0'], reason: 'a' },
      { kind: 'exclude', package: 'module:my-module', versions: ['1.0.0'], reason: 'b' },
      { kind: 'exclude', package: 'module:other', reason: 'c' },
      { kind: 'relationship', package: 'module:my-module', drop: 'module:other', reason: 'd' },
    ];
    expect(overridesFor(release, overrides).map(({ index, override }) => [index, override.reason])).toEqual([
      [0, 'a'],
      [3, 'd'],
    ]);
  });

  it('matches versions exactly, as the releases give them', () => {
    const overrides: Override[] = [{ kind: 'exclude', package: 'module:my-module', versions: ['v2.0.0'], reason: 'a' }];
    expect(overridesFor(release, overrides)).toEqual([]);
  });
});

describe('releaseConstraints with overrides', () => {
  describe('exclude', () => {
    it('makes a release unusable, with the override as its provenance', () => {
      const overrides: Override[] = [{ kind: 'exclude', package: 'module:my-module', reason: 'it deletes worlds' }];
      expect(constraintsOf(makeRelease(), overrides)).toEqual([
        {
          kind: 'unusable',
          reason: 'override',
          from,
          provenance: { origin, field: 'overrides[0]', override: { index: 0, reason: 'it deletes worlds' } },
        },
      ]);
    });

    it('excludes a release with core builds, reading a generation as Foundry does', () => {
      const overrides: Override[] = [
        { kind: 'exclude', package: 'module:my-module', with: { package: 'core', minimum: '14' }, reason: 'broken' },
      ];
      expect(constraintsOf(makeRelease(), overrides)).toEqual([
        {
          kind: 'exclusion',
          from,
          on: 'core',
          range: coreRange({ minimum: '14' }),
          provenance: { origin, field: 'overrides[0]', override: { index: 0, reason: 'broken' } },
        },
      ]);
    });

    it('excludes a release with another package’s versions, read as a relationship’s bounds', () => {
      const overrides: Override[] = [
        {
          kind: 'exclude',
          package: 'module:my-module',
          with: { package: 'module:other', maximum: '2' },
          reason: 'clashes',
        },
      ];
      const [constraint] = constraintsOf(makeRelease(), overrides, { relationshipBounds: 'prefix' });
      expect(constraint).toMatchObject({
        kind: 'exclusion',
        on: 'module:other',
        range: relationshipRange(foundryOrder, { maximum: '2' }, 'prefix'),
      });
    });

    it('reads the bounds of `with` in the order chosen for that package', () => {
      const overrides: Override[] = [
        {
          kind: 'exclude',
          package: 'module:my-module',
          with: { package: 'module:other', minimum: 'not.a.version' },
          reason: 'x',
        },
      ];
      const full = withDefaults({ versionOrder: 'semver' });
      const orders = chooseOrders({ core: [], releases: [makeRelease()] }, full, overrides);
      expect(orders.warnings).toEqual([
        { code: 'semver-unreadable', package: 'module:other', versions: ['not.a.version'] },
      ]);
      expect(constraintsOf(makeRelease(), overrides, { versionOrder: 'semver' })).toHaveLength(1);
    });

    it('chooses the order of a package in the universe from its versions and the bounds of `with`', () => {
      const overrides: Override[] = [
        {
          kind: 'exclude',
          package: 'module:my-module',
          with: { package: 'module:other', maximum: '2.x' },
          reason: 'x',
        },
      ];
      const other = makeRelease({ id: 'other', version: '2.0.0' });
      const orders = chooseOrders(
        { core: [], releases: [makeRelease(), other] },
        withDefaults({ versionOrder: 'semver' }),
        overrides,
      );
      expect(orders.warnings).toEqual([{ code: 'semver-unreadable', package: 'module:other', versions: ['2.x'] }]);
    });

    it('refuses orders that cannot read the bounds of `with`', () => {
      const overrides: Override[] = [
        {
          kind: 'exclude',
          package: 'module:my-module',
          with: { package: 'module:other', minimum: '1.x' },
          reason: 'x',
        },
      ];
      const policy = withDefaults({});
      const orders = { orderOf: () => ({ ...foundryOrder, read: () => undefined }), warnings: [] };
      expect(() => releaseConstraints(makeRelease(), { orders, policy, overrides })).toThrow(
        'overrides[0] of module:my-module@1.0.0: a bound on module:other cannot be read',
      );
    });
  });

  describe('compatibility', () => {
    const release = makeRelease({ compatibility: { minimum: '12', verified: '13', maximum: '13' } });
    const correct = (compatibility: CompatibilityOverride['compatibility']): Override[] => [
      { kind: 'compatibility', package: 'module:my-module', compatibility, reason: 'works on 14' },
    ];
    const override = { index: 0, reason: 'works on 14' };

    it('replaces the bounds given, removes those given as null, and keeps the rest', () => {
      expect(constraintsOf(release, correct({ maximum: null, verified: '14' }))).toEqual([
        {
          kind: 'dependency',
          from,
          on: 'core',
          range: coreRange({ minimum: '12' }),
          provenance: { origin, field: 'compatibility', override },
        },
        {
          kind: 'preference',
          reason: 'verified',
          from,
          on: 'core',
          range: coreRange({ maximum: '14' }),
          provenance: { origin, field: 'compatibility.verified', policy: 'verified', override },
        },
      ]);
    });

    it('wins over the listing’s bounds', () => {
      const listed = { ...release, listing: { minimum: '13', verified: '13' } };
      const [dependency] = constraintsOf(listed, correct({ minimum: '11' }), { verified: 'require' });
      expect(dependency).toEqual({
        kind: 'dependency',
        from,
        on: 'core',
        range: coreRange({ minimum: '11', maximum: '13' }),
        provenance: { origin, field: 'listing', policy: 'listingCompatibility', override },
      });
    });

    it('applies the overrides in order, the last one recorded', () => {
      const overrides: Override[] = [
        { kind: 'compatibility', package: 'module:my-module', compatibility: { maximum: '14' }, reason: 'first' },
        { kind: 'compatibility', package: 'module:my-module', compatibility: { minimum: '13' }, reason: 'second' },
      ];
      const [dependency] = constraintsOf(release, overrides, { verified: 'ignore' });
      expect(dependency).toMatchObject({
        range: coreRange({ minimum: '13', maximum: '14' }),
        provenance: { override: { index: 1, reason: 'second' } },
      });
    });

    it('can leave a release with no bounds, which the policy may reject', () => {
      const constraints = constraintsOf(release, correct({ minimum: null, verified: null, maximum: null }), {
        missingCompatibility: 'reject',
      });
      expect(constraints).toEqual([
        {
          kind: 'unusable',
          reason: 'missing-compatibility',
          from,
          provenance: { origin, field: 'compatibility', policy: 'missingCompatibility', override },
        },
      ]);
    });
  });

  describe('relationship', () => {
    const release = makeRelease({
      relationships: relationships({
        requires: [related('module', 'other'), related('module', 'kept')],
        systems: [related('system', 'other'), related('system', 'dnd5e', { minimum: '5' })],
        conflicts: [related('module', 'other')],
        recommends: [related('module', 'other')],
      }),
    });

    it('drops every relationship naming the package, keeping the fields of the others', () => {
      const overrides: Override[] = [
        { kind: 'relationship', package: 'module:my-module', drop: 'module:other', reason: 'not needed' },
        { kind: 'relationship', package: 'module:my-module', drop: 'system:other', reason: 'wrong id' },
      ];
      const constraints = constraintsOf(release, overrides);
      expect(constraints.map(c => c.provenance.field)).toEqual([
        'relationships.requires[1]',
        'relationships.systems',
        'relationships.systems[1]',
      ]);
      expect(constraints[1]).toMatchObject({ kind: 'choice', options: [{ on: 'system:dnd5e' }] });
    });
  });
});

const core: CoreRelease[] = [
  { version: '13.351', generation: 13, channel: 'stable' },
  { version: '14.362', generation: 14, channel: 'stable' },
  { version: '14.363', generation: 14, channel: 'stable' },
];
const dnd5e = makeRelease({ package: { type: 'system', id: 'dnd5e' }, version: '5.3.3', origin: 'dnd5e' });
const myModule = (version: string, compatibility: Release['compatibility'] = {}) =>
  makeRelease({ version, compatibility, origin: `my-module@${version}` });
const universe = (...releases: Release[]): Universe => ({ core, releases: [dnd5e, ...releases] });
const requireMine = { require: [{ package: 'module:my-module' }] };
const noImage = (version: string): CoreLimit => ({ version, reason: 'there is no felddy/foundryvtt image for it' });

/** What a resolution chose, or its explanation. */
function summary(resolution: Resolution) {
  if ('needs' in resolution) throw new Error('every release is loaded');
  if (!resolution.ok) return explanationText(explain(resolution.failure));
  return `core ${resolution.setup.core}, ${resolution.setup.modules.map(m => `${m.package.id} ${m.version}`).join(', ')}`;
}

describe('resolve with declarations', () => {
  it('does not choose a core build the caller cannot run', () => {
    const result = resolve(universe(myModule('1.0.0')), requireMine, {
      declarations: { coreLimits: [noImage('14.363')] },
    });
    expect(summary(result)).toBe('core 14.362, my-module 1.0.0');
  });

  it('ignores limits on builds the universe does not have', () => {
    const result = resolve(universe(myModule('1.0.0')), requireMine, {
      declarations: { coreLimits: [noImage('15.400')] },
    });
    expect(summary(result)).toBe('core 14.363, my-module 1.0.0');
  });

  it('explains a failure that rests on a core limit with its reason', () => {
    const result = resolve(universe(myModule('1.0.0', { minimum: '14.363' })), requireMine, {
      declarations: { coreLimits: [noImage('14.363')] },
    });
    expect(summary(result)).toBe(
      [
        'Because no version of my-module other than 1.0.0 is available and my-module 1.0.0 depends on Foundry VTT 14.363 or later, my-module needs Foundry VTT 14.363 or later.',
        'Because Foundry VTT 14.363 cannot be used: there is no felddy/foundryvtt image for it and no version of Foundry VTT later than 14.363 is available, Foundry VTT 14.363 or later cannot be used.',
        'Thus, my-module cannot be used.',
        'So, because the requirements need my-module, the requirements cannot be met. (1)',
      ].join('\n'),
    );
  });

  it('applies overrides: a release excluded with the core required gives way to an older one', () => {
    const overrides: Override[] = [
      {
        kind: 'exclude',
        package: 'module:my-module',
        versions: ['2.0.0'],
        with: { package: 'core', minimum: '14' },
        reason: 'it breaks scenes on 14',
      },
    ];
    const onCore14 = { require: [...requireMine.require, { package: 'core', range: coreRange({ minimum: '14' }) }] };
    const releases = universe(myModule('1.0.0'), myModule('2.0.0'));
    expect(summary(resolve(releases, onCore14))).toBe('core 14.363, my-module 2.0.0');
    expect(summary(resolve(releases, onCore14, { declarations: { overrides } }))).toBe('core 14.363, my-module 1.0.0');
  });

  it('explains a failure that rests on overrides with their reasons', () => {
    const overrides: Override[] = [
      { kind: 'exclude', package: 'module:my-module', versions: ['2.0.0'], reason: 'it deletes worlds' },
      {
        kind: 'compatibility',
        package: 'module:my-module',
        versions: ['1.0.0'],
        compatibility: { maximum: '13' },
        reason: 'it fails on 14',
      },
      {
        kind: 'exclude',
        package: 'module:my-module',
        versions: ['1.0.0'],
        with: { package: 'core', maximum: '13' },
        reason: 'it fails on 13 too',
      },
    ];
    const result = resolve(universe(myModule('1.0.0'), myModule('2.0.0')), requireMine, {
      declarations: { overrides },
    });
    expect(summary(result)).toContain('my-module 2.0.0 cannot be used (override: it deletes worlds)');
    expect(summary(result)).toContain(
      'my-module 1.0.0 depends on Foundry VTT earlier than 14 (override: it fails on 14)',
    );
    expect(summary(result)).toContain(
      'my-module 1.0.0 cannot be used with Foundry VTT earlier than 14 (override: it fails on 13 too)',
    );
  });

  it('never chooses a limited core build, whichever builds are limited', () => {
    fc.assert(
      fc.property(fc.subarray(core.map(c => c.version)), limited => {
        const result = resolve(universe(myModule('1.0.0')), requireMine, {
          declarations: { coreLimits: limited.map(noImage) },
        });
        if ('needs' in result) return false;
        return result.ok ? !limited.includes(result.setup.core) : limited.length === core.length;
      }),
    );
  });
});

describe('check with declarations', () => {
  const setup = { core: '14.362', system: { package: 'system:dnd5e', version: '5.3.3' } };

  it('finds a setup invalid when the caller cannot run its core, and says which limits apply', () => {
    const result = check(universe(), setup, { declarations: { coreLimits: [noImage('14.362'), noImage('14.363')] } });
    expect(result.valid).toBe(false);
    expect(result.coreLimits).toEqual([noImage('14.362')]);
  });

  it('finds a setup valid when its core is not limited', () => {
    const result = check(universe(), setup, { declarations: { coreLimits: [noImage('14.363')] } });
    expect(result).toMatchObject({ valid: true, coreLimits: [] });
  });

  it('applies overrides to what the resolver finds, but not to Foundry’s verdicts', () => {
    const overrides: Override[] = [
      { kind: 'exclude', package: 'module:my-module', with: { package: 'core', minimum: '14' }, reason: 'broken' },
    ];
    const withModule = { ...setup, modules: [{ package: 'module:my-module', version: '1.0.0' }] };
    const mine = (result: CheckResult) => result.releases.find(r => r.release.package.id === 'my-module');
    const overridden = check(universe(myModule('1.0.0')), withModule, { declarations: { overrides } });
    const plain = check(universe(myModule('1.0.0')), withModule);
    expect([overridden.valid, plain.valid]).toEqual([false, true]);
    expect(mine(overridden)?.broken.map(c => c.provenance.override?.reason)).toEqual(['broken']);
    expect(mine(overridden)?.availability).toBe(mine(plain)?.availability);
  });
});
