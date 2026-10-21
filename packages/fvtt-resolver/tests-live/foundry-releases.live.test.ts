/**
 * Reads Foundry VTT's real release notes. The page is written for people, so this checks that it
 * still reads as the source expects: builds of every channel, and the stable builds pdt runs.
 */
import { describe, expect, it } from 'vitest';
import { foundryCoreReleases, httpClient } from '../src/sources/index.js';

describe('against Foundry VTT’s release notes', () => {
  it('reads every build since version 9, with its channel', async () => {
    const found = await foundryCoreReleases(httpClient({ fetch: globalThis.fetch }));
    if (!found.ok) console.log('gap:', JSON.stringify(found.gap));
    expect(found.ok).toBe(true);
    if (!found.ok) return;

    const releases = found.value;
    const channels = Object.groupBy(releases, r => r.channel);
    console.log(
      `${releases.length} builds, newest ${releases[0]?.version};`,
      Object.entries(channels)
        .map(([channel, builds]) => `${channel} ${builds?.length}`)
        .join(', '),
    );
    expect(Object.keys(channels).sort()).toEqual(['development', 'prototype', 'stable', 'testing']);
    expect(releases.map(r => r.version)).toEqual(expect.arrayContaining(['9.280', '13.351', '14.368']));
    expect(releases.every(r => r.generation >= 9)).toBe(true);
  });
});
