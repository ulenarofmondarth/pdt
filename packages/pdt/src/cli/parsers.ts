import yargs, { type Argv, type CommandModule } from 'yargs';
import PDT from '@/constants.js';
import { CONFIG_OPTION, PROJECT_OPTION } from '@/cli/overrides.js';
import { m } from '@i18n/messages.js';

/**
 * A parser for pdt's command line.
 *
 * Each call builds a new parser, so one parse cannot affect another.
 *
 * @param commands - The top level commands to offer
 */
export function createParser(commands: readonly CommandModule[]): Argv {
  const parser = yargs()
    .scriptName(PDT.PROGRAM_NAME)
    // Otherwise yargs looks for a package.json above its own installed copy, not pdt's.
    .version(__PDT_VERSION__)
    // pdt decides the exit code (see main); yargs must never end the process itself.
    .exitProcess(false)
    .strict(true)
    // Read by main() before parsing (see configOverrides); declared for the help and strict parsing.
    .option(CONFIG_OPTION, {
      type: 'string',
      requiresArg: true,
      global: true,
      describe: m['ui.opt.config.description'](),
    })
    // Read by main() before parsing too (see projectOption).
    .option(PROJECT_OPTION, {
      type: 'string',
      requiresArg: true,
      global: true,
      describe: m['ui.opt.project.description'](),
    })
    .help()
    .demandCommand(1, m['error.commandRequired']());

  commands.forEach(command => parser.command(command));
  return parser;
}
