/**
 * The install plan: for each package of a setup, what installing it into a VTT's data takes.
 *
 * Foundry VTT keeps packages in its data directory, under `Data/modules/<id>` and
 * `Data/systems/<id>`, each with its manifest. A package already there at the version chosen is
 * kept; any other is installed, replacing what is there. Premium packages need the user's licence
 * to download, so they are left for the user to install through Foundry VTT. The project's own
 * module is not installed: the project is given to the VTT as that module.
 */
import fs from 'node:fs';
import path from 'node:path';
import { sameVersion } from '@mondarth/fvtt-resolver';

import type { Release, Setup } from '@mondarth/fvtt-resolver';

/** What installing one package takes. */
export type PlanAction =
  /** The project's own module, given to the VTT as it is. */
  | 'project'
  /** Already installed at the version chosen. */
  | 'keep'
  /** To download and install. */
  | 'install'
  /** Premium: for the user to install through Foundry VTT. */
  | 'premium';

export interface PlanEntry {
  readonly release: Release;
  readonly action: PlanAction;
  /** The version installed now, if any. */
  readonly installed?: string;
}

/** Where Foundry VTT keeps a package, in a VTT's data directory. */
export function packageDir(dataDir: string, { type, id }: Release['package']): string {
  return path.join(dataDir, 'Data', `${type}s`, id);
}

/** The version of a package installed in a VTT's data directory, from its manifest, if any. */
export function installedVersion(dataDir: string, ref: Release['package']): string | undefined {
  try {
    const manifest: unknown = JSON.parse(
      fs.readFileSync(path.join(packageDir(dataDir, ref), `${ref.type}.json`), 'utf8'),
    );
    const version =
      typeof manifest === 'object' && manifest !== null ? (manifest as { version?: unknown }).version : undefined;
    return typeof version === 'string' || typeof version === 'number' ? String(version) : undefined;
  } catch {
    return undefined;
  }
}

/** The plan for installing a setup into a VTT's data directory: its system first, then its modules by id. */
export function installPlan(setup: Setup, dataDir: string, projectId: string): PlanEntry[] {
  const modules = [...setup.modules].sort((a, b) => a.package.id.localeCompare(b.package.id));
  return [setup.system, ...modules].map((release): PlanEntry => {
    if (release.package.type === 'module' && release.package.id === projectId) return { release, action: 'project' };
    const installed = installedVersion(dataDir, release.package);
    const now = installed === undefined ? {} : { installed };
    // Manifests may write a version with a leading `v` that their listing leaves out.
    if (installed !== undefined && sameVersion(installed, release.version)) return { release, action: 'keep', ...now };
    return { release, action: release.protected ? 'premium' : 'install', ...now };
  });
}

/** What to do with packages the setup no longer needs: the `packages.removal` setting. */
export type RemovalMode = 'auto' | 'never' | 'remove';

/** A package installed in a VTT that its setup does not need. */
export interface Removal {
  readonly package: Release['package'];
  readonly installed?: string;
  /** `remove` it, or only report it as `unneeded`. */
  readonly action: 'remove' | 'unneeded';
}

/** The packages in a VTT's data directory, leaving out working files and anything that is not a folder. */
function packagesOnDisk(dataDir: string): Release['package'][] {
  return (['module', 'system'] as const).flatMap(type => {
    let names: fs.Dirent[];
    try {
      names = fs.readdirSync(path.join(dataDir, 'Data', `${type}s`), { withFileTypes: true });
    } catch {
      return [];
    }
    return names
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => ({ type, id: entry.name }));
  });
}

/**
 * The packages installed in a VTT that its setup does not need, and what to do with each.
 *
 * - `auto`: remove those the lockfile says pdt installed;
 * - `never`: remove none, and report those pdt installed;
 * - `remove`: remove every package the setup does not need, even those installed by hand.
 *
 * The project's own module is never removed: the project is given to the VTT as that module.
 *
 * @param pdtInstalled - The packages the lockfile says pdt installed, as `module:<id>` or `system:<id>`
 */
export function removals(
  setup: Setup,
  dataDir: string,
  projectId: string,
  pdtInstalled: readonly string[],
  mode: RemovalMode,
): Removal[] {
  const key = ({ type, id }: Release['package']) => `${type}:${id}`;
  const needed = new Set([setup.system, ...setup.modules].map(release => key(release.package)));
  needed.add(`module:${projectId}`);
  const ours = new Set(pdtInstalled);
  return packagesOnDisk(dataDir)
    .filter(ref => !needed.has(key(ref)) && (mode === 'remove' || ours.has(key(ref))))
    .sort((a, b) => key(a).localeCompare(key(b)))
    .map(ref => {
      const installed = installedVersion(dataDir, ref);
      return {
        package: ref,
        ...(installed === undefined ? {} : { installed }),
        action: mode === 'never' ? 'unneeded' : 'remove',
      };
    });
}
