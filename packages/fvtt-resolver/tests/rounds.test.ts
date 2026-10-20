import { describe, expect, it } from 'vitest';
import { check } from '../src/check.js';
import { coreCompatibility, releaseConstraints } from '../src/constraints.js';
import { withDefaults } from '../src/policy.js';
import { resolve } from '../src/resolve.js';
import { resolveInRounds } from '../src/rounds.js';
import { chooseOrders } from '../src/universe.js';
import { makeRelease } from './helpers.js';

import type { PackageVersion, Resolution } from '../src/resolve.js';
import type { Release } from '../src/release.js';
import type { CoreRelease, Universe } from '../src/universe.js';

const core: CoreRelease[] = [
  { version: '13.351', generation: 13, channel: 'stable' },
  { version: '14.368', generation: 14, channel: 'stable' },
];
const dnd5e = makeRelease({
  package: { type: 'system', id: 'dnd5e' },
  version: '5.3.3',
  compatibility: { minimum: '13' },
});

/** A release known only from a listing, as Foundry's package details give it. */
const listed = (id: string, version: string, listing: Release['compatibility'] = { minimum: '13' }): Release =>
  makeRelease({ id, version, compatibility: listing, listing, detail: 'listed', origin: `listing:${id}` });

const relationships = (lists: Partial<Release['relationships']>): Release['relationships'] => ({
  requires: [],
  systems: [],
  conflicts: [],
  recommends: [],
  ...lists,
});

// app needs lib. lib 2.0.0's manifest says it conflicts with app, which its listing cannot show.
const app = makeRelease({
  id: 'app',
  version: '1.0.0',
  compatibility: { minimum: '13' },
  relationships: relationships({ requires: [{ package: { type: 'module', id: 'lib' }, compatibility: {} }] }),
});
const manifests: Release[] = [
  makeRelease({
    id: 'lib',
    version: '2.0.0',
    compatibility: { minimum: '13' },
    relationships: relationships({ conflicts: [{ package: { type: 'module', id: 'app' }, compatibility: {} }] }),
  }),
  makeRelease({ id: 'lib', version: '1.0.0', compatibility: { minimum: '13' } }),
];
const universe: Universe = { core, releases: [dnd5e, app, listed('lib', '2.0.0'), listed('lib', '1.0.0')] };
const requireApp = { require: [{ package: 'module:app' }] };

/** A loader over the manifests, which records what it is asked for. */
function loader(available: readonly Release[] = manifests) {
  const asked: string[][] = [];
  const load = (needs: readonly PackageVersion[]) => {
    asked.push(needs.map(n => `${n.package}@${n.version}`));
    return Promise.resolve(
      available.filter(r => needs.some(n => n.package === `module:${r.package.id}` && n.version === r.version)),
    );
  };
  return { asked, load };
}

const chosen = (resolution: Resolution) =>
  resolution.ok ? resolution.setup.modules.map(m => `${m.package.id}@${m.version}`).sort() : resolution;

describe('resolve, with listed releases', () => {
  it('asks for the listed releases it chose, before the answer is final', () => {
    expect(resolve(universe, requireApp)).toEqual({
      ok: false,
      needs: [{ package: 'module:lib', version: '2.0.0' }],
      warnings: [],
    });
  });

  it('asks for the listed releases a failure leans on', () => {
    // lib's listing says it needs core 15, which no known core is; its manifest may say otherwise.
    const tooNew = { core, releases: [dnd5e, app, listed('lib', '2.0.0', { minimum: '15' })] };
    expect(resolve(tooNew, requireApp)).toMatchObject({
      ok: false,
      needs: [{ package: 'module:lib', version: '2.0.0' }],
    });
  });
});

