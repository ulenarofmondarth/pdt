import { describe, expect, it, vi } from 'vitest';
import { catalogueSource } from '../../src/sources/catalogue.js';
import { makeRelease } from '../helpers.js';

import type { PackageRef } from '../../src/release.js';

const URL_BASE = 'https://catalogue.test/';
const UNIVERSE = 'https://catalogue.test/api/v1/universe';
const module = (id: string): PackageRef => ({ type: 'module', id });

/** What the catalogue answers, as the contract shapes it. */
const answer = (overrides: Record<string, unknown> = {}) => ({
  universe: {
    core: [{ version: '14.368', generation: 14, channel: 'stable' }],
    releases: [makeRelease({ id: 'a', version: '1.0.0' })],
  },
  gaps: [],
  pending: [],
  asOf: '2026-10-25T12:00:00.000Z',
  ...overrides,
});

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
  it('posts the packages to the universe, with the key and the client, and reads the answer', async () => {
    const { fetch } = fetchAnswering(() => Response.json(answer()));
    const catalogue = catalogueSource({ url: URL_BASE, key: 'k', client: 'EMMA/0.7.0', fetch });
    expect(await catalogue.universe([module('a')])).toEqual({
      ok: true,
      value: {
        core: [{ version: '14.368', generation: 14, channel: 'stable' }],
        releases: [makeRelease({ id: 'a', version: '1.0.0' })],
        gaps: [],
        pending: [],
        asOf: '2026-10-25T12:00:00.000Z',
      },
    });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe(UNIVERSE);
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'X-API-Key': 'k', 'X-Catalogue-Client': 'EMMA/0.7.0', 'Content-Type': 'application/json' },
      body: JSON.stringify({ packages: [module('a')] }),
    });
  });

  it('finds the API under a base with a path of its own, with or without a trailing slash', async () => {
    for (const url of ['https://example.test/catalogue/', 'https://example.test/catalogue']) {
      const { fetch } = fetchAnswering(() => Response.json(answer()));
      await catalogueSource({ url, key: 'k', fetch }).universe([module('a')]);
      expect(String(fetch.mock.calls[0]?.[0])).toBe('https://example.test/catalogue/api/v1/universe');
    }
  });

  it('sends no client header when none is named', async () => {
    const { fetch } = fetchAnswering(() => Response.json(answer()));
    await catalogueSource({ url: URL_BASE, key: 'k', fetch }).universe([module('a')]);
    expect(fetch.mock.calls[0]?.[1]?.headers).not.toHaveProperty('X-Catalogue-Client');
  });

  it('asks nothing for no packages', async () => {
    const { fetch } = fetchAnswering();
    expect(await catalogueSource({ url: URL_BASE, key: 'k', fetch }).universe([])).toEqual({
      ok: true,
      value: { core: [], releases: [], gaps: [], pending: [], asOf: null },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('asks for many packages in parts the catalogue accepts, and joins the answers', async () => {
    const many = Array.from({ length: 1001 }, (_, i) => module(`m${String(i)}`));
    const { fetch, bodies } = fetchAnswering(
      () =>
        Response.json(
          answer({
            pending: [module('x')],
            gaps: [{ source: 's', url: 'u', reason: 'http' }],
            asOf: '2026-10-25T12:00:00.000Z',
          }),
        ),
      () =>
        Response.json(
          answer({
            universe: {
              core: [{ version: '14.368', generation: 14, channel: 'stable' }],
              releases: [makeRelease({ id: 'b', version: '2.0.0' })],
            },
            pending: [module('x'), module('y')],
            asOf: '2026-10-25T09:00:00.000Z',
          }),
        ),
    );
    const found = await catalogueSource({ url: URL_BASE, key: 'k', fetch }).universe(many);
    expect(bodies().map(body => body.packages.length)).toEqual([1000, 1]);
    expect(found).toEqual({
      ok: true,
      value: {
        // Builds and releases once each, however many parts gave them.
        core: [{ version: '14.368', generation: 14, channel: 'stable' }],
        releases: [makeRelease({ id: 'a', version: '1.0.0' }), makeRelease({ id: 'b', version: '2.0.0' })],
        gaps: [{ source: 's', url: 'u', reason: 'http' }],
        pending: [module('x'), module('y')],
        // The oldest of the parts'.
        asOf: '2026-10-25T09:00:00.000Z',
      },
    });
  });

  it('gives a package once when it is held by one part and pending in another', async () => {
    const many = Array.from({ length: 1001 }, (_, i) => module(`m${String(i)}`));
    const { fetch } = fetchAnswering(
      () => Response.json(answer({ universe: { core: [], releases: [makeRelease({ id: 'a', version: '1.0.0' })] } })),
      () => Response.json(answer({ universe: { core: [], releases: [] }, pending: [module('a')] })),
    );
    const found = await catalogueSource({ url: URL_BASE, key: 'k', fetch }).universe(many);
    expect(found.ok && found.value.pending).toEqual([]);
  });

  it('is as of no time when a part is', async () => {
    const many = Array.from({ length: 1001 }, (_, i) => module(`m${String(i)}`));
    const { fetch } = fetchAnswering(
      () => Response.json(answer()),
      () => Response.json(answer({ asOf: null })),
    );
    const found = await catalogueSource({ url: URL_BASE, key: 'k', fetch }).universe(many);
    expect(found.ok && found.value.asOf).toBeNull();
  });

  it('gives an http gap for an error answer', async () => {
    const { fetch } = fetchAnswering(() =>
      Response.json({ error: { code: 'unauthorised', message: 'no' } }, { status: 401 }),
    );
    expect(await catalogueSource({ url: URL_BASE, key: 'k', fetch }).universe([module('a')])).toEqual({
      ok: false,
      gap: { source: 'catalogue', url: UNIVERSE, reason: 'http', status: 401 },
    });
  });

  it('gives a network gap when it cannot be reached', async () => {
    const { fetch } = fetchAnswering(() => Promise.reject(new TypeError('fetch failed')));
    expect(await catalogueSource({ url: URL_BASE, key: 'k', fetch }).universe([module('a')])).toEqual({
      ok: false,
      gap: { source: 'catalogue', url: UNIVERSE, reason: 'network' },
    });
  });

  it('gives an invalid gap for an answer that is not JSON, or breaks the contract', async () => {
    for (const response of [() => new Response('<html>'), () => Response.json({ universe: 'no' })]) {
      const { fetch } = fetchAnswering(response);
      expect(await catalogueSource({ url: URL_BASE, key: 'k', fetch }).universe([module('a')])).toEqual({
        ok: false,
        gap: { source: 'catalogue', url: UNIVERSE, reason: 'invalid' },
      });
    }
  });

  it('gives the gap of the first part that fails, asking no more', async () => {
    const many = Array.from({ length: 2001 }, (_, i) => module(`m${String(i)}`));
    const { fetch } = fetchAnswering(
      () => Response.json(answer()),
      () => new Response('', { status: 503 }),
    );
    const found = await catalogueSource({ url: URL_BASE, key: 'k', fetch }).universe(many);
    expect(found).toMatchObject({ ok: false, gap: { status: 503 } });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('refuses a base that is not a URL', () => {
    expect(() => catalogueSource({ url: 'catalogue', key: 'k', fetch: vi.fn() })).toThrow(/catalogue/);
  });
});
