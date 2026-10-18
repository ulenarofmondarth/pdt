import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { ConfigError, configFiles, loadConfig } from '@util/load-config.js';
import defaults from '@/pdt-internal-config/default.json' with { type: 'json' };
import { m } from '@i18n/messages.js';

describe('loadConfig', () => {
  let sandbox: string;
  let userFile: string;
  let projectFile: string;

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-config-'));
    userFile = path.join(sandbox, 'user', 'config.json');
    projectFile = path.join(sandbox, 'project', 'config.json');
  });

  afterEach(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  function write(file: string, content: unknown) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  }

  test('is the shipped defaults when there are no files and no variables', () => {
    expect(loadConfig({ files: [userFile, projectFile], env: {} })).toEqual(defaults);
  });

  // Regression: the user's configuration was read before the defaults, so the defaults always won.
  test('lets a file override the defaults', () => {
    write(userFile, { Logging: { level: 'debug' } });

    const config = loadConfig({ files: [userFile], env: {} });

    expect(config.Logging.level).toBe('debug');
  });

  test('lets a later file override an earlier one', () => {
    write(userFile, { Logging: { level: 'debug', filename: 'user.log' } });
    write(projectFile, { Logging: { level: 'error' } });

    const config = loadConfig({ files: [userFile, projectFile], env: {} });

    expect(config.Logging).toEqual({ level: 'error', filename: 'user.log' });
  });

  test('lets PDT_LOG_LEVEL override every file', () => {
    write(projectFile, { Logging: { level: 'error' } });

    const config = loadConfig({ files: [projectFile], env: { PDT_LOG_LEVEL: 'info' } });

    expect(config.Logging.level).toBe('info');
  });

  test('ignores an empty PDT_LOG_LEVEL', () => {
    expect(loadConfig({ files: [], env: { PDT_LOG_LEVEL: '' } }).Logging.level).toBe(defaults.Logging.level);
  });

  test('merges nested settings, keeping those a file does not mention', () => {
    write(userFile, { VTT: { prj: { server: { version: '13' } } } });

    const config = loadConfig({ files: [userFile], env: {} });

    expect(config.VTT['prj']?.server).toEqual({ ...defaults.VTT.prj.server, version: '13' });
    expect(config.VTT['prj']?.host).toEqual(defaults.VTT.prj.host);
  });

  test('replaces lists rather than merging them', () => {
    write(userFile, { DOCS: { host: { ports: [{ internal: 9000, external: 9000 }] } } });

    const config = loadConfig({ files: [userFile], env: {} });

    expect(config.DOCS.host.ports).toEqual([{ internal: 9000, external: 9000 }]);
  });

  test('adds servers a file defines', () => {
    const staging = { ...defaults.VTT.prj, server: { ...defaults.VTT.prj.server, version: '14' } };
    write(userFile, { VTT: { staging } });

    const config = loadConfig({ files: [userFile], env: {} });

    expect(Object.keys(config.VTT).sort()).toEqual(['prj', 'staging']);
  });

  test('cannot change the prototype of the configuration', () => {
    write(userFile, '{"__proto__": {"polluted": true}, "Logging": {"level": "info"}}');

    const config = loadConfig({ files: [userFile], env: {} });

    expect(Object.getPrototypeOf(config)).toBe(Object.prototype);
    expect(config).not.toHaveProperty('polluted');
  });

  test('fails with each problem and where it is when the result is invalid', () => {
    write(userFile, { Logging: { level: 'chatty', filename: 42 } });

    const error = captureError(() => loadConfig({ files: [userFile], env: {} }));

    expect(error).toBeInstanceOf(ConfigError);
    expect(error.message).toBe(m['error.config.invalid']());
    expect(error.problems).toHaveLength(2);
    expect(error.problems.join('\n')).toMatch(/^Logging\.level /m);
    expect(error.problems.join('\n')).toMatch(/^Logging\.filename /m);
  });

  test('fails naming a file that is not JSON', () => {
    write(userFile, '{ not json');

    const error = captureError(() => loadConfig({ files: [userFile], env: {} }));

    expect(error).toBeInstanceOf(ConfigError);
    expect(error.message).toContain(userFile);
  });

  test.each([
    ['a list', '[]'],
    ['a string', '"debug"'],
    ['null', 'null'],
  ])('fails naming a file that holds %s rather than an object', (_kind, content) => {
    write(userFile, content);

    const error = captureError(() => loadConfig({ files: [userFile], env: {} }));

    expect(error).toBeInstanceOf(ConfigError);
    expect(error.message).toBe(m['error.config.notAnObject']({ file: userFile }));
  });

  test('fails naming a path that cannot be read as a file', () => {
    fs.mkdirSync(userFile, { recursive: true });

    const error = captureError(() => loadConfig({ files: [userFile], env: {} }));

    expect(error).toBeInstanceOf(ConfigError);
    expect(error.message).toContain(userFile);
  });
});

describe('configFiles', () => {
  test('is the user file, then the project file', () => {
    expect(configFiles({ userConfigDir: '/home/me/.config/pdt', pdtConfigDir: '/work/module/.pdt' })).toEqual([
      path.join('/home/me/.config/pdt', 'config.json'),
      path.join('/work/module/.pdt', 'config.json'),
    ]);
  });

  test('is only the user file outside a project', () => {
    expect(configFiles({ userConfigDir: '/home/me/.config/pdt', pdtConfigDir: undefined })).toEqual([
      path.join('/home/me/.config/pdt', 'config.json'),
    ]);
  });
});

describe('ConfigError', () => {
  test('is an Error named ConfigError that keeps its problems and cause', () => {
    const cause = new Error('underlying');

    const error = new ConfigError('bad', ['a is wrong'], { cause });

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: 'ConfigError', message: 'bad', problems: ['a is wrong'], cause });
  });
});

function captureError(action: () => unknown): ConfigError {
  try {
    action();
  } catch (error) {
    return error as ConfigError;
  }
  throw new Error('Expected an error');
}
