import fs from 'node:fs';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { normaliseManifest } from '../../src/manifest/normalise.js';

import type { ManifestResult, ManifestSource } from '../../src/manifest/normalise.js';
import type { Release } from '../../src/release.js';

const fixture = (name: string): unknown =>
  JSON.parse(fs.readFileSync(new URL(`../fixtures/manifests/${name}`, import.meta.url), 'utf8'));

const asModule: ManifestSource = { origin: 'test', type: 'module' };

/** The release from a manifest that must be readable. */
function release(result: ManifestResult): Release {
  if (!result.ok) throw new Error(`Expected a release, got ${JSON.stringify(result.problems)}`);
  return result.release;
}

/** Normalises a module manifest with an id and version, plus the fields given. */
const module = (fields: Record<string, unknown>) =>
  normaliseManifest({ id: 'my-module', version: '1.0.0', ...fields }, asModule);

const warningsOf = (result: ManifestResult) => (result.ok ? result.warnings : []);

const noRelationships = { requires: [], systems: [], conflicts: [], recommends: [] };

describe('normaliseManifest', () => {
  describe('real manifests', () => {
    it('reads a current system manifest as it is', () => {
      const origin = 'https://example.org/system.json';
      expect(normaliseManifest(fixture('dnd5e-6.0.6.system.json'), { origin, type: 'system' })).toEqual({
        ok: true,
        release: {
          package: { type: 'system', id: 'dnd5e' },
          version: '6.0.6',
          compatibility: { minimum: '14.367', verified: '14' },
          relationships: noRelationships,
          manifest: 'https://raw.githubusercontent.com/foundryvtt/dnd5e/master/system.json',
          download: 'https://github.com/foundryvtt/dnd5e/releases/download/release-6.0.6/dnd5e-release-6.0.6.zip',
          protected: false,
          origin,
        },
        warnings: [],
      });
    });

    it('reads a pre-v10 manifest, with its numeric version as Foundry reads it', () => {
      const result = normaliseManifest(fixture('dnd5e-0.9.8.system.json'), { origin: 'test', type: 'system' });
      expect(release(result)).toMatchObject({
        package: { type: 'system', id: 'dnd5e' },
        version: '0.98',
        compatibility: { minimum: '0.5.6', verified: '0.7.5' },
      });
      expect(warningsOf(result)).toEqual([
        { code: 'legacy-field', field: 'name', replacement: 'id' },
        { code: 'legacy-field', field: 'minimumCoreVersion', replacement: 'compatibility.minimum' },
        { code: 'legacy-field', field: 'compatibleCoreVersion', replacement: 'compatibility.verified' },
      ]);
    });

    it('reads pre-v10 dependencies as requires', () => {
      const result = normaliseManifest(fixture('times-up-0.8.28.module.json'), asModule);
      expect(release(result).relationships.requires).toEqual([
        { package: { type: 'module', id: 'lib-wrapper' }, compatibility: {} },
      ]);
      expect(warningsOf(result)).toContainEqual({
        code: 'legacy-field',
        field: 'dependencies',
        replacement: 'relationships.requires',
      });
    });

    it('reads current relationships, with their ranges', () => {
      const result = normaliseManifest(fixture('midi-qol-14.0.15.module.json'), asModule);
      expect(release(result).compatibility).toEqual({ minimum: '14.368', verified: '14.368', maximum: '14.999' });
      expect(release(result).relationships).toEqual({
        requires: [
          { package: { type: 'module', id: 'socketlib' }, compatibility: {} },
          { package: { type: 'module', id: 'lib-wrapper' }, compatibility: {} },
          { package: { type: 'module', id: 'dae' }, compatibility: { minimum: '14.0.18' } },
        ],
        systems: [
          {
            package: { type: 'system', id: 'dnd5e' },
            compatibility: { minimum: '5.3.0', verified: '5.3.3', maximum: '5.9.99' },
          },
        ],
        conflicts: [],
        recommends: [],
      });
      expect(warningsOf(result)).toEqual([]);
    });

    it('reads a premium manifest, and the first entry of a compatibility given as a list', () => {
      const result = normaliseManifest(fixture('example-premium-1.0.1.module.json'), asModule);
      expect(release(result).protected).toBe(true);
      expect(release(result).relationships.systems).toEqual([
        {
          package: { type: 'system', id: 'example-system' },
          compatibility: { minimum: '1.38.0', verified: '1.40.0' },
        },
      ]);
      expect(warningsOf(result)).toEqual([
        { code: 'compatibility-array', field: 'relationships.systems[0].compatibility' },
      ]);
    });
  });

  describe('identity', () => {
    it.each([null, [], 'module.json', 3])('refuses %j, which is not an object', json => {
      expect(normaliseManifest(json, asModule)).toEqual({ ok: false, problems: [{ code: 'not-an-object' }] });
    });

    it('refuses a manifest with no id', () => {
      expect(normaliseManifest({ version: '1' }, asModule)).toEqual({ ok: false, problems: [{ code: 'missing-id' }] });
    });

    it.each([
      ['my module', 'my module'],
      ['con', 'con'],
      ['LPT1', 'LPT1'],
      [5, '5'],
    ])('refuses the id %j, which Foundry refuses', (id, reported) => {
      expect(normaliseManifest({ id, version: '1' }, asModule)).toEqual({
        ok: false,
        problems: [{ code: 'invalid-id', id: reported }],
      });
    });

    it('reports an id or type that cannot be turned into text, without throwing', () => {
      expect(normaliseManifest({ id: { toString: 0 }, type: { toString: 0 }, version: '1' }, asModule)).toEqual({
        ok: false,
        problems: [
          { code: 'invalid-id', id: '{"toString":0}' },
          { code: 'wrong-type', expected: 'module', found: '{"toString":0}' },
        ],
      });
    });

    it('refuses a manifest of another type of package', () => {
      expect(module({ type: 'system' })).toEqual({
        ok: false,
        problems: [{ code: 'wrong-type', expected: 'module', found: 'system' }],
      });
    });

    it('accepts a manifest that names its own type', () => {
      expect(module({ type: 'module' }).ok).toBe(true);
    });

    it.each([undefined, null, ''])('reads a missing version (%j) as "0", as Foundry does', version => {
      const result = normaliseManifest({ id: 'my-module', version }, asModule);
      expect(release(result).version).toBe('0');
      expect(warningsOf(result)).toEqual([{ code: 'missing-version' }]);
    });

    it.each([
      [{ major: 1 }, '{"major":1}'],
      ['1.0<script>', '"1.0<script>"'],
      [true, 'true'],
    ])('refuses the version %j', (version, reported) => {
      expect(module({ version })).toEqual({ ok: false, problems: [{ code: 'invalid-version', version: reported }] });
    });

    it('reports every problem at once', () => {
      expect(normaliseManifest({ id: 'bad id', type: 'world', version: {} }, asModule)).toEqual({
        ok: false,
        problems: [
          { code: 'invalid-id', id: 'bad id' },
          { code: 'wrong-type', expected: 'module', found: 'world' },
          { code: 'invalid-version', version: '{}' },
        ],
      });
    });

    it('prefers the id to the pre-v10 name', () => {
      const result = module({ name: 'old-name' });
      expect(release(result).package.id).toBe('my-module');
      expect(warningsOf(result)).toEqual([]);
    });
  });

  describe('core compatibility', () => {
    it('reads numbers as text', () => {
      expect(release(module({ compatibility: { minimum: 10, verified: 11.315 } })).compatibility).toEqual({
        minimum: '10',
        verified: '11.315',
      });
    });

    it('leaves out bounds that are blank, not text, or that Foundry refuses', () => {
      const result = module({ compatibility: { minimum: '', maximum: ['13'], verified: '14"' } });
      expect(release(result).compatibility).toEqual({});
      expect(warningsOf(result)).toEqual([
        { code: 'ignored-field', field: 'compatibility.minimum' },
        { code: 'ignored-field', field: 'compatibility.maximum' },
        { code: 'ignored-field', field: 'compatibility.verified' },
      ]);
    });

    it('leaves out a compatibility that is not a block', () => {
      const result = module({ compatibility: '13' });
      expect(release(result).compatibility).toEqual({});
      expect(warningsOf(result)).toEqual([{ code: 'ignored-field', field: 'compatibility' }]);
    });

    it('reads an empty list of compatibility as none', () => {
      const result = module({ compatibility: [] });
      expect(release(result).compatibility).toEqual({});
      expect(warningsOf(result)).toEqual([{ code: 'compatibility-array', field: 'compatibility' }]);
    });

    it('reads pre-v10 bounds only where the current ones are not given', () => {
      const result = module({
        compatibility: { minimum: '12' },
        minimumCoreVersion: '0.8.6',
        maximumCoreVersion: '13',
      });
      expect(release(result).compatibility).toEqual({ minimum: '12', maximum: '13' });
      expect(warningsOf(result)).toEqual([
        { code: 'legacy-field', field: 'minimumCoreVersion', replacement: 'compatibility.minimum' },
        { code: 'legacy-field', field: 'maximumCoreVersion', replacement: 'compatibility.maximum' },
      ]);
    });

    it('leaves out a pre-v10 bound it cannot read', () => {
      const result = module({ compatibleCoreVersion: {} });
      expect(release(result).compatibility).toEqual({});
      expect(warningsOf(result)).toContainEqual({ code: 'ignored-field', field: 'compatibleCoreVersion' });
    });
  });

  describe('relationships', () => {
    it('leaves out relationships that are not a block', () => {
      const result = module({ relationships: ['dnd5e'] });
      expect(release(result).relationships).toEqual(noRelationships);
      expect(warningsOf(result)).toEqual([{ code: 'ignored-field', field: 'relationships' }]);
    });

    it('reads a single entry as a list of one, as Foundry does', () => {
      const result = module({ relationships: { requires: { id: 'socketlib' } } });
      expect(release(result).relationships.requires).toEqual([
        { package: { type: 'module', id: 'socketlib' }, compatibility: {} },
      ]);
    });

    it('leaves out a list that is neither a list nor an entry', () => {
      const result = module({ relationships: { conflicts: 'other-module' } });
      expect(release(result).relationships.conflicts).toEqual([]);
      expect(warningsOf(result)).toEqual([{ code: 'ignored-field', field: 'relationships.conflicts' }]);
    });

    it('keeps a relationship’s manifest and reason', () => {
      const entry = { id: 'other-module', manifest: 'https://example.org/module.json', reason: 'Breaks rolls' };
      expect(release(module({ relationships: { conflicts: [entry] } })).relationships.conflicts).toEqual([
        {
          package: { type: 'module', id: 'other-module' },
          compatibility: {},
          manifest: 'https://example.org/module.json',
          reason: 'Breaks rolls',
        },
      ]);
    });

    it.each([
      ['not an object', 'other-module'],
      ['no id', { type: 'module' }],
      ['an id Foundry refuses', { id: 'other module' }],
      ['a type that is not a package type', { id: 'other-module', type: 'library' }],
      ['a type that is not text', { id: 'other-module', type: 1 }],
    ])('leaves out an entry with %s', (_, entry) => {
      const result = module({ relationships: { recommends: [entry] } });
      expect(release(result).relationships.recommends).toEqual([]);
      expect(warningsOf(result)).toContainEqual({ code: 'ignored-field', field: 'relationships.recommends[0]' });
    });

    it('leaves out a systems entry that is not a system', () => {
      const result = module({ relationships: { systems: [{ id: 'dnd5e', type: 'module' }] } });
      expect(release(result).relationships.systems).toEqual([]);
      expect(warningsOf(result)).toEqual([{ code: 'ignored-field', field: 'relationships.systems[0]' }]);
    });

    it('keeps a requires entry that is not a module, with a warning that Foundry does not check it', () => {
      const result = module({ relationships: { requires: [{ id: 'dnd5e', type: 'system' }] } });
      expect(release(result).relationships.requires).toEqual([
        { package: { type: 'system', id: 'dnd5e' }, compatibility: {} },
      ]);
      expect(warningsOf(result)).toEqual([{ code: 'requires-not-module', id: 'dnd5e', type: 'system' }]);
    });

    it('reads pre-v10 systems, a list of ids, where relationships.systems is not given', () => {
      const result = module({ systems: ['dnd5e', 'pf2e'] });
      expect(release(result).relationships.systems.map(s => s.package)).toEqual([
        { type: 'system', id: 'dnd5e' },
        { type: 'system', id: 'pf2e' },
      ]);
      expect(warningsOf(result)).toEqual([
        { code: 'legacy-field', field: 'systems', replacement: 'relationships.systems' },
      ]);
    });

    it('prefers relationships.systems to pre-v10 systems', () => {
      const result = module({ systems: ['pf2e'], relationships: { systems: [{ id: 'dnd5e' }] } });
      expect(release(result).relationships.systems.map(s => s.package.id)).toEqual(['dnd5e']);
    });

    it('adds pre-v10 dependencies to requires, once each, by name or id', () => {
      const result = module({
        relationships: { requires: [{ id: 'socketlib' }] },
        dependencies: [{ name: 'socketlib' }, { id: 'lib-wrapper' }, 'not-an-entry'],
      });
      expect(release(result).relationships.requires.map(r => r.package.id)).toEqual(['socketlib', 'lib-wrapper']);
      expect(warningsOf(result)).toContainEqual({ code: 'ignored-field', field: 'dependencies[2]' });
    });
  });

  describe('other fields', () => {
    it('leaves out a manifest or download URL that is not text', () => {
      const result = module({ manifest: true, download: '' });
      expect(release(result)).not.toHaveProperty('manifest');
      expect(release(result)).not.toHaveProperty('download');
      expect(warningsOf(result)).toEqual([
        { code: 'ignored-field', field: 'manifest' },
        { code: 'ignored-field', field: 'download' },
      ]);
    });

    it('reads a package as protected only when the manifest says true', () => {
      expect(release(module({ protected: 'yes' })).protected).toBe(false);
      expect(release(module({ protected: true })).protected).toBe(true);
    });
  });

  it('never throws, whatever it is given', () => {
    const fields = fc.constantFrom(
      'id',
      'name',
      'type',
      'version',
      'compatibility',
      'minimumCoreVersion',
      'compatibleCoreVersion',
      'maximumCoreVersion',
      'relationships',
      'systems',
      'dependencies',
      'manifest',
      'download',
      'protected',
    );
    const manifest = fc.oneof(fc.jsonValue(), fc.dictionary(fields, fc.jsonValue()));
    fc.assert(
      fc.property(manifest, json => {
        const result = normaliseManifest(json, asModule);
        if (result.ok) expect(result.release.package.id).toMatch(/^[A-Za-z0-9_-]+$/);
        else expect(result.problems.length).toBeGreaterThan(0);
      }),
      { numRuns: 2000 },
    );
  });
});
