import type { Release } from '../src/release.js';

/** A module release with no relationships, plus the fields given. */
export function makeRelease(fields: Partial<Release> & { id?: string } = {}): Release {
  const { id = 'my-module', ...rest } = fields;
  return {
    package: { type: 'module', id },
    version: '1.0.0',
    compatibility: {},
    relationships: { requires: [], systems: [], conflicts: [], recommends: [] },
    protected: false,
    origin: `https://example.org/${id}/module.json`,
    ...rest,
  };
}
