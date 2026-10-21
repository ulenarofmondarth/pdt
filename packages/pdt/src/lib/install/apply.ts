/**
 * Installing and removing packages in a VTT's data.
 *
 * A package is downloaded and extracted beside where it goes, checked, and only then put in place,
 * so that a failed install leaves the package that was there untouched. Working files start with
 * `.pdt-`, and are cleared up whether the install succeeds or not.
 */
import fs from 'node:fs';
import path from 'node:path';
import { sameVersion } from '@mondarth/fvtt-resolver';
import { download } from './download.js';
import { packageDir } from './plan.js';
import { extractPackage } from './zip.js';

import type { PackageRef, Release } from '@mondarth/fvtt-resolver';

/** The prefix of pdt's working files, among a VTT's packages. */
export const WORKING_PREFIX = '.pdt-';

/** Why a package could not be installed, beyond a failed download or an unreadable zip. */
export class InstallError extends Error {
  constructor(
    readonly code: 'no-download' | 'wrong-package' | 'wrong-version',
    readonly detail = '',
  ) {
    super(detail === '' ? code : `${code}: ${detail}`);
    this.name = 'InstallError';
  }
}

/** What a manifest says of itself: its id and version, as text. */
function identity(manifest: unknown): { id?: unknown; version?: unknown } {
  return typeof manifest === 'object' && manifest !== null ? (manifest as { id?: unknown; version?: unknown }) : {};
}

/**
 * Installs a release into a VTT's data directory, replacing what is there.
 *
 * @throws {InstallError} When the release has no download, or its zip holds another package or
 *   version
 * @throws {DownloadError} When the download fails
 * @throws {ZipError} When the zip holds no manifest, or anything unsafe
 */
export async function installPackage(fetch: typeof globalThis.fetch, release: Release, dataDir: string): Promise<void> {
  const { package: ref, version } = release;
  if (release.download === undefined) throw new InstallError('no-download');
  const target = packageDir(dataDir, ref);
  const parent = path.dirname(target);
  const working = (what: string) => path.join(parent, `${WORKING_PREFIX}${what}-${ref.id}`);
  const zip = working('download');
  const staging = working('staging');
  const old = working('old');
  fs.mkdirSync(parent, { recursive: true });
  for (const leftover of [zip, staging, old]) fs.rmSync(leftover, { recursive: true, force: true });

  try {
    await download(fetch, release.download, zip);
    const { id, version: found } = identity(await extractPackage(zip, ref.type as 'module' | 'system', staging));
    if (id !== ref.id) throw new InstallError('wrong-package', String(id));
    if (typeof found !== 'string' && typeof found !== 'number') throw new InstallError('wrong-version', String(found));
    if (!sameVersion(String(found), version)) throw new InstallError('wrong-version', String(found));
    if (fs.existsSync(target)) fs.renameSync(target, old);
    fs.renameSync(staging, target);
  } finally {
    for (const leftover of [zip, staging, old]) fs.rmSync(leftover, { recursive: true, force: true });
  }
}

/** Removes a package from a VTT's data directory. */
export function removePackage(dataDir: string, ref: PackageRef): void {
  fs.rmSync(packageDir(dataDir, ref), { recursive: true, force: true });
}
