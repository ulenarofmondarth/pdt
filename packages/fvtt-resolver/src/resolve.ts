/**
 * Resolve: what should be installed. Finds the best setup that meets the requirements: one core
 * release, one system release and the modules needed, as one world would use them.
 *
 * It encodes the universe's releases, their constraints and the caller's declarations for the
 * solver, which knows nothing of Foundry VTT, and chooses among valid setups by the preferences: pins and preferred versions first,
 * then versions that more of the releases already chosen prefer, then the newest.
 */
import { releaseConstraints } from './constraints.js';
import { withDefaults } from './policy.js';
import { rangeOps } from './range/range.js';
import { solve } from './solver/solver.js';
import { CORE, chooseOrders, packageKey } from './universe.js';
import { foundryOrder } from './version/foundry.js';
import {
  WORLD_SYSTEM,
  splitWorldSystem,
  worldSystemOrder,
  worldSystemRange,
  worldSystemVersion,
} from './world-system.js';

import type { Constraint } from './constraints.js';
import type { Declarations } from './declarations.js';
import type { Policy } from './policy.js';
import type { Range } from './range/range.js';
import type { Release } from './release.js';
import type { Incompatibility, Provider } from './solver/solver.js';
import type { Term } from './solver/term.js';
import type { OrderWarning, PackageKey, Universe } from './universe.js';
import type { VersionOrder } from './version/order.js';

export { WORLD_SYSTEM, worldSystemVersion } from './world-system.js';

/** The virtual package that stands for the caller's requirements. */
export const REQUIREMENTS: PackageKey = 'requirements';

/** A package that must be in the setup, at a version in a range (any version when none is given). */
export interface Requirement {
  readonly package: PackageKey;
  readonly range?: Range;
}

/** A version of a package. */
export interface PackageVersion {
  readonly package: PackageKey;
  readonly version: string;
}

export interface Requirements {
  /** Packages that must be in the setup. A setup always has a core release and a system. */
  readonly require?: readonly Requirement[];
  /** Exact versions: pins, or a lockfile replayed. A pin may choose a version the policy would not. */
  readonly pins?: readonly PackageVersion[];
  /** Versions to prefer without requiring them, such as a lockfile when upgrading. */
  readonly prefer?: readonly PackageVersion[];
}

/** Why the solver was told something: the data at the leaves of an explanation. */
export type Reason =
  /** The caller requires a package in a range. */
  | { readonly kind: 'requirement'; readonly package: PackageKey; readonly range: Range }
  /** The caller pinned a version. */
  | { readonly kind: 'pin'; readonly package: PackageKey; readonly version: string }
  /** A setup needs a core release and a system. */
  | { readonly kind: 'setup'; readonly package: PackageKey }
  /** A release's constraint. */
  | { readonly kind: 'constraint'; readonly constraint: Constraint }
  /** A system release is the world's system, and the world's system is that release. */
  | { readonly kind: 'world-system'; readonly system: PackageKey; readonly version: string }
  /** The caller cannot run this core build. */
  | { readonly kind: 'core-limit'; readonly version: string; readonly reason: string };

/** A valid setup: what to install. */
export interface Setup {
  /** The core release. */
  readonly core: string;
  /** The system release. */
  readonly system: Release;
  /** The module releases. */
  readonly modules: readonly Release[];
}

export type Resolution =
  | { readonly ok: true; readonly setup: Setup; readonly warnings: readonly OrderWarning[] }
  /** The incompatibility that proves there is no valid setup, with its derivation: the explanation. */
  | { readonly ok: false; readonly failure: Incompatibility<Reason>; readonly warnings: readonly OrderWarning[] }
  /**
   * Not yet an answer: the answer depends on listed releases, whose manifests are not loaded. Load
   * them into the universe and resolve again (see `resolveInRounds`).
   */
  | { readonly ok: false; readonly needs: readonly PackageVersion[]; readonly warnings: readonly OrderWarning[] };

export interface ResolveOptions {
  readonly policy?: Partial<Policy>;
  /** Overrides and core limits, beyond what the manifests declare. */
  readonly declarations?: Declarations;
}

/** The constraints at the leaves of an explanation. */
function constraintsIn(incompatibility: Incompatibility<Reason>): Constraint[] {
  const { cause } = incompatibility;
  if (cause.kind === 'derived') return [...constraintsIn(cause.conflict), ...constraintsIn(cause.other)];
  return cause.kind === 'external' && cause.data.kind === 'constraint' ? [cause.data.constraint] : [];
}

/** Whether an explanation rests on there being no versions of some package. */
function restsOnNoVersions(incompatibility: Incompatibility<Reason>): boolean {
  const { cause } = incompatibility;
  if (cause.kind === 'derived') return restsOnNoVersions(cause.conflict) || restsOnNoVersions(cause.other);
  return cause.kind === 'no-versions';
}

/**
 * Whether a package version looks like a pre-release, by the words packages use for them. Foundry
 * VTT has no notion of a pre-release, so this is a convention: `1.0.0-beta.1`, `2.0.0rc1`.
 */
