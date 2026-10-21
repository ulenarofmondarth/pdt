/**
 * The resolver's cache on disk: what its sources fetched, kept between runs under pdt's user data
 * directory, so that a run asks Foundry VTT's servers, GitHub and Docker Hub only for what has
 * changed.
 *
 * Each entry is a JSON file named by a hash of its key. An entry that cannot be read is treated as
 * missing, so a damaged cache costs a fetch, never a failure.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { Cache, CacheEntry } from '@mondarth/fvtt-resolver/sources';

/** Where the resolver's cache is kept, under the user data directory. */
export function resolverCacheDir(userDataDir: string): string {
  return path.join(userDataDir, 'cache', 'resolver');
}

/** Whether something read from a cache file is an entry. */
function isEntry(read: unknown): read is CacheEntry {
  return (
    typeof read === 'object' &&
    read !== null &&
    'value' in read &&
    typeof (read as { storedAt?: unknown }).storedAt === 'number' &&
    ['undefined', 'string'].includes(typeof (read as { etag?: unknown }).etag)
  );
}

/** A cache whose entries are files in `dir`, made when first written to. */
export function diskCache(dir: string): Cache {
  let written = 0;
  const fileOf = (key: string) => path.join(dir, `${createHash('sha256').update(key).digest('hex')}.json`);
  return {
    async get(key) {
      try {
        const read: unknown = JSON.parse(await fs.readFile(fileOf(key), 'utf8'));
        return isEntry(read) ? read : undefined;
      } catch {
        return undefined;
      }
    },
    async set(key, entry) {
      await fs.mkdir(dir, { recursive: true });
      const file = fileOf(key);
      // Written beside it and renamed, so that a reader never sees half an entry.
      const partial = `${file}.${process.pid}.${++written}.tmp`;
      await fs.writeFile(partial, JSON.stringify(entry));
      await fs.rename(partial, file);
    },
  };
}
