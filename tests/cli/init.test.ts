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
    expect(config).toMatchObject({ VTT: { 'my-module': { server: { type: 'foundry', version: '14.368.0' } } } });
    expect(stdout).toContain('Configured VTT my-module');
    await expect(
      sandbox.run(['config', 'get', 'VTT.my-module.server.version'], { cwd: target }),
    ).resolves.toMatchObject({
      code: PDT.EXITCODE.OK,
      stdout: '14.368.0\n',
    });
  });

  test('warns, configuring no VTT, in a project without a module manifest', async () => {
    fs.writeFileSync(path.join(sandbox.work, 'package.json'), '{}');

    const { code, stderr } = await sandbox.run(['init']);

    expect(code).toBe(PDT.EXITCODE.OK);
    expect(stderr).toContain('module.json');
    expect(stderr).toContain('pdt config set VTT.<module-id>');
    expect(fs.existsSync(path.join(sandbox.work, PDT.PROJECT_RTD_DIR_NAME, 'config.json'))).toBe(false);
  });

  test('makes an existing project a pdt project without generating anything', async () => {
    fs.writeFileSync(path.join(sandbox.work, 'package.json'), '{}');

    const { code } = await sandbox.run(['init']);

    expect(code).toBe(PDT.EXITCODE.OK);
    expect(fs.readdirSync(sandbox.work).sort()).toEqual([PDT.PROJECT_RTD_DIR_NAME, 'package.json']);
  });

  test('leaves an existing pdt project as it is, with a warning', async () => {
    fs.writeFileSync(path.join(sandbox.work, 'package.json'), '{}');
    await sandbox.run(['init']);

    const { code, stderr } = await sandbox.run(['init']);

    expect(code).toBe(PDT.EXITCODE.OK);
    expect(stderr).toContain('already exists');
  });
});
