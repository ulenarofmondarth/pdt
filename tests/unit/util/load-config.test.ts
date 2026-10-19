import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  ConfigError,
  configFiles,
  loadConfig,
  resolveConfig,
  writeSetting,
  type ConfigFile,
  type ConfigSources,
} from '@util/load-config.js';
import defaults from '@/pdt-internal-config/default.json' with { type: 'json' };
import { m } from '@i18n/messages.js';

describe('loadConfig', () => {
  let sandbox: string;
  let userFile: string;
  let projectFile: string;
  let user: ConfigFile;
  let project: ConfigFile;

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-config-'));
    userFile = path.join(sandbox, 'user', 'config.json');
    projectFile = path.join(sandbox, 'project', 'config.json');
    user = { path: userFile, source: 'user' };
    project = { path: projectFile, source: 'project' };
  });

  afterEach(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  function write(file: string, content: unknown) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  }

  test('is the shipped defaults when there are no files and no variables', () => {
    expect(loadConfig({ files: [user, project], env: {} })).toEqual(defaults);
  });

  // Regression: the user's configuration was read before the defaults, so the defaults always won.
  test('lets a file override the defaults', () => {
    write(userFile, { Logging: { level: 'debug' } });

    const config = loadConfig({ files: [user], env: {} });

    expect(config.Logging.level).toBe('debug');
  });

  test('lets a later file override an earlier one', () => {
    write(userFile, { Logging: { level: 'debug', filename: 'user.log' } });
    write(projectFile, { Logging: { level: 'error' } });

    const config = loadConfig({ files: [user, project], env: {} });

    expect(config.Logging).toEqual({ level: 'error', filename: 'user.log' });
  });

  test('lets PDT_LOG_LEVEL override every file', () => {
    write(projectFile, { Logging: { level: 'error' } });

    const config = loadConfig({ files: [project], env: { PDT_LOG_LEVEL: 'info' } });

    expect(config.Logging.level).toBe('info');
  });

  test('ignores an empty PDT_LOG_LEVEL', () => {
    expect(loadConfig({ files: [], env: { PDT_LOG_LEVEL: '' } }).Logging.level).toBe(defaults.Logging.level);
  });

  test('merges nested settings, keeping those a file does not mention', () => {
    write(userFile, { VTT: { prj: { server: { version: '13' } } } });

    const config = loadConfig({ files: [user], env: {} });

    expect(config.VTT['prj']?.server).toEqual({ ...defaults.VTT.prj.server, version: '13' });
    expect(config.VTT['prj']?.host).toEqual(defaults.VTT.prj.host);
  });

  test('replaces lists rather than merging them', () => {
    write(userFile, { DOCS: { host: { ports: [{ internal: 9000, external: 9000 }] } } });

    const config = loadConfig({ files: [user], env: {} });

    expect(config.DOCS.host.ports).toEqual([{ internal: 9000, external: 9000 }]);
  });

  test('adds servers a file defines', () => {
    const staging = { ...defaults.VTT.prj, server: { ...defaults.VTT.prj.server, version: '14' } };
    write(userFile, { VTT: { staging } });

    const config = loadConfig({ files: [user], env: {} });

    expect(Object.keys(config.VTT).sort()).toEqual(['prj', 'staging']);
  });

  test('cannot change the prototype of the configuration', () => {
    write(userFile, '{"__proto__": {"polluted": true}, "Logging": {"level": "info"}}');

    const config = loadConfig({ files: [user], env: {} });

    expect(Object.getPrototypeOf(config)).toBe(Object.prototype);
    expect(config).not.toHaveProperty('polluted');
  });

  test('fails with each problem and where it is when the result is invalid', () => {
    write(userFile, { Logging: { level: 'chatty', filename: 42 } });

    const error = captureError(() => loadConfig({ files: [user], env: {} }));

    expect(error).toBeInstanceOf(ConfigError);
    expect(error.message).toBe(m['error.config.invalid']());
    expect(error.problems).toHaveLength(2);
    expect(error.problems.join('\n')).toMatch(/^Logging\.level /m);
    expect(error.problems.join('\n')).toMatch(/^Logging\.filename /m);
  });

  test('fails naming a file that is not JSON', () => {
    write(userFile, '{ not json');

    const error = captureError(() => loadConfig({ files: [user], env: {} }));

    expect(error).toBeInstanceOf(ConfigError);
    expect(error.message).toContain(userFile);
  });

  test.each([
    ['a list', '[]'],
    ['a string', '"debug"'],
    ['null', 'null'],
  ])('fails naming a file that holds %s rather than an object', (_kind, content) => {
    write(userFile, content);

    const error = captureError(() => loadConfig({ files: [user], env: {} }));

    expect(error).toBeInstanceOf(ConfigError);
    expect(error.message).toBe(m['error.config.notAnObject']({ file: userFile }));
  });

  test('fails naming a path that cannot be read as a file', () => {
    fs.mkdirSync(userFile, { recursive: true });

    const error = captureError(() => loadConfig({ files: [user], env: {} }));

    expect(error).toBeInstanceOf(ConfigError);
    expect(error.message).toContain(userFile);
  });
});

