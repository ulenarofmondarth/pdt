import PDT from '@/constants.js';
import path from 'node:path';
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

/** What the directories pdt uses depend on. */
export interface PathsContext {
  /** Directory pdt was started in. */
  cwd: string;
  /** The user's home directory. */
  home: string;
  platform: NodeJS.Platform;
  env: Readonly<Record<string, string | undefined>>;
}

/** The directories pdt reads from and writes to. None of them need exist yet. */
export interface PdtPaths {
  /** Holds the user's configuration file. */
  userConfigDir: string;
  /** Holds data and logs that belong to the user rather than to a project. */
  userDataDir: string;
  /** The `.pdt` directory of the project pdt was started in, if any. */
  pdtConfigDir: string | undefined;
}

function userConfigDir({ home, platform, env }: PathsContext): string {
  if (platform === 'win32') {
    return path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), PDT.PROGRAM_NAME);
  }
  // The XDG Base Directory specification says a relative path is invalid and must be ignored.
  const xdgConfigHome = env.XDG_CONFIG_HOME;
  const base = xdgConfigHome && path.isAbsolute(xdgConfigHome) ? xdgConfigHome : path.join(home, '.config');
  return path.join(base, PDT.PROGRAM_NAME);
}

function userDataDir({ home, platform, env }: PathsContext): string {
  const base =
    env.APPDATA ||
    (platform === 'darwin' ? path.join(home, 'Library', 'Preferences') : path.join(home, '.local', 'share'));
  return path.join(base, PDT.PROGRAM_NAME);
}

/**
 * Work out the directories pdt uses. Creates nothing; each directory is created when something is
 * first written to it.
 *
 * @param context - Where pdt is running and for whom
 */
export function resolvePaths(context: PathsContext): PdtPaths {
  return {
    userConfigDir: userConfigDir(context),
    userDataDir: userDataDir(context),
    pdtConfigDir: findConfig(context.cwd, context.home),
  };
}
