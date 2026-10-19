import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import yargs from 'yargs';
import { createConfigSetCommand } from '@/cli/cmds/config_cmds/set.js';
import { ConfigError } from '@util/load-config.js';
import { m } from '@i18n/messages.js';
import { createCommandContext, type CommandContextMock } from '@tests/unit/mocks/context.js';

describe('config set command', () => {
  let ctx: CommandContextMock;

  beforeEach(() => {
    ctx = createCommandContext();
    ctx.writeConfig.mockImplementation(target => [`/${target}/config.json`]);
  });

  /** Run a command line, given as its words, so that values reach yargs exactly as written. */
  function run(commandLine: string | string[]): Promise<string | undefined> {
    return new Promise((resolve, reject) => {
      yargs()
        .command(createConfigSetCommand(ctx))
        .strict()
        .exitProcess(false)
        .parseAsync(commandLine, (err: Error | null) => resolve(err?.message))
        .catch(reject);
    });
  }

  test('writes the user file outside a project, saying where', async () => {
    await run('set Logging.level debug');

    expect(ctx.writeConfig).toHaveBeenCalledExactlyOnceWith('user', 'Logging.level', 'debug');
    expect(ctx.out).toHaveBeenCalledExactlyOnceWith(
      m['info.configSet']({ key: 'Logging.level', file: '/user/config.json' }),
    );
  });

  test("writes the project's file inside a project", async () => {
    ctx.paths.pdtConfigDir = '/work/module/.pdt';

    await run('set Logging.level debug');

    expect(ctx.writeConfig).toHaveBeenCalledExactlyOnceWith('project', 'Logging.level', 'debug');
  });

  test('writes the user file inside a project with --user', async () => {
    ctx.paths.pdtConfigDir = '/work/module/.pdt';

    await run('set Logging.level debug --user');

    expect(ctx.writeConfig).toHaveBeenCalledExactlyOnceWith('user', 'Logging.level', 'debug');
  });

  // The setting's type decides how to read the value, so yargs must not.
  test.each([
    ['digits', '13'],
    ['true', 'true'],
    ['JSON', '[{"internal":30000,"external":8080}]'],
  ])('passes %s on as text', async (_case, value) => {
    await run(['set', 'VTT.prj.server.version', value]);

    expect(ctx.writeConfig).toHaveBeenCalledExactlyOnceWith('user', 'VTT.prj.server.version', value);
  });

  test('fails, saying nothing was set, when the value cannot be written', async () => {
    ctx.writeConfig.mockImplementation(() => {
      throw new ConfigError(m['error.config.invalid'](), ['Logging.level Invalid option']);
    });

    await expect(run('set Logging.level chatty')).rejects.toThrow(m['error.config.invalid']());

    expect(ctx.out).not.toHaveBeenCalled();
  });

  test('says where each part of a group split between config.json and secrets.conf went', async () => {
    ctx.writeConfig.mockReturnValue(['/user/config.json', '/user/secrets.conf']);

    await run(['set', 'VTT.mod', '{}']);

    expect(ctx.out.mock.calls).toEqual([
      [m['info.configSet']({ key: 'VTT.mod', file: '/user/config.json' })],
      [m['info.configSet']({ key: 'VTT.mod', file: '/user/secrets.conf' })],
    ]);
  });

  describe("the project's secrets.conf", () => {
    let root: string;
    let gitignore: string;

    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-set-'));
      gitignore = path.join(root, '.gitignore');
      ctx.paths.pdtConfigDir = path.join(root, '.pdt');
      ctx.writeConfig.mockReturnValue([path.join(root, '.pdt', 'secrets.conf')]);
    });

    afterEach(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });

    test('is added to the .gitignore when it is written, saying so', async () => {
      fs.writeFileSync(gitignore, 'node_modules\n');

      await run('set FOUNDRY.password hunter2');

      expect(fs.readFileSync(gitignore, 'utf8')).toBe('node_modules\n.pdt/secrets.conf\n');
      expect(ctx.out).toHaveBeenLastCalledWith(m['info.gitignored']({ entries: '.pdt/secrets.conf', file: gitignore }));
    });

    test('is not added again', async () => {
      fs.writeFileSync(gitignore, '/.pdt/secrets.conf\n');

      await run('set FOUNDRY.password hunter2');

      expect(fs.readFileSync(gitignore, 'utf8')).toBe('/.pdt/secrets.conf\n');
      expect(ctx.out).toHaveBeenCalledOnce();
    });

    test('is not looked after when only config.json is written', async () => {
      ctx.writeConfig.mockReturnValue([path.join(root, '.pdt', 'config.json')]);

      await run('set Logging.level debug');

      expect(fs.existsSync(gitignore)).toBe(false);
    });
  });

  test.each(['set', 'set Logging.level'])('requires a key and a value: %s', async commandLine => {
    await expect(run(commandLine)).resolves.toEqual(expect.any(String));

    expect(ctx.writeConfig).not.toHaveBeenCalled();
  });
});
