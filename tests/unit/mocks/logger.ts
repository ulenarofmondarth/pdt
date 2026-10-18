import { vi } from 'vitest';

type LoggerModule = typeof import('@util/logger.js');

/**
 * Replacement for the `@util/logger.js` module that records calls and writes nothing.
 *
 * Use it as the factory of a module mock:
 *
 * ```ts
 * vi.mock('@util/logger.js', async () => (await import('@tests/unit/mocks/logger.js')).createLoggerModuleMock());
 * ```
 *
 * The `satisfies` clauses fail the type check if the logger module's exports are renamed.
 */
export function createLoggerModuleMock() {
  return {
    default: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    } satisfies Partial<Record<keyof LoggerModule['default'], unknown>>,
    configureLogger: vi.fn<LoggerModule['configureLogger']>(),
    setLogDirectory: vi.fn<LoggerModule['setLogDirectory']>(),
    closeLogger: vi.fn<LoggerModule['closeLogger']>().mockResolvedValue(undefined),
  } satisfies Record<keyof LoggerModule, unknown>;
}
