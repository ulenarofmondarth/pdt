import { describe, expect, it } from 'vitest';
import { httpClient } from '../../src/sources/http.js';
import { MAX_DIRECTORY, MAX_MANIFEST, zipManifest } from '../../src/sources/zip-manifest.js';
import { fakeFetch, ranged } from './fake-fetch.js';
import { makeZip } from './zip-builder.js';

import type { ZipFile, ZipOptions } from './zip-builder.js';

const ZIP = 'https://example.org/example-module.zip';
const manifest = { id: 'example-module', version: '1.0.0' };
const json = (value: unknown) => JSON.stringify(value);

function serving(files: readonly ZipFile[], options: ZipOptions = {}) {
  const { fetch, requests } = fakeFetch({ [ZIP]: ranged(makeZip(files, options)) });
  return { http: httpClient({ fetch }), requests };
}

describe('zipManifest', () => {
  it('reads the manifest nearest the top, deflated, in three requests for parts of the zip', async () => {
    const { http, requests } = serving([
      { name: 'example-module/packs/bundled/module.json', content: json({ id: 'bundled' }) },
      { name: 'example-module/scripts/main.js', content: 'x'.repeat(200_000) },
      { name: 'example-module/module.json', content: json(manifest) },
    ]);
    expect(await zipManifest(http, ZIP, 'module')).toEqual({ ok: true, value: manifest });
    expect(requests.map(r => r.headers['Range'])).toEqual([
      'bytes=0-0',
      expect.stringMatching(/^bytes=\d+-$/),
      expect.stringMatching(/^bytes=\d+-\d+$/),
    ]);
  });

  it('asks for the end from the end when it cannot see the zip’s size', async () => {
    const zip = makeZip([{ name: 'module.json', content: json(manifest) }]);
    const { fetch, requests } = fakeFetch({ [ZIP]: ranged(zip, { size: false }) });
    expect(await zipManifest(httpClient({ fetch }), ZIP, 'module')).toEqual({ ok: true, value: manifest });
    expect(requests[1]?.headers['Range']).toBe('bytes=-65557');
  });

  it('reads a stored manifest at the top of the zip, past a comment, sending the headers given', async () => {
    const { http, requests } = serving([{ name: 'system.json', content: json(manifest), method: 'store' }], {
      comment: 'made for a test',
    });
    expect(await zipManifest(http, ZIP, 'system', { Authorization: 'token' })).toEqual({ ok: true, value: manifest });
    expect(requests.every(r => r.headers['Authorization'] === 'token')).toBe(true);
  });

  it('asks for the directory when the end of the zip does not hold all of it', async () => {
    const many = Array.from({ length: 1500 }, (_, i) => ({
      name: `example-module/assets/${'long-name-'.repeat(5)}${String(i)}.webp`,
      content: '',
      method: 'store' as const,
    }));
    const { http, requests } = serving([{ name: 'example-module/module.json', content: json(manifest) }, ...many]);
    expect(await zipManifest(http, ZIP, 'module')).toEqual({ ok: true, value: manifest });
    expect(requests).toHaveLength(4);
  });

  it('keeps what it read, asking nothing again', async () => {
    const { http, requests } = serving([{ name: 'module.json', content: json(manifest) }]);
    await zipManifest(http, ZIP, 'module');
    const asked = requests.length;
    expect(await zipManifest(http, ZIP, 'module')).toEqual({ ok: true, value: manifest });
    expect(requests).toHaveLength(asked);
  });

  it.each<[string, readonly ZipFile[], ZipOptions?]>([
    ['has no manifest', [{ name: 'example-module/main.js', content: '' }]],
    ['has only a manifest of another type of package', [{ name: 'system.json', content: json(manifest) }]],
    ['has an encrypted manifest', [{ name: 'module.json', content: json(manifest), encrypted: true }]],
    ['compresses its manifest other than by deflate', [{ name: 'module.json', content: json(manifest), method: 12 }]],
    [
      'gives a manifest larger than a manifest can be',
      [{ name: 'module.json', content: '{}', claimedSize: MAX_MANIFEST + 1 }],
    ],
    [
      'inflates its manifest to more than it claimed, and more than a manifest can be',
      [{ name: 'module.json', content: ' '.repeat(MAX_MANIFEST + 1), claimedSize: 2 }],
    ],
    ['gives a manifest that is not JSON', [{ name: 'module.json', content: '{ not json' }]],
    ['uses ZIP64 records', [{ name: 'module.json', content: json(manifest) }], { zip64: true }],
  ])('gives an invalid gap for a zip that %s', async (_, files, options) => {
    const { http } = serving(files, options);
    expect(await zipManifest(http, ZIP, 'module')).toEqual({ ok: false, gap: { url: ZIP, reason: 'invalid' } });
  });

  it.each([
    ['is not a zip', { bytes: new TextEncoder().encode('<html>not found</html>') }],
    ['has a broken directory', { bytes: brokenDirectory() }],
    ['has a broken local header', { bytes: brokenLocalHeader() }],
    ['claims a directory larger than a directory may be', { bytes: hugeDirectory() }],
    ['ends before the manifest does', { bytes: truncated() }],
  ])('gives an invalid gap for a file that %s', async (_, answer) => {
    const { fetch } = fakeFetch({ [ZIP]: ranged(answer.bytes) });
    expect(await zipManifest(httpClient({ fetch }), ZIP, 'module')).toEqual({
      ok: false,
      gap: { url: ZIP, reason: 'invalid' },
    });
  });

  it('gives an invalid gap, and reads nothing more, when the server sends the whole zip', async () => {
    const { fetch, requests } = fakeFetch({
      [ZIP]: { bytes: makeZip([{ name: 'module.json', content: json(manifest) }]) },
    });
    expect(await zipManifest(httpClient({ fetch }), ZIP, 'module')).toEqual({
      ok: false,
      gap: { url: ZIP, reason: 'invalid' },
    });
    expect(requests).toHaveLength(1);
  });

  it.each([
    ['its first byte', 1],
    ['its end', 2],
    ['its manifest', 3],
  ])('gives the gap when %s cannot be fetched, and does not keep it', async (_, failing) => {
    const zip = makeZip([{ name: 'module.json', content: json(manifest) }]);
    let calls = 0;
    const { fetch } = fakeFetch({
      [ZIP]: request => (++calls === failing ? { status: 503 } : ranged(zip)(request)),
    });
    const http = httpClient({ fetch });
    expect(await zipManifest(http, ZIP, 'module')).toEqual({
      ok: false,
      gap: { url: ZIP, reason: 'http', status: 503 },
    });
    expect(await zipManifest(http, ZIP, 'module')).toEqual({ ok: true, value: manifest });
  });

  it('gives the gap of a directory that cannot be fetched', async () => {
    const many = Array.from({ length: 1500 }, (_, i) => ({
      name: `${'n'.repeat(60)}${String(i)}`,
      content: '',
      method: 'store' as const,
    }));
    const zip = makeZip([{ name: 'module.json', content: json(manifest) }, ...many]);
    const { fetch } = fakeFetch({
      // The first byte and the end can be fetched, but not a range with an end: the directory.
      [ZIP]: request =>
        /^bytes=\d+-$|^bytes=0-0$/.test(request.headers['Range'] ?? '') ? ranged(zip)(request) : { status: 404 },
    });
    expect(await zipManifest(httpClient({ fetch }), ZIP, 'module')).toEqual({
      ok: false,
      gap: { url: ZIP, reason: 'http', status: 404 },
    });
  });

  it('gives the gap of an end that cannot be fetched', async () => {
    const { fetch } = fakeFetch({});
    expect(await zipManifest(httpClient({ fetch }), ZIP, 'module')).toEqual({
      ok: false,
      gap: { url: ZIP, reason: 'http', status: 404 },
    });
  });
});

/** A zip whose directory says it is larger than a directory may be. */
function hugeDirectory(): Uint8Array {
  const zip = makeZip([{ name: 'module.json', content: json(manifest) }]);
  new DataView(zip.buffer).setUint32(zip.length - 10, MAX_DIRECTORY + 1, true);
  return zip;
}

/** A zip whose directory says the manifest is longer than the zip holds. */
function truncated(): Uint8Array {
  const zip = makeZip([{ name: 'module.json', content: json(manifest) }]);
  const data = new DataView(zip.buffer);
  data.setUint32(data.getUint32(zip.length - 6, true) + 20, zip.length, true);
  return zip;
}

/** A zip whose directory does not start with a directory entry's signature. */
function brokenDirectory(): Uint8Array {
  const zip = makeZip([{ name: 'module.json', content: json(manifest) }]);
  const offset = new DataView(zip.buffer).getUint32(zip.length - 6, true);
  zip[offset] = 0;
  return zip;
}

/** A zip whose manifest's local header does not start with its signature. */
function brokenLocalHeader(): Uint8Array {
  const zip = makeZip([{ name: 'module.json', content: json(manifest) }]);
  zip[0] = 0;
  return zip;
}
