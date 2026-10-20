import { describe, expect, it } from 'vitest';
import { resolveInRounds } from '../../src/rounds.js';
import { foundryIndexSource } from '../../src/sources/foundry-index.js';
import { httpClient } from '../../src/sources/http.js';
import { sourceSet } from '../../src/sources/source-set.js';
import { makeRelease } from '../helpers.js';
import { INDEX, details, detailsOf, index, manifest, manifests } from './foundry-data.js';
import { fakeFetch } from './fake-fetch.js';

import type { Release } from '../../src/release.js';
import type { ReleaseSource } from '../../src/sources/types.js';
import type { CoreRelease } from '../../src/universe.js';
import type { Answer } from './fake-fetch.js';

const core: CoreRelease[] = [
  { version: '13.351', generation: 13, channel: 'stable' },
  { version: '14.368', generation: 14, channel: 'stable' },
  { version: '12.331', generation: 12, channel: 'stable' },
];
const module = (id: string) => ({ type: 'module' as const, id });
const answers = (extra: Record<string, Answer> = {}) => ({
  [INDEX]: { body: index() },
  ...Object.fromEntries(Object.entries(detailsOf).map(([id, body]) => [details(id), { body }])),
  ...Object.fromEntries(Object.entries(manifests).map(([url, body]) => [url, { body }])),
  ...extra,
});

function setup(extra: Record<string, Answer> = {}, sources?: (http: ReturnType<typeof httpClient>) => ReleaseSource[]) {
  const { fetch, requests } = fakeFetch(answers(extra));
  const http = httpClient({ fetch });
  const set = sourceSet({ sources: sources?.(http) ?? [foundryIndexSource(http, { indexUrl: INDEX })], http, core });
  return { set, requests };
}

const fixed = (name: string, releases: Release[]): ReleaseSource => ({
  name,
  releases: ref => Promise.resolve({ ok: true, value: releases.filter(r => r.package.id === ref.id) }),
});

