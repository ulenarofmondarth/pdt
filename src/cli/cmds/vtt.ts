import { createVttStartCommand } from './vtt_cmds/start.js';
import { anyCommand } from '../command.js';
import { m } from '@i18n/messages.js';

import type { CommandModule } from 'yargs';
import type { CommandContext } from '../context.js';

/** `pdt vtt`: control the project's VTTs, through its sub-commands. */
export function createVttCommand(context: CommandContext): CommandModule {
  return {
    command: 'vtt <command> [options]',

    describe: m['ui.cmd.vtt.description'](),

    builder: yargs => yargs.command(anyCommand(createVttStartCommand(context))),

    handler(argv) {
      context.log.error(m['fatal.shouldNeverRun']({ argv: JSON.stringify(argv) }));
    },
  };
}
