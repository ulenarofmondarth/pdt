import fs from 'node:fs';
import path from 'node:path';
import { Argv, CommandModule } from 'yargs';
import PDT from '@/constants.js';
import { pfs } from '@util/runtime-config.js';
import logger, { setLogDirectory } from '@util/logger.js';
import { m } from '@i18n/messages.js';

interface Arguments {
  [x: string]: unknown;
  dir: string;
  f: boolean | undefined;
}

const module: CommandModule = {
  command: 'init [dir] [options]',

  describe: m['ui.cmd.init.description'](),

  builder(yargs: Argv) {
    return yargs
      .positional('dir', { describe: m['ui.cmd.init.dir.description'](), type: 'string', default: '.' })
      .option('f', { alias: 'force', describe: 'force intialisation', type: 'boolean' });
  },

  handler(args) {
    const argv = args as unknown as Arguments;
    const pdtPath = path.resolve(argv.dir, PDT.PROJECT_RTD_DIR_NAME);
    const attempingSubPdt = pfs.pdtConfigDir != undefined && pfs.pdtConfigDir !== pdtPath;

    if (attempingSubPdt && !argv.f) {
      logger.warn(m['warn.pdtParentExists']({ path: path.dirname(pfs.pdtConfigDir!) }));
    } else {
      if (fs.existsSync(pdtPath)) {
        logger.warn(m['warn.alreadyExists']({ description: 'PDT data directory' }));
      } else {
        fs.mkdirSync(pdtPath);
        // The logger chose its file before this project existed; log to the project from here on.
        setLogDirectory(pdtPath);
        logger.info(m['info.pdtInitialised']({ path: argv.dir }));
      }
    }
  },
};

export default module;