describe('sourceSet', () => {
  it('builds a universe from the listings, leaving out releases no core of interest can run', async () => {
    const { set } = setup();
    const universe = await set.universe([module('example-module'), module('example-lib')]);
    expect(universe.core).toBe(core);
    // example-lib 3.0.0 needs core 15, newer than any core of interest.
    expect(universe.releases.map(r => `${r.package.id}@${r.version}:${r.detail}`)).toEqual([
      'example-module@2.0.0:listed',
      'example-module@1.0.0:listed',
      'example-lib@2.1.0:listed',
    ]);
  });

  it('takes each version from the first source that lists it, and records the gaps of those that fail', async () => {
    const own = makeRelease({ id: 'example-lib', version: '2.1.0', origin: 'own' });
    const extra = makeRelease({ id: 'example-lib', version: '1.0.0', origin: 'own' });
    const failing: ReleaseSource = {
      name: 'failing',
      releases: () => Promise.resolve({ ok: false, gap: { source: 'failing', url: 'x', reason: 'network' } }),
    };
    const { set } = setup({}, http => [
      failing,
      fixed('own', [own, extra]),
      foundryIndexSource(http, { indexUrl: INDEX }),
    ]);
    const universe = await set.universe([module('example-lib')]);
    expect(universe.releases.map(r => `${r.version}:${r.origin}`)).toEqual(['2.1.0:own', '1.0.0:own']);
    expect(set.gaps()).toEqual([{ source: 'failing', url: 'x', reason: 'network' }]);
  });

  it('keeps every release when no core is of interest', async () => {
    const { fetch } = fakeFetch(answers());
    const http = httpClient({ fetch });
    const set = sourceSet({ sources: [foundryIndexSource(http, { indexUrl: INDEX })], http, core: [] });
    expect((await set.universe([module('example-lib')])).releases.map(r => r.version)).toEqual(['3.0.0', '2.1.0']);
  });

  describe('load', () => {
    it('loads a listed release from its manifest, keeping the listing’s bounds, and lists the packages it names', async () => {
      const { set } = setup();
      const [listed] = (await set.universe([module('example-module')])).releases;
      const loaded = await set.load([listed as Release]);
      expect(loaded.map(r => `${r.package.type}:${r.package.id}@${r.version}:${r.detail}`)).toEqual([
        'module:example-module@2.0.0:loaded',
        'module:example-lib@2.1.0:listed',
        'system:example-system@5.0.0:listed',
      ]);
      expect(loaded[0]).toMatchObject({
        listing: { minimum: '14', verified: '14.368' },
        origin: manifest('example-module', '2.0.0'),
      });
    });

    it('reads a manifest whose version has a leading v as the version listed', async () => {
      const listed = makeRelease({
        id: 'vee',
        version: '1.1.4',
        manifest: 'https://example.org/vee.json',
        detail: 'listed',
      });
      const { set } = setup({ 'https://example.org/vee.json': { body: { id: 'vee', version: 'v1.1.4' } } });
      expect((await set.load([listed])).map(r => `${r.version}:${r.detail}`)).toEqual(['1.1.4:loaded']);
    });

    it('does not list a package already known again', async () => {
      const { set, requests } = setup();
      const universe = await set.universe([
        module('example-module'),
        module('example-lib'),
        { type: 'system', id: 'example-system' },
      ]);
      const loaded = await set.load([universe.releases[0] as Release]);
      expect(loaded).toHaveLength(1);
      expect(requests.filter(r => r.url === details('example-lib'))).toHaveLength(1);
    });

    it('does not list a world a release names', async () => {
      const worldly = makeRelease({
        id: 'worldly',
        version: '1.0.0',
        manifest: 'https://example.org/worldly.json',
        detail: 'listed',
      });
      const { set } = setup({
        'https://example.org/worldly.json': {
          body: { id: 'worldly', version: '1.0.0', relationships: { requires: [{ id: 'a-world', type: 'world' }] } },
        },
      });
      expect((await set.load([worldly])).map(r => r.package.id)).toEqual(['worldly']);
    });

    it.each([
      [
        'has no manifest URL',
        makeRelease({ id: 'x', detail: 'listed', origin: 'listing' }),
        {},
        { url: 'listing', reason: 'invalid' },
      ],
      [
        'is a world',
        makeRelease({ package: { type: 'world', id: 'w' }, manifest: 'https://example.org/w.json', detail: 'listed' }),
        {},
        { url: 'https://example.org/w.json', reason: 'invalid' },
      ],
      [
        'has a manifest that cannot be fetched',
        makeRelease({ id: 'x', manifest: 'https://example.org/gone.json', detail: 'listed' }),
        {},
        { url: 'https://example.org/gone.json', reason: 'http', status: 404 },
      ],
      [
        'has a manifest that cannot be read',
        makeRelease({ id: 'x', manifest: 'https://example.org/bad.json', detail: 'listed' }),
        { 'https://example.org/bad.json': { body: { version: '1' } } },
        { url: 'https://example.org/bad.json', reason: 'invalid' },
      ],
      [
        'has a manifest of another package',
        makeRelease({ id: 'x', manifest: 'https://example.org/other.json', detail: 'listed' }),
        { 'https://example.org/other.json': { body: { id: 'y', version: '1.0.0' } } },
        { url: 'https://example.org/other.json', reason: 'invalid' },
      ],
      [
        'has a manifest of another version, such as one that always describes the newest',
        makeRelease({ id: 'x', manifest: 'https://example.org/latest.json', detail: 'listed' }),
        { 'https://example.org/latest.json': { body: { id: 'x', version: '9.9.9' } } },
        { url: 'https://example.org/latest.json', reason: 'invalid' },
      ],
    ])('records a gap for a release that %s', async (_, release, extra, gap) => {
      const { set } = setup(extra as Record<string, Answer>);
      expect(await set.load([release])).toEqual([]);
      expect(set.gaps()).toEqual([
        {
          source: 'manifest',
          package: `${release.package.type}:${release.package.id}`,
          version: release.version,
          ...gap,
        },
      ]);
    });
  });

  it('resolves in rounds from the index alone: listing, loading, and finding the packages loaded releases name', async () => {
    const { set } = setup();
    const universe = await set.universe([module('example-module')]);
    const { resolution, rounds } = await resolveInRounds(
      universe,
      { require: [{ package: 'module:example-module' }] },
      set.load,
    );
    expect(
      resolution.ok && {
        core: resolution.setup.core,
        system: `${resolution.setup.system.package.id}@${resolution.setup.system.version}`,
        modules: resolution.setup.modules.map(m => `${m.package.id}@${m.version}`).sort(),
      },
    ).toEqual({
      core: '14.368',
      system: 'example-system@5.0.0',
      modules: ['example-lib@2.1.0', 'example-module@2.0.0'],
    });
    expect(rounds).toBe(3);
    expect(set.gaps()).toEqual([]);
  });
});
