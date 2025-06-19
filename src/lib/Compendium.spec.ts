import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import Compendium from '@lib/Compendium.js';
import CompendiumLevelDB from '@lib/CompendiumLevelDB.js';
import CompendiumDoc from '@lib/CompendiumDoc.js';

let tempdir: string = '';

async function createTempDir() {
  const ostmpdir = os.tmpdir();
  const tmpdir = path.join(ostmpdir, 'unit-test');
  return await fs.mkdtemp(tmpdir);
}

describe('Compendium', () => {
  beforeAll(async () => {
    tempdir = await createTempDir();
    await fs.cp(__TEST_DATA__, tempdir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(tempdir, { recursive: true });
  });

  test('contains a collection of compendium documents', () => {
    const compendium: Compendium = new Compendium();
    const docs: Iterable<CompendiumDoc> = compendium.docs;

    const doc_array = [...docs];

    expect(doc_array.length).toEqual(doc_array.filter(x => x instanceof CompendiumDoc).length);
  });

  test('probe returns a class for pack database at path', async () => {
    const goodpath = path.join(tempdir, 'leveldb');
    const expected = CompendiumLevelDB;

    return expect(Compendium.probe(goodpath)).resolves.toEqual(expected);
  });

  test('probe returns undefined if path is not a recognised compendium database', async () => {
    const badpath = path.join(tempdir, 'compendium');
    const expected = undefined;

    return expect(Compendium.probe(badpath)).resolves.toEqual(expected);
  });

  test('returns compendium converter given path', async () => {
    const goodpath: string = path.join(tempdir, 'leveldb');
    const converter: Compendium = await Compendium.byPath(goodpath);

    expect(converter).toMatchObject({
      import: expect.any(Function),
      export: expect.any(Function),
    });
  });

  test('throws error if path not a Compendium', () => {
    const badpath = path.join(tempdir, 'doesnotexist');

    return expect(Compendium.byPath(badpath)).rejects.toMatchObject({
      message: expect.stringContaining('not a recognised Compendium database'),
    });
  });

  describe('Compendium import', () => {
    test('imports a single source', async () => {
      const compendiumPath: string = path.join(tempdir, 'leveldb');
      const sourcePath: string = path.join(tempdir, 'packdata/single.json');
      const compendium: Compendium = await Compendium.byPath(compendiumPath);

      await compendium.import(sourcePath);

      expect([...compendium.docs].length).toBeGreaterThan(0);
    });

    test('imports multiple sources', async () => {
      const compendium_path: string = path.join(tempdir, 'leveldb');
      const source_paths: Array<string> = [
        path.join(tempdir, 'packdata/item_one.json'),
        path.join(tempdir, 'packdata/item_two.json'),
      ];
      const compendium: Compendium = await Compendium.byPath(compendium_path);

      await compendium.import(source_paths);

      expect([...compendium.docs].length).toBeGreaterThan(1);
    });

    test('imports multiple sources by wildcard', async () => {
      const compendium_path: string = path.join(tempdir, 'leveldb');
      const source_paths: Array<string> = [path.join(tempdir, 'packdata/item_*.json')];
      const compendium: Compendium = await Compendium.byPath(compendium_path);

      await compendium.import(source_paths);

      expect([...compendium.docs].length).toBeGreaterThan(1);
    });
  }); // ...Compendium import
}); // ...Compendium
