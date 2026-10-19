import path from 'node:path';
import { SECRETS_FILENAME } from '@util/load-config.js';
import { ignoreProjectFiles, GITIGNORE } from '@util/gitignore.js';
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
     * Write the value to the project's configuration, or the user's outside a project or with
     * `--user`: a secret value to its `secrets.conf`, anything else to its `config.json`. The project's
     * `secrets.conf` is kept out of git.
     *
     * @throws When the key is not a setting, or the value would make the configuration invalid
     */
    handler({ key, value, user }) {
      const pdtPath = user ? undefined : paths.pdtConfigDir;
      const files = writeConfig(pdtPath === undefined ? 'user' : 'project', key, value);
      for (const file of files) out(m['info.configSet']({ key, file }));

      if (pdtPath !== undefined && files.includes(path.join(pdtPath, SECRETS_FILENAME))) {
        // The project may have been made before pdt kept its secrets out of git.
        const root = path.dirname(pdtPath);
        const added = ignoreProjectFiles(root, [SECRETS_FILENAME]);
        if (added.length > 0)
          out(m['info.gitignored']({ entries: added.join(', '), file: path.join(root, GITIGNORE) }));
      }
    },
  };
}
