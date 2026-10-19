import { ConfigError, type ConfigOverride } from '@util/load-config.js';
import { ProjectError } from '@util/runtime-config.js';
import { m } from '@i18n/messages.js';

/** The global option that overrides a setting for one run. */
export const CONFIG_OPTION = 'config';

/** The global option that runs pdt as if in a project. */
export const PROJECT_OPTION = 'project';

/**
 * Every value given for the global option `--<name>` on a command line, as `--<name> <value>` or
 * `--<name>=<value>`. Nothing after `--` is an option.
 *
 * Some options are needed before yargs parses the command line, so they are picked out here; yargs
 * declares them too, for the help and so that strict parsing accepts them.
 *
 * @param args - The command line, without node and the script
 * @param name - The option's name, without the dashes
 */
function optionValues(args: readonly string[], name: string): string[] {
  const option = `--${name}`;
  const values: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--') break;
    if (arg === option) {
      // Without a value, yargs reports the missing argument.
      const value = args[index + 1];
      if (value !== undefined) values.push(value);
      index++;
    } else if (arg?.startsWith(`${option}=`)) {
      values.push(arg.slice(option.length + 1));
    }
  }
  return values;
}

/**
 * The settings given with `--config <key>=<value>` on a command line.
 *
 * The configuration is read before yargs parses the command line, because the logger and the
 * commands depend on it.
 *
 * @param args - The command line, without node and the script
 * @throws {ConfigError} When a setting is not `<key>=<value>`
 */
export function configOverrides(args: readonly string[]): ConfigOverride[] {
  return optionValues(args, CONFIG_OPTION).map(text => {
    const at = text.indexOf('=');
    if (at <= 0) throw new ConfigError(m['error.config.badOverride']({ value: text }));
    return { key: text.slice(0, at), value: text.slice(at + 1) };
  });
}

/**
 * The project given with `--project <id or path>` on a command line.
 *
 * It decides which project's configuration is read, so it is needed before yargs parses the
 * command line.
 *
 * @param args - The command line, without node and the script
 * @throws {ProjectError} When `--project` is given more than once
 */
export function projectOption(args: readonly string[]): string | undefined {
  const values = optionValues(args, PROJECT_OPTION);
  // pdt runs in one project, so which of several was meant cannot be guessed.
  if (values.length > 1) throw new ProjectError(m['error.project.repeated']({ count: values.length }));
  return values[0];
}
