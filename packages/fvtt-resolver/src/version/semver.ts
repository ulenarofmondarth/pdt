/**
 * Package versions in Semantic Versioning 2.0.0 order, for the `versionOrder: semver` policy.
 */
import type { VersionOrder } from './order.js';

const NUMBER = '0|[1-9]\\d*';
const IDENTIFIER = `(?:${NUMBER}|\\d*[a-zA-Z-][0-9a-zA-Z-]*)`;

/** A version as SemVer 2.0.0 defines it. */
const SEMVER = new RegExp(
  `^(${NUMBER})\\.(${NUMBER})\\.(${NUMBER})` +
    `(?:-(${IDENTIFIER}(?:\\.${IDENTIFIER})*))?` +
    `(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$`,
);

/** A major, or a major and minor, without the rest: read as `4.0.0` or `4.1.0`. */
const SHORT = new RegExp(`^(?:${NUMBER})(?:\\.(?:${NUMBER}))?$`);

interface Parsed {
  core: [number, number, number];
  prerelease: string[];
  build: string;
}

function parse(version: string): Parsed {
  const match = SEMVER.exec(version);
  if (match === null) throw new Error(`Not a SemVer version: ${version}`);
  const [, major, minor, patch, prerelease, build] = match;
  return {
    core: [Number(major), Number(minor), Number(patch)],
    prerelease: prerelease === undefined ? [] : prerelease.split('.'),
    build: build ?? '',
  };
}

/** Reads a SemVer version, or a short one padded to three parts, or gives `undefined`. */
function read(version: string): string | undefined {
  if (SEMVER.test(version)) return version;
  if (!SHORT.test(version)) return undefined;
  return [...version.split('.'), '0', '0'].slice(0, 3).join('.');
}

function compareText(a: string, b: string): number {
  return a === b ? 0 : a > b ? 1 : -1;
}

/** Compares pre-release identifiers: numbers as numbers, below any text. */
function compareIdentifiers(a: string, b: string): number {
  const aNumeric = /^\d+$/.test(a);
  const bNumeric = /^\d+$/.test(b);
  if (aNumeric && bNumeric) return Math.sign(Number(a) - Number(b));
  if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
  return compareText(a, b);
}

/** Compares pre-releases; having none is newer than having any. */
function comparePrereleases(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return Math.sign(b.length - a.length);
  for (const [i, aIdentifier] of a.entries()) {
    const bIdentifier = b[i];
    if (bIdentifier === undefined) return 1;
    const order = compareIdentifiers(aIdentifier, bIdentifier);
    if (order !== 0) return order;
  }
  return a.length === b.length ? 0 : -1;
}

/**
 * SemVer 2.0.0 precedence: `1.0.0-beta` is older than `1.0.0`.
 *
 * SemVer gives versions that differ only in build metadata the same precedence; this order breaks
 * that tie by comparing the build metadata as text, so that it stays a total order.
 *
 * It reads only SemVer versions, and a major or a major and minor (`"4"`, `"4.1"`), which a bound
 * may give. Since a package is ordered one way throughout, this order applies to a package only
 * when it can read all its versions (see {@link chooseOrder}).
 */
export const semverOrder: VersionOrder = {
  name: 'semver',

  compare(a, b) {
    const {
      core: [aMajor, aMinor, aPatch],
      ...aRest
    } = parse(a);
    const {
      core: [bMajor, bMinor, bPatch],
      ...bRest
    } = parse(b);
    return (
      Math.sign(aMajor - bMajor) ||
      Math.sign(aMinor - bMinor) ||
      Math.sign(aPatch - bPatch) ||
      comparePrereleases(aRest.prerelease, bRest.prerelease) ||
      compareText(aRest.build, bRest.build)
    );
  },

  read,

  prefixEnd(prefix) {
    if (!/^\d+(?:\.\d+){0,2}$/.test(prefix) || read(prefix) === undefined) return undefined;
    const parts = prefix.split('.').map(Number);
    const next = parts.map((part, i) => (i === parts.length - 1 ? part + 1 : part));
    // The lowest pre-release of the next version, so that its pre-releases are excluded too.
    return `${[...next, 0, 0].slice(0, 3).join('.')}-0`;
  },
};
