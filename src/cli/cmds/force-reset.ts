import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_FILENAME } from '@util/load-config.js';
import { runStateFile, unregisterProject } from '@util/run-state.js';
import { m } from '@i18n/messages.js';
import { initProject } from './init.js';

import type { CommandModule } from 'yargs';
import type { CommandContext } from '../context.js';

/**
 * `pdt force-reset`: set up the project pdt is run in again from scratch. It removes the project's
 * run state, its registration in the user's run state and its configuration, then initialises the
 * project as `pdt init` would. The rest of the project's `.pdt` directory, such as its log, is kept.
 */
export function createForceResetCommand(context: CommandContext): CommandModule {
  const { paths, log } = context;
  return {
    command: 'force-reset',

    describe: m['ui.cmd.forceReset.description'](),

    async handler(argv) {
      log.debug(m['debug.running']({ argv: JSON.stringify(argv) }));
      const pdtPath = paths.pdtConfigDir;
      if (pdtPath === undefined) throw new Error(m['error.notInPdtProject']());
      const root = path.dirname(pdtPath);

      const removeFile = (file: string) => {
        if (!fs.existsSync(file)) return;
        fs.rmSync(file);
        log.info(m['info.forceReset.removed']({ file }));
      };

      removeFile(runStateFile(pdtPath));
      const userRunState = runStateFile(paths.userDataDir);
      for (const id of unregisterProject(userRunState, root)) {
        log.info(m['info.forceReset.unregistered']({ id, file: userRunState }));
      }
      removeFile(path.join(pdtPath, CONFIG_FILENAME));

      await initProject(context, { dir: root });
    },
  };
}
