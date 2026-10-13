import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import Compendium from '@lib/Compendium.js';
import CompendiumDoc from '@lib/CompendiumDoc.js';
// Importing the LevelDB type registers it with Compendium.
import CompendiumLevelDB from '@lib/CompendiumLevelDB.js';

describe('Compendium', () => {
  let workdir: string;
  let levelDbPath: string;
  let packData: string;

  beforeAll(async () => {
    // Work on a copy: opening a LevelDB database rewrites its lock and log files.
    workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdt-compendium-'));
    await fs.cp(__TEST_DATA__, workdir, { recursive: true });
    levelDbPath = path.join(workdir, 'leveldb');
    packData = path.join(workdir, 'packdata');
  });

  afterAll(async () => {
    await fs.rm(workdir, { recursive: true, force: true });
  });

  test('starts with no documents', () => {
    expect(new Compendium().docs).toEqual([]);
  });

  describe('probe', () => {
    test('identifies a LevelDB compendium', async () => {
      await expect(Compendium.probe(levelDbPath)).resolves.toBe(CompendiumLevelDB);
    });

    test('is undefined for a file that is not a compendium database', async () => {
      await expect(Compendium.probe(path.join(workdir, 'compendium'))).resolves.toBeUndefined();
    });

    test('is undefined for a directory that is not a compendium database', async () => {
      await expect(Compendium.probe(packData)).resolves.toBeUndefined();
    });

    test('is undefined for a path that does not exist', async () => {
      await expect(Compendium.probe(path.join(workdir, 'doesnotexist'))).resolves.toBeUndefined();
    });

    // Regression: probing used to make LevelDB create the path and write lock and log files into it.
    test('does not create anything at a path that does not exist', async () => {
      const missing = path.join(workdir, 'never-created');

      await Compendium.probe(missing);

      await expect(fs.access(missing)).rejects.toThrow();
    });

    test('does not write into a directory that is not a compendium database', async () => {
      const before = await fs.readdir(packData);

      await Compendium.probe(packData);

      await expect(fs.readdir(packData)).resolves.toEqual(before);
    });
  });

  describe('byPath', () => {
    test('returns a compendium of the type found at the path', async () => {
      await expect(Compendium.byPath(levelDbPath)).resolves.toBeInstanceOf(CompendiumLevelDB);
    });

    test('rejects a path that is not a compendium, naming it', async () => {
      const badPath = path.join(workdir, 'doesnotexist');

      await expect(Compendium.byPath(badPath)).rejects.toThrow(`${badPath} is not a recognised Compendium database`);
    });
  });

  describe('import', () => {
    test('adds one document for a single source file', async () => {
      const compendium = await Compendium.byPath(levelDbPath);

      await compendium.import(path.join(packData, 'single.json'));

      expect(compendium.docs).toHaveLength(1);
      expect(compendium.docs[0]).toBeInstanceOf(CompendiumDoc);
    });

    test('adds one document for each source file in a list', async () => {
      const compendium = await Compendium.byPath(levelDbPath);

      await compendium.import([path.join(packData, 'item_one.json'), path.join(packData, 'item_two.json')]);

      expect(compendium.docs).toHaveLength(2);
    });

    test('adds one document for each file matching a wildcard', async () => {
      const compendium = await Compendium.byPath(levelDbPath);

      await compendium.import([path.join(packData, 'item_*.json')]);

      expect(compendium.docs).toHaveLength(2);
    });

    test('adds nothing when no file matches', async () => {
      const compendium = await Compendium.byPath(levelDbPath);

      await compendium.import(path.join(packData, 'no_such_*.json'));

      expect(compendium.docs).toEqual([]);
    });

    test('adds to the documents already imported', async () => {
      const compendium = await Compendium.byPath(levelDbPath);

      await compendium.import(path.join(packData, 'single.json'));
      await compendium.import(path.join(packData, 'item_*.json'));

      expect(compendium.docs).toHaveLength(3);
    });

    test.todo('reads the content of each source file into its document');
  });

  describe('export', () => {
    test('accepts a target and resolves', async () => {
      const compendium = await Compendium.byPath(levelDbPath);

      await expect(compendium.export(path.join(workdir, 'out'))).resolves.toBeUndefined();
    });

    test.todo('writes each document to the target path');
  });
});
