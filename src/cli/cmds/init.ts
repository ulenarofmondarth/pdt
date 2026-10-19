import fs from 'node:fs';
import path from 'node:path';
import PDT from '@/constants.js';
import { generatorOptions, pickGivenAnswers } from '@lib/ModuleGenerator.js';
import { projectVtt } from '@lib/projectVtt.js';
import { CONFIG_FILENAME } from '@util/load-config.js';
import { m } from '@i18n/messages.js';

import type { ArgumentsCamelCase, CommandModule } from 'yargs';
import type { CommandContext } from '../context.js';

interface InitArgs {
  dir: string;
  force: boolean | undefined;
  yes: boolean | undefined;
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
function newModuleOptionsGiven(argv: ArgumentsCamelCase<InitArgs>): string[] {
  const given = pickGivenAnswers(argv);
  const flags = generatorOptions()
    .filter(option => option.answer in given)
    // A yes or no option that was turned off was typed with its no- prefix.
    .map(option => (given[option.answer] === false ? `--no-${option.name}` : `--${option.name}`));

  return argv.yes === true ? [...flags, '--yes'] : flags;
}

/**
 * Configure the project's VTT in its new configuration file, from the module project in `dir`;
 * warn, configuring nothing, when that cannot be worked out.
 */
function configureVtt(dir: string, pdtPath: string, { log, out }: Pick<CommandContext, 'log' | 'out'>) {
  const vtt = projectVtt(dir);
  if ('problems' in vtt) {
    for (const problem of vtt.problems) log.warn(problem);
    log.warn(m['warn.projectVtt.notConfigured']({ command: vtt.command }));
    return;
  }
  const file = path.join(pdtPath, CONFIG_FILENAME);
  fs.writeFileSync(file, `${JSON.stringify({ VTT: { [vtt.name]: vtt.settings } }, null, 2)}\n`);
  out(m['info.vttConfigured']({ vtt: vtt.name, version: vtt.settings.server.version, file }));
}

/**
 * `pdt init`: make a directory a pdt project, creating a new module in it first if it is empty, and
 * configure the module's VTT.
 */
export function createInitCommand({
  paths,
  log,
  out,
  prompter,
  createModule,
}: CommandContext): CommandModule<object, InitArgs> {
  return {
    command: 'init [dir] [options]',

    describe: m['ui.cmd.init.description'](),

    builder(yargs) {
      const init = yargs
        .positional('dir', { describe: m['ui.cmd.init.dir.description'](), type: 'string', default: '.' })
        .option('force', { alias: 'f', describe: m['ui.cmd.init.force.description'](), type: 'boolean' })
        .option('yes', { alias: 'y', describe: m['ui.cmd.init.yes.description'](), type: 'boolean' });

      // Everything the generator can be told, used only when a new module is created.
      const group = m['ui.cmd.init.newModuleGroup']();
      for (const option of generatorOptions()) {
        init.option(option.name, {
          describe: option.describe,
          type: option.type,
          group,
          ...(option.choices === undefined ? {} : { choices: option.choices }),
        });
      }

      return init;
    },

    async handler(argv) {
      const pdtPath = path.resolve(argv.dir, PDT.PROJECT_RTD_DIR_NAME);
      const parent = paths.pdtConfigDir;
      const attemptingSubPdt = parent !== undefined && parent !== pdtPath;

      if (!isEmpty(argv.dir)) {
        // A module is only generated into an empty directory, so these options do nothing here.
        const ignored = newModuleOptionsGiven(argv);
        if (ignored.length > 0) {
          log.warn(m['warn.moduleNotGenerated']({ path: argv.dir, options: ignored.join(', ') }));
        }
      }

      if (attemptingSubPdt && argv.force !== true) {
        log.warn(m['warn.pdtParentExists']({ path: path.dirname(parent) }));
      } else if (fs.existsSync(pdtPath)) {
        log.warn(m['warn.alreadyExists']({ description: 'PDT data directory' }));
      } else {
        if (isEmpty(argv.dir)) {
          // Nothing to initialise yet, so create a new module there first.
          out(m['info.creatingModule']({ path: argv.dir }));
          await createModule(argv.dir, {
            given: pickGivenAnswers(argv),
            // Ask for what was not given, unless told not to or there is nobody to ask.
            ...(argv.yes !== true && prompter !== undefined ? { prompter } : {}),
            onStep: step => out(`✔ ${step}`),
          });
        }

        fs.mkdirSync(pdtPath);
        // The log went to the user data directory until this project existed; log to the project from here on.
        log.setDirectory(pdtPath);
        // Read from the module project in the same way whether it was just generated or existed already.
        configureVtt(argv.dir, pdtPath, { log, out });
        log.info(m['info.pdtInitialised']({ path: argv.dir }));
      }
    },
  };
}
