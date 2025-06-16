import fg from 'fast-glob';
import CompendiumDoc from '@lib/CompendiumDoc.js';

export default class Compendium {
  protected static registeredDBTypes: Set<typeof Compendium> = new Set();

  #docs: Array<CompendiumDoc> = [];

  /**
   * return a Compendium found at the given path
   *
   * @param path - path to the compendiul database
   *
   * @return a Compendium appropriate to the database at ``path``
   */
  static async byPath(path: string): Promise<Compendium> {
    const dbType = await Compendium.probe(path);

    if (dbType == undefined) {
      return Promise.reject(new Error(`${path} is not a recognised Compendium database`));
    }

    return new dbType();
  }

  /**
   * Ruturns the class for the compendium detected at path
   *
   * @param path - Path to be tested
   *
   * @returns The class for the Compendium type of undefined
   */
  static async probe(path: string): Promise<typeof Compendium | undefined> {
    for (const dbType of this.registeredDBTypes) {
      if (typeof (await dbType.probe(path)) !== 'undefined') {
        return dbType;
      }
    }

    return undefined;
  }

  get docs() {
    return this.#docs;
  }

  /**
   * Exports the content of the Compendium to the specified target path
   *
   * @param targets - the source path patterns
   *
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async export(targets: string | Iterable<string>) {}

  /**
   * Imports the sources from the specified source paths
   *
   * @param sources - the source path patterns
   *
   */
  async import(sources: string | Iterable<string>) {
    if (typeof sources == 'string') {
      sources = [sources];
    }

    const entries = await fg.glob([...sources]);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const source of entries) {
      this.#docs.push(new CompendiumDoc());
    }
  }
} // ...Compendium
