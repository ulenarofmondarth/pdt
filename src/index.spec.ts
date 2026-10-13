import { afterEach, describe, expect, test, vi } from 'vitest';
import PDT from '@/constants.js';

const mocks = vi.hoisted(() => ({
  parseSync: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  exit: vi.fn(),
}));

vi.mock('./cli/parsers.js', () => ({ parser: { parseSync: mocks.parseSync } }));
vi.mock('@util/logger.js', () => ({
  default: { error: mocks.error, debug: mocks.debug },
  exit: mocks.exit,
}));

async function runCli() {
  vi.resetModules();
  await import('./index.js');
}

describe('cli entry point', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  test('logs the error and exits with the error code when parsing throws', async () => {
    mocks.parseSync.mockImplementation(() => {
      throw new Error('it broke');
    });

    await runCli();

    expect(mocks.error).toHaveBeenCalledExactlyOnceWith('it broke');
    expect(mocks.exit).toHaveBeenCalledExactlyOnceWith(PDT.EXITCODE.ERROR);
    expect(mocks.error.mock.invocationCallOrder[0]).toBeLessThan(mocks.exit.mock.invocationCallOrder[0]!);
  });

  test('does not force an exit when parsing succeeds', async () => {
    await runCli();

    expect(mocks.exit).not.toHaveBeenCalled();
  });
});
