import { describe, expect, it } from 'vitest';
import { httpClient } from '../../src/sources/http.js';
import { manifestUrlSource } from '../../src/sources/manifest-url.js';
import { fakeFetch } from './fake-fetch.js';

const module = { type: 'module' as const, id: 'example-module' };
const LATEST = 'https://example.org/example-module/latest/module.json';

describe('manifestUrlSource', () => {
  it('reads the release a declared manifest URL describes, already loaded', async () => {
    const { fetch } = fakeFetch({ [LATEST]: { body: { id: 'example-module', version: '2.0.0', manifest: LATEST } } });
    const found = await manifestUrlSource(httpClient({ fetch })).releases(module, {
      declared: [LATEST, LATEST],
      seen: [],
    });
    expect(found.ok && found.value.map(r => [r.version, r.detail, r.manifest])).toEqual([['2.0.0', 'loaded', LATEST]]);
  });

  it('keeps the URL as the release’s manifest when the manifest names none', async () => {
    const { fetch } = fakeFetch({ [LATEST]: { body: { id: 'example-module', version: '2.0.0' } } });
    const found = await manifestUrlSource(httpClient({ fetch })).releases(module, { declared: [LATEST], seen: [] });
    expect(found.ok && found.value[0]?.manifest).toBe(LATEST);
  });

  it('does not read the manifests other sources listed, which are one per version', async () => {
    const { fetch, requests } = fakeFetch({});
    expect(await manifestUrlSource(httpClient({ fetch })).releases(module, { declared: [], seen: [LATEST] })).toEqual({
      ok: true,
      value: [],
    });
    expect(await manifestUrlSource(httpClient({ fetch })).releases(module)).toEqual({ ok: true, value: [] });
    expect(requests).toEqual([]);
  });

  it('knows nothing of a world', async () => {
    const { fetch } = fakeFetch({});
    expect(
      await manifestUrlSource(httpClient({ fetch })).releases(
        { type: 'world', id: 'w' },
        { declared: [LATEST], seen: [] },
      ),
    ).toEqual({
      ok: true,
      value: [],
    });
  });

  it('records a gap when no URL gives a release of the package, but not when another does', async () => {
    const other = 'https://example.org/other/module.json';
    const { fetch } = fakeFetch({
      [other]: { body: { id: 'other-module', version: '1.0.0' } },
      [LATEST]: { body: { id: 'example-module', version: '2.0.0' } },
    });
    const source = manifestUrlSource(httpClient({ fetch }));
    expect(await source.releases(module, { declared: [other], seen: [] })).toEqual({
      ok: false,
      gap: { source: 'manifest-url', url: other, reason: 'invalid', package: 'module:example-module' },
    });
    expect(await source.releases(module, { declared: ['https://example.org/gone.json'], seen: [] })).toEqual({
      ok: false,
      gap: {
        source: 'manifest-url',
        url: 'https://example.org/gone.json',
        reason: 'http',
        status: 404,
        package: 'module:example-module',
      },
    });
    const both = await source.releases(module, { declared: [other, LATEST], seen: [] });
    expect(both.ok && both.value.map(r => r.version)).toEqual(['2.0.0']);
  });
});
