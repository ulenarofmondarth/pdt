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

const bare = (version: string) => version.replace(/^[vV]/, '');

/** The plan for installing a setup into a VTT's data directory: its system first, then its modules by id. */
export function installPlan(setup: Setup, dataDir: string, projectId: string): PlanEntry[] {
  const modules = [...setup.modules].sort((a, b) => a.package.id.localeCompare(b.package.id));
  return [setup.system, ...modules].map((release): PlanEntry => {
    if (release.package.type === 'module' && release.package.id === projectId) return { release, action: 'project' };
    const installed = installedVersion(dataDir, release.package);
    const now = installed === undefined ? {} : { installed };
    // Manifests may write a version with a leading `v` that their listing leaves out.
    if (installed !== undefined && bare(installed) === bare(release.version))
      return { release, action: 'keep', ...now };
    return { release, action: release.protected ? 'premium' : 'install', ...now };
  });
}
