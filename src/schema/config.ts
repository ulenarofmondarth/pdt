import { z } from 'zod/v4';

/** Image a Docker host runs when its settings name none. */
export const DEFAULT_DOCKER_IMAGE = 'felddy/foundryvtt';

const foundryServerSettings = z.object({
  type: z.literal(['foundry']),
  hostname: z.string(),
  /** The Foundry VTT release to run. */
  version: z.string(),
  port: z.string().optional(),
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
  ports: z.array(
    z.object({
      internal: z.int32(),
      external: z.union([z.literal('auto'), z.int32()]),
    }),
  ),
});

export const hostSchema = z.discriminatedUnion('type', [dockerHostSettings]);

/** A Docker host's settings. */
export type DockerHostSettings = z.output<typeof dockerHostSettings>;

/** A VTT host's settings, of any type. */
export type HostSettings = z.output<typeof hostSchema>;

export const vttSchema = z.object({
  server: serverSchema,
  host: hostSchema,
});

/** A VTT's settings: its server, and the host it runs on. */
export type VttSettings = z.output<typeof vttSchema>;

const npmDebugLevels = z.literal(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']);

export const config = z.object({
  Logging: z.object({
    filename: z.string(),
    level: npmDebugLevels,
  }),
  VTT: z.record(z.string(), vttSchema),
  DOCS: z.object({ host: hostSchema }),
});

export type Config = z.infer<typeof config>;
