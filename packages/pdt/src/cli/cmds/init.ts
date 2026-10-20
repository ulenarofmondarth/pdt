import fs from 'node:fs';
import path from 'node:path';
import PDT from '@/constants.js';
import { generatorOptions, pickGivenAnswers, type GivenAnswers } from '@lib/ModuleGenerator.js';
import { projectVtt, readModuleId } from '@lib/projectVtt.js';
import { GITIGNORE, ignoreProjectFiles } from '@util/gitignore.js';
import { CONFIG_FILENAME, SECRETS_FILENAME } from '@util/load-config.js';
import { RUN_STATE_FILENAME, registeredProject, registerProject, runStateFile } from '@util/run-state.js';
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

/** How to make a directory a pdt project. */
export interface InitOptions {
  /** The project's root directory. */
  dir: string;
  /** Make the project even inside another project. */
  force?: boolean;
  /** Do not ask the questions for a new module. */
  yes?: boolean;
  /** Answers for a new module, given as options. */
  given?: GivenAnswers;
}

/**
 * Fail unless the project `id` is free: no project is registered under it in the user's run state.
 *
 * @param runState - The user's run state file
 * @param id - The project's id
 * @param root - The project's root directory
 */
function assertUnregistered(runState: string, id: string, root: string) {
  const registered = registeredProject(runState, id);
  if (registered === undefined) return;
  throw new Error(
    path.resolve(registered.root) === root
      ? m['error.projectRegistered.here']({ id, file: runState })
      : m['error.projectRegistered.elsewhere']({ id, root: registered.root, file: runState }),
  );
}

/**
 * Write the project's configuration: its id and, when the Foundry VTT version can be worked out, its
 * VTT, named by the id. Then register the project in the user's run state. Warn about a VTT that
 * cannot be configured.
 */
function configureProject(
  { root, pdtPath, id, runState }: { root: string; pdtPath: string; id: string; runState: string },
  { log, out }: Pick<CommandContext, 'log' | 'out'>,
) {
  const file = path.join(pdtPath, CONFIG_FILENAME);
  const vtt = projectVtt(root, id);
  const config = 'settings' in vtt ? { id, VTT: { [id]: vtt.settings } } : { id };
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  registerProject(runState, id, root);
  out(m['info.projectRegistered']({ id, file: runState }));

  if ('settings' in vtt) {
    out(m['info.vttConfigured']({ vtt: id, version: vtt.settings.server.version, file }));
  } else {
    log.warn(vtt.problem);
    log.warn(m['warn.projectVtt.notConfigured']({ command: vtt.command }));
  }
}

/**
 * Make a directory a pdt project, creating a new module in it first if it is empty.
 *
 * The project's id is the module's id, read from its manifest once any new module has been
 * generated, so that a new module and an existing one are read alike. The id must not already be
 * registered in the user's run state. The project's configuration records the id and the VTT named
 * by it, and the user's run state registers the project. The files in `.pdt` that belong to this
 * user on this machine, its secrets, run state and log, are added to the project's `.gitignore`.
 *
 * @throws {Error} When the directory is a pdt project already, the module cannot be created, or the
 *   project id is registered already
 */
export async function initProject(
  { paths, config, log, out, prompter, createModule }: CommandContext,
  { dir, force = false, yes = false, given = {} }: InitOptions,
) {
  // A relative directory is taken from where pdt is working, as `--project` may have set it.
  const root = path.resolve(paths.cwd, dir);
  const pdtPath = path.join(root, PDT.PROJECT_RTD_DIR_NAME);
  const configFile = path.join(pdtPath, CONFIG_FILENAME);
  const parent = paths.pdtConfigDir;

  if (parent !== undefined && parent !== pdtPath && !force) {
    log.warn(m['warn.pdtParentExists']({ path: path.dirname(parent) }));
    return;
  }
  if (fs.existsSync(configFile)) {
    throw new Error(m['error.alreadyInitialised']({ path: root, file: configFile }));
  }

  if (isEmpty(root)) {
    // Nothing to initialise yet, so create a new module there first.
    out(m['info.creatingModule']({ path: dir }));
    await createModule(root, {
      given,
      // Ask for what was not given, unless told not to or there is nobody to ask.
      ...(!yes && prompter !== undefined ? { prompter } : {}),
      onStep: step => out(`✔ ${step}`),
    });
  }

  // Read from the module project in the same way whether it was just generated or existed already.
  const id = readModuleId(root);
  const runState = runStateFile(paths.userDataDir);
  if ('value' in id) assertUnregistered(runState, id.value, root);

  fs.mkdirSync(pdtPath, { recursive: true });
  // The log went to the user data directory until this project existed; log to the project from here on.
  log.setDirectory(pdtPath);

  if ('value' in id) {
    configureProject({ root, pdtPath, id: id.value, runState }, { log, out });
  } else {
    log.warn(id.problem);
    log.warn(m['warn.noProjectId']());
  }
  const ignored = ignoreProjectFiles(root, [SECRETS_FILENAME, RUN_STATE_FILENAME, config.Logging.filename]);
  if (ignored.length > 0) out(m['info.gitignored']({ entries: ignored.join(', '), file: path.join(root, GITIGNORE) }));
  log.info(m['info.pdtInitialised']({ path: dir }));
}

/**
 * `pdt init`: make a directory a pdt project, creating a new module in it first if it is empty (see
 * {@link initProject}).
 */
export function createInitCommand(context: CommandContext): CommandModule<object, InitArgs> {
  const { log } = context;
  return {
    command: 'init [dir]',

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
      if (!isEmpty(path.resolve(context.paths.cwd, argv.dir))) {
        // A module is only generated into an empty directory, so these options do nothing here.
        const ignored = newModuleOptionsGiven(argv);
        if (ignored.length > 0) {
          log.warn(m['warn.moduleNotGenerated']({ path: argv.dir, options: ignored.join(', ') }));
        }
      }

      await initProject(context, {
        dir: argv.dir,
        force: argv.force === true,
        yes: argv.yes === true,
        given: pickGivenAnswers(argv),
      });
    },
  };
}
