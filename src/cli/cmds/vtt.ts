import { Argv, CommandModule, Arguments } from 'yargs';
import * as vttCmds from './vtt_cmds.js';

const module: CommandModule = {
  command: 'vtt <command> [options]',

  describe: 'Control a project scoped VTT',

  builder(yargs: Argv) {
    (Object.values(vttCmds) as CommandModule[]).forEach(command => yargs.command(command));
    return yargs;
  },

  handler(argv: Arguments) {
    console.log(`Nested ${JSON.stringify(argv)}`);
  },
};

export default module;
