import { describe, expect, it } from 'vitest';
import { foundryIndexSource } from '../../src/sources/foundry-index.js';
import { httpClient } from '../../src/sources/http.js';
import { INDEX, details, detailsOf, index, manifest } from './foundry-data.js';
import { fakeFetch } from './fake-fetch.js';

import type { Answer } from './fake-fetch.js';

const module = (id: string) => ({ type: 'module' as const, id });
const answers = (extra: Record<string, Answer> = {}) => ({
  [INDEX]: { body: index() },
  ...Object.fromEntries(Object.entries(detailsOf).map(([id, body]) => [details(id), { body }])),
  ...extra,
});

describe('foundryIndexSource', () => {
  it('lists a package’s versions from its details file, as listed releases with their listing’s bounds', async () => {
    const { fetch } = fakeFetch(answers());
    const found = await foundryIndexSource(httpClient({ fetch }), { indexUrl: INDEX }).releases(
      module('example-module'),
    );
    expect(found).toEqual({
      ok: true,
      value: [
        {
          package: module('example-module'),
          version: '2.0.0',
          compatibility: { minimum: '14', verified: '14.368' },
          listing: { minimum: '14', verified: '14.368' },
          relationships: { requires: [], systems: [], conflicts: [], recommends: [] },
          manifest: manifest('example-module', '2.0.0'),
          protected: false,
          origin: details('example-module'),
          detail: 'listed',
        },
        expect.objectContaining({ version: '1.0.0', compatibility: { minimum: '13', verified: '13' } }),
      ],
    });
  });

  it('marks a premium package’s releases protected', async () => {
    const { fetch } = fakeFetch(answers());
    const found = await foundryIndexSource(httpClient({ fetch }), { indexUrl: INDEX }).releases(
      module('example-premium'),
    );
    expect(found.ok && found.value.map(r => [r.protected, r.compatibility])).toEqual([[true, {}]]);
  });

  it('knows no releases of a package the index does not list, or lists as another type', async () => {
    const { fetch } = fakeFetch(answers());
    const source = foundryIndexSource(httpClient({ fetch }), { indexUrl: INDEX });
    expect(await source.releases(module('unknown'))).toEqual({ ok: true, value: [] });
    expect(await source.releases({ type: 'system', id: 'example-module' })).toEqual({ ok: true, value: [] });
  });

  it('fetches a details file again only when the package’s last update changes', async () => {
    let time = 0;
    let lastUpdated = '2026-10-01';
    const { fetch, requests } = fakeFetch({
      ...answers(),
      [INDEX]: () => ({ body: index({ 'example-module': lastUpdated }) }),
    });
    const source = foundryIndexSource(httpClient({ fetch, now: () => time }), { indexUrl: INDEX });
    const detailsFetched = () => requests.filter(r => r.url === details('example-module')).length;
    await source.releases(module('example-module'));
    time += 10 * 60_000;
    await source.releases(module('example-module'));
    expect(detailsFetched()).toBe(1);
    lastUpdated = '2026-10-20';
    time += 10 * 60_000;
    await source.releases(module('example-module'));
    expect(detailsFetched()).toBe(2);
  });

  it('reads the index from Foundry’s address by default', async () => {
    const { fetch, requests } = fakeFetch({});
    await foundryIndexSource(httpClient({ fetch })).releases(module('x'));
    expect(requests[0]?.url).toBe('https://r2.foundryvtt.com/package-api-public/index-latest.json');
  });

  describe('records a gap', () => {
    it.each([
      ['when the index cannot be fetched', { [INDEX]: { status: 500 } }, { url: INDEX, reason: 'http', status: 500 }],
      ['when the index cannot be read', { [INDEX]: { body: { packages: 'none' } } }, { url: INDEX, reason: 'invalid' }],
      [
        'when the details cannot be fetched',
        { [details('example-module')]: { status: 404 } },
        { url: details('example-module'), reason: 'http', status: 404 },
      ],
      [
        'when the details cannot be read',
        { [details('example-module')]: { body: { versions: 'none' } } },
        { url: details('example-module'), reason: 'invalid' },
      ],
    ])('%s', async (_, extra, gap) => {
      const { fetch } = fakeFetch(answers(extra as Record<string, Answer>));
      const found = await foundryIndexSource(httpClient({ fetch }), { indexUrl: INDEX }).releases(
        module('example-module'),
      );
      expect(found).toEqual({ ok: false, gap: { source: 'foundry-index', package: 'module:example-module', ...gap } });
    });
  });
});
