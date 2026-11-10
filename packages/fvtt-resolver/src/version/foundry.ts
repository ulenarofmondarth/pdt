/**
 * Package versions as Foundry VTT orders them.
 *
 * Written from the rules of `foundry.utils.isNewerVersion` in Foundry VTT 14.368 (see the
 * resolver's domain documentation), not from its code.
 */
import type { VersionOrder } from './order.js';

/** Whether Foundry reads a part of a version as a number: anything but `""` that is not `NaN`. */
function isNumeric(part: string): boolean {
  return part !== '' && !Number.isNaN(Number(part));
}

/**
 * Whether Foundry VTT counts `a` as newer than `b`.
 *
 * Both are split on `.` and compared part by part. Parts that are both numeric and differ compare
 * as numbers; other parts that differ compare as text. When every part of `a` equals the same
 * part of `b`, `a` is newer only if `b` has fewer parts.
 *
 * This is not a consistent order: `"10a"` is newer than `"10"`, `"10"` than `"9"`, and `"9"` than
 * `"10a"`. Use it to reproduce a single comparison Foundry makes, and {@link foundryOrder} to sort.
 */
export function isNewerVersion(a: string, b: string): boolean {
  const aParts = a.split('.');
  const bParts = b.split('.');
  for (const [i, aPart] of aParts.entries()) {
    const bPart = bParts[i];
    if (bPart === undefined) return true;
    if (isNumeric(aPart) && isNumeric(bPart) && Number(aPart) !== Number(bPart)) {
      return Number(aPart) > Number(bPart);
    }
    if (aPart !== bPart) return aPart > bPart;
  }
  return false;
}

/** Compares as JavaScript compares strings, as Foundry does. */
function compareText(a: string, b: string): number {
  return a === b ? 0 : a > b ? 1 : -1;
}

/** One part of a version, read once: its text, and the number it starts with and the text after it, if any. */
interface Part {
  readonly text: string;
  readonly value?: number;
  readonly rest: string;
}

/**
 * Read one part of a version, as {@link compareParts} compares it.
 * @param part - The part
 * @returns It, read
 */
function readPart(part: string): Part {
  const leading = /^\d+/.exec(part)?.[0];
  if (leading === undefined) return { text: part, rest: '' };
  return isNumeric(part)
    ? { text: part, value: Number(part), rest: '' }
    : { text: part, value: Number(leading), rest: part.slice(leading.length) };
}

/**
 * Compares one part of a version with another.
 *
 * A part that starts with a digit is read as a number and the text after it: the whole part when
 * Foundry reads it as numeric (`"1e3"` is 1000), or else its leading digits (`"10a"` is 10, then
 * `"a"`). Two such parts compare by number, then by the text after it, then as text. Any other
 * pair of parts compares as text, which is decided by the first character alone when only one
 * part starts with a digit. That makes this a total order, and it agrees with Foundry except where
 * Foundry would compare two parts that start with digits as text.
 */
function compareParts(a: Part, b: Part): number {
  if (a.value === undefined || b.value === undefined) return compareText(a.text, b.text);
  if (a.value !== b.value) return a.value > b.value ? 1 : -1;
  return compareText(a.rest, b.rest) || compareText(a.text, b.text);
}

/** The most versions kept read; past it, they are read afresh. */
const READ_LIMIT = 10_000;
const read = new Map<string, readonly Part[]>();

/**
 * A version's parts, read once: the solver compares the same versions over and over, and reading
 * them again each time was most of its work.
 * @param version - The version
 * @returns Its parts
 */
function partsOf(version: string): readonly Part[] {
  let parts = read.get(version);
  if (parts === undefined) {
    if (read.size >= READ_LIMIT) read.clear();
    parts = version.split('.').map(readPart);
    read.set(version, parts);
  }
  return parts;
}

/**
 * Foundry VTT's order, made consistent.
 *
 * It compares part by part, and a version that extends another is newer (`1.0.0` is newer than
 * `1.0`). It agrees with {@link isNewerVersion} whenever the first parts that differ are both
 * numbers starting with a digit, or are neither both numbers nor both starting with a digit. That
 * covers the versions packages use. Elsewhere it can differ: for `"10a"` against `"9"` it reads
 * the leading digits as a number where Foundry compares text, and for `"-1"` against `"-5"` it
 * compares text where Foundry compares numbers.
 */
export const foundryOrder: VersionOrder = {
  name: 'foundry',

  compare(a, b) {
    if (a === b) return 0;
    const aParts = partsOf(a);
    const bParts = partsOf(b);
    for (const [i, aPart] of aParts.entries()) {
      const bPart = bParts[i];
      if (bPart === undefined) return 1;
      const order = compareParts(aPart, bPart);
      if (order !== 0) return order;
    }
    // Every part of `a` is `b`'s, and parts that compare equal are the same text, so `b`, not being `a`, extends it.
    return -1;
  },

  read: version => version,

  prefixEnd(prefix) {
    const last = /(?:^|\.)(\d+)$/.exec(prefix)?.[1];
    if (last === undefined) return undefined;
    return `${prefix.slice(0, -last.length)}${String(Number(last) + 1)}`;
  },
};

/**
 * Pairs of versions that {@link foundryOrder} orders differently from Foundry VTT.
 *
 * Reported as warnings, so a user knows where "newest" may not be what Foundry would pick.
 *
 * @param versions - The versions of one package
 * @returns Each pair `[older, newer]` by {@link foundryOrder} where Foundry counts `older` as newer
 */
export function foundryDisagreements(versions: readonly string[]): [string, string][] {
  const found: [string, string][] = [];
  for (const a of versions) {
    for (const b of versions) {
      if (foundryOrder.compare(a, b) < 0 && isNewerVersion(a, b)) found.push([a, b]);
    }
  }
  return found;
}
