/**
 * `pdt vtt install`: work out the packages a VTT needs, and install them into its data.
 *
 * The setup is the resolver's (see `resolveInstall`): the project's module, the packages the VTT's
 * `packages` setting names, and everything they need, on the Foundry VTT version the VTT runs. The
 * versions the lockfile records are kept where they still fit, unless `--upgrade` is given. What is
 * installed is recorded in the lockfile; packages the setup no longer needs are removed as the
 * `packages.removal` setting says, and a running VTT is handled as `packages.running` says.
 */
import fs from 'node:fs';
import path from 'node:path';
import { explain, explanationText } from '@mondarth/fvtt-resolver';
import { httpClient } from '@mondarth/fvtt-resolver/sources';
import { diskCache, resolverCacheDir } from '@lib/diskCache.js';
import { installPackage, InstallError, removePackage } from '@lib/install/apply.js';
import { DownloadError } from '@lib/install/download.js';
import { explanationMessages } from '@lib/install/explanationMessages.js';
import { lockfilePath, readLockfile, writeLockedVtt } from '@lib/install/lockfile.js';
import { installedVersion, installPlan, removals } from '@lib/install/plan.js';
import { resolveInstall } from '@lib/install/resolveInstall.js';
import { ZipError } from '@lib/install/zip.js';
import { MODULE_MANIFEST } from '@lib/projectVtt.js';
import { vttPackages } from '@schema/config.js';
import { chosenVtt, instanceOf, isVttRunning, startProjectVtt, stopProjectVtt, vttDataDir } from './lifecycle.js';
import { m } from '@i18n/messages.js';

import type { CommandModule } from 'yargs';
import type { CommandContext } from '../../context.js';
import type { VttArgs } from './start.js';
import type { LockedPackage } from '@lib/install/lockfile.js';
import type { PlanEntry, Removal } from '@lib/install/plan.js';
import type { SourceGap } from '@mondarth/fvtt-resolver/sources';

export interface InstallArgs extends VttArgs {
  'dry-run': boolean;
  upgrade: boolean;
}

