/**
 * Extracting a package's zip as Foundry VTT does: the folder that holds the manifest (`module.json`
 * or `system.json`) is the package, wherever it is in the zip. Authors zip a package's files at the
 * top, or inside a folder of its id; either way only the package's own files are extracted.
 *
 * A zip comes from the network, so it is not trusted: entries that would land outside the target,
 * links, encrypted entries and zips that unpack to more than {@link MAX_UNPACKED} are refused.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';

import type { Entry, ZipFile } from 'yauzl';

/** The most a package's zip may unpack to. Real packages are far smaller. */
export const MAX_UNPACKED = 2 * 1024 ** 3;

/** Why a zip could not be extracted. */
export class ZipError extends Error {
  constructor(
    readonly code: 'no-manifest' | 'unsafe-entry' | 'encrypted' | 'too-large',
    readonly detail = '',
  ) {
    super(detail === '' ? code : `${code}: ${detail}`);
    this.name = 'ZipError';
  }
}

/** Every entry of a zip, read without extracting any. */
function entriesOf(zip: ZipFile): Promise<Entry[]> {
  return new Promise((resolve, reject) => {
    const entries: Entry[] = [];
    zip.on('entry', (entry: Entry) => {
      entries.push(entry);
      zip.readEntry();
    });
    zip.on('end', () => resolve(entries));
    zip.on('error', reject);
    zip.readEntry();
  });
}

/** Whether an entry is a symbolic link, by the Unix file mode some zips keep. */
const isLink = (entry: Entry) => ((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000;

/**
 * The entry of the package's manifest: the one nearest the top named `<type>.json`.
 *
 * @throws {ZipError} When there is none
 */
function manifestEntry(entries: readonly Entry[], type: 'module' | 'system'): Entry {
  const name = `${type}.json`;
  const found = entries
    .filter(entry => !entry.fileName.endsWith('/') && path.posix.basename(entry.fileName) === name)
    .sort((a, b) => a.fileName.split('/').length - b.fileName.split('/').length)[0];
  if (found === undefined) throw new ZipError('no-manifest', name);
  return found;
}

/**
 * Extracts the package in a zip into `target`, which must not exist yet, and returns its manifest.
 *
 * @throws {ZipError} When the zip holds no manifest, or anything unsafe
 * @throws When the zip cannot be read, or the files cannot be written
 */
export async function extractPackage(zipFile: string, type: 'module' | 'system', target: string): Promise<unknown> {
  const zip = await yauzl.openPromise(zipFile, { lazyEntries: true, autoClose: false });
  try {
    const entries = await entriesOf(zip);
    const manifest = manifestEntry(entries, type);
    const prefix = manifest.fileName.slice(0, manifest.fileName.length - path.posix.basename(manifest.fileName).length);
    const own = entries.filter(entry => entry.fileName.startsWith(prefix) && entry.fileName !== prefix);

    const unpacked = own.reduce((total, entry) => total + entry.uncompressedSize, 0);
    if (unpacked > MAX_UNPACKED) throw new ZipError('too-large', String(unpacked));

    fs.mkdirSync(target);
    for (const entry of own) {
      const relative = entry.fileName.slice(prefix.length);
      const destination = path.resolve(target, relative);
      // yauzl refuses absolute and `..` names; this holds whatever a name is.
      const inside = path.relative(target, destination);
      if (inside === '' || inside.startsWith('..') || path.isAbsolute(inside) || isLink(entry)) {
        throw new ZipError('unsafe-entry', entry.fileName);
      }
      if (entry.isEncrypted()) throw new ZipError('encrypted', entry.fileName);
      if (entry.fileName.endsWith('/')) {
        fs.mkdirSync(destination, { recursive: true });
        continue;
      }
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      await pipeline(await zip.openReadStreamPromise(entry), fs.createWriteStream(destination, { flags: 'wx' }));
    }
    return JSON.parse(fs.readFileSync(path.join(target, path.posix.basename(manifest.fileName)), 'utf8')) as unknown;
  } finally {
    zip.close();
  }
}
