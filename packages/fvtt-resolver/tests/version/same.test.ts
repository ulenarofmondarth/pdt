import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sameVersion } from '../../src/version/same.js';

describe('sameVersion', () => {
  it.each([
    ['v1.1.4', '1.1.4'],
    ['V1.1.4', '1.1.4'],
    ['v1.1.4', 'V1.1.4'],
    ['14.0.15', '14.0.15'],
  ])('counts %s and %s the same version', (a, b) => {
    expect(sameVersion(a, b)).toBe(true);
    expect(sameVersion(b, a)).toBe(true);
  });

  it.each([
    ['1.1.4', '1.1.3', 'other versions'],
    ['1.0', '1.0.0', 'versions Foundry tells apart by their parts'],
    ['vintage', 'intage', 'a "v" not before a digit, which is part of the version'],
    ['vv1', 'v1', 'more than one "v"'],
    ['release-1.1.4', '1.1.4', 'other text before the number'],
  ])('counts %s and %s different: %s', (a, b) => {
    expect(sameVersion(a, b)).toBe(false);
  });

  it('counts any version the same with or without a leading "v", if it starts with a digit', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^\d[0-9a-z.-]{0,8}$/), fc.constantFrom('v', 'V'), (version, v) => {
        expect(sameVersion(`${v}${version}`, version)).toBe(true);
      }),
    );
  });
});
