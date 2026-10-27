/**
 * The Foundry VTT package catalogue (Mondarth/fvtt-package-catalogue): a server that keeps every release of the
 * packages it is asked for, loaded from their manifests, with what they require and run in, all the way down. One
 * request gives a whole universe, where the other sources take one or more requests for each package and each
 * release. Its answers are checked against its own contract, `@mondarth/fvtt-package-catalogue-contract`.
 *
 * It is not a {@link ReleaseSource}: `sourceSet` asks every source for every package, so a catalogue among them
 * would save nothing. `sourceSet` asks it first instead, when given one, and the other sources only for what it does
 * not hold. See the `catalogue` option of `sourceSet`.
 */
import {
  API_KEY_HEADER,
  CLIENT_HEADER,
  MAX_UNIVERSE_PACKAGES,
  UNIVERSE_PATH,
  UniverseResponse,
  packageKey,
} from '@mondarth/fvtt-package-catalogue-contract';

import type { PackageRef, Release } from '../release.js';
import type { CoreRelease } from '../universe.js';
import type { SourceGap, SourceResult, UnavailablePackage } from './types.js';

export interface CatalogueOptions {
  /** Where the catalogue is, such as `https://catalogue.example/`; the API is under `api/v1/` there. */
  readonly url: string;
  /** The catalogue's API key: it says which client is asking, rather than keeping the data secret. */
  readonly key: string;
  /** The `fetch` to send the requests with: the catalogue sends CORS headers, so a browser needs no proxy. */
  readonly fetch: typeof globalThis.fetch;
  /** The client and its version, such as `EMMA/0.7.0`, which the catalogue logs. */
  readonly client?: string;
}

/** What the catalogue gave for a set of packages. */
export interface CatalogueUniverse {
  /** Foundry VTT's builds. */
  readonly core: CoreRelease[];
  /** The releases of the packages it holds: those asked for, and what their releases require or run in. */
  readonly releases: Release[];
  /** What the catalogue's own sources could not fetch or read for these packages. */
  readonly gaps: SourceGap[];
  /** The packages asked for or needed that it does not hold yet: it fetches them, for next time. */
  readonly pending: PackageRef[];
  /** The packages asked for or needed that cannot be had, and why: none of their releases are given. */
  readonly unavailable: UnavailablePackage[];
  /** The oldest time a package it holds was brought up to date, as an ISO 8601 time; null if never. */
  readonly asOf: string | null;
}

/** A catalogue to ask. */
export interface Catalogue {
  /** The source its gaps are recorded as. */
  readonly name: string;
  /** The universe of some packages, asked for in as many requests as the catalogue needs. */
  universe(packages: readonly PackageRef[]): Promise<SourceResult<CatalogueUniverse>>;
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
  const endpoint = new URL(UNIVERSE_PATH.replace(/^\//, ''), base).href;
  const headers = {
    [API_KEY_HEADER]: key,
    'Content-Type': 'application/json',
    ...(client !== undefined && { [CLIENT_HEADER]: client }),
  };

  async function ask(packages: readonly PackageRef[]): Promise<SourceResult<UniverseResponse>> {
    const gap = (reason: SourceGap['reason'], status?: number): SourceResult<never> => ({
      ok: false,
      gap: { source: NAME, url: endpoint, reason, ...(status !== undefined && { status }) },
    });
    let response: Response;
    try {
      response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ packages }) });
    } catch {
      return gap('network');
    }
    if (!response.ok) return gap('http', response.status);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return gap('invalid');
    }
    const read = UniverseResponse.safeParse(body);
    return read.success ? { ok: true, value: read.data } : gap('invalid');
  }

  return {
    name: NAME,
    async universe(packages) {
      const parts: UniverseResponse[] = [];
      for (let start = 0; start < packages.length; start += MAX_UNIVERSE_PACKAGES) {
        const part = await ask(packages.slice(start, start + MAX_UNIVERSE_PACKAGES));
        if (!part.ok) return part;
        parts.push(part.value);
      }
      return { ok: true, value: joined(parts) };
    },
  };
}

/** The answers to several parts of a request, as one: each build and release once, and the oldest time. */
function joined(parts: readonly UniverseResponse[]): CatalogueUniverse {
  const core = new Map<string, CoreRelease>();
  const releases = new Map<string, Release>();
  const pending = new Map<string, PackageRef>();
  const unavailable = new Map<string, UnavailablePackage>();
  const gaps: SourceGap[] = [];
  let asOf: string | null | undefined;
  for (const part of parts) {
    for (const build of part.universe.core) core.set(build.version, build);
    for (const release of part.universe.releases) {
      releases.set(`${packageKey(release.package)}@${release.version}`, release);
    }
    for (const ref of part.pending) pending.set(packageKey(ref), ref);
    for (const gone of part.unavailable) unavailable.set(packageKey(gone.package), gone);
    gaps.push(...part.gaps);
    asOf = asOf === undefined || asOf === null || part.asOf === null || part.asOf < asOf ? part.asOf : asOf;
  }
  // A package one part holds is not pending because another part needed it.
  const held = new Set([...releases.values()].map(release => packageKey(release.package)));
  return {
    core: [...core.values()],
    releases: [...releases.values()],
    gaps,
    pending: [...pending.values()].filter(ref => !held.has(packageKey(ref))),
    unavailable: [...unavailable.values()],
    asOf: asOf ?? null,
  };
}
