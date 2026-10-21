import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { namesVersion, sameVersion } from '../../src/version/same.js';

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

describe('namesVersion', () => {
  it.each([
    ['https://github.com/o/r/releases/download/v1.1.4/module.json', '1.1.4', 'a GitHub release asset'],
    [
      'https://github.com/o/r/releases/download/release-6.0.6/system.json',
      '6.0.6',
      'a tag with text before its number',
    ],
    ['https://gitlab.com/o/r/-/releases/v14.0.18/downloads/module.json', '14.0.18', 'a GitLab release link'],
    ['https://gitlab.com/o/r/-/jobs/artifacts/6.4.4/raw/dist/module.json', '6.4.4', 'a GitLab job artifact'],
    ['https://raw.githubusercontent.com/o/r/v1.0.10/module.json', 'v1.0.10', 'a raw file at a tag'],
    ['https://gitlab.com/api/v4/projects/1/packages/generic/m/release%2F2.0/module.json', '2.0', 'an encoded tag'],
  ])('finds %s names %s: %s', (url, version) => {
    expect(namesVersion(url, version)).toBe(true);
  });

  it.each([
    ['https://github.com/o/r/releases/latest/download/module.json', '1.1.4', 'the newest release'],
    ['https://raw.githubusercontent.com/o/r/master/system.json', '6.0.6', 'a branch'],
    ['https://gitlab.com/o/r/raw/v14/package/module.json', '14.0.18', 'a branch named for a generation'],
    ['https://github.com/o/r/archive/14.01.zip', '14.01', 'a file named for the version'],
    ['https://github.com/o/r/releases/download/v1.1.40/module.json', '1.1.4', 'another version'],
    ['https://example.org/module.json?version=1.1.4', '1.1.4', 'a query'],
    ['https://example.org/%E0%A4%A/module.json', '1.1.4', 'a segment that cannot be decoded'],
    ['not a url', '1.1.4', 'something that is not a URL'],
  ])('finds %s does not name %s: %s', (url, version) => {
    expect(namesVersion(url, version)).toBe(false);
  });
});
