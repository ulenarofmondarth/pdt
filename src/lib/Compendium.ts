import fg from 'fast-glob';
import CompendiumDoc from '@lib/CompendiumDoc.js';
import { m } from '@i18n/messages.js';

/**
 * A compendium pack: its database, and the documents in it.
 *
 * Each kind of database has a subclass. To open the compendium at a path without knowing its kind,
 * use {@link lib/compendiums.openCompendium | openCompendium}.
 */
export default abstract class Compendium {
  #docs: Array<CompendiumDoc> = [];

  /**
   * @param path - Where the compendium's database is
   */
  constructor(readonly path: string) {}

  get docs() {
    return this.#docs;
  }

  /**
   * Exports the content of the Compendium to the specified target path. Not supported yet.
   *
   * @param targets - the target path patterns
   * @throws Always, until exporting is built
   */
  async export(targets: string | Iterable<string>): Promise<void> {
    const list = typeof targets === 'string' ? [targets] : [...targets];
    throw new Error(m['error.compendium.exportUnsupported']({ path: this.path, targets: list.join(', ') }));
  }

  /**
   * Imports the sources from the specified source paths
   *
   * @param sources - the source path patterns; absolute, or relative to `cwd`
   * @param cwd - the directory relative patterns are matched in
   */
  async import(sources: string | Iterable<string>, cwd: string): Promise<void> {
    const patterns = typeof sources === 'string' ? [sources] : [...sources];

    const entries = await fg.glob(patterns, { cwd });

    // One document per matching file. Reading the file into the document is still to be done.
    this.#docs.push(...entries.map(() => new CompendiumDoc()));
  }
}
