/**
 * Small registries of packages for testing the solver, written as pub's documentation writes its
 * examples: each version's dependencies, by range.
 */
import { rangeOps } from '../../src/range/range.js';
import { foundryOrder } from '../../src/version/foundry.js';

import type { Range } from '../../src/range/range.js';
import type { Incompatibility, Provider } from '../../src/solver/solver.js';

/**
 * Package, then version, then the packages it depends on and on what range. A range written with a
 * leading `!`, such as `!^1.0.0`, is a conflict: the package must not be chosen in that range.
 */
export type Registry = Record<string, Record<string, Record<string, string>>>;

export const ops = rangeOps(foundryOrder);

/** Reads `^1.0.0`, `>=1.0.0`, `<2.0.0` or `any`. */
export function range(spec: string): Range {
  if (spec === 'any') return ops.any;
  const caret = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(spec);
  if (caret)
    return ops.between(
      { version: spec.slice(1), inclusive: true },
      { version: `${Number(caret[1]) + 1}.0.0`, inclusive: false },
    );
  if (spec.startsWith('>=')) return ops.between({ version: spec.slice(2), inclusive: true }, undefined);
  if (spec.startsWith('<')) return ops.between(undefined, { version: spec.slice(1), inclusive: false });
  throw new Error(`Unknown range: ${spec}`);
}

/** A provider over a registry: versions newest first, each dependency an incompatibility. */
export function provider(registry: Registry): Provider<string> {
  return {
    orderOf: () => foundryOrder,
    versions: key => Object.keys(registry[key] ?? {}).sort((a, b) => foundryOrder.compare(b, a)),
    incompatibilities: (key, version) =>
      Object.entries(registry[key]?.[version] ?? {}).map(([other, spec]) => {
        const conflict = spec.startsWith('!');
        return {
          terms: [
            { package: key, range: ops.exactly(version), positive: true },
            { package: other, range: range(conflict ? spec.slice(1) : spec), positive: conflict },
          ],
          data: `${key} ${version} ${conflict ? 'conflicts with' : 'depends on'} ${other} ${conflict ? spec.slice(1) : spec}`,
        };
      }),
  };
}

/** The causes at the leaves of an explanation. */
export function leaves(incompatibility: Incompatibility<string>): string[] {
  const { cause } = incompatibility;
  if (cause.kind === 'derived') return [...leaves(cause.conflict), ...leaves(cause.other)];
  if (cause.kind === 'external') return [cause.data];
  return [`(${cause.kind}${cause.kind === 'no-versions' ? ` of ${incompatibility.terms[0]?.package ?? ''}` : ''})`];
}
