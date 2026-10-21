/**
 * Declarations beyond the manifests, from the project or the tool using the resolver: corrections
 * to what authors declared (overrides), and the core builds the caller can run (core limits). Each
 * carries a reason, so that an explanation leaning on one can say why it holds.
 */
import { packageKey } from './universe.js';

import type { Release } from './release.js';
import type { PackageKey } from './universe.js';

/** A core build the caller cannot run, and why, such as "there is no felddy/foundryvtt image for it". */
export interface CoreLimit {
  readonly version: string;
  /** Shown to the user as written, so already in their language. */
  readonly reason: string;
}

interface OverrideCommon {
  /** The package whose releases it corrects. */
  readonly package: PackageKey;
  /** The versions it corrects, exactly as the releases give them; every version when missing. */
  readonly versions?: readonly string[];
  /** Shown to the user as written, so already in their language. */
  readonly reason: string;
}

/**
 * Releases that cannot be used: at all, or with another package in some versions, such as "my-module
 * 3.2.0 is broken on core 14". The versions of `with` are bounds as a manifest writes them: core
 * bounds may name a generation (`"14"`), and other packages' are read as relationship bounds.
 */
export interface ExcludeOverride extends OverrideCommon {
  readonly kind: 'exclude';
  readonly with?: { readonly package: PackageKey; readonly minimum?: string; readonly maximum?: string };
}

/**
 * Core bounds in place of a release's own, such as "ignore old-module 1.4.0's maximum; it works on
 * 14". A bound given replaces the release's, `null` removes it, and a bound not given is kept. It
 * wins over a listing's bounds too.
 */
export interface CompatibilityOverride extends OverrideCommon {
  readonly kind: 'compatibility';
  readonly compatibility: {
    readonly minimum?: string | null;
    readonly verified?: string | null;
    readonly maximum?: string | null;
  };
}

/** A relationship to ignore: every `requires`, `systems`, `conflicts` and `recommends` entry naming `drop`. */
export interface RelationshipOverride extends OverrideCommon {
  readonly kind: 'relationship';
  readonly drop: PackageKey;
}

export type Override = ExcludeOverride | CompatibilityOverride | RelationshipOverride;

export interface Declarations {
  readonly overrides?: readonly Override[];
  readonly coreLimits?: readonly CoreLimit[];
}

/** An override with its place in the declarations, which provenance records. */
export interface IndexedOverride<O extends Override = Override> {
  readonly index: number;
  readonly override: O;
}

/** The overrides that correct a release, in the order declared. */
export function overridesFor(release: Release, overrides: readonly Override[]): IndexedOverride[] {
  const key = packageKey(release.package);
  return overrides.flatMap((override, index) =>
    override.package === key && (override.versions === undefined || override.versions.includes(release.version))
      ? [{ index, override }]
      : [],
  );
}
