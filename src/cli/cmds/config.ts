import { createConfigClearCommand } from './config_cmds/clear.js';
import { createConfigGetCommand } from './config_cmds/get.js';
import { createConfigSetCommand } from './config_cmds/set.js';
import { anyCommand } from '../command.js';
import { m } from '@i18n/messages.js';

import type { CommandModule } from 'yargs';
import type { CommandContext } from '../context.js';

/** `pdt config`: show or change the configuration, through its sub-commands. */
export function createConfigCommand(context: CommandContext): CommandModule {
  return {
    // No positional of its own, so that yargs rejects an unknown sub-command (see the vtt command).
    command: 'config',

    describe: m['ui.cmd.config.description'](),

    builder: yargs =>
      yargs
        .command(anyCommand(createConfigGetCommand(context)))
        .command(anyCommand(createConfigSetCommand(context)))
        .command(anyCommand(createConfigClearCommand(context)))
        .demandCommand(1),

    /** Never reached: yargs runs a sub-command, or rejects the command line. */
    handler(argv) {
      context.log.error(m['fatal.shouldNeverRun']({ argv: JSON.stringify(argv) }));
    },
  };
}
