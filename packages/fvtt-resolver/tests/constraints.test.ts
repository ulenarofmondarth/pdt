import fs from 'node:fs';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { releaseConstraints, universeConstraints } from '../src/constraints.js';
import { normaliseManifest } from '../src/manifest/normalise.js';
import { DEFAULT_POLICY, withDefaults } from '../src/policy.js';
import { coreRange, coreVerifiedRange } from '../src/range/compatibility.js';
import { rangeOps } from '../src/range/range.js';
import { chooseOrders } from '../src/universe.js';
import { foundryOrder } from '../src/version/foundry.js';
import { semverOrder } from '../src/version/semver.js';
import { makeRelease } from './helpers.js';

import type { Constraint } from '../src/constraints.js';
import type { Policy } from '../src/policy.js';
import type { Relationship, Relationships, Release } from '../src/release.js';

const ops = rangeOps(foundryOrder);
const origin = 'https://example.org/my-module/module.json';
const from = { package: 'module:my-module', version: '1.0.0' };

/** The constraints of releases, in a universe of just them, under a policy. */
function constraintsOf(release: Release, policy: Partial<Policy> = {}, others: Release[] = []): Constraint[] {
  const full = withDefaults(policy);
  const orders = chooseOrders({ core: [], releases: [release, ...others] }, full);
  return releaseConstraints(release, { orders, policy: full });
}

const relationships = (lists: Partial<Relationships>): Relationships => ({
  requires: [],
  systems: [],
  conflicts: [],
  recommends: [],
  ...lists,
});

const related = (
  type: 'module' | 'system',
  id: string,
  compatibility: Relationship['compatibility'] = {},
): Relationship => ({
  package: { type, id },
  compatibility,
});

const versionsIn = (constraint: Constraint | undefined, versions: string[]) =>
  versions.filter(v => constraint !== undefined && 'range' in constraint && ops.contains(constraint.range, v));

