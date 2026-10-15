import yargs from 'yargs';
import { afterEach, describe, expect, test, vi } from 'vitest';
import vttCommand from '@/cli/cmds/vtt.js';
import logger from '@util/logger.js';
import { m } from '@i18n/messages.js';

vi.mock('@util/logger.js', async () => (await import('@tests/unit/mocks/logger.js')).createLoggerModuleMock());

/** Parse a command line against the vtt command, resolving with the failure message if there is one. */
function parse(commandLine: string): Promise<string | undefined> {
  return new Promise(resolve => {
    yargs()
      .command(vttCommand)
      .strict()
      .fail((message: string) => resolve(message))
      .parse(commandLine, () => resolve(undefined));
  });
}

describe('vtt command', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('requires a sub-command', async () => {
    await expect(parse('vtt')).resolves.toEqual(expect.any(String));
  });

  // An unknown sub-command is not rejected by the parser; it falls through to the vtt handler.
  test('logs an error for a sub-command it does not know', async () => {
    await parse('vtt explode');

    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.debug).not.toHaveBeenCalled();
  });

  test.todo('rejects a sub-command it does not know with a usage message');

  test('routes start to the start sub-command', async () => {
    await parse('vtt start');

    expect(logger.debug).toHaveBeenCalledOnce();
    expect(logger.error).not.toHaveBeenCalled();
  });

  test('logs an error if its own handler is ever reached', async () => {
    const argv = { _: ['vtt'], $0: 'pdt' };

    await vttCommand.handler(argv);

    expect(logger.error).toHaveBeenCalledExactlyOnceWith(m['fatal.shouldNeverRun']({ argv: JSON.stringify(argv) }));
  });
});
