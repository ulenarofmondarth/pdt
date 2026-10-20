import { describe, expect, it } from 'vitest';
import { CORE, chooseOrders, packageKey } from '../src/universe.js';
import { foundryOrder } from '../src/version/foundry.js';
import { semverOrder } from '../src/version/semver.js';
import { makeRelease } from './helpers.js';

import type { Universe } from '../src/universe.js';

const universe = (...releases: Universe['releases']): Universe => ({ core: [], releases });

describe('packageKey', () => {
  it('names a package by its type and id, and core as core', () => {
    expect(packageKey({ type: 'system', id: 'dnd5e' })).toBe('system:dnd5e');
    expect(CORE).toBe('core');
  });
});

describe('chooseOrders', () => {
  it('orders every package as Foundry does by default', () => {
    const orders = chooseOrders(universe(makeRelease()), { versionOrder: 'foundry' });
    expect(orders.orderOf('module:my-module')).toBe(foundryOrder);
    expect(orders.warnings).toEqual([]);
  });

  it('orders a package the universe does not know as Foundry does', () => {
    expect(chooseOrders(universe(), { versionOrder: 'semver' }).orderOf('module:unknown')).toBe(foundryOrder);
  });

  it('reports versions it orders differently from Foundry', () => {
    const orders = chooseOrders(
      universe(makeRelease({ version: '9' }), makeRelease({ version: '10' }), makeRelease({ version: '10a' })),
      { versionOrder: 'foundry' },
    );
    expect(orders.warnings).toEqual([
      { code: 'foundry-disagreement', package: 'module:my-module', pairs: [['9', '10a']] },
    ]);
  });

  it('uses SemVer for a package when it can read every version and every bound on it', () => {
    const lib = makeRelease({ id: 'lib', version: '2.1.0' });
    const user = makeRelease({
      relationships: {
        requires: [{ package: { type: 'module', id: 'lib' }, compatibility: { minimum: '2', maximum: '2.9' } }],
        systems: [],
        conflicts: [],
        recommends: [],
      },
    });
    const orders = chooseOrders(universe(lib, user), { versionOrder: 'semver' });
    expect(orders.orderOf('module:lib')).toBe(semverOrder);
    expect(orders.warnings).toEqual([]);
  });

  it('falls back to Foundry’s order for a package when a bound on it is not SemVer', () => {
    const lib = makeRelease({ id: 'lib', version: '2.1.0' });
    const user = makeRelease({
      relationships: {
        requires: [],
        systems: [],
        conflicts: [{ package: { type: 'module', id: 'lib' }, compatibility: { maximum: 'v1' } }],
        recommends: [{ package: { type: 'module', id: 'other' }, compatibility: { minimum: '1.0.0' } }],
      },
    });
    const orders = chooseOrders(universe(lib, user), { versionOrder: 'semver' });
    expect(orders.orderOf('module:lib')).toBe(foundryOrder);
    expect(orders.orderOf('module:other')).toBe(semverOrder);
    expect(orders.warnings).toEqual([{ code: 'semver-unreadable', package: 'module:lib', versions: ['v1'] }]);
  });
});
