import { describe, expect, it } from 'vitest';
import { memoryCache } from '../../src/sources/cache.js';
import { httpClient } from '../../src/sources/http.js';
import { fakeFetch } from './fake-fetch.js';

const url = 'https://example.org/index.json';
const MINUTE = 60_000;

/** A clock that the test moves on. */
function clock() {
  let time = 1_000_000;
  return { now: () => time, pass: (ms: number) => (time += ms) };
}

describe('httpClient', () => {
  it('fetches JSON, saying who is asking', async () => {
    const { fetch, requests } = fakeFetch({ [url]: { body: { a: 1 } } });
    const http = httpClient({ fetch });
    expect(await http.getJson(url, { maxAge: MINUTE })).toEqual({ ok: true, value: { a: 1 } });
    expect(requests[0]?.headers['User-Agent']).toBe('@mondarth/fvtt-resolver');
    expect(http.requests()).toBe(1);
  });

  it('uses the cache while it is fresh, then revalidates with the ETag', async () => {
    const time = clock();
    let calls = 0;
    const { fetch, requests } = fakeFetch({
      [url]: () => (calls++ === 0 ? { body: { a: 1 }, etag: '"v1"' } : { status: 304 }),
    });
    const cache = memoryCache();
    const http = httpClient({ fetch, cache, now: time.now });
    await http.getJson(url, { maxAge: 5 * MINUTE });
    time.pass(MINUTE);
    expect(await http.getJson(url, { maxAge: 5 * MINUTE })).toEqual({ ok: true, value: { a: 1 } });
    expect(requests).toHaveLength(1);
    time.pass(5 * MINUTE);
    expect(await http.getJson(url, { maxAge: 5 * MINUTE })).toEqual({ ok: true, value: { a: 1 } });
    expect(requests[1]?.headers['If-None-Match']).toBe('"v1"');
    expect((await cache.get(url))?.storedAt).toBe(time.now());
  });

  it('keeps an entry under the key given', async () => {
    const { fetch } = fakeFetch({ [url]: { body: 1 } });
    const cache = memoryCache();
    await httpClient({ fetch, cache }).getJson(url, { maxAge: MINUTE, key: 'mine' });
    expect(await cache.get('mine')).toMatchObject({ value: 1 });
    expect(await cache.get(url)).toBeUndefined();
  });

  describe('when the server fails or cannot be reached', () => {
    it.each([
      [{ unreachable: true }, { reason: 'network' }],
      [{ status: 503 }, { reason: 'http', status: 503 }],
    ])('serves a stale copy within its time, and otherwise records a gap (%j)', async (failure, gap) => {
      const time = clock();
      let calls = 0;
      const { fetch } = fakeFetch({ [url]: () => (calls++ === 0 ? { body: 'old' } : failure) });
      const http = httpClient({ fetch, now: time.now });
      await http.getJson(url, { maxAge: MINUTE });
      time.pass(2 * MINUTE);
      expect(await http.getJson(url, { maxAge: MINUTE, staleIfError: 5 * MINUTE })).toEqual({ ok: true, value: 'old' });
      time.pass(10 * MINUTE);
      expect(await http.getJson(url, { maxAge: MINUTE, staleIfError: 5 * MINUTE })).toEqual({
        ok: false,
        gap: { url, ...gap },
      });
    });

    it('records a gap for a client error, even with a stale copy', async () => {
      const time = clock();
      let calls = 0;
      const { fetch } = fakeFetch({ [url]: () => (calls++ === 0 ? { body: 'old' } : { status: 404 }) });
      const http = httpClient({ fetch, now: time.now });
      await http.getJson(url, { maxAge: MINUTE });
      time.pass(2 * MINUTE);
      expect(await http.getJson(url, { maxAge: MINUTE, staleIfError: 5 * MINUTE })).toEqual({
        ok: false,
        gap: { url, reason: 'http', status: 404 },
      });
    });

    it('records a gap for an answer that is not JSON', async () => {
      const { fetch } = fakeFetch({ [url]: { text: '<html>' } });
      expect(await httpClient({ fetch }).getJson(url, { maxAge: MINUTE })).toEqual({
        ok: false,
        gap: { url, reason: 'invalid' },
      });
    });
  });

  describe('its budget', () => {
    it('makes no more requests than the budget allows, serving a cached copy instead where it has one', async () => {
      const time = clock();
      const { fetch, requests } = fakeFetch({ [url]: { body: 'kept' }, 'https://example.org/other': { body: 2 } });
      const http = httpClient({ fetch, now: time.now, budget: { maxRequests: 1 } });
      await http.getJson(url, { maxAge: MINUTE });
      time.pass(2 * MINUTE);
      expect(await http.getJson(url, { maxAge: MINUTE })).toEqual({ ok: true, value: 'kept' });
      expect(await http.getJson('https://example.org/other', { maxAge: MINUTE })).toEqual({
        ok: false,
        gap: { url: 'https://example.org/other', reason: 'budget' },
      });
      expect(requests).toHaveLength(1);
    });

    it('runs no more requests at once than it allows', async () => {
      let inFlight = 0;
      let most = 0;
      const fetch = async () => {
        inFlight++;
        most = Math.max(most, inFlight);
        await new Promise(resolve => setTimeout(resolve, 5));
        inFlight--;
        return new Response('1');
      };
      const http = httpClient({ fetch: fetch as typeof globalThis.fetch, budget: { concurrency: 2 } });
      const urls = ['a', 'b', 'c', 'd', 'e'].map(u => `https://example.org/${u}`);
      const results = await Promise.all(urls.map(u => http.getJson(u, { maxAge: MINUTE })));
      expect(results.every(r => r.ok)).toBe(true);
      expect(most).toBe(2);
    });
  });
});
