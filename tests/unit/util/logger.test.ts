import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import winston from 'winston';
import defaults from '@/pdt-internal-config/default.json' with { type: 'json' };

const LOG_FILE = defaults.Logging.filename;

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

  describe('before it is configured', () => {
    test('writes warnings and worse to the default log file', async () => {
      const { default: logger, setLogDirectory, closeLogger } = await loadLogger();
      setLogDirectory(sandbox);

      logger.info('too detailed');
      logger.warn('worth knowing');
      await closeLogger();

      expect(logged(sandbox)).toEqual(['worth knowing']);
    });

    test('writes no file until it is given a directory', async () => {
      const { default: logger, setLogDirectory, closeLogger } = await loadLogger();
      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      logger.error('console only');
      setLogDirectory(sandbox);
      logger.error('to the file');
      await closeLogger();

      expect(logged(sandbox)).toEqual(['to the file']);
    });

    // Regression guard: loading the logger used to load the configuration, and could end the process.
    test('does not read the configuration', async () => {
      vi.resetModules();
      const loadConfig = vi.fn();
      vi.doMock('@util/load-config.js', () => ({ loadConfig }));

      try {
        await import('@util/logger.js');
        expect(loadConfig).not.toHaveBeenCalled();
      } finally {
        vi.doUnmock('@util/load-config.js');
      }
    });
  });

  describe('when the log file cannot be written', () => {
    /** A directory that cannot be created, because a file has its name. */
    function blockedDirectory(): string {
      const blocked = path.join(sandbox, 'blocked');
      fs.writeFileSync(blocked, 'a file, not a directory');
      return blocked;
    }

    // Regression: the failed write was an unhandled 'error' event, which crashed pdt.
    test('keeps logging to the console and finishes normally', async () => {
      const { default: logger, setLogDirectory, closeLogger } = await loadLogger();
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const onConsole: string[] = [];
      logger.transports
        .find(transport => transport instanceof winston.transports.Console)
        ?.on('logged', (info: { message: string }) => onConsole.push(info.message.trim()));
      setLogDirectory(blockedDirectory());

      logger.error('first');
      logger.error('second');
      await expect(closeLogger()).resolves.toBeUndefined();
      // The console transport reports each line on the next turn of the event loop.
      await new Promise(resolve => setImmediate(resolve));

      expect(onConsole).toEqual(['first', 'second']);
    });

    test('says so once, on standard error, naming the file', async () => {
      const { default: logger, setLogDirectory, closeLogger } = await loadLogger();
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const blocked = blockedDirectory();
      setLogDirectory(blocked);

      logger.error('first');
      logger.error('second');
      await closeLogger();

      expect(consoleError).toHaveBeenCalledOnce();
      expect(String(consoleError.mock.calls[0]?.[0])).toContain(path.join(blocked, LOG_FILE));
    });

    test('writes to the file again once given a directory that works', async () => {
      const { default: logger, setLogDirectory, closeLogger } = await loadLogger();
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      setLogDirectory(blockedDirectory());

      logger.error('lost');
      setLogDirectory(sandbox);
      logger.error('kept');
      await closeLogger();

      expect(logged(sandbox)).toEqual(['kept']);
    });
  });

  describe('configureLogger', () => {
    test('sets the level', async () => {
      const { default: logger, configureLogger, setLogDirectory, closeLogger } = await loadLogger();
      setLogDirectory(sandbox);

      configureLogger({ level: 'debug', filename: LOG_FILE });
      logger.debug('now shown');
      logger.silly('still hidden');
      await closeLogger();

      expect(logged(sandbox)).toEqual(['now shown']);
    });

    test('names the log file', async () => {
      const { default: logger, configureLogger, setLogDirectory, closeLogger } = await loadLogger();
      setLogDirectory(sandbox);

      configureLogger({ level: 'warn', filename: 'other.log' });
      logger.error('to the other file');
      await closeLogger();

      expect(fs.readdirSync(sandbox)).toEqual(['other.log']);
    });
  });
});
