import fs from 'node:fs/promises';
import nodePath from 'node:path';
import Compendium from './Compendium.js';
import { ClassicLevel } from 'classic-level';

class CompendiumLevelDB extends Compendium {
  constructor() {
    super();
  }

  static {
    Compendium.registeredDBTypes.add(this);
  }

  static override async probe(path: string): Promise<typeof Compendium | undefined> {
    let returnType: typeof CompendiumLevelDB | undefined = undefined;

    // Every LevelDB database has a CURRENT file. Check for it before opening anything: merely
    // opening a path makes LevelDB create the directory and write lock and log files into it.
    try {
      await fs.access(nodePath.join(path, 'CURRENT'));
    } catch {
      return undefined;
    }

    try {
      const db = new ClassicLevel(path, { createIfMissing: false });
      await db.open();
      returnType = CompendiumLevelDB;
      await db.close();
    } catch (
      e // eslint-disable-line @typescript-eslint/no-unused-vars
    ) {
      returnType = undefined;
    }
    return returnType;
  }
}

export default CompendiumLevelDB;
