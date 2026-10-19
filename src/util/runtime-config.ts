import PDT from '@/constants.js';
import path from 'node:path';
import fs from 'node:fs';
import { findUpSync } from 'find-up';
import { isPdtProject, registeredProject, runStateFile } from '@util/run-state.js';
import { m } from '@i18n/messages.js';

/** The project given with `--project` cannot be used. */
export class ProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectError';
  }
}

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
  /** Directory pdt was started in. */
  cwd: string;
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
  // The XDG Base Directory specification says a relative path is invalid and must be ignored.
  const xdgDataHome = env.XDG_DATA_HOME;
  const base =
    env.APPDATA ||
    (platform === 'darwin'
      ? path.join(home, 'Library', 'Preferences')
      : xdgDataHome && path.isAbsolute(xdgDataHome)
        ? xdgDataHome
        : path.join(home, '.local', 'share'));
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
    cwd: context.cwd,
    userConfigDir: userConfigDir(context),
    userDataDir: userDataDir(context),
    pdtConfigDir: findConfig(context.cwd, context.home),
  };
}

/**
 * The root directory of the project given with `--project`: the root registered for it, if it is a
 * project id in the user's run state, otherwise the path it names, taken from `cwd`.
 *
 * @param given - A project id, or the path to a project's root directory
 * @param paths - Where pdt was started, and the user data directory that holds the run state
 * @throws {ProjectError} When the directory does not exist, is not a directory, or holds no `.pdt`
 * @throws {Error} When the user's run state cannot be read
 */
export function resolveProject(given: string, { cwd, userDataDir }: Pick<PdtPaths, 'cwd' | 'userDataDir'>): string {
  if (given === '') throw new ProjectError(m['error.project.empty']());
  const registered = registeredProject(runStateFile(userDataDir), given);
  const root = registered === undefined ? path.resolve(cwd, given) : path.resolve(registered.root);
  const as = registered === undefined ? m['error.project.asPath']({ given }) : m['error.project.asId']({ id: given });

  let isDirectory: boolean;
  try {
    isDirectory = fs.statSync(root).isDirectory();
  } catch {
    throw new ProjectError(m['error.project.missing']({ root, as }));
  }
  if (!isDirectory) throw new ProjectError(m['error.project.notADirectory']({ root, as }));
  if (!isPdtProject(root)) throw new ProjectError(m['error.project.notAProject']({ root, as }));
  return root;
}

/**
 * The directories pdt uses when it runs as if in the project at `root`: it works in the project's
 * root, and the project's `.pdt` directory is the project's.
 */
export function inProject(paths: PdtPaths, root: string): PdtPaths {
  return { ...paths, cwd: root, pdtConfigDir: path.join(root, PDT.PROJECT_RTD_DIR_NAME) };
}
