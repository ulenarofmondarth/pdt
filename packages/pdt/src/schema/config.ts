import { z } from 'zod/v4';

/** Image a Docker host runs when its settings name none. */
export const DEFAULT_DOCKER_IMAGE = 'felddy/foundryvtt';

/**
 * How long, in seconds, to wait for a server to answer once its host has started it, when the
 * settings do not say. The first start of a Foundry VTT container downloads and installs Foundry VTT.
 */
export const DEFAULT_START_TIMEOUT = 600;

/**
 * The settings whose values are secret. They are kept in a `secrets.conf`, never in a
 * `config.json`, and are shown masked unless asked for.
 */
export const secretSettings = z.registry<Record<string, never>>();

/** A secret text setting. */
const secret = () => z.string().register(secretSettings, {});

/** How to know a server is ready, once its host has started it. */
const readiness = z.object({
  /** How long to wait, in seconds, for the server to answer. */
  timeout: z.int().min(0).default(DEFAULT_START_TIMEOUT),
});

const foundryServerSettings = z.object({
  type: z.literal(['foundry']),
  hostname: z.string(),
  /** The Foundry VTT release to run. */
  version: z.string(),
  /** The port to serve on, on the machine pdt runs on: a number, or `auto` for the first free one from 30000. */
  port: z.union([z.literal('auto'), z.int().min(1).max(65535)]).default('auto'),
  /** How to know the server is ready; waited on for 600 seconds unless set. */
  ready: readiness.prefault({}),
  /** Whether Foundry VTT reloads a module's styles, templates and translations as they change; on unless set. */
  hot_reload: z.boolean().default(true),
  /** The password of the server's administrator. */
  admin_key: secret().optional(),
});

export const serverSchema = z.discriminatedUnion('type', [foundryServerSettings]);

/** A Foundry VTT server's settings. */
export type FoundryServerSettings = z.output<typeof foundryServerSettings>;

/** A VTT server's settings, of any type. */
export type ServerSettings = z.output<typeof serverSchema>;

const dockerHostSettings = z.object({
  type: z.literal(['docker']),
  /** Docker engine socket; dockerode's default when not given. */
  socketPath: z.string().optional(),
  /** Registry to pull the image from; Docker Hub when not given. */
  repository: z.string().optional(),
  /** Image to run, without a tag. */
  image: z.string().default(DEFAULT_DOCKER_IMAGE),
  /** Tag of the image, for a host whose image is not tagged by a server's version. */
  version: z.string().optional(),
});

export const hostSchema = z.discriminatedUnion('type', [dockerHostSettings]);

/** A Docker host's settings. */
export type DockerHostSettings = z.output<typeof dockerHostSettings>;

/** A VTT host's settings, of any type. */
export type HostSettings = z.output<typeof hostSchema>;

/** A package as the resolver names it: `core`, or `module:<id>` or `system:<id>`. */
const packageKey = z.string().regex(/^(core|(module|system):[^\s:]+)$/);

/** Bounds as a manifest writes them. */
const bound = z.string().min(1);

const overrideCommon = {
  /** The package whose releases it corrects. */
  package: packageKey,
  /** The versions it corrects, exactly as the releases give them; every version when not given. */
  versions: z.array(z.string().min(1)).min(1).optional(),
  /** Why, shown in explanations that lean on it. */
  reason: z.string().min(1),
};

/** A correction to what a package's authors declared (see the resolver's overrides). */
const overrideSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('exclude'),
    ...overrideCommon,
    with: z.object({ package: packageKey, minimum: bound.optional(), maximum: bound.optional() }).optional(),
  }),
  z.object({
    kind: z.literal('compatibility'),
    ...overrideCommon,
    compatibility: z.object({
      minimum: bound.nullable().optional(),
      verified: bound.nullable().optional(),
      maximum: bound.nullable().optional(),
    }),
  }),
  z.object({ kind: z.literal('relationship'), ...overrideCommon, drop: packageKey }),
]);

/** A correction to what a package's authors declared, as configured. */
export type OverrideSettings = z.output<typeof overrideSchema>;

/** A package id, as in its manifest. */
const packageId = z.string().regex(/^[^\s:]+$/);

/** What `pdt vtt install` installs besides the project's module, and how. */
const packagesSettings = z.object({
  /** The system to install, by id; the one the resolver chooses when not given. */
  system: packageId.optional(),
  /** More modules to install, by id. */
  modules: z.array(packageId).default([]),
  /** Corrections to what packages' authors declared, each with its reason. */
  overrides: z.array(overrideSchema).default([]),
});

/** What `pdt vtt install` installs besides the project's module. */
export type PackagesSettings = z.output<typeof packagesSettings>;

export const vttSchema = z.object({
  server: serverSchema,
  host: hostSchema,
  /** What `pdt vtt install` installs besides the project's module. */
  packages: packagesSettings.optional(),
});

/** A VTT's settings: its server, and the host it runs on. */
export type VttSettings = z.output<typeof vttSchema>;

/** The Foundry VTT account every project's servers use. */
export const foundryAccount = z.object({
  username: secret().optional(),
  password: secret().optional(),
  license_key: secret().optional(),
});

/** The Foundry VTT account, to download and license Foundry VTT with. */
export type FoundryAccount = z.output<typeof foundryAccount>;

/** Where pdt finds packages' releases, beyond Foundry VTT's own listing. */
export const packageSources = z.object({
  /** A GitHub token, for GitHub's higher rate limit when listing releases. */
  github_token: secret().optional(),
  /** A GitLab token, for GitLab's releases. */
  gitlab_token: secret().optional(),
});

/** Where pdt finds packages' releases. */
export type PackageSources = z.output<typeof packageSources>;

const npmDebugLevels = z.literal(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']);

export const config = z.object({
  /** The project's id, which names its VTT; set by `pdt init` from the module's id. */
  id: z
    .string()
    .regex(/^[^.]+$/)
    .optional(),
  Logging: z.object({
    filename: z.string(),
    level: npmDebugLevels,
  }),
  VTT: z.record(z.string(), vttSchema),
  FOUNDRY: foundryAccount.optional(),
  SOURCES: packageSources.optional(),
});

export type Config = z.infer<typeof config>;
