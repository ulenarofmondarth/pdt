/**
 * What the sources share: how they report what they could not fetch, and what a source of
 * releases offers.
 */
import type { PackageRef, Release } from '../release.js';
import type { PackageKey } from '../universe.js';

/**
 * Something a source could not fetch or read. Gaps do not stop a universe being built; they are
 * recorded, so that an explanation can say what was missing.
 */
export interface SourceGap {
  /** The source that met it, such as `foundry-index`. */
  readonly source: string;
  readonly url: string;
  /**
   * `http`: the server answered with an error. `network`: it could not be reached. `budget`: the
   * request budget ran out. `invalid`: the answer could not be read.
   */
  readonly reason: 'http' | 'network' | 'budget' | 'invalid';
  readonly status?: number;
  readonly package?: PackageKey;
  readonly version?: string;
}

export type SourceResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly gap: SourceGap };

/** What is known of where a package's manifests are, which a source may use to find its releases. */
export interface SourceHints {
  /**
   * Manifest URLs declared for the package: in a relationship's `manifest`, or given by the caller.
   * Each is expected to describe the package's newest release.
   */
  readonly declared: readonly string[];
  /** Manifest URLs of the package's releases that earlier sources listed, each of one version. */
  readonly seen: readonly string[];
}

/** One way of finding a package's releases. */
export interface ReleaseSource {
  /** The source's name, as gaps report it. */
  readonly name: string;
  /** The releases of a package this source knows of, listed or loaded: none if it knows none. */
  releases(ref: PackageRef, hints?: SourceHints): Promise<SourceResult<Release[]>>;
}