describe('settings given on the command line', () => {
  test('override every other source', () => {
    const config = loadConfig({
      files: [],
      env: { PDT_LOG_LEVEL: 'info' },
      overrides: [{ key: 'Logging.level', value: 'silly' }],
    });

    expect(config.Logging.level).toBe('silly');
  });

  test('are read by the type of the setting', () => {
    const config = loadConfig({
      files: [],
      env: {},
      overrides: [{ key: 'VTT.prj.host.ports', value: '[{"internal":30000,"external":8080}]' }],
    });

    expect(config.VTT['prj']?.host.ports).toEqual([{ internal: 30000, external: 8080 }]);
  });

  test.each([
    ['a key that is not a setting', 'Logging.colour', 'error.config.unknownKey'],
    ['an empty key', '', 'error.config.badKey'],
  ] as const)('fail as a configuration problem for %s', (_case, key, message) => {
    const error = captureError(() => loadConfig({ files: [], env: {}, overrides: [{ key, value: 'x' }] }));

    expect(error).toBeInstanceOf(ConfigError);
    expect(error.message).toBe(m[message]({ key }));
  });

  test('fail validation like any other source', () => {
    const error = captureError(() =>
      loadConfig({ files: [], env: {}, overrides: [{ key: 'Logging.level', value: 'chatty' }] }),
    );

    expect(error.problems).toEqual([expect.stringContaining('Logging.level')]);
  });
});

describe('where values come from', () => {
  let sandbox: string;
  let sources: ConfigSources;

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-config-'));
    sources = {
      files: configFiles({ userConfigDir: path.join(sandbox, 'user'), pdtConfigDir: path.join(sandbox, 'project') }),
      env: {},
    };
  });

  afterEach(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  function write(source: 'user' | 'project', content: unknown) {
    const file = path.join(sandbox, source, 'config.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(content));
  }

  test('is the default for a value no file sets', () => {
    expect(resolveConfig(sources).sourceOf(['Logging', 'filename'])).toBe('default');
  });

  test('is the default for a value the schema fills in', () => {
    write('user', {
      VTT: {
        other: { server: { type: 'foundry', hostname: 'h', version: '13' }, host: { type: 'docker', ports: [] } },
      },
    });

    const resolved = resolveConfig(sources);

    expect(resolved.config.VTT['other']?.host.image).toBe('felddy/foundryvtt');
    expect(resolved.sourceOf(['VTT', 'other', 'host', 'image'])).toBe('default');
    expect(resolved.sourceOf(['VTT', 'other', 'host', 'type'])).toBe('user');
  });

  test('is the last source to set the value', () => {
    write('user', { Logging: { level: 'debug', filename: 'user.log' } });
    write('project', { Logging: { level: 'error' } });

    const resolved = resolveConfig({ ...sources, env: { PDT_LOG_LEVEL: 'info' }, overrides: [] });

    expect(resolved.sourceOf(['Logging', 'filename'])).toBe('user');
    expect(resolved.sourceOf(['Logging', 'level'])).toBe('environment');
  });

  test.each([
    ['project', {}, []],
    ['environment', { PDT_LOG_LEVEL: 'info' }, []],
    ['cli', { PDT_LOG_LEVEL: 'info' }, [{ key: 'Logging.level', value: 'debug' }]],
  ])('can be %s', (source, env, overrides) => {
    write('project', { Logging: { level: 'error' } });

    const resolved = resolveConfig({ ...sources, env, overrides });

    expect(resolved.sourceOf(['Logging', 'level'])).toBe(source);
  });

  test('is the source of a list as a whole', () => {
    write('user', { VTT: { prj: { host: { ports: [{ internal: 1, external: 2 }] } } } });

    expect(resolveConfig(sources).sourceOf(['VTT', 'prj', 'host', 'ports'])).toBe('user');
  });
});

