import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normaliseManifest } from '../src/manifest/normalise.js';
import { rangeOps } from '../src/range/range.js';
import { REQUIREMENTS, WORLD_SYSTEM, looksLikePrerelease, resolve, worldSystemVersion } from '../src/resolve.js';
import { foundryOrder } from '../src/version/foundry.js';
import { makeRelease } from './helpers.js';

import type { Incompatibility } from '../src/solver/solver.js';
import type { Reason, Resolution } from '../src/resolve.js';
import type { Relationship, Release } from '../src/release.js';
import type { CoreRelease, Universe } from '../src/universe.js';

const ops = rangeOps(foundryOrder);

function fixture(name: string, type: 'module' | 'system'): Release {
  const json: unknown = JSON.parse(fs.readFileSync(new URL(`fixtures/manifests/${name}`, import.meta.url), 'utf8'));
  const read = normaliseManifest(json, { origin: name, type });
  if (!read.ok) throw new Error(`${name} should read`);
  return read.release;
}

const system = (id: string, version: string, compatibility: Release['compatibility'] = {}): Release =>
  makeRelease({ package: { type: 'system', id }, version, compatibility, origin: `${id}@${version}` });
const module = (id: string, version: string, fields: Partial<Release> = {}): Release =>
  makeRelease({ id, version, compatibility: { minimum: '13' }, origin: `${id}@${version}`, ...fields });
const relationships = (lists: Partial<Release['relationships']>): Release['relationships'] => ({
  requires: [],
  systems: [],
  conflicts: [],
  recommends: [],
  ...lists,
});
const related = (type: 'module' | 'system', id: string, compatibility: Relationship['compatibility'] = {}) => ({
  package: { type, id },
  compatibility,
});

const core: CoreRelease[] = [
  { version: '13.351', generation: 13, channel: 'stable' },
  { version: '14.368', generation: 14, channel: 'stable' },
  { version: '14.369', generation: 14, channel: 'testing' },
];

const midiQol = fixture('midi-qol-14.0.15.module.json', 'module');
const dnd5eNew = fixture('dnd5e-6.0.6.system.json', 'system');
const dnd5eOld = system('dnd5e', '5.3.3', { minimum: '13.351', verified: '14' });
const support = [module('socketlib', '1.1.3'), module('lib-wrapper', '1.12.15'), module('dae', '14.0.18')];

const universe = (...releases: Release[]): Universe => ({ core, releases });
const midiUniverse = universe(midiQol, dnd5eNew, dnd5eOld, ...support);
const requireMidi = { require: [{ package: 'module:midi-qol' }] };

/** What a resolution chose, as `id@version`, or the reasons at the leaves of its explanation. */
function summary(resolution: Resolution) {
  if ('needs' in resolution) return { needs: resolution.needs.map(n => `${n.package}@${n.version}`) };
  if (!resolution.ok) return { leaves: leaves(resolution.failure) };
  const { setup } = resolution;
  return {
    core: setup.core,
    system: `${setup.system.package.id}@${setup.system.version}`,
    modules: setup.modules.map(m => `${m.package.id}@${m.version}`).sort(),
  };
}

function leaves(incompatibility: Incompatibility<Reason>): string[] {
  const { cause } = incompatibility;
  if (cause.kind === 'derived') return [...new Set([...leaves(cause.conflict), ...leaves(cause.other)])].sort();
  if (cause.kind !== 'external') return [`${cause.kind} ${incompatibility.terms[0]?.package ?? ''}`.trim()];
  const reason = cause.data;
  switch (reason.kind) {
    case 'constraint':
      return [`${reason.constraint.from.package}@${reason.constraint.from.version} ${reason.constraint.kind}`];
    case 'world-system':
      return [`world-system ${reason.system}@${reason.version}`];
    case 'pin':
      return [`pin ${reason.package}@${reason.version}`];
    case 'core-limit':
      return [`core-limit ${reason.version}`];
    default:
      return [`${reason.kind} ${reason.package}`];
  }
}

