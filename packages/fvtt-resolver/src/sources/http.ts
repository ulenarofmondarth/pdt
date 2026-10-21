/**
 * Fetching JSON, text such as an HTML page, or part of a file, politely: from the cache while it is fresh, revalidating with its ETag when it is
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

/** Part of a file. */
export interface ByteRange {
  /** The first byte, from 0; or, when negative, how many bytes to read from the end. */
  readonly start: number;
  /** The last byte, included; the end of the file when missing. */
  readonly end?: number;
}

/** The bytes of part of a file. */
export interface FilePart {
  readonly bytes: Uint8Array;
  /**
   * The whole file's size, from the `Content-Range` the server sent, when it can be read: a
   * browser shows it only if the server exposes it to CORS.
   */
  readonly size?: number;
}

/** What fetching gave: the value, or a gap without its source, which the source adds. */
export type Fetched<T = unknown> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly gap: Omit<SourceGap, 'source'> };

export interface HttpClient {
  getJson(url: string, options: GetOptions): Promise<Fetched>;
  /** Fetches text, such as an HTML page, as `getJson` fetches JSON. */
  getText(url: string, options: GetOptions): Promise<Fetched<string>>;
  /**
   * Fetches part of a file, such as the end of a zip, within the budget but not cached. A server
   * that sends the whole file instead is not read, as the file may be large: that is an `invalid`
   * gap.
   */
  getBytes(url: string, range: ByteRange, options?: Pick<GetOptions, 'headers'>): Promise<Fetched<FilePart>>;
  /**
   * A value made from what was fetched, such as a manifest read from part of a zip, kept in the
   * cache under `key` for `maxAge` milliseconds. Only a value made is kept, not a gap.
   */
  remember<T>(key: string, maxAge: number, make: () => Promise<Fetched<T>>): Promise<Fetched<T>>;
  /** How many requests have been made. */
  requests(): number;
}

/** A client that fetches JSON and text through a cache, within a budget. */
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

  /** Fetches through the cache, reading a response's body with `read`. */
  async function get(
    url: string,
    { maxAge, staleIfError = 0, key = url, headers: extra = {} }: GetOptions,
    read: (response: Response) => Promise<unknown>,
  ): Promise<Fetched> {
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
      value = await read(response);
    } catch {
      return { ok: false, gap: { url, reason: 'invalid' } };
    }
    const etag = response.headers.get('etag');
    await cache.set(key, { value, storedAt: now(), ...(etag !== null && { etag }) });
    return { ok: true, value };
  }

  async function getBytes(
    url: string,
    { start, end }: ByteRange,
    { headers: extra = {} }: Pick<GetOptions, 'headers'> = {},
  ): Promise<Fetched<FilePart>> {
    if (made >= maxRequests) return { ok: false, gap: { url, reason: 'budget' } };
    made++;
    const range =
      start < 0 ? `bytes=${String(start)}` : `bytes=${String(start)}-${end === undefined ? '' : String(end)}`;
    let response: Response;
    try {
      response = await limited(() => fetch(url, { headers: { ...extra, Range: range, 'User-Agent': userAgent } }));
    } catch {
      return { ok: false, gap: { url, reason: 'network' } };
    }
    if (response.status !== 206) {
      await response.body?.cancel();
      return {
        ok: false,
        gap: response.ok ? { url, reason: 'invalid' } : { url, reason: 'http', status: response.status },
      };
    }
    try {
      const bytes = new Uint8Array(await response.arrayBuffer());
      const size = /\/(\d+)$/.exec(response.headers.get('content-range') ?? '')?.[1];
      return { ok: true, value: { bytes, ...(size !== undefined && { size: Number(size) }) } };
    } catch {
      return { ok: false, gap: { url, reason: 'network' } };
    }
  }

  async function remember<T>(key: string, maxAge: number, make: () => Promise<Fetched<T>>): Promise<Fetched<T>> {
    const cached = await cache.get(key);
    if (cached !== undefined && now() - cached.storedAt < maxAge) return { ok: true, value: cached.value as T };
    const result = await make();
    if (result.ok) await cache.set(key, { value: result.value, storedAt: now() });
    return result;
  }

  return {
    requests: () => made,
    getBytes,
    remember,
    getJson: (url, options) => get(url, options, response => response.json()),
    // The cache holds what `get` read, so text read under a key is text when it is read again.
    getText: (url, options) => get(url, options, response => response.text()) as Promise<Fetched<string>>,
  };
}