export interface InstallOptions {
  /** Show the plan, and change nothing. */
  readonly dryRun?: boolean;
  /** Choose the newest versions that fit, rather than keeping those the lockfile records. */
  readonly upgrade?: boolean;
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

/** Why a package could not be installed, in words. */
export function installFailure(error: unknown): string {
  if (error instanceof InstallError) {
    if (error.code === 'no-download') return m['error.install.reason.noDownload']();
    if (error.code === 'wrong-package') return m['error.install.reason.wrongPackage']({ found: error.detail });
    return m['error.install.reason.wrongVersion']({ found: error.detail });
  }
  if (error instanceof DownloadError) {
    if (error.reason === 'http') return m['error.install.reason.http']({ status: String(error.status) });
    if (error.reason === 'too-large') return m['error.install.reason.tooLarge']();
    return m['error.install.reason.network']();
  }
  if (error instanceof ZipError) {
    if (error.code === 'no-manifest') return m['error.install.reason.noManifest']({ file: error.detail });
    if (error.code === 'unsafe-entry') return m['error.install.reason.unsafeEntry']({ entry: error.detail });
    if (error.code === 'encrypted') return m['error.install.reason.encrypted']();
    return m['error.install.reason.tooLarge']();
  }
  return m['error.install.reason.other']({ message: error instanceof Error ? error.message : String(error) });
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

/** A line for a package the setup no longer needs. */
function removalLine({ package: ref, installed, action }: Removal): string {
  const label = installed === undefined ? ref.id : `${ref.id} ${installed}`;
  return action === 'remove'
    ? m['info.install.remove']({ package: label })
    : m['info.install.unneeded']({ package: label });
}

const keyOf = ({ type, id }: { type: string; id: string }) => `${type}:${id}`;

/** Reads the project's module, from its `module.json`. @throws {Error} When it cannot be read */
function readProject(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    // Reading and parsing throw only errors.
    throw new Error(m['error.install.projectUnreadable']({ file, problems: (error as Error).message }), {
      cause: error,
    });
  }
}

/**
 * Works out the setup of a VTT of the project, shows the plan for installing it, and installs it,
 * unless only the plan is asked for.
 *
 * @throws {Error} When not in a project, the VTT is not configured, the project's module cannot be
 *   read, no setup meets the requirements, the VTT is running and its setting blocks installing, or
 *   a package could not be installed
 */
export async function installVtt(context: CommandContext, given: string | undefined, options: InstallOptions = {}) {
  const vtt = chosenVtt(context, given);
  const { name, settings, root } = vtt;
  const packages = vttPackages(settings);
  const file = path.join(root, MODULE_MANIFEST);
  const json = readProject(file);
  const lockfile = lockfilePath(path.dirname(vtt.runState));
  const locked = readLockfile(lockfile).VTT[name];

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
    prefer:
      options.upgrade === true || locked === undefined
        ? []
        : locked.packages.filter(p => p.source !== 'project').map(p => ({ package: p.package, version: p.version })),
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

  const { setup } = resolution;
  const projectId = (json as { id: string }).id;
  const dataDir = vttDataDir(context.paths.userDataDir, instanceOf(vtt, context));
  const pdtInstalled = (locked?.packages ?? []).filter(p => p.source === 'pdt').map(p => p.package);
  const plan = installPlan(setup, dataDir, projectId);
  const unneeded = removals(setup, dataDir, projectId, pdtInstalled, packages.removal);
  context.out(
    [
      m['info.install.setup']({ vtt: name, core: setup.core, rounds: String(rounds) }),
      ...plan.map(planLine),
      ...unneeded.map(removalLine),
    ].join('\n'),
  );
  if (options.dryRun === true) {
    context.out(m['info.install.dryRun']());
    return;
  }

  const running = await isVttRunning(vtt, context);
  if (running && packages.running === 'block') throw new Error(m['error.install.running']({ vtt: name }));
  if (running && packages.running === 'auto') {
    context.out(m['info.install.stopping']({ vtt: name }));
    await stopProjectVtt(vtt, context);
  }

  // Install, then remove, recording what is in the VTT as it goes.
  const ours = new Set(pdtInstalled);
  const lockedPackages: LockedPackage[] = [];
  let installed = 0;
  let failed = 0;
  for (const { release, action } of plan) {
    const key = keyOf(release.package);
    const entry = { package: key, version: release.version };
    if (action === 'project' || action === 'premium') {
      lockedPackages.push({ ...entry, source: action });
      continue;
    }
    if (action === 'keep') {
      lockedPackages.push({ ...entry, source: ours.has(key) ? 'pdt' : 'present' });
      continue;
    }
    context.out(m['info.install.installing']({ package: release.package.id, version: release.version }));
    try {
      await installPackage(context.fetch, release, dataDir);
      installed++;
      lockedPackages.push({
        ...entry,
        source: 'pdt',
        ...(release.download !== undefined && { download: release.download }),
      });
    } catch (error) {
      failed++;
      context.log.error(
        m['error.install.packageFailed']({
          package: release.package.id,
          version: release.version,
          reason: installFailure(error),
        }),
      );
      // What was there before is untouched, and stays as it was recorded.
      const before = installedVersion(dataDir, release.package);
      const was = locked?.packages.find(p => p.package === key);
      if (before !== undefined)
        lockedPackages.push({ package: key, version: before, source: was?.source ?? 'present' });
    }
  }
  let removed = 0;
  for (const removal of unneeded.filter(r => r.action === 'remove')) {
    context.out(m['info.install.removing']({ package: removal.package.id }));
    removePackage(dataDir, removal.package);
    removed++;
  }
  writeLockedVtt(lockfile, name, { core: setup.core, packages: lockedPackages });

  if (running && packages.running === 'auto') await startProjectVtt(vtt, context);
  if (running && packages.running === 'warn') context.log.warn(m['warn.install.restart']({ vtt: name }));
  if (failed > 0) throw new Error(m['error.install.failed']({ count: String(failed) }));
  context.out(m['info.install.done']({ vtt: name, installed: String(installed), removed: String(removed) }));
}

/** `pdt vtt install`: install what one of the project's VTTs needs (see {@link installVtt}). */
export function createVttInstallCommand(context: CommandContext): CommandModule<object, InstallArgs> {
  return {
    command: 'install [vtt]',

    describe: m['ui.cmd.install.description'](),

    builder: yargs =>
      yargs
        .positional('vtt', { describe: m['ui.cmd.arg.vtt.description'](), type: 'string' })
        .option('dry-run', { describe: m['ui.cmd.install.dryRun.description'](), type: 'boolean', default: false })
        .option('upgrade', { describe: m['ui.cmd.install.upgrade.description'](), type: 'boolean', default: false }),

    async handler(argv) {
      context.log.debug(m['debug.running']({ argv: JSON.stringify(argv) }));
      await installVtt(context, argv.vtt, { dryRun: argv['dry-run'], upgrade: argv.upgrade });
    },
  };
}
