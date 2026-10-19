import yargs, { type Argv, type CommandModule } from 'yargs';
import PDT from '@/constants.js';
import { CONFIG_OPTION } from '@/cli/overrides.js';
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
    .help()
    .demandCommand(1, m['error.commandRequired']());

  commands.forEach(command => parser.command(command));
  return parser;
}
