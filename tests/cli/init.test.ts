import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import PDT from '../../src/constants.js';
import { Sandbox } from './pdt.js';

/** Everything the generator asks, so that nothing is left to a prompt. */
const NEW_MODULE = ['--yes', '--description', 'A test module', '--github-owner', 'example', '--author-name', 'Tester'];
const OFFLINE = ['--no-install', '--no-git-init'];

describe('init', () => {
  let sandbox: Sandbox;

  beforeEach(() => {
    sandbox = new Sandbox();
  });

  afterEach(() => {
    sandbox.remove();
  });

  test('creates a module in an empty directory and makes it a project', async () => {
    const target = path.join(sandbox.work, 'my-module');

    const { code } = await sandbox.run(['init', target, ...NEW_MODULE, ...OFFLINE]);

    expect(code).toBe(PDT.EXITCODE.OK);
    expect(fs.existsSync(path.join(target, 'package.json'))).toBe(true);
    expect(fs.statSync(path.join(target, PDT.PROJECT_RTD_DIR_NAME)).isDirectory()).toBe(true);
    // The directory name is offered as the module ID.
    expect(JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'))).toMatchObject({
      name: expect.stringContaining('my-module'),
    });
  });

  test("configures the new module's VTT, running the Foundry VTT version it was created for", async () => {
    const target = path.join(sandbox.work, 'my-module');

    const { stdout } = await sandbox.run(['init', target, ...NEW_MODULE, '--foundry-version', '14.368.0', ...OFFLINE]);

    const config = JSON.parse(fs.readFileSync(path.join(target, PDT.PROJECT_RTD_DIR_NAME, 'config.json'), 'utf8'));
    expect(config).toMatchObject({
      id: 'my-module',
      VTT: { 'my-module': { server: { type: 'foundry', version: '14.368.0' } } },
    });
    expect(stdout).toContain('Configured VTT my-module');
    await expect(
      sandbox.run(['config', 'get', 'VTT.my-module.server.version'], { cwd: target }),
    ).resolves.toMatchObject({
      code: PDT.EXITCODE.OK,
      stdout: '14.368.0\n',
    });
  });

  test("registers the new project in the user's run state", async () => {
    const target = path.join(sandbox.work, 'my-module');

    const { stdout } = await sandbox.run(['init', target, ...NEW_MODULE, ...OFFLINE]);

    const runState = path.join(sandbox.userDataDir, 'run.state.json');
    expect(JSON.parse(fs.readFileSync(runState, 'utf8'))).toEqual({ PROJECTS: { 'my-module': { root: target } } });
    expect(stdout).toContain(`Registered project my-module in ${runState}`);
  });

  test('fails with the error code, without making a project, for an id another project is registered as', async () => {
    const first = path.join(sandbox.work, 'first', 'my-module');
    const second = path.join(sandbox.work, 'second', 'my-module');
    await sandbox.run(['init', first, ...NEW_MODULE, ...OFFLINE]);

    const { code, stderr } = await sandbox.run(['init', second, ...NEW_MODULE, ...OFFLINE]);

    expect(code).toBe(PDT.EXITCODE.ERROR);
    expect(stderr).toContain(`already registered as my-module`);
    expect(stderr).toContain(first);
    expect(fs.existsSync(path.join(second, 'module.json'))).toBe(true);
    expect(fs.existsSync(path.join(second, PDT.PROJECT_RTD_DIR_NAME))).toBe(false);
  });

  test('warns, configuring nothing, in a project without a module manifest', async () => {
    fs.writeFileSync(path.join(sandbox.work, 'package.json'), '{}');

    const { code, stderr } = await sandbox.run(['init']);

    expect(code).toBe(PDT.EXITCODE.OK);
    expect(stderr).toContain('module.json');
    expect(stderr).toContain('pdt force-reset');
    expect(fs.existsSync(path.join(sandbox.work, PDT.PROJECT_RTD_DIR_NAME, 'config.json'))).toBe(false);
  });

  test('makes an existing project a pdt project without generating anything', async () => {
    fs.writeFileSync(path.join(sandbox.work, 'package.json'), '{}');

    const { code } = await sandbox.run(['init']);

    expect(code).toBe(PDT.EXITCODE.OK);
    expect(fs.readdirSync(sandbox.work).sort()).toEqual([PDT.PROJECT_RTD_DIR_NAME, 'package.json']);
  });

  test('fails with the error code in an existing pdt project, pointing to force-reset', async () => {
    const target = path.join(sandbox.work, 'my-module');
    await sandbox.run(['init', target, ...NEW_MODULE, ...OFFLINE]);
    const configFile = path.join(target, PDT.PROJECT_RTD_DIR_NAME, 'config.json');
    const config = fs.readFileSync(configFile, 'utf8');

    const { code, stderr } = await sandbox.run(['init'], { cwd: target });

    expect(code).toBe(PDT.EXITCODE.ERROR);
    expect(stderr).toContain('pdt force-reset');
    expect(fs.readFileSync(configFile, 'utf8')).toBe(config);
  });
});

describe('force-reset', () => {
  let sandbox: Sandbox;

  beforeEach(() => {
    sandbox = new Sandbox();
  });

  afterEach(() => {
    sandbox.remove();
  });

  test('sets the project up again from its module, under its current id', async () => {
    const target = path.join(sandbox.work, 'my-module');
    await sandbox.run(['init', target, ...NEW_MODULE, '--foundry-version', '14.368.0', ...OFFLINE]);
    const manifest = path.join(target, 'module.json');
    fs.writeFileSync(manifest, JSON.stringify({ ...JSON.parse(fs.readFileSync(manifest, 'utf8')), id: 'renamed' }));

    const { code } = await sandbox.run(['force-reset'], { cwd: target });

    expect(code).toBe(PDT.EXITCODE.OK);
    const config = JSON.parse(fs.readFileSync(path.join(target, PDT.PROJECT_RTD_DIR_NAME, 'config.json'), 'utf8'));
    expect(config).toMatchObject({ id: 'renamed', VTT: { renamed: { server: { version: '14.368.0' } } } });
    expect(Object.keys(config.VTT)).toEqual(['renamed']);
    const runState = JSON.parse(fs.readFileSync(path.join(sandbox.userDataDir, 'run.state.json'), 'utf8'));
    expect(runState).toEqual({ PROJECTS: { renamed: { root: target } } });
  });

  test('fails with the error code outside a project', async () => {
    const { code, stderr } = await sandbox.run(['force-reset']);

    expect(code).toBe(PDT.EXITCODE.ERROR);
    expect(stderr).toContain('Not a PDT project');
  });

  test('fails with the usage code when given an argument', async () => {
    const { code } = await sandbox.run(['force-reset', 'somewhere']);

    expect(code).toBe(PDT.EXITCODE.USAGE);
  });
});
