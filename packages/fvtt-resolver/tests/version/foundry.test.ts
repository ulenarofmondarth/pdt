import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { foundryDisagreements, foundryOrder, isNewerVersion } from '../../src/version/foundry.js';

/** Version-like strings, including parts Foundry orders inconsistently. */
const anyVersion = fc
  .array(fc.stringMatching(/^[0-9a-c-]{0,3}$/), { minLength: 1, maxLength: 4 })
  .map(parts => parts.join('.'));

/** Versions whose parts are all digits, or all letters: where the two orders must agree. */
const plainVersion = fc
  .array(fc.oneof(fc.stringMatching(/^\d{1,3}$/), fc.stringMatching(/^[a-z]{1,3}$/)), { minLength: 1, maxLength: 4 })
  .map(parts => parts.join('.'));

describe('isNewerVersion', () => {
  it.each([
    ['1.0.0-beta', '1.0.0', 'a pre-release suffix sorts after the release, as text'],
    ['1.0.0-rc1', '1.0.0-beta1', 'differing text parts compare as text'],
    ['1.0.0', '1.0', 'a version with more parts is newer'],
    ['v2', 'v10', 'parts that are not numbers compare as text'],
    ['1.10.0', '1.9.0', 'numeric parts compare as numbers'],
    ['1.1', '1.01', 'equal numbers in differing text compare as text'],
    ['1.0.0-beta.10', '1.0.0-beta.2', 'later numeric parts compare as numbers too'],
    ['2023-04-10', '2023-04-08', 'dates compare as text'],
    ['14.368', '14', 'a build is newer than its bare generation'],
  ])('counts %s newer than %s: %s', (newer, older) => {
    expect(isNewerVersion(newer, older)).toBe(true);
    expect(isNewerVersion(older, newer)).toBe(false);
  });

  it('counts no version newer than itself', () => {
    expect(isNewerVersion('1.2.3', '1.2.3')).toBe(false);
  });

  it('is not a consistent order', () => {
    expect(isNewerVersion('10a', '10')).toBe(true);
    expect(isNewerVersion('10', '9')).toBe(true);
    expect(isNewerVersion('9', '10a')).toBe(true);
  });
});

describe('foundryOrder', () => {
  it('is named for the versionOrder policy', () => {
    expect(foundryOrder.name).toBe('foundry');
  });

  it('reads every version as it is', () => {
    expect(foundryOrder.read('anything at all')).toBe('anything at all');
  });

  it('gives zero only for the same version', () => {
    expect(foundryOrder.compare('1.2.3', '1.2.3')).toBe(0);
    expect(foundryOrder.compare('1.0', '1.00')).not.toBe(0);
  });

  it('orders a version after the versions it extends', () => {
    expect(foundryOrder.compare('1.0.0', '1.0')).toBeGreaterThan(0);
    expect(foundryOrder.compare('1.0', '1.0.0')).toBeLessThan(0);
  });

  it('breaks Foundry’s cycle by reading leading digits as a number', () => {
    const sorted = ['10a', '9', '10'].sort((a, b) => foundryOrder.compare(a, b));
    expect(sorted).toEqual(['9', '10', '10a']);
  });

  it('agrees with Foundry where both read parts the same way', () => {
    fc.assert(
      fc.property(plainVersion, plainVersion, (a, b) => {
        const compared = foundryOrder.compare(a, b);
        expect(compared > 0).toBe(isNewerVersion(a, b));
        expect(compared < 0).toBe(isNewerVersion(b, a));
      }),
    );
  });

  it('agrees with Foundry on numeric parts read as numbers, such as exponents', () => {
    expect(foundryOrder.compare('1e3', '5')).toBeGreaterThan(0);
    expect(isNewerVersion('1e3', '5')).toBe(true);
    expect(foundryOrder.compare('1e3', '1000')).toBeGreaterThan(0);
    expect(isNewerVersion('1e3', '1000')).toBe(true);
  });

  it('is a total order', () => {
    fc.assert(
      fc.property(anyVersion, anyVersion, anyVersion, (a, b, c) => {
        expect(Math.sign(foundryOrder.compare(a, b)) + Math.sign(foundryOrder.compare(b, a))).toBe(0);
        expect(foundryOrder.compare(a, b) === 0).toBe(a === b);
        if (foundryOrder.compare(a, b) < 0 && foundryOrder.compare(b, c) < 0) {
          expect(foundryOrder.compare(a, c)).toBeLessThan(0);
        }
      }),
      { numRuns: 2000 },
    );
  });

  it.each([
    ['4', '5'],
    ['4.1', '4.2'],
    ['4.1.9', '4.1.10'],
  ])('ends the versions that %s is a prefix of before %s', (prefix, end) => {
    expect(foundryOrder.prefixEnd(prefix)).toBe(end);
  });

  it.each(['4.x', '4.1a', 'v4'])('reads %s as no prefix, since it does not end in a number', prefix => {
    expect(foundryOrder.prefixEnd(prefix)).toBeUndefined();
  });
});