describe('resolve', () => {
  it('installs midi-qol with the newest stable core, the dnd5e it prefers, and what it requires', () => {
    expect(summary(resolve(midiUniverse, requireMidi))).toEqual({
      core: '14.368',
      system: 'dnd5e@5.3.3',
      modules: ['dae@14.0.18', 'lib-wrapper@1.12.15', 'midi-qol@14.0.15', 'socketlib@1.1.3'],
    });
  });

  it('decides the system after the modules, so that their preferences count, even when the system has fewer versions', () => {
    // Three versions of the module, two of dnd5e: by fewest versions alone, the system would be
    // decided first, before the module could prefer one.
    const versions = ['1.0.0', '1.1.0', '1.2.0'].map(version =>
      module('picky', version, {
        relationships: relationships({
          systems: [related('system', 'dnd5e', { minimum: '5.0.0', maximum: '5.9.99' })],
        }),
      }),
    );
    expect(
      summary(resolve(universe(...versions, dnd5eOld, dnd5eNew), { require: [{ package: 'module:picky' }] })),
    ).toMatchObject({
      system: 'dnd5e@5.3.3',
      modules: ['picky@1.2.0'],
    });
  });

  describe('unlisted releases', () => {
    const lib = (version: string, unlisted = false) => module('lib', version, unlisted ? { unlisted: true } : {});

    it('chooses a listed version over a newer unlisted one', () => {
      const found = resolve(universe(dnd5eOld, lib('3.0.0', true), lib('2.0.0')), {
        require: [{ package: 'module:lib' }],
      });
      expect(summary(found)).toMatchObject({ modules: ['lib@2.0.0'] });
    });

    it('chooses an unlisted version when no listed one fits', () => {
      const atLeast3 = rangeOps(foundryOrder).between({ version: '3', inclusive: true }, undefined);
      const found = resolve(universe(dnd5eOld, lib('3.0.0', true), lib('2.0.0')), {
        require: [{ package: 'module:lib', range: atLeast3 }],
      });
      expect(summary(found)).toMatchObject({ modules: ['lib@3.0.0'] });
    });

    it('ranks an unlisted system after the listed ones', () => {
      expect(summary(resolve(universe({ ...dnd5eNew, unlisted: true }, dnd5eOld), {}))).toMatchObject({
        system: 'dnd5e@5.3.3',
      });
    });
  });

  it('chooses the newest dnd5e when system ranges are ignored', () => {
    expect(summary(resolve(midiUniverse, requireMidi, { policy: { systemCompatibility: 'ignore' } }))).toMatchObject({
      system: 'dnd5e@6.0.6',
    });
  });

  it('explains why midi-qol cannot be installed when only a dnd5e outside its range exists, and the range is required', () => {
    const resolution = resolve(universe(midiQol, dnd5eNew, ...support), requireMidi, {
      policy: { systemCompatibility: 'require' },
    });
    expect(summary(resolution)).toEqual({
      leaves: [
        'module:midi-qol@14.0.15 choice',
        'no-versions module:midi-qol',
        'no-versions world-system',
        'requirement module:midi-qol',
      ],
    });
  });

  it('prefers a core that the releases chosen are verified on to a newer one', () => {
    const coreChannels = ['stable', 'testing'] as const;
    // midi-qol is verified on 14.368, not on the newer testing build 14.369.
    expect(summary(resolve(midiUniverse, requireMidi, { policy: { coreChannels: [...coreChannels] } }))).toMatchObject({
      core: '14.368',
    });
    expect(
      summary(resolve(midiUniverse, requireMidi, { policy: { coreChannels: [...coreChannels], verified: 'ignore' } })),
    ).toMatchObject({ core: '14.369' });
  });

  it('chooses pinned versions, and prefers preferred ones', () => {
    const resolution = resolve(
      midiUniverse,
      {
        ...requireMidi,
        pins: [{ package: 'system:dnd5e', version: '6.0.6' }],
        prefer: [{ package: 'core', version: '14.368' }],
      },
      { policy: { coreChannels: ['stable', 'testing'] } },
    );
    expect(summary(resolution)).toMatchObject({ core: '14.368', system: 'dnd5e@6.0.6' });
  });

  it('explains a pin that cannot be met', () => {
    const resolution = resolve(midiUniverse, { ...requireMidi, pins: [{ package: 'core', version: '13.351' }] });
    expect(summary(resolution)).toEqual({
      leaves: [
        'module:midi-qol@14.0.15 dependency',
        'no-versions module:midi-qol',
        'pin core@13.351',
        'requirement module:midi-qol',
      ],
    });
  });

  it('meets a required range', () => {
    const resolution = resolve(midiUniverse, {
      require: [{ package: 'system:dnd5e', range: ops.between({ version: '6', inclusive: true }, undefined) }],
    });
    expect(summary(resolution)).toEqual({ core: '14.368', system: 'dnd5e@6.0.6', modules: [] });
  });

  describe('a version written with a leading "v"', () => {
    const socketlib = ['1.1.2', '1.1.3', '1.1.4'].map(version => module('socketlib', version));
    const requireSocketlib = { require: [{ package: 'module:socketlib' }] };

    it('pins it as the version without, as a lockfile of what Foundry reports may give it', () => {
      const resolution = resolve(universe(dnd5eOld, ...socketlib), {
        ...requireSocketlib,
        pins: [{ package: 'module:socketlib', version: 'v1.1.2' }],
      });
      expect(summary(resolution)).toMatchObject({ modules: ['socketlib@1.1.2'] });
    });

    it('prefers it as the version without', () => {
      const resolution = resolve(universe(dnd5eOld, ...socketlib), {
        ...requireSocketlib,
        prefer: [{ package: 'module:socketlib', version: 'V1.1.3' }],
      });
      expect(summary(resolution)).toMatchObject({ modules: ['socketlib@1.1.3'] });
    });

    it('takes a release written both ways as one version, the first in the universe', () => {
      // Foundry counts "v1.1.4" newer than any version starting with a digit, so as another version
      // it would be chosen.
      const resolution = resolve(universe(dnd5eOld, ...socketlib, module('socketlib', 'v1.1.4')), requireSocketlib);
      expect(summary(resolution)).toMatchObject({ modules: ['socketlib@1.1.4'] });
    });
  });

  describe('pre-releases', () => {
    const beta = module('dae', '14.0.19-beta.1');
    const withBeta = universe(midiQol, dnd5eOld, ...support, beta);

    it('leaves them out by default', () => {
      expect(summary(resolve(withBeta, requireMidi)).modules).toContain('dae@14.0.18');
    });

    it('includes them when the policy does', () => {
      expect(summary(resolve(withBeta, requireMidi, { policy: { prereleases: 'include' } })).modules).toContain(
        'dae@14.0.19-beta.1',
      );
    });

    it('allows a pinned one', () => {
      const pins = [{ package: 'module:dae', version: '14.0.19-beta.1' }];
      expect(summary(resolve(withBeta, { ...requireMidi, pins })).modules).toContain('dae@14.0.19-beta.1');
    });

    it.each([
      ['1.0.0-beta.1', true],
      ['2.0.0rc1', true],
      ['3.0.0-alpha', true],
      ['14.0.18', false],
      ['2023-04-08', false],
    ])('reads %s as a pre-release: %s', (version, expected) => {
      expect(looksLikePrerelease(version)).toBe(expected);
    });
  });

  describe('conflicts and unusable releases', () => {
    const breaker = module('breaker', '1.0.0', {
      relationships: relationships({ conflicts: [related('module', 'lib-wrapper')] }),
    });

    it('refuses a setup with a conflict', () => {
      const resolution = resolve(universe(midiQol, dnd5eOld, ...support, breaker), {
        require: [{ package: 'module:midi-qol' }, { package: 'module:breaker' }],
      });
      expect(summary(resolution)).toMatchObject({ leaves: expect.arrayContaining(['module:breaker@1.0.0 exclusion']) });
    });

    it('allows it when conflicts only warn', () => {
      const resolution = resolve(
        universe(midiQol, dnd5eOld, ...support, breaker),
        { require: [{ package: 'module:midi-qol' }, { package: 'module:breaker' }] },
        { policy: { conflicts: 'warn' } },
      );
      expect(resolution.ok).toBe(true);
    });

    it('refuses a release with no core compatibility when the policy rejects it', () => {
      const bare = makeRelease({ id: 'bare', version: '1.0.0', origin: 'bare' });
      const resolution = resolve(
        universe(dnd5eOld, bare),
        { require: [{ package: 'module:bare' }] },
        {
          policy: { missingCompatibility: 'reject' },
        },
      );
      expect(summary(resolution)).toEqual({
        leaves: ['module:bare@1.0.0 unusable', 'no-versions module:bare', 'requirement module:bare'],
      });
    });
  });

  describe('systems', () => {
    const pf2e = system('pf2e', '7.2.0');

    it('runs a module in one of its systems', () => {
      const either = module('either', '1.0.0', {
        relationships: relationships({ systems: [related('system', 'pf2e'), related('system', 'dnd5e')] }),
      });
      expect(
        summary(resolve(universe(either, dnd5eOld, pf2e), { require: [{ package: 'module:either' }] })),
      ).toMatchObject({
        system: 'dnd5e@5.3.3',
      });
      const pf2eOnly = module('pf2e-only', '1.0.0', {
        relationships: relationships({ systems: [related('system', 'pf2e')] }),
      });
      expect(
        summary(resolve(universe(pf2eOnly, dnd5eOld, pf2e), { require: [{ package: 'module:pf2e-only' }] })),
      ).toMatchObject({
        system: 'pf2e@7.2.0',
      });
    });

    it('has one system in a setup, so two required systems cannot both be met', () => {
      const resolution = resolve(universe(dnd5eOld, pf2e), {
        require: [{ package: 'system:dnd5e' }, { package: 'system:pf2e' }],
      });
      expect(summary(resolution)).toMatchObject({
        leaves: expect.arrayContaining(['world-system system:dnd5e@5.3.3', 'world-system system:pf2e@7.2.0']),
      });
    });

    it('needs a system for a setup', () => {
      expect(summary(resolve(universe(module('alone', '1.0.0')), {}))).toEqual({
        leaves: ['no-versions world-system', 'setup world-system'],
      });
    });

    it('writes world-system versions as a system and its version', () => {
      expect(worldSystemVersion('dnd5e', '5.3.3')).toBe('dnd5e@5.3.3');
      expect([WORLD_SYSTEM, REQUIREMENTS]).toEqual(['world-system', 'requirements']);
    });
  });

  it('explains that a required package has no releases in the universe', () => {
    expect(summary(resolve(universe(dnd5eOld), { require: [{ package: 'module:missing' }] }))).toEqual({
      leaves: ['no-versions module:missing', 'requirement module:missing'],
    });
  });

  it('uses the first release of a version given twice', () => {
    const first = module('dup', '1.0.0', { origin: 'first' });
    const second = module('dup', '1.0.0', { origin: 'second' });
    const resolution = resolve(universe(dnd5eOld, first, second), { require: [{ package: 'module:dup' }] });
    expect(resolution.ok && resolution.setup.modules[0]?.origin).toBe('first');
  });

  it('passes on the warnings about version orders', () => {
    const odd = [module('odd', '9'), module('odd', '10a')];
    const resolution = resolve(universe(dnd5eOld, ...odd), { require: [{ package: 'module:odd' }] });
    expect(resolution.warnings).toEqual([
      { code: 'foundry-disagreement', package: 'module:odd', pairs: [['9', '10a']] },
    ]);
  });
});
