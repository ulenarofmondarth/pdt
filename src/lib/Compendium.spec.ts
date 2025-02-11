import { describe, test, expect } from '@jest/globals';
import Compendium from './Compendium';
import CompendiumLevelDB from './CompendiumLevelDB';
import CompendiumDoc from './CompendiumDoc';

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

    await expect(Compendium.probe(path)).resolves.toEqual(expected);
  });

  test('probe returns undefined if path is not a recognised compendium database', async () => {
    const path = `${__TEST_DATA__}/compendium`;
    const expected = undefined;

    await expect(Compendium.probe(path)).resolves.toEqual(expected);
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
      const sourcePath: string = '';
      const compendium: Compendium = await Compendium.byPath(compendiumPath);

      compendium.import(sourcePath);

      expect([...compendium.docs].length).toBeGreaterThan(0);
    });

    test('imports a multiple sources', async () => {
      const compendium_path: string = `${__TEST_DATA__}/leveldb`;
      const source_paths: Array<string> = ['', ''];
      const compendium: Compendium = await Compendium.byPath(compendium_path);

      compendium.import(source_paths);

      expect([...compendium.docs].length).toBeGreaterThan(1);
    });
  }); // ...Compendium import
}); // ...Compendium
