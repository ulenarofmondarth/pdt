/**
 * Runs pdt: reads the configuration, sets up logging, and runs the command on the command line.
 *
 * Everything that depends on the running process comes in through {@link MainContext}, and the
 * outcome is returned as an exit code, so a whole run can be tested without starting a process.
 */
import PDT from '@/constants.js';
import { createParser } from '@/cli/parsers.js';
import { configOverrides, projectOption, redactArgv } from '@/cli/overrides.js';
import { UsageError } from '@/cli/usage-error.js';
import { pdtCommands } from '@/cli/commands.js';
import { createModule, type Prompter } from '@lib/ModuleGenerator.js';
import { createVtt } from '@lib/VTT/createVtt.js';
import { isPortFree } from '@util/ports.js';
import { isUrlReachable } from '@util/reachable.js';
import { prettyData } from '@util/diagnostic.js';
import {
  ConfigError,
  configFiles,
  resolveConfig,
  writeSetting,
  clearSetting,
  filesSetting,
  type ConfigSources,
  type ResolvedConfig,
} from '@util/load-config.js';
import logger, { configureLogger, setLogDirectory } from '@util/logger.js';
import { inProject, ProjectError, resolveProject } from '@util/runtime-config.js';

import type { Arguments, CommandModule } from 'yargs';
import type { CommandContext } from '@/cli/context.js';
import type { PdtPaths } from '@util/runtime-config.js';
import type { Owner } from '@lib/VTT/VTTServer.js';

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
  /** The user pdt runs as; absent where users have no numeric ids, as on Windows. */
  owner?: Owner;
}

/** The commands to offer, given what they can work with. */
export type CommandsFor = (context: CommandContext) => readonly CommandModule[];

/** What went wrong, with each problem with the configuration on a line of its own. */
function describeError(error: unknown): string {
  if (error instanceof ConfigError && error.problems.length > 0) {
    return `${error.message}\n\t${error.problems.join('\n\t')}`;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * The configuration and where it comes from, or the exit code to stop with after reporting why it
 * cannot be used.
 */
function configure(
  args: readonly string[],
  context: MainContext,
): { sources: ConfigSources; resolved: ResolvedConfig } | number {
  try {
    const sources = { files: configFiles(context.paths), env: context.env, overrides: configOverrides(args) };
    return { sources, resolved: resolveConfig(sources) };
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    // The logger takes its settings from the configuration, so it cannot report this.
    context.err(describeError(error));
    return PDT.EXITCODE.INVALID_CONFIG;
  }
}

/**
 * The context to run in: as if in the project given with `--project`, if it is, or as started. Or
 * the exit code to stop with after reporting why the project cannot be used.
 */
function locate(args: readonly string[], context: MainContext): MainContext | number {
  try {
    const given = projectOption(args);
    if (given === undefined) return context;
    return { ...context, paths: inProject(context.paths, resolveProject(given, context.paths)) };
  } catch (error) {
    // The logger is not configured yet, so it cannot report this.
    context.err(describeError(error));
    return error instanceof ProjectError ? PDT.EXITCODE.USAGE : PDT.EXITCODE.ERROR;
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
  const located = locate(args, context);
  if (typeof located === 'number') return located;
  context = located;

  const configured = configure(args, context);
  if (typeof configured === 'number') return configured;
  const { sources, resolved } = configured;
  const { config } = resolved;

  configureLogger(config.Logging);
  setLogDirectory(context.paths.pdtConfigDir ?? context.paths.userDataDir);

  const commandContext: CommandContext = {
    paths: context.paths,
    config,
    projectConfig: pdtConfigDir =>
      resolveConfig({
        ...sources,
        files: configFiles({ userConfigDir: context.paths.userConfigDir, pdtConfigDir }),
      }).config,
    sourceOf: resolved.sourceOf,
    writeConfig: (target, key, value) => writeSetting(sources, target, key, value),
    configFiles: sources.files,
    filesSetting: key => filesSetting(sources, key),
    clearConfig: (targets, key) => clearSetting(sources, targets, key),
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
    createVtt,
    isPortFree,
    isUrlReachable,
    ...(context.owner === undefined ? {} : { owner: context.owner }),
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
          `Parser callback:\nerr =\n${prettyData(err)}\n\nargv =\n${prettyData(redactArgv(argv))}\n\noutput = \n"${text}"`,
        );
      },
    );
  } catch (error) {
    if (error instanceof UsageError) {
      context.err(error.message);
      return PDT.EXITCODE.USAGE;
    }
    logger.error(describeError(error));
    return PDT.EXITCODE.ERROR;
  }

  if (usageError !== undefined) {
    context.err(output);
    return PDT.EXITCODE.USAGE;
  }
  if (output !== '') context.out(output);
  return PDT.EXITCODE.OK;
}
