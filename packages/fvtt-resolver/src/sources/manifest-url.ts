/**
 * Manifest URLs: a release read from a URL declared for the package, in a relationship's
 * `manifest` or by the caller. Such a URL describes the newest release, so this gives one release
 * of each, already loaded, and no history.
 */
import { normaliseManifest } from '../manifest/normalise.js';
import { packageKey } from '../universe.js';

import type { Release } from '../release.js';
import type { HttpClient } from './http.js';
import type { ReleaseSource, SourceGap, SourceHints } from './types.js';

const ONE_HOUR = 60 * 60 * 1000;

/** Reads the releases the declared manifest URLs describe. URLs that other sources listed are not read. */
export function manifestUrlSource(http: HttpClient): ReleaseSource {
  const name = 'manifest-url';
  return {
    name,
    async releases(ref, hints: SourceHints = { declared: [], seen: [] }) {
      if (ref.type === 'world') return { ok: true, value: [] };
      const found = new Map<string, Release>();
      let gap: SourceGap | undefined;
      for (const url of new Set(hints.declared)) {
        const fetched = await http.getJson(url, { maxAge: ONE_HOUR });
        const read = fetched.ok ? normaliseManifest(fetched.value, { origin: url, type: ref.type }) : undefined;
        if (read?.ok === true && read.release.package.id === ref.id) {
          found.set(read.release.version, { ...read.release, manifest: read.release.manifest ?? url });
        } else {
          gap ??= fetched.ok
            ? { source: name, url, reason: 'invalid', package: packageKey(ref) }
            : { ...fetched.gap, source: name, package: packageKey(ref) };
        }
      }
      return found.size === 0 && gap !== undefined ? { ok: false, gap } : { ok: true, value: [...found.values()] };
    },
  };
}
