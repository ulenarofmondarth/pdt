import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FOUNDRY_RELEASE_NOTES, foundryCoreReleases, readReleaseNotes } from '../../src/sources/foundry-releases.js';
import { httpClient } from '../../src/sources/http.js';
import { fakeFetch } from './fake-fetch.js';

import type { CoreChannel } from '../../src/universe.js';

interface Entry {
  /** As the page writes it: `14.368`, or `0.8.9` for an old release. */
  readonly version: string;
  /** The link, which for old releases is an id rather than the version. */
  readonly link?: string;
  readonly channel?: CoreChannel;
  readonly kind?: 'Update' | 'Full';
}

/** A made-up release notes page, in the markup of Foundry VTT's. */
function page(entries: readonly Entry[]): string {
  const items = entries.map(
    ({ version, link = version, channel, kind = 'Update' }) => `
        <li class="article release flexrow">
            <h3 class="article-title">
                <a href="/releases/${link}" title="Release ${version} Update Notes">Release ${version}</a>
            </h3>
            <span class="release-time">October 08, 2026</span>
            <div class="release-tags">
                <span class="release-tag">${kind}</span>
                ${channel === undefined ? '' : `<span class="release-tag ${channel}">${channel}</span>`}
            </div>
        </li>`,
  );
  return `<!DOCTYPE html>
<html><head><title>Release Notes</title></head>
<body>
    <nav><a href="/releases/">Releases</a></nav>
    <ol class="index-list releases-list">${items.join('')}
    </ol>
</body></html>`;
}

const entries: Entry[] = [
  { version: '14.369', channel: 'testing' },
  { version: '14.368', channel: 'stable' },
  { version: '14.357', channel: 'development', kind: 'Full' },
  { version: '14.349', channel: 'prototype' },
  { version: '9.280', channel: 'stable' },
  { version: '0.8.9', link: '8.102' },
  { version: '0.1.5', link: '1.32', channel: 'stable' },
];

describe('readReleaseNotes', () => {
  it('reads each build since version 9, with its generation and channel, in the page’s order', () => {
    expect(readReleaseNotes(page(entries))).toEqual([
      { version: '14.369', generation: 14, channel: 'testing' },
      { version: '14.368', generation: 14, channel: 'stable' },
      { version: '14.357', generation: 14, channel: 'development' },
      { version: '14.349', generation: 14, channel: 'prototype' },
      { version: '9.280', generation: 9, channel: 'stable' },
    ]);
  });

  it('reads the version from the link’s text, since old releases are linked by id', () => {
    const releases = readReleaseNotes(page([{ version: '13.351', link: '13.999', channel: 'stable' }]));
    expect(releases).toEqual([{ version: '13.351', generation: 13, channel: 'stable' }]);
  });

  it('takes a build’s channel from its own tags, never from the next release’s', () => {
    expect(readReleaseNotes(page([{ version: '14.368' }, { version: '14.367', channel: 'stable' }]))).toBeUndefined();
  });

  it('refuses a page with no builds, which means the page has changed', () => {
    expect(readReleaseNotes(page([]))).toBeUndefined();
    expect(readReleaseNotes(page([{ version: '0.8.9', channel: 'stable' }]))).toBeUndefined();
    expect(readReleaseNotes('<html><body>Maintenance</body></html>')).toBeUndefined();
  });

  it('keeps the first of a build listed twice', () => {
    const twice = page([
      { version: '14.368', channel: 'stable' },
      { version: '14.368', channel: 'testing' },
    ]);
    expect(readReleaseNotes(twice)).toEqual([{ version: '14.368', generation: 14, channel: 'stable' }]);
  });

  it('reads every build of any page, with its channel', () => {
    const channel = fc.constantFrom<CoreChannel>('stable', 'testing', 'development', 'prototype');
    const build = fc.record({
      generation: fc.integer({ min: 9, max: 99 }),
      build: fc.integer({ min: 0, max: 9999 }),
      channel,
    });
    fc.assert(
      fc.property(fc.uniqueArray(build, { minLength: 1, selector: b => `${b.generation}.${b.build}` }), builds => {
        const read = readReleaseNotes(
          page(builds.map(b => ({ version: `${b.generation}.${b.build}`, channel: b.channel }))),
        );
        expect(read).toEqual(
          builds.map(b => ({ version: `${b.generation}.${b.build}`, generation: b.generation, channel: b.channel })),
        );
      }),
    );
  });
});

describe('foundryCoreReleases', () => {
  it('reads Foundry VTT’s release notes', async () => {
    const { fetch, requests } = fakeFetch({ [FOUNDRY_RELEASE_NOTES]: { text: page(entries) } });
    const found = await foundryCoreReleases(httpClient({ fetch }));
    expect(found.ok && found.value.map(r => r.version)).toEqual(['14.369', '14.368', '14.357', '14.349', '9.280']);
    expect(requests.map(r => r.url)).toEqual([FOUNDRY_RELEASE_NOTES]);
  });

  it('keeps the page for a day', async () => {
    let time = 0;
    const { fetch, requests } = fakeFetch({ [FOUNDRY_RELEASE_NOTES]: { text: page(entries) } });
    const http = httpClient({ fetch, now: () => time });
    await foundryCoreReleases(http);
    time = 23 * 60 * 60 * 1000;
    await foundryCoreReleases(http);
    expect(requests).toHaveLength(1);
    time = 25 * 60 * 60 * 1000;
    await foundryCoreReleases(http);
    expect(requests).toHaveLength(2);
  });

  it('serves a stale page for a week when the site cannot be reached', async () => {
    let time = 0;
    let down = false;
    const url = 'https://example.org/releases/';
    const { fetch } = fakeFetch({ [url]: () => (down ? { unreachable: true } : { text: page(entries) }) });
    const http = httpClient({ fetch, now: () => time });
    await foundryCoreReleases(http, { url });
    down = true;
    time = 7 * 24 * 60 * 60 * 1000;
    expect((await foundryCoreReleases(http, { url })).ok).toBe(true);
    time = 9 * 24 * 60 * 60 * 1000;
    expect(await foundryCoreReleases(http, { url })).toEqual({
      ok: false,
      gap: { source: 'foundry-releases', url, reason: 'network' },
    });
  });

  it('gives a gap when the page cannot be read', async () => {
    const { fetch } = fakeFetch({ [FOUNDRY_RELEASE_NOTES]: { text: '<html>Maintenance</html>' } });
    expect(await foundryCoreReleases(httpClient({ fetch }))).toEqual({
      ok: false,
      gap: { source: 'foundry-releases', url: FOUNDRY_RELEASE_NOTES, reason: 'invalid' },
    });
  });
});
