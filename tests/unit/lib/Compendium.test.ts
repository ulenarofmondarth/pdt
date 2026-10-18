import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import Compendium from '@lib/Compendium.js';
import CompendiumDoc from '@lib/CompendiumDoc.js';
import { m } from '@i18n/messages.js';

/** The behaviour every compendium type shares. */
class TestCompendium extends Compendium {}

describe('Compendium', () => {
  let workdir: string;
  let packData: string;
  let compendium: Compendium;

  beforeAll(async () => {
    workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdt-compendium-'));
    await fs.cp(__TEST_DATA__, workdir, { recursive: true });
    packData = path.join(workdir, 'packdata');
  });

  afterAll(async () => {
    await fs.rm(workdir, { recursive: true, force: true });
  });

  function open(): Compendium {
    compendium = new TestCompendium(path.join(workdir, 'leveldb'));
    return compendium;
  }

  test('knows where its database is', () => {
    expect(open().path).toBe(path.join(workdir, 'leveldb'));
  });

  test('starts with no documents', () => {
    expect(open().docs).toEqual([]);
  });

  describe('import', () => {
    test('adds one document for a single source file', async () => {
      await open().import(path.join(packData, 'single.json'), workdir);

      expect(compendium.docs).toHaveLength(1);
      expect(compendium.docs[0]).toBeInstanceOf(CompendiumDoc);
    });

    test('adds one document for each source file in a list', async () => {
      await open().import([path.join(packData, 'item_one.json'), path.join(packData, 'item_two.json')], workdir);

      expect(compendium.docs).toHaveLength(2);
    });

    test('adds one document for each file matching a wildcard', async () => {
      await open().import([path.join(packData, 'item_*.json')], workdir);

      expect(compendium.docs).toHaveLength(2);
    });

    // Regression guard: relative patterns were matched against the process's working directory.
    test('matches relative patterns in the directory it is given', async () => {
      await open().import('item_*.json', packData);

      expect(compendium.docs).toHaveLength(2);
    });

    test('matches nothing for a relative pattern in a directory without such files', async () => {
      await open().import('item_*.json', workdir);

      expect(compendium.docs).toEqual([]);
    });

    test('adds nothing when no file matches', async () => {
      await open().import(path.join(packData, 'no_such_*.json'), workdir);

      expect(compendium.docs).toEqual([]);
    });

    test('adds to the documents already imported', async () => {
      await open().import(path.join(packData, 'single.json'), workdir);
      await compendium.import('item_*.json', packData);

      expect(compendium.docs).toHaveLength(3);
    });

    test.todo('reads the content of each source file into its document');
  });

  describe('export', () => {
    // Not built yet; saying so is better than reporting an export that did not happen.
    test('is not supported yet, and says so', async () => {
      const target = path.join(workdir, 'out');

      await expect(open().export(target)).rejects.toThrow(
        m['error.compendium.exportUnsupported']({ path: path.join(workdir, 'leveldb'), targets: target }),
      );
      await expect(fs.access(target)).rejects.toThrow();
    });

    test('names every target it was given', async () => {
      await expect(open().export(['one', 'two'])).rejects.toThrow('one, two');
    });

    test.todo('writes each document to the target path');
  });
});
