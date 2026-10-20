/**
 * Releases: one version of a package, with what its manifest declares.
 */
import type { Compatibility } from './range/compatibility.js';

/** The kinds of package Foundry VTT installs. */
export type PackageType = 'module' | 'system' | 'world';

/** A package, named by its type and id. */
export interface PackageRef {
  readonly type: PackageType;
  readonly id: string;
}

/** A relationship a release declares with another package. */
export interface Relationship {
  readonly package: PackageRef;
  /** The versions of the related package the relationship admits, as declared. */
  readonly compatibility: Compatibility;
  /** Where the related package's manifest is, if the relationship says. */
  readonly manifest?: string;
  readonly reason?: string;
}

/** A manifest's `relationships`, each list empty when it declares none. */
export interface Relationships {
  readonly requires: readonly Relationship[];
  /** The systems the release runs in; empty for any system. */
  readonly systems: readonly Relationship[];
  readonly conflicts: readonly Relationship[];
  readonly recommends: readonly Relationship[];
}

/**
 * One version of a package, normalised from its manifest.
 *
 * It holds what the manifest declares, cleaned up, and not yet read as ranges: how bounds are read
 * depends on policy, so ranges are built from a release when a question is asked.
 */
export interface Release {
  readonly package: PackageRef;
  readonly version: string;
  /** The core versions it declares it works with. */
  readonly compatibility: Compatibility;
  readonly relationships: Relationships;
  readonly manifest?: string;
  readonly download?: string;
  /** A premium package: downloading it needs the user's licence. */
  readonly protected: boolean;
  /** Where the manifest was read from, such as its URL or path. */
  readonly origin: string;
}
