import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { main, type MainContext } from '@/main.js';
import PDT from '@/constants.js';
import logger, { configureLogger, setLogDirectory } from '@util/logger.js';
import { m } from '@i18n/messages.js';
import { createModule } from '@lib/ModuleGenerator.js';
import { createVtt } from '@lib/VTT/createVtt.js';
import { UNASKED_PROMPTER } from '@tests/unit/mocks/context.js';
import { UsageError } from '@/cli/usage-error.js';
import { ConfigError } from '@util/load-config.js';

import type { CommandModule } from 'yargs';
import type { CommandContext } from '@/cli/context.js';

vi.mock('@util/logger.js', async () => (await import('@tests/unit/mocks/logger.js')).createLoggerModuleMock());

/** A command that records that it ran, and how. */
function command(name: string, handler: CommandModule['handler'] = vi.fn()): CommandModule {
  return { command: name, describe: `the ${name} command`, handler };
}

describe('main', () => {
  let sandbox: string;
  let context: MainContext;
  let out: string[];
  let err: string[];

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-main-'));
    out = [];
    err = [];
    context = {
      paths: {
        cwd: sandbox,
        userConfigDir: path.join(sandbox, 'config'),
        userDataDir: path.join(sandbox, 'data'),
        pdtConfigDir: undefined,
      },
      env: {},
      out: text => out.push(text),
      err: text => err.push(text),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  function writeUserConfig(content: string) {
    fs.mkdirSync(context.paths.userConfigDir, { recursive: true });
    fs.writeFileSync(path.join(context.paths.userConfigDir, 'config.json'), content);
  }

  describe('running a command', () => {
    test('runs the command it is given and succeeds', async () => {
      const run = command('run');

      await expect(main(['run'], context, () => [run])).resolves.toBe(PDT.EXITCODE.OK);
      expect(run.handler).toHaveBeenCalledOnce();
      expect(err).toEqual([]);
    });

    // Regression guard: commands may be asynchronous, so main must wait for them.
    test('waits for an asynchronous command', async () => {
      let finished = false;
      const slow = command('slow', async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        finished = true;
      });

      await main(['slow'], context, () => [slow]);

      expect(finished).toBe(true);
    });

    test('fails with the error code, logging why, when the command fails', async () => {
      const broken = command('broken', async () => {
        throw new Error('it broke');
      });

      await expect(main(['broken'], context, () => [broken])).resolves.toBe(PDT.EXITCODE.ERROR);
      expect(logger.error).toHaveBeenCalledExactlyOnceWith('it broke');
    });

    test('logs each problem with the configuration when the command fails with them', async () => {
      const broken = command('broken', async () => {
        throw new ConfigError('it is invalid', ['a is wrong', 'b is wrong']);
      });

      await expect(main(['broken'], context, () => [broken])).resolves.toBe(PDT.EXITCODE.ERROR);
      expect(logger.error).toHaveBeenCalledExactlyOnceWith('it is invalid\n\ta is wrong\n\tb is wrong');
    });

    test('fails with the usage code, explaining on standard error, when the command refuses its command line', async () => {
      const picky = command('picky', async () => {
        throw new UsageError('not like that');
      });

      await expect(main(['picky'], context, () => [picky])).resolves.toBe(PDT.EXITCODE.USAGE);
      expect(err).toEqual(['not like that']);
      expect(logger.error).not.toHaveBeenCalled();
    });

    test('fails with the error code when the command throws something that is not an Error', async () => {
      const broken = command('broken', async () => {
        throw 'just a string';
      });

      await expect(main(['broken'], context, () => [broken])).resolves.toBe(PDT.EXITCODE.ERROR);
      expect(logger.error).toHaveBeenCalledExactlyOnceWith('just a string');
    });
  });

  describe('a command line it cannot run', () => {
    // Regression: these exited with 0.
    test.each([
      ['no command', []],
      ['an unknown command', ['nosuchcmd']],
      ['an unknown option', ['run', '--bogus']],
    ])('fails with the usage code for %s', async (_case, args) => {
      const run = command('run');

      await expect(main(args, context, () => [run])).resolves.toBe(PDT.EXITCODE.USAGE);
      expect(run.handler).not.toHaveBeenCalled();
    });

    test('explains the problem on standard error, with the usage', async () => {
      await main(['nosuchcmd'], context, () => [command('run')]);

      expect(out).toEqual([]);
      expect(err.join('\n')).toContain('nosuchcmd');
      expect(err.join('\n')).toContain('the run command');
    });
  });

  describe('output the user asked for', () => {
    test('prints the help and succeeds', async () => {
      await expect(main(['--help'], context, () => [command('run')])).resolves.toBe(PDT.EXITCODE.OK);

      expect(out.join('\n')).toContain('the run command');
      expect(err).toEqual([]);
    });

    test('prints the version and succeeds', async () => {
      const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { version: string };

      await expect(main(['--version'], context, () => [command('run')])).resolves.toBe(PDT.EXITCODE.OK);

      expect(out).toEqual([version]);
    });

    test('prints nothing extra after a command', async () => {
      await main(['run'], context, () => [command('run')]);

      expect(out).toEqual([]);
    });
  });

  describe('configuration', () => {
    test('configures the logger from the configuration files', async () => {
      writeUserConfig('{ "Logging": { "level": "debug", "filename": "mine.log" } }');

      await main(['run'], context, () => [command('run')]);

      expect(configureLogger).toHaveBeenCalledExactlyOnceWith({ level: 'debug', filename: 'mine.log' });
    });

    test('takes the log level from the environment it is given', async () => {
      await main(['run'], { ...context, env: { PDT_LOG_LEVEL: 'silly' } }, () => [command('run')]);

      expect(configureLogger).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ level: 'silly' }));
    });

    test('reads the project configuration after the user configuration', async () => {
      writeUserConfig('{ "Logging": { "level": "debug" } }');
      const pdtConfigDir = path.join(sandbox, 'module', PDT.PROJECT_RTD_DIR_NAME);
      fs.mkdirSync(pdtConfigDir, { recursive: true });
      fs.writeFileSync(path.join(pdtConfigDir, 'config.json'), '{ "Logging": { "level": "error" } }');

      await main(['run'], { ...context, paths: { ...context.paths, pdtConfigDir } }, () => [command('run')]);

      expect(configureLogger).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ level: 'error' }));
    });

    test('fails with the invalid configuration code, running nothing, when it is invalid', async () => {
      writeUserConfig('{ "Logging": { "level": "chatty", "filename": 42 } }');
      const run = command('run');

      await expect(main(['run'], context, () => [run])).resolves.toBe(PDT.EXITCODE.INVALID_CONFIG);

      expect(run.handler).not.toHaveBeenCalled();
      expect(err.join('\n')).toContain(m['error.config.invalid']());
      expect(err.join('\n')).toContain('Logging.level');
      expect(err.join('\n')).toContain('Logging.filename');
    });

    test('applies settings given with --config, over every file', async () => {
      writeUserConfig('{ "Logging": { "level": "debug" } }');

      await main(['run', '--config', 'Logging.level=error'], context, () => [command('run')]);

      expect(configureLogger).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ level: 'error' }));
    });

    test('fails with the invalid configuration code, running nothing, for a --config it cannot use', async () => {
      const run = command('run');

      await expect(main(['run', '--config', 'Logging.colour=red'], context, () => [run])).resolves.toBe(
        PDT.EXITCODE.INVALID_CONFIG,
      );

      expect(run.handler).not.toHaveBeenCalled();
      expect(err).toEqual([m['error.config.unknownKey']({ key: 'Logging.colour' })]);
    });

    test('names a configuration file that is not JSON', async () => {
      writeUserConfig('{ not json');

      await expect(main(['run'], context, () => [command('run')])).resolves.toBe(PDT.EXITCODE.INVALID_CONFIG);

      expect(err.join('\n')).toContain(path.join(context.paths.userConfigDir, 'config.json'));
    });
  });

  describe('--project', () => {
    let root: string;
    let given: CommandContext | undefined;

    beforeEach(() => {
      root = path.join(sandbox, 'module');
      fs.mkdirSync(path.join(root, PDT.PROJECT_RTD_DIR_NAME), { recursive: true });
      fs.writeFileSync(path.join(root, PDT.PROJECT_RTD_DIR_NAME, 'config.json'), '{ "Logging": { "level": "error" } }');
      fs.mkdirSync(context.paths.userDataDir, { recursive: true });
      fs.writeFileSync(
        path.join(context.paths.userDataDir, 'run.state.json'),
        JSON.stringify({ PROJECTS: { 'my-module': { root } } }),
      );
      given = undefined;
    });

    /** Run `args` with a command that records the context it was given. */
    function runWith(args: string[]) {
      return main(args, context, ctx => {
        given = ctx;
        return [command('run')];
      });
    }

    test.each([
      ['a registered project id', ['run', '--project', 'my-module']],
      ['a path, from where pdt was started', ['--project=module', 'run']],
      ['an absolute path', () => ['run', '--project', root]],
    ])('runs as if in the project given by %s', async (_case, args) => {
      const list = typeof args === 'function' ? args() : args;

      await expect(runWith(list)).resolves.toBe(PDT.EXITCODE.OK);

      expect(given?.paths).toEqual({ ...context.paths, cwd: root, pdtConfigDir: path.join(root, '.pdt') });
      expect(configureLogger).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ level: 'error' }));
      expect(setLogDirectory).toHaveBeenCalledExactlyOnceWith(path.join(root, '.pdt'));
    });

    test('replaces the project pdt was started in', async () => {
      context.paths.pdtConfigDir = path.join(sandbox, 'other', '.pdt');

      await runWith(['run', '--project', 'my-module']);

      expect(given?.paths.pdtConfigDir).toBe(path.join(root, '.pdt'));
    });

    test.each([
      [
        'a path that does not exist',
        'nosuch',
        () =>
          m['error.project.missing']({
            root: path.join(sandbox, 'nosuch'),
            as: m['error.project.asPath']({ given: 'nosuch' }),
          }),
      ],
      [
        'a file',
        'file',
        () =>
          m['error.project.notADirectory']({
            root: path.join(sandbox, 'file'),
            as: m['error.project.asPath']({ given: 'file' }),
          }),
      ],
      [
        'a directory that is not a project',
        'plain',
        () =>
          m['error.project.notAProject']({
            root: path.join(sandbox, 'plain'),
            as: m['error.project.asPath']({ given: 'plain' }),
          }),
      ],
    ])('fails with the usage code, running nothing, for %s', async (_case, value, message) => {
      fs.writeFileSync(path.join(sandbox, 'file'), '');
      fs.mkdirSync(path.join(sandbox, 'plain'));

      await expect(runWith(['run', '--project', value])).resolves.toBe(PDT.EXITCODE.USAGE);

      expect(given).toBeUndefined();
      expect(err).toEqual([message()]);
    });

    test('fails with the usage code, running nothing, when it is given more than once', async () => {
      await expect(runWith(['--project', 'my-module', 'run', '--project', 'module'])).resolves.toBe(PDT.EXITCODE.USAGE);

      expect(given).toBeUndefined();
      expect(err).toEqual([m['error.project.repeated']({ count: 2 })]);
    });

    test('fails with the error code, running nothing, when the run state cannot be read', async () => {
      fs.writeFileSync(path.join(context.paths.userDataDir, 'run.state.json'), 'not json');

      await expect(runWith(['run', '--project', 'my-module'])).resolves.toBe(PDT.EXITCODE.ERROR);

      expect(given).toBeUndefined();
      expect(err.join('\n')).toContain('run.state.json');
    });

    test('is in the help', async () => {
      await main(['--help'], context, () => [command('run')]);

      expect(out.join('\n')).toContain('--project');
    });
  });

  describe('log file', () => {
    test('is in the user data directory outside a project', async () => {
      await main(['run'], context, () => [command('run')]);

      expect(setLogDirectory).toHaveBeenCalledExactlyOnceWith(context.paths.userDataDir);
    });

    test("is in the project's directory inside a project", async () => {
      const pdtConfigDir = path.join(sandbox, 'module', PDT.PROJECT_RTD_DIR_NAME);

      await main(['run'], { ...context, paths: { ...context.paths, pdtConfigDir } }, () => [command('run')]);

      expect(setLogDirectory).toHaveBeenCalledExactlyOnceWith(pdtConfigDir);
    });

    test('records what was parsed at debug level', async () => {
      await main(['run'], context, () => [command('run')]);

      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('"run"'));
    });
  });

  describe('what commands work with', () => {
    /** Run with a command that records the context it was given. */
    async function contextGiven(run: MainContext = context): Promise<CommandContext> {
      let given: CommandContext | undefined;
      await main(['run'], run, ctx => {
        given = ctx;
        return [command('run')];
      });
      return given!;
    }

    test('is the paths and the loaded configuration', async () => {
      writeUserConfig('{ "Logging": { "level": "debug" } }');

      const given = await contextGiven();

      expect(given.paths).toBe(context.paths);
      expect(given.config.Logging.level).toBe('debug');
      expect(given.config.VTT).toEqual({});
      expect(given.config.DOCS.host.image).toBe('ulenarofmondarth/sphinx-docs');
    });

    test('writes output where the user will see it', async () => {
      const given = await contextGiven();

      given.out('the result');

      expect(out).toEqual(['the result']);
    });

    test('logs through the logger', async () => {
      const given = await contextGiven();

      given.log.error('an error');
      given.log.warn('a warning');
      given.log.info('some news');
      given.log.debug('a detail');
      given.log.setDirectory('/somewhere');

      expect(logger.error).toHaveBeenCalledWith('an error');
      expect(logger.warn).toHaveBeenCalledWith('a warning');
      expect(logger.info).toHaveBeenCalledWith('some news');
      expect(logger.debug).toHaveBeenCalledWith('a detail');
      expect(setLogDirectory).toHaveBeenLastCalledWith('/somewhere');
    });

    test('asks questions through the prompter it was given', async () => {
      const prompter = UNASKED_PROMPTER;

      const given = await contextGiven({ ...context, prompter });

      expect(given.prompter).toBe(prompter);
    });

    test('has no prompter when nobody can be asked', async () => {
      const given = await contextGiven();

      expect(given).not.toHaveProperty('prompter');
    });

    test('creates modules with the generator', async () => {
      const given = await contextGiven();

      expect(given.createModule).toBe(createModule);
    });

    test('knows where each value of the configuration comes from', async () => {
      writeUserConfig('{ "Logging": { "level": "debug" } }');

      const given = await contextGiven();

      expect(given.sourceOf(['Logging', 'level'])).toBe('user');
      expect(given.sourceOf(['Logging', 'filename'])).toBe('default');
    });

    test('writes settings to the configuration files it read', async () => {
      const given = await contextGiven();

      const file = path.join(context.paths.userConfigDir, 'config.json');

      expect(given.writeConfig('user', 'Logging.level', 'debug')).toEqual([file]);
      expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ Logging: { level: 'debug' } });
    });

    test('clears settings from the configuration files it read', async () => {
      writeUserConfig('{ "Logging": { "level": "debug", "filename": "mine.log" } }');
      const file = path.join(context.paths.userConfigDir, 'config.json');

      const given = await contextGiven();

      expect(given.configFiles).toEqual([
        { path: file, source: 'user', secrets: false },
        { path: path.join(context.paths.userConfigDir, 'secrets.conf'), source: 'user', secrets: true },
      ]);
      expect(given.filesSetting('Logging.level')).toEqual([{ path: file, source: 'user', secrets: false }]);
      expect(given.clearConfig(['user'], 'Logging.level')).toEqual([file]);
      expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ Logging: { filename: 'mine.log' } });
    });

    test('creates VTTs with the VTT factory', async () => {
      const given = await contextGiven();

      expect(given.createVtt).toBe(createVtt);
    });
  });
});
