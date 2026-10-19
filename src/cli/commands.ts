import { createConfigCommand } from './cmds/config.js';
import { createForceResetCommand } from './cmds/force-reset.js';
import { createInfoCommand } from './cmds/info.js';
import { createInitCommand } from './cmds/init.js';
import { createVttCommand } from './cmds/vtt.js';
import { anyCommand } from './command.js';

import type { CommandModule } from 'yargs';
import type { CommandContext } from './context.js';

/**
 * pdt's top level commands, working with `context`.
 */
export function pdtCommands(context: CommandContext): readonly CommandModule[] {
  return [
    createVttCommand(context),
    anyCommand(createInitCommand(context)),
    createInfoCommand(context),
    createConfigCommand(context),
    createForceResetCommand(context),
  ];
}
