import yargs from 'yargs';
import { beforeEach, describe, expect, test } from 'vitest';
import { createVttCommand } from '@/cli/cmds/vtt.js';
import { m } from '@i18n/messages.js';
import { createCommandContext, type CommandContextMock } from '@tests/unit/mocks/context.js';

describe('vtt command', () => {
  let ctx: CommandContextMock;

  beforeEach(() => {
    ctx = createCommandContext();
  });

  /** Parse a command line against the vtt command, resolving with the failure message if there is one. */
  function parse(commandLine: string): Promise<string | undefined> {
    return new Promise(resolve => {
      yargs()
        .command(createVttCommand(ctx))
        .strict()
        .fail((message: string) => resolve(message))
        .parse(commandLine, () => resolve(undefined));
    });
  }

  test('requires a sub-command', async () => {
    await expect(parse('vtt')).resolves.toEqual(expect.any(String));
  });

  // An unknown sub-command is not rejected by the parser; it falls through to the vtt handler.
  test('logs an error for a sub-command it does not know', async () => {
    await parse('vtt explode');

    expect(ctx.log.error).toHaveBeenCalledOnce();
    expect(ctx.log.debug).not.toHaveBeenCalled();
  });

  test.todo('rejects a sub-command it does not know with a usage message');

  test('routes start to the start sub-command', async () => {
    await parse('vtt start');

    expect(ctx.log.debug).toHaveBeenCalledOnce();
    expect(ctx.log.error).not.toHaveBeenCalled();
  });

  test('logs an error if its own handler is ever reached', async () => {
    const argv = { _: ['vtt'], $0: 'pdt' };

    await createVttCommand(ctx).handler(argv);

    expect(ctx.log.error).toHaveBeenCalledExactlyOnceWith(m['fatal.shouldNeverRun']({ argv: JSON.stringify(argv) }));
  });
});
