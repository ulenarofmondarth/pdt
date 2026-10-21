import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { installPackage, InstallError, removePackage } from '@lib/install/apply.js';
import { DownloadError } from '@lib/install/download.js';
import { installedVersion, packageDir } from '@lib/install/plan.js';
import { ZipError } from '@lib/install/zip.js';
import { makeZip } from '@tests/unit/mocks/zip.js';

import type { Release } from '@mondarth/fvtt-resolver';

const URL = 'https://example.org/socketlib.zip';
const release = (fields: Partial<Release> = {}): Release => ({
  package: { type: 'module', id: 'socketlib' },
  version: '1.1.4',
  compatibility: {},
  relationships: { requires: [], systems: [], conflicts: [], recommends: [] },
  protected: false,
  origin: 'socketlib',
  detail: 'loaded',
  download: URL,
  ...fields,
});

/** A release whose listing gives no download. */
function withoutDownload(): Release {
  return Object.fromEntries(Object.entries(release()).filter(([key]) => key !== 'download')) as unknown as Release;
}

const zipOf = (manifest: unknown) =>
  makeZip([
    { name: 'socketlib/module.json', data: JSON.stringify(manifest) },
    { name: 'socketlib/socketlib.js', data: 'new' },
  ]);

describe('installPackage', () => {
  let data: string;

  beforeEach(() => {
    data = fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-apply-'));
  });

  afterEach(() => {
    fs.rmSync(data, { recursive: true, force: true });
  });

  const serving = (body: Buffer | Response) =>
    vi.fn<typeof globalThis.fetch>(() => Promise.resolve(body instanceof Response ? body : new Response(body)));
  const dir = () => packageDir(data, { type: 'module', id: 'socketlib' });
  const working = () => fs.readdirSync(path.dirname(dir())).filter(name => name.startsWith('.pdt-'));

  /** Puts an old version in place, as an earlier install would have. */
  function installOld() {
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(path.join(dir(), 'module.json'), JSON.stringify({ id: 'socketlib', version: '1.1.3' }));
    fs.writeFileSync(path.join(dir(), 'stale.js'), 'old');
  }

  test('installs a release, replacing what was there, and leaves no working files', async () => {
    installOld();
    await installPackage(serving(zipOf({ id: 'socketlib', version: 'v1.1.4' })), release(), data);
    expect(installedVersion(data, { type: 'module', id: 'socketlib' })).toBe('v1.1.4');
    expect(fs.readdirSync(dir()).sort()).toEqual(['module.json', 'socketlib.js']);
    expect(working()).toEqual([]);
  });

  test('accepts a version given as a number', async () => {
    await installPackage(serving(zipOf({ id: 'socketlib', version: 2 })), release({ version: '2' }), data);
    expect(installedVersion(data, { type: 'module', id: 'socketlib' })).toBe('2');
  });

  test('clears working files a failed run left', async () => {
    fs.mkdirSync(path.join(path.dirname(dir()), '.pdt-staging-socketlib'), { recursive: true });
    await installPackage(serving(zipOf({ id: 'socketlib', version: '1.1.4' })), release(), data);
    expect(working()).toEqual([]);
  });

  test.each([
    ['no download', withoutDownload(), zipOf({}), new InstallError('no-download')],
    [
      'another package',
      release(),
      zipOf({ id: 'other', version: '1.1.4' }),
      new InstallError('wrong-package', 'other'),
    ],
    [
      'another version',
      release(),
      zipOf({ id: 'socketlib', version: '1.0.0' }),
      new InstallError('wrong-version', '1.0.0'),
    ],
    ['no version', release(), zipOf({ id: 'socketlib' }), new InstallError('wrong-version', 'undefined')],
    ['a manifest that is not an object', release(), zipOf('text'), new InstallError('wrong-package', 'undefined')],
    ['no manifest', release(), makeZip([{ name: 'x.js', data: '' }]), new ZipError('no-manifest', 'module.json')],
    ['a failed download', release(), new Response('gone', { status: 404 }), new DownloadError(URL, 'http', 404)],
  ])('fails for %s, leaving what was there untouched', async (_, given, body, error) => {
    installOld();
    await expect(installPackage(serving(body), given, data)).rejects.toEqual(error);
    expect(installedVersion(data, { type: 'module', id: 'socketlib' })).toBe('1.1.3');
    expect(fs.readFileSync(path.join(dir(), 'stale.js'), 'utf8')).toBe('old');
    expect(working()).toEqual([]);
  });

  test('says what it found', () => {
    expect(new InstallError('no-download').message).toBe('no-download');
    expect(new InstallError('wrong-package', 'x').message).toBe('wrong-package: x');
  });
});

describe('removePackage', () => {
  test('removes a package, and nothing when it is not there', () => {
    const data = fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-remove-'));
    const dir = packageDir(data, { type: 'system', id: 'dnd5e' });
    fs.mkdirSync(dir, { recursive: true });
    removePackage(data, { type: 'system', id: 'dnd5e' });
    removePackage(data, { type: 'system', id: 'dnd5e' });
    expect(fs.existsSync(dir)).toBe(false);
    fs.rmSync(data, { recursive: true, force: true });
  });
});
