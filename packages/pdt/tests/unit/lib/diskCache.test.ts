import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { diskCache, resolverCacheDir } from '@lib/diskCache.js';

describe('diskCache', () => {
  let sandbox: string;
  let dir: string;

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-disk-cache-'));
    dir = path.join(sandbox, 'cache');
  });

  afterEach(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  test('is kept under the user data directory', () => {
    expect(resolverCacheDir('/home/me/.local/share/pdt')).toBe(
      path.join('/home/me/.local/share/pdt', 'cache', 'resolver'),
    );
  });

  test('has nothing before anything is written, and makes its directory only when written to', async () => {
    expect(await diskCache(dir).get('https://example.org/index.json')).toBeUndefined();
    expect(fs.existsSync(dir)).toBe(false);
  });

  test('keeps entries between runs, JSON and text alike', async () => {
    await diskCache(dir).set('index', { value: { packages: [1] }, etag: '"a"', storedAt: 5 });
    await diskCache(dir).set('notes', { value: '<html></html>', storedAt: 6 });

    const later = diskCache(dir);
    expect(await later.get('index')).toEqual({ value: { packages: [1] }, etag: '"a"', storedAt: 5 });
    expect(await later.get('notes')).toEqual({ value: '<html></html>', storedAt: 6 });
  });

  test('replaces an entry, leaving no partial files behind', async () => {
    const cache = diskCache(dir);
    await Promise.all([cache.set('k', { value: 1, storedAt: 1 }), cache.set('k', { value: 2, storedAt: 2 })]);
    await cache.set('k', { value: 3, storedAt: 3 });

    expect(await cache.get('k')).toEqual({ value: 3, storedAt: 3 });
    expect(fs.readdirSync(dir)).toHaveLength(1);
  });

  test.each([
    ['not JSON', '{"value": 1, "stored'],
    ['not an entry', '[1, 2]'],
    ['without a time', '{"value": 1}'],
    ['with an ETag that is not text', '{"value": 1, "storedAt": 1, "etag": 7}'],
    ['null', 'null'],
  ])('treats an entry that is %s as missing', async (_, text) => {
    const cache = diskCache(dir);
    await cache.set('k', { value: 0, storedAt: 0 });
    const [file] = fs.readdirSync(dir);
    fs.writeFileSync(path.join(dir, file as string), text);

    expect(await cache.get('k')).toBeUndefined();
  });
});
