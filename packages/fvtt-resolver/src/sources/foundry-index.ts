/**
 * Foundry VTT's public package index: the source of every listed package's releases, premium
 * packages included.
 *
 * The index (`index-latest.json`) lists each package with the URL template of its details file;
 * the details file lists its versions, each with its core `minimum` and `verified` and its
 * manifest URL. These give listed releases; a release is loaded from its manifest when needed.
 * The source behaves as Foundry does: the index is kept for five minutes and revalidated with its
 * ETag, and a stale copy serves for up to a day when the site cannot be reached.
 */
import { z } from 'zod';

import { packageKey } from '../universe.js';

import type { Compatibility } from '../range/compatibility.js';
import type { PackageRef, Release } from '../release.js';
import type { HttpClient } from './http.js';
import type { ReleaseSource, SourceResult } from './types.js';

export const FOUNDRY_PACKAGE_INDEX = 'https://r2.foundryvtt.com/package-api-public/index-latest.json';

const FIVE_MINUTES = 5 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

const text = z.union([z.string(), z.number()]).transform(String);

const indexSchema = z.object({
  details: z.string(),
  packages: z.array(
    z.looseObject({
      id: z.string(),
      type: z.string(),
      last_updated: z.string().optional(),
      premium: z.boolean().optional(),
    }),
  ),
});

const detailsSchema = z.object({
  versions: z.array(z.unknown()),
});

const versionSchema = z.looseObject({
  version: text,
  manifest: z.string(),
  minimum: text.optional(),
  verified: text.optional(),
});

export interface FoundryIndexOptions {
  /** Where the index is; Foundry's own by default. */
  readonly indexUrl?: string;
}

/** A source of releases from Foundry VTT's public package index. */
export function foundryIndexSource(
  http: HttpClient,
  { indexUrl = FOUNDRY_PACKAGE_INDEX }: FoundryIndexOptions = {},
): ReleaseSource {
  const name = 'foundry-index';

  return {
    name,

    async releases(ref: PackageRef): Promise<SourceResult<Release[]>> {
      const key = packageKey(ref);
      const index = await http.getJson(indexUrl, { maxAge: FIVE_MINUTES, staleIfError: ONE_DAY });
      if (!index.ok) return { ok: false, gap: { ...index.gap, source: name, package: key } };
      const readIndex = indexSchema.safeParse(index.value);
      if (!readIndex.success)
        return { ok: false, gap: { source: name, url: indexUrl, reason: 'invalid', package: key } };

      const entry = readIndex.data.packages.find(p => p.id === ref.id && p.type === ref.type);
      if (entry === undefined) return { ok: true, value: [] };

      // The details change only when the package does, so they are kept under its last update.
      const url = readIndex.data.details.replace('{id}', encodeURIComponent(ref.id));
      const details = await http.getJson(url, { maxAge: Infinity, key: `${url}@${entry.last_updated ?? ''}` });
      if (!details.ok) return { ok: false, gap: { ...details.gap, source: name, package: key } };
      const readDetails = detailsSchema.safeParse(details.value);
      if (!readDetails.success) return { ok: false, gap: { source: name, url, reason: 'invalid', package: key } };

      const releases = readDetails.data.versions.flatMap((given): Release[] => {
        const version = versionSchema.safeParse(given);
        if (!version.success) return [];
        const { minimum, verified } = version.data;
        const listing: Compatibility = { ...(minimum && { minimum }), ...(verified && { verified }) };
        return [
          {
            package: ref,
            version: version.data.version,
            compatibility: listing,
            listing,
            relationships: { requires: [], systems: [], conflicts: [], recommends: [] },
            manifest: version.data.manifest,
            protected: entry.premium === true,
            origin: url,
            detail: 'listed',
          },
        ];
      });
      return { ok: true, value: releases };
    },
  };
}
