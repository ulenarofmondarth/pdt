import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { installedVersion, installPlan, packageDir } from '@lib/install/plan.js';

import type { Release, Setup } from '@mondarth/fvtt-resolver';

const release = (type: 'module' | 'system', id: string, version: string, fields: Partial<Release> = {}): Release => ({
  package: { type, id },
  version,
  compatibility: {},
  relationships: { requires: [], systems: [], conflicts: [], recommends: [] },
  protected: false,
  origin: id,
  detail: 'loaded',
  ...fields,
});

describe('installPlan', () => {
  let data: string;

  beforeEach(() => {
    data = fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-plan-'));
  });

  afterEach(() => {
    fs.rmSync(data, { recursive: true, force: true });
  });

  /** Installs a package's manifest, as Foundry VTT keeps it. */
  function install(type: 'module' | 'system', id: string, manifest: unknown) {
    const dir = packageDir(data, { type, id });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `${type}.json`),
      typeof manifest === 'string' ? manifest : JSON.stringify(manifest),
    );
  }

  test('keeps Foundry VTT’s packages under Data, by type and id', () => {
    expect(packageDir('/vtt', { type: 'system', id: 'dnd5e' })).toBe(path.join('/vtt', 'Data', 'systems', 'dnd5e'));
  });

  test('installs what is missing or at another version, keeps what is there, and leaves premium packages to the user', () => {
    install('system', 'dnd5e', { id: 'dnd5e', version: '5.3.3' });
    install('module', 'socketlib', { id: 'socketlib', version: 'v1.1.4' });
    install('module', 'lib-wrapper', { id: 'lib-wrapper', version: '1.12.0' });
    const setup: Setup = {
      core: '14.368',
      system: release('system', 'dnd5e', '5.3.3'),
      modules: [
        release('module', 'socketlib', '1.1.4'),
        release('module', 'lib-wrapper', '1.13.5.1'),
        release('module', 'my-module', '0.1.0'),
        release('module', 'premium-maps', '2.0.0', { protected: true }),
        release('module', 'dae', '14.0.18'),
      ],
    };
    expect(installPlan(setup, data, 'my-module').map(e => [e.release.package.id, e.action, e.installed])).toEqual([
      ['dnd5e', 'keep', '5.3.3'],
      ['dae', 'install', undefined],
      ['lib-wrapper', 'install', '1.12.0'],
      ['my-module', 'project', undefined],
      ['premium-maps', 'premium', undefined],
      ['socketlib', 'keep', 'v1.1.4'],
    ]);
  });

  test.each([
    ['not JSON', '{'],
    ['without a version', { id: 'x' }],
    ['with a version that is not text', { id: 'x', version: [1] }],
    ['null', 'null'],
  ])('finds no version in a manifest that is %s', (_, manifest) => {
    install('module', 'x', manifest);
    expect(installedVersion(data, { type: 'module', id: 'x' })).toBeUndefined();
  });

  test('reads a version given as a number', () => {
    install('module', 'x', { id: 'x', version: 2 });
    expect(installedVersion(data, { type: 'module', id: 'x' })).toBe('2');
  });
});
