import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import PDT from '../../src/constants.js';
import { Sandbox } from './pdt.js';

describe('logging', () => {
  let sandbox: Sandbox;

  beforeEach(() => {
    sandbox = new Sandbox();
  });

  afterEach(() => {
    sandbox.remove();
  });

  const debug = { env: { PDT_LOG_LEVEL: 'debug' } };

  test('logs to the user data directory outside a project', async () => {
    await sandbox.run(['vtt', 'start'], debug);

    expect(sandbox.logged(path.join(sandbox.userDataDir, 'pdt.log'))).not.toEqual([]);
  });

  test("logs to the project's .pdt directory anywhere inside a project", async () => {
    const project = path.join(sandbox.work, 'module');
    const deep = path.join(project, 'src', 'deep');
    fs.mkdirSync(deep, { recursive: true });
    fs.mkdirSync(path.join(project, PDT.PROJECT_RTD_DIR_NAME));

    await sandbox.run(['vtt', 'start'], { ...debug, cwd: deep });

    expect(sandbox.logged(path.join(project, PDT.PROJECT_RTD_DIR_NAME, 'pdt.log'))).not.toEqual([]);
    expect(fs.existsSync(sandbox.userDataDir)).toBe(false);
  });

  test('leaves no log file when nothing is logged', async () => {
    await sandbox.run(['--version']);

    expect(fs.existsSync(sandbox.userDataDir)).toBe(false);
  });

  test('writes log messages to standard error, keeping standard output for results', async () => {
    const { stdout, stderr } = await sandbox.run(['vtt', 'start'], debug);

    expect(stdout).toBe('');
    expect(stderr).toContain('Running parsed command');
  });

  // Regression: a log file that could not be written crashed pdt with an unhandled 'error' event.
  describe('when the log file cannot be written', () => {
    beforeEach(() => {
      // A file where the log directory should be.
      fs.mkdirSync(path.dirname(sandbox.userDataDir), { recursive: true });
      fs.writeFileSync(sandbox.userDataDir, 'not a directory');
    });

    test('still runs the command, with its own exit code', async () => {
      const { code } = await sandbox.run(['vtt', 'start'], debug);

      expect(code).toBe(PDT.EXITCODE.OK);
    });

    test('says so once on standard error, without a crash', async () => {
      const { stderr } = await sandbox.run(['vtt', 'start'], debug);

      expect(stderr.match(new RegExp(path.join(sandbox.userDataDir, 'pdt.log'), 'g'))).toHaveLength(1);
      expect(stderr).not.toMatch(/^\s+at /m);
    });
  });
});
