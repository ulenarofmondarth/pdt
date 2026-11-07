import { describe, expect, it, vi } from 'vitest';
import { catalogueSource } from '../../src/sources/catalogue.js';
import { makeRelease } from '../helpers.js';

import type { PackageRef } from '../../src/release.js';

const URL_BASE = 'https://catalogue.test/';
const module = (id: string): PackageRef => ({ type: 'module', id });

/** A `fetch` answering each request with the next of these, recording what was asked. */
function fetchAnswering(...responses: (() => Response | Promise<Response>)[]) {
  const fetch = vi.fn<typeof globalThis.fetch>(() => {
    const next = responses.shift();
    if (next === undefined) throw new Error('asked once too often');
    return Promise.resolve(next());
  });
  const bodies = () => fetch.mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as { packages: PackageRef[] });
  return { fetch, bodies };
}

describe('catalogueSource', () => {
  const { package: ref, ...given } = makeRelease({ id: 'a', version: '1.0.0' });
  const looked = (overrides: Record<string, unknown> = {}) => ({
    core: [{ version: '14.368', generation: 14, channel: 'stable' }],
    packages: [
      {
        package: ref,
        title: 'A',
        latest: null,
        premium: false,
        syncedAt: '2026-11-05T09:00:00.000Z',
        own: { version: null, readAt: null, checkedAt: null },
        releases: [given],
      },
    ],
    pending: [],
    unavailable: [],
    unreached: [],
    asOf: '2026-11-05T09:00:00.000Z',
    ...overrides,
  });
  const of = (fetch: typeof globalThis.fetch) =>
    catalogueSource({ url: URL_BASE, key: 'k', client: 'EMMA/1.0.0', fetch });

  it('looks packages up, with what the client knows of them and the generation to look from', async () => {
    const { fetch } = fetchAnswering(() => Response.json(looked()));
    const asked = {
      packages: [{ ...module('a'), installed: '1.0.0', manifest: 'https://example.test/a.json' }],
      fromGeneration: 14,
    };
    expect(await of(fetch).lookup(asked)).toEqual({ ok: true, value: looked() });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://catalogue.test/api/v2/lookup');
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'X-API-Key': 'k', 'X-Catalogue-Client': 'EMMA/1.0.0', 'Content-Type': 'application/json' },
      body: JSON.stringify(asked),
    });
  });

  it('looks many packages up in parts, and joins the answers', async () => {
    const many = Array.from({ length: 1001 }, (_, i) => module(`m${String(i)}`));
    const b = { ...looked().packages[0], package: module('b') };
    const { fetch, bodies } = fetchAnswering(
      () =>
        Response.json(
          looked({
            pending: [
              { package: module('b'), retryAfter: 30 },
              { package: module('x'), retryAfter: 30 },
            ],
            unreached: [module('a')],
            unavailable: [{ package: module('gone'), reason: 'gone' }],
          }),
        ),
      () =>
        Response.json(
          looked({
            core: [{ version: '14.369', generation: 14, channel: 'testing' }],
            // A package the first part gave already is given once, as the first part gave it.
            packages: [b, { ...looked().packages[0], title: 'Another A' }],
            unreached: [module('a')],
            unavailable: [{ package: module('gone'), reason: 'gone' }],
            asOf: '2026-11-05T08:00:00.000Z',
          }),
        ),
    );
    const found = await of(fetch).lookup({ packages: many });
    expect(bodies().map(body => body.packages.length)).toEqual([1000, 1]);
    expect(found).toEqual({
      ok: true,
      value: {
        core: [
          { version: '14.368', generation: 14, channel: 'stable' },
          { version: '14.369', generation: 14, channel: 'testing' },
        ],
        packages: [looked().packages[0], b],
        // b is held by the second part.
        pending: [{ package: module('x'), retryAfter: 30 }],
        unavailable: [{ package: module('gone'), reason: 'gone' }],
        unreached: [module('a')],
        asOf: '2026-11-05T08:00:00.000Z',
      },
    });
  });

  it('is as of no time when a part of a lookup is', async () => {
    const many = Array.from({ length: 1001 }, (_, i) => module(`m${String(i)}`));
    const { fetch } = fetchAnswering(
      () => Response.json(looked({ asOf: null })),
      () => Response.json(looked()),
    );
    const found = await of(fetch).lookup({ packages: many });
    expect(found.ok && found.value.asOf).toBeNull();
  });

  it('is as of the oldest time of the parts of a lookup, whichever part it is', async () => {
    const many = Array.from({ length: 1001 }, (_, i) => module(`m${String(i)}`));
    for (const [first, second] of [
      ['2026-11-05T09:00:00.000Z', '2026-11-04T09:00:00.000Z'],
      ['2026-11-04T09:00:00.000Z', '2026-11-05T09:00:00.000Z'],
    ]) {
      const { fetch } = fetchAnswering(
        () => Response.json(looked({ asOf: first })),
        () => Response.json(looked({ asOf: second })),
      );
      const found = await of(fetch).lookup({ packages: many });
      expect(found.ok && found.value.asOf).toBe('2026-11-04T09:00:00.000Z');
    }
  });

  it('asks the catalogue of an empty lookup, which says what is wrong with it', async () => {
    const { fetch } = fetchAnswering(() => new Response('', { status: 400 }));
    expect(await of(fetch).lookup({ packages: [] })).toMatchObject({ ok: false, gap: { reason: 'http', status: 400 } });
  });

  it('gives the listing, of a type, with the ETag to revalidate it by', async () => {
    const listing = { packages: [], asOf: null };
    const { fetch } = fetchAnswering(
      () => Response.json(listing, { headers: { ETag: '"l1"' } }),
      () => Response.json(listing),
    );
    const catalogue = of(fetch);
    expect(await catalogue.listing({ type: 'module' })).toEqual({
      ok: true,
      value: { notModified: false, value: listing, etag: '"l1"' },
    });
    expect(String(fetch.mock.calls[0]?.[0])).toBe('https://catalogue.test/api/v2/listing?type=module');
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: 'GET' });
    expect(fetch.mock.calls[0]?.[1]?.headers).not.toHaveProperty('Content-Type');
    // Both types, and no ETag given back.
    expect(await catalogue.listing()).toEqual({ ok: true, value: { notModified: false, value: listing } });
    expect(String(fetch.mock.calls[1]?.[0])).toBe('https://catalogue.test/api/v2/listing');
  });

  it('is told the listing it kept is still the listing', async () => {
    const { fetch } = fetchAnswering(() => new Response(null, { status: 304 }));
    expect(await of(fetch).listing({ etag: '"l1"' })).toEqual({ ok: true, value: { notModified: true } });
    expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ 'If-None-Match': '"l1"' });
  });

  it('gives an http gap for a 304 to a request that kept nothing', async () => {
    const { fetch } = fetchAnswering(() => new Response(null, { status: 304 }));
    expect(await of(fetch).listing()).toMatchObject({ ok: false, gap: { reason: 'http', status: 304 } });
  });

  it("gives Foundry VTT's builds, revalidated as the listing is", async () => {
    const core = { core: [{ version: '14.368', generation: 14, channel: 'stable' }] };
    const { fetch } = fetchAnswering(
      () => Response.json(core, { headers: { ETag: '"c1"' } }),
      () => new Response(null, { status: 304 }),
    );
    const catalogue = of(fetch);
    expect(await catalogue.core()).toEqual({ ok: true, value: { notModified: false, value: core, etag: '"c1"' } });
    expect(String(fetch.mock.calls[0]?.[0])).toBe('https://catalogue.test/api/v2/core');
    expect(await catalogue.core({ etag: '"c1"' })).toEqual({ ok: true, value: { notModified: true } });
  });

  it('has own manifests rechecked, in parts of at most fifty, joined', async () => {
    const many = Array.from({ length: 51 }, (_, i) => module(`m${String(i)}`));
    const checked = (id: string) => ({
      package: module(id),
      own: { version: '2.0.0', readAt: null, checkedAt: null },
      changed: true,
    });
    const { fetch, bodies } = fetchAnswering(
      () => Response.json({ packages: [checked('m0')], pending: [{ package: module('m0'), retryAfter: 30 }] }),
      () => Response.json({ packages: [checked('m50')], pending: [] }),
    );
    expect(await of(fetch).recheck(many)).toEqual({
      ok: true,
      value: { packages: [checked('m0'), checked('m50')], pending: [{ package: module('m0'), retryAfter: 30 }] },
    });
    expect(bodies().map(body => body.packages.length)).toEqual([50, 1]);
    expect(String(fetch.mock.calls[0]?.[0])).toBe('https://catalogue.test/api/v2/recheck');
  });

  it('reads a manifest URL a user gives', async () => {
    const answerGiven = { ok: false, problem: 'not-manifest' };
    const { fetch } = fetchAnswering(() => Response.json(answerGiven));
    expect(await of(fetch).manifest('https://example.test/module.json', 'module')).toEqual({
      ok: true,
      value: answerGiven,
    });
    expect(String(fetch.mock.calls[0]?.[0])).toBe('https://catalogue.test/api/v2/manifest');
    expect(fetch.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ url: 'https://example.test/module.json', type: 'module' }),
    );
  });

  it('finds the API under a base with a path of its own, with or without a trailing slash', async () => {
    for (const url of ['https://example.test/catalogue/', 'https://example.test/catalogue']) {
      const { fetch } = fetchAnswering(() => Response.json(looked()));
      await catalogueSource({ url, key: 'k', fetch }).lookup({ packages: [module('a')] });
      expect(String(fetch.mock.calls[0]?.[0])).toBe('https://example.test/catalogue/api/v2/lookup');
    }
  });

  it('sends no client header when none is named', async () => {
    const { fetch } = fetchAnswering(() => Response.json(looked()));
    await catalogueSource({ url: URL_BASE, key: 'k', fetch }).lookup({ packages: [module('a')] });
    expect(fetch.mock.calls[0]?.[1]?.headers).not.toHaveProperty('X-Catalogue-Client');
  });

  it('gives the gap of the first part of a lookup that fails, asking no more', async () => {
    const many = Array.from({ length: 2001 }, (_, i) => module(`m${String(i)}`));
    const { fetch } = fetchAnswering(
      () => Response.json(looked()),
      () => new Response('', { status: 503 }),
    );
    expect(await of(fetch).lookup({ packages: many })).toMatchObject({ ok: false, gap: { status: 503 } });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('refuses a base that is not a URL', () => {
    expect(() => catalogueSource({ url: 'catalogue', key: 'k', fetch: vi.fn() })).toThrow(/catalogue/);
  });

  it('gives a gap for what it cannot reach, an error answer, and one that breaks the contract', async () => {
    for (const [response, reason] of [
      [() => Promise.reject(new TypeError('fetch failed')), 'network'],
      [() => new Response('', { status: 503 }), 'http'],
      [() => new Response('<html>'), 'invalid'],
      [() => Response.json({ packages: 'no' }), 'invalid'],
    ] as const) {
      const { fetch } = fetchAnswering(response);
      expect(await of(fetch).listing()).toMatchObject({
        ok: false,
        gap: { source: 'catalogue', url: 'https://catalogue.test/api/v2/listing', reason },
      });
    }
  });
});
