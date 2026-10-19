/**
 * Keeps the files in a project's `.pdt` directory that belong to one user, on one machine, out of
 * the project's git repository: its secrets above all, but also its run state and its log.
 */
import fs from 'node:fs';
import path from 'node:path';
import PDT from '@/constants.js';

/** The project's `.gitignore`, relative to its root. */
export const GITIGNORE = '.gitignore';

/** A `.gitignore` line as a path from the root: without spaces around it, a leading `/`, or a trailing `/`. */
function asPath(line: string): string {
  return line.trim().replace(/^\//, '').replace(/\/$/, '');
}

/**
 * Add the files `names`, in the project's `.pdt` directory, to the project's `.gitignore`, creating
 * it if there is none. A file the `.gitignore` already names, or whose `.pdt` directory it names, is
 * left out; patterns that would match it are not looked into.
 *
 * @param root - The project's root directory
 * @param names - The names of the files in `.pdt`
 * @returns The lines added, such as `.pdt/secrets.conf`
 */
export function ignoreProjectFiles(root: string, names: readonly string[]): string[] {
  const file = path.join(root, GITIGNORE);
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const ignored = new Set(text.split(/\r?\n/).map(asPath));
  if (ignored.has(PDT.PROJECT_RTD_DIR_NAME)) return [];

  const added = names
    .map(name => `${PDT.PROJECT_RTD_DIR_NAME}/${name}`)
    .filter(entry => !ignored.has(entry))
    .filter((entry, index, all) => all.indexOf(entry) === index);
  if (added.length === 0) return added;

  const separator = text === '' || text.endsWith('\n') ? '' : '\n';
  fs.writeFileSync(file, `${text}${separator}${added.join('\n')}\n`);
  return added;
}
