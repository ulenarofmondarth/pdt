import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AVAILABILITY } from '../src/availability.js';
import { check } from '../src/check.js';
import { normaliseManifest } from '../src/manifest/normalise.js';
import { makeRelease } from './helpers.js';

import type { CheckResult, SetupSpec } from '../src/check.js';
import type { Relationship, Release } from '../src/release.js';
import type { CoreRelease, Universe } from '../src/universe.js';

function fixture(name: string, type: 'module' | 'system'): Release {
  const json: unknown = JSON.parse(fs.readFileSync(new URL(`fixtures/manifests/${name}`, import.meta.url), 'utf8'));
  const read = normaliseManifest(json, { origin: name, type });
  if (!read.ok) throw new Error(`${name} should read`);
  return read.release;
}

const system = (id: string, version: string, fields: Partial<Release> = {}): Release =>
  makeRelease({
    package: { type: 'system', id },
    version,
    compatibility: { minimum: '13', verified: '14' },
    origin: id,
    ...fields,
  });
const module = (id: string, version: string, fields: Partial<Release> = {}): Release =>
  makeRelease({ id, version, compatibility: { minimum: '13', verified: '14' }, origin: id, ...fields });
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
];
const midiQol = fixture('midi-qol-14.0.15.module.json', 'module');
const dnd5eNew = fixture('dnd5e-6.0.6.system.json', 'system');
const dnd5eOld = system('dnd5e', '5.3.3');
const support = [module('socketlib', '1.1.3'), module('lib-wrapper', '1.12.15'), module('dae', '14.0.18')];

const universe = (...releases: Release[]): Universe => ({ core, releases });
const everything = universe(midiQol, dnd5eNew, dnd5eOld, ...support);
const midiSetup = (dnd5e: string, modules = ['socketlib@1.1.3', 'lib-wrapper@1.12.15', 'dae@14.0.18']): SetupSpec => ({
  core: '14.368',
  system: { package: 'system:dnd5e', version: dnd5e },
  modules: ['midi-qol@14.0.15', ...modules].map(m => {
    const [id, version] = m.split('@') as [string, string];
    return { package: `module:${id}`, version };
  }),
});

/** The verdict and findings for one release, by id. */
function about(result: CheckResult, id: string) {
  const found = result.releases.find(r => r.release.package.id === id);
  if (found === undefined) throw new Error(`No check of ${id}`);
  return {
    availability: found.availability,
    broken: found.broken.map(c => `${c.kind} ${c.provenance.field}`),
    missed: found.missed.map(c => `${c.reason} ${c.on}`),
    advisories: found.advisories.map(c => `${c.reason} ${c.on}`),
  };
}

