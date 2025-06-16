import { Argv, CommandModule, Arguments } from 'yargs';

const module: CommandModule = {
  command: 'start [vtt] [options]',

  describe: 'Start a vtt in the current project',

  builder(yargs: Argv) {
    return yargs.positional('vtt', { describe: 'The VTT identity', type: 'string', default: 'prj' });
  },

  handler(argv: Arguments) {
    console.log(`Nested ${JSON.stringify(argv)}`);
  },
};

export default module;
