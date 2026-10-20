/**
 * The world's system, as a virtual package for the solver.
 *
 * Its versions are the system releases a world could run, written `<system id>@<version>`, so a
 * world has one. A system release depends on exactly its own version of it, and it on that release;
 * a module's choice of systems becomes a dependency on the matching versions of it.
 */
import { rangeOps } from './range/range.js';

import type { Bound, Range } from './range/range.js';
import type { PackageKey } from './universe.js';
import type { VersionOrder } from './version/order.js';

export const WORLD_SYSTEM: PackageKey = 'world-system';

/** The version part before every release of a system, and after every release of it. */
export const SYSTEM_START = '';
export const SYSTEM_END = '\uffff';
const BOTTOM = SYSTEM_START;
const TOP = SYSTEM_END;

/** The world-system version for a release of a system, by the system's id. */
export function worldSystemVersion(system: string, version: string): string {
  return `${system}@${version}`;
}

/** The system (as a package key) and its version that a world-system version names. */
export function splitWorldSystem(version: string): { system: PackageKey; version: string } {
  const at = version.indexOf('@');
  return { system: `system:${version.slice(0, at)}`, version: version.slice(at + 1) };
}

/** Puts the ends of a system's versions before and after them. */
const rank = (version: string) => (version === BOTTOM ? -1 : version === TOP ? 1 : 0);

/**
 * The order of world-system versions: by system id, then in each system's own order.
 *
 * @param orderOf - The order of each system's versions
 */
export function worldSystemOrder(orderOf: (key: PackageKey) => VersionOrder): VersionOrder {
  return {
    name: 'foundry',
    compare(a, b) {
      const first = splitWorldSystem(a);
      const second = splitWorldSystem(b);
      if (first.system !== second.system) return first.system > second.system ? 1 : -1;
      const ranked = rank(first.version) - rank(second.version);
      if (ranked !== 0 || rank(first.version) !== 0) return ranked;
      return orderOf(first.system).compare(first.version, second.version);
    },
    read: version => version,
    prefixEnd: () => undefined,
  };
}

/**
 * The world-system versions of one system within a range of its versions.
 *
 * @param order - The world-system order
 */
export function worldSystemRange(order: VersionOrder, system: PackageKey, range: Range): Range {
  const ops = rangeOps(order);
  const id = system.slice('system:'.length);
  const bound = (given: Bound | undefined, end: string): Bound =>
    given === undefined
      ? { version: worldSystemVersion(id, end), inclusive: true }
      : { version: worldSystemVersion(id, given.version), inclusive: given.inclusive };
  return range.intervals.reduce(
    (all, { lower, upper }) => ops.union(all, ops.between(bound(lower, BOTTOM), bound(upper, TOP))),
    ops.none,
  );
}
