import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  forgetRunningVtt,
  isPdtProject,
  pruneProjects,
  readRunState,
  recordRunningVtt,
  registeredProject,
  registerProject,
  RUN_STATE_FILENAME,
  runningVtt,
  runStateFile,
  unregisterProject,
  writeRunState,
} from '@util/run-state.js';

describe('run state', () => {
  let sandbox: string;
  let file: string;

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-run-state-'));
    file = runStateFile(path.join(sandbox, 'data'));
  });

  afterEach(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  test('is kept in run.state.json', () => {
    expect(RUN_STATE_FILENAME).toBe('run.state.json');
    expect(runStateFile('/some/dir')).toBe(path.join('/some/dir', 'run.state.json'));
  });

  describe('readRunState', () => {
    test('is empty when there is no file', () => {
      expect(readRunState(file)).toEqual({});
    });

    test('is what was written, including anything pdt does not read', () => {
      const state = { PROJECTS: { a: { root: '/a', extra: true } }, OTHER: [1] };
      writeRunState(file, state);

      expect(readRunState(file)).toEqual(state);
    });

    test('fails, naming the file, when it is not JSON', () => {
      fs.mkdirSync(path.dirname(file));
      fs.writeFileSync(file, '{');

      expect(() => readRunState(file)).toThrow(file);
    });

    test.each([
      ['not an object', '[]'],
      ['a project without a root', '{"PROJECTS":{"a":{}}}'],
      ['PROJECTS that is not an object', '{"PROJECTS":3}'],
    ])('fails, naming the file, when it is %s', (_case, content) => {
      fs.mkdirSync(path.dirname(file));
      fs.writeFileSync(file, content);

      expect(() => readRunState(file)).toThrow(file);
    });
  });

  describe('registeredProject', () => {
    test('is the project registered with the id', () => {
      writeRunState(file, { PROJECTS: { a: { root: '/a' } } });

      expect(registeredProject(file, 'a')).toEqual({ root: '/a' });
    });

    test.each(['b', 'toString', '__proto__'])('is nothing for an id that is not registered: %s', id => {
      writeRunState(file, { PROJECTS: { a: { root: '/a' } } });

      expect(registeredProject(file, id)).toBeUndefined();
    });

    test('is nothing when there is no run state', () => {
      expect(registeredProject(file, 'a')).toBeUndefined();
    });
  });

  describe('registerProject', () => {
    test('creates the run state, and its directory, if there is none', () => {
      registerProject(file, 'a', '/a');

      expect(readRunState(file)).toEqual({ PROJECTS: { a: { root: '/a' } } });
    });

    test('keeps the other projects and everything else', () => {
      writeRunState(file, { PROJECTS: { a: { root: '/a' } }, OTHER: 1 });

      registerProject(file, 'b', '/b');

      expect(readRunState(file)).toEqual({ PROJECTS: { a: { root: '/a' }, b: { root: '/b' } }, OTHER: 1 });
    });
  });

  describe('unregisterProject', () => {
    test('removes every registration of the root, and nothing else', () => {
      writeRunState(file, { PROJECTS: { a: { root: '/a' }, b: { root: '/b' }, c: { root: '/a/' } }, OTHER: 1 });

      expect(unregisterProject(file, '/a')).toEqual(['a', 'c']);
      expect(readRunState(file)).toEqual({ PROJECTS: { b: { root: '/b' } }, OTHER: 1 });
    });

    test('writes nothing when the root is not registered', () => {
      expect(unregisterProject(file, '/a')).toEqual([]);
      expect(fs.existsSync(file)).toBe(false);
    });
  });

  describe('isPdtProject', () => {
    test('is whether the directory holds a .pdt directory', () => {
      const project = path.join(sandbox, 'project');
      fs.mkdirSync(project);
      expect(isPdtProject(project)).toBe(false);

      fs.writeFileSync(path.join(project, '.pdt'), 'a file, not a directory');
      expect(isPdtProject(project)).toBe(false);

      fs.rmSync(path.join(project, '.pdt'));
      fs.mkdirSync(path.join(project, '.pdt'));
      expect(isPdtProject(project)).toBe(true);
    });

    test('is false for a directory that does not exist', () => {
      expect(isPdtProject(path.join(sandbox, 'gone'))).toBe(false);
    });
  });

  describe('pruneProjects', () => {
    test('removes the projects whose root is no longer a pdt project, keeping the rest', () => {
      const live = path.join(sandbox, 'live');
      const bare = path.join(sandbox, 'bare');
      fs.mkdirSync(path.join(live, '.pdt'), { recursive: true });
      fs.mkdirSync(bare);
      const gone = path.join(sandbox, 'gone');
      writeRunState(file, {
        PROJECTS: { live: { root: live }, bare: { root: bare }, gone: { root: gone } },
        OTHER: 1,
      });

      expect(pruneProjects(file)).toEqual([
        ['bare', { root: bare }],
        ['gone', { root: gone }],
      ]);
      expect(readRunState(file)).toEqual({ PROJECTS: { live: { root: live } }, OTHER: 1 });
    });

    test('writes nothing when there is nothing to prune', () => {
      expect(pruneProjects(file)).toEqual([]);
      expect(fs.existsSync(file)).toBe(false);
    });
  });

  describe('running VTTs', () => {
    const RUNNING = { id: 'abc', name: 'pdt-mod', port: 30000, url: 'http://localhost:30000', started: 'now' };

    test('are recorded by name, keeping what else the run state holds', () => {
      writeRunState(file, { PROJECTS: { mod: { root: '/x' } } });

      recordRunningVtt(file, 'mod', RUNNING);

      expect(readRunState(file)).toEqual({ PROJECTS: { mod: { root: '/x' } }, VTT: { mod: RUNNING } });
      expect(runningVtt(file, 'mod')).toEqual(RUNNING);
    });

    test('are not found when they are not recorded, or there is no run state', () => {
      expect(runningVtt(file, 'mod')).toBeUndefined();
      recordRunningVtt(file, 'other', RUNNING);
      expect(runningVtt(file, 'mod')).toBeUndefined();
      expect(runningVtt(file, 'toString')).toBeUndefined();
    });

    test('are forgotten by name, keeping the others', () => {
      recordRunningVtt(file, 'mod', RUNNING);
      recordRunningVtt(file, 'other', RUNNING);

      forgetRunningVtt(file, 'mod');

      expect(readRunState(file)).toEqual({ VTT: { other: RUNNING } });
    });

    test('that are not recorded are forgotten without writing anything', () => {
      forgetRunningVtt(file, 'mod');
      expect(fs.existsSync(file)).toBe(false);

      writeRunState(file, { VTT: {} });
      const before = fs.statSync(file).mtimeMs;
      forgetRunningVtt(file, 'mod');
      expect(fs.statSync(file).mtimeMs).toBe(before);
    });

    test('make a run state invalid when their record is incomplete', () => {
      writeRunState(file, { VTT: { mod: { id: 'abc' } } } as never);

      expect(() => readRunState(file)).toThrow(/VTT\.mod\.name/);
    });
  });
});
