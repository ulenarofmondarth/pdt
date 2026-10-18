import yargs, { type Argv, type CommandModule } from 'yargs';
import PDT from '@/constants.js';
import * as pdtCmds from './pdtCmds.js';
import { m } from '@i18n/messages.js';

/** pdt's top level commands. */
export const pdtCommands: readonly CommandModule[] = Object.values(pdtCmds) as CommandModule[];

/**
 * A parser for pdt's command line.
 *
 * Each call builds a new parser, so one parse cannot affect another.
 *
 * @param commands - The top level commands to offer
 */
export function createParser(commands: readonly CommandModule[] = pdtCommands): Argv {
  const parser = yargs()
    .scriptName(PDT.PROGRAM_NAME)
    // pdt decides the exit code (see main); yargs must never end the process itself.
    .exitProcess(false)
    .strict(true)
    .help()
    .demandCommand(1, m['error.commandRequired']());

  commands.forEach(command => parser.command(command));
  return parser;
}
