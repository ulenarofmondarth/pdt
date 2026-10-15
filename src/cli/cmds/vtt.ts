import { Argv, CommandModule, Arguments } from 'yargs';
import * as vttCmds from './vtt_cmds.js';
import logger from '@util/logger.js';
import { m } from '@i18n/messages.js';

const module: CommandModule = {
  command: 'vtt <command> [options]',

  describe: m['ui.cmd.vtt.description'](),

  builder(yargs: Argv) {
    (Object.values(vttCmds) as CommandModule[]).forEach(command => yargs.command(command));
    return yargs;
  },

  handler(argv: Arguments) {
    logger.error(m['fatal.shouldNeverRun']({ argv: JSON.stringify(argv) }));
  },
};

export default module;
