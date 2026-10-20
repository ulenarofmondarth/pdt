import fs from 'node:fs/promises';
import nodePath from 'node:path';
import Compendium from './Compendium.js';
import { ClassicLevel } from 'classic-level';

/** A compendium in a LevelDB database, as Foundry VTT stores them. */
export default class CompendiumLevelDB extends Compendium {
  /**
   * Whether there is a LevelDB database at `path`. Changes nothing at `path`.
   *
   * @param path - Path to be tested
   */
  static async probe(path: string): Promise<boolean> {
    // Every LevelDB database has a CURRENT file. Check for it before opening anything: merely
    // opening a path makes LevelDB create the directory and write lock and log files into it.
    try {
      await fs.access(nodePath.join(path, 'CURRENT'));
    } catch {
      return false;
    }

    try {
      const db = new ClassicLevel(path, { createIfMissing: false });
      await db.open();
      await db.close();
      return true;
    } catch {
      return false;
    }
  }
}
