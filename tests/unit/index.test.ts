import os from 'node:os';
import { afterEach, describe, expect, test, vi } from 'vitest';
import PDT from '@/constants.js';

import type { MainContext } from '@/main.js';

const mocks = vi.hoisted(() => ({
  main: vi.fn(),
  closeLogger: vi.fn(),
}));

vi.mock('@/main.js', () => ({ main: mocks.main }));
vi.mock('@util/logger.js', async () => ({
  ...(await import('@tests/unit/mocks/logger.js')).createLoggerModuleMock(),
  closeLogger: mocks.closeLogger,
}));

/** The entry point runs as it loads. */
async function runCli() {
  vi.resetModules();
  await import('@/index.js');
}

describe('cli entry point', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
    process.exitCode = undefined;
  });

  test('runs pdt with the command line arguments, without node and the script', async () => {
    mocks.main.mockResolvedValue(PDT.EXITCODE.OK);

    await runCli();

    expect(mocks.main).toHaveBeenCalledExactlyOnceWith(
      process.argv.slice(2),
      expect.objectContaining({ env: process.env }),
    );
  });

  test('runs in the directory it was started in, for the user running it', async () => {
    mocks.main.mockResolvedValue(PDT.EXITCODE.OK);

    await runCli();

    const { resolvePaths } = await import('@util/runtime-config.js');
    const paths = resolvePaths({
      cwd: process.cwd(),
      home: os.homedir(),
      platform: process.platform,
      env: process.env,
    });
    expect(mocks.main).toHaveBeenCalledExactlyOnceWith(expect.anything(), expect.objectContaining({ paths }));
  });

  describe('questions', () => {
    const original = { stdin: process.stdin.isTTY, stdout: process.stdout.isTTY };

    function terminal(isTTY: boolean | undefined) {
      Object.defineProperty(process.stdin, 'isTTY', { value: isTTY, configurable: true });
      Object.defineProperty(process.stdout, 'isTTY', { value: isTTY, configurable: true });
    }

    afterEach(() => {
      Object.defineProperty(process.stdin, 'isTTY', { value: original.stdin, configurable: true });
      Object.defineProperty(process.stdout, 'isTTY', { value: original.stdout, configurable: true });
    });

    test('are asked in the terminal when there is one', async () => {
      terminal(true);
      mocks.main.mockResolvedValue(PDT.EXITCODE.OK);

      await runCli();

      const { terminalPrompter } = await import('@util/prompt.js');
      expect(mocks.main.mock.calls[0]![1]).toMatchObject({ prompter: terminalPrompter });
    });

    test('are not asked without a terminal', async () => {
      terminal(undefined);
      mocks.main.mockResolvedValue(PDT.EXITCODE.OK);

      await runCli();

      expect(mocks.main.mock.calls[0]![1]).not.toHaveProperty('prompter');
    });
  });

  test('exits with the code pdt returns', async () => {
    mocks.main.mockResolvedValue(PDT.EXITCODE.USAGE);

    await runCli();

    expect(process.exitCode).toBe(PDT.EXITCODE.USAGE);
  });

  test('writes out the log before finishing', async () => {
    mocks.main.mockResolvedValue(PDT.EXITCODE.OK);

    await runCli();

    expect(mocks.closeLogger).toHaveBeenCalledOnce();
    expect(mocks.main.mock.invocationCallOrder[0]).toBeLessThan(mocks.closeLogger.mock.invocationCallOrder[0]!);
  });

  // Ending with process.exit() would cut off output still on its way to a pipe, e.g. `pdt --help | less`.
  test('lets the process end by itself', async () => {
    const processExit = vi.spyOn(process, 'exit');
    mocks.main.mockResolvedValue(PDT.EXITCODE.ERROR);

    await runCli();

    expect(processExit).not.toHaveBeenCalled();
  });

  test('writes output to standard output and problems to standard error', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.main.mockImplementation(async (_args: string[], context: MainContext) => {
      context.out('the help');
      context.err('a problem');
      return PDT.EXITCODE.OK;
    });

    await runCli();

    expect(consoleLog).toHaveBeenCalledExactlyOnceWith('the help');
    expect(consoleError).toHaveBeenCalledExactlyOnceWith('a problem');
  });
});
