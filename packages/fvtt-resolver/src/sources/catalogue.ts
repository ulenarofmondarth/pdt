/**
 * The Foundry VTT package catalogue (Mondarth/fvtt-package-catalogue): a server that keeps every release of the
 * packages it is asked for, loaded from their manifests, with what they require and run in, all the way down. Its
 * answers are checked against its own contract, `@mondarth/fvtt-package-catalogue-contract`.
 *
 * Version 2 of its API, the only one, is for clients that ask the catalogue alone, as few times as they can: a lookup
 * gives each package of a closure once, with how fresh it is; the listing and Foundry VTT's builds are revalidated by
 * their ETags; a recheck has packages' own manifests checked again now; and a manifest URL a user gives is read for
 * them. See `catalogueSet`, which asks the catalogue and nothing else.
 */
import {
  API_KEY_HEADER,
  CLIENT_HEADER,
  CORE_PATH,
  CoreResponse,
  LISTING_PATH,
  LOOKUP_PATH,
  ListingResponse,
  LookupResponse,
  MANIFEST_PATH,
  MAX_RECHECK_PACKAGES,
  MAX_UNIVERSE_PACKAGES,
  ManifestResponse,
  RECHECK_PATH,
  RecheckResponse,
  packageKey,
} from '@mondarth/fvtt-package-catalogue-contract';

import type { LookupPackageRequest, LookupRequest } from '@mondarth/fvtt-package-catalogue-contract';
import type { z } from 'zod';

import type { PackageRef } from '../release.js';
import type { SourceGap, SourceResult } from './types.js';

export interface CatalogueOptions {
  /** Where the catalogue is, such as `https://catalogue.example/`; the API is under `api/v2/` there. */
  readonly url: string;
  /** The catalogue's API key: it says which client is asking, rather than keeping the data secret. */
  readonly key: string;
  /** The `fetch` to send the requests with: the catalogue sends CORS headers, so a browser needs no proxy. */
  readonly fetch: typeof globalThis.fetch;
  /** The client and its version, such as `EMMA/0.7.0`, which the catalogue logs. */
  readonly client?: string;
}

/**
 * What a revalidated request gave: the answer, with the ETag to revalidate it by next time, or that the answer the
 * client kept, by the ETag it gave, is still the answer.
 */
export type Revalidated<T> =
  { readonly notModified: false; readonly value: T; readonly etag?: string } | { readonly notModified: true };

/** A catalogue to ask. */
export interface Catalogue {
  /** The source its gaps are recorded as. */
  readonly name: string;
  /**
   * Version 2: some packages, with what the client knows of them, and every package they need, each once, with how
   * fresh it is; asked for in as many requests as the catalogue needs, joined.
   */
  lookup(request: LookupRequest): Promise<SourceResult<LookupResponse>>;
  /** Version 2: Foundry VTT's listing, of a type or of both, revalidated by the ETag the client kept, if any. */
  listing(options?: {
    readonly type?: 'module' | 'system';
    readonly etag?: string;
  }): Promise<SourceResult<Revalidated<ListingResponse>>>;
  /** Version 2: Foundry VTT's builds, revalidated as the listing is. */
  core(options?: { readonly etag?: string }): Promise<SourceResult<Revalidated<CoreResponse>>>;
  /** Version 2: has packages' own manifests checked again now, in as many requests as it needs, joined. */
  recheck(packages: readonly PackageRef[]): Promise<SourceResult<RecheckResponse>>;
  /** Version 2: reads a manifest URL a user gives, to install a package of a type from. */
  manifest(url: string, type: 'module' | 'system'): Promise<SourceResult<ManifestResponse>>;
}

/** How a request to the catalogue is made. */
interface Asking {
  readonly method: 'GET' | 'POST';
  readonly body?: unknown;
  /** An ETag the client kept, to be told 304 while it is the answer. */
  readonly etag?: string;
}

const NAME = 'catalogue';

