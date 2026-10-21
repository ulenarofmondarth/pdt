# API sketch

This is a sketch of the public surface, to make the model concrete. It is not a final API: names and details will change in review and in the building.

## Data

```typescript
/** A package Foundry VTT installs, or `core` for Foundry VTT itself. */
type PackageType = 'core' | 'module' | 'system' | 'world';

interface PackageRef {
  type: PackageType;
  id: string;
}

/** A set of versions of one package: a union of intervals. */
interface Range {
  readonly intervals: readonly Interval[];
}

/** One version of a package, normalised from its manifest. */
/**
 * A release holds what its manifest declares, cleaned up but not yet read as ranges: how
 * bounds are read depends on policy (`relationshipBounds`, `versionOrder`), so ranges are
 * built when a question is asked.
 */
interface Release {
  package: PackageRef;
  version: string;
  /** The core versions it declares it works with. */
  compatibility: Compatibility; // { minimum?, maximum?, verified? }, as text
  relationships: { requires; systems; conflicts; recommends: Relationship[] };
  download?: string;
  manifest?: string;
  /** A premium package: downloading it needs the user's licence. */
  protected: boolean;
  /** Where the manifest was read from. */
  origin: string;
  /** `listed`: known from a listing only; relationships and `maximum` not yet loaded. */
  detail: 'listed' | 'loaded';
  /** Core bounds from Foundry's listing, where they differ from the manifest's. */
  listing?: { minimum?: string; verified?: string };
}

interface Relationship {
  package: PackageRef;
  /** The versions of the related package it admits, as declared. */
  compatibility: Compatibility;
  manifest?: string;
  reason?: string;
}

interface CoreRelease {
  version: string; // "14.350"
  generation: number; // 14
  channel: 'stable' | 'testing' | 'development' | 'prototype';
}

/** Everything the solver may choose from. Plain, serialisable data. */
interface Universe {
  core: CoreRelease[];
  releases: Release[];
  /** What could not be fetched, so explanations can mention it. */
  gaps: SourceGap[];
}
```

Manifests are read with zod, leniently, into these types. `normaliseManifest(json, { origin, type })` returns a `Release` and its warnings, or the problems that make the manifest unreadable. Warnings and problems are data (a `code` and its details, such as `{ code: 'legacy-field', field: 'minimumCoreVersion', replacement: 'compatibility.minimum' }`), so that pdt words and translates them.

## Asking

```typescript
/** Packages are named by key: `core`, or `<type>:<id>` such as `module:midi-qol`. */
interface Requirements {
  /** Packages that must be in the setup, each in a range ("any" by default). A setup always has a core and a system. */
  require?: { package: PackageKey; range?: Range }[];
  /** Exact versions: pins, or a lockfile replayed. A pin may choose a version the policy would not. */
  pins?: { package: PackageKey; version: string }[];
  /** Versions to prefer without requiring them, such as the lockfile when upgrading. */
  prefer?: { package: PackageKey; version: string }[];
}

// As built: overrides and core limits. Reasons are shown as written, so already translated.
interface Declarations {
  overrides?: Override[];
  /** Core builds the caller cannot run, each with its reason ("there is no felddy/foundryvtt image for it"). */
  coreLimits?: { version: string; reason: string }[];
}

/** Each corrects the releases of `package`: the `versions` listed exactly, or every version. */
type Override = { package: PackageKey; versions?: string[]; reason: string } & (
  /** Unusable: at all, or with `with` in its bounds (core bounds may name a generation). */
  | { kind: 'exclude'; with?: { package: PackageKey; minimum?: string; maximum?: string } }
  /** Core bounds in place of the release's (and the listing's): given replaces, `null` removes. */
  | { kind: 'compatibility'; compatibility: { minimum?: string | null; verified?: string | null; maximum?: string | null } }
  /** Ignore every relationship naming `drop`. */
  | { kind: 'relationship'; drop: PackageKey }
);

// Not built yet.
interface MatrixDeclarations {
  supportMatrix?: MatrixCell[];
}

interface Policy {
  verified: 'prefer' | 'require' | 'ignore';
  conflicts: 'enforce' | 'warn';
  coreChannels: CoreRelease['channel'][];
  prereleases: 'exclude' | 'include';
  recommends: 'report' | 'install';
  missingCompatibility: 'any' | 'reject';
  systemCompatibility: 'prefer' | 'require' | 'ignore';
  relationshipBounds: 'foundry' | 'prefix';
  versionOrder: 'foundry' | 'semver';
  listingCompatibility: 'prefer' | 'ignore';
}

// setup: { core: '14.368', system: { package: 'system:dnd5e', version: '5.3.3' }, modules: [...] }
// CheckResult: valid, and for each release its Foundry availability code and the
// constraints broken, preferences missed and advisories that apply; and the core limits
// the setup's core is under. Overrides change what the resolver finds, not Foundry's verdicts.
function check(universe: Universe, setup: SetupSpec, options?: Options): CheckResult;
function resolve(universe: Universe, requirements: Requirements, options?: Options): Resolution;
function matrix(universe: Universe, root: PackageRef, axes: MatrixAxes, options?: Options): Matrix;

interface Options {
  declarations?: Declarations;
  policy?: Partial<Policy>;
}

// As built: `setup` is the core version, the system release and the module releases;
// `failure` is the solver's incompatibility, with its derivation, as the explanation.
// An incomplete answer is `ok: false` with `needs`, not a third value of `ok`: a string there
// would be truthy, so `if (result.ok)` would take an incomplete answer for a setup.
// The install plan comes with the sources.
type Resolution =
  | { ok: true; setup: Setup; warnings: OrderWarning[] }
  | { ok: false; failure: Incompatibility<Reason>; warnings: OrderWarning[] }
  /** The answer depends on listed releases: load these and resolve again (see Resolution, "Resolving in rounds"). */
  | { ok: false; needs: PackageVersion[]; warnings: OrderWarning[] };
```

