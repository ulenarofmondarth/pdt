import { describe, test, expect } from 'vitest';
import Compendium from '@lib/Compendium.js';
import CompendiumLevelDB from '@lib/CompendiumLevelDB.js';
import CompendiumDoc from '@lib/CompendiumDoc.js';

describe('Compendium', () => {
  test('contains a collection of compendium documents', () => {
    const compendium: Compendium = new Compendium();
    const docs: Iterable<CompendiumDoc> = compendium.docs;

    const doc_array = [...docs];

    expect(doc_array.length).toEqual(doc_array.filter(x => x instanceof CompendiumDoc).length);
  });

  test('probe returns a class for pack database at path', async () => {
    const path = `${__TEST_DATA__}/leveldb`;
    const expected = CompendiumLevelDB;

    return expect(Compendium.probe(path)).resolves.toEqual(expected);
  });

  test('probe returns undefined if path is not a recognised compendium database', async () => {
    const path = `${__TEST_DATA__}/compendium`;
    const expected = undefined;

    return expect(Compendium.probe(path)).resolves.toEqual(expected);
  });

  test('returns compendium converter given path', async () => {
    const path: string = `${__TEST_DATA__}/leveldb`;
    const converter: Compendium = await Compendium.byPath(path);

    expect(converter).toMatchObject({
      import: expect.any(Function),
      export: expect.any(Function),
    });
  });

  test('throws error if path not a Compendium', () => {
    const path = `${__TEST_DATA__}/doesnotexist`;

    return expect(Compendium.byPath(path)).rejects.toMatchObject({
      message: expect.stringContaining('not a recognised Compendium database'),
    });
  });

  describe('Compendium import', () => {
    test('imports a single source', async () => {
      const compendiumPath: string = `${__TEST_DATA__}/leveldb`;
      const sourcePath: string = `${__TEST_DATA__}/packdata/single.json`;
      const compendium: Compendium = await Compendium.byPath(compendiumPath);

      await compendium.import(sourcePath);

      expect([...compendium.docs].length).toBeGreaterThan(0);
    });

    test('imports multiple sources', async () => {
      const compendium_path: string = `${__TEST_DATA__}/leveldb`;
      const source_paths: Array<string> = [
        `${__TEST_DATA__}/packdata/item_one.json`,
        `${__TEST_DATA__}/packdata/item_two.json`,
      ];
      const compendium: Compendium = await Compendium.byPath(compendium_path);

      await compendium.import(source_paths);

      expect([...compendium.docs].length).toBeGreaterThan(1);
    });

    test('imports multiple sources by wildcard', async () => {
      const compendium_path: string = `${__TEST_DATA__}/leveldb`;
      const source_paths: Array<string> = [`${__TEST_DATA__}/packdata/item_*.json`];
      const compendium: Compendium = await Compendium.byPath(compendium_path);

      await compendium.import(source_paths);

      expect([...compendium.docs].length).toBeGreaterThan(1);
    });
  }); // ...Compendium import
}); // ...Compendium
