import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import PDT from '@/constants.js';
import { findConfig, searchBoundary } from '@util/runtime-config.js';
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

describe('user data directory', () => {
  let sandbox: string;

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-rtc-'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  /** The directory is worked out as the module loads, so each test loads it afresh. */
  async function loadPfs() {
    vi.resetModules();
    return (await import('@util/runtime-config.js')).pfs;
  }

  test('uses APPDATA when it is set', async () => {
    vi.stubEnv('APPDATA', path.join(sandbox, 'AppData'));

    const pfs = await loadPfs();

    expect(pfs.userDataDir).toBe(path.join(sandbox, 'AppData', PDT.PROGRAM_NAME));
  });

  test.runIf(process.platform === 'linux')('is under ~/.local/share on Linux', async () => {
    vi.stubEnv('APPDATA', '');
    vi.stubEnv('HOME', sandbox);

    const pfs = await loadPfs();

    expect(pfs.userDataDir).toBe(path.join(sandbox, '.local', 'share', PDT.PROGRAM_NAME));
  });

  test('is created if it does not exist', async () => {
    vi.stubEnv('APPDATA', path.join(sandbox, 'fresh'));

    const pfs = await loadPfs();

    expect(fs.statSync(pfs.userDataDir).isDirectory()).toBe(true);
  });

  test('is left alone if it already exists', async () => {
    const existing = path.join(sandbox, 'AppData', PDT.PROGRAM_NAME);
    fs.mkdirSync(existing, { recursive: true });
    fs.writeFileSync(path.join(existing, 'keep.txt'), 'existing data');
    vi.stubEnv('APPDATA', path.join(sandbox, 'AppData'));

    await loadPfs();

    expect(fs.readdirSync(existing)).toEqual(['keep.txt']);
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
