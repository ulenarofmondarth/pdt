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

  /**
   * Run a command line against the vtt command as main() does, resolving with the failure message if
   * there is one. (A .fail() handler would let yargs go on to run the command.)
   */
  function parse(commandLine: string): Promise<string | undefined> {
    return new Promise(resolve => {
      yargs()
        .command(createVttCommand(ctx))
        .strict()
        .exitProcess(false)
        .parse(commandLine, (err: Error | null) => resolve(err?.message));
    });
  }

  test('requires a sub-command', async () => {
    await expect(parse('vtt')).resolves.toEqual(expect.any(String));
  });

  // Regression: an unknown sub-command was taken as the vtt command's own argument, so it ran the
  // vtt handler, which logged an error, and pdt exited 0.
  test('rejects a sub-command it does not know, naming it', async () => {
    await expect(parse('vtt explode')).resolves.toContain('explode');

    expect(ctx.log.error).not.toHaveBeenCalled();
  });

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
