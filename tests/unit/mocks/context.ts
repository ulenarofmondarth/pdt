import { vi } from 'vitest';
import defaults from '@/pdt-internal-config/default.json' with { type: 'json' };
import { config as configSchema } from '@schema/config.js';

import type { CommandContext, CommandLog } from '@/cli/context.js';
import type { createModule, Prompter } from '@lib/ModuleGenerator.js';
import type { createVtt } from '@lib/VTT/createVtt.js';
import type { ConfigSource } from '@util/load-config.js';

/** A CommandLog that records every call. */
export function createLogMock() {
  return {
    error: vi.fn<CommandLog['error']>(),
    warn: vi.fn<CommandLog['warn']>(),
    info: vi.fn<CommandLog['info']>(),
    debug: vi.fn<CommandLog['debug']>(),
    setDirectory: vi.fn<CommandLog['setDirectory']>(),
  } satisfies CommandLog;
}

/**
 * What a command gets to work with, for a test: the shipped default configuration, paths that are
 * outside any project and lead nowhere, and spies for everything a command does. There is no
 * prompter; give it one to test asking questions. Every value's source is the default,
 * `writeConfig` and `clearConfig` write nothing, and no file sets anything. `createVtt` makes nothing until a test says what
 * it makes.
 *
 * Change any part of it before creating the command.
 */
export function createCommandContext() {
  const context: CommandContext & {
    log: ReturnType<typeof createLogMock>;
    out: ReturnType<typeof vi.fn<CommandContext['out']>>;
    createModule: ReturnType<typeof vi.fn<typeof createModule>>;
    createVtt: ReturnType<typeof vi.fn<typeof createVtt>>;
    isPortFree: ReturnType<typeof vi.fn<CommandContext['isPortFree']>>;
    isUrlReachable: ReturnType<typeof vi.fn<CommandContext['isUrlReachable']>>;
    sourceOf: ReturnType<typeof vi.fn<CommandContext['sourceOf']>>;
    writeConfig: ReturnType<typeof vi.fn<CommandContext['writeConfig']>>;
    filesSetting: ReturnType<typeof vi.fn<CommandContext['filesSetting']>>;
    clearConfig: ReturnType<typeof vi.fn<CommandContext['clearConfig']>>;
  } = {
    paths: {
      cwd: '/nonexistent/cwd',
      userConfigDir: '/nonexistent/config',
      userDataDir: '/nonexistent/data',
      pdtConfigDir: undefined,
    },
    config: configSchema.parse(defaults),
    sourceOf: vi.fn<CommandContext['sourceOf']>((): ConfigSource => 'default'),
    writeConfig: vi.fn<CommandContext['writeConfig']>(() => []),
    configFiles: [
      { path: '/nonexistent/config/config.json', source: 'user', secrets: false },
      { path: '/nonexistent/config/secrets.conf', source: 'user', secrets: true },
    ],
    filesSetting: vi.fn<CommandContext['filesSetting']>(() => []),
    clearConfig: vi.fn<CommandContext['clearConfig']>(() => []),
    log: createLogMock(),
    out: vi.fn<CommandContext['out']>(),
    createModule: vi.fn<typeof createModule>(),
    createVtt: vi.fn<typeof createVtt>(),
    isPortFree: vi.fn<CommandContext['isPortFree']>(() => Promise.resolve(true)),
    isUrlReachable: vi.fn<CommandContext['isUrlReachable']>(() => Promise.resolve(true)),
  };
  return context;
}

export type CommandContextMock = ReturnType<typeof createCommandContext>;

/** A prompter that must not be asked anything; for checking which prompter a command passes on. */
export const UNASKED_PROMPTER: Prompter = {
  input: () => Promise.reject(new Error('not expected to ask')),
  confirm: () => Promise.reject(new Error('not expected to ask')),
  select: () => Promise.reject(new Error('not expected to ask')),
};
