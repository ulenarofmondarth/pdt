import { Argv, CommandModule, Arguments } from 'yargs';
import logger from '@util/logger.js';
import { m } from '@i18n/messages.js';

const module: CommandModule = {
  command: 'start [vtt] [options]',

  describe: m['ui.cmd.start.description'](),

  builder(yargs: Argv) {
    return yargs.positional('vtt', { describe: m['ui.cmd.arg.vtt.description'](), type: 'string', default: 'prj' });
  },

  handler(argv: Arguments) {
    logger.debug(m['debug.running']({ argv: JSON.stringify(argv) }));
  },
};

export default module;
