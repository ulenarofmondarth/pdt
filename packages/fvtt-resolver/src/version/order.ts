/**
 * How the versions of one package are ordered.
 *
 * An order is a total order over version strings, so that "newest" always has one answer and
 * versions sort the same way every time. Versions are strings: a manifest's numeric version is
 * read as its string, as Foundry VTT's manifest schema does.
 */
export interface VersionOrder {
  /** The name the `versionOrder` policy selects this order by. */
  readonly name: 'foundry' | 'semver';

  /**
   * Compares two versions, each as {@link VersionOrder.read} gives it.
   *
   * @returns Negative when `a` is older than `b`, positive when it is newer, and zero only when
   *   they are the same version
   */
  compare(a: string, b: string): number;

  /**
   * Reads a version, or a bound on versions, into the form {@link VersionOrder.compare} takes.
   *
   * @returns The version, or `undefined` when this order cannot read it
   */
  read(version: string): string | undefined;

  /**
   * The first version after every version that `prefix` is a prefix of, for reading a bound such
   * as `"4"` as every `4.x`.
   *
   * @returns An exclusive upper bound, or `undefined` when the last part of `prefix` is not a number
   */
  prefixEnd(prefix: string): string | undefined;
}
