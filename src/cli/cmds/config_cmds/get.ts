import { CONFIG_FORMATS, formatSettings, formatValue, type ConfigFormat } from '../../config-format.js';
import { UsageError } from '../../usage-error.js';
import { isSettings, parseKey, schemaAt, valueAt } from '@util/config-keys.js';
import { m } from '@i18n/messages.js';

import type { CommandModule } from 'yargs';
import type { CommandContext } from '../../context.js';

interface GetArgs {
  key: string | undefined;
  'list-all': boolean;
  format: ConfigFormat;
  'show-source': boolean;
}

/** `pdt config get`: show a configuration value, a group of values, or every value. */
export function createConfigGetCommand({ config, sourceOf, out }: CommandContext): CommandModule<object, GetArgs> {
  return {
    command: 'get [key]',

    describe: m['ui.cmd.config.get.description'](),

    builder: yargs =>
      yargs
        .positional('key', { describe: m['ui.cmd.config.get.key'](), type: 'string' })
        .option('list-all', { describe: m['ui.cmd.config.get.listAll'](), type: 'boolean', default: false })
        .option('format', {
          describe: m['ui.cmd.config.get.format'](),
          choices: CONFIG_FORMATS,
          default: 'flat' as const,
        })
        .option('show-source', { describe: m['ui.cmd.config.get.showSource'](), type: 'boolean', default: false }),

    /**
     * Write the value at the key: a single value alone, a group in the chosen format.
     *
     * @throws {UsageError} When there is neither a key nor --list-all, or both
     * @throws When the key is not a setting, or the setting has no value
     */
    handler({ key, 'list-all': listAll, format, 'show-source': showSource }) {
      if (key === undefined && !listAll) throw new UsageError(m['error.config.keyRequired']());
      if (key !== undefined && listAll) throw new UsageError(m['error.config.keyAndListAll']());

      const options = { format, ...(showSource ? { sourceOf } : {}) };
      if (key === undefined) {
        out(formatSettings(config, [], options));
        return;
      }

      const keys = parseKey(key);
      const value = valueAt(config, keys);
      if (value === undefined) {
        throw new Error(
          schemaAt(keys) === undefined ? m['error.config.unknownKey']({ key }) : m['error.config.notSet']({ key }),
        );
      }
      out(isSettings(value) ? formatSettings(value, keys, options) : formatValue(value, keys, options));
    },
  };
}
