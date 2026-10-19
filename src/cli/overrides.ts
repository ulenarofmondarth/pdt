import { ConfigError, type ConfigOverride } from '@util/load-config.js';
import { m } from '@i18n/messages.js';

/** The global option that overrides a setting for one run. */
export const CONFIG_OPTION = 'config';

/**
 * The settings given with `--config <key>=<value>` on a command line.
 *
 * The configuration is read before yargs parses the command line, because the logger and the
 * commands depend on it, so these are picked out here. yargs declares the option too, for the help
 * and so that strict parsing accepts it. Nothing after `--` is an option.
 *
 * @param args - The command line, without node and the script
 * @throws {ConfigError} When a setting is not `<key>=<value>`
 */
export function configOverrides(args: readonly string[]): ConfigOverride[] {
  const option = `--${CONFIG_OPTION}`;
  const texts: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--') break;
    if (arg === option) {
      // Without a value, yargs reports the missing argument.
      const value = args[index + 1];
      if (value !== undefined) texts.push(value);
      index++;
    } else if (arg?.startsWith(`${option}=`)) {
      texts.push(arg.slice(option.length + 1));
    }
  }
  return texts.map(text => {
    const at = text.indexOf('=');
    if (at <= 0) throw new ConfigError(m['error.config.badOverride']({ value: text }));
    return { key: text.slice(0, at), value: text.slice(at + 1) };
  });
}
