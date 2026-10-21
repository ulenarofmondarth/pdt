/**
 * Fetching JSON politely: from the cache while it is fresh, revalidating with its ETag when it is
 * not, within a budget of requests and a limit on how many run at once, and recording a gap
 * rather than throwing when something cannot be fetched.
 *
 * `fetch` is the caller's, so the sources run wherever it does: Node, a browser, or behind a proxy.
 */
import { memoryCache } from './cache.js';

import type { Cache } from './cache.js';
import type { SourceGap } from './types.js';

export interface RequestBudget {
  /** The most requests one client may make. */
  readonly maxRequests: number;
  /** The most requests in flight at once. */
  readonly concurrency: number;
}

export const DEFAULT_BUDGET: RequestBudget = { maxRequests: 1000, concurrency: 8 };

export interface HttpOptions {
  readonly fetch: typeof globalThis.fetch;
  readonly cache?: Cache;
  /** The time now, in milliseconds since the epoch. */
  readonly now?: () => number;
  readonly budget?: Partial<RequestBudget>;
  /** Sent where the environment allows it, so that servers know who is asking. */
  readonly userAgent?: string;
}

export interface GetOptions {
  /** How long a cached value is used without asking the server, in milliseconds. */
  readonly maxAge: number;
  /** How long past `maxAge` a cached value is still used when the server cannot be reached or fails. */
  readonly staleIfError?: number;
  /** The cache key, when it should differ from the URL. */
  readonly key?: string;
  /** More headers to send, such as a token. */
  readonly headers?: Readonly<Record<string, string>>;
}

/** What fetching gave: the value, or a gap without its source, which the source adds. */
export type Fetched =
  { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly gap: Omit<SourceGap, 'source'> };

export interface HttpClient {
  getJson(url: string, options: GetOptions): Promise<Fetched>;
  /** How many requests have been made. */
  requests(): number;
}

/** A client that fetches JSON through a cache, within a budget. */
export function httpClient({
  fetch,
  cache = memoryCache(),
  now = () => Date.now(),
  budget = {},
  userAgent = '@mondarth/fvtt-resolver',
}: HttpOptions): HttpClient {
  const { maxRequests, concurrency } = { ...DEFAULT_BUDGET, ...budget };
  let made = 0;
  let running = 0;
  const waiting: (() => void)[] = [];

  /** Runs a request when fewer than `concurrency` are in flight. */
  async function limited<T>(request: () => Promise<T>): Promise<T> {
    if (running >= concurrency) await new Promise<void>(resolve => waiting.push(resolve));
    running++;
    try {
      return await request();
    } finally {
      running--;
      waiting.shift()?.();
    }
  }

  return {
    requests: () => made,

    async getJson(url, { maxAge, staleIfError = 0, key = url, headers: extra = {} }) {
      const cached = await cache.get(key);
      const age = cached === undefined ? Infinity : now() - cached.storedAt;
      if (cached !== undefined && age < maxAge) return { ok: true, value: cached.value };
      const stale = (gap: Omit<SourceGap, 'source'>): Fetched =>
        cached !== undefined && age < maxAge + staleIfError ? { ok: true, value: cached.value } : { ok: false, gap };

      if (made >= maxRequests)
        return cached === undefined ? { ok: false, gap: { url, reason: 'budget' } } : { ok: true, value: cached.value };
      made++;

      let response: Response;
      try {
        const headers: Record<string, string> = { ...extra, 'User-Agent': userAgent };
        if (cached?.etag !== undefined) headers['If-None-Match'] = cached.etag;
        response = await limited(() => fetch(url, { headers }));
      } catch {
        return stale({ url, reason: 'network' });
      }

      if (response.status === 304 && cached !== undefined) {
        await cache.set(key, { ...cached, storedAt: now() });
        return { ok: true, value: cached.value };
      }
      if (!response.ok) {
        const gap = { url, reason: 'http', status: response.status } as const;
        return response.status >= 500 ? stale(gap) : { ok: false, gap };
      }
      let value: unknown;
      try {
        value = await response.json();
      } catch {
        return { ok: false, gap: { url, reason: 'invalid' } };
      }
      const etag = response.headers.get('etag');
      await cache.set(key, { value, storedAt: now(), ...(etag !== null && { etag }) });
      return { ok: true, value };
    },
  };
}
