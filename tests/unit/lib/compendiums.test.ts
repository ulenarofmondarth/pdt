import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import Compendium from '@lib/Compendium.js';
import CompendiumLevelDB from '@lib/CompendiumLevelDB.js';
import { COMPENDIUM_TYPES, openCompendium, probeCompendium, type CompendiumType } from '@lib/compendiums.js';
import { m } from '@i18n/messages.js';

/** A compendium type that recognises whatever `recognises` says. */
function fakeType(recognises: (path: string) => boolean) {
  return class FakeCompendium extends Compendium {
    static probe = vi.fn(async (path: string) => recognises(path));
  } satisfies CompendiumType;
}

describe('compendium types', () => {
  let workdir: string;
  let levelDbPath: string;
  let packData: string;

  beforeAll(async () => {
    // Work on a copy: opening a LevelDB database rewrites its lock and log files.
    workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdt-compendiums-'));
    await fs.cp(__TEST_DATA__, workdir, { recursive: true });
    levelDbPath = path.join(workdir, 'leveldb');
    packData = path.join(workdir, 'packdata');
  });

  afterAll(async () => {
    await fs.rm(workdir, { recursive: true, force: true });
  });

  // Regression guard: types used to register themselves as they were imported, so whether a
  // LevelDB compendium was recognised depended on what else had been imported.
  test('are listed, LevelDB among them', () => {
    expect(COMPENDIUM_TYPES).toContain(CompendiumLevelDB);
  });

  describe('probeCompendium', () => {
    test('identifies a LevelDB compendium', async () => {
      await expect(probeCompendium(levelDbPath)).resolves.toBe(CompendiumLevelDB);
    });

    test.each([
      ['a file that is not a compendium database', 'compendium'],
      ['a directory that is not a compendium database', 'packdata'],
      ['a path that does not exist', 'doesnotexist'],
    ])('is undefined for %s', async (_case, name) => {
      await expect(probeCompendium(path.join(workdir, name))).resolves.toBeUndefined();
    });

    // Regression: probing used to make LevelDB create the path and write lock and log files into it.
    test('does not create anything at a path that does not exist', async () => {
      const missing = path.join(workdir, 'never-created');

      await probeCompendium(missing);

      await expect(fs.access(missing)).rejects.toThrow();
    });

    test('does not write into a directory that is not a compendium database', async () => {
      const before = await fs.readdir(packData);

      await probeCompendium(packData);

      await expect(fs.readdir(packData)).resolves.toEqual(before);
    });

    test('tries the types it is given, in order, and stops at the first that recognises the path', async () => {
      const no = fakeType(() => false);
      const yes = fakeType(() => true);
      const later = fakeType(() => true);

      await expect(probeCompendium('/some/pack', [no, yes, later])).resolves.toBe(yes);

      expect(no.probe).toHaveBeenCalledExactlyOnceWith('/some/pack');
      expect(later.probe).not.toHaveBeenCalled();
    });
  });

  describe('openCompendium', () => {
    test('opens the compendium at the path, as the type found there', async () => {
      const compendium = await openCompendium(levelDbPath);

      expect(compendium).toBeInstanceOf(CompendiumLevelDB);
      expect(compendium.path).toBe(levelDbPath);
    });

    test('opens with the types it is given', async () => {
      const yes = fakeType(() => true);

      await expect(openCompendium('/some/pack', [yes])).resolves.toBeInstanceOf(yes);
    });

    test('rejects a path that is not a compendium, naming it', async () => {
      const badPath = path.join(workdir, 'doesnotexist');

      await expect(openCompendium(badPath)).rejects.toThrow(m['error.compendium.notRecognised']({ path: badPath }));
    });
  });
});
