import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import Compendium from '@lib/Compendium.js';
import CompendiumLevelDB from '@lib/CompendiumLevelDB.js';

describe('CompendiumLevelDB', () => {
  let workdir: string;

  beforeAll(async () => {
    workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdt-leveldb-'));
    await fs.cp(__TEST_DATA__, workdir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(workdir, { recursive: true, force: true });
  });

  test('is a Compendium', () => {
    expect(new CompendiumLevelDB()).toBeInstanceOf(Compendium);
  });

  describe('probe', () => {
    test('recognises a LevelDB database', async () => {
      await expect(CompendiumLevelDB.probe(path.join(workdir, 'leveldb'))).resolves.toBe(CompendiumLevelDB);
    });

    test('can probe the same database twice, so it releases the database after each probe', async () => {
      const database = path.join(workdir, 'leveldb');

      await CompendiumLevelDB.probe(database);

      await expect(CompendiumLevelDB.probe(database)).resolves.toBe(CompendiumLevelDB);
    });

    test('does not recognise a directory holding only LevelDB lock and log files', async () => {
      await expect(CompendiumLevelDB.probe(path.join(workdir, 'leveldb5'))).resolves.toBeUndefined();
    });

    test('does not recognise a directory whose database files are corrupt', async () => {
      const corrupt = path.join(workdir, 'corrupt');
      await fs.mkdir(corrupt);
      await fs.writeFile(path.join(corrupt, 'CURRENT'), 'not a manifest\n');

      await expect(CompendiumLevelDB.probe(corrupt)).resolves.toBeUndefined();
    });

    test('does not recognise a plain file', async () => {
      await expect(CompendiumLevelDB.probe(path.join(workdir, 'compendium'))).resolves.toBeUndefined();
    });

    test('does not recognise a path that does not exist', async () => {
      await expect(CompendiumLevelDB.probe(path.join(workdir, 'missing'))).resolves.toBeUndefined();
    });
  });
});
