import Compendium from './Compendium';
import { ClassicLevel } from 'classic-level';

class CompendiumLevelDB extends Compendium {
  constructor() {
    super();
  }

  static {
    Compendium.registeredDBTypes.add(this);
  }

  static async probe(path: string): Promise<typeof Compendium | undefined> {
    let returnType: typeof CompendiumLevelDB | undefined = undefined;
    try {
      const db = new ClassicLevel(path, { createIfMissing: false });
      await db.open();
      returnType = CompendiumLevelDB;
      db.close();
    } catch (e) {
      returnType = undefined;
    }
    return returnType;
  }
}

export default CompendiumLevelDB;