describe('releaseConstraints', () => {
  describe('core compatibility', () => {
    it('depends on the core versions between minimum and maximum', () => {
      const compatibility = { minimum: '13', maximum: '14' };
      expect(constraintsOf(makeRelease({ compatibility }), { verified: 'ignore' })).toEqual([
        {
          kind: 'dependency',
          from,
          on: 'core',
          range: coreRange(compatibility),
          provenance: { origin, field: 'compatibility' },
        },
      ]);
    });

    it('prefers the verified core versions by default', () => {
      const compatibility = { minimum: '13', verified: '13.351' };
      expect(constraintsOf(makeRelease({ compatibility }))).toContainEqual({
        kind: 'preference',
        reason: 'verified',
        from,
        on: 'core',
        range: coreVerifiedRange(compatibility),
        provenance: { origin, field: 'compatibility.verified', policy: 'verified' },
      });
    });

    it('requires the verified core versions under verified: require', () => {
      const compatibility = { verified: '13' };
      expect(constraintsOf(makeRelease({ compatibility }), { verified: 'require' })).toEqual([
        {
          kind: 'dependency',
          from,
          on: 'core',
          range: coreVerifiedRange(compatibility),
          provenance: { origin, field: 'compatibility.verified', policy: 'verified' },
        },
      ]);
    });

    it('ignores verified under verified: ignore', () => {
      expect(constraintsOf(makeRelease({ compatibility: { verified: '13' } }), { verified: 'ignore' })).toEqual([]);
    });

    it('lets a release with no core compatibility work with any core by default, as Foundry does', () => {
      expect(constraintsOf(makeRelease())).toEqual([]);
    });

    it('makes a release with no core compatibility unusable under missingCompatibility: reject', () => {
      expect(constraintsOf(makeRelease(), { missingCompatibility: 'reject' })).toEqual([
        {
          kind: 'unusable',
          reason: 'missing-compatibility',
          from,
          provenance: { origin, field: 'compatibility', policy: 'missingCompatibility' },
        },
      ]);
    });
  });

  describe('requires', () => {
    it('depends on each required module, in its range', () => {
      const release = makeRelease({
        relationships: relationships({ requires: [related('module', 'lib', { maximum: '4' })] }),
      });
      const [dependency] = constraintsOf(release);
      expect(dependency).toMatchObject({
        kind: 'dependency',
        on: 'module:lib',
        provenance: { origin, field: 'relationships.requires[0]' },
      });
      expect(versionsIn(dependency, ['3', '4', '4.1.0'])).toEqual(['3', '4']);
    });

    it('reads a maximum as a prefix under relationshipBounds: prefix', () => {
      const release = makeRelease({
        relationships: relationships({ requires: [related('module', 'lib', { maximum: '4' })] }),
      });
      expect(versionsIn(constraintsOf(release, { relationshipBounds: 'prefix' })[0], ['4', '4.1.0', '5'])).toEqual([
        '4',
        '4.1.0',
      ]);
    });

    it('does not depend on a requirement that is not a module, as Foundry does not check it', () => {
      const release = makeRelease({ relationships: relationships({ requires: [related('system', 'dnd5e')] }) });
      expect(constraintsOf(release)).toEqual([]);
    });
  });

  describe('systems', () => {
    const release = makeRelease({
      relationships: relationships({
        systems: [related('system', 'dnd5e', { minimum: '5.3.0', maximum: '5.9.99' }), related('system', 'pf2e')],
      }),
    });

    it('chooses between the systems by id, and prefers each one’s range by default', () => {
      const constraints = constraintsOf(release);
      expect(constraints[0]).toEqual({
        kind: 'choice',
        from,
        options: [
          { on: 'system:dnd5e', range: ops.any },
          { on: 'system:pf2e', range: ops.any },
        ],
        provenance: { origin, field: 'relationships.systems' },
      });
      expect(constraints).toHaveLength(2);
      expect(constraints[1]).toMatchObject({
        kind: 'preference',
        reason: 'system-compatibility',
        on: 'system:dnd5e',
        provenance: { origin, field: 'relationships.systems[0]', policy: 'systemCompatibility' },
      });
      expect(versionsIn(constraints[1], ['5.3.3', '6.0.6'])).toEqual(['5.3.3']);
    });

    it('enforces each system’s range under systemCompatibility: require', () => {
      const [choice] = constraintsOf(release, { systemCompatibility: 'require' });
      expect(choice).toMatchObject({ kind: 'choice', provenance: { policy: 'systemCompatibility' } });
      const options = choice?.kind === 'choice' ? choice.options : [];
      expect(options.map(o => ops.contains(o.range, '6.0.6'))).toEqual([false, true]);
    });

    it('chooses by id alone under systemCompatibility: ignore', () => {
      expect(constraintsOf(release, { systemCompatibility: 'ignore' })).toEqual([
        expect.objectContaining({ kind: 'choice' }),
      ]);
    });
  });

  describe('conflicts and recommendations', () => {
    const release = makeRelease({
      relationships: relationships({
        conflicts: [related('module', 'other', { maximum: '2.9' })],
        recommends: [related('module', 'helper')],
      }),
    });

    it('excludes a conflict by default, and reports a recommendation', () => {
      expect(constraintsOf(release)).toEqual([
        expect.objectContaining({
          kind: 'exclusion',
          on: 'module:other',
          provenance: { origin, field: 'relationships.conflicts[0]' },
        }),
        expect.objectContaining({
          kind: 'advisory',
          reason: 'recommends',
          on: 'module:helper',
          range: ops.any,
          provenance: { origin, field: 'relationships.recommends[0]' },
        }),
      ]);
    });

    it('only reports a conflict under conflicts: warn', () => {
      expect(constraintsOf(release, { conflicts: 'warn' })[0]).toMatchObject({
        kind: 'advisory',
        reason: 'conflict',
        provenance: { field: 'relationships.conflicts[0]', policy: 'conflicts' },
      });
    });
  });

  it('refuses orders that cannot read a bound, which belong to another universe', () => {
    const release = makeRelease({
      relationships: relationships({ requires: [related('module', 'lib', { maximum: 'v2' })] }),
    });
    const orders = { orderOf: () => semverOrder, warnings: [] };
    expect(() => releaseConstraints(release, { orders, policy: DEFAULT_POLICY })).toThrow(
      'relationships.requires[0] of module:my-module@1.0.0: a bound on module:lib cannot be read',
    );
  });

  it('reads a real manifest: midi-qol 14.0.15 needs dnd5e below 6', () => {
    const json: unknown = JSON.parse(
      fs.readFileSync(new URL('fixtures/manifests/midi-qol-14.0.15.module.json', import.meta.url), 'utf8'),
    );
    const read = normaliseManifest(json, { origin: 'midi-qol', type: 'module' });
    if (!read.ok) throw new Error('midi-qol should read');
    const constraints = constraintsOf(read.release, { systemCompatibility: 'require' });
    const choice = constraints.find(c => c.kind === 'choice');
    const dnd5e = choice?.kind === 'choice' ? choice.options[0] : undefined;
    expect(dnd5e?.on).toBe('system:dnd5e');
    expect(['5.3.3', '6.0.6'].filter(v => dnd5e !== undefined && ops.contains(dnd5e.range, v))).toEqual(['5.3.3']);
    expect(constraints.filter(c => c.kind === 'dependency').map(c => (c.kind === 'dependency' ? c.on : ''))).toEqual([
      'core',
      'module:socketlib',
      'module:lib-wrapper',
      'module:dae',
    ]);
  });
});

