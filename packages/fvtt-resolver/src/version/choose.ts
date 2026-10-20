/**
 * Choosing the order for a package's versions.
 */
import { foundryOrder } from './foundry.js';
import { semverOrder } from './semver.js';

import type { VersionOrder } from './order.js';

/** The orders the `versionOrder` policy can name. */
export type VersionOrderName = VersionOrder['name'];

/** The order chosen for a package, and why it is not the one asked for, if it is not. */
export interface ChosenOrder {
  order: VersionOrder;
  /** The versions the order asked for could not read, which made it fall back to Foundry's order. */
  unreadable: string[];
}

/**
 * Chooses how to order one package's versions.
 *
 * A package is ordered one way throughout: mixing orders between versions of one package could
 * make "newest" depend on which versions are compared. So `semver` applies only when it can read
 * every version and every bound given; otherwise the package falls back to Foundry's order, and
 * the versions it could not read are reported.
 *
 * @param name - The order the `versionOrder` policy asks for
 * @param versions - The package's versions, and the bounds given on it
 */
export function chooseOrder(name: VersionOrderName, versions: readonly string[]): ChosenOrder {
  if (name === 'foundry') return { order: foundryOrder, unreadable: [] };
  const unreadable = versions.filter(version => semverOrder.read(version) === undefined);
  return { order: unreadable.length === 0 ? semverOrder : foundryOrder, unreadable };
}
