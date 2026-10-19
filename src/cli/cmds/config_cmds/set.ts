import { m } from '@i18n/messages.js';

import type { CommandModule } from 'yargs';
import type { CommandContext } from '../../context.js';

interface SetArgs {
  key: string;
  value: string;
  user: boolean;
}

/** `pdt config set`: set a value in a configuration file. */
export function createConfigSetCommand({ paths, out, writeConfig }: CommandContext): CommandModule<object, SetArgs> {
  return {
    command: 'set <key> <value>',

    describe: m['ui.cmd.config.set.description'](),

    builder: yargs =>
      yargs
        .positional('key', { describe: m['ui.cmd.config.set.key'](), type: 'string', demandOption: true })
        // A string, so that yargs does not turn `13` into a number: the setting's type decides.
        .positional('value', { describe: m['ui.cmd.config.set.value'](), type: 'string', demandOption: true })
        .option('user', { describe: m['ui.cmd.config.set.user'](), type: 'boolean', default: false }),

    /**
     * Write the value to the project's configuration file, or the user's outside a project or with
     * `--user`.
     *
     * @throws When the key is not a setting, or the value would make the configuration invalid
     */
    handler({ key, value, user }) {
      const target = user || paths.pdtConfigDir === undefined ? 'user' : 'project';
      const file = writeConfig(target, key, value);
      out(m['info.configSet']({ key, file }));
    },
  };
}
