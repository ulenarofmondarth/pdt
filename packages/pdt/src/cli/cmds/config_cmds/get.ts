import { CONFIG_FORMATS, formatSettings, formatValue, type ConfigFormat } from '../../config-format.js';
import { UsageError } from '../../usage-error.js';
import { isSettings, maskSecrets, parseKey, schemaAt, valueAt } from '@util/config-keys.js';
import { m } from '@i18n/messages.js';

import type { CommandModule } from 'yargs';
import type { CommandContext } from '../../context.js';

interface GetArgs {
  key: string | undefined;
  'list-all': boolean;
  format: ConfigFormat;
  'show-source': boolean;
  'print-secrets': boolean;
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
        .option('show-source', { describe: m['ui.cmd.config.get.showSource'](), type: 'boolean', default: false })
        .option('print-secrets', {
          describe: m['ui.cmd.config.get.printSecrets'](),
          type: 'boolean',
          default: false,
        }),

    /**
     * Write the value at the key: a single value alone, a group in the chosen format. Secret values
     * are masked, unless `--print-secrets` is given.
     *
     * @throws {UsageError} When there is neither a key nor --list-all, or both
     * @throws When the key is not a setting, or the setting has no value
     */
    handler({ key, 'list-all': listAll, format, 'show-source': showSource, 'print-secrets': printSecrets }) {
      if (key === undefined && !listAll) throw new UsageError(m['error.config.keyRequired']());
      if (key !== undefined && listAll) throw new UsageError(m['error.config.keyAndListAll']());

      const options = { format, ...(showSource ? { sourceOf } : {}) };
      const shown = (value: unknown, at: readonly string[]) => (printSecrets ? value : maskSecrets(value, at));
      if (key === undefined) {
        out(formatSettings(shown(config, []) as Record<string, unknown>, [], options));
        return;
      }

      const keys = parseKey(key);
      const value = valueAt(config, keys);
      // An empty group, such as VTT before any VTT is configured, sets nothing either.
      if (value === undefined || (isSettings(value) && Object.keys(value).length === 0)) {
        throw new Error(
          schemaAt(keys) === undefined ? m['error.config.unknownKey']({ key }) : m['error.config.notSet']({ key }),
        );
      }
      const masked = shown(value, keys);
      out(isSettings(masked) ? formatSettings(masked, keys, options) : formatValue(masked, keys, options));
    },
  };
}
