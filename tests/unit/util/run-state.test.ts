import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  readRunState,
  registeredProject,
  registerProject,
  RUN_STATE_FILENAME,
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
});
