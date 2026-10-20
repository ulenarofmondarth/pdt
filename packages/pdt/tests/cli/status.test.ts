import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import PDT from '../../src/constants.js';
import { Sandbox } from './pdt.js';

/** Everything the generator asks, so that nothing is left to a prompt. */
const NEW_MODULE = ['--yes', '--description', 'A test module', '--github-owner', 'example', '--author-name', 'Tester'];
const OFFLINE = ['--no-install', '--no-git-init'];

/**
 * `status` as far as it goes without a Docker engine: a VTT pdt has no record of starting is
 * stopped, without asking its host.
 */
describe('status', () => {
  let sandbox: Sandbox;

  beforeEach(() => {
    sandbox = new Sandbox();
  });

  afterEach(() => {
    sandbox.remove();
  });

  test('says when no project is registered', async () => {
    const { code, stdout } = await sandbox.run(['status']);

    expect(code).toBe(PDT.EXITCODE.OK);
    expect(stdout).toMatch(/^No projects are registered in /);
  });

  describe('with projects', () => {
    let first: string;
    let second: string;

    beforeEach(async () => {
      first = path.join(sandbox.work, 'first-module');
      second = path.join(sandbox.work, 'second-module');
      await sandbox.run(['init', first, ...NEW_MODULE, '--module-id', 'first-module', ...OFFLINE]);
      await sandbox.run(['init', second, ...NEW_MODULE, '--module-id', 'second-module', ...OFFLINE]);
    });

    test("in a project, lists that project's VTTs", async () => {
      const { code, stdout } = await sandbox.run(['status'], { cwd: first });

      expect(code).toBe(PDT.EXITCODE.OK);
      expect(stdout).toBe(`Project first-module (${first})\n  first-module: stopped\n`);
    });

    test('outside a project, lists every registered project, saying which have gone', async () => {
      fs.rmSync(second, { recursive: true, force: true });

      const { code, stdout } = await sandbox.run(['status']);

      expect(code).toBe(PDT.EXITCODE.OK);
      expect(stdout).toBe(
        `Project first-module (${first})\n  first-module: stopped\n` +
          `Project second-module (${second}): gone. Run pdt prune to forget it.\n`,
      );
    });

    test('with --project, lists only that project', async () => {
      const { stdout } = await sandbox.run(['status', '--project', 'second-module']);

      expect(stdout).toBe(`Project second-module (${second})\n  second-module: stopped\n`);
    });
  });
});
