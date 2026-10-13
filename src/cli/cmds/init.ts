import fs from 'node:fs';
import path from 'node:path';
import { Argv, CommandModule } from 'yargs';
import PDT from '@/constants.js';
import { createModule } from '@lib/ModuleGenerator.js';
import { pfs } from '@util/runtime-config.js';
import logger, { setLogDirectory } from '@util/logger.js';
import { canPrompt, terminalPrompter } from '@util/prompt.js';
import { m } from '@i18n/messages.js';

interface Arguments {
  [x: string]: unknown;
  dir: string;
  f: boolean | undefined;
}

/**
 * Whether there is nothing at a path yet: it does not exist, or it is a directory with no entries.
 */
function isEmpty(dir: string): boolean {
  return !fs.existsSync(dir) || fs.readdirSync(dir).length === 0;
}

const module: CommandModule = {
  command: 'init [dir] [options]',

  describe: m['ui.cmd.init.description'](),

  builder(yargs: Argv) {
    return yargs
      .positional('dir', { describe: m['ui.cmd.init.dir.description'](), type: 'string', default: '.' })
      .option('f', { alias: 'force', describe: 'force intialisation', type: 'boolean' });
  },

  async handler(args) {
    const argv = args as unknown as Arguments;
    const pdtPath = path.resolve(argv.dir, PDT.PROJECT_RTD_DIR_NAME);
    const attempingSubPdt = pfs.pdtConfigDir != undefined && pfs.pdtConfigDir !== pdtPath;

    if (attempingSubPdt && !argv.f) {
      logger.warn(m['warn.pdtParentExists']({ path: path.dirname(pfs.pdtConfigDir!) }));
    } else {
      if (fs.existsSync(pdtPath)) {
        logger.warn(m['warn.alreadyExists']({ description: 'PDT data directory' }));
      } else {
        if (isEmpty(argv.dir)) {
          // Nothing to initialise yet, so create a new module there first.
          if (!canPrompt()) {
            throw new Error(m['error.needsTerminal']());
          }
          console.log(m['info.creatingModule']({ path: argv.dir }));
          await createModule(argv.dir, terminalPrompter, step => console.log(`✔ ${step}`));
        }

        fs.mkdirSync(pdtPath);
        // The logger chose its file before this project existed; log to the project from here on.
        setLogDirectory(pdtPath);
        logger.info(m['info.pdtInitialised']({ path: argv.dir }));
      }
    }
  },
};

export default module;
