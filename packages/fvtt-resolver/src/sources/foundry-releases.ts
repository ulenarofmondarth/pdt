/**
 * Foundry VTT's core releases, from its release notes.
 *
 * Foundry has no public API for its builds: its own update check sends the licence. The release
 * notes page lists every build (`Release 14.368`) with its channel, so this reads that page. It is
 * HTML, written for people, so the reading fails loudly rather than guessing: a page with no builds
 * on it, or a build without a channel, is a gap, since either means the page has changed. The page
 * changes a few times a month, so it is kept for a day, and a stale copy serves for a week when the
 * site cannot be reached.
 */
import type { CoreChannel, CoreRelease } from '../universe.js';
import type { HttpClient } from './http.js';
import type { SourceResult } from './types.js';

export const FOUNDRY_RELEASE_NOTES = 'https://foundryvtt.com/releases/';

const ONE_DAY = 24 * 60 * 60 * 1000;

const CHANNELS: readonly CoreChannel[] = ['stable', 'testing', 'development', 'prototype'];

/**
 * A release's link text, `>Release 14.368</a>`. The text, not the link, gives the version: the
 * links of old releases are ids (`/releases/8.102` is 0.8.9).
 */
const RELEASE_LINK = />Release ([\d.]+)<\/a>/g;
/** A build since version 9, `14.368`, and its generation. Older releases (`0.8.9`) do not match. */
const BUILD = /^(\d+)\.\d+$/;
/** A channel tag, `<span class="release-tag stable">`. */
const CHANNEL_TAG = new RegExp(`class="release-tag (${CHANNELS.join('|')})"`);

export interface FoundryReleasesOptions {
  /** Where the release notes are; Foundry's own by default. */
  readonly url?: string;
}

/**
 * Reads the builds on a release notes page, each with the channel tagged after its link, or
 * `undefined` when the page has no builds or a build has no channel.
 */
export function readReleaseNotes(html: string): CoreRelease[] | undefined {
  const links = [...html.matchAll(RELEASE_LINK)];
  const releases = new Map<string, CoreRelease>();
  for (const [i, link] of links.entries()) {
    const [found, given] = link as unknown as [string, string];
    const [, generation] = BUILD.exec(given) ?? [];
    if (generation === undefined) continue;
    // A release's tags lie between its link and the next release's.
    const end = links[i + 1]?.index ?? html.length;
    const channel = CHANNEL_TAG.exec(html.slice(link.index + found.length, end))?.[1] as CoreChannel | undefined;
    if (channel === undefined) return undefined;
    if (!releases.has(given)) releases.set(given, { version: given, generation: Number(generation), channel });
  }
  return releases.size === 0 ? undefined : [...releases.values()];
}

/** Foundry VTT's builds, with their channels, from its release notes. */
export async function foundryCoreReleases(
  http: HttpClient,
  { url = FOUNDRY_RELEASE_NOTES }: FoundryReleasesOptions = {},
): Promise<SourceResult<CoreRelease[]>> {
  const source = 'foundry-releases';
  const page = await http.getText(url, { maxAge: ONE_DAY, staleIfError: 7 * ONE_DAY });
  if (!page.ok) return { ok: false, gap: { ...page.gap, source } };
  const releases = readReleaseNotes(page.value);
  return releases === undefined
    ? { ok: false, gap: { source, url, reason: 'invalid' } }
    : { ok: true, value: releases };
}
