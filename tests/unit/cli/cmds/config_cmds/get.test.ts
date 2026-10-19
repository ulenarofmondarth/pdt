import yargs from 'yargs';
import { beforeEach, describe, expect, test } from 'vitest';
import { createConfigGetCommand } from '@/cli/cmds/config_cmds/get.js';
import { formatSettings } from '@/cli/config-format.js';
import { UsageError } from '@/cli/usage-error.js';
import { m } from '@i18n/messages.js';
import { createCommandContext, type CommandContextMock } from '@tests/unit/mocks/context.js';

describe('config get command', () => {
  let ctx: CommandContextMock;

  beforeEach(() => {
    ctx = createCommandContext();
    ctx.sourceOf.mockImplementation(key => (key[0] === 'Logging' ? 'user' : 'default'));
  });

  /**
   * Run a command line against the command as main() does: resolves with the failure message, if
   * any, and rejects if the handler fails.
   */
  function run(commandLine: string): Promise<string | undefined> {
    return new Promise((resolve, reject) => {
      yargs()
        .command(createConfigGetCommand(ctx))
        .strict()
        .exitProcess(false)
        .parseAsync(commandLine, (err: Error | null) => resolve(err?.message))
        .catch(reject);
    });
  }

  describe('a key', () => {
    test('writes a single value alone', async () => {
      await run('get Logging.level');

      expect(ctx.out).toHaveBeenCalledExactlyOnceWith('warn');
    });

    test('writes a single value with its source when asked', async () => {
      await run('get Logging.level --show-source');

      expect(ctx.out).toHaveBeenCalledExactlyOnceWith('warn [user]');
    });

    test('serialises a single value in json', async () => {
      await run('get Logging.level --format json');

      expect(ctx.out).toHaveBeenCalledExactlyOnceWith('"warn"');
    });

    test('writes a group in the format asked for', async () => {
      await run('get Logging --format tree');

      expect(ctx.out).toHaveBeenCalledExactlyOnceWith(
        ['Logging', '├── filename: "pdt.log"', '└── level: "warn"'].join('\n'),
      );
    });

    test('writes a group flat by default', async () => {
      await run('get Logging');

      expect(ctx.out).toHaveBeenCalledExactlyOnceWith('Logging.filename "pdt.log"\nLogging.level "warn"');
    });

    test('fails, writing nothing, for a key that is not a setting', async () => {
      await expect(run('get Logging.colour')).rejects.toThrow(m['error.config.unknownKey']({ key: 'Logging.colour' }));

      expect(ctx.out).not.toHaveBeenCalled();
    });

    test('fails, writing nothing, for a setting that has no value', async () => {
      await expect(run('get VTT.prj.host.socketPath')).rejects.toThrow(
        m['error.config.notSet']({ key: 'VTT.prj.host.socketPath' }),
      );

      expect(ctx.out).not.toHaveBeenCalled();
    });

    test.each(['VTT', 'VTT.my-module'])('fails, writing nothing, for %s while no VTT is configured', async key => {
      await expect(run(`get ${key}`)).rejects.toThrow(m['error.config.notSet']({ key }));

      expect(ctx.out).not.toHaveBeenCalled();
    });

    test('fails, writing nothing, for a key that is not one', async () => {
      await expect(run('get Logging..level')).rejects.toThrow(m['error.config.badKey']({ key: 'Logging..level' }));

      expect(ctx.out).not.toHaveBeenCalled();
    });
  });

  describe('--list-all', () => {
    test('writes every value, flat by default', async () => {
      await run('get --list-all');

      expect(ctx.out).toHaveBeenCalledExactlyOnceWith(formatSettings(ctx.config, [], { format: 'flat' }));
      expect(ctx.out.mock.calls[0]![0]).toContain('Logging.level "warn"');
    });

    test.each(['flat', 'tree', 'json', 'yml'] as const)('writes every value as %s', async format => {
      await run(`get --list-all --format ${format}`);

      expect(ctx.out).toHaveBeenCalledExactlyOnceWith(formatSettings(ctx.config, [], { format }));
    });

    test('notes each source when asked', async () => {
      await run('get --list-all --show-source');

      expect(ctx.out.mock.calls[0]![0]).toContain('Logging.level "warn" [user]');
      expect(ctx.out.mock.calls[0]![0]).toContain('DOCS.host.image "ulenarofmondarth/sphinx-docs" [default]');
    });
  });

  describe('secrets', () => {
    beforeEach(() => {
      ctx.config.FOUNDRY = { username: 'u53rname', password: 'hunter2' };
      ctx.config.VTT = {
        mod: {
          server: { type: 'foundry', hostname: 'localhost', version: '14', port: 'auto', admin_key: 'k3y' },
          host: { type: 'docker', image: 'felddy/foundryvtt' },
        },
      };
    });

    test('writes a secret value masked', async () => {
      await run('get FOUNDRY.password');

      expect(ctx.out).toHaveBeenCalledExactlyOnceWith('*****');
    });

    test('writes a secret value as it is with --print-secrets', async () => {
      await run('get FOUNDRY.password --print-secrets');

      expect(ctx.out).toHaveBeenCalledExactlyOnceWith('hunter2');
    });

    test('masks the secrets in a group, keeping the rest', async () => {
      await run('get VTT.mod.server');

      expect(ctx.out).toHaveBeenCalledExactlyOnceWith(
        [
          'VTT.mod.server.type "foundry"',
          'VTT.mod.server.hostname "localhost"',
          'VTT.mod.server.version "14"',
          'VTT.mod.server.port "auto"',
          'VTT.mod.server.admin_key "*****"',
        ].join('\n'),
      );
    });

    test.each(['flat', 'tree', 'json', 'yml'])('masks every secret in every setting, in %s', async format => {
      await run(`get --list-all --format ${format}`);

      const text = ctx.out.mock.calls.flat().join('\n');
      for (const secret of ['u53rname', 'hunter2', 'k3y']) expect(text).not.toContain(secret);
      expect(text).toContain('*****');
    });

    test('writes every secret with --list-all --print-secrets', async () => {
      await run('get --list-all --print-secrets');

      expect(ctx.out.mock.calls.flat().join('\n')).toContain('FOUNDRY.password "hunter2"');
    });
  });

  describe('a command line it cannot run', () => {
    test('refuses neither a key nor --list-all, writing nothing', async () => {
      await expect(run('get')).rejects.toEqual(new UsageError(m['error.config.keyRequired']()));

      expect(ctx.out).not.toHaveBeenCalled();
    });

    test('refuses both a key and --list-all, writing nothing', async () => {
      await expect(run('get Logging --list-all')).rejects.toEqual(new UsageError(m['error.config.keyAndListAll']()));

      expect(ctx.out).not.toHaveBeenCalled();
    });

    test('refuses a format it does not know', async () => {
      await expect(run('get --list-all --format xml')).resolves.toContain('xml');
    });
  });
});
