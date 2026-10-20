import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { coreRange, coreVerifiedRange, relationshipRange } from '../../src/range/compatibility.js';
import { rangeOps } from '../../src/range/range.js';
import { foundryOrder, isNewerVersion } from '../../src/version/foundry.js';
import { semverOrder } from '../../src/version/semver.js';

import type { Compatibility } from '../../src/range/compatibility.js';

const core = rangeOps(foundryOrder);
const foundry = rangeOps(foundryOrder);
const semver = rangeOps(semverOrder);

/**
 * Whether Foundry VTT 14.368 finds a core build within a release's `minimum` and `maximum`, by the
 * rules of its package availability test: the minimum by full version, and a whole-number maximum
 * by generation alone.
 */
function foundryAdmits({ minimum, maximum }: Compatibility, build: string): boolean {
  if (minimum !== undefined && isNewerVersion(minimum, build)) return false;
  if (maximum === undefined) return true;
  if (Number.isInteger(Number(maximum))) return Number(build.split('.')[0]) <= Number(maximum);
  return !isNewerVersion(build, maximum);
}

const build = fc.tuple(fc.integer({ min: 9, max: 15 }), fc.nat({ max: 400 })).map(([g, b]) => `${g}.${b}`);
const coreBound = fc.option(
  fc.oneof(
    fc.integer({ min: 9, max: 15 }).map(String),
    fc.integer({ min: 9, max: 15 }).map(g => `${g}.0`),
    build,
  ),
  { nil: undefined },
);

describe('coreRange', () => {
  it('reads a whole-number maximum as the end of that generation', () => {
    const range = coreRange({ minimum: '13', maximum: '13' });
    expect(core.contains(range, '13.346')).toBe(true);
    expect(core.contains(range, '13.351')).toBe(true);
    expect(core.contains(range, '12.331')).toBe(false);
    expect(core.contains(range, '14.350')).toBe(false);
    expect(core.contains(coreRange({ maximum: '13.0' }), '13.351')).toBe(true);
  });

  it('reads build-form bounds exactly', () => {
    const range = coreRange({ minimum: '13.341', maximum: '13.346' });
    expect(core.contains(range, '13.340')).toBe(false);
    expect(core.contains(range, '13.341')).toBe(true);
    expect(core.contains(range, '13.346')).toBe(true);
    expect(core.contains(range, '13.347')).toBe(false);
  });

  it('admits every core when no bounds are given', () => {
    expect(core.isAny(coreRange({}))).toBe(true);
  });

  it('admits exactly the builds Foundry VTT admits', () => {
    fc.assert(
      fc.property(coreBound, coreBound, build, (minimum, maximum, version) => {
        const compatibility = { ...(minimum && { minimum }), ...(maximum && { maximum }) };
        expect(core.contains(coreRange(compatibility), version)).toBe(foundryAdmits(compatibility, version));
      }),
      { numRuns: 2000 },
    );
  });
});

describe('coreVerifiedRange', () => {
  it('reads verified as a maximum', () => {
    const range = coreVerifiedRange({ verified: '14' });
    expect(range && core.contains(range, '14.368')).toBe(true);
    expect(range && core.contains(range, '15.1')).toBe(false);
  });

  it('gives nothing when no version is verified', () => {
    expect(coreVerifiedRange({ minimum: '13' })).toBeUndefined();
  });
});

describe('relationshipRange', () => {
  it('reads bounds exactly, as Foundry does', () => {
    const range = relationshipRange(foundryOrder, { minimum: '3.2', maximum: '4' }, 'foundry');
    expect(range).toBeDefined();
    const admits = (version: string) => range !== undefined && foundry.contains(range, version);
    expect(admits('3.1')).toBe(false);
    expect(admits('3.2')).toBe(true);
    expect(admits('3.10')).toBe(true);
    expect(admits('4')).toBe(true);
    expect(admits('4.0.1')).toBe(false);
    expect(admits('4.1.0')).toBe(false);
  });

  it('ignores verified', () => {
    expect(relationshipRange(foundryOrder, { verified: '1' }, 'foundry')).toEqual(foundry.any);
  });

  it('reads a maximum as a prefix when asked to', () => {
    const range = relationshipRange(foundryOrder, { maximum: '4' }, 'prefix');
    const admits = (version: string) => range !== undefined && foundry.contains(range, version);
    expect(admits('4.1.0')).toBe(true);
    expect(admits('4.99')).toBe(true);
    expect(admits('5')).toBe(false);
    expect(admits('5.0.0')).toBe(false);
  });

  it('reads a maximum that does not end in a number exactly, even as a prefix', () => {
    expect(relationshipRange(foundryOrder, { maximum: '4.x' }, 'prefix')).toEqual(
      relationshipRange(foundryOrder, { maximum: '4.x' }, 'foundry'),
    );
  });

  it('reads bounds in SemVer order, excluding pre-releases of the version a prefix ends before', () => {
    const prefix = relationshipRange(semverOrder, { minimum: '4', maximum: '4' }, 'prefix');
    const exact = relationshipRange(semverOrder, { maximum: '4' }, 'foundry');
    const admits = (range: typeof prefix, version: string) => range !== undefined && semver.contains(range, version);
    expect(admits(prefix, '4.0.0-beta')).toBe(false);
    expect(admits(prefix, '4.9.9')).toBe(true);
    expect(admits(prefix, '5.0.0-beta')).toBe(false);
    expect(admits(exact, '4.0.0')).toBe(true);
    expect(admits(exact, '4.0.1')).toBe(false);
  });

  it('gives nothing when the order cannot read a bound', () => {
    expect(relationshipRange(semverOrder, { minimum: 'v1' }, 'foundry')).toBeUndefined();
    expect(relationshipRange(semverOrder, { maximum: 'v2' }, 'prefix')).toBeUndefined();
  });
});
