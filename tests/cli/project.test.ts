import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import PDT from '../../src/constants.js';
import { Sandbox } from './pdt.js';

/** Everything the generator asks, so that nothing is left to a prompt. */
const NEW_MODULE = ['--yes', '--description', 'A test module', '--github-owner', 'example', '--author-name', 'Tester'];
const OFFLINE = ['--no-install', '--no-git-init'];

describe('moving and pruning projects', () => {
  let sandbox: Sandbox;
  let project: string;
  const runState = () => JSON.parse(fs.readFileSync(path.join(sandbox.userDataDir, 'run.state.json'), 'utf8'));

  beforeEach(async () => {
    sandbox = new Sandbox();
    project = path.join(sandbox.work, 'my-module');
    await sandbox.run(['init', project, ...NEW_MODULE, ...OFFLINE]);
  });

  afterEach(() => {
    sandbox.remove();
  });

  test('prune forgets a project that has been deleted, and keeps one that is there', async () => {
    const other = path.join(sandbox.work, 'other-module');
    await sandbox.run(['init', other, ...NEW_MODULE, ...OFFLINE]);
    fs.rmSync(other, { recursive: true });

    const { code, stdout } = await sandbox.run(['prune']);

    expect(code).toBe(PDT.EXITCODE.OK);
    expect(stdout).toContain('Removed project other-module');
    expect(runState()).toEqual({ PROJECTS: { 'my-module': { root: project } } });
  });

  test('move without a destination registers a project moved by hand where it is now', async () => {
    const moved = path.join(sandbox.work, 'elsewhere');
    fs.renameSync(project, moved);

    const { code } = await sandbox.run(['move'], { cwd: moved });

    expect(code).toBe(PDT.EXITCODE.OK);
    expect(runState()).toEqual({ PROJECTS: { 'my-module': { root: moved } } });
  });

  test('move with a destination moves the project, says where to go, and registers it there', async () => {
    const { code, stdout } = await sandbox.run(['move', '../../moved'], { cwd: path.join(project, 'src') });

    const moved = path.join(sandbox.work, 'moved');
    expect(code).toBe(PDT.EXITCODE.OK);
    expect(fs.existsSync(project)).toBe(false);
    expect(fs.existsSync(path.join(moved, PDT.PROJECT_RTD_DIR_NAME, 'config.json'))).toBe(true);
    expect(stdout).toContain(`cd ${path.join(moved, 'src')}`);
    expect(runState()).toEqual({ PROJECTS: { 'my-module': { root: moved } } });
    // The project works from its new place.
    await expect(sandbox.run(['config', 'get', 'id'], { cwd: moved })).resolves.toMatchObject({
      code: PDT.EXITCODE.OK,
      stdout: 'my-module\n',
    });
  });

  test('move fails with the usage code for a destination that exists, moving nothing', async () => {
    const { code, stderr } = await sandbox.run(['move', sandbox.work], { cwd: project });

    expect(code).toBe(PDT.EXITCODE.USAGE);
    expect(stderr).toContain('already exists');
    expect(fs.existsSync(path.join(project, PDT.PROJECT_RTD_DIR_NAME))).toBe(true);
  });

  test('move fails with the error code outside a project', async () => {
    const { code, stderr } = await sandbox.run(['move']);

    expect(code).toBe(PDT.EXITCODE.ERROR);
    expect(stderr).toContain('Not a PDT project');
  });

  describe('--project', () => {
    test('runs a command in the project given by its id, from outside it', async () => {
      const { code, stdout } = await sandbox.run(['config', 'get', 'id', '--project', 'my-module'], {
        cwd: sandbox.home,
      });

      expect(code).toBe(PDT.EXITCODE.OK);
      expect(stdout).toBe('my-module\n');
    });

    test('runs a command in the project given by its path, relative to the current directory', async () => {
      const { code, stdout } = await sandbox.run(['--project', 'my-module', 'config', 'set', 'Logging.level', 'info']);

      expect(code).toBe(PDT.EXITCODE.OK);
      expect(stdout).toContain(path.join(project, PDT.PROJECT_RTD_DIR_NAME, 'config.json'));
    });

    test('takes over from the project pdt is run in', async () => {
      const other = path.join(sandbox.work, 'other-module');
      await sandbox.run(['init', other, ...NEW_MODULE, ...OFFLINE]);

      const { stdout } = await sandbox.run(['config', 'get', 'id', '--project', 'my-module'], { cwd: other });

      expect(stdout).toBe('my-module\n');
    });

    test('fails with the usage code, running nothing, for a directory that is not a project', async () => {
      const { code, stdout, stderr } = await sandbox.run(['config', 'get', 'id', '--project', sandbox.home]);

      expect(code).toBe(PDT.EXITCODE.USAGE);
      expect(stdout).toBe('');
      expect(stderr).toContain('no .pdt directory');
    });

    test('fails with the usage code, running nothing, when --project is given more than once', async () => {
      const { code, stdout, stderr } = await sandbox.run(['config', 'get', 'id', '--project', 'a', '--project', 'b']);

      expect(code).toBe(PDT.EXITCODE.USAGE);
      expect(stdout).toBe('');
      expect(stderr).toContain('2 times');
    });

    test('fails with the usage code for a path that does not exist', async () => {
      const { code, stderr } = await sandbox.run(['info', '--project', 'nosuch']);

      expect(code).toBe(PDT.EXITCODE.USAGE);
      expect(stderr).toContain('does not exist');
    });
  });
});
