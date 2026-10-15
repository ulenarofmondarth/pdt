import yargs, { CommandModule } from 'yargs';
import * as pdtCmds from './pdtCmds.js';

export const parser = yargs(process.argv.slice(2))
  .strict(true)
  .help()
  .demandCommand(1, 'At least one top level command is required.');

(Object.values(pdtCmds) as CommandModule[]).forEach(command => parser.command(command));
