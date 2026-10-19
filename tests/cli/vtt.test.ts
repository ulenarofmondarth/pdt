import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import PDT from '../../src/constants.js';
import { Sandbox } from './pdt.js';

/**
 * `vtt start`, `stop` and `restart` as far as they get without a Docker engine. Starting a real VTT
 * is not tested here: no test may reach the engine of the person running the tests.
 */
describe('vtt', () => {
  let sandbox: Sandbox;
  let projectConfig: string;
  let runState: string;

  beforeEach(() => {
    sandbox = new Sandbox();
    projectConfig = path.join(sandbox.work, '.pdt', 'config.json');
    runState = path.join(sandbox.work, '.pdt', 'run.state.json');
    fs.mkdirSync(path.dirname(projectConfig));
  });

  afterEach(() => {
    sandbox.remove();
  });

  /** Configure the project's VTT, on a Docker engine that is not there. */
  function configureVtt() {
    sandbox.writeJson(projectConfig, {
      id: 'my-module',
      VTT: {
        'my-module': {
          server: { type: 'foundry', hostname: 'localhost', version: '13' },
          host: { type: 'docker', socketPath: path.join(sandbox.root, 'no-docker.sock') },
        },
      },
    });
  }

  test.each(['start', 'stop', 'restart'])('%s fails with the error code outside a project', async command => {
    fs.rmSync(path.dirname(projectConfig), { recursive: true });

    const { code, stdout, stderr } = await sandbox.run(['vtt', command]);

    expect(code).toBe(PDT.EXITCODE.ERROR);
    expect(stdout).toBe('');
    expect(stderr).toContain('Not a PDT project');
  });

  test('start fails with the error code when no VTT is configured', async () => {
    const { code, stdout, stderr } = await sandbox.run(['vtt', 'start']);

    expect(code).toBe(PDT.EXITCODE.ERROR);
    expect(stdout).toBe('');
    expect(stderr).toContain('No VTT is configured');
  });

  test('start fails with the error code, naming the configured VTTs, for a VTT that is not configured', async () => {
    configureVtt();

    const { code, stdout, stderr } = await sandbox.run(['vtt', 'start', 'nosuch']);

    expect(code).toBe(PDT.EXITCODE.ERROR);
    expect(stdout).toBe('');
    expect(stderr).toContain('nosuch');
    expect(stderr).toContain('my-module');
  });

  test.each(['start', 'restart'])(
    '%s fails with the error code, starting nothing, when the Docker engine cannot be reached',
    async command => {
      configureVtt();

      const { code, stdout, stderr } = await sandbox.run(['vtt', command]);

      expect(code).toBe(PDT.EXITCODE.ERROR);
      expect(stdout).toBe('');
      expect(stderr).toMatch(/Cannot reach the docker host for VTT my-module/);
      expect(fs.existsSync(runState)).toBe(false);
    },
  );

  test('stop says a VTT pdt did not start is not running, without needing the Docker engine', async () => {
    configureVtt();

    const { code, stdout } = await sandbox.run(['vtt', 'stop']);

    expect(code).toBe(PDT.EXITCODE.OK);
    expect(stdout).toContain('VTT my-module is not running');
  });

  test('stop fails with the error code, keeping the record, when the Docker engine cannot be reached', async () => {
    configureVtt();
    const running = {
      VTT: {
        'my-module': { id: 'abc', name: 'pdt-my-module', port: 30000, url: 'http://localhost:30000', started: 'x' },
      },
    };
    sandbox.writeJson(runState, running);

    const { code, stderr } = await sandbox.run(['vtt', 'stop']);

    expect(code).toBe(PDT.EXITCODE.ERROR);
    expect(stderr).toMatch(/Cannot reach the docker host/);
    expect(JSON.parse(fs.readFileSync(runState, 'utf8'))).toEqual(running);
  });

  test.each(['start', 'stop', 'restart'])('%s takes at most one VTT', async command => {
    configureVtt();

    const { code, stderr } = await sandbox.run(['vtt', command, 'my-module', 'extra']);

    expect(code).toBe(PDT.EXITCODE.USAGE);
    expect(stderr).toContain('extra');
  });
});
