import yargs from 'yargs';
import { afterEach, describe, expect, test, vi } from 'vitest';
import startCommand from '@/cli/cmds/vtt_cmds/start.js';
import logger from '@util/logger.js';
import { m } from '@i18n/messages.js';

vi.mock('@util/logger.js', async () => (await import('@tests/unit/mocks/logger.js')).createLoggerModuleMock());

/** Parse a command line against the command's own builder, without running its handler. */
function parse(commandLine: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    yargs()
      .command({ ...startCommand, handler: argv => resolve(argv) })
      .fail((message: string) => reject(new Error(message)))
      .parse(commandLine);
  });
}

describe('vtt start command', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('targets the project VTT by default', async () => {
    await expect(parse('start')).resolves.toMatchObject({ vtt: 'prj' });
  });

  test('targets the VTT it is given', async () => {
    await expect(parse('start staging')).resolves.toMatchObject({ vtt: 'staging' });
  });

  test('logs the parsed command at debug level', async () => {
    const argv = { _: ['start'], $0: 'pdt', vtt: 'prj' };

    await startCommand.handler(argv);

    expect(logger.debug).toHaveBeenCalledExactlyOnceWith(m['debug.running']({ argv: JSON.stringify(argv) }));
  });

  test.todo('starts the VTT on its host');
});