describe('resolveInRounds', () => {
  it('loads what each round needs until the answer is final, going back when a manifest says more', async () => {
    const { asked, load } = loader();
    const { resolution, rounds, unloaded, universe: after } = await resolveInRounds(universe, requireApp, load);
    expect(chosen(resolution)).toEqual(['app@1.0.0', 'lib@1.0.0']);
    expect(rounds).toBe(3);
    expect(asked).toEqual([['module:lib@2.0.0'], ['module:lib@1.0.0']]);
    expect(unloaded).toEqual([]);
    expect(after.releases.filter(r => r.package.id === 'lib').map(r => r.detail)).toEqual(['loaded', 'loaded']);
  });

  it('keeps a listing’s bounds on the release it loads', async () => {
    const { universe: after } = await resolveInRounds(universe, requireApp, loader().load);
    expect(after.releases.find(r => r.package.id === 'lib' && r.version === '1.0.0')?.listing).toEqual({
      minimum: '13',
    });
    const withOwn = [{ ...(manifests[1] as Release), listing: { minimum: '13.300' } }];
    const { universe: own } = await resolveInRounds(
      { ...universe, releases: [dnd5e, app, listed('lib', '1.0.0')] },
      requireApp,
      loader(withOwn).load,
    );
    expect(own.releases.find(r => r.package.id === 'lib')?.listing).toEqual({ minimum: '13.300' });
  });

  it('loads a listed release that has no listing bounds as its manifest has it', async () => {
    const bare = makeRelease({ id: 'lib', version: '1.0.0', compatibility: { minimum: '13' }, detail: 'listed' });
    const { universe: after } = await resolveInRounds(
      { ...universe, releases: [dnd5e, app, bare] },
      requireApp,
      loader().load,
    );
    expect(after.releases.find(r => r.package.id === 'lib')).toEqual(manifests[1]);
  });

  it('uses a release as listed when it cannot be loaded, and says so', async () => {
    const { resolution, rounds, unloaded } = await resolveInRounds(universe, requireApp, loader([]).load);
    expect(chosen(resolution)).toEqual(['app@1.0.0', 'lib@2.0.0']);
    expect(rounds).toBe(2);
    expect(unloaded).toEqual([{ package: 'module:lib', version: '2.0.0' }]);
  });

  it('does not count a release the loader returns still listed as loaded', async () => {
    const { unloaded } = await resolveInRounds(universe, requireApp, loader([listed('lib', '2.0.0')]).load);
    expect(unloaded).toEqual([{ package: 'module:lib', version: '2.0.0' }]);
  });

  it('stops after the most rounds allowed, with the last answer', async () => {
    const { resolution, rounds } = await resolveInRounds(universe, requireApp, loader().load, { maxRounds: 1 });
    expect(rounds).toBe(1);
    expect(resolution).toMatchObject({ ok: false, needs: [{ package: 'module:lib', version: '2.0.0' }] });
  });

  describe('when a listing and a manifest disagree on core', () => {
    // The listing says lib needs core 15; its manifest says 13.
    const disagreeing = { core, releases: [dnd5e, app, listed('lib', '2.0.0', { minimum: '15' })] };
    const manifest = [makeRelease({ id: 'lib', version: '2.0.0', compatibility: { minimum: '13' } })];

    it('trusts the listing by default, so cannot install lib', async () => {
      const { resolution, rounds } = await resolveInRounds(disagreeing, requireApp, loader(manifest).load);
      expect(rounds).toBe(2);
      expect(resolution.ok === false && 'failure' in resolution).toBe(true);
    });

    it('trusts the manifest under listingCompatibility: ignore', async () => {
      const { resolution } = await resolveInRounds(disagreeing, requireApp, loader(manifest).load, {
        policy: { listingCompatibility: 'ignore' },
      });
      expect(chosen(resolution)).toEqual(['app@1.0.0', 'lib@2.0.0']);
    });
  });
});

describe('coreCompatibility', () => {
  const release = makeRelease({
    compatibility: { minimum: '13', maximum: '14', verified: '13' },
    listing: { verified: '14' },
  });

  it('takes the listing’s minimum and verified when the policy prefers it, keeping the manifest’s maximum', () => {
    expect(coreCompatibility(release, { listingCompatibility: 'prefer' })).toEqual({
      compatibility: { minimum: '13', maximum: '14', verified: '14' },
      fromListing: true,
    });
  });

  it('keeps the manifest’s when the policy ignores the listing, or there is none, or it is empty', () => {
    const manifest = { compatibility: { minimum: '13', maximum: '14', verified: '13' }, fromListing: false };
    expect(coreCompatibility(release, { listingCompatibility: 'ignore' })).toEqual(manifest);
    expect(coreCompatibility({ ...release, listing: {} }, { listingCompatibility: 'prefer' })).toEqual(manifest);
    const unlisted = makeRelease({ compatibility: release.compatibility });
    expect(coreCompatibility(unlisted, { listingCompatibility: 'prefer' })).toEqual(manifest);
  });

  it('traces the core constraints to the listing when it is used', () => {
    const policy = withDefaults();
    const constraints = releaseConstraints(release, {
      orders: chooseOrders({ core, releases: [release] }, policy),
      policy,
    });
    expect(constraints.map(c => [c.kind, c.provenance.field, c.provenance.policy])).toEqual([
      ['dependency', 'listing', 'listingCompatibility'],
      ['preference', 'listing.verified', 'verified'],
    ]);
    const required = withDefaults({ verified: 'require' });
    const strict = releaseConstraints(release, {
      orders: chooseOrders({ core, releases: [release] }, required),
      policy: required,
    });
    expect(strict.map(c => [c.kind, c.provenance.field])).toEqual([
      ['dependency', 'listing'],
      ['dependency', 'listing.verified'],
    ]);
  });
});

describe('check, with listed releases', () => {
  it('says which releases it could check only from their listing', () => {
    const result = check(
      { core, releases: [dnd5e, listed('lib', '2.0.0')] },
      {
        core: '14.368',
        system: { package: 'system:dnd5e', version: '5.3.3' },
        modules: [{ package: 'module:lib', version: '2.0.0' }],
      },
    );
    expect(result.listed).toEqual([{ package: 'module:lib', version: '2.0.0' }]);
    expect(
      check({ core, releases: [dnd5e] }, { core: '14.368', system: { package: 'system:dnd5e', version: '5.3.3' } })
        .listed,
    ).toEqual([]);
  });
});
