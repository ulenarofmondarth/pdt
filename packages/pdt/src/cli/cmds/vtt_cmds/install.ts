/**
 * `pdt vtt install`: work out the packages a VTT needs, and install them into its data.
 *
 * The setup is the resolver's (see `resolveInstall`): the project's module, the packages the VTT's
 * `packages` setting names, and everything they need, on the Foundry VTT version the VTT runs. So
 * far it only shows what it would install (`--dry-run`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { explain, explanationText } from '@mondarth/fvtt-resolver';
import { httpClient } from '@mondarth/fvtt-resolver/sources';
import { diskCache, resolverCacheDir } from '@lib/diskCache.js';
import { explanationMessages } from '@lib/install/explanationMessages.js';
import { installPlan } from '@lib/install/plan.js';
import { resolveInstall } from '@lib/install/resolveInstall.js';
import { MODULE_MANIFEST } from '@lib/projectVtt.js';
import { chosenVtt, instanceOf, vttDataDir } from './lifecycle.js';
import { m } from '@i18n/messages.js';

import type { CommandModule } from 'yargs';
import type { CommandContext } from '../../context.js';
import type { VttArgs } from './start.js';
import type { PlanEntry } from '@lib/install/plan.js';
import type { SourceGap } from '@mondarth/fvtt-resolver/sources';

export interface InstallArgs extends VttArgs {
  'dry-run': boolean;
}

/** Why a source could not be read, in words. */
export function gapReason({ reason, status }: SourceGap): string {
  switch (reason) {
    case 'http':
      return m['warn.install.reason.http']({ status: String(status) });
    case 'network':
      return m['warn.install.reason.network']();
    case 'budget':
      return m['warn.install.reason.budget']();
    default:
      return m['warn.install.reason.invalid']();
  }
}

/** Reports what could not be read, once for each URL. */
function reportGaps(context: CommandContext, gaps: readonly SourceGap[]) {
  const byUrl = new Map(gaps.map(gap => [gap.url, gap]));
  if (byUrl.size === 0) return;
  context.log.warn(
    [
      m['warn.install.gaps'](),
      ...[...byUrl.values()].map(gap => m['warn.install.gap']({ url: gap.url, reason: gapReason(gap) })),
    ].join('\n'),
  );
}

/** A line of the plan. */
function planLine({ release, action, installed }: PlanEntry): string {
  const words = { package: release.package.id, version: release.version };
  if (action === 'install' && installed !== undefined) return m['info.install.replace']({ ...words, installed });
  return m[`info.install.${action}`](words);
}

/**
 * Works out the setup of a VTT of the project and shows the plan for installing it.
 *
 * @throws {Error} When not in a project, the VTT is not configured, the project's module cannot be
 *   read, no setup meets the requirements, or installing is asked for, which is not available yet
 */
export async function installVtt(context: CommandContext, given: string | undefined, dryRun: boolean) {
  if (!dryRun) throw new Error(m['error.install.dryRunOnly']());
  const vtt = chosenVtt(context, given);
  const { name, settings, root } = vtt;

  const file = path.join(root, MODULE_MANIFEST);
  let json: unknown;
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(
      // Reading and parsing throw only errors.
      m['error.install.projectUnreadable']({ file, problems: (error as Error).message }),
      { cause: error },
    );
  }

  context.out(m['info.install.resolving']({ vtt: name }));
  const http = httpClient({
    fetch: context.fetch,
    cache: diskCache(resolverCacheDir(context.paths.userDataDir)),
    userAgent: `pdt/${__PDT_VERSION__}`,
  });
  const found = await resolveInstall(http, {
    project: { json, origin: file, type: 'module' },
    vtt: settings,
    sources: context.config.SOURCES,
    noImage: (_version, image) => m['error.install.noImage']({ image }),
  });

  if (found.kind === 'project-unreadable') {
    throw new Error(
      m['error.install.projectUnreadable']({ file, problems: found.problems.map(p => p.code).join(', ') }),
    );
  }
  reportGaps(context, found.gaps);
  if (found.kind === 'no-core') throw new Error(m['error.install.noCore']({ vtt: name, generation: found.generation }));

  const { resolution, rounds, unloaded } = found;
  if (unloaded.length > 0) {
    context.log.warn(
      m['warn.install.unloaded']({ packages: unloaded.map(u => `${u.package}@${u.version}`).join(', ') }),
    );
  }
  if ('needs' in resolution) {
    throw new Error(
      m['error.install.incomplete']({
        vtt: name,
        rounds: String(rounds),
        packages: resolution.needs.map(n => `${n.package}@${n.version}`).join(', '),
      }),
    );
  }
  if (!resolution.ok) {
    throw new Error(
      `${m['error.install.noSetup']({ vtt: name })}\n${explanationText(explain(resolution.failure, explanationMessages()))}`,
    );
  }

  const plan = installPlan(
    resolution.setup,
    vttDataDir(context.paths.userDataDir, instanceOf(vtt, context)),
    (json as { id: string }).id,
  );
  context.out(
    [
      m['info.install.setup']({ vtt: name, core: resolution.setup.core, rounds: String(rounds) }),
      ...plan.map(planLine),
    ].join('\n'),
  );
  context.out(m['info.install.dryRun']());
}

/** `pdt vtt install`: work out what one of the project's VTTs needs (see {@link installVtt}). */
export function createVttInstallCommand(context: CommandContext): CommandModule<object, InstallArgs> {
  return {
    command: 'install [vtt]',

    describe: m['ui.cmd.install.description'](),

    builder: yargs =>
      yargs
        .positional('vtt', { describe: m['ui.cmd.arg.vtt.description'](), type: 'string' })
        .option('dry-run', { describe: m['ui.cmd.install.dryRun.description'](), type: 'boolean', default: false }),

    async handler(argv) {
      context.log.debug(m['debug.running']({ argv: JSON.stringify(argv) }));
      await installVtt(context, argv.vtt, argv['dry-run']);
    },
  };
}
