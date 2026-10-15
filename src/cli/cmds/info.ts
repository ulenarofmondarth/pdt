import { Argv, CommandModule } from 'yargs';
import { pfs } from '@util/runtime-config.js';
import logger from '@util/logger.js';
import { m } from '@i18n/messages.js';

const module: CommandModule = {
  command: 'info [dir] [options]',

  describe: m['ui.cmd.info.description'](),

  builder(yargs: Argv) {
    return yargs;
  },

  handler() {
    if (pfs.pdtConfigDir == undefined) {
      logger.error(m['error.notInPdtProject']());
    } else {
      console.log('Ble');
    }
  },
};

export default module;
