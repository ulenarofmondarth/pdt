import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import PDT from '../../src/constants.js';
import { Sandbox } from './pdt.js';

describe('config', () => {
  let sandbox: Sandbox;
  let userFile: string;

  beforeEach(() => {
    sandbox = new Sandbox();
    userFile = path.join(sandbox.userConfigDir, 'config.json');
  });

  afterEach(() => {
    sandbox.remove();
  });

  describe('get', () => {
    test('writes a value alone, for use in scripts', async () => {
      await expect(sandbox.run(['config', 'get', 'Logging.level'])).resolves.toEqual({
        code: PDT.EXITCODE.OK,
        stdout: 'warn\n',
        stderr: '',
      });
    });

    test.each([
      ['default', {}, []],
      ['user', {}, []],
      ['environment', { PDT_LOG_LEVEL: 'info' }, []],
      ['cli', { PDT_LOG_LEVEL: 'info' }, ['--config', 'Logging.level=debug']],
    ])('shows a value from the %s source', async (source, env, extra) => {
      if (source !== 'default') sandbox.writeJson(userFile, { Logging: { level: 'error' } });

      const { stdout } = await sandbox.run(['config', 'get', 'Logging.level', '--show-source', ...extra], { env });

      expect(stdout).toMatch(new RegExp(` \\[${source}\\]\\n$`));
    });

    test('lists every value in YAML', async () => {
      const { code, stdout } = await sandbox.run(['config', 'get', '--list-all', '--format', 'yml']);

      expect(code).toBe(PDT.EXITCODE.OK);
      expect(YAML.parse(stdout)).toMatchObject({ Logging: { level: 'warn' }, VTT: {} });
    });

    test('fails with the error code, writing nothing to standard output, for a key that is not a setting', async () => {
      const { code, stdout, stderr } = await sandbox.run(['config', 'get', 'Logging.colour']);

      expect(code).toBe(PDT.EXITCODE.ERROR);
      expect(stdout).toBe('');
      expect(stderr).toContain('Logging.colour');
    });

    test('fails with the usage code without a key or --list-all', async () => {
      const { code, stdout, stderr } = await sandbox.run(['config', 'get']);

      expect(code).toBe(PDT.EXITCODE.USAGE);
      expect(stdout).toBe('');
      expect(stderr).toContain('--list-all');
    });
  });

  describe('set', () => {
    test('writes the user file outside a project, and the value then applies', async () => {
      const set = await sandbox.run(['config', 'set', 'Logging.level', 'debug']);

      expect(set.code).toBe(PDT.EXITCODE.OK);
      expect(set.stdout).toContain(userFile);
      expect(JSON.parse(fs.readFileSync(userFile, 'utf8'))).toEqual({ Logging: { level: 'debug' } });
      await expect(sandbox.run(['config', 'get', 'Logging.level', '--show-source'])).resolves.toMatchObject({
        stdout: 'debug [user]\n',
      });
    });

    test("writes the project's file inside a project", async () => {
      const project = path.join(sandbox.work, 'module');
      fs.mkdirSync(path.join(project, PDT.PROJECT_RTD_DIR_NAME), { recursive: true });

      await sandbox.run(['config', 'set', 'Logging.level', 'error'], { cwd: project });

      expect(JSON.parse(fs.readFileSync(path.join(project, PDT.PROJECT_RTD_DIR_NAME, 'config.json'), 'utf8'))).toEqual({
        Logging: { level: 'error' },
      });
      expect(fs.existsSync(userFile)).toBe(false);
    });

    test('fails with the error code, writing nothing, when the value is invalid', async () => {
      const { code, stderr } = await sandbox.run(['config', 'set', 'Logging.level', 'chatty']);

      expect(code).toBe(PDT.EXITCODE.ERROR);
      expect(stderr).toContain('Logging.level');
      expect(fs.existsSync(userFile)).toBe(false);
    });
  });

  describe('clear', () => {
    let project: string;
    let projectFile: string;

    beforeEach(() => {
      project = path.join(sandbox.work, 'module');
      projectFile = path.join(project, PDT.PROJECT_RTD_DIR_NAME, 'config.json');
      fs.mkdirSync(path.dirname(projectFile), { recursive: true });
      sandbox.writeJson(userFile, { Logging: { level: 'debug', filename: 'mine.log' } });
    });

    const read = (file: string): unknown => JSON.parse(fs.readFileSync(file, 'utf8'));

    test("removes a setting from the project's file", async () => {
      sandbox.writeJson(projectFile, { Logging: { level: 'error' } });

      const { code, stdout } = await sandbox.run(['config', 'clear', 'Logging.level'], { cwd: project });

      expect(code).toBe(PDT.EXITCODE.OK);
      expect(stdout).toContain(projectFile);
      expect(read(projectFile)).toEqual({});
      expect(read(userFile)).toEqual({ Logging: { level: 'debug', filename: 'mine.log' } });
    });

    test('warns, changing nothing, when only the user file sets it', async () => {
      const { code, stdout, stderr } = await sandbox.run(['config', 'clear', 'Logging.level'], { cwd: project });

      expect(code).toBe(PDT.EXITCODE.OK);
      expect(stdout).toBe('');
      expect(stderr).toContain('--all');
      expect(read(userFile)).toEqual({ Logging: { level: 'debug', filename: 'mine.log' } });
    });

    test('removes a setting from the user file with --user', async () => {
      await sandbox.run(['config', 'clear', 'Logging.level', '--user'], { cwd: project });

      expect(read(userFile)).toEqual({ Logging: { filename: 'mine.log' } });
    });

    test('removes a setting from every file that sets it with --all', async () => {
      sandbox.writeJson(projectFile, { Logging: { level: 'error' } });

      await sandbox.run(['config', 'clear', 'Logging.level', '--all'], { cwd: project });

      expect(read(projectFile)).toEqual({});
      expect(read(userFile)).toEqual({ Logging: { filename: 'mine.log' } });
    });

    test('fails with the error code outside a project without --user', async () => {
      const { code, stderr } = await sandbox.run(['config', 'clear', 'Logging.level']);

      expect(code).toBe(PDT.EXITCODE.ERROR);
      expect(stderr).toContain('--user');
      expect(read(userFile)).toEqual({ Logging: { level: 'debug', filename: 'mine.log' } });
    });

    test('fails with the error code for a key that is not a setting', async () => {
      const { code, stderr } = await sandbox.run(['config', 'clear', 'Logging.colour', '--user']);

      expect(code).toBe(PDT.EXITCODE.ERROR);
      expect(stderr).toContain('Logging.colour');
    });
  });

  test('fails with the invalid configuration code for a --config that is not <key>=<value>', async () => {
    const { code, stderr } = await sandbox.run(['status', '--config', 'Logging.level']);

    expect(code).toBe(PDT.EXITCODE.INVALID_CONFIG);
    expect(stderr).toContain('--config');
  });
});
