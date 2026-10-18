import { createVttStartCommand } from './vtt_cmds/start.js';
import { anyCommand } from '../command.js';
import { m } from '@i18n/messages.js';

import type { CommandModule } from 'yargs';
import type { CommandContext } from '../context.js';

/** `pdt vtt`: control the project's VTTs, through its sub-commands. */
export function createVttCommand(context: CommandContext): CommandModule {
  return {
    // No positional of its own: one would take an unknown sub-command as its value and run the
    // handler below, instead of yargs rejecting it.
    command: 'vtt',

    describe: m['ui.cmd.vtt.description'](),

    builder: yargs => yargs.command(anyCommand(createVttStartCommand(context))).demandCommand(1),

    /** Never reached: yargs runs a sub-command, or rejects the command line. */
    handler(argv) {
      context.log.error(m['fatal.shouldNeverRun']({ argv: JSON.stringify(argv) }));
    },
  };
}
