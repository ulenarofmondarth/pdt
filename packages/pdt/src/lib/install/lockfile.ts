/**
 * The lockfile, `.pdt/vtt.lock.json`: what `pdt vtt install` installed in each of the project's
 * VTTs, so that the next install keeps those versions where it can, a team shares one setup, and
 * pdt knows which packages it put there, to remove them when they are no longer needed.
 *
 * It is meant to be committed with the project. A lockfile pdt cannot read is ignored, as if there
 * were none: it only steers the choice of versions.
 */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod/v4';

/** The lockfile's name, in the project's `.pdt` directory. */
export const LOCKFILE = 'vtt.lock.json';

/** The format of the lockfile this pdt writes. */
export const LOCKFILE_FORMAT = 1;

const lockedPackage = z.object({
  /** The package's key: `module:<id>` or `system:<id>`. */
  package: z.string().regex(/^(module|system):[^\s:]+$/),
  version: z.string().min(1),
  /** Where its zip was downloaded from, if pdt downloaded it. */
  download: z.string().optional(),
  /**
   * How it got into the VTT: `pdt` installed it, it was `present` already, it is `premium` for the
   * user to install, or it is the `project`'s own module.
   */
  source: z.enum(['pdt', 'present', 'premium', 'project']),
});

const lockedVtt = z.object({
  core: z.string(),
  packages: z.array(lockedPackage),
});

const lockfileSchema = z.object({
  format: z.literal(LOCKFILE_FORMAT),
  VTT: z.record(z.string(), lockedVtt),
});

export type LockedPackage = z.output<typeof lockedPackage>;
export type LockedVtt = z.output<typeof lockedVtt>;
export type Lockfile = z.output<typeof lockfileSchema>;

/** Where a project's lockfile is. */
export function lockfilePath(pdtConfigDir: string): string {
  return path.join(pdtConfigDir, LOCKFILE);
}

/** A project's lockfile, or an empty one when there is none or it cannot be read. */
export function readLockfile(file: string): Lockfile {
  try {
    const read = lockfileSchema.safeParse(JSON.parse(fs.readFileSync(file, 'utf8')));
    if (read.success) return read.data;
  } catch {
    // Missing or not JSON: as if there were none.
  }
  return { format: LOCKFILE_FORMAT, VTT: {} };
}

/** Records what is installed in a VTT, keeping the lockfile's other VTTs. */
export function writeLockedVtt(file: string, vtt: string, locked: LockedVtt): void {
  const lockfile = readLockfile(file);
  const packages = [...locked.packages].sort((a, b) => a.package.localeCompare(b.package));
  const next: Lockfile = { format: LOCKFILE_FORMAT, VTT: { ...lockfile.VTT, [vtt]: { ...locked, packages } } };
  const sorted = Object.fromEntries(Object.entries(next.VTT).sort(([a], [b]) => a.localeCompare(b)));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ ...next, VTT: sorted }, null, 2)}\n`);
}