describe('foundryDisagreements', () => {
  it('reports the pairs it orders differently from Foundry, older first', () => {
    expect(foundryDisagreements(['10a', '9', '10'])).toEqual([['9', '10a']]);
  });

  it('reports nothing for versions it orders as Foundry does', () => {
    expect(foundryDisagreements(['1.0.0', '1.0.0-beta', '1.10.0', '1.9.0'])).toEqual([]);
  });
});

// The order as it was before versions were read once, kept to check that reading them once changes nothing.
function comparedAsBefore(a: string, b: string): number {
  const isNumeric = (part: string) => part !== '' && !Number.isNaN(Number(part));
  const text = (x: string, y: string) => (x === y ? 0 : x > y ? 1 : -1);
  const parts = (x: string, y: string) => {
    const xNumber = /^\d+/.exec(x)?.[0];
    const yNumber = /^\d+/.exec(y)?.[0];
    if (xNumber === undefined || yNumber === undefined) return text(x, y);
    const [xValue, xRest] = isNumeric(x) ? [Number(x), ''] : [Number(xNumber), x.slice(xNumber.length)];
    const [yValue, yRest] = isNumeric(y) ? [Number(y), ''] : [Number(yNumber), y.slice(yNumber.length)];
    if (xValue !== yValue) return xValue > yValue ? 1 : -1;
    return text(xRest, yRest) || text(x, y);
  };
  const aParts = a.split('.');
  const bParts = b.split('.');
  for (const [i, aPart] of aParts.entries()) {
    const bPart = bParts[i];
    if (bPart === undefined) return 1;
    const order = parts(aPart, bPart);
    if (order !== 0) return order;
  }
  return aParts.length === bParts.length ? 0 : -1;
}

describe('foundryOrder, its versions read once', () => {
  const parts = ['0', '1', '01', '9', '10', '10a', 'a', 'v1', '1e3', '1000', '-1', '', ' 1', '0x10', 'beta', '2b3'];
  const versions = [
    ...parts,
    ...parts.flatMap(x => parts.map(y => `${x}.${y}`)),
    '1.2.3',
    '1.2.3.4',
    '14.368',
    '0.4.0.02',
    '2.0.0-rc1',
    '13.4.1-alpha-2',
  ];

  it('orders every pair as before', () => {
    for (const a of versions) {
      for (const b of versions) {
        expect([a, b, Math.sign(foundryOrder.compare(a, b))]).toEqual([a, b, comparedAsBefore(a, b)]);
      }
    }
  });

  it('orders any versions as before', () => {
    fc.assert(
      fc.property(anyVersion, anyVersion, (a, b) => Math.sign(foundryOrder.compare(a, b)) === comparedAsBefore(a, b)),
      { numRuns: 2000 },
    );
  });

  it('orders as before once more versions are read than are kept', () => {
    const many = Array.from({ length: 10_050 }, (_, i) => `1.${String(i)}`);
    for (const [i, version] of many.entries()) {
      if (i > 0) expect(foundryOrder.compare(version, many[i - 1] ?? '')).toBe(1);
    }
    // Read before the kept ones were let go, and read again since.
    expect(foundryOrder.compare('1.0', '1.10049')).toBe(-1);
    expect(foundryOrder.compare('1.10049', '1.0')).toBe(1);
  });

  it('orders the same pair the same, compared again', () => {
    expect(foundryOrder.compare('10a', '9')).toBe(foundryOrder.compare('10a', '9'));
    expect(foundryOrder.compare('1.0', '1.0.0')).toBe(-1);
  });
});
