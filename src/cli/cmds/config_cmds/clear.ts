import { m } from '@i18n/messages.js';

import type { CommandModule } from 'yargs';
import type { CommandContext } from '../../context.js';

interface ClearArgs {
  key: string;
  user: boolean;
  all: boolean;
}

/** `pdt config clear`: remove a setting from a configuration file. */
export function createConfigClearCommand({
  configFiles,
  filesSetting,
  clearConfig,
  log,
  out,
}: CommandContext): CommandModule<object, ClearArgs> {
  return {
    command: 'clear <key>',

    describe: m['ui.cmd.config.clear.description'](),

    builder: yargs =>
      yargs
        .positional('key', { describe: m['ui.cmd.config.clear.key'](), type: 'string', demandOption: true })
        .option('user', { describe: m['ui.cmd.config.clear.user'](), type: 'boolean', default: false })
        .option('all', { describe: m['ui.cmd.config.clear.all'](), type: 'boolean', default: false }),

    /**
     * Remove the setting from the project's file, the user's with `--user`, or every file that sets it
     * with `--all`. A setting the file does not have is warned about and left alone, wherever else
     * it is set.
     *
     * @throws When the key is not a setting, there is no project file to clear, or the change would
     *   make the configuration invalid
     */
    handler({ key, user, all }) {
      const setting = filesSetting(key);

      if (all) {
        if (setting.length === 0) {
          log.warn(m['warn.configNotSetAnywhere']({ key }));
          return;
        }
        for (const file of clearConfig(
          setting.map(file => file.source),
          key,
        )) {
          out(m['info.configCleared']({ key, file }));
        }
        return;
      }

      const target = configFiles.find(file => file.source === (user ? 'user' : 'project'));
      if (target === undefined) throw new Error(m['error.config.noProject']());

      if (setting.some(file => file.source === target.source)) {
        for (const file of clearConfig([target.source], key)) out(m['info.configCleared']({ key, file }));
      } else if (setting.length > 0) {
        log.warn(
          m['warn.configSetElsewhere']({ key, file: target.path, others: setting.map(file => file.path).join(', ') }),
        );
      } else {
        log.warn(m['warn.configNotSet']({ key, file: target.path }));
      }
    },
  };
}
