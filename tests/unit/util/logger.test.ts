import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import defaults from '@/pdt-internal-config/default.json' with { type: 'json' };

const LOG_FILE = defaults.Logging.filename;

// The shipped defaults, not the configuration of whoever runs the tests.
vi.mock('@util/config.js', async () => ({
  default: (await import('@/pdt-internal-config/default.json', { with: { type: 'json' } })).default,
}));

/** Each test gets its own logger instance, because closing the logger is terminal. */
async function loadLogger() {
  vi.resetModules();
  return await import('@util/logger.js');
}

function logged(dir: string): string[] {
  return fs
    .readFileSync(path.join(dir, LOG_FILE), 'utf8')
    .split('\n')
    .filter(line => line !== '')
    .map(line => (JSON.parse(line) as { message: string }).message);
}

describe('logger', () => {
  let sandbox: string;

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-log-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  test('closeLogger resolves only once file output is on disk', async () => {
    const { default: logger, setLogDirectory, closeLogger } = await loadLogger();
    setLogDirectory(sandbox);

    logger.error('first');
    logger.error('second');
    await closeLogger();

    expect(logged(sandbox)).toEqual(['first', 'second']);
  });

  test('closeLogger can be called more than once', async () => {
    const { default: logger, setLogDirectory, closeLogger } = await loadLogger();
    setLogDirectory(sandbox);

    logger.error('only');
    await closeLogger();
    await closeLogger();

    expect(logged(sandbox)).toEqual(['only']);
  });

  test('closeLogger resolves when nothing was logged, without creating a file', async () => {
    const { setLogDirectory, closeLogger } = await loadLogger();
    setLogDirectory(sandbox);

    await closeLogger();

    expect(fs.existsSync(path.join(sandbox, LOG_FILE))).toBe(false);
  });

  // Regression: process.exit() used to discard file output that had not been flushed yet.
  test('exit flushes file output before terminating the process', async () => {
    const { default: logger, setLogDirectory, exit } = await loadLogger();
    setLogDirectory(sandbox);
    let onDiskAtExit: string[] = [];
    const processExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      onDiskAtExit = logged(sandbox);
    }) as () => never);

    logger.error('fatal problem');
    await exit(3);

    expect(processExit).toHaveBeenCalledExactlyOnceWith(3);
    expect(onDiskAtExit).toEqual(['fatal problem']);
  });

  // Regression: `pdt init` logged to the user data directory, not the project it had just created.
  test('setLogDirectory sends later messages to the new directory', async () => {
    const before = path.join(sandbox, 'before');
    const after = path.join(sandbox, 'after');
    fs.mkdirSync(before);
    fs.mkdirSync(after);
    const { default: logger, setLogDirectory, closeLogger } = await loadLogger();
    setLogDirectory(before);

    logger.error('before the move');
    setLogDirectory(after);
    logger.error('after the move');
    await closeLogger();

    expect(logged(before)).toEqual(['before the move']);
    expect(logged(after)).toEqual(['after the move']);
  });
});
