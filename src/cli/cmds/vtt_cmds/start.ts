import { startVtt } from './lifecycle.js';
import { m } from '@i18n/messages.js';

import type { CommandModule } from 'yargs';
import type { CommandContext } from '../../context.js';

/** The VTT a `pdt vtt` sub-command is for. */
export interface VttArgs {
  vtt: string | undefined;
}

/** `pdt vtt start`: start one of the project's VTTs (see {@link startVtt}). */
export function createVttStartCommand(context: CommandContext): CommandModule<object, VttArgs> {
  return {
    command: 'start [vtt]',

    describe: m['ui.cmd.start.description'](),

    builder: yargs => yargs.positional('vtt', { describe: m['ui.cmd.arg.vtt.description'](), type: 'string' }),

    async handler(argv) {
      context.log.debug(m['debug.running']({ argv: JSON.stringify(argv) }));
      await startVtt(context, argv.vtt);
    },
  };
}
