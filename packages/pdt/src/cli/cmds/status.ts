import path from 'node:path';
import PDT from '@/constants.js';
import { ConfigError } from '@util/load-config.js';
import { isPdtProject, readRunState, runStateFile } from '@util/run-state.js';
import { m } from '@i18n/messages.js';
import { vttStatuses, type VttStatus } from './vtt_cmds/lifecycle.js';

import type { CommandModule } from 'yargs';
import type { CommandContext } from '../context.js';

/** Why something cannot be used, with each problem with a configuration on a line of its own. */
function reasonOf(error: unknown): string {
  if (error instanceof ConfigError && error.problems.length > 0) return `${error.message} ${error.problems.join('; ')}`;
  return error instanceof Error ? error.message : String(error);
}

/** A VTT's state, as a line under its project. */
function statusLine(status: VttStatus): string {
  switch (status.state) {
    case 'running':
      return m['info.status.running']({ vtt: status.vtt, url: status.url, container: status.container });
    case 'stopped':
      return m['info.status.stopped']({ vtt: status.vtt });
    case 'exited':
      return m['info.status.exited']({ vtt: status.vtt, container: status.container });
    case 'unknown':
      return m['info.status.unknown']({ vtt: status.vtt, reason: status.reason });
  }
}

/** Report the VTTs of the project `context` is in, under a heading naming the project. */
async function reportProject(context: CommandContext, project: string, root: string) {
  const statuses = await vttStatuses(context);
  context.out(m['info.status.project']({ project, root }));
  const lines = statuses.length === 0 ? [m['info.status.noVtts']()] : statuses.map(statusLine);
  for (const line of lines) context.out(`  ${line}`);
}

/**
 * `pdt status`: pdt's runtime state. In a project, the project's VTTs and whether each is running;
 * outside one, the same for every project registered in the user's run state.
 */
export function createStatusCommand(context: CommandContext): CommandModule {
  const { paths, config, out } = context;
  return {
    command: 'status',

    describe: m['ui.cmd.status.description'](),

    /**
     * @throws When the project's run state, or outside a project the user's, cannot be read
     */
    async handler() {
      const pdtPath = paths.pdtConfigDir;
      if (pdtPath !== undefined) {
        const root = path.dirname(pdtPath);
        await reportProject(context, config.id ?? path.basename(root), root);
        return;
      }

      const file = runStateFile(paths.userDataDir);
      const projects = Object.entries(readRunState(file).PROJECTS ?? {});
      if (projects.length === 0) {
        out(m['info.status.noProjects']({ file }));
        return;
      }
      for (const [project, { root }] of projects) {
        if (!isPdtProject(root)) {
          out(m['info.status.missing']({ project, root }));
          continue;
        }
        // Each project as a run in it would see it, so that one that cannot be read leaves the others.
        const projectData = path.join(root, PDT.PROJECT_RTD_DIR_NAME);
        try {
          const inProject = {
            ...context,
            config: context.projectConfig(projectData),
            paths: { ...paths, pdtConfigDir: projectData },
          };
          await reportProject(inProject, project, root);
        } catch (error) {
          out(m['info.status.unusable']({ project, root, reason: reasonOf(error) }));
        }
      }
    },
  };
}
