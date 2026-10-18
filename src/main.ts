/**
 * Runs pdt: reads the configuration, sets up logging, and runs the command on the command line.
 *
 * Everything that depends on the running process comes in through {@link MainContext}, and the
 * outcome is returned as an exit code, so a whole run can be tested without starting a process.
 */
import PDT from '@/constants.js';
import { createParser } from '@/cli/parsers.js';
import { pdtCommands } from '@/cli/commands.js';
import { createModule, type Prompter } from '@lib/ModuleGenerator.js';
import { prettyData } from '@util/diagnostic.js';
import { ConfigError, configFiles, loadConfig } from '@util/load-config.js';
import logger, { configureLogger, setLogDirectory } from '@util/logger.js';

import type { Arguments, CommandModule } from 'yargs';
import type { CommandContext } from '@/cli/context.js';
import type { Config } from '@schema/config.js';
import type { PdtPaths } from '@util/runtime-config.js';

/** What a run of pdt depends on. */
export interface MainContext {
  /** The directories pdt uses. */
  paths: PdtPaths;
  /** Environment variables. */
  env: Readonly<Record<string, string | undefined>>;
  /** Writes output the user asked for, such as the help. */
  out(text: string): void;
  /** Writes problems that stop pdt before a command runs. */
  err(text: string): void;
  /** How to ask the user questions; absent when nobody can be asked, such as without a terminal. */
  prompter?: Prompter;
}

/** The commands to offer, given what they can work with. */
export type CommandsFor = (context: CommandContext) => readonly CommandModule[];

/**
 * The configuration, or the exit code to stop with after reporting why it cannot be used.
 */
function configure(context: MainContext): Config | number {
  try {
    return loadConfig({ files: configFiles(context.paths), env: context.env });
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    // The logger takes its settings from the configuration, so it cannot report this.
    context.err(error.message);
    if (error.problems.length > 0) context.err(`\t${error.problems.join('\n\t')}`);
    return PDT.EXITCODE.INVALID_CONFIG;
  }
}

/**
 * Run pdt.
 *
 * @param args - The command line, without node and the script
 * @param context - What the run depends on
 * @param commands - The top level commands to offer, given what they can work with
 * @returns The exit code: {@link PDT.EXITCODE}
 */
export async function main(
  args: readonly string[],
  context: MainContext,
  commands: CommandsFor = pdtCommands,
): Promise<number> {
  const config = configure(context);
  if (typeof config === 'number') return config;

  configureLogger(config.Logging);
  setLogDirectory(context.paths.pdtConfigDir ?? context.paths.userDataDir);

  const commandContext: CommandContext = {
    paths: context.paths,
    config,
    log: {
      error: message => logger.error(message),
      warn: message => logger.warn(message),
      info: message => logger.info(message),
      debug: message => logger.debug(message),
      setDirectory: setLogDirectory,
    },
    out: context.out,
    ...(context.prompter === undefined ? {} : { prompter: context.prompter }),
    createModule,
  };

  // yargs reports a command line it cannot run through this callback, and still resolves. A command
  // that fails is reported here too, but also rejects.
  let usageError: Error | undefined;
  let output = '';
  try {
    await createParser(commands(commandContext)).parseAsync(
      [...args],
      (err: Error | null, argv: Arguments, text: string) => {
        usageError = err ?? undefined;
        output = text;
        logger.debug(
          `Parser callback:\nerr =\n${prettyData(err)}\n\nargv =\n${prettyData(argv)}\n\noutput = \n"${text}"`,
        );
      },
    );
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    return PDT.EXITCODE.ERROR;
  }

  if (usageError !== undefined) {
    context.err(output);
    return PDT.EXITCODE.USAGE;
  }
  if (output !== '') context.out(output);
  return PDT.EXITCODE.OK;
}