A constraint an override declared or changed carries it in its provenance (`override: { index, reason }`), and a core limit reaches the solver as a reason of its own (`{ kind: 'core-limit', version, reason }`), so explanations give their reasons: "my-module 2.0.0 cannot be used (override: it deletes worlds)", "Foundry VTT 14.362 cannot be used: there is no felddy/foundryvtt image for it".

The explanation is the solver's failure: a tree of incompatibilities, each with its provenance. `explain(failure, messages?)` turns it into numbered sentences (`{ text, number? }[]`), with the wording passed in, so pdt can translate it; `explanationText` joins them into lines. `formatExplanation(failure, external, messages?)` does the same for any solver failure, given words for its data.

## Building a universe (adapters)

```typescript
interface ReleaseSource {
  /** The known releases of a package, listed or loaded, or why they could not be listed. */
  releases(ref: PackageRef, signal?: AbortSignal): Promise<SourceResult<Release[]>>;
  /** Load one listed release from its manifest. */
  load(release: Release, signal?: AbortSignal): Promise<SourceResult<Release>>;
}

interface CoreSource {
  releases(signal?: AbortSignal): Promise<SourceResult<CoreRelease[]>>;
}

/** Each adapter is made with its options: `fetch`, and a token where the service takes one. */
// As built, in @mondarth/fvtt-resolver/sources: each source fetches through one httpClient,
// which takes the fetch, the cache and the request budget.
function localSource(manifests: { json: unknown; origin: string; type: 'module' | 'system' }[]): ReleaseSource;
function foundryIndexSource(http: HttpClient): ReleaseSource;
function githubSource(http: HttpClient, options?: { token?: string }): ReleaseSource;
function gitlabSource(http: HttpClient, options?: { token?: string; hosts?: string[] }): ReleaseSource;
function manifestUrlSource(http: HttpClient): ReleaseSource;
function foundryCoreReleases(http: HttpClient): Promise<SourceResult<CoreRelease[]>>;
/** A fetch through a CORS proxy, for a browser: `{url}` in the template becomes the target, percent-encoded. */
function proxiedFetch(fetch: typeof globalThis.fetch, proxy: string | ((url: string) => string)): typeof globalThis.fetch;

function buildUniverse(input: {
  requirements: Requirements;
  sources: ReleaseSource[]; // tried in order
  core: CoreSource;
  cache?: Cache;
  limit?: UniverseLimit; // e.g. only core generations 13 and 14
  budget?: RequestBudget; // per source: most requests per run, most at a time
}): Promise<Universe>;

/**
 * The rounds loop: resolve, load what was needed, and repeat until the answer is final.
 * It is in the core, since loading is a function the caller gives (a source's `load`, a cache,
 * anything); the core itself still does no I/O.
 */
function resolveInRounds(
  universe: Universe,
  requirements: Requirements,
  load: (needs: PackageVersion[]) => Promise<Release[]>,
  options?: { policy?: Partial<Policy>; maxRounds?: number }, // 10 rounds by default
): Promise<{ resolution: Resolution; universe: Universe; rounds: number; unloaded: PackageVersion[] }>;
```

## How pdt would use it

`pdt vtt install [vtt]` will:

1. Read the VTT's configuration (`VTT.<vtt>.server.version` is the core release, `VTT.<vtt>.packages` what else to install) and the project's module, from the working copy.
2. Build a universe from:
   - a local source for the project's module;
   - the Foundry index, GitHub, GitLab and manifest-URL sources for everything else, with tokens from `SOURCES.github_token` and `SOURCES.gitlab_token`;
   - Foundry's release notes for core;
   - pdt's cache, on disk under `<user data>/cache/resolver/`.
3. List the image's tags on Docker Hub, a generation at a time, keeping only the tags that are exactly a release's version, and pass the builds without one as core limits.
4. Resolve, with:
   - the project's module, the modules in `packages.modules`, and the configured core version as requirements: install does not change core;
   - the system in `packages.system`, or the one the resolver chooses;
   - pins from the lockfile (preferences with `--upgrade`), and the overrides in `packages.overrides`.
5. On success, apply the install plan:
   - download each release into the VTT's data directory (`Data/systems/<id>`, `Data/modules/<id>`), skipping what is already there at the right version, and taking the folder that holds the manifest as the package, as Foundry does;
   - list premium packages for the user to install through Foundry VTT, since downloading them needs the user's licence;
   - remove packages no longer needed, as a setting says: `auto` removes only those the previous lockfile says pdt installed, `never` removes none, and `remove` removes every package the setup does not need, even those installed by hand;
   - write the lockfile, `.pdt/vtt.lock.json`, beside the run state.
6. On failure, print the explanation, in the user's language, and exit with a non-zero code.

A running VTT is handled as a setting says: `auto` stops it, installs and starts it again; `block` refuses to install; `warn` installs and advises a restart.

It is built in three steps: the wiring (pdt's use of the resolver, the image tags, the disk cache and the tokens); resolving, with `--dry-run` to show the plan; then installing, with the lockfile and the settings for a running VTT and for removals.

`pdt vtt start` could then check the installed setup before starting, and warn about anything that is not valid. A future `pdt compat` (name to be decided) would print the matrix for the project's module.

None of this changes the resolver: pdt supplies the adapters, the cache and the file formats, and the resolver stays pure.

## Errors

The core functions do not throw for anything a user can cause: no solution, an unreadable manifest, a missing package. These come back as values, with explanations. They throw only for programming errors, such as a malformed universe passed in by hand.
