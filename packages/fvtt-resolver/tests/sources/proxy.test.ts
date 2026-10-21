import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { httpClient } from '../../src/sources/http.js';
import { proxiedFetch, proxyUrlFor } from '../../src/sources/proxy.js';
import { fakeFetch } from './fake-fetch.js';

const PROXY = 'https://proxy.example/?url={url}';

describe('proxyUrlFor', () => {
  it('puts the target in the template, percent-encoded, so that its own query and escapes survive', () => {
    const gitlab = 'https://gitlab.com/api/v4/projects/tposney%2Fmidi-qol/releases?per_page=100';
    expect(proxyUrlFor(PROXY, gitlab)).toBe(
      'https://proxy.example/?url=https%3A%2F%2Fgitlab.com%2Fapi%2Fv4%2Fprojects%2Ftposney%252Fmidi-qol%2Freleases%3Fper_page%3D100',
    );
    const query = new URL(proxyUrlFor(PROXY, gitlab)).searchParams.get('url');
    expect(query).toBe(gitlab);
  });

  it('gives back any target as the proxy reads it', () => {
    fc.assert(
      fc.property(fc.webUrl({ withQueryParameters: true, withFragments: true }), url => {
        expect(new URL(proxyUrlFor(PROXY, url)).searchParams.get('url')).toBe(url);
      }),
    );
  });

  it('takes a function, for proxies that want the target some other way', () => {
    expect(proxyUrlFor(url => `https://proxy.example/${url}`, 'https://example.org/a')).toBe(
      'https://proxy.example/https://example.org/a',
    );
  });

  it('refuses a template without {url}', () => {
    expect(() => proxyUrlFor('https://proxy.example/?url=', 'https://example.org')).toThrow(
      'A proxy template needs {url}: https://proxy.example/?url=',
    );
  });
});

describe('proxiedFetch', () => {
  const target = 'https://hub.docker.com/v2/repositories/felddy/foundryvtt/tags?page_size=100&name=14.';

  it('fetches every URL through the proxy, with the request’s headers', async () => {
    const { fetch, requests } = fakeFetch({ [proxyUrlFor(PROXY, target)]: { body: { results: [] } } });
    const http = httpClient({ fetch: proxiedFetch(fetch, PROXY) });
    expect(await http.getJson(target, { maxAge: 0, headers: { Accept: 'application/json' } })).toEqual({
      ok: true,
      value: { results: [] },
    });
    expect(requests.map(r => r.url)).toEqual([proxyUrlFor(PROXY, target)]);
    expect(requests[0]?.headers).toMatchObject({ Accept: 'application/json' });
  });

  it('proxies a Request, keeping its method and headers', async () => {
    const seen: Request[] = [];
    const fetch = (input: string | URL | Request) => {
      seen.push(input as Request);
      return Promise.resolve(new Response('{}'));
    };
    const proxied = proxiedFetch(fetch as typeof globalThis.fetch, PROXY);
    await proxied(new Request(target, { method: 'HEAD', headers: { 'If-None-Match': '"a"' } }));
    expect(seen[0]?.url).toBe(proxyUrlFor(PROXY, target));
    expect(seen[0]?.method).toBe('HEAD');
    expect(seen[0]?.headers.get('If-None-Match')).toBe('"a"');
  });

  it('proxies through a function', async () => {
    const { fetch, requests } = fakeFetch({});
    await proxiedFetch(fetch, url => `https://proxy.example/${url}`)(target);
    expect(requests.map(r => r.url)).toEqual([`https://proxy.example/${target}`]);
  });

  it('proxies a URL object', async () => {
    const { fetch, requests } = fakeFetch({});
    await proxiedFetch(fetch, PROXY)(new URL(target));
    expect(requests.map(r => r.url)).toEqual([proxyUrlFor(PROXY, target)]);
  });

  it('refuses a template without {url} when made, not when first used', () => {
    expect(() => proxiedFetch(globalThis.fetch, 'https://proxy.example/')).toThrow('{url}');
  });
});