export function looksLikePrerelease(version: string): boolean {
  return /(alpha|beta|rc|pre|preview|dev|next|canary|snapshot)/i.test(version);
}

/**
 * Finds the best setup that meets the requirements, or explains why there is none.
 */
export function resolve(universe: Universe, requirements: Requirements, options: ResolveOptions = {}): Resolution {
  const policy = withDefaults(options.policy);
  const { overrides = [], coreLimits = [] } = options.declarations ?? {};
  const orders = chooseOrders(universe, policy, overrides);
  const pins = requirements.pins ?? [];
  const preferred = [...pins, ...(requirements.prefer ?? [])];
  const isPreferred = (key: PackageKey, version: string) =>
    preferred.some(p => p.package === key && p.version === version);

  // Candidate releases: the first release of each version, without pre-releases unless asked for.
  const releases = new Map<PackageKey, Map<string, Release>>();
  for (const release of universe.releases) {
    const key = packageKey(release.package);
    const byVersion = releases.get(key) ?? new Map<string, Release>();
    releases.set(key, byVersion);
    const allowed =
      policy.prereleases === 'include' || !looksLikePrerelease(release.version) || isPreferred(key, release.version);
    if (allowed && !byVersion.has(release.version)) byVersion.set(release.version, release);
  }
  const releaseOf = (key: PackageKey, version: string) => releases.get(key)?.get(version);
  const systems = [...releases.keys()].filter(key => key.startsWith('system:')).sort();

  const coreVersions = [
    ...new Set(universe.core.filter(c => policy.coreChannels.includes(c.channel)).map(c => c.version)),
  ];

  const worldSystems = worldSystemOrder(key => orders.orderOf(key));
  const orderOf = (key: PackageKey): VersionOrder => (key === WORLD_SYSTEM ? worldSystems : orders.orderOf(key));
  const opsOf = (key: PackageKey) => rangeOps(orderOf(key));

  const constraintCache = new Map<string, Constraint[]>();
  const constraintsOf = (release: Release) => {
    const id = `${packageKey(release.package)}@${release.version}`;
    let found = constraintCache.get(id);
    if (found === undefined) {
      found = releaseConstraints(release, { orders, policy, overrides });
      constraintCache.set(id, found);
    }
    return found;
  };

  /** How many of the releases decided on prefer this version. */
  function preferenceScore(key: PackageKey, version: string, decided: ReadonlyMap<PackageKey, string>): number {
    let score = 0;
    for (const [decidedKey, decidedVersion] of decided) {
      const release = releaseOf(decidedKey, decidedVersion);
      if (release === undefined) continue;
      for (const constraint of constraintsOf(release)) {
        if (constraint.kind !== 'preference') continue;
        if (key === WORLD_SYSTEM) {
          const { system, version: systemVersion } = splitWorldSystem(version);
          if (constraint.on === system && opsOf(system).contains(constraint.range, systemVersion)) score++;
        } else if (constraint.on === key && opsOf(key).contains(constraint.range, version)) {
          score++;
        }
      }
    }
    return score;
  }

  /** Every candidate version of a package, newest first. */
  function candidates(key: PackageKey): string[] {
    const newestFirst = (list: string[], order: VersionOrder) => list.sort((a, b) => order.compare(b, a));
    if (key === CORE) return newestFirst([...coreVersions], foundryOrder);
    if (key === WORLD_SYSTEM) {
      return systems.flatMap(system =>
        candidates(system).map(version => worldSystemVersion(system.slice('system:'.length), version)),
      );
    }
    return newestFirst([...(releases.get(key)?.keys() ?? [])], orderOf(key));
  }

  const term = (key: PackageKey, range: Range, positive: boolean): Term => ({ package: key, range, positive });
  const exactly = (key: PackageKey, version: string) => term(key, opsOf(key).exactly(version), true);

  /** The incompatibilities one of a release's hard constraints brings. */
  function encode(self: Term, constraint: Constraint): { terms: Term[]; data: Reason }[] {
    const data: Reason = { kind: 'constraint', constraint };
    switch (constraint.kind) {
      case 'dependency':
        return [{ terms: [self, term(constraint.on, constraint.range, false)], data }];
      case 'exclusion':
        return [{ terms: [self, term(constraint.on, constraint.range, true)], data }];
      case 'choice': {
        const range = constraint.options.reduce(
          (all, option) => opsOf(WORLD_SYSTEM).union(all, worldSystemRange(worldSystems, option.on, option.range)),
          opsOf(WORLD_SYSTEM).none,
        );
        return [{ terms: [self, term(WORLD_SYSTEM, range, false)], data }];
      }
      case 'unusable':
        return [{ terms: [self], data }];
      default:
        return [];
    }
  }

  const provider: Provider<Reason> = {
    orderOf,

    // Core and the world's system are chosen to suit the modules, so that the modules' preferences
    // (verified, system ranges) are known when they are decided.
    decideLast: key => key === CORE || key === WORLD_SYSTEM,

    versions(key, decided) {
      const all = candidates(key);
      const score = new Map(all.map(version => [version, preferenceScore(key, version, decided)]));
      const pinned = (version: string) => {
        const named = key === WORLD_SYSTEM ? splitWorldSystem(version) : { system: key, version };
        return isPreferred(named.system, named.version);
      };
      const unlisted = (version: string) => {
        const named = key === WORLD_SYSTEM ? splitWorldSystem(version) : { system: key, version };
        return releaseOf(named.system, named.version)?.unlisted === true;
      };
      return [...all].sort(
        (a, b) =>
          Number(pinned(b)) - Number(pinned(a)) ||
          Number(unlisted(a)) - Number(unlisted(b)) ||
          (score.get(b) as number) - (score.get(a) as number),
      );
    },

    incompatibilities(key, version) {
      const self = exactly(key, version);
      if (key === REQUIREMENTS) {
        return [
          { terms: [self, term(CORE, opsOf(CORE).any, false)], data: { kind: 'setup', package: CORE } },
          {
            terms: [self, term(WORLD_SYSTEM, opsOf(WORLD_SYSTEM).any, false)],
            data: { kind: 'setup', package: WORLD_SYSTEM },
          },
          ...(requirements.require ?? []).map(({ package: required, range = opsOf(required).any }) => ({
            terms: [self, term(required, range, false)],
            data: { kind: 'requirement', package: required, range } as const,
          })),
          ...pins.map(pin => ({
            terms: [self, term(pin.package, opsOf(pin.package).exactly(pin.version), false)],
            data: { kind: 'pin', package: pin.package, version: pin.version } as const,
          })),
        ];
      }
      if (key === WORLD_SYSTEM) {
        const { system: systemKey, version: systemVersion } = splitWorldSystem(version);
        return [
          {
            terms: [self, term(systemKey, opsOf(systemKey).exactly(systemVersion), false)],
            data: { kind: 'world-system', system: systemKey, version: systemVersion },
          },
        ];
      }
      if (key === CORE) {
        // A core build the caller cannot run stays a candidate, so that an explanation can say why it is not chosen.
        return coreLimits
          .filter(limit => limit.version === version)
          .map(({ reason }) => ({ terms: [self], data: { kind: 'core-limit', version, reason } as const }));
      }
      // Every other version the solver asks about is a candidate, so has a release.
      const release = releaseOf(key, version) as Release;
      const own = constraintsOf(release).flatMap(constraint => encode(self, constraint));
      if (release.package.type !== 'system') return own;
      return [
        ...own,
        {
          terms: [
            self,
            term(WORLD_SYSTEM, opsOf(WORLD_SYSTEM).exactly(worldSystemVersion(release.package.id, version)), false),
          ],
          data: { kind: 'world-system', system: key, version },
        },
      ];
    },
  };

  const result = solve(provider, { package: REQUIREMENTS, version: '0' });

  /** The listed releases among these versions, which must be loaded before the answer is final. */
  const listedAmong = (versions: readonly PackageVersion[]): PackageVersion[] => {
    const needs = new Map<string, PackageVersion>();
    for (const { package: key, version } of versions) {
      if (releaseOf(key, version)?.detail === 'listed') needs.set(`${key}@${version}`, { package: key, version });
    }
    return [...needs.values()];
  };

  if (!result.ok) {
    // A failure that leans on a listed release's constraints may not hold once it is loaded.
    const leaning = constraintsIn(result.failure).map(({ from }) => from);
    // A failure that rests on there being no versions of something may not hold either: a manifest
    // can name packages the universe does not have yet. So it also needs the most preferred
    // listed release of every package with nothing loaded.
    const unexplored = restsOnNoVersions(result.failure)
      ? [...releases].flatMap(([key, byVersion]) => {
          const all = [...byVersion.values()];
          if (all.some(release => release.detail === 'loaded')) return [];
          const [first] = candidates(key).filter(version => byVersion.get(version)?.detail === 'listed');
          return first === undefined ? [] : [{ package: key, version: first }];
        })
      : [];
    const needs = listedAmong([...leaning, ...unexplored]);
    return needs.length > 0
      ? { ok: false, needs, warnings: orders.warnings }
      : { ok: false, failure: result.failure, warnings: orders.warnings };
  }

  const chosen = [...result.versions].flatMap(([key, version]) => {
    const release = releaseOf(key, version);
    return release === undefined ? [] : [release];
  });
  const needs = listedAmong([...result.versions].map(([key, version]) => ({ package: key, version })));
  if (needs.length > 0) return { ok: false, needs, warnings: orders.warnings };
  return {
    ok: true,
    setup: {
      core: result.versions.get(CORE) as string,
      system: chosen.find(release => release.package.type === 'system') as Release,
      modules: chosen.filter(release => release.package.type === 'module'),
    },
    warnings: orders.warnings,
  };
}
