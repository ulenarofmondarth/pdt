import { PackageRelease } from '@mondarth/fvtt-package-catalogue-contract';
import { describe, expect, it, vi } from 'vitest';
import { catalogueSet } from '../../src/sources/catalogue-set.js';
import { makeRelease } from '../helpers.js';

import type { LookupRequest, LookupResponse } from '@mondarth/fvtt-package-catalogue-contract';
import type { PackageRef } from '../../src/release.js';
import type { Catalogue } from '../../src/sources/catalogue.js';
import type { SourceResult } from '../../src/sources/types.js';

const module = (id: string): PackageRef => ({ type: 'module', id });
const CORE = [{ version: '14.368', generation: 14, channel: 'stable' }] as const;

/** A package as a lookup gives it, with these releases. */
const given = (id: string, versions: string[] = ['1.0.0']): LookupResponse['packages'][number] => ({
  package: module(id),
  title: id.toUpperCase(),
  latest: null,
  premium: false,
  syncedAt: '2026-11-05T09:00:00.000Z',
  own: { version: null, readAt: null, checkedAt: null },
  // Without its package, as a lookup gives it.
  releases: versions.map(version => PackageRelease.parse(makeRelease({ id, version }))),
});

/** A catalogue that answers each lookup with the next of these, recording what it was asked. */
function catalogueAnswering(...answers: SourceResult<Partial<LookupResponse>>[]) {
  const lookup = vi.fn<(request: LookupRequest) => Promise<SourceResult<LookupResponse>>>(() => {
    const next = answers.shift();
    if (next === undefined) throw new Error('asked once too often');
    return Promise.resolve(
      next.ok
        ? {
            ok: true,
            value: {
              core: [...CORE],
              packages: [],
              pending: [],
              unavailable: [],
              unreached: [],
              asOf: null,
              ...next.value,
            },
          }
        : next,
    );
  });
  const unused = () => Promise.reject(new Error('not asked'));
  const catalogue: Catalogue = {
    name: 'catalogue',
    lookup,
    listing: unused,
    core: unused,
    recheck: unused,
    manifest: unused,
  };
  return { catalogue, lookup };
}

describe('catalogueSet', () => {
  it('gives the universe of a lookup, each release with its package, and Foundry VTT builds', async () => {
    const { catalogue, lookup } = catalogueAnswering({
      ok: true,
      value: { packages: [given('a', ['1.0.0', '2.0.0'])] },
    });
    const set = catalogueSet({ catalogue });
    expect(await set.universe([module('a')])).toEqual({
      core: CORE,
      releases: [makeRelease({ id: 'a', version: '1.0.0' }), makeRelease({ id: 'a', version: '2.0.0' })],
    });
    expect(lookup).toHaveBeenCalledWith({ packages: [module('a')] });
    expect(set.core()).toEqual(CORE);
  });

  it('looks up with the versions installed, the manifests given and the generation to look from', async () => {
    const { catalogue, lookup } = catalogueAnswering({ ok: true, value: {} });
    const asked = [{ ...module('a'), installed: '1.0.0', manifest: 'https://example.test/a.json' }];
    await catalogueSet({ catalogue, fromGeneration: 14 }).lookUp(asked);
    expect(lookup).toHaveBeenCalledWith({ packages: asked, fromGeneration: 14 });
  });

  it('says what the catalogue said of each package, and keeps it', async () => {
    const { catalogue } = catalogueAnswering({
      ok: true,
      value: { packages: [{ ...given('a'), own: { version: '1.0.1', readAt: 'r', checkedAt: 'c' }, latest: '1.0.1' }] },
    });
    const set = catalogueSet({ catalogue });
    const found = await set.lookUp([module('a')]);
    const described = {
      package: module('a'),
      title: 'A',
      latest: '1.0.1',
      premium: false,
      syncedAt: '2026-11-05T09:00:00.000Z',
      own: { version: '1.0.1', readAt: 'r', checkedAt: 'c' },
    };
    expect(found.packages).toEqual([described]);
    expect(set.packageOf('module:a')).toEqual(described);
    expect(set.packageOf('module:b')).toBeUndefined();
  });

  it('keeps what is pending until a lookup gives it, and what is unavailable and unreached', async () => {
    const { catalogue } = catalogueAnswering(
      {
        ok: true,
        value: {
          pending: [{ package: module('new'), retryAfter: 30 }],
          unavailable: [{ package: module('gone'), reason: 'gone' }],
          unreached: [module('flaky')],
        },
      },
      { ok: true, value: { packages: [given('new')], unreached: [module('flaky')] } },
    );
    const set = catalogueSet({ catalogue });
    expect((await set.lookUp([module('new')])).pending).toEqual([{ package: module('new'), retryAfter: 30 }]);
    expect(set.pending()).toEqual([{ package: module('new'), retryAfter: 30 }]);
    // Asked again after it was given: no longer pending.
    expect((await set.lookUp([module('new')])).pending).toEqual([]);
    expect(set.pending()).toEqual([]);
    expect(set.unavailable()).toEqual([{ package: module('gone'), reason: 'gone' }]);
    expect(set.unreached()).toEqual([module('flaky')]);
  });

  it('finds nothing when the catalogue cannot be reached, and its gap says so', async () => {
    const gap = { source: 'catalogue', url: 'https://catalogue.test/api/v2/lookup', reason: 'network' } as const;
    const { catalogue } = catalogueAnswering({ ok: false, gap });
    const set = catalogueSet({ catalogue });
    expect(await set.universe([module('a')])).toEqual({ core: [], releases: [] });
    expect(set.gaps()).toEqual([gap]);
    expect(set.core()).toEqual([]);
  });

  it('asks nothing for no packages, and loads nothing, as the catalogue gives what it could load', async () => {
    const { catalogue, lookup } = catalogueAnswering();
    const set = catalogueSet({ catalogue });
    expect(await set.lookUp([])).toEqual({ universe: { core: [], releases: [] }, packages: [], pending: [] });
    expect(await set.load([makeRelease({ id: 'a', version: '1.0.0', detail: 'listed' })])).toEqual([]);
    expect(lookup).not.toHaveBeenCalled();
  });
});
