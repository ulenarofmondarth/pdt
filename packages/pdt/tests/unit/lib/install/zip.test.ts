import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { extractPackage, MAX_UNPACKED, ZipError } from '@lib/install/zip.js';
import { makeZip, type ZipEntry } from '@tests/unit/mocks/zip.js';

describe('extractPackage', () => {
  let sandbox: string;
  let target: string;

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-zip-'));
    target = path.join(sandbox, 'package');
  });

  afterEach(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  function zipOf(entries: readonly ZipEntry[]): string {
    const file = path.join(sandbox, 'package.zip');
    fs.writeFileSync(file, makeZip(entries));
    return file;
  }

  const files = (dir: string): string[] =>
    fs
      .readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter(e => e.isFile())
      .map(e => path.relative(dir, path.join(e.parentPath, e.name)))
      .sort();

  test('extracts a package zipped at the top, and gives its manifest', async () => {
    const zip = zipOf([
      { name: 'module.json', data: '{"id":"my-module","version":"1.0.0"}' },
      { name: 'scripts/' },
      { name: 'scripts/main.js', data: 'console.log(1)' },
    ]);
    expect(await extractPackage(zip, 'module', target)).toEqual({ id: 'my-module', version: '1.0.0' });
    expect(files(target)).toEqual(['module.json', path.join('scripts', 'main.js')]);
    expect(fs.readFileSync(path.join(target, 'scripts', 'main.js'), 'utf8')).toBe('console.log(1)');
  });

  test('takes the folder holding the manifest nearest the top as the package, leaving the rest', async () => {
    const zip = zipOf([
      { name: 'README.md', data: 'outside' },
      { name: 'my-module/module.json', data: '{"id":"my-module"}' },
      { name: 'my-module/lang/en.json', data: '{}' },
      { name: 'my-module/packs/inner/module.json', data: '{"id":"not-this"}' },
    ]);
    expect(await extractPackage(zip, 'module', target)).toEqual({ id: 'my-module' });
    expect(files(target)).toEqual([
      path.join('lang', 'en.json'),
      'module.json',
      path.join('packs', 'inner', 'module.json'),
    ]);
  });

  test('looks for the manifest of the package’s type', async () => {
    const zip = zipOf([{ name: 'module.json', data: '{}' }]);
    await expect(extractPackage(zip, 'system', target)).rejects.toEqual(new ZipError('no-manifest', 'system.json'));
  });

  test('refuses a link', async () => {
    const zip = zipOf([
      { name: 'system.json', data: '{}' },
      { name: 'escape', data: '/etc/passwd', mode: 0o120777 },
    ]);
    await expect(extractPackage(zip, 'system', target)).rejects.toEqual(new ZipError('unsafe-entry', 'escape'));
  });

  test('refuses a name that leaves the package', async () => {
    const zip = zipOf([
      { name: 'system.json', data: '{}' },
      { name: '../outside.txt', data: 'x' },
    ]);
    await expect(extractPackage(zip, 'system', target)).rejects.toThrow();
    expect(fs.existsSync(path.join(sandbox, 'outside.txt'))).toBe(false);
  });

  test('refuses an encrypted entry', async () => {
    const zip = zipOf([
      { name: 'system.json', data: '{}' },
      { name: 'secret.js', data: 'x', encrypted: true },
    ]);
    await expect(extractPackage(zip, 'system', target)).rejects.toEqual(new ZipError('encrypted', 'secret.js'));
  });

  test('refuses a zip that would unpack to too much', async () => {
    const zip = makeZip([
      { name: 'system.json', data: '{}' },
      { name: 'big.bin', data: 'x' },
    ]);
    // The size a zip claims for an entry is in its central directory, which the extractor trusts.
    const header = zip.lastIndexOf(Buffer.from('big.bin')) - 46;
    zip.writeUInt32LE(MAX_UNPACKED, header + 20);
    zip.writeUInt32LE(MAX_UNPACKED, header + 24);
    const file = path.join(sandbox, 'big.zip');
    fs.writeFileSync(file, zip);
    await expect(extractPackage(file, 'system', target)).rejects.toMatchObject({ code: 'too-large' });
  });

  test('refuses a target that exists already', async () => {
    fs.mkdirSync(target);
    await expect(extractPackage(zipOf([{ name: 'system.json', data: '{}' }]), 'system', target)).rejects.toThrow();
  });

  test('says what it found', () => {
    expect(new ZipError('encrypted').message).toBe('encrypted');
    expect(new ZipError('unsafe-entry', 'x').message).toBe('unsafe-entry: x');
  });
});
