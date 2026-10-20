/**
 * Policy: the caller's choice of rules where reasonable tools could differ.
 *
 * Each setting and its default is described in the resolver's domain documentation.
 */
import type { RelationshipBounds } from './range/compatibility.js';
import type { CoreChannel } from './universe.js';
import type { VersionOrderName } from './version/choose.js';

export interface Policy {
  /** What `compatibility.verified` means: a preference, a hard maximum, or nothing. */
  readonly verified: 'prefer' | 'require' | 'ignore';
  /** Whether a declared conflict excludes, or only warns. Foundry does not enforce conflicts. */
  readonly conflicts: 'enforce' | 'warn';
  /** The core release channels a setup may use. */
  readonly coreChannels: readonly CoreChannel[];
  /** Whether package versions that look like pre-releases may be chosen when not pinned. */
  readonly prereleases: 'exclude' | 'include';
  /** Whether `recommends` is only reported, or installed. Installing is not built yet. */
  readonly recommends: 'report' | 'install';
  /** Whether a release that declares no core compatibility works with every core, or with none. */
  readonly missingCompatibility: 'any' | 'reject';
  /** What a `relationships.systems` entry's version range means, as for `verified`. */
  readonly systemCompatibility: 'prefer' | 'require' | 'ignore';
  /** How a relationship's bounds are read: exactly, as Foundry does, or a `maximum` as a prefix. */
  readonly relationshipBounds: RelationshipBounds;
  /** How package versions are ordered. */
  readonly versionOrder: VersionOrderName;
  /** Whether a version's core bounds from Foundry's listing win over its manifest's. */
  readonly listingCompatibility: 'prefer' | 'ignore';
}

/** The decided defaults. */
export const DEFAULT_POLICY: Policy = {
  verified: 'prefer',
  conflicts: 'enforce',
  coreChannels: ['stable'],
  prereleases: 'exclude',
  recommends: 'report',
  missingCompatibility: 'any',
  systemCompatibility: 'prefer',
  relationshipBounds: 'foundry',
  versionOrder: 'foundry',
  listingCompatibility: 'prefer',
};

/** A policy with the defaults for every setting not given. */
export function withDefaults(policy: Partial<Policy> = {}): Policy {
  return { ...DEFAULT_POLICY, ...policy };
}
