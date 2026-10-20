import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import PDT from '../../src/constants.js';
import { Sandbox } from './pdt.js';

/**
 * The configuration is observed through the log: every run logs what it parsed at debug level, so
 * that line is in the log file exactly when the configured level is debug. `info` is run because it
 * reaches nothing outside pdt.
 */
const DEBUG_LINE = /^Parser callback/;

describe('configuration', () => {
  let sandbox: Sandbox;
  let project: string;
  let projectLog: string;
  let userLog: string;

  beforeEach(() => {
    sandbox = new Sandbox();
    project = path.join(sandbox.work, 'module');
    fs.mkdirSync(path.join(project, PDT.PROJECT_RTD_DIR_NAME), { recursive: true });
    projectLog = path.join(project, PDT.PROJECT_RTD_DIR_NAME, 'pdt.log');
    userLog = path.join(sandbox.userDataDir, 'pdt.log');
  });

  afterEach(() => {
    sandbox.remove();
  });

  function userConfig(content: unknown, dir = sandbox.userConfigDir) {
    sandbox.writeJson(path.join(dir, 'config.json'), content);
  }

  function projectConfig(content: unknown) {
    sandbox.writeJson(path.join(project, PDT.PROJECT_RTD_DIR_NAME, 'config.json'), content);
  }

  test('logs at the default level without any configuration', async () => {
    await sandbox.run(['status']);

    expect(sandbox.logged(userLog)).not.toContainEqual(expect.stringMatching(DEBUG_LINE));
  });

  // Regression: the user's configuration file was never applied.
  test("applies the user's configuration file", async () => {
    userConfig({ Logging: { level: 'debug' } });

    await sandbox.run(['status']);

    expect(sandbox.logged(userLog)).toContainEqual(expect.stringMatching(DEBUG_LINE));
  });

  test('finds the user configuration through XDG_CONFIG_HOME', async () => {
    const xdg = path.join(sandbox.root, 'xdg');
    userConfig({ Logging: { level: 'debug' } }, path.join(xdg, 'pdt'));

    await sandbox.run(['status'], { env: { XDG_CONFIG_HOME: xdg } });

    expect(sandbox.logged(userLog)).toContainEqual(expect.stringMatching(DEBUG_LINE));
  });

  test("lets the project's configuration override the user's", async () => {
    userConfig({ Logging: { level: 'debug' } });
    projectConfig({ Logging: { level: 'error' } });

    await sandbox.run(['status'], { cwd: project });

    expect(sandbox.logged(projectLog)).toEqual([]);
  });

  test('lets PDT_LOG_LEVEL override every file', async () => {
    projectConfig({ Logging: { level: 'error' } });

    await sandbox.run(['status'], { cwd: project, env: { PDT_LOG_LEVEL: 'debug' } });

    expect(sandbox.logged(projectLog)).toContainEqual(expect.stringMatching(DEBUG_LINE));
  });

  test('names the log file as configured', async () => {
    userConfig({ Logging: { level: 'debug', filename: 'mine.log' } });

    await sandbox.run(['status']);

    expect(fs.readdirSync(sandbox.userDataDir)).toEqual(['mine.log']);
  });

  test('ignores the NODE_ENV the user happens to have', async () => {
    const { code } = await sandbox.run(['--version'], { env: { NODE_ENV: 'test' } });

    expect(code).toBe(PDT.EXITCODE.OK);
  });
});