describe('writeSetting', () => {
  let sandbox: string;
  let sources: ConfigSources;
  let userFile: string;
  let projectFile: string;

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-config-'));
    sources = {
      files: configFiles({ userConfigDir: path.join(sandbox, 'user'), pdtConfigDir: path.join(sandbox, 'project') }),
      env: {},
    };
    userFile = path.join(sandbox, 'user', 'config.json');
    projectFile = path.join(sandbox, 'project', 'config.json');
  });

  afterEach(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  const read = (file: string): unknown => JSON.parse(fs.readFileSync(file, 'utf8'));

  test('creates the file, with only the setting, and returns where it is', () => {
    expect(writeSetting(sources, 'user', 'Logging.level', 'debug')).toBe(userFile);

    expect(read(userFile)).toEqual({ Logging: { level: 'debug' } });
    expect(fs.existsSync(projectFile)).toBe(false);
  });

  test('keeps the other settings in the file', () => {
    fs.mkdirSync(path.dirname(projectFile), { recursive: true });
    fs.writeFileSync(projectFile, JSON.stringify({ Logging: { filename: 'mine.log' } }));

    writeSetting(sources, 'project', 'Logging.level', 'error');

    expect(read(projectFile)).toEqual({ Logging: { filename: 'mine.log', level: 'error' } });
    expect(loadConfig(sources).Logging).toEqual({ filename: 'mine.log', level: 'error' });
  });

  test('stores a value by the type of the setting', () => {
    writeSetting(sources, 'user', 'VTT.prj.host.ports', '[{"internal":30000,"external":8080}]');

    expect(read(userFile)).toEqual({ VTT: { prj: { host: { ports: [{ internal: 30000, external: 8080 }] } } } });
  });

  test('writes nothing when the change would make the configuration invalid', () => {
    const error = captureError(() => writeSetting(sources, 'user', 'Logging.level', 'chatty'));

    expect(error.message).toBe(m['error.config.invalid']());
    expect(error.problems).toEqual([expect.stringContaining('Logging.level')]);
    expect(fs.existsSync(userFile)).toBe(false);
  });

  test('writes nothing for a key that is not a setting', () => {
    expect(() => writeSetting(sources, 'user', 'Logging.colour', 'red')).toThrow(
      m['error.config.unknownKey']({ key: 'Logging.colour' }),
    );
    expect(fs.existsSync(userFile)).toBe(false);
  });

  test('refuses a file that is not among the sources', () => {
    const userOnly = { ...sources, files: sources.files.filter(file => file.source === 'user') };

    expect(() => writeSetting(userOnly, 'project', 'Logging.level', 'debug')).toThrow(
      m['error.config.noFile']({ target: 'project' }),
    );
  });
});

describe('configFiles', () => {
  test('is the user file, then the project file', () => {
    expect(configFiles({ userConfigDir: '/home/me/.config/pdt', pdtConfigDir: '/work/module/.pdt' })).toEqual([
      { path: path.join('/home/me/.config/pdt', 'config.json'), source: 'user' },
      { path: path.join('/work/module/.pdt', 'config.json'), source: 'project' },
    ]);
  });

  test('is only the user file outside a project', () => {
    expect(configFiles({ userConfigDir: '/home/me/.config/pdt', pdtConfigDir: undefined })).toEqual([
      { path: path.join('/home/me/.config/pdt', 'config.json'), source: 'user' },
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
