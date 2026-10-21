/**
 * Which Foundry VTT builds have an image to run them in, as core limits for the resolver.
 *
 * pdt runs Foundry VTT in a container from an image tagged with the core version (`14.368`), by
 * default felddy/foundryvtt, and not every build has one. Docker Hub lists an image's tags; the
 * list holds thousands, mostly of other builds of the image (`sha-…`, `latest`, `14.368.0`), so it
 * is read a generation at a time, filtered by name, and only the tags that are exactly a release's
 * version count. Each build then has one tag or none, and a build with none is a core limit.
 */
import { z } from 'zod/v4';

import type { CoreLimit, CoreRelease } from '@mondarth/fvtt-resolver';
import type { HttpClient, SourceGap } from '@mondarth/fvtt-resolver/sources';

/** Docker Hub's API, where image tags are listed. */
export const DOCKER_HUB_API = 'https://hub.docker.com/v2';

const ONE_DAY = 24 * 60 * 60 * 1000;

/** The most pages of tags read for one generation: far more than any has. */
const MAX_PAGES = 10;

const tagsSchema = z.object({
  next: z.string().nullish(),
  results: z.array(z.object({ name: z.string() })),
});

export interface ImageLimitsOptions {
  /** The image, without a tag, as Docker names it: `felddy/foundryvtt`, or `ubuntu` for an official image. */
  readonly image: string;
  /** Why a build without an image cannot be run, in the user's language. */
  readonly reason: (version: string, image: string) => string;
}

export interface ImageLimits {
  /** The builds with no image, each with its reason. */
  readonly limits: CoreLimit[];
  /** The generations whose tags could not be listed. Their builds are not limited, since it is not known. */
  readonly gaps: SourceGap[];
}

/** The URL of the first page of an image's tags whose names contain `name`. */
export function tagsUrl(image: string, name: string): string {
  // Official images are in the `library` namespace.
  const repository = image.includes('/') ? image : `library/${image}`;
  return `${DOCKER_HUB_API}/repositories/${repository}/tags?page_size=100&name=${encodeURIComponent(name)}`;
}

/** The names of an image's tags that contain `name`, following the pages, or the gap met. */
async function tagNames(http: HttpClient, image: string, name: string): Promise<string[] | SourceGap> {
  const names: string[] = [];
  let url: string | null | undefined = tagsUrl(image, name);
  for (let page = 0; url !== null && url !== undefined && page < MAX_PAGES; page++) {
    const fetched = await http.getJson(url, { maxAge: ONE_DAY, staleIfError: 7 * ONE_DAY });
    if (!fetched.ok) return { ...fetched.gap, source: 'docker-hub' };
    const read = tagsSchema.safeParse(fetched.value);
    if (!read.success) return { source: 'docker-hub', url, reason: 'invalid' };
    names.push(...read.data.results.map(tag => tag.name));
    url = read.data.next;
  }
  return names;
}

/** The core limits for the builds of `core` that have no image, from the image's tags on Docker Hub. */
export async function imageCoreLimits(
  http: HttpClient,
  core: readonly CoreRelease[],
  { image, reason }: ImageLimitsOptions,
): Promise<ImageLimits> {
  const limits: CoreLimit[] = [];
  const gaps: SourceGap[] = [];
  const generations = [...new Set(core.map(release => release.generation))];
  const tagged = await Promise.all(generations.map(generation => tagNames(http, image, `${generation}.`)));
  for (const [i, generation] of generations.entries()) {
    const names = tagged[i] as string[] | SourceGap;
    if (!Array.isArray(names)) {
      gaps.push(names);
      continue;
    }
    const imaged = new Set(names);
    for (const { version } of core.filter(release => release.generation === generation)) {
      if (!imaged.has(version)) limits.push({ version, reason: reason(version, image) });
    }
  }
  return { limits, gaps };
}