describe('universeConstraints', () => {
  it('gathers the constraints of every release, each traced to the release that declares it', () => {
    const bound = fc.option(fc.constantFrom('1', '2.5', '13', '14.368'), { nil: undefined });
    const compatibility = fc
      .record({ minimum: bound, maximum: bound, verified: bound })
      .map(c => Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)));
    const relation = fc.record({
      type: fc.constantFrom<'module' | 'system'>('module', 'system'),
      id: fc.constantFrom('a', 'b', 'c'),
      compatibility,
    });
    const release = fc
      .record({
        id: fc.constantFrom('x', 'y', 'z'),
        version: fc.constantFrom('1.0.0', '2.0.0'),
        compatibility,
        requires: fc.array(relation, { maxLength: 2 }),
        systems: fc.array(
          relation.map(r => ({ ...r, type: 'system' as const })),
          { maxLength: 2 },
        ),
        conflicts: fc.array(relation, { maxLength: 2 }),
        recommends: fc.array(relation, { maxLength: 2 }),
      })
      .map(({ id, version, compatibility, requires, systems, conflicts, recommends }) => {
        const toRelationship = (r: {
          type: 'module' | 'system';
          id: string;
          compatibility: Relationship['compatibility'];
        }) => related(r.type, r.id, r.compatibility);
        return makeRelease({
          id,
          version,
          compatibility,
          relationships: {
            requires: requires.map(toRelationship),
            systems: systems.map(toRelationship),
            conflicts: conflicts.map(toRelationship),
            recommends: recommends.map(toRelationship),
          },
        });
      });
    const policy = fc.record({
      verified: fc.constantFrom<Policy['verified']>('prefer', 'require', 'ignore'),
      conflicts: fc.constantFrom<Policy['conflicts']>('enforce', 'warn'),
      missingCompatibility: fc.constantFrom<Policy['missingCompatibility']>('any', 'reject'),
      systemCompatibility: fc.constantFrom<Policy['systemCompatibility']>('prefer', 'require', 'ignore'),
      relationshipBounds: fc.constantFrom<Policy['relationshipBounds']>('foundry', 'prefix'),
      versionOrder: fc.constantFrom<Policy['versionOrder']>('foundry', 'semver'),
    });

    fc.assert(
      fc.property(fc.array(release, { maxLength: 4 }), policy, (releases, settings) => {
        const full = withDefaults(settings);
        const orders = chooseOrders({ core: [], releases }, full);
        const constraints = universeConstraints(releases, { orders, policy: full });
        const declared = new Map(releases.map(r => [`module:${r.package.id}@${r.version}`, r.origin]));
        for (const constraint of constraints) {
          const key = `${constraint.from.package}@${constraint.from.version}`;
          expect(declared.has(key)).toBe(true);
          expect(constraint.provenance.origin).toBe(declared.get(key));
        }
      }),
    );
  });
});
