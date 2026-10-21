/**
 * What `pdt vtt install` installs: the setup the resolver finds for a VTT.
 *
 * The project's module is read from the working copy; every other package's releases come from
 * Foundry VTT's package index, GitHub, GitLab and the manifest URLs packages declare. Core is the
 * version the VTT is configured to run: install never changes it. A version that names only a
 * generation (`13`) means the newest stable build of it with an image, as the image's own tag does.
 */
import { CORE, isNewerVersion, normaliseManifest, packageKey, resolveInRounds } from '@mondarth/fvtt-resolver';
import {
  foundryCoreReleases,
  foundryIndexSource,
  githubSource,
  gitlabSource,
  localSource,
  manifestUrlSource,
  sourceSet,
} from '@mondarth/fvtt-resolver/sources';
import { imageCoreLimits } from '@lib/VTT/coreImages.js';

import type {
  CoreLimit,
  CoreRelease,
  ManifestProblem,
  Override,
  PackageKey,
  PackageRef,
  PackageVersion,
  Policy,
  Release,
  Resolution,
} from '@mondarth/fvtt-resolver';
import type { HttpClient, LocalManifest, SourceGap } from '@mondarth/fvtt-resolver/sources';
import { vttPackages } from '@schema/config.js';

import type { OverrideSettings, PackageSources, VttSettings } from '@schema/config.js';

/** The most rounds of loading: enough to go back through a few dozen releases. */
export const MAX_ROUNDS = 50;

/** Every channel: core is the configured version, whichever channel it is from. */
const ALL_CHANNELS: Policy['coreChannels'] = ['stable', 'testing', 'development', 'prototype'];

export interface InstallQuestion {
  /** The project's module, as read from its `module.json`. */
  readonly project: LocalManifest;
  readonly vtt: VttSettings;
  readonly sources?: PackageSources | undefined;
  /** Why a core build without an image cannot be run, in the user's language. */
  readonly noImage: (version: string, image: string) => string;
  /** Versions to keep where they still fit, such as those the lockfile records. */
  readonly prefer?: readonly PackageVersion[];
}

/** What working out a VTT's setup found. */
export type InstallResolution =
  | {
      readonly kind: 'resolved';
      /** The core build the setup is for. */
      readonly core: string;
      readonly resolution: Resolution;
      readonly rounds: number;
      /** Releases checked only from their listing, as their manifests could not be loaded. */
      readonly unloaded: readonly { readonly package: PackageKey; readonly version: string }[];
      /** What could not be fetched or read. */
      readonly gaps: readonly SourceGap[];
    }
  /** The project's module could not be read. */
  | { readonly kind: 'project-unreadable'; readonly problems: readonly ManifestProblem[] }
  /** The VTT names a generation, and no build of it could be chosen. */
  | { readonly kind: 'no-core'; readonly generation: string; readonly gaps: readonly SourceGap[] };

/** An override as the resolver takes it, without the settings' unset fields. */
export function toOverride(settings: OverrideSettings): Override {
  const { versions, ...rest } = settings;
  const common = { package: rest.package, reason: rest.reason, ...(versions !== undefined && { versions }) };
  switch (rest.kind) {
    case 'exclude': {
      if (rest.with === undefined) return { kind: 'exclude', ...common };
      const { package: on, minimum, maximum } = rest.with;
      return {
        kind: 'exclude',
        ...common,
        with: { package: on, ...(minimum !== undefined && { minimum }), ...(maximum !== undefined && { maximum }) },
      };
    }
    case 'compatibility': {
      const bounds = Object.fromEntries(Object.entries(rest.compatibility).filter(([, bound]) => bound !== undefined));
      return { kind: 'compatibility', ...common, compatibility: bounds };
    }
    default:
      return { kind: 'relationship', ...common, drop: rest.drop };
  }
}

/** The manifest URLs a release's relationships give, by package. */
function manifestsNamedBy(release: Release): Record<PackageKey, string[]> {
  const manifests: Record<PackageKey, string[]> = {};
  for (const { package: ref, manifest } of [...release.relationships.requires, ...release.relationships.systems]) {
    if (manifest !== undefined) (manifests[packageKey(ref)] ??= []).push(manifest);
  }
  return manifests;
}

