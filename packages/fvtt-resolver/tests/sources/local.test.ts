import { describe, expect, it } from 'vitest';
import { localSource } from '../../src/sources/local.js';

describe('localSource', () => {
  const source = localSource([
    { json: { id: 'my-module', version: '0.1.0' }, origin: '/work/my-module/module.json', type: 'module' },
    { json: { id: 'my-system', version: '1.0.0' }, origin: '/work/my-system/system.json', type: 'system' },
    { json: { version: '1' }, origin: '/work/broken/module.json', type: 'module' },
  ]);

  it('gives the releases the manifests describe, loaded, as they are', async () => {
    const found = await source.releases({ type: 'module', id: 'my-module' });
    expect(found.ok && found.value.map(r => [r.version, r.detail, r.origin])).toEqual([
      ['0.1.0', 'loaded', '/work/my-module/module.json'],
    ]);
    expect(await source.releases({ type: 'module', id: 'my-system' })).toEqual({ ok: true, value: [] });
  });

  it('says which manifests it could not read', () => {
    expect(source.problems).toEqual([{ origin: '/work/broken/module.json', problems: [{ code: 'missing-id' }] }]);
  });
});
