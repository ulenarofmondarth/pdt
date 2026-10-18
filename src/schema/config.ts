import { z } from 'zod/v4';

const foundryServerConfig = z.object({
  type: z.literal(['foundry']),
  hostname: z.string(),
  version: z.string(),
  port: z.string().optional(),
});

export const serverSchema = z.discriminatedUnion('type', [foundryServerConfig]);

export type VTTServerConfig = z.infer<typeof serverSchema>;

const dockerHostConfig = z.object({
  type: z.literal(['docker']),
  repository: z.string().optional(),
  image: z.string(),
  version: z.string(),
  ports: z.array(
    z.object({
      internal: z.int32(),
      external: z.union([z.literal('auto'), z.int32()]),
    }),
  ),
});

export const hostSchema = z.discriminatedUnion('type', [dockerHostConfig]);

export type HostConfig = z.infer<typeof hostSchema>;

export const vttSchema = z.object({
  server: serverSchema,
  host: hostSchema,
});

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
