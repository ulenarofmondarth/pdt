import { describe, expect, it } from 'vitest';
import { resolveInRounds } from '../../src/rounds.js';
import { AVAILABILITY } from '../../src/availability.js';
import { check } from '../../src/check.js';
import { githubSource } from '../../src/sources/forge.js';
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

  describe('hints', () => {
    /** A source that records the hints it is given, and lists one release with a manifest URL. */
    function recording(name: string, version: string) {
      const hints: unknown[] = [];
      const source: ReleaseSource = {
        name,
        releases: (ref, given) => {
          hints.push(given);
          return Promise.resolve({
            ok: true,
            value: [
              makeRelease({
                id: ref.id,
                version,
                manifest: `https://example.org/${name}/${version}.json`,
                detail: 'listed',
              }),
            ],
          });
        },
      };
      return { source, hints };
    }

    it('tells each source the manifests declared for the package and those earlier sources listed', async () => {
      const first = recording('first', '2.0.0');
      const second = recording('second', '1.0.0');
      const { fetch } = fakeFetch({});
      const http = httpClient({ fetch });
      const set = sourceSet({
        sources: [first.source, second.source],
        http,
        core: [],
        manifests: { 'module:example-lib': ['https://example.org/declared.json'] },
      });
      await set.universe([module('example-lib')]);
      expect(first.hints).toEqual([{ declared: ['https://example.org/declared.json'], seen: [] }]);
      expect(second.hints).toEqual([
        { declared: ['https://example.org/declared.json'], seen: ['https://example.org/first/2.0.0.json'] },
      ]);
    });

    it('takes the manifests a loaded release’s relationships declare as hints for the packages they name', async () => {
      const recorder = recording('recorder', '1.0.0');
      const { set } = setup(
        {
          'https://example.org/app.json': {
            body: {
              id: 'app',
              version: '1.0.0',
              relationships: { requires: [{ id: 'helper', manifest: 'https://example.org/helper/module.json' }] },
            },
          },
        },
        () => [recorder.source],
      );
      await set.load([
        makeRelease({ id: 'app', version: '1.0.0', manifest: 'https://example.org/app.json', detail: 'listed' }),
      ]);
      expect(recorder.hints).toEqual([{ declared: ['https://example.org/helper/module.json'], seen: [] }]);
    });
  });

  it('fills in from GitHub the history Foundry’s index does not list', async () => {
    const githubApi = 'https://api.github.com/repos/example/example-lib/releases?per_page=100';
    const download = (tag: string) => `https://github.com/example/example-lib/releases/download/${tag}/module.json`;
    const { fetch } = fakeFetch(
      answers({
        [details('example-lib')]: {
          body: { versions: [{ version: '2.1.0', minimum: '13', manifest: download('v2.1.0') }] },
        },
        [githubApi]: {
          body: [
            { tag_name: 'v2.1.0', assets: [{ name: 'module.json', browser_download_url: download('v2.1.0') }] },
            { tag_name: 'v2.0.0', assets: [{ name: 'module.json', browser_download_url: download('v2.0.0') }] },
          ],
        },
      }),
    );
    const http = httpClient({ fetch });
    const set = sourceSet({ sources: [foundryIndexSource(http, { indexUrl: INDEX }), githubSource(http)], http, core });
    const universe = await set.universe([module('example-lib')]);
    expect(universe.releases.map(r => `${r.version}:${r.origin}`)).toEqual([
      `2.1.0:${details('example-lib')}`,
      `2.0.0:${githubApi}`,
    ]);
  });

  describe('bounds from manifests', () => {
    const githubApi = 'https://api.github.com/repos/example/example-lib/releases?per_page=100';
    const download = (tag: string) => `https://github.com/example/example-lib/releases/download/${tag}/module.json`;
    const tags = ['v2.1.0', 'v2.0.0', 'v1.0.0', 'v0.9.0'];
    const github = {
      body: tags.map(tag => ({
        tag_name: tag,
        assets: [{ name: 'module.json', browser_download_url: download(tag) }],
      })),
    };
    const manifestOf = (version: string, compatibility: Record<string, string>) => ({
      body: { id: 'example-lib', version, compatibility },
    });
    const listedOnly = { body: { versions: [{ version: '2.1.0', minimum: '13', manifest: download('v2.1.0') }] } };

    function withForge(extra: Record<string, Answer> = {}, options: { manifestBounds?: boolean } = {}) {
      const { fetch, requests } = fakeFetch(
        answers({
          [details('example-lib')]: listedOnly,
          [githubApi]: github,
          [download('v2.0.0')]: manifestOf('2.0.0', { minimum: '13', verified: '13', maximum: '13' }),
          [download('v1.0.0')]: manifestOf('v1.0.0', { minimum: '15' }),
          ...extra,
        }),
      );
      const http = httpClient({ fetch });
      const set = sourceSet({
        sources: [foundryIndexSource(http, { indexUrl: INDEX }), githubSource(http)],
        http,
        core,
        ...options,
      });
      return { set, requests };
    }

    it('takes a forge release’s bounds from its manifest, keeping it listed', async () => {
      const { set } = withForge();
      const lib = (await set.universe([module('example-lib')])).releases.find(r => r.version === '2.0.0');
      expect(lib).toMatchObject({ detail: 'listed', compatibility: { minimum: '13', verified: '13', maximum: '13' } });
      expect(lib).not.toHaveProperty('listing');
    });

    it('leaves out a release its manifest says no core of interest can run', async () => {
      const { set } = withForge();
      const versions = (await set.universe([module('example-lib')])).releases.map(r => r.version);
      expect(versions).not.toContain('1.0.0');
    });

    it('asks only for the manifests of releases with no bounds, and not again when loading them', async () => {
      const { set, requests } = withForge();
      const universe = await set.universe([module('example-lib')]);
      const asked = requests.map(r => r.url);
      expect(asked).not.toContain(download('v2.1.0'));
      expect(asked.filter(url => url === download('v2.0.0'))).toHaveLength(1);
      await set.load(universe.releases.filter(r => r.version === '2.0.0'));
      expect(requests.map(r => r.url).filter(url => url === download('v2.0.0'))).toHaveLength(1);
    });

    it('marks a release whose manifest cannot be read, and records why', async () => {
      const { set } = withForge();
      const universe = await set.universe([module('example-lib')]);
      expect(universe.releases.find(r => r.version === '0.9.0')).toMatchObject({ loadFailed: true, compatibility: {} });
      expect(set.gaps()).toContainEqual(
        expect.objectContaining({ source: 'manifest', url: download('v0.9.0'), reason: 'http', status: 404 }),
      );
    });

    it('gives check Foundry’s verdict for a forge release, rather than UNKNOWN', async () => {
      const { set } = withForge();
      const universe = await set.universe([module('example-lib')]);
      const result = check(
        {
          ...universe,
          releases: [...universe.releases, makeRelease({ package: { type: 'system', id: 'sys' }, version: '1.0.0' })],
        },
        {
          core: '14.368',
          system: { package: 'system:sys', version: '1.0.0' },
          modules: [{ package: 'module:example-lib', version: '2.0.0' }],
        },
      );
      const lib = result.releases.find(r => r.release.package.id === 'example-lib');
      expect(lib?.availability).toBe(AVAILABILITY.REQUIRES_CORE_DOWNGRADE);
    });

    it('can be turned off', async () => {
      const { set, requests } = withForge({}, { manifestBounds: false });
      const universe = await set.universe([module('example-lib')]);
      expect(universe.releases.find(r => r.version === '2.0.0')?.compatibility).toEqual({});
      expect(requests.map(r => r.url)).not.toContain(download('v2.0.0'));
    });
  });

  describe('releases newer than the listing offers', () => {
    const githubApi = 'https://api.github.com/repos/example/example-lib/releases?per_page=100';
    const download = (tag: string) => `https://github.com/example/example-lib/releases/download/${tag}/module.json`;
    const tags = ['v2.5.0', 'v2.1.0', 'v2.0.0'];
    const github = {
      body: tags.map(tag => ({
        tag_name: tag,
        assets: [{ name: 'module.json', browser_download_url: download(tag) }],
      })),
    };
    const listedOnly = { body: { versions: [{ version: '2.1.0', minimum: '13', manifest: download('v2.1.0') }] } };

    async function versionsWith(unlisted?: 'exclude' | 'last' | 'include', extra: Record<string, Answer> = {}) {
      const { fetch } = fakeFetch(answers({ [details('example-lib')]: listedOnly, [githubApi]: github, ...extra }));
      const http = httpClient({ fetch });
      const set = sourceSet({
        sources: [foundryIndexSource(http, { indexUrl: INDEX }), githubSource(http)],
        http,
        core,
        ...(unlisted && { unlisted }),
      });
      return (await set.universe([module('example-lib')])).releases.map(
        r => `${r.version}${r.unlisted === true ? ' unlisted' : ''}`,
      );
    }

    it('leaves them out by default, keeping the older history', async () => {
      expect(await versionsWith()).toEqual(['2.1.0', '2.0.0']);
      expect(await versionsWith('exclude')).toEqual(['2.1.0', '2.0.0']);
    });

    it('keeps them, marked, under last', async () => {
      expect(await versionsWith('last')).toEqual(['2.1.0', '2.5.0 unlisted', '2.0.0']);
    });

    it('keeps them as they are under include', async () => {
      expect(await versionsWith('include')).toEqual(['2.1.0', '2.5.0', '2.0.0']);
    });

    it('keeps every release of a package the listing does not list', async () => {
      const notListed = { body: { ...index(), packages: index().packages.filter(p => p.id !== 'example-lib') } };
      const { fetch } = fakeFetch(answers({ [INDEX]: notListed, [githubApi]: github }));
      const http = httpClient({ fetch });
      // Nothing lists it, so a declared manifest URL is how GitHub finds its repository.
      const set = sourceSet({
        sources: [foundryIndexSource(http, { indexUrl: INDEX }), githubSource(http)],
        http,
        core,
        manifests: { 'module:example-lib': [download('v2.5.0')] },
      });
      const found = (await set.universe([module('example-lib')])).releases;
      expect(found.map(r => `${r.version}${r.unlisted === true ? ' unlisted' : ''}`)).toEqual([
        '2.5.0',
        '2.1.0',
        '2.0.0',
      ]);
    });

    it('takes the listing from the source named', async () => {
      const own = fixed('own', [makeRelease({ id: 'example-lib', version: '2.0.0', origin: 'own' })]);
      const later = fixed('later', [makeRelease({ id: 'example-lib', version: '9.0.0', origin: 'later' })]);
      const { fetch } = fakeFetch({});
      const http = httpClient({ fetch });
      const set = sourceSet({ sources: [own, later], http, core, listing: 'own' });
      expect((await set.universe([module('example-lib')])).releases.map(r => r.version)).toEqual(['2.0.0']);
    });

    it('keeps the mark when a release is loaded', async () => {
      const { set } = setup({ 'https://example.org/lib.json': { body: { id: 'example-lib', version: '2.5.0' } } });
      const marked = makeRelease({
        id: 'example-lib',
        version: '2.5.0',
        manifest: 'https://example.org/lib.json',
        detail: 'listed',
        unlisted: true,
      });
      expect((await set.load([marked]))[0]?.unlisted).toBe(true);
    });
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
