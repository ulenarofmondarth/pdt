import { m } from '@i18n/messages.js';

import type { CommandModule } from 'yargs';
import type { CommandContext } from '../context.js';

/** `pdt info`: what pdt knows about the project it is run in. */
export function createInfoCommand({ paths, log, out }: CommandContext): CommandModule {
  return {
    command: 'info [dir] [options]',

    describe: m['ui.cmd.info.description'](),

    handler() {
      if (paths.pdtConfigDir === undefined) {
        log.error(m['error.notInPdtProject']());
      } else {
        out('Ble');
      }
    },
  };
}
