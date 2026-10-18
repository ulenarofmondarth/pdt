import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from 'vitest';
import PDT from '@/constants.js';
import { m } from '@i18n/messages.js';

const mocks = vi.hoisted(() => ({
  pfs: { userConfigDir: '', userDataDir: '/unused', pdtConfigDir: undefined as string | undefined },
}));

// The process's own directories would read the configuration of whoever runs the tests.
vi.mock('@util/runtime-config.js', () => ({ pfs: mocks.pfs }));

/** The module loads the configuration as it loads, so each test loads it afresh. */
async function loadConfig() {
  vi.resetModules();
  return (await import('@util/config.js')).default;
}

describe('configuration of the running process', () => {
  let sandbox: string;
  let processExit: MockInstance<typeof process.exit>;
  let consoleError: MockInstance<typeof console.error>;

  function writeConfig(dir: string, content: unknown) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(content));
  }

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-config-'));
    mocks.pfs.userConfigDir = path.join(sandbox, 'user');
    mocks.pfs.pdtConfigDir = undefined;
    processExit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as () => never);
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  // Regression: the user's configuration file was never read.
  test("reads the user's configuration file", async () => {
    writeConfig(mocks.pfs.userConfigDir, { Logging: { level: 'debug' } });

    const config = await loadConfig();

    expect(config.Logging.level).toBe('debug');
  });

  test("reads the project's configuration file after the user's", async () => {
    mocks.pfs.pdtConfigDir = path.join(sandbox, 'module', PDT.PROJECT_RTD_DIR_NAME);
    writeConfig(mocks.pfs.userConfigDir, { Logging: { level: 'debug', filename: 'user.log' } });
    writeConfig(mocks.pfs.pdtConfigDir, { Logging: { level: 'error' } });

    const config = await loadConfig();

    expect(config.Logging).toEqual({ level: 'error', filename: 'user.log' });
  });

  test('takes the log level from PDT_LOG_LEVEL', async () => {
    vi.stubEnv('PDT_LOG_LEVEL', 'silly');

    const config = await loadConfig();

    expect(config.Logging.level).toBe('silly');
  });

  test('exits with the invalid configuration code when the configuration is invalid', async () => {
    writeConfig(mocks.pfs.userConfigDir, { Logging: { level: 'chatty' } });

    await loadConfig();

    expect(processExit).toHaveBeenCalledExactlyOnceWith(PDT.EXITCODE.INVALID_CONFIG);
  });

  test('reports each problem on standard error before exiting', async () => {
    writeConfig(mocks.pfs.userConfigDir, { Logging: { level: 'chatty', filename: 42 } });

    await loadConfig();

    const printed = consoleError.mock.calls.flat().join('\n');
    expect(printed).toContain(m['error.config.invalid']());
    expect(printed).toContain('Logging.filename');
    expect(printed).toContain('Logging.level');
    expect(consoleError.mock.invocationCallOrder.at(-1)).toBeLessThan(processExit.mock.invocationCallOrder[0]!);
  });

  test('exits naming a file that is not JSON', async () => {
    fs.mkdirSync(mocks.pfs.userConfigDir, { recursive: true });
    fs.writeFileSync(path.join(mocks.pfs.userConfigDir, 'config.json'), '{ not json');

    await loadConfig();

    expect(consoleError.mock.calls.flat().join('\n')).toContain(path.join(mocks.pfs.userConfigDir, 'config.json'));
    expect(processExit).toHaveBeenCalledExactlyOnceWith(PDT.EXITCODE.INVALID_CONFIG);
  });

  test('does not hide an unexpected failure as a configuration error', async () => {
    vi.doMock('@util/load-config.js', async importOriginal => ({
      ...(await importOriginal<typeof import('@util/load-config.js')>()),
      loadConfig: () => {
        throw new Error('disk on fire');
      },
    }));

    try {
      await expect(loadConfig()).rejects.toThrow('disk on fire');
      expect(processExit).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock('@util/load-config.js');
    }
  });
});
