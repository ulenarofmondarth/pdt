/**
 * The sources' cache: where what was fetched is kept, with what is needed to revalidate it.
 *
 * Storage is the caller's: pdt keeps it under its user data directory, a browser tool might use
 * IndexedDB, a test passes {@link memoryCache}.
 */

/** A value fetched, and when and with what ETag it was stored. */
export interface CacheEntry {
  /** The value, as parsed from JSON. */
  readonly value: unknown;
  /** The server's ETag, to revalidate with. */
  readonly etag?: string;
  /** When it was stored or last revalidated, in milliseconds since the epoch. */
  readonly storedAt: number;
}

export interface Cache {
  get(key: string): Promise<CacheEntry | undefined>;
  set(key: string, entry: CacheEntry): Promise<void>;
}

/** A cache held in memory, for as long as the program runs. */
export function memoryCache(): Cache {
  const entries = new Map<string, CacheEntry>();
  return {
    get: key => Promise.resolve(entries.get(key)),
    set: (key, entry) => {
      entries.set(key, entry);
      return Promise.resolve();
    },
  };
}
