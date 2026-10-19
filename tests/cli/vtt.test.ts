import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import PDT from '../../src/constants.js';
import { Sandbox } from './pdt.js';

/**
 * `vtt start` as far as it gets without a Docker engine. Starting a real VTT is not tested here: no
 * test may reach the engine of the person running the tests.
 */
describe('vtt start', () => {
  let sandbox: Sandbox;

  beforeEach(() => {
    sandbox = new Sandbox();
  });

  afterEach(() => {
    sandbox.remove();
  });

  test('fails with the error code when no VTT is configured', async () => {
    const { code, stdout, stderr } = await sandbox.run(['vtt', 'start']);

    expect(code).toBe(PDT.EXITCODE.ERROR);
    expect(stdout).toBe('');
    expect(stderr).toContain('No VTT is configured');
  });

  test('fails with the error code, naming the configured VTTs, for a VTT that is not configured', async () => {
    sandbox.writeJson(path.join(sandbox.userConfigDir, 'config.json'), {
      VTT: {
        'my-module': {
          server: { type: 'foundry', hostname: 'localhost', version: '13' },
          host: { type: 'docker', socketPath: path.join(sandbox.root, 'no-docker.sock'), ports: [] },
        },
      },
    });

    const { code, stdout, stderr } = await sandbox.run(['vtt', 'start', 'nosuch']);

    expect(code).toBe(PDT.EXITCODE.ERROR);
    expect(stdout).toBe('');
    expect(stderr).toContain('nosuch');
    expect(stderr).toContain('my-module');
  });

  test('fails with the error code, starting nothing, when the Docker engine cannot be reached', async () => {
    const socketPath = path.join(sandbox.root, 'no-docker.sock');
    sandbox.writeJson(path.join(sandbox.userConfigDir, 'config.json'), {
      VTT: {
        'my-module': {
          server: { type: 'foundry', hostname: 'localhost', version: '13' },
          host: { type: 'docker', socketPath, ports: [] },
        },
      },
    });

    const { code, stdout, stderr } = await sandbox.run(['vtt', 'start']);

    expect(code).toBe(PDT.EXITCODE.ERROR);
    expect(stdout).toBe('');
    expect(stderr).toMatch(/Cannot reach the docker host for VTT my-module/);
  });
});
