import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import PDT from '../../src/constants.js';
import { CLI, Sandbox } from './pdt.js';

describe('exit codes and output', () => {
  let sandbox: Sandbox;

  beforeEach(() => {
    sandbox = new Sandbox();
  });

  afterEach(() => {
    sandbox.remove();
  });

  test('--version prints the version on standard output and succeeds', async () => {
    const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { version: string };

    await expect(sandbox.run(['--version'])).resolves.toEqual({
      code: PDT.EXITCODE.OK,
      stdout: `${version}\n`,
      stderr: '',
    });
  });

  // Regression: a rebuild in watch mode left the entry point without its executable bit.
  test.skipIf(process.platform === 'win32')('runs as a program of its own, through its #! line', async () => {
    const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { version: string };

    await expect(promisify(execFile)(CLI, ['--version'])).resolves.toMatchObject({ stdout: `${version}\n` });
  });

  test('--help prints the usage on standard output and succeeds', async () => {
    const { code, stdout, stderr } = await sandbox.run(['--help']);

    expect(code).toBe(PDT.EXITCODE.OK);
    expect(stdout).toMatch(/^pdt <command>/);
    expect(stdout).toMatch(/^\s+pdt init\b/m);
    expect(stderr).toBe('');
  });

  // Regression: each of these exited with 0.
  test.each([
    ['no command', []],
    ['an unknown command', ['nosuchcmd']],
    ['an unknown option', ['info', '--bogus']],
    ['vtt without its command', ['vtt']],
    ['an unknown vtt command', ['vtt', 'explode']],
  ])('%s fails with the usage code, explaining on standard error', async (_case, args) => {
    const { code, stdout, stderr } = await sandbox.run(args);

    expect(code).toBe(PDT.EXITCODE.USAGE);
    expect(stdout).toBe('');
    expect(stderr).toMatch(/^pdt /);
  });

  test('a failing command fails with the error code, saying why on standard error', async () => {
    // Asked to generate a module with an invalid ID, in an empty directory.
    const { code, stderr } = await sandbox.run(['init', '--yes', '--module-id', 'Bad Id']);

    expect(code).toBe(PDT.EXITCODE.ERROR);
    expect(stderr).toContain('--module-id');
    expect(stderr).toContain('Bad Id');
  });

  test('an invalid configuration fails with its own code before running anything', async () => {
    sandbox.writeJson(`${sandbox.userConfigDir}/config.json`, { Logging: { level: 'chatty' } });

    const { code, stdout, stderr } = await sandbox.run(['--version']);

    expect(code).toBe(PDT.EXITCODE.INVALID_CONFIG);
    expect(stdout).toBe('');
    expect(stderr).toContain('Logging.level');
  });

  test('does not crash however it ends', async () => {
    const runs = await Promise.all(
      [[], ['--help'], ['init', '--yes', '--module-id', 'Bad Id']].map(args => sandbox.run(args)),
    );

    for (const { stderr } of runs) {
      expect(stderr).not.toMatch(/^\s+at /m);
    }
  });
});
