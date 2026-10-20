import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { rangeOps } from '../../src/range/range.js';
import { foundryOrder } from '../../src/version/foundry.js';

import type { Bound, Range } from '../../src/range/range.js';

const ops = rangeOps(foundryOrder);

const inc = (version: string): Bound => ({ version, inclusive: true });
const exc = (version: string): Bound => ({ version, inclusive: false });

/** Versions bounds are drawn from, and versions between and around them to test membership with. */
const boundVersions = ['1', '2', '3', '4'];
const probes = ['0', '1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5'];

const bound = fc.option(fc.record({ version: fc.constantFrom(...boundVersions), inclusive: fc.boolean() }), {
  nil: undefined,
});
const range: fc.Arbitrary<Range> = fc
  .array(fc.tuple(bound, bound), { maxLength: 3 })
  .map(pairs => pairs.reduce((all, [lower, upper]) => ops.union(all, ops.between(lower, upper)), ops.none));

/** The probes a range contains, as the set it stands for. */
const members = (r: Range) => probes.filter(p => ops.contains(r, p));

describe('rangeOps', () => {
  it('has every version in any, and none in none', () => {
    expect(members(ops.any)).toEqual(probes);
    expect(members(ops.none)).toEqual([]);
    expect(ops.isAny(ops.any)).toBe(true);
    expect(ops.isEmpty(ops.none)).toBe(true);
    expect(ops.isAny(ops.none)).toBe(false);
    expect(ops.isEmpty(ops.any)).toBe(false);
  });

  it('has exactly one version in exactly', () => {
    expect(members(ops.exactly('2'))).toEqual(['2']);
  });

  it('respects inclusive and exclusive bounds', () => {
    expect(members(ops.between(inc('2'), exc('3')))).toEqual(['2', '2.5']);
    expect(members(ops.between(exc('2'), inc('3')))).toEqual(['2.5', '3']);
    expect(members(ops.between(undefined, exc('2')))).toEqual(['0', '1', '1.5']);
    expect(members(ops.between(inc('4'), undefined))).toEqual(['4', '4.5', '5']);
  });

  it('is empty between bounds that cross, or meet without both being inclusive', () => {
    expect(ops.between(inc('3'), inc('2'))).toEqual(ops.none);
    expect(ops.between(inc('2'), exc('2'))).toEqual(ops.none);
    expect(ops.between(inc('2'), inc('2'))).toEqual(ops.exactly('2'));
  });

  it('merges intervals that touch, and keeps apart those a single version separates', () => {
    expect(ops.union(ops.between(inc('1'), exc('2')), ops.between(inc('2'), inc('3')))).toEqual(
      ops.between(inc('1'), inc('3')),
    );
    expect(ops.union(ops.between(inc('1'), exc('2')), ops.between(exc('2'), inc('3'))).intervals).toHaveLength(2);
  });

  it('complements to the gaps before, between and after', () => {
    const gappy = ops.union(ops.between(inc('1'), exc('2')), ops.between(exc('3'), inc('4')));
    expect(members(ops.complement(gappy))).toEqual(['0', '2', '2.5', '3', '4.5', '5']);
    expect(ops.complement(ops.none)).toEqual(ops.any);
    expect(ops.complement(ops.any)).toEqual(ops.none);
  });

  describe('as sets', () => {
    it('unions, intersects and complements as sets do', () => {
      fc.assert(
        fc.property(range, range, (a, b) => {
          const inA = new Set(members(a));
          const inB = new Set(members(b));
          expect(members(ops.union(a, b))).toEqual(probes.filter(p => inA.has(p) || inB.has(p)));
          expect(members(ops.intersect(a, b))).toEqual(probes.filter(p => inA.has(p) && inB.has(p)));
          expect(members(ops.complement(a))).toEqual(probes.filter(p => !inA.has(p)));
          expect(members(ops.difference(a, b))).toEqual(probes.filter(p => inA.has(p) && !inB.has(p)));
        }),
      );
    });

    it('relates ranges as sets do', () => {
      fc.assert(
        fc.property(range, range, (a, b) => {
          expect(ops.isSubset(ops.intersect(a, b), a)).toBe(true);
          expect(ops.isSubset(a, ops.union(a, b))).toBe(true);
          expect(ops.equals(ops.complement(ops.complement(a)), a)).toBe(true);
          expect(ops.isEmpty(ops.intersect(a, ops.complement(a)))).toBe(true);
          expect(ops.isAny(ops.union(a, ops.complement(a)))).toBe(true);
        }),
      );
    });

    it('normalises, so that ranges of the same versions are the same data', () => {
      fc.assert(
        fc.property(range, range, (a, b) => {
          const sameVersions = ops.equals(a, b);
          expect(sameVersions).toBe(JSON.stringify(a) === JSON.stringify(b));
          expect(ops.equals(ops.union(a, b), ops.union(b, a))).toBe(true);
          expect(ops.union(a, b)).toEqual(ops.union(b, a));
        }),
      );
    });

    it('reports a strict subset as a subset, but not the other way', () => {
      const inner = ops.between(inc('2'), inc('3'));
      const outer = ops.between(inc('1'), inc('4'));
      expect(ops.isSubset(inner, outer)).toBe(true);
      expect(ops.isSubset(outer, inner)).toBe(false);
      expect(ops.equals(inner, outer)).toBe(false);
    });
  });
});
