import PDT from '@/constants.js';
import path from 'node:path';
import fs from 'node:fs';
import { findUpSync } from 'find-up';

export class RTCError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RTCError';
  }
}

/**
 * Decide where the upward search for the .pdt directory must stop.
 *
 * The search may only be bounded by HOME when it starts at or below HOME. Otherwise HOME is
 * never reached and find-up would keep looking at the filesystem root forever.
 *
 * @param dir - Directory the search starts from
 * @param home - The user's home directory, if known
 * @returns Directory to stop at, or undefined to search up to the filesystem root
 */
export function searchBoundary(dir: string, home: string | undefined): string | undefined {
  if (home === undefined || home === '') return undefined;

  const fromHome = path.relative(path.resolve(home), path.resolve(dir));
  const outsideHome = fromHome === '..' || fromHome.startsWith(`..${path.sep}`) || path.isAbsolute(fromHome);

  return outsideHome ? undefined : home;
}

/**
 * Look for the .pdt directory. Continue from CWD up to HOME (if on the same path)
 *
 * @param dir - Directory the search starts from
 * @param home - The user's home directory, if known
 * @returns Path to config
 */
export function findConfig(
  dir: string = process.cwd(),
  home: string | undefined = process.env.HOME,
): string | undefined {
  const stopAt = searchBoundary(dir, home);

  const pdtRoot = findUpSync(PDT.PROJECT_RTD_DIR_NAME, {
    cwd: dir,
    type: 'directory',
    ...(stopAt === undefined ? {} : { stopAt }),
  });

  return pdtRoot;
}

const userDataDir = path.join(
  process.env.APPDATA ||
    (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + '/.local/share'),
  PDT.PROGRAM_NAME,
);

if (!fs.existsSync(userDataDir)) {
  fs.mkdirSync(userDataDir, { recursive: true });
}

export const pfs = {
  userDataDir,
  pdtConfigDir: findConfig(),
} as const;
