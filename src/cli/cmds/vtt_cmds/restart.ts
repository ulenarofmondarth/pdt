import { restartVtt } from './lifecycle.js';
import { m } from '@i18n/messages.js';

import type { CommandModule } from 'yargs';
import type { CommandContext } from '../../context.js';
import type { VttArgs } from './start.js';

/** `pdt vtt restart`: restart one of the project's VTTs (see {@link restartVtt}). */
export function createVttRestartCommand(context: CommandContext): CommandModule<object, VttArgs> {
  return {
    command: 'restart [vtt]',

    describe: m['ui.cmd.restart.description'](),

    builder: yargs => yargs.positional('vtt', { describe: m['ui.cmd.arg.vtt.description'](), type: 'string' }),

    async handler(argv) {
      context.log.debug(m['debug.running']({ argv: JSON.stringify(argv) }));
      await restartVtt(context, argv.vtt);
    },
  };
}
