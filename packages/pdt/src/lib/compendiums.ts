/**
 * The kinds of compendium database pdt knows, and opening a compendium without knowing its kind.
 *
 * This is apart from Compendium itself, which every kind extends: a module that both defined
 * Compendium and imported its subclasses would import itself in a circle.
 */
import Compendium from '@lib/Compendium.js';
import CompendiumLevelDB from '@lib/CompendiumLevelDB.js';
import { m } from '@i18n/messages.js';

/** A kind of compendium database: how to recognise one, and how to open it. */
export interface CompendiumType {
  /** Whether the database at `path` is of this kind. Must not change anything at `path`. */
  probe(path: string): Promise<boolean>;
  new (path: string): Compendium;
}

/** Every kind of compendium database pdt knows, in the order they are tried. */
export const COMPENDIUM_TYPES: readonly CompendiumType[] = [CompendiumLevelDB];

/**
 * The kind of compendium database at `path`.
 *
 * @param path - Path to be tested
 * @param types - The kinds to try, in order
 * @returns The first kind that recognises the database, or undefined if none does
 */
export async function probeCompendium(
  path: string,
  types: readonly CompendiumType[] = COMPENDIUM_TYPES,
): Promise<CompendiumType | undefined> {
  for (const type of types) {
    if (await type.probe(path)) return type;
  }
  return undefined;
}

/**
 * Open the compendium at `path`, as whichever kind of database is there.
 *
 * @param path - Where the compendium's database is
 * @param types - The kinds to try, in order
 * @throws {Error} When no kind recognises the database
 */
export async function openCompendium(
  path: string,
  types: readonly CompendiumType[] = COMPENDIUM_TYPES,
): Promise<Compendium> {
  const type = await probeCompendium(path, types);
  if (type === undefined) {
    throw new Error(m['error.compendium.notRecognised']({ path }));
  }
  return new type(path);
}
