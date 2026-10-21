import { describe, expect, test } from 'vitest';
import { httpClient } from '@mondarth/fvtt-resolver/sources';
import { DOCKER_HUB_API, imageCoreLimits, tagsUrl } from '@lib/VTT/coreImages.js';

import type { CoreRelease } from '@mondarth/fvtt-resolver';

const core: CoreRelease[] = [
  { version: '13.351', generation: 13, channel: 'stable' },
  { version: '14.361', generation: 14, channel: 'stable' },
  { version: '14.362', generation: 14, channel: 'stable' },
  { version: '14.363', generation: 14, channel: 'stable' },
];

const reason = (version: string, image: string) => `no ${image} image for ${version}`;
const IMAGE = 'felddy/foundryvtt';

/** A made-up page of Docker Hub's tag list. */
const page = (names: string[], next: string | null = null) => ({
  count: names.length,
  next,
  previous: null,
  results: names.map(name => ({ name, digest: 'sha256:0', tag_status: 'active' })),
});

/** A `fetch` answering from a table of URLs, recording the URLs asked for. */
function fakeFetch(answers: Record<string, unknown>) {
  const asked: string[] = [];
  const fetch = (input: string | URL | Request) => {
    const url = String(input);
    asked.push(url);
    const body = answers[url];
    if (body === 'unreachable') return Promise.reject(new TypeError('fetch failed'));
    return Promise.resolve(
      body === undefined ? new Response(null, { status: 404 }) : new Response(JSON.stringify(body), { status: 200 }),
    );
  };
  return { fetch: fetch as typeof globalThis.fetch, asked };
}

describe('tagsUrl', () => {
  test('lists an image’s tags whose names contain the text given, a hundred at a time', () => {
    expect(tagsUrl(IMAGE, '14.')).toBe(`${DOCKER_HUB_API}/repositories/felddy/foundryvtt/tags?page_size=100&name=14.`);
  });

  test('finds an official image in the library namespace', () => {
    expect(tagsUrl('node', '24')).toBe(`${DOCKER_HUB_API}/repositories/library/node/tags?page_size=100&name=24`);
  });
});

describe('imageCoreLimits', () => {
  test('limits the builds with no tag of their exact version, one request a generation', async () => {
    const { fetch, asked } = fakeFetch({
      [tagsUrl(IMAGE, '13.')]: page(['13.351', '13.351.0', '13', 'release-13.351.0']),
      // 14.362 has only tags that merely contain its version.
      [tagsUrl(IMAGE, '14.')]: page(['14', '14.363', '14.363.0', '14.361', '14.362.0', 'sha-14.362']),
    });

    expect(await imageCoreLimits(httpClient({ fetch }), core, { image: IMAGE, reason })).toEqual({
      limits: [{ version: '14.362', reason: 'no felddy/foundryvtt image for 14.362' }],
      gaps: [],
    });
    expect(asked.sort()).toEqual([tagsUrl(IMAGE, '13.'), tagsUrl(IMAGE, '14.')]);
  });

  test('follows the pages of a generation’s tags', async () => {
    const second = `${DOCKER_HUB_API}/repositories/felddy/foundryvtt/tags?page=2&page_size=100&name=14.`;
    const { fetch } = fakeFetch({
      [tagsUrl(IMAGE, '13.')]: page(['13.351']),
      [tagsUrl(IMAGE, '14.')]: page(['14.361'], second),
      [second]: page(['14.362', '14.363']),
    });

    expect((await imageCoreLimits(httpClient({ fetch }), core, { image: IMAGE, reason })).limits).toEqual([]);
  });

  test('stops after ten pages of a generation', async () => {
    const answers: Record<string, unknown> = { [tagsUrl(IMAGE, '13.')]: page(['13.351']) };
    for (let n = 1; n <= 11; n++) {
      const url = n === 1 ? tagsUrl(IMAGE, '14.') : `${DOCKER_HUB_API}/page/${n}`;
      answers[url] = page(n === 11 ? ['14.361', '14.362', '14.363'] : [], `${DOCKER_HUB_API}/page/${n + 1}`);
    }
    const { fetch, asked } = fakeFetch(answers);

    const { limits } = await imageCoreLimits(httpClient({ fetch }), core, { image: IMAGE, reason });
    expect(limits.map(l => l.version)).toEqual(['14.361', '14.362', '14.363']);
    expect(asked).toHaveLength(11);
  });

  test('limits nothing in a generation whose tags cannot be listed, and records the gap', async () => {
    const { fetch } = fakeFetch({
      [tagsUrl(IMAGE, '13.')]: 'unreachable',
      [tagsUrl(IMAGE, '14.')]: { results: 'not a list' },
    });

    expect(await imageCoreLimits(httpClient({ fetch }), core, { image: IMAGE, reason })).toEqual({
      limits: [],
      gaps: [
        { source: 'docker-hub', url: tagsUrl(IMAGE, '13.'), reason: 'network' },
        { source: 'docker-hub', url: tagsUrl(IMAGE, '14.'), reason: 'invalid' },
      ],
    });
  });

  test('limits nothing when there are no core releases', async () => {
    const { fetch, asked } = fakeFetch({});

    expect(await imageCoreLimits(httpClient({ fetch }), [], { image: IMAGE, reason })).toEqual({
      limits: [],
      gaps: [],
    });
    expect(asked).toEqual([]);
  });
});
