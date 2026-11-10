import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { namesVersion, sameVersion, tagName, tagVersion, unprefixed } from '../../src/version/same.js';

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

describe('unprefixed', () => {
  // It reads a version further only where it starts with a "v" or "V", for speed: what it gives is what the pattern
  // alone would give, for any text.
  it('takes a leading "v" or "V" off a version starting with a digit after it, and changes nothing else', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.stringMatching(/^[vVx]?\d?[0-9a-z.-]{0,6}$/)), version => {
        expect(unprefixed(version)).toBe(version.replace(/^[vV](?=\d)/, ''));
      }),
    );
  });
});

describe('tagVersion and tagName', () => {
  it.each([
    ['v1.1.4', '1.1.4', ''],
    ['1.1.4', '1.1.4', ''],
    ['release-6.0.6', '6.0.6', 'release'],
    ['pf2e-8.6.1', '8.6.1', 'pf2e'],
    ['sf2e-anachronism-2.4.0', '2.4.0', 'sf2e-anachronism'],
    ['module-v2.0.0', '2.0.0', 'module'],
    ['release/2.0', '2.0', 'release'],
    ['1.0.0-beta.1', '1.0.0-beta.1', ''],
    ['release2.0', '2.0', 'release'],
    ['Foo_V3', '3', 'foo'],
  ])('reads %s as version %s, named %j', (tag, version, name) => {
    expect(tagVersion(tag)).toBe(version);
    expect(tagName(tag)).toBe(name);
  });

  it('reads no version from a tag without a digit', () => {
    expect(tagVersion('nightly')).toBeUndefined();
    expect(tagName('nightly')).toBeUndefined();
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
    [
      'https://github.com/foundryvtt/pf2e/releases/download/pf2e-8.6.1/system.json',
      '8.6.1',
      'a tag named for a package with digits in its ID',
    ],
    ['https://gitlab.com/o/r/-/releases/v14.0.18/downloads/module.json', '14.0.18', 'a GitLab release link'],
    ['https://gitlab.com/o/r/-/jobs/artifacts/6.4.4/raw/dist/module.json', '6.4.4', 'a GitLab job artifact'],
    ['https://raw.githubusercontent.com/o/r/v1.0.10/module.json', 'v1.0.10', 'a raw file at a tag'],
    ['https://gitlab.com/api/v4/projects/1/packages/generic/m/release%2F2.0/module.json', '2.0', 'an encoded tag'],
    [
      'https://r2.foundryvtt.com/packages-public/epic-rolls-5e/module-6.1.0.json',
      '6.1.0',
      "a manifest named for its version, as Foundry VTT's listing gives a premium package's",
    ],
  ])('finds %s names %s: %s', (url, version) => {
    expect(namesVersion(url, version)).toBe(true);
  });

  it.each([
    ['https://github.com/o/r/releases/latest/download/module.json', '1.1.4', 'the newest release'],
    ['https://raw.githubusercontent.com/o/r/master/system.json', '6.0.6', 'a branch'],
    ['https://gitlab.com/o/r/raw/v14/package/module.json', '14.0.18', 'a branch named for a generation'],
    ['https://github.com/o/r/archive/14.01.zip', '14.01', 'a file named for the version'],
    ['https://github.com/o/r/releases/download/v1.1.40/module.json', '1.1.4', 'another version'],
    [
      'https://r2.foundryvtt.com/packages-public/epic-rolls-5e/module-6.0.0.json',
      '6.1.0',
      'a manifest of another version',
    ],
    [
      'https://r2.foundryvtt.com/packages-public/epic-rolls-5e/module.json',
      '6.1.0',
      'a manifest that gives the newest',
    ],
    ['https://example.org/module.json?version=1.1.4', '1.1.4', 'a query'],
    ['https://example.org/%E0%A4%A/module.json', '1.1.4', 'a segment that cannot be decoded'],
    ['not a url', '1.1.4', 'something that is not a URL'],
  ])('finds %s does not name %s: %s', (url, version) => {
    expect(namesVersion(url, version)).toBe(false);
  });
});