describe('check', () => {
  it('finds midi-qol’s setup valid, and verified, with the dnd5e it supports', () => {
    const result = check(everything, midiSetup('5.3.3'));
    expect(result.valid).toBe(true);
    expect(about(result, 'midi-qol')).toEqual({
      availability: AVAILABILITY.VERIFIED,
      broken: [],
      missed: [],
      advisories: [],
    });
    expect(about(result, 'dnd5e').availability).toBe(AVAILABILITY.VERIFIED);
    expect(result.unknown).toEqual([]);
  });

  it('finds a version given with a leading "v", as Foundry gives socketlib’s, as the release without', () => {
    const result = check(everything, midiSetup('5.3.3', ['socketlib@v1.1.3', 'lib-wrapper@1.12.15', 'dae@14.0.18']));
    expect(result.unknown).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('checks a version given with a leading "v" against bounds as the release’s own version', () => {
    const user = module('socket-user', '1.0.0', {
      relationships: relationships({ requires: [related('module', 'socketlib', { maximum: '1.2' })] }),
    });
    const result = check(universe(dnd5eOld, user, ...support), {
      core: '14.368',
      system: { package: 'system:dnd5e', version: '5.3.3' },
      modules: [
        { package: 'module:socket-user', version: '1.0.0' },
        { package: 'module:socketlib', version: 'v1.1.3' },
      ],
    });
    expect(about(result, 'socket-user').broken).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('gives midi-qol on dnd5e 6.0.6 Foundry’s unverified system, which the default policy allows', () => {
    const result = check(everything, midiSetup('6.0.6'));
    expect(result.valid).toBe(true);
    expect(about(result, 'midi-qol')).toMatchObject({
      availability: AVAILABILITY.UNVERIFIED_SYSTEM,
      missed: ['system-compatibility system:dnd5e'],
    });
  });

  it('finds that setup invalid when system ranges are required', () => {
    const result = check(everything, midiSetup('6.0.6'), { policy: { systemCompatibility: 'require' } });
    expect(result.valid).toBe(false);
    expect(about(result, 'midi-qol').broken).toEqual(['choice relationships.systems']);
  });

  it('gives a missing dependency when a required module is absent, out of range, or unusable', () => {
    expect(
      about(check(everything, midiSetup('5.3.3', ['socketlib@1.1.3', 'lib-wrapper@1.12.15'])), 'midi-qol'),
    ).toMatchObject({
      availability: AVAILABILITY.MISSING_DEPENDENCY,
      broken: ['dependency relationships.requires[2]'],
    });
    const oldDae = module('dae', '14.0.10');
    expect(
      about(
        check(
          universe(midiQol, dnd5eOld, ...support, oldDae),
          midiSetup('5.3.3', ['socketlib@1.1.3', 'lib-wrapper@1.12.15', 'dae@14.0.10']),
        ),
        'midi-qol',
      ).availability,
    ).toBe(AVAILABILITY.MISSING_DEPENDENCY);
    const futureDae = module('dae', '15.0.0', { compatibility: { minimum: '15' } });
    const result = check(
      universe(midiQol, dnd5eOld, ...support, futureDae),
      midiSetup('5.3.3', ['socketlib@1.1.3', 'lib-wrapper@1.12.15', 'dae@15.0.0']),
    );
    expect(about(result, 'dae').availability).toBe(AVAILABILITY.REQUIRES_CORE_UPGRADE_UNKNOWN);
    expect(about(result, 'midi-qol').availability).toBe(AVAILABILITY.MISSING_DEPENDENCY);
  });

  it('gives the core verdict for an older core', () => {
    const result = check(everything, { ...midiSetup('5.3.3'), core: '13.351' });
    expect(about(result, 'midi-qol')).toMatchObject({
      availability: AVAILABILITY.REQUIRES_CORE_UPGRADE_STABLE,
      broken: ['dependency compatibility'],
    });
  });

  it('gives an unverified system, as Foundry checks it last, over a missing dependency', () => {
    const pf2e = system('pf2e', '7.2.0');
    const result = check(universe(midiQol, pf2e, ...support), {
      core: '14.368',
      system: { package: 'system:pf2e', version: '7.2.0' },
      modules: [{ package: 'module:midi-qol', version: '14.0.15' }],
    });
    expect(about(result, 'midi-qol').availability).toBe(AVAILABILITY.UNVERIFIED_SYSTEM);
    expect(about(result, 'midi-qol').broken).toContain('choice relationships.systems');
  });

  it('gives an unverified system when the listed system is unusable on this core', () => {
    const tooNew = system('dnd5e', '7.0.0', { compatibility: { minimum: '15' } });
    const result = check(universe(midiQol, tooNew, ...support), midiSetup('7.0.0'));
    expect(about(result, 'midi-qol').availability).toBe(AVAILABILITY.UNVERIFIED_SYSTEM);
  });

  it('gives a system a missing dependency', () => {
    const needy = system('needy', '1.0.0', {
      relationships: relationships({ requires: [related('module', 'helper')] }),
    });
    const result = check(universe(needy), { core: '14.368', system: { package: 'system:needy', version: '1.0.0' } });
    expect(about(result, 'needy').availability).toBe(AVAILABILITY.MISSING_DEPENDENCY);
  });

  it('does not count a requirement that is not a module, as Foundry does not', () => {
    const odd = module('odd', '1.0.0', { relationships: relationships({ requires: [related('system', 'pf2e')] }) });
    const result = check(universe(dnd5eOld, odd), {
      core: '14.368',
      system: { package: 'system:dnd5e', version: '5.3.3' },
      modules: [{ package: 'module:odd', version: '1.0.0' }],
    });
    expect(about(result, 'odd')).toMatchObject({ availability: AVAILABILITY.VERIFIED, broken: [] });
  });

  it('reports a version the universe does not have, and does not count the setup valid', () => {
    const result = check(everything, {
      ...midiSetup('5.3.3'),
      modules: [{ package: 'module:ghost', version: '1.0.0' }],
    });
    expect(result.unknown).toEqual([{ package: 'module:ghost', version: '1.0.0' }]);
    expect(result.valid).toBe(false);
    const noSystem = check(everything, {
      core: '14.368',
      system: { package: 'system:ghost', version: '1' },
      modules: [{ package: 'module:midi-qol', version: '14.0.15' }],
    });
    expect(about(noSystem, 'midi-qol').availability).toBe(AVAILABILITY.UNVERIFIED_SYSTEM);
  });

  describe('what the resolver finds beyond Foundry', () => {
    const breaker = module('breaker', '1.0.0', {
      relationships: relationships({
        conflicts: [related('module', 'lib-wrapper')],
        recommends: [related('module', 'helper')],
      }),
    });
    const withBreaker = universe(midiQol, dnd5eOld, ...support, breaker);
    const setup = midiSetup('5.3.3', ['socketlib@1.1.3', 'lib-wrapper@1.12.15', 'dae@14.0.18', 'breaker@1.0.0']);

    it('finds a conflict Foundry would not, and a recommendation not installed', () => {
      const result = check(withBreaker, setup);
      expect(result.valid).toBe(false);
      expect(about(result, 'breaker')).toEqual({
        availability: AVAILABILITY.VERIFIED,
        broken: ['exclusion relationships.conflicts[0]'],
        missed: [],
        advisories: ['recommends module:helper'],
      });
    });

    it('only warns of the conflict when the policy says so', () => {
      const result = check(withBreaker, setup, { policy: { conflicts: 'warn' } });
      expect(result.valid).toBe(true);
      expect(about(result, 'breaker').advisories).toEqual(['conflict module:lib-wrapper', 'recommends module:helper']);
    });

    it('does not report a recommendation that is installed', () => {
      const helper = module('helper', '1.0.0');
      const result = check(
        universe(midiQol, dnd5eOld, ...support, breaker, helper),
        {
          ...setup,
          modules: [...(setup.modules ?? []), { package: 'module:helper', version: '1.0.0' }],
        },
        { policy: { conflicts: 'warn' } },
      );
      expect(about(result, 'breaker').advisories).toEqual(['conflict module:lib-wrapper']);
    });

    it('finds a release that cannot be used under the policy', () => {
      const bare = makeRelease({ id: 'bare', version: '1.0.0', origin: 'bare' });
      const result = check(
        universe(dnd5eOld, bare),
        {
          core: '14.368',
          system: { package: 'system:dnd5e', version: '5.3.3' },
          modules: [{ package: 'module:bare', version: '1.0.0' }],
        },
        { policy: { missingCompatibility: 'reject' } },
      );
      expect(about(result, 'bare')).toMatchObject({
        availability: AVAILABILITY.UNKNOWN,
        broken: ['unusable compatibility'],
      });
    });

    it('finds a core newer than a release is verified on', () => {
      const result = check(universe(dnd5eOld), { core: '15.1', system: { package: 'system:dnd5e', version: '5.3.3' } });
      expect(about(result, 'dnd5e')).toMatchObject({
        availability: AVAILABILITY.UNVERIFIED_GENERATION,
        missed: ['verified core'],
      });
    });
  });

  it('passes on the warnings about version orders', () => {
    const odd = [module('odd', '9'), module('odd', '10a')];
    expect(
      check(universe(dnd5eOld, ...odd), { core: '14.368', system: { package: 'system:dnd5e', version: '5.3.3' } })
        .warnings,
    ).toEqual([{ code: 'foundry-disagreement', package: 'module:odd', pairs: [['9', '10a']] }]);
  });
});
