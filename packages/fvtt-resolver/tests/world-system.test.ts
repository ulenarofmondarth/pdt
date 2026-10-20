import { describe, expect, it } from 'vitest';
import { rangeOps } from '../src/range/range.js';
import { foundryOrder } from '../src/version/foundry.js';
import { semverOrder } from '../src/version/semver.js';
import {
  WORLD_SYSTEM,
  splitWorldSystem,
  worldSystemOrder,
  worldSystemRange,
  worldSystemVersion,
} from '../src/world-system.js';

/** dnd5e in SemVer order, every other system in Foundry's, to show each system keeps its own. */
const order = worldSystemOrder(key => (key === 'system:dnd5e' ? semverOrder : foundryOrder));
const ops = rangeOps(order);
const system = rangeOps(semverOrder);

describe('the world-system package', () => {
  it('names a version by system and version, and reads it back', () => {
    expect(WORLD_SYSTEM).toBe('world-system');
    expect(worldSystemVersion('dnd5e', '5.3.3')).toBe('dnd5e@5.3.3');
    expect(splitWorldSystem('dnd5e@5.3.3')).toEqual({ system: 'system:dnd5e', version: '5.3.3' });
  });

  it('orders by system id, then in each system’s own order', () => {
    const sorted = ['pf2e@7.2.0', 'dnd5e@5.3.3', 'dnd5e@5.3.3-beta', 'dnd5e@10.0.0'].sort((a, b) =>
      order.compare(a, b),
    );
    expect(sorted).toEqual(['dnd5e@5.3.3-beta', 'dnd5e@5.3.3', 'dnd5e@10.0.0', 'pf2e@7.2.0']);
  });

  it('reads versions as they are, and has no prefixes', () => {
    expect(order.read('dnd5e@5.3.3')).toBe('dnd5e@5.3.3');
    expect(order.prefixEnd('dnd5e@5')).toBeUndefined();
  });

  it('turns a range of a system’s versions into the matching world-system versions', () => {
    const range = worldSystemRange(
      order,
      'system:dnd5e',
      system.between({ version: '5.0.0', inclusive: true }, { version: '6.0.0', inclusive: false }),
    );
    const admitted = ['dnd5e@4.4.4', 'dnd5e@5.3.3', 'dnd5e@6.0.6', 'pf2e@5.3.3'].filter(v => ops.contains(range, v));
    expect(admitted).toEqual(['dnd5e@5.3.3']);
  });

  it('turns an open range into every version of that system, and no other', () => {
    const range = worldSystemRange(order, 'system:dnd5e', system.any);
    const admitted = ['aaa@1', 'dnd5e@0.0.1', 'dnd5e@99.0.0', 'pf2e@1'].filter(v => ops.contains(range, v));
    expect(admitted).toEqual(['dnd5e@0.0.1', 'dnd5e@99.0.0']);
    expect(ops.union(range, worldSystemRange(order, 'system:pf2e', rangeOps(foundryOrder).any)).intervals).toHaveLength(
      2,
    );
  });

  it('turns an empty range into no versions', () => {
    expect(worldSystemRange(order, 'system:dnd5e', system.none)).toEqual(ops.none);
  });
});