/** A catalogue, at a URL. */
export function catalogueSource({ url, key, fetch, client }: CatalogueOptions): Catalogue {
  let base: URL;
  try {
    // A base with a path of its own keeps it: `new URL` replaces the last segment of a path without a slash.
    base = new URL(url.endsWith('/') ? url : `${url}/`);
  } catch {
    throw new Error(`The catalogue's URL is not a URL: ${url}`);
  }
  // The contract's paths are absolute; under the base, they are relative to it.
  const at = (path: string) => new URL(path.replace(/^\//, ''), base).href;
  const headers = {
    [API_KEY_HEADER]: key,
    ...(client !== undefined && { [CLIENT_HEADER]: client }),
  };

  /**
   * Asks the catalogue, and reads its answer against the contract; a 304 to an ETag given is that it is unchanged.
   */
  async function ask<S extends z.ZodType>(
    endpoint: string,
    schema: S,
    { method, body, etag }: Asking,
  ): Promise<SourceResult<Revalidated<z.infer<S>>>> {
    const gap = (reason: SourceGap['reason'], status?: number): SourceResult<never> => ({
      ok: false,
      gap: { source: NAME, url: endpoint, reason, ...(status !== undefined && { status }) },
    });
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method,
        headers: {
          ...headers,
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
          ...(etag !== undefined && { 'If-None-Match': etag }),
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
    } catch {
      return gap('network');
    }
    if (response.status === 304 && etag !== undefined) return { ok: true, value: { notModified: true } };
    if (!response.ok) return gap('http', response.status);
    let read: unknown;
    try {
      read = await response.json();
    } catch {
      return gap('invalid');
    }
    const parsed = schema.safeParse(read);
    if (!parsed.success) return gap('invalid');
    const tag = response.headers.get('ETag');
    return { ok: true, value: { notModified: false, value: parsed.data, ...(tag !== null && { etag: tag }) } };
  }

  /** Posts, and gives the answer, which a post never has unchanged. */
  async function post<S extends z.ZodType>(path: string, schema: S, body: unknown): Promise<SourceResult<z.infer<S>>> {
    const answer = await ask(at(path), schema, { method: 'POST', body });
    if (!answer.ok) return answer;
    /* v8 ignore next -- a post is given no ETag, so is never answered 304 */
    if (answer.value.notModified) throw new Error('A post was answered 304');
    return { ok: true, value: answer.value.value };
  }

  /** Posts the request in parts of at most `size`, by `split`, and joins their answers. */
  async function inParts<T, A>(
    items: readonly T[],
    size: number,
    send: (part: readonly T[]) => Promise<SourceResult<A>>,
    join: (parts: readonly A[]) => A,
  ): Promise<SourceResult<A>> {
    const parts: A[] = [];
    // One part even for none, so that the catalogue says what is wrong with an empty request.
    for (let start = 0; start === 0 || start < items.length; start += size) {
      const part = await send(items.slice(start, start + size));
      if (!part.ok) return part;
      parts.push(part.value);
    }
    return { ok: true, value: join(parts) };
  }

  return {
    name: NAME,
    lookup({ packages, fromGeneration }) {
      return inParts<LookupPackageRequest, LookupResponse>(
        packages,
        MAX_UNIVERSE_PACKAGES,
        part =>
          post(LOOKUP_PATH, LookupResponse, {
            packages: part,
            ...(fromGeneration !== undefined && { fromGeneration }),
          }),
        joinedLookups,
      );
    },

    listing({ type, etag } = {}) {
      const path = type === undefined ? LISTING_PATH : `${LISTING_PATH}?type=${type}`;
      return ask(at(path), ListingResponse, { method: 'GET', ...(etag !== undefined && { etag }) });
    },

    core({ etag } = {}) {
      return ask(at(CORE_PATH), CoreResponse, { method: 'GET', ...(etag !== undefined && { etag }) });
    },

    recheck(packages) {
      return inParts<PackageRef, RecheckResponse>(
        packages,
        MAX_RECHECK_PACKAGES,
        part => post(RECHECK_PATH, RecheckResponse, { packages: part }),
        parts => ({ packages: parts.flatMap(part => part.packages), pending: parts.flatMap(part => part.pending) }),
      );
    },

    manifest(url, type) {
      return post(MANIFEST_PATH, ManifestResponse, { url, type });
    },
  };
}

/**
 * The answers to several parts of a lookup, as one: each build and package once, the first answer's where two give
 * one; a package one part holds is not pending, nor unavailable, because another part needed it; and the oldest time.
 */
function joinedLookups(parts: readonly LookupResponse[]): LookupResponse {
  const core = new Map<string, LookupResponse['core'][number]>();
  const packages = new Map<string, LookupResponse['packages'][number]>();
  const pending = new Map<string, LookupResponse['pending'][number]>();
  const unavailable = new Map<string, LookupResponse['unavailable'][number]>();
  const unreached = new Map<string, PackageRef>();
  let asOf: string | null | undefined;
  for (const part of parts) {
    for (const build of part.core) core.set(build.version, build);
    for (const pkg of part.packages)
      if (!packages.has(packageKey(pkg.package))) packages.set(packageKey(pkg.package), pkg);
    for (const queued of part.pending) pending.set(packageKey(queued.package), queued);
    for (const gone of part.unavailable) unavailable.set(packageKey(gone.package), gone);
    for (const ref of part.unreached) unreached.set(packageKey(ref), ref);
    asOf = older(asOf, part.asOf);
  }
  return {
    core: [...core.values()],
    packages: [...packages.values()],
    pending: [...pending.values()].filter(queued => !packages.has(packageKey(queued.package))),
    unavailable: [...unavailable.values()],
    unreached: [...unreached.values()],
    asOf: asOf ?? null,
  };
}

/** The older of the time so far and a part's, where null, never, is older than any; undefined is none so far. */
function older(sofar: string | null | undefined, part: string | null): string | null {
  if (sofar === undefined) return part;
  if (sofar === null || part === null) return null;
  return part < sofar ? part : sofar;
}
