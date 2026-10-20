import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import PDT from '@/constants.js';
import {
  findConfig,
  inProject,
  ProjectError,
  resolvePaths,
  resolveProject,
  searchBoundary,
} from '@util/runtime-config.js';
import { runStateFile, writeRunState } from '@util/run-state.js';
import { m } from '@i18n/messages.js';
import { RTCError } from '@util/runtime-config.js';

describe('searchBoundary', () => {
  test('stops at home when starting below home', () => {
    expect(searchBoundary('/home/user/projects/thing', '/home/user')).toEqual('/home/user');
  });

  test('stops at home when starting in home', () => {
    expect(searchBoundary('/home/user', '/home/user')).toEqual('/home/user');
  });

  test('is unbounded when starting outside home', () => {
    expect(searchBoundary('/srv/build/thing', '/home/user')).toBeUndefined();
  });

  test('is unbounded when starting in a sibling that shares a name prefix with home', () => {
    expect(searchBoundary('/home/username/thing', '/home/user')).toBeUndefined();
  });

  test('is unbounded when home is unknown', () => {
    expect(searchBoundary('/srv/build/thing', undefined)).toBeUndefined();
  });
});

describe('findConfig', () => {
  let sandbox: string;

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-rtc-'));
  });

  afterEach(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  // Regression: this search never terminated when started outside the home directory.
  test('finds the project directory when started outside home', () => {
    const home = path.join(sandbox, 'home');
    const project = path.join(sandbox, 'elsewhere', 'project');
    const nested = path.join(project, 'src', 'deep');
    fs.mkdirSync(home, { recursive: true });
    fs.mkdirSync(nested, { recursive: true });
    fs.mkdirSync(path.join(project, PDT.PROJECT_RTD_DIR_NAME));

    expect(findConfig(nested, home)).toEqual(path.join(project, PDT.PROJECT_RTD_DIR_NAME));
  });

  test('does not look above home', () => {
    const home = path.join(sandbox, 'home');
    const start = path.join(home, 'project');
    fs.mkdirSync(start, { recursive: true });
    fs.mkdirSync(path.join(sandbox, PDT.PROJECT_RTD_DIR_NAME));

    expect(findConfig(start, home)).toBeUndefined();
  });
});

describe('resolvePaths', () => {
  const HOME = path.join(path.sep, 'home', 'me');
  const elsewhere = { cwd: path.join(path.sep, 'srv'), home: HOME };

  test('keep the directory pdt was started in', () => {
    expect(resolvePaths({ ...elsewhere, platform: 'linux', env: {} }).cwd).toBe(path.join(path.sep, 'srv'));
  });

  describe('user configuration directory', () => {
    test('is ~/.config/pdt by default', () => {
      const paths = resolvePaths({ ...elsewhere, platform: 'linux', env: {} });

      expect(paths.userConfigDir).toBe(path.join(HOME, '.config', PDT.PROGRAM_NAME));
    });

    test('is ~/.config/pdt on macOS too', () => {
      const paths = resolvePaths({ ...elsewhere, platform: 'darwin', env: {} });

      expect(paths.userConfigDir).toBe(path.join(HOME, '.config', PDT.PROGRAM_NAME));
    });

    test('follows XDG_CONFIG_HOME', () => {
      const xdg = path.join(path.sep, 'cfg');

      const paths = resolvePaths({ ...elsewhere, platform: 'linux', env: { XDG_CONFIG_HOME: xdg } });

      expect(paths.userConfigDir).toBe(path.join(xdg, PDT.PROGRAM_NAME));
    });

    // The XDG specification says a relative path is invalid and must be ignored.
    test('ignores a relative XDG_CONFIG_HOME', () => {
      const paths = resolvePaths({ ...elsewhere, platform: 'linux', env: { XDG_CONFIG_HOME: 'cfg' } });

      expect(paths.userConfigDir).toBe(path.join(HOME, '.config', PDT.PROGRAM_NAME));
    });

    test('is under APPDATA on Windows', () => {
      const appData = path.join(HOME, 'AppData', 'Roaming');

      const paths = resolvePaths({ ...elsewhere, platform: 'win32', env: { APPDATA: appData } });

      expect(paths.userConfigDir).toBe(path.join(appData, PDT.PROGRAM_NAME));
    });

    test('is under the home directory on Windows when APPDATA is not set', () => {
      const paths = resolvePaths({ ...elsewhere, platform: 'win32', env: {} });

      expect(paths.userConfigDir).toBe(path.join(HOME, 'AppData', 'Roaming', PDT.PROGRAM_NAME));
    });

    // Regression: the directory searched for user configuration ended in pdt/pdt.
    test('names pdt only once', () => {
      const paths = resolvePaths({ ...elsewhere, platform: 'linux', env: {} });

      expect(paths.userConfigDir.split(path.sep).filter(part => part === PDT.PROGRAM_NAME)).toHaveLength(1);
    });
  });

  describe('user data directory', () => {
    test('uses APPDATA when it is set', () => {
      const appData = path.join(HOME, 'AppData');

      const paths = resolvePaths({ ...elsewhere, platform: 'linux', env: { APPDATA: appData } });

      expect(paths.userDataDir).toBe(path.join(appData, PDT.PROGRAM_NAME));
    });

    test('is under ~/.local/share on Linux', () => {
      const paths = resolvePaths({ ...elsewhere, platform: 'linux', env: { APPDATA: '' } });

      expect(paths.userDataDir).toBe(path.join(HOME, '.local', 'share', PDT.PROGRAM_NAME));
    });

    // Regression: XDG_DATA_HOME was ignored, so a run meant to be kept apart still wrote the
    // user's own run state.
    test('follows XDG_DATA_HOME', () => {
      const xdg = path.join(HOME, 'xdg-data');

      const paths = resolvePaths({ ...elsewhere, platform: 'linux', env: { XDG_DATA_HOME: xdg } });

      expect(paths.userDataDir).toBe(path.join(xdg, PDT.PROGRAM_NAME));
    });

    test('ignores a relative XDG_DATA_HOME', () => {
      const paths = resolvePaths({ ...elsewhere, platform: 'linux', env: { XDG_DATA_HOME: 'data' } });

      expect(paths.userDataDir).toBe(path.join(HOME, '.local', 'share', PDT.PROGRAM_NAME));
    });

    test('is under ~/Library/Preferences on macOS', () => {
      const paths = resolvePaths({ ...elsewhere, platform: 'darwin', env: {} });

      expect(paths.userDataDir).toBe(path.join(HOME, 'Library', 'Preferences', PDT.PROGRAM_NAME));
    });
  });

  describe('with real directories', () => {
    let sandbox: string;

    beforeEach(() => {
      sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-rtc-'));
    });

    afterEach(() => {
      fs.rmSync(sandbox, { recursive: true, force: true });
    });

    test('finds the project the working directory is in', () => {
      const project = path.join(sandbox, 'module');
      const cwd = path.join(project, 'src');
      fs.mkdirSync(cwd, { recursive: true });
      fs.mkdirSync(path.join(project, PDT.PROJECT_RTD_DIR_NAME));

      const paths = resolvePaths({ cwd, home: sandbox, platform: 'linux', env: {} });

      expect(paths.pdtConfigDir).toBe(path.join(project, PDT.PROJECT_RTD_DIR_NAME));
    });

    test('has no project outside one', () => {
      const paths = resolvePaths({ cwd: sandbox, home: sandbox, platform: 'linux', env: {} });

      expect(paths.pdtConfigDir).toBeUndefined();
    });

    // Working out where things go must not change anything; they are created when first written.
    test('creates nothing', () => {
      const home = path.join(sandbox, 'home');
      fs.mkdirSync(home);

      resolvePaths({ cwd: home, home, platform: 'linux', env: {} });

      expect(fs.readdirSync(home)).toEqual([]);
    });
  });
});

