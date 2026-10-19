import yargs from 'yargs';
import { beforeEach, describe, expect, test } from 'vitest';
import { createConfigClearCommand } from '@/cli/cmds/config_cmds/clear.js';
import { m } from '@i18n/messages.js';
import { createCommandContext, type CommandContextMock } from '@tests/unit/mocks/context.js';

import type { ConfigFile } from '@util/load-config.js';

const USER: ConfigFile = { path: '/home/me/.config/pdt/config.json', source: 'user' };
const PROJECT: ConfigFile = { path: '/work/module/.pdt/config.json', source: 'project' };

describe('config clear command', () => {
  let ctx: CommandContextMock;

  beforeEach(() => {
    ctx = createCommandContext();
    ctx.paths.pdtConfigDir = '/work/module/.pdt';
    ctx.configFiles = [USER, PROJECT];
    ctx.clearConfig.mockImplementation(targets => targets.map(target => (target === 'user' ? USER : PROJECT).path));
  });

  /** Run a command line as main() does: resolves with any failure message, rejects if the handler fails. */
  function run(commandLine: string): Promise<string | undefined> {
    return new Promise((resolve, reject) => {
      yargs()
        .command(createConfigClearCommand(ctx))
        .strict()
        .exitProcess(false)
        .parseAsync(commandLine, (err: Error | null) => resolve(err?.message))
        .catch(reject);
    });
  }

  describe('the project file, by default', () => {
    test('removes the setting, saying so', async () => {
      ctx.filesSetting.mockReturnValue([USER, PROJECT]);

      await run('clear Logging.level');

      expect(ctx.clearConfig).toHaveBeenCalledExactlyOnceWith(['project'], 'Logging.level');
      expect(ctx.out).toHaveBeenCalledExactlyOnceWith(
        m['info.configCleared']({ key: 'Logging.level', file: PROJECT.path }),
      );
      expect(ctx.log.warn).not.toHaveBeenCalled();
    });

    test('warns, changing nothing, when only another file sets it', async () => {
      ctx.filesSetting.mockReturnValue([USER]);

      await run('clear Logging.level');

      expect(ctx.clearConfig).not.toHaveBeenCalled();
      expect(ctx.log.warn).toHaveBeenCalledExactlyOnceWith(
        m['warn.configSetElsewhere']({ key: 'Logging.level', file: PROJECT.path, others: USER.path }),
      );
      expect(ctx.out).not.toHaveBeenCalled();
    });

    test('warns, changing nothing, when no file sets it', async () => {
      await run('clear Logging.level');

      expect(ctx.clearConfig).not.toHaveBeenCalled();
      expect(ctx.log.warn).toHaveBeenCalledExactlyOnceWith(
        m['warn.configNotSet']({ key: 'Logging.level', file: PROJECT.path }),
      );
    });

    // Unlike set, clear does not fall back to the user file outside a project.
    test('fails, changing nothing, outside a project', async () => {
      ctx.paths.pdtConfigDir = undefined;
      ctx.configFiles = [USER];
      ctx.filesSetting.mockReturnValue([USER]);

      await expect(run('clear Logging.level')).rejects.toThrow(m['error.config.noProject']());

      expect(ctx.clearConfig).not.toHaveBeenCalled();
    });
  });

  describe('--user', () => {
    test('removes the setting from the user file', async () => {
      ctx.filesSetting.mockReturnValue([USER, PROJECT]);

      await run('clear Logging.level --user');

      expect(ctx.clearConfig).toHaveBeenCalledExactlyOnceWith(['user'], 'Logging.level');
      expect(ctx.out).toHaveBeenCalledExactlyOnceWith(
        m['info.configCleared']({ key: 'Logging.level', file: USER.path }),
      );
    });

    test('warns, changing nothing, when only the project file sets it', async () => {
      ctx.filesSetting.mockReturnValue([PROJECT]);

      await run('clear Logging.level --user');

      expect(ctx.clearConfig).not.toHaveBeenCalled();
      expect(ctx.log.warn).toHaveBeenCalledExactlyOnceWith(
        m['warn.configSetElsewhere']({ key: 'Logging.level', file: USER.path, others: PROJECT.path }),
      );
    });

    test('works outside a project', async () => {
      ctx.configFiles = [USER];
      ctx.filesSetting.mockReturnValue([USER]);

      await run('clear Logging.level --user');

      expect(ctx.clearConfig).toHaveBeenCalledExactlyOnceWith(['user'], 'Logging.level');
    });
  });

  describe('--all', () => {
    test('removes the setting from every file that sets it, saying so for each', async () => {
      ctx.filesSetting.mockReturnValue([USER, PROJECT]);

      await run('clear Logging.level --all');

      expect(ctx.clearConfig).toHaveBeenCalledExactlyOnceWith(['user', 'project'], 'Logging.level');
      expect(ctx.out.mock.calls).toEqual([
        [m['info.configCleared']({ key: 'Logging.level', file: USER.path })],
        [m['info.configCleared']({ key: 'Logging.level', file: PROJECT.path })],
      ]);
    });

    test('removes the setting from a file other than the target', async () => {
      ctx.filesSetting.mockReturnValue([USER]);

      await run('clear Logging.level --all');

      expect(ctx.clearConfig).toHaveBeenCalledExactlyOnceWith(['user'], 'Logging.level');
    });

    test('works outside a project', async () => {
      ctx.configFiles = [USER];
      ctx.filesSetting.mockReturnValue([USER]);

      await run('clear Logging.level --all');

      expect(ctx.clearConfig).toHaveBeenCalledExactlyOnceWith(['user'], 'Logging.level');
    });

    test('warns, changing nothing, when no file sets it', async () => {
      await run('clear Logging.level --all');

      expect(ctx.clearConfig).not.toHaveBeenCalled();
      expect(ctx.log.warn).toHaveBeenCalledExactlyOnceWith(m['warn.configNotSetAnywhere']({ key: 'Logging.level' }));
    });
  });

  test('fails, changing nothing, for a key that is not a setting', async () => {
    ctx.filesSetting.mockImplementation(key => {
      throw new Error(m['error.config.unknownKey']({ key }));
    });

    await expect(run('clear Logging.colour --all')).rejects.toThrow(
      m['error.config.unknownKey']({ key: 'Logging.colour' }),
    );

    expect(ctx.clearConfig).not.toHaveBeenCalled();
  });

  test('requires a key', async () => {
    await expect(run('clear')).resolves.toEqual(expect.any(String));

    expect(ctx.clearConfig).not.toHaveBeenCalled();
  });
});
