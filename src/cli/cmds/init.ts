import fs from 'node:fs';
import path from 'node:path';
import { Argv, CommandModule } from 'yargs';
import PDT from '@/constants.js';
import { createModule, generatorOptions, pickGivenAnswers } from '@lib/ModuleGenerator.js';
import { pfs } from '@util/runtime-config.js';
import logger, { setLogDirectory } from '@util/logger.js';
import { canPrompt, terminalPrompter } from '@util/prompt.js';
import { m } from '@i18n/messages.js';

interface Arguments {
  [x: string]: unknown;
  dir: string;
  f: boolean | undefined;
  y: boolean | undefined;
}

/**
 * Whether there is nothing at a path yet: it does not exist, or it is a directory with no entries.
 */
function isEmpty(dir: string): boolean {
  return !fs.existsSync(dir) || fs.readdirSync(dir).length === 0;
}

/**
 * The new module options present on the command line, as the user would type them.
 */
function newModuleOptionsGiven(argv: Arguments): string[] {
  const given = pickGivenAnswers(argv);
  const flags = generatorOptions()
    .filter(option => option.answer in given)
    // A yes or no option that was turned off was typed with its no- prefix.
    .map(option => (given[option.answer] === false ? `--no-${option.name}` : `--${option.name}`));

  return argv.y === true ? [...flags, '--yes'] : flags;
}

const module: CommandModule = {
  command: 'init [dir] [options]',

  describe: m['ui.cmd.init.description'](),

  builder(yargs: Argv) {
    yargs
      .positional('dir', { describe: m['ui.cmd.init.dir.description'](), type: 'string', default: '.' })
      .option('f', { alias: 'force', describe: m['ui.cmd.init.force.description'](), type: 'boolean' })
      .option('y', { alias: 'yes', describe: m['ui.cmd.init.yes.description'](), type: 'boolean' });

    // Everything the generator can be told, used only when a new module is created.
    const group = m['ui.cmd.init.newModuleGroup']();
    for (const option of generatorOptions()) {
      yargs.option(option.name, {
        describe: option.describe,
        type: option.type,
        group,
        ...(option.choices === undefined ? {} : { choices: option.choices }),
      });
    }

    return yargs;
  },

  async handler(args) {
    const argv = args as unknown as Arguments;
    const pdtPath = path.resolve(argv.dir, PDT.PROJECT_RTD_DIR_NAME);
    const attemptingSubPdt = pfs.pdtConfigDir != undefined && pfs.pdtConfigDir !== pdtPath;

    if (!isEmpty(argv.dir)) {
      // A module is only generated into an empty directory, so these options do nothing here.
      const ignored = newModuleOptionsGiven(argv);
      if (ignored.length > 0) {
        logger.warn(m['warn.moduleNotGenerated']({ path: argv.dir, options: ignored.join(', ') }));
      }
    }

    if (attemptingSubPdt && !argv.f) {
      logger.warn(m['warn.pdtParentExists']({ path: path.dirname(pfs.pdtConfigDir!) }));
    } else {
      if (fs.existsSync(pdtPath)) {
        logger.warn(m['warn.alreadyExists']({ description: 'PDT data directory' }));
      } else {
        if (isEmpty(argv.dir)) {
          // Nothing to initialise yet, so create a new module there first.
          console.log(m['info.creatingModule']({ path: argv.dir }));
          await createModule(argv.dir, {
            given: pickGivenAnswers(argv),
            // Ask for what was not given, unless told not to or there is nobody to ask.
            ...(argv.y !== true && canPrompt() ? { prompter: terminalPrompter } : {}),
            onStep: step => console.log(`✔ ${step}`),
          });
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
