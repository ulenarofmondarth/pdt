import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { semverOrder } from '../../src/version/semver.js';

const identifier = fc.oneof(fc.nat({ max: 20 }).map(String), fc.stringMatching(/^[a-z][a-z0-9-]{0,3}$/));

const semver = fc
  .record({
    core: fc.tuple(fc.nat({ max: 3 }), fc.nat({ max: 3 }), fc.nat({ max: 3 })),
    prerelease: fc.array(identifier, { maxLength: 3 }),
    build: fc.array(fc.stringMatching(/^[a-z0-9]{1,3}$/), { maxLength: 2 }),
  })
  .map(
    ({ core, prerelease, build }) =>
      core.join('.') +
      (prerelease.length > 0 ? `-${prerelease.join('.')}` : '') +
      (build.length > 0 ? `+${build.join('.')}` : ''),
  );

describe('semverOrder', () => {
  it('is named for the versionOrder policy', () => {
    expect(semverOrder.name).toBe('semver');
  });

  it('orders by SemVer 2.0.0 precedence', () => {
    const precedence = [
      '1.0.0-alpha',
      '1.0.0-alpha.1',
      '1.0.0-alpha.beta',
      '1.0.0-beta',
      '1.0.0-beta.2',
      '1.0.0-beta.11',
      '1.0.0-rc.1',
      '1.0.0',
      '1.9.0',
      '1.10.0',
      '1.11.0',
      '2.0.0',
      '2.1.0',
      '2.1.1',
    ];
    const shuffled = [...precedence].reverse().sort((a, b) => semverOrder.compare(a, b));
    expect(shuffled).toEqual(precedence);
  });

  it('orders a pre-release after the pre-releases it extends', () => {
    expect(semverOrder.compare('1.0.0-alpha.1', '1.0.0-alpha')).toBeGreaterThan(0);
    expect(semverOrder.compare('1.0.0-alpha', '1.0.0-alpha.1')).toBeLessThan(0);
  });

  it('breaks a tie in build metadata by its text, so that it stays a total order', () => {
    expect(semverOrder.compare('1.0.0-beta+a', '1.0.0-beta+b')).toBeLessThan(0);
    expect(semverOrder.compare('1.0.0+a', '1.0.0+b')).toBeLessThan(0);
    expect(semverOrder.compare('1.0.0', '1.0.0+a')).toBeLessThan(0);
    expect(semverOrder.compare('1.0.0+a', '1.0.0+a')).toBe(0);
  });

  it('is a total order', () => {
    fc.assert(
      fc.property(semver, semver, semver, (a, b, c) => {
        expect(Math.sign(semverOrder.compare(a, b)) + Math.sign(semverOrder.compare(b, a))).toBe(0);
        expect(semverOrder.compare(a, b) === 0).toBe(a === b);
        if (semverOrder.compare(a, b) < 0 && semverOrder.compare(b, c) < 0) {
          expect(semverOrder.compare(a, c)).toBeLessThan(0);
        }
      }),
      { numRuns: 2000 },
    );
  });

  it.each([
    ['1.2.3', '1.2.3'],
    ['1.2.3-beta.1+build', '1.2.3-beta.1+build'],
    ['4', '4.0.0'],
    ['4.1', '4.1.0'],
  ])('reads %s as %s', (version, read) => {
    expect(semverOrder.read(version)).toBe(read);
  });

  it.each(['v1.2.3', '01.2.3', '1.2.3.4', '1.2-beta', '2023-04-08'])('cannot read %s', version => {
    expect(semverOrder.read(version)).toBeUndefined();
  });

  it('compares only versions it has read', () => {
    expect(() => semverOrder.compare('4', '4.0.0')).toThrow('Not a SemVer version: 4');
  });

  it.each([
    ['4', '5.0.0-0'],
    ['4.1', '4.2.0-0'],
    ['4.1.2', '4.1.3-0'],
  ])(
    'ends the versions that %s is a prefix of before %s, so that pre-releases of the next are excluded',
    (prefix, end) => {
      expect(semverOrder.prefixEnd(prefix)).toBe(end);
    },
  );

  it.each(['4.1.2-beta', '04', 'x'])('reads %s as no prefix', prefix => {
    expect(semverOrder.prefixEnd(prefix)).toBeUndefined();
  });
});
