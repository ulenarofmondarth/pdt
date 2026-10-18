import yargs from 'yargs';
import { beforeEach, describe, expect, test } from 'vitest';
import { createVttStartCommand } from '@/cli/cmds/vtt_cmds/start.js';
import { m } from '@i18n/messages.js';
import { createCommandContext, type CommandContextMock } from '@tests/unit/mocks/context.js';

describe('vtt start command', () => {
  let ctx: CommandContextMock;

  beforeEach(() => {
    ctx = createCommandContext();
  });

  /** Parse a command line against the command's own builder, without running its handler. */
  function parse(commandLine: string): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      yargs()
        .command({ ...createVttStartCommand(ctx), handler: argv => resolve(argv) })
        .fail((message: string) => reject(new Error(message)))
        .parse(commandLine);
    });
  }

  test('targets the project VTT by default', async () => {
    await expect(parse('start')).resolves.toMatchObject({ vtt: 'prj' });
  });

  test('targets the VTT it is given', async () => {
    await expect(parse('start staging')).resolves.toMatchObject({ vtt: 'staging' });
  });

  test('logs the parsed command at debug level', async () => {
    const argv = { _: ['start'], $0: 'pdt', vtt: 'prj' };

    await createVttStartCommand(ctx).handler(argv);

    expect(ctx.log.debug).toHaveBeenCalledExactlyOnceWith(m['debug.running']({ argv: JSON.stringify(argv) }));
  });

  test.todo('starts the VTT on its host');
});
