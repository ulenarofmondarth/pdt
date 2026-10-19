import { pruneProjects, runStateFile } from '@util/run-state.js';
import { m } from '@i18n/messages.js';

import type { CommandModule } from 'yargs';
import type { CommandContext } from '../context.js';

/**
 * `pdt prune`: forget the projects that are gone. Every project registered in the user's run state
 * whose root no longer holds a `.pdt` directory is removed from it.
 */
export function createPruneCommand({ paths, log, out }: CommandContext): CommandModule {
  return {
    command: 'prune',

    describe: m['ui.cmd.prune.description'](),

    async handler(argv) {
      log.debug(m['debug.running']({ argv: JSON.stringify(argv) }));
      const file = runStateFile(paths.userDataDir);
      const removed = pruneProjects(file);
      if (removed.length === 0) out(m['info.prune.nothing']({ file }));
      for (const [id, { root }] of removed) out(m['info.prune.removed']({ id, root, file }));
    },
  };
}