describe('RTCError', () => {
  test('is an Error named RTCError that keeps its message and cause', () => {
    const cause = new Error('underlying');

    const error = new RTCError('runtime configuration is broken', { cause });

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: 'RTCError', message: 'runtime configuration is broken', cause });
  });
});

describe('resolveProject', () => {
  let sandbox: string;
  let paths: { cwd: string; userDataDir: string };
  let root: string;

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-resolve-project-'));
    root = path.join(sandbox, 'projects', 'arcane-ledger');
    fs.mkdirSync(path.join(root, '.pdt'), { recursive: true });
    paths = { cwd: sandbox, userDataDir: path.join(sandbox, 'data') };
  });

  afterEach(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  function register(projects: Record<string, string>) {
    writeRunState(runStateFile(paths.userDataDir), {
      PROJECTS: Object.fromEntries(Object.entries(projects).map(([id, at]) => [id, { root: at }])),
    });
  }

  test("is a registered project's root, given its id", () => {
    register({ 'arcane-ledger': root });

    expect(resolveProject('arcane-ledger', paths)).toBe(root);
  });

  test('takes an id over a path with the same name', () => {
    fs.mkdirSync(path.join(sandbox, 'ledger', '.pdt'), { recursive: true });
    register({ ledger: root });

    expect(resolveProject('ledger', paths)).toBe(root);
  });

  test('is the path given, from where pdt was started, when it is not a registered id', () => {
    expect(resolveProject(path.join('projects', 'arcane-ledger'), paths)).toBe(root);
    expect(resolveProject(root, paths)).toBe(root);
  });

  test('fails, as a project error, for a registered project that has gone', () => {
    const gone = path.join(sandbox, 'gone');
    register({ gone: gone });

    expect(() => resolveProject('gone', paths)).toThrow(
      new ProjectError(m['error.project.missing']({ root: gone, as: m['error.project.asId']({ id: 'gone' }) })),
    );
  });

  test('fails, as a project error, for a path that is a file', () => {
    fs.writeFileSync(path.join(sandbox, 'file'), '');

    expect(() => resolveProject('file', paths)).toThrow(ProjectError);
  });

  test('fails, as a project error, for a directory without a .pdt directory', () => {
    expect(() => resolveProject('projects', paths)).toThrow(
      m['error.project.notAProject']({
        root: path.join(sandbox, 'projects'),
        as: m['error.project.asPath']({ given: 'projects' }),
      }),
    );
  });

  test('fails, as a project error, for an empty value', () => {
    expect(() => resolveProject('', paths)).toThrow(new ProjectError(m['error.project.empty']()));
  });

  test('fails, but not as a project error, when the run state cannot be read', () => {
    fs.mkdirSync(paths.userDataDir);
    fs.writeFileSync(runStateFile(paths.userDataDir), 'not json');

    expect(() => resolveProject('arcane-ledger', paths)).toThrow(expect.not.objectContaining({ name: 'ProjectError' }));
  });
});

describe('inProject', () => {
  test("works in the project's root, with its .pdt directory as the project's", () => {
    const paths = { cwd: '/elsewhere', userConfigDir: '/c', userDataDir: '/d', pdtConfigDir: undefined };

    expect(inProject(paths, '/work/ledger')).toEqual({
      cwd: '/work/ledger',
      userConfigDir: '/c',
      userDataDir: '/d',
      pdtConfigDir: path.join('/work/ledger', '.pdt'),
    });
  });
});
