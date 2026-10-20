import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import PDT from '../../src/constants.js';
import { Sandbox } from './pdt.js';

describe('secrets', () => {
  let sandbox: Sandbox;
  let configFile: string;
  let secretsFile: string;

  beforeEach(() => {
    sandbox = new Sandbox();
    configFile = path.join(sandbox.userConfigDir, 'config.json');
    secretsFile = path.join(sandbox.userConfigDir, 'secrets.conf');
  });

  afterEach(() => {
    sandbox.remove();
  });

  test('are set in secrets.conf, readable only by the user, and shown masked unless asked for', async () => {
    const set = await sandbox.run(['config', 'set', 'FOUNDRY.password', 'hunter2']);

    expect(set.code).toBe(PDT.EXITCODE.OK);
    expect(set.stdout).toContain(secretsFile);
    expect(JSON.parse(fs.readFileSync(secretsFile, 'utf8'))).toEqual({ FOUNDRY: { password: 'hunter2' } });
    expect(fs.statSync(secretsFile).mode & 0o777).toBe(0o600);
    expect(fs.existsSync(configFile)).toBe(false);

    await expect(sandbox.run(['config', 'get', 'FOUNDRY'])).resolves.toMatchObject({
      stdout: 'FOUNDRY.password "*****"\n',
    });
    await expect(sandbox.run(['config', 'get', '--print-secrets', 'FOUNDRY'])).resolves.toMatchObject({
      stdout: 'FOUNDRY.password "hunter2"\n',
    });
    await expect(sandbox.run(['config', 'get', 'FOUNDRY.password', '--show-source'])).resolves.toMatchObject({
      stdout: '***** [user-secrets]\n',
    });
  });

  test('are not written to the debug log', async () => {
    const debug = { env: { PDT_LOG_LEVEL: 'debug' } };

    await sandbox.run(['config', 'set', 'FOUNDRY.license_key', 'ABCD-1234'], debug);
    await sandbox.run(['config', 'get', 'Logging.level', '--config', 'FOUNDRY.password=hunter2'], debug);

    const log = fs.readFileSync(path.join(sandbox.userDataDir, 'pdt.log'), 'utf8');
    expect(log).toContain('FOUNDRY.license_key');
    expect(log).not.toContain('ABCD-1234');
    expect(log).not.toContain('hunter2');
  });

  test('in a config.json make the configuration invalid, running nothing', async () => {
    sandbox.writeJson(configFile, { FOUNDRY: { password: 'hunter2' } });

    const { code, stdout, stderr } = await sandbox.run(['config', 'get', 'Logging.level']);

    expect(code).toBe(PDT.EXITCODE.INVALID_CONFIG);
    expect(stdout).toBe('');
    expect(stderr).toContain('FOUNDRY.password');
    expect(stderr).toContain(secretsFile);
    expect(stderr).not.toContain('hunter2');
  });
});
