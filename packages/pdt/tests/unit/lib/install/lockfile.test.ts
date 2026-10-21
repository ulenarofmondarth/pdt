import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { LOCKFILE, lockfilePath, readLockfile, writeLockedVtt } from '@lib/install/lockfile.js';

describe('lockfile', () => {
  let sandbox: string;
  let file: string;

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-lock-'));
    file = lockfilePath(path.join(sandbox, '.pdt'));
  });

  afterEach(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  test('is in the project’s .pdt directory', () => {
    expect(lockfilePath('/project/.pdt')).toBe(path.join('/project/.pdt', LOCKFILE));
  });

  test('is empty when there is none, or it cannot be read', () => {
    const empty = { format: 1, VTT: {} };
    expect(readLockfile(file)).toEqual(empty);
    fs.mkdirSync(path.dirname(file));
    for (const text of [
      '{',
      '{"format": 2, "VTT": {}}',
      '{"format": 1, "VTT": {"a": {"core": "14", "packages": [{"package": "x"}]}}}',
    ]) {
      fs.writeFileSync(file, text);
      expect(readLockfile(file)).toEqual(empty);
    }
  });

  test('records each VTT’s packages, sorted, keeping the other VTTs', () => {
    writeLockedVtt(file, 'staging', {
      core: '13.351',
      packages: [{ package: 'system:dnd5e', version: '4.0.0', source: 'pdt' }],
    });
    writeLockedVtt(file, 'main', {
      core: '14.368',
      packages: [
        { package: 'system:dnd5e', version: '5.3.3', source: 'present' },
        { package: 'module:socketlib', version: '1.1.4', source: 'pdt', download: 'https://example.org/socketlib.zip' },
        { package: 'module:my-module', version: '0.1.0', source: 'project' },
      ],
    });

    const text = fs.readFileSync(file, 'utf8');
    expect(text.endsWith('}\n')).toBe(true);
    expect(Object.keys(readLockfile(file).VTT)).toEqual(['main', 'staging']);
    expect(readLockfile(file).VTT['main']?.packages.map(p => p.package)).toEqual([
      'module:my-module',
      'module:socketlib',
      'system:dnd5e',
    ]);
    expect(readLockfile(file).VTT['staging']?.core).toBe('13.351');
  });
});
