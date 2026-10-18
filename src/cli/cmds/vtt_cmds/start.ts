import { m } from '@i18n/messages.js';

import type { CommandModule } from 'yargs';
import type { CommandContext } from '../../context.js';

interface StartArgs {
  vtt: string;
}

/** `pdt vtt start`: start one of the project's VTTs. */
export function createVttStartCommand({ log }: CommandContext): CommandModule<object, StartArgs> {
  return {
    command: 'start [vtt] [options]',

    describe: m['ui.cmd.start.description'](),

    builder: yargs =>
      yargs.positional('vtt', { describe: m['ui.cmd.arg.vtt.description'](), type: 'string', default: 'prj' }),

    handler(argv) {
      log.debug(m['debug.running']({ argv: JSON.stringify(argv) }));
    },
  };
}
