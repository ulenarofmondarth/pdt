import yargs from 'yargs';
import { beforeEach, describe, expect, test } from 'vitest';
import { createConfigCommand } from '@/cli/cmds/config.js';
import { m } from '@i18n/messages.js';
import { createCommandContext, type CommandContextMock } from '@tests/unit/mocks/context.js';

describe('config command', () => {
  let ctx: CommandContextMock;

  beforeEach(() => {
    ctx = createCommandContext();
  });

  /** Run a command line against the config command as main() does, resolving with any failure message. */
  function parse(commandLine: string): Promise<string | undefined> {
    return new Promise((resolve, reject) => {
      yargs()
        .command(createConfigCommand(ctx))
        .strict()
        .exitProcess(false)
        .parseAsync(commandLine, (err: Error | null) => resolve(err?.message))
        .catch(reject);
    });
  }

  test('requires a sub-command', async () => {
    await expect(parse('config')).resolves.toEqual(expect.any(String));
  });

  test('rejects a sub-command it does not know, naming it', async () => {
    await expect(parse('config explode')).resolves.toContain('explode');
  });

  test('routes get to the get sub-command', async () => {
    await parse('config get Logging.level');

    expect(ctx.out).toHaveBeenCalledExactlyOnceWith('warn');
  });

  test('routes set to the set sub-command', async () => {
    await parse('config set Logging.level debug');

    expect(ctx.writeConfig).toHaveBeenCalledOnce();
  });

  test('logs an error if its own handler is ever reached', async () => {
    const argv = { _: ['config'], $0: 'pdt' };

    await createConfigCommand(ctx).handler(argv);

    expect(ctx.log.error).toHaveBeenCalledExactlyOnceWith(m['fatal.shouldNeverRun']({ argv: JSON.stringify(argv) }));
  });
});
