import { afterEach, describe, expect, test, vi } from 'vitest';
import PDT from '@/constants.js';

const mocks = vi.hoisted(() => ({
  parseSync: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  exit: vi.fn(),
}));

vi.mock('@/cli/parsers.js', () => ({ parser: { parseSync: mocks.parseSync } }));
vi.mock('@util/logger.js', () => ({
  default: { error: mocks.error, debug: mocks.debug },
  exit: mocks.exit,
}));

async function runCli() {
  vi.resetModules();
  await import('@/index.js');
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

  describe('when the parser has output for the user', () => {
    type ParseCallback = (err: object | null, argv: object, output: string) => void;

    function parserReports(output: string) {
      mocks.parseSync.mockImplementation((_args: string[], callback: ParseCallback) =>
        callback(null, { _: [], $0: 'pdt' }, output),
      );
    }

    test('prints it', async () => {
      const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      parserReports('Usage: pdt <command>');

      await runCli();

      expect(consoleLog).toHaveBeenCalledExactlyOnceWith('Usage: pdt <command>');
      consoleLog.mockRestore();
    });

    test('prints nothing when the output is empty', async () => {
      const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      parserReports('');

      await runCli();

      expect(consoleLog).not.toHaveBeenCalled();
      consoleLog.mockRestore();
    });

    test('records what was parsed at debug level', async () => {
      parserReports('');

      await runCli();

      expect(mocks.debug).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('"$0": "pdt"'));
    });
  });

  test('passes the command line arguments, without node and the script, to the parser', async () => {
    await runCli();

    expect(mocks.parseSync).toHaveBeenCalledExactlyOnceWith(process.argv.slice(2), expect.any(Function));
  });

  test('does not force an exit when parsing succeeds', async () => {
    await runCli();

    expect(mocks.exit).not.toHaveBeenCalled();
  });
});