/** The image whose tags say which builds can run, or nothing when they cannot be listed. */
function imageOf({ host }: VttSettings): string | undefined {
  // Only Docker Hub's tags can be listed, and a fixed tag runs whatever the version.
  return host.type === 'docker' && host.repository === undefined && host.version === undefined ? host.image : undefined;
}

/**
 * The core build a VTT runs, with the limits that apply to it, or the generation no build of could
 * be chosen.
 */
async function coreFor(
  http: HttpClient,
  question: InstallQuestion,
  gaps: SourceGap[],
): Promise<{ core: CoreRelease; limits: CoreLimit[] } | undefined> {
  const { version } = question.vtt.server;
  const image = imageOf(question.vtt);
  const limitsOf = async (builds: readonly CoreRelease[]) => {
    if (image === undefined) return [];
    const found = await imageCoreLimits(http, builds, { image, reason: question.noImage });
    gaps.push(...found.gaps);
    return found.limits;
  };

  if (!/^\d+$/.test(version)) {
    const core: CoreRelease = { version, generation: Number.parseInt(version, 10), channel: 'stable' };
    return { core, limits: await limitsOf([core]) };
  }
  // A generation: its newest stable build that can run.
  const notes = await foundryCoreReleases(http);
  if (!notes.ok) {
    gaps.push(notes.gap);
    return undefined;
  }
  const builds = notes.value.filter(c => c.generation === Number(version) && c.channel === 'stable');
  const limited = new Set((await limitsOf(builds)).map(limit => limit.version));
  const newest = builds
    .filter(build => !limited.has(build.version))
    .reduce<CoreRelease | undefined>(
      (best, c) => (best === undefined || isNewerVersion(c.version, best.version) ? c : best),
      undefined,
    );
  return newest === undefined ? undefined : { core: newest, limits: [] };
}

/** Works out the setup to install for a VTT. */
export async function resolveInstall(http: HttpClient, question: InstallQuestion): Promise<InstallResolution> {
  const read = normaliseManifest(question.project.json, { origin: question.project.origin, type: 'module' });
  if (!read.ok) return { kind: 'project-unreadable', problems: read.problems };
  const project = read.release;

  const gaps: SourceGap[] = [];
  const chosen = await coreFor(http, question, gaps);
  if (chosen === undefined) return { kind: 'no-core', generation: question.vtt.server.version, gaps };
  const { core, limits } = chosen;

  const { sources = {}, vtt } = question;
  const packages = vttPackages(vtt);
  const set = sourceSet({
    sources: [
      localSource([question.project]),
      foundryIndexSource(http),
      githubSource(http, { ...(sources.github_token !== undefined && { token: sources.github_token }) }),
      gitlabSource(http, { ...(sources.gitlab_token !== undefined && { token: sources.gitlab_token }) }),
      manifestUrlSource(http),
    ],
    http,
    core: [core],
    // Where the packages the project's module names say their manifests are.
    manifests: manifestsNamedBy(project),
  });

  // The project's module is loaded already, so what it names is listed now, not as it is loaded.
  const refs = new Map<PackageKey, PackageRef>();
  const add = (ref: PackageRef) => refs.set(packageKey(ref), ref);
  add(project.package);
  for (const { package: ref } of [...project.relationships.requires, ...project.relationships.systems]) {
    if (ref.type !== 'world') add(ref);
  }
  for (const id of packages.modules) add({ type: 'module', id });
  if (packages.system !== undefined) add({ type: 'system', id: packages.system });

  const universe = await set.universe([...refs.values()]);
  const require = [
    { package: packageKey(project.package) },
    ...packages.modules.map(id => ({ package: `module:${id}` })),
    ...(packages.system === undefined ? [] : [{ package: `system:${packages.system}` }]),
  ];
  const { resolution, rounds, unloaded } = await resolveInRounds(
    universe,
    { require, pins: [{ package: CORE, version: core.version }], prefer: question.prefer ?? [] },
    set.load,
    {
      policy: { coreChannels: ALL_CHANNELS },
      // Each round goes back one release of a package at most, and an older core can need many.
      maxRounds: MAX_ROUNDS,
      declarations: { overrides: packages.overrides.map(toOverride), coreLimits: limits },
    },
  );
  return { kind: 'resolved', core: core.version, resolution, rounds, unloaded, gaps: [...gaps, ...set.gaps()] };
}
