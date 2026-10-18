/**
 * The configuration of the running process: the user's and the current project's configuration
 * files over the shipped defaults (see {@link loadConfig}).
 *
 * It is loaded when this module is first imported. A configuration that cannot be used ends the
 * process with {@link CONSTANTS.EXITCODE.INVALID_CONFIG}.
 */
import CONSTANTS from '@/constants.js';
import { ConfigError, configFiles, loadConfig } from '@util/load-config.js';
import { pfs } from '@util/runtime-config.js';

import type { Config } from '@schema/config.js';

function load(): Config {
  try {
    return loadConfig({ files: configFiles(pfs), env: process.env });
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    // The logger takes its settings from the configuration, so it cannot report this.
    console.error(error.message);
    if (error.problems.length > 0) console.error(`\t${error.problems.join('\n\t')}`);
    return process.exit(CONSTANTS.EXITCODE.INVALID_CONFIG);
  }
}

const config: Config = load();

export default config;
