import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import PDT from '@/constants.js';
import { findConfig, searchBoundary } from './runtime-config.js';

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
